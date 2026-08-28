[CmdletBinding()]
param(
  [string]$PostgresImage = 'postgres:16'
)

$ErrorActionPreference = 'Stop'
$candidateDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $candidateDirectory '..\..')).Path
if (-not $candidateDirectory.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Candidate directory escaped the workspace: $candidateDirectory"
}

$containerName = 'xr-client-accounts-rehearsal-{0}-{1}' -f $PID, ([guid]::NewGuid().ToString('N').Substring(0, 8))
$databasePassword = 'disposable-only-client-accounts'
$containerStarted = $false

function Invoke-DisposablePsql {
  param(
    [Parameter(Mandatory)] [string]$FileName,
    [switch]$ExpectFailure
  )

  $linuxPath = "/candidate/$FileName"
  & docker exec --env "PGPASSWORD=$databasePassword" $containerName `
    psql --no-psqlrc --username postgres --dbname postgres `
    --set ON_ERROR_STOP=1 --file $linuxPath
  $exitCode = $LASTEXITCODE

  if ($ExpectFailure) {
    if ($exitCode -eq 0) {
      throw "Expected $FileName to fail, but it succeeded."
    }
    Write-Host "PASS expected refusal: $FileName exited $exitCode."
    return
  }
  if ($exitCode -ne 0) {
    throw "$FileName failed with exit code $exitCode."
  }
}

try {
  Write-Host "Starting disposable PostgreSQL container $containerName from $PostgresImage."
  & docker run --detach --name $containerName --network none `
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

  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.disposable-bootstrap.sql'

  Write-Host 'Pass 1: apply candidate and execute the complete attack battery.'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.sql'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.attacks.sql'

  Write-Host 'Proving in-place rerun refusal before rollback.'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.sql' -ExpectFailure

  Write-Host 'Rolling back every candidate-owned object and verifying absence.'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.rollback.sql'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.verify-rollback.sql'

  Write-Host 'Pass 2: clean reapply after rollback, repeat attacks, then roll back again.'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.sql'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.attacks.sql'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.rollback.sql'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.verify-rollback.sql'

  Write-Host 'PASS disposable rehearsal: 2 applies, 74 refused attacks, 22 positive invariants, rerun refusal, 2 rollbacks, and clean reapply.'
}
finally {
  if ($containerStarted) {
    Write-Host "Destroying exact disposable container $containerName."
    & docker rm --force $containerName | Out-Null
  }
}
