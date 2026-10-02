$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$evidenceRoot = Join-Path $taskRoot 'docs/billing-email-evidence'
$manifestPath = Join-Path $evidenceRoot 'candidate-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$archivePath = Join-Path $evidenceRoot 'candidate-source.zip'
if (Test-Path -LiteralPath $archivePath) { throw 'Refusing to overwrite an existing candidate archive.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $evidenceRoot 'candidate-changes'), $archivePath)
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
$verifiedFiles = 0
try {
  $expected = @{}
  foreach ($path in $manifest.changedPaths) {
    $entry = $manifest.files | Where-Object { $_.path -eq $path }
    if ($entry.sha256) { $expected[$path] = $entry.sha256 }
  }
  foreach ($entry in $archive.Entries) {
    $path = $entry.FullName.Replace('\', '/')
    if ($path.EndsWith('/')) { continue }
    if (-not $expected.ContainsKey($path)) { throw "Unexpected archived file: $path" }
    $stream = $entry.Open()
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
    if ($actual -ne $expected[$path]) { throw "Archived file hash differs: $path" }
    $expected.Remove($path)
    $verifiedFiles++
  }
  if ($expected.Count -ne 0) { throw 'Archive is missing candidate files.' }
} finally { $archive.Dispose() }
$result = [ordered]@{
  capturedAt = [DateTime]::UtcNow.ToString('o')
  sourceDigest = $manifest.sourceDigest
  archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  verifiedFiles = $verifiedFiles
  baselineEvidenceFilesVerified = $manifest.baselineEvidenceFilesVerified
  success = $true
}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceRoot 'candidate-archive-verification.json') -Encoding utf8
$result | ConvertTo-Json
