$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$paths = New-Object System.Collections.Generic.List[string]
foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles)) {
  if (-not $base) { continue }
  $dir = Join-Path $base 'Programs\Python'
  if (Test-Path -LiteralPath $dir) {
    Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $candidate = Join-Path $_.FullName 'python.exe'
      if (Test-Path -LiteralPath $candidate -PathType Leaf) { $paths.Add($candidate) }
    }
  }
}
foreach ($exe in @('python.exe','python3.exe')) {
  $command = Get-Command $exe -ErrorAction SilentlyContinue
  if ($command) { $paths.Add($command.Source) }
}
$selected = $null
foreach ($exe in @($paths | Select-Object -Unique)) {
  try {
    $version = & $exe -c 'import sys;sys.exit(sys.version_info<(3,9))' 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Python OK: $exe"
      $selected = $exe
      break
    }
    Write-Host "Python rejected: $exe ($version)"
  } catch {
    Write-Host "Python broken: $exe ($_)"
  }
}
if ($selected) {
  Write-Host "Starting Ayureika with $selected"
  try {
    & $selected (Join-Path $root 'launcher.py')
    $code = $LASTEXITCODE
    Write-Host "Ayureika exited with code $code"
    exit $code
  } catch {
    Write-Host "Ayureika launcher failed: $_"
    exit 1
  }
}
Write-Host 'No working Python 3.9+ found.'
$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) { exit 1 }
& $winget.Source install --id Python.Python.3.13 --exact --accept-package-agreements --accept-source-agreements
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Python installed. Restart Ayureika.bat to refresh paths.'
exit 1
