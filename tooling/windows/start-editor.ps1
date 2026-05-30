param(
  [int]$EditorPort = 3002,
  [int]$ApiPort = 3010,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$editorDir = Join-Path $repoRoot "apps\editor"
$apiDir = Join-Path $repoRoot "apps\api"
$tsc = Join-Path $repoRoot "node_modules\.bin\tsc.exe"
$next = Join-Path $editorDir "node_modules\.bin\next.exe"
$assetSync = Join-Path $repoRoot "packages\editor-assets\bin\pascal-editor-assets.mjs"

function Assert-File($Path, $Hint) {
  if (-not (Test-Path $Path)) {
    throw "Missing $Path. $Hint"
  }
}

function Test-PortInUse([int]$Port) {
  $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -First 1
  return $null -ne $connection
}

Assert-File $tsc "Run dependency install from the repo root first."
Assert-File $next "Run dependency install from the repo root first."
Assert-File $assetSync "The editor-assets package is incomplete."

if (Test-PortInUse $EditorPort) {
  throw "Port $EditorPort is already in use. Stop that process or pass -EditorPort <port>."
}

if (Test-PortInUse $ApiPort) {
  throw "Port $ApiPort is already in use. Stop that process or pass -ApiPort <port>."
}

# Polling-based file watchers are a common source of high CPU on Windows.
Remove-Item Env:\CHOKIDAR_USEPOLLING -ErrorAction SilentlyContinue
Remove-Item Env:\WATCHPACK_POLLING -ErrorAction SilentlyContinue
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:NEXT_PUBLIC_EDITOR_API_BASE_URL = "http://localhost:$ApiPort"

if (-not $SkipBuild) {
  Write-Host "[editor] Building workspace dependencies..."
  & $tsc --build `
    (Join-Path $repoRoot "packages\core\tsconfig.json") `
    (Join-Path $repoRoot "packages\viewer\tsconfig.json")
}

Write-Host "[editor] Syncing editor assets..."
& node $assetSync sync --target (Join-Path $editorDir "public")

Write-Host "[editor] Starting API on http://localhost:$ApiPort ..."
$apiJob = Start-Job -Name "editor-api" -ScriptBlock {
  param($WorkingDirectory, $Port, $AllowOrigin)

  Set-Location $WorkingDirectory
  $env:PORT = "$Port"
  $env:HOST = "127.0.0.1"
  $env:EDITOR_API_ALLOW_ORIGIN = $AllowOrigin
  node .\server.mjs
} -ArgumentList $apiDir, $ApiPort, "http://localhost:$EditorPort"

try {
  Write-Host "[editor] Starting Next.js on http://localhost:$EditorPort ..."
  Write-Host "[editor] Press Ctrl+C to stop. The API process will be cleaned up automatically."
  Push-Location $editorDir
  try {
    & $next dev --hostname 127.0.0.1 --port $EditorPort
  }
  finally {
    Pop-Location
  }
}
finally {
  if ($apiJob) {
    Write-Host "[editor] Stopping API job..."
    Stop-Job -Job $apiJob -ErrorAction SilentlyContinue
    Remove-Job -Job $apiJob -Force -ErrorAction SilentlyContinue
  }
}
