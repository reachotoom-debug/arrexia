Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host ""
  Write-Host $label
  & $action
}

function Invoke-Safely([scriptblock]$action) {
  try { & $action } catch { Write-Host ("[warn] " + $_.Exception.Message) }
}

function Test-Docker() {
  try { docker version | Out-Null; return $true } catch { return $false }
}

function Test-PortAvailable([int]$port) {
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Get-DbPortFromConfig() {
  $configPath = "supabase/config.toml"
  if (-not (Test-Path $configPath)) {
    Write-Host "[warn] supabase/config.toml not found, using default port 55432"
    return 55432
  }

  $inDbSection = $false
  $lines = Get-Content $configPath

  foreach ($line in $lines) {
    if ($line -match '^\s*\[db\]') {
      $inDbSection = $true
      continue
    }
    if ($inDbSection -and $line -match '^\s*\[') {
      break
    }
    if ($inDbSection -and $line -match '^\s*port\s*=\s*(\d+)') {
      return [int]$matches[1]
    }
  }

    Write-Host "[warn] Could not find [db] port in config.toml, using default port 55432"
    return 55432
}

function Find-AvailablePort([int]$startPort) {
  $port = $startPort
  $maxTries = 200

  for ($i = 0; $i -lt $maxTries; $i++) {
    if (Test-PortAvailable $port) {
      return $port
    }
    $port++
  }

  Write-Host "[fatal] Could not find available port after $maxTries attempts starting from $startPort"
  exit 1
}

function Update-ConfigTomlPort([int]$newPort) {
  $configPath = "supabase/config.toml"
  if (-not (Test-Path $configPath)) {
    Write-Host "[warn] supabase/config.toml not found, cannot update port"
    return $false
  }

  $lines = Get-Content $configPath
  $inDbSection = $false
  $updated = $false
  $newLines = @()

  foreach ($line in $lines) {
    if ($line -match '^\s*\[db\]') {
      $inDbSection = $true
      $newLines += $line
      continue
    }
    if ($inDbSection -and $line -match '^\s*\[') {
      $inDbSection = $false
    }
    if ($inDbSection -and $line -match '^\s*port\s*=\s*\d+') {
      $newLines += "port = $newPort"
      $updated = $true
      continue
    }
    $newLines += $line
  }

  if ($updated) {
    $newLines | Set-Content $configPath
    return $true
  }

  return $false
}

if (-not (Test-Docker)) {
  Write-Host "[fatal] Docker is not running or not available in PATH."
  exit 1
}

Invoke-Step "[1/5] Stop Supabase (no backup)" {
  Invoke-Safely { npx supabase stop --no-backup | Out-Host }
}

Invoke-Step "[2/5] Remove Arrexia local Supabase containers (if any)" {
  $names = @(
    docker ps -a --format "{{.ID}} {{.Names}}" |
      Select-String -Pattern "supabase|flowcollect" -CaseSensitive:$false |
      ForEach-Object { $_.ToString().Trim() }
  )

  if (-not $names -or $names.Count -eq 0) {
    Write-Host "No matching containers found."
  } else {
    $ids = $names |
      ForEach-Object { ($_ -split "\s+")[0] } |
      Where-Object { $_ -and $_.Length -gt 0 } |
      Select-Object -Unique

    Write-Host ("Removing containers: " + ($ids -join ", "))
    Invoke-Safely { docker rm -f $ids | Out-Host }
  }
}

Invoke-Step "[3/5] Remove Arrexia local Supabase volumes (if any)" {
  $vols = @(
    docker volume ls --format "{{.Name}}" |
      Select-String -Pattern "supabase|flowcollect" -CaseSensitive:$false |
      ForEach-Object { $_.ToString().Trim() }
  )

  if (-not $vols -or $vols.Count -eq 0) {
    Write-Host "No matching volumes found."
  } else {
    Write-Host ("Removing volumes: " + ($vols -join ", "))
    foreach ($v in $vols) {
      Invoke-Safely { docker volume rm -f $v | Out-Host }
    }
  }
}

Invoke-Step "[4/5] Ensure Supabase network exists (create if missing)" {
  $networkName = "supabase_network_flowcollect"
  $exists = $false
  try {
    docker network inspect $networkName | Out-Null
    $exists = $true
  } catch {
    $exists = $false
  }

  if ($exists) {
    Write-Host ("Network exists: " + $networkName)
  } else {
    Write-Host ("Creating network: " + $networkName)
    Invoke-Safely { docker network create $networkName | Out-Host }
  }
}

Invoke-Step "[5/5] Check DB port and start Supabase (debug) + show status" {
  $configuredPort = Get-DbPortFromConfig
  Write-Host ("Configured DB port: $configuredPort")

  if (-not (Test-PortAvailable $configuredPort)) {
    Write-Host ("Port $configuredPort is not available, searching for alternative...")
    $availablePort = Find-AvailablePort $configuredPort
    Write-Host ("Found available port: $availablePort")
    
    if (Update-ConfigTomlPort $availablePort) {
      Write-Host ("Updated supabase/config.toml: port = $availablePort")
    } else {
      Write-Host ("[warn] Failed to update config.toml, Supabase may fail to start")
    }
  } else {
    Write-Host ("Port $configuredPort is available")
  }

  npx supabase start --debug | Out-Host
  npx supabase status | Out-Host
}
