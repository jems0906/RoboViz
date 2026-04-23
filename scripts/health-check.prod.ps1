param(
  [int]$TimeoutSec = 10
)

$ErrorActionPreference = "Stop"
$failures = New-Object System.Collections.Generic.List[string]

Write-Output "Running production stack health check..."

$services = @(
  @{ Name = "api"; Container = "roboviz-api"; RequireHealth = $true },
  @{ Name = "web"; Container = "roboviz-web"; RequireHealth = $true },
  @{ Name = "postgres"; Container = "roboviz-postgres"; RequireHealth = $true },
  @{ Name = "minio"; Container = "roboviz-minio"; RequireHealth = $false },
  @{ Name = "agent-sim"; Container = "roboviz-agent-sim"; RequireHealth = $false }
)

foreach ($svc in $services) {
  $container = $svc.Container
  $name = $svc.Name

  $isRunning = docker inspect --format "{{.State.Running}}" $container 2>$null
  if ($LASTEXITCODE -ne 0 -or $isRunning -ne "true") {
    $failures.Add("$name container ($container) is not running")
    Write-Output "[FAIL] $name container ($container) is not running"
    continue
  }

  if ($svc.RequireHealth) {
    $health = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" $container 2>$null
    if ($LASTEXITCODE -ne 0) {
      $failures.Add("$name container ($container) health status unavailable")
      Write-Output "[FAIL] $name container health unavailable"
      continue
    }

    if ($health -eq "healthy") {
      Write-Output "[OK] $name container is healthy"
    } elseif ($health -eq "none") {
      $failures.Add("$name container ($container) has no healthcheck configured")
      Write-Output "[FAIL] $name container has no healthcheck"
    } else {
      $failures.Add("$name container ($container) health is '$health'")
      Write-Output "[FAIL] $name container health is '$health'"
    }
  } else {
    Write-Output "[OK] $name container is running"
  }
}

try {
  $apiResp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:4000/health" -TimeoutSec $TimeoutSec
  if ($apiResp.StatusCode -ge 200 -and $apiResp.StatusCode -lt 300) {
    Write-Output "[OK] api endpoint (http://localhost:4000/health) -> HTTP $($apiResp.StatusCode)"
  } else {
    $failures.Add("api endpoint (http://localhost:4000/health) returned HTTP $($apiResp.StatusCode)")
    Write-Output "[FAIL] api endpoint (http://localhost:4000/health) -> HTTP $($apiResp.StatusCode)"
  }
} catch {
  $failures.Add("api endpoint (http://localhost:4000/health) is unreachable: $($_.Exception.Message)")
  Write-Output "[FAIL] api endpoint (http://localhost:4000/health) unreachable"
}

try {
  $webResp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:8080" -TimeoutSec $TimeoutSec
  if ($webResp.StatusCode -ge 200 -and $webResp.StatusCode -lt 300) {
    Write-Output "[OK] web endpoint (http://localhost:8080) -> HTTP $($webResp.StatusCode)"

    $assetMatch = [regex]::Match($webResp.Content, '/assets/index-[^"'']+\.js')
    if (-not $assetMatch.Success) {
      $failures.Add("web app bundle reference missing from index.html")
      Write-Output "[FAIL] web app bundle reference missing from index.html"
    } else {
      $bundlePath = $assetMatch.Value
      $bundleResp = Invoke-WebRequest -UseBasicParsing -Uri ("http://localhost:8080" + $bundlePath) -TimeoutSec $TimeoutSec

      if ($bundleResp.StatusCode -ge 200 -and $bundleResp.StatusCode -lt 300) {
        Write-Output "[OK] web bundle ($bundlePath) -> HTTP $($bundleResp.StatusCode)"
      } else {
        $failures.Add("web bundle ($bundlePath) returned HTTP $($bundleResp.StatusCode)")
        Write-Output "[FAIL] web bundle ($bundlePath) -> HTTP $($bundleResp.StatusCode)"
      }

    $requiredUiMarkers = @(
      "Real-time robot observability and synchronized replay",
      "Lidar volume",
      "Replay controls"
    )

    foreach ($marker in $requiredUiMarkers) {
      if ($bundleResp.Content -notmatch [regex]::Escape($marker)) {
        $failures.Add("web dashboard marker missing: '$marker'")
        Write-Output "[FAIL] web dashboard marker missing: '$marker'"
      }
    }
    }
  } else {
    $failures.Add("web endpoint (http://localhost:8080) returned HTTP $($webResp.StatusCode)")
    Write-Output "[FAIL] web endpoint (http://localhost:8080) -> HTTP $($webResp.StatusCode)"
  }
} catch {
  $failures.Add("web endpoint (http://localhost:8080) is unreachable: $($_.Exception.Message)")
  Write-Output "[FAIL] web endpoint (http://localhost:8080) unreachable"
}

if ($failures.Count -gt 0) {
  Write-Output ""
  Write-Output "Health check failed:"
  foreach ($f in $failures) {
    Write-Output " - $f"
  }
  exit 1
}

Write-Output ""
Write-Output "All production health checks passed."
exit 0
