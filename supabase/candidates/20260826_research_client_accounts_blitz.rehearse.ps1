[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$postgresDigest = 'sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20'
$postgresImage = "postgres@$postgresDigest"
$candidateDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $candidateDirectory '..\..')).Path
if (-not $candidateDirectory.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Candidate directory escaped the workspace: $candidateDirectory"
}

$attackMapPath = Join-Path $candidateDirectory '20260826_research_client_accounts_blitz.attack-map.json'
$attackMap = Get-Content -LiteralPath $attackMapPath -Raw | ConvertFrom-Json
$mapRows = @($attackMap.attacks)
$v1Count = @($mapRows | Where-Object { $_.suite -ceq 'v1' -and $_.countedIn18Plus12 }).Count
$v2Count = @($mapRows | Where-Object { $_.suite -ceq 'v2' -and $_.countedIn18Plus12 }).Count
$v27Rows = @($mapRows | Where-Object { $_.historicalId -ceq 'V2-7' })
$executableIds = @($mapRows | ForEach-Object { @($_.executableIds) })
$duplicateExecutableIds = @(
  $executableIds |
    Group-Object -CaseSensitive |
    Where-Object { $_.Count -ne 1 }
)
if ($mapRows.Count -ne 31 -or $v1Count -ne 18 -or $v2Count -ne 12) {
  throw "Attack map denominator mismatch: rows=$($mapRows.Count), v1=$v1Count, v2=$v2Count."
}
if ($v27Rows.Count -ne 1 -or [bool]$v27Rows[0].countedIn18Plus12) {
  throw 'Attack map must contain exactly one uncounted V2-7 row.'
}
if ($duplicateExecutableIds.Count -ne 0) {
  throw "Attack map contains duplicate executable IDs: $($duplicateExecutableIds.Name -join ', ')."
}

$inspectOutput = @(& docker image inspect $postgresImage 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw "Pinned PostgreSQL image is not available locally: $postgresImage"
}
$inspectRows = @($inspectOutput | ConvertFrom-Json)
if ($inspectRows.Count -ne 1) {
  throw "Expected one local image inspection row for $postgresImage, got $($inspectRows.Count)."
}
$image = $inspectRows[0]
$repoDigests = @($image.RepoDigests)
if ($repoDigests.Count -ne 1 -or $repoDigests[0] -cne $postgresImage) {
  throw "Pinned image RepoDigest mismatch: expected only $postgresImage; got $($repoDigests -join ', ')."
}
if ([string]$image.Id -cne $postgresDigest) {
  throw "Pinned image ID mismatch: expected $postgresDigest; got $($image.Id)."
}
if ([string]$image.Os -cne 'linux' -or [string]$image.Architecture -cne 'amd64') {
  throw "Pinned image platform mismatch: expected linux/amd64; got $($image.Os)/$($image.Architecture)."
}
Write-Host "PASS image preflight: RepoDigest=$postgresImage; ID=$postgresDigest; platform=linux/amd64."
Write-Host "PASS attack-map preflight: exact counted denominator v1=$v1Count, v2=$v2Count; V2-7 additional; $($executableIds.Count) unique executable IDs."

$containerName = 'xr-client-accounts-rehearsal-{0}-{1}' -f $PID, ([guid]::NewGuid().ToString('N').Substring(0, 8))
$databasePassword = 'disposable-only-client-accounts'
$containerStarted = $false

function Invoke-DockerCapture {
  param(
    [Parameter(Mandatory)] [string[]]$Arguments
  )

  # Windows PowerShell promotes native stderr into ErrorRecord objects and
  # honors ErrorActionPreference for them. PostgreSQL writes NOTICE output to
  # stderr, so capture it without treating a successful psql exit as a shell
  # failure. The native exit code remains the sole process-success authority.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& docker @Arguments 2>&1 | ForEach-Object { $_.ToString() })
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  [pscustomobject]@{
    Output = $output
    ExitCode = $exitCode
  }
}

function Invoke-DisposablePsql {
  param(
    [Parameter(Mandatory)] [string]$FileName,
    [int]$PassNumber = 0,
    [switch]$ExpectExactRerunRefusal
  )

  $linuxPath = "/candidate/$FileName"
  $arguments = @(
    'exec', '--env', "PGPASSWORD=$databasePassword", $containerName,
    'psql', '--no-psqlrc', '--username', 'postgres', '--dbname', 'postgres',
    '--set', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=verbose'
  )
  if ($PassNumber -ne 0) {
    $arguments += @('--set', "rehearsal_pass=$PassNumber")
  }
  $arguments += @('--file', $linuxPath)

  $result = Invoke-DockerCapture -Arguments $arguments
  foreach ($line in $result.Output) {
    Write-Host $line
  }

  if ($ExpectExactRerunRefusal) {
    if ($result.ExitCode -eq 0) {
      throw "Expected $FileName to refuse the in-place rerun, but it succeeded."
    }
    $errorLines = @($result.Output | Where-Object { $_ -match 'ERROR:' })
    $expectedError = 'ERROR:\s+P0001:\s+client-accounts blitz: one of the target tables already exists; reconcile before applying$'
    if ($errorLines.Count -ne 1 -or $errorLines[0] -notmatch $expectedError) {
      throw "In-place rerun returned an unexpected error. Error lines: $($errorLines -join ' | ')"
    }
    Write-Host 'PASS exact in-place refusal: SQLSTATE P0001 and target-table reconciliation text matched.'
    return
  }

  if ($result.ExitCode -ne 0) {
    throw "$FileName failed with exit code $($result.ExitCode)."
  }
}

