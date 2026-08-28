[CmdletBinding()]
param(
  [string]$PostgresImage = 'postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20'
)

$ErrorActionPreference = 'Stop'
$candidateDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $candidateDirectory '..\..')).Path
if (-not $candidateDirectory.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Candidate directory escaped the workspace: $candidateDirectory"
}

$containerName = 'xr-activation-authority-rehearsal-{0}-{1}' -f $PID, ([guid]::NewGuid().ToString('N').Substring(0, 8))
$databasePassword = 'disposable-only-activation-authority'
$containerStarted = $false

function Invoke-DisposablePsql {
  param(
    [Parameter(Mandatory)] [string]$FileName,
    [switch]$ExpectFailure
  )

  & docker exec --env "PGPASSWORD=$databasePassword" $containerName `
    psql --quiet --no-psqlrc --username postgres --dbname postgres `
    --set ON_ERROR_STOP=1 --file "/candidate/$FileName"
  $exitCode = $LASTEXITCODE

  if ($ExpectFailure) {
    if ($exitCode -eq 0) {
      throw "Expected $FileName to fail, but it succeeded."
    }
    Write-Host "PASS expected rerun refusal: $FileName exited $exitCode."
    return
  }
  if ($exitCode -ne 0) {
    throw "$FileName failed with exit code $exitCode."
  }
}

try {
  Write-Host "Starting exact offline PostgreSQL image $PostgresImage as $containerName."
  & docker run --detach --name $containerName --network none --pull never `
    --env "POSTGRES_PASSWORD=$databasePassword" `
    --mount "type=bind,source=$candidateDirectory,target=/candidate,readonly" `
    $PostgresImage | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "docker run failed with exit code $LASTEXITCODE."
  }
  $containerStarted = $true

  $ready = $false
  foreach ($attempt in 1..30) {
    & docker exec $containerName pg_isready --username postgres --dbname postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'Disposable PostgreSQL did not become ready within 30 seconds.'
  }

  Invoke-DisposablePsql '20260828_research_activation_cart_authority.disposable-bootstrap.sql'

  Write-Host 'Pass 1: apply, attack lifecycle/ACL/rollback invariants, and race real sessions.'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.sql'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.attacks.sql'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.concurrency.sql'

  Write-Host 'Proving exact in-place rerun refusal.'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.sql' -ExpectFailure

  Write-Host 'Rolling back candidate-owned objects and checking the base schema.'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.rollback.sql'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.verify-rollback.sql'

  Write-Host 'Pass 2: clean reapply and rollback after the full first-pass battery.'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.sql'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.rollback.sql'
  Invoke-DisposablePsql '20260828_research_activation_cart_authority.verify-rollback.sql'

  Write-Host 'PASS disposable activation-authority rehearsal: runtime attacks, real-session races, rerun refusal, two applies, two rollbacks, clean reapply.'
}
finally {
  if ($containerStarted) {
    Write-Host "Destroying exact disposable container $containerName."
    & docker rm --force $containerName | Out-Null
  }
}
