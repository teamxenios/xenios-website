param(
  [Parameter(Mandatory = $true)]
  [string]$RepoPath
)

$ErrorActionPreference = 'Continue'

if (-not (Test-Path -LiteralPath (Join-Path $RepoPath '.xenios\MASTER_CORPUS.md'))) {
  throw "Not a Xenios continuity repository: $RepoPath"
}

Write-Host "`n=== Git root ==="
git -C $RepoPath rev-parse --show-toplevel

Write-Host "`n=== Origin ==="
git -C $RepoPath remote -v

Write-Host "`n=== Current status ==="
git -C $RepoPath status --short --branch

Write-Host "`n=== Worktrees ==="
git -C $RepoPath worktree list --porcelain

Write-Host "`n=== Recent history ==="
git -C $RepoPath log --all --decorate --oneline --date-order -30

$cli = Join-Path $RepoPath 'scripts\agentic\xenios-os.mjs'
if (Test-Path -LiteralPath $cli) {
  Push-Location $RepoPath
  try {
    Write-Host "`n=== Corpus validation ==="
    node $cli validate
    Write-Host "`n=== Corpus status ==="
    node $cli status
    Write-Host "`n=== Stale sessions ==="
    node $cli stale
    Write-Host "`n=== Next tasks ==="
    node $cli next
  } finally {
    Pop-Location
  }
}