function Invoke-DisposableSql {
  param(
    [Parameter(Mandatory)] [string]$Sql,
    [switch]$Quiet
  )

  $arguments = @(
    'exec', '--env', "PGPASSWORD=$databasePassword", $containerName,
    'psql', '--no-psqlrc', '--username', 'postgres', '--dbname', 'postgres',
    '--set', 'ON_ERROR_STOP=1', '--set', 'VERBOSITY=verbose',
    '--no-align', '--tuples-only'
  )
  if ($Quiet) {
    $arguments += '--quiet'
  }
  $arguments += @('--command', $Sql)
  $result = Invoke-DockerCapture -Arguments $arguments
  if (-not $Quiet) {
    foreach ($line in $result.Output) {
      Write-Host $line
    }
  }
  if ($result.ExitCode -ne 0) {
    throw "Disposable SQL command failed with exit code $($result.ExitCode): $($result.Output -join [Environment]::NewLine)"
  }
  return ($result.Output -join [Environment]::NewLine).Trim()
}

try {
  Write-Host "Starting exact disposable container $containerName with --pull=never and --network none."
  $runResult = Invoke-DockerCapture -Arguments @(
    'run', '--pull=never', '--detach', '--name', $containerName,
    '--network', 'none', '--platform', 'linux/amd64',
    '--env', "POSTGRES_PASSWORD=$databasePassword",
    '--mount', "type=bind,source=$candidateDirectory,target=/candidate,readonly",
    $postgresImage
  )
  if ($runResult.ExitCode -ne 0) {
    throw "docker run failed with exit code $($runResult.ExitCode): $($runResult.Output -join ' ')"
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

  Write-Host 'Pass 1: apply, capture the exact delta, and prove a state-preserving in-place refusal.'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.sql' -PassNumber 1
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.capture-objects.sql' -PassNumber 1
  Invoke-DisposableSql -Sql "select rehearsal.capture_public_state('rerun-before-pass-1');" | Out-Null
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.sql' -PassNumber 1 -ExpectExactRerunRefusal
  Invoke-DisposableSql -Sql @"
select rehearsal.capture_public_state('rerun-after-pass-1');
select rehearsal.assert_public_state_equal('rerun-before-pass-1', 'rerun-after-pass-1');
select rehearsal.record_phase(1, 'rerun-refusal', jsonb_build_object(
  'sqlstate', 'P0001',
  'message', 'client-accounts blitz: one of the target tables already exists; reconcile before applying',
  'catalogUnchanged', true,
  'dataUnchanged', true
));
"@ | Out-Null

  Write-Host 'Pass 1: execute the broad structural suite and mapped historical narrative suite.'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.attacks.sql' -PassNumber 1
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.narrative-attacks.sql' -PassNumber 1
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.rollback.sql' -PassNumber 1
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.verify-rollback.sql' -PassNumber 1

  Write-Host 'Pass 2: clean reapply, require an identical logical-object delta, repeat both suites, and restore baseline.'
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.sql' -PassNumber 2
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.capture-objects.sql' -PassNumber 2
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.attacks.sql' -PassNumber 2
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.narrative-attacks.sql' -PassNumber 2
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.rollback.sql' -PassNumber 2
  Invoke-DisposablePsql '20260826_research_client_accounts_blitz.verify-rollback.sql' -PassNumber 2

  Invoke-DisposableSql -Sql @"
select rehearsal.assert_attack_coverage(1);
select rehearsal.assert_attack_coverage(2);
select rehearsal.assert_true(
  'both-pass phase results are complete',
  (select array_agg(phase order by phase) = array[
      'broad-attacks', 'narrative-attacks', 'object-capture', 'rerun-refusal', 'rollback'
    ]::text[] from rehearsal.pass_results where pass_number = 1)
  and
  (select array_agg(phase order by phase) = array[
      'broad-attacks', 'narrative-attacks', 'object-capture', 'rollback'
    ]::text[] from rehearsal.pass_results where pass_number = 2)
);
"@ | Out-Null

  $fingerprint = Invoke-DisposableSql -Quiet -Sql @"
with logical_result as (
  select format(
    '%s|attack|%s|%s|%s|%s|%s',
    pass_number, suite, historical_id, executable_id, disposition,
    coalesce(actual_sqlstate, '-')
  ) as value
  from rehearsal.attack_results
  union all
  select format(
    '%s|phase|%s|%s|%s',
    pass_number, phase, status, detail::text
  )
  from rehearsal.pass_results
)
select encode(sha256(convert_to(string_agg(value, E'\n' order by value), 'UTF8')), 'hex')
from logical_result;
"@
  if ($fingerprint -notmatch '^[0-9a-f]{64}$') {
    throw "Logical result fingerprint was not one SHA-256 value: $fingerprint"
  }

  Write-Host "REHEARSAL_LOGICAL_RESULT_SHA256=$fingerprint"
  Write-Host 'PASS disposable rehearsal: pinned image; exact 18 + 12 map; 2 identical applies; broad and narrative suites complete on both passes; exact P0001 rerun refusal left catalog/data unchanged; 2 exact baseline rollbacks.'
}
finally {
  if ($containerStarted) {
    Write-Host "Destroying exact disposable container $containerName."
    & docker rm --force $containerName | Out-Null
  }
}
