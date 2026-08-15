param([int]$RefreshSeconds = 5)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
while ($true) {
  Clear-Host
  Write-Host "Xenios cross-agent status" -ForegroundColor Cyan
  Write-Host "Repository: $repo"
  Write-Host "Updated: $(Get-Date -Format o)"
  Write-Host ""
  node (Join-Path $repo 'scripts\agentic\xenios-os.mjs') status
  Write-Host ""
  Write-Host "Ctrl+C to stop. Refreshing in $RefreshSeconds seconds." -ForegroundColor DarkGray
  Start-Sleep -Seconds $RefreshSeconds
}
