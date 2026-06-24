Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Ensure Docker is using the Linux builder context (desktop-linux)
# This is required for Supabase local development on Windows

Write-Host "Checking Docker builder context..."

# Switch to desktop-linux context
try {
    docker context use desktop-linux 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[fatal] Failed to switch to desktop-linux context. Ensure Docker Desktop with Linux builder is installed." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[fatal] Docker command failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Validate that Docker is using Linux
try {
    $dockerInfo = docker info --format '{{.OSType}}' 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[fatal] Failed to get Docker info: $dockerInfo" -ForegroundColor Red
        exit 1
    }
    
    $osType = $dockerInfo.Trim()
    
    if ($osType -ne "linux") {
        Write-Host "[fatal] Docker OSType is '$osType', expected 'linux'." -ForegroundColor Red
        Write-Host "[fatal] Please ensure Docker Desktop is configured with Linux containers enabled." -ForegroundColor Red
        try {
            $currentContext = (docker context ls --format '{{.Name}}{{if .Current}} *{{end}}' | Select-String -Pattern '\*').ToString().Replace(' *', '')
            Write-Host "[fatal] Current context: $currentContext" -ForegroundColor Red
        } catch {
            Write-Host "[fatal] Could not determine current Docker context." -ForegroundColor Red
        }
        exit 1
    }
    
    Write-Host "✓ Docker builder is using Linux (OSType: $osType)" -ForegroundColor Green
} catch {
    Write-Host "[fatal] Error validating Docker OSType: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "Docker Linux builder context validated successfully." -ForegroundColor Green

