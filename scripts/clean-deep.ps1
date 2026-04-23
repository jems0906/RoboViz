param(
  [switch]$RemoveDemoMedia = $false,
  [switch]$WhatIf = $false
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

$targets = @(
  "node_modules",
  "apps/web/node_modules",
  "apps/api/node_modules",
  "postgres-data",
  "minio-data",
  "apps/web/dist",
  "apps/api/dist"
)

if ($RemoveDemoMedia) {
  $targets += @(
    "demo-walkthrough.mp4",
    "demo-walkthrough-social.gif",
    "demo-talk-track.txt"
  )
}

function Remove-Target {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath,
    [switch]$DryRun
  )

  $fullPath = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    Write-Host ("SKIPPED " + $RelativePath)
    return
  }

  if ($DryRun) {
    Write-Host ("WOULD REMOVE " + $RelativePath)
    return
  }

  try {
    Remove-Item -LiteralPath $fullPath -Recurse -Force -ErrorAction Stop
    Write-Host ("REMOVED " + $RelativePath)
    return
  }
  catch {
    if (Test-Path -LiteralPath $fullPath -PathType Container) {
      cmd /c "rmdir /s /q \"$fullPath\"" | Out-Null
      if (-not (Test-Path -LiteralPath $fullPath)) {
        Write-Host ("REMOVED " + $RelativePath + " (fallback)")
        return
      }
    }

    Write-Host ("FAILED " + $RelativePath + " -> " + $_.Exception.Message)
  }
}

Write-Host "Starting RoboViz deep clean"
Write-Host ("Repository root: " + $repoRoot)

foreach ($target in $targets) {
  Remove-Target -RelativePath $target -DryRun:$WhatIf
}

Write-Host "Deep clean complete"
