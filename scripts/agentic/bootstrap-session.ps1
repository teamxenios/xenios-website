param(
  [Parameter(Mandatory=$true)][string]$SessionId,
  [Parameter(Mandatory=$true)][ValidateSet('claude','codex','chatgpt','other')][string]$Tool,
  [Parameter(Mandatory=$true)][string]$Lane,
  [Parameter(Mandatory=$true)][string]$Branch,
  [string]$Note = ''
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repo
try {
  node scripts/agentic/xenios-os.mjs validate
  node scripts/agentic/xenios-os.mjs register --id $SessionId --tool $Tool --lane $Lane --branch $Branch --note $Note
  node scripts/agentic/xenios-os.mjs status
  Write-Host ""
  Write-Host "Read these before editing:" -ForegroundColor Cyan
  Write-Host "  AGENTS.md"
  Write-Host "  .xenios\PROJECT_STATE.json"
  Write-Host "  .xenios\RELEASE_STATE.json"
  Write-Host "  .xenios\ACTIVE_TASKS.json"
  Write-Host "  .xenios\DECISIONS.md"
  Write-Host "  .xenios\BLOCKED_EXTERNAL.md"
  Write-Host ""
  Write-Host "Claim one task with:"
  Write-Host "  node scripts/agentic/xenios-os.mjs claim --session $SessionId --task TASK-ID"
} finally { Pop-Location }
