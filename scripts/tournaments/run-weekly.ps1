$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$logDirectory = Join-Path $repo '.cache\tournaments\weekly\logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $logDirectory "$stamp.log"
Push-Location $repo
try {
  & npm run tournaments:weekly -- --yesterday --lookback-days 7 2>&1 | Tee-Object -FilePath $log
  exit $LASTEXITCODE
} finally { Pop-Location }
