param(
  [int]$TimeoutSec = 12
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$composeFile = Join-Path $repoRoot "docker-compose.prod.yml"
$healthScript = Join-Path $scriptDir "health-check.prod.ps1"

if (-not (Test-Path $composeFile)) {
  throw "Missing compose file: $composeFile"
}

if (-not (Test-Path $healthScript)) {
  throw "Missing health script: $healthScript"
}

Write-Output "Starting RoboViz production stack..."
Push-Location $repoRoot
try {
  docker compose -f $composeFile up -d
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed"
  }

  docker compose -f $composeFile ps -a
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose ps failed"
  }

  # Wait for the web container to reach 'healthy' before running endpoint checks
  Write-Output "Waiting for web container to become healthy..."
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    $webHealth = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" roboviz-web 2>$null
    if ($webHealth -eq "healthy") { break }
    Start-Sleep -Seconds 2
  }
  if ($webHealth -ne "healthy") {
    throw "roboviz-web did not become healthy within 60s (last status: $webHealth)"
  }

  powershell -ExecutionPolicy Bypass -File $healthScript -TimeoutSec $TimeoutSec
  if ($LASTEXITCODE -ne 0) {
    throw "production health check failed"
  }
}
finally {
  Pop-Location
}

Write-Output ""
Write-Output "RoboViz production stack is running and healthy."