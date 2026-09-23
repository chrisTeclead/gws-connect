# CI only. Windows twin of install-check.sh - see there for the why.
# usage: install-check.ps1 <dist-dir>
param([Parameter(Mandatory)] [string] $Dist)
$ErrorActionPreference = 'Stop'
$Dist = (Resolve-Path $Dist).Path

function Serve ($dir, $port) {
  $p = Start-Process python -ArgumentList '-m', 'http.server', "$port", '--directory', $dir -PassThru -WindowStyle Hidden
  for ($i = 0; $i -lt 40; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/SHA256SUMS" | Out-Null; break } catch { Start-Sleep -Milliseconds 250 }
  }
  $p
}
# In-process rather than a nested powershell.exe, which some locked-down
# machines refuse. install.ps1 throws on failure, so a catch is its exit code.
function Install ($url) {
  $env:GWS_CONNECT_RELEASE_URL = $url
  try { Invoke-RestMethod "$url/install.ps1" | Invoke-Expression; 0 } catch { Write-Host $_; 1 }
}

$tmp = Join-Path $env:RUNNER_TEMP ('gwsc-' + [guid]::NewGuid().ToString('N'))
$env:GWS_CONNECT_HOME = Join-Path $tmp 'home'
$env:CLAUDE_CONFIG_DIR = Join-Path $tmp 'claude'
$launcher = Join-Path $env:GWS_CONNECT_HOME 'gws-connect.cmd'
$good = Serve $Dist 8765
try {
  Write-Host '--- first install'
  if ((Install 'http://127.0.0.1:8765') -ne 0) { throw 'first install failed' }
  & $launcher list --lang en
  if ($LASTEXITCODE -ne 0) { throw 'list failed' }
  & (Join-Path $env:GWS_CONNECT_HOME 'app\runtime\gws\gws.exe') --version
  if (-not (Test-Path (Join-Path $env:CLAUDE_CONFIG_DIR 'skills\gws-konten\SKILL.md'))) { throw 'skill missing' }

  Write-Host '--- update with an account present'
  $acct = Join-Path $env:GWS_CONNECT_HOME 'accounts\anna-a-de'
  New-Item -ItemType Directory -Force $acct | Out-Null
  $meta = '{"email":"anna@a.de","credSet":"default","services":["gmail"],"accountType":"workspace","connectedAt":"2026-09-01T00:00:00.000Z"}'
  [IO.File]::WriteAllText((Join-Path $acct 'meta.json'), $meta)
  if ((Install 'http://127.0.0.1:8765') -ne 0) { throw 'update failed' }
  if ([IO.File]::ReadAllText((Join-Path $acct 'meta.json')) -ne $meta) { throw 'account changed by update' }
  $wrapper = Get-Content -Raw (Join-Path $env:GWS_CONNECT_HOME 'bin\gws-anna-a-de.cmd')
  if (-not $wrapper.Contains((Join-Path $env:GWS_CONNECT_HOME 'app\runtime\node\node.exe'))) { throw 'wrapper not relinked' }

  Write-Host '--- tampered zip is refused and the app survives'
  $marker = Join-Path $env:GWS_CONNECT_HOME 'app\.marker'
  New-Item -ItemType File $marker | Out-Null
  $bad = Join-Path $tmp 'bad'
  New-Item -ItemType Directory $bad | Out-Null
  Copy-Item (Join-Path $Dist '*') $bad
  Get-ChildItem $bad -Filter *.zip | ForEach-Object { Add-Content -LiteralPath $_.FullName -Value 'x' -NoNewline }
  $badServer = Serve $bad 8766
  try {
    if ((Install 'http://127.0.0.1:8766') -eq 0) { throw 'a tampered zip must be refused' }
  } finally { Stop-Process $badServer }
  if (-not (Test-Path $marker)) { throw 'app lost after a refused install' }

  Write-Host 'install-check ok'
} finally {
  Stop-Process $good
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
