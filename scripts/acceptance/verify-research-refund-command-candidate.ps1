[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$candidate = Join-Path $repoRoot "supabase\candidates\20260828_research_commerce_refund_command.sql"
$bootstrap = Join-Path $repoRoot "supabase\verification\research-refund-command-disposable-bootstrap.sql"
$verification = Join-Path $repoRoot "supabase\verification\research-refund-command.verify.sql"
$image = "postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20"
$docker = (Get-Command docker -ErrorAction Stop).Source
$suffix = ([guid]::NewGuid().ToString("N")).Substring(0, 8)
$container = "xr-refund-atomic-$PID-$suffix"

if ($container -notmatch '^xr-refund-atomic-[0-9]+-[0-9a-f]{8}$') {
  throw "Refusing an unexpected disposable container name."
}
foreach ($path in @($candidate, $bootstrap, $verification)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required verification input is absent: $path"
  }
}

function Invoke-PsqlFile([string]$path) {
  Get-Content -Raw -LiteralPath $path |
    & $docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres -d refund_test
  if ($LASTEXITCODE -ne 0) {
    throw "psql file failed: $path"
  }
}

function Invoke-PsqlText([string]$sql) {
  $output = & $docker exec $container psql -v ON_ERROR_STOP=1 -At -U postgres -d refund_test -c $sql
  if ($LASTEXITCODE -ne 0) {
    throw "psql command failed"
  }
  return ($output -join "`n").Trim()
}

function Invoke-RefundRpc(
  [string]$action,
  [string]$claimId,
  [string]$adminId,
  [Nullable[long]]$amountCents,
  [string]$clientKey,
  [string]$providerName,
  [string]$commandId,
  [string]$providerKey,
  [Nullable[int]]$attempt,
  [string]$providerOutcome,
  [string]$failureCode,
  [string]$refundReference,
  [Nullable[long]]$refundedCents,
  [string]$asOf
) {
  function SqlText([string]$value) {
    if ([string]::IsNullOrEmpty($value)) { return "null" }
    return "'" + $value.Replace("'", "''") + "'"
  }
  function SqlNumber($value) {
    if ($null -eq $value) { return "null" }
    return [string]$value
  }
  $sql = "select public.research_commerce_refund_command_v1(" +
    ((@(
      (SqlText $action), (SqlText $claimId), (SqlText $adminId), (SqlNumber $amountCents),
      (SqlText $clientKey), (SqlText $providerName), (SqlText $commandId),
      (SqlText $providerKey), (SqlNumber $attempt), (SqlText $providerOutcome),
      (SqlText $failureCode), (SqlText $refundReference), (SqlNumber $refundedCents),
      (SqlText $asOf)
    )) -join ",") + ");"
  return (Invoke-PsqlText $sql | ConvertFrom-Json)
}

try {
  $imageInspection = & $docker image inspect $image --format '{{.Os}}/{{.Architecture}} {{index .RepoDigests 0}}'
  if ($LASTEXITCODE -ne 0 -or $imageInspection -notmatch '^linux/amd64 postgres@sha256:33f923') {
    throw "The exact cached linux/amd64 PostgreSQL image is unavailable."
  }

  & $docker run --pull=never --network none --name $container `
    -e POSTGRES_PASSWORD=refund_test_only -e POSTGRES_DB=refund_test `
    -d $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL." }

  $ready = $false
  $consecutiveReady = 0
  for ($index = 0; $index -lt 60; $index += 1) {
    & $docker exec $container pg_isready -U postgres -d refund_test *> $null
    if ($LASTEXITCODE -eq 0) {
      $consecutiveReady += 1
      if ($consecutiveReady -ge 3) { $ready = $true; break }
    } else {
      $consecutiveReady = 0
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Disposable PostgreSQL did not become ready." }

  Invoke-PsqlFile $bootstrap
  Invoke-PsqlFile $candidate
  Invoke-PsqlFile $verification

  $prepared = Invoke-RefundRpc `
    "prepare" "30000000-0000-4000-8000-000000000002" "admin-disposable" 4000 `
    "disposable-key-2" "stripe" $null $null $null $null $null $null $null `
    "2026-08-28T09:02:00Z"
  if ($prepared.outcome -ne "ready") { throw "Concurrency seed did not prepare." }
  $commandId = [string]$prepared.command.commandId
  $providerKey = [string]$prepared.command.providerIdempotencyKey

  $claimSql = "select public.research_commerce_refund_command_v1(" +
    "'claim_provider',null,null,null,null,null,'$commandId','$providerKey'," +
    "null,null,null,null,null,'2026-08-28T09:03:00Z');"
  $processes = 1..2 | ForEach-Object {
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $docker
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @(
      "exec", $container, "psql", "-v", "ON_ERROR_STOP=1", "-At",
      "-U", "postgres", "-d", "refund_test", "-c", $claimSql
    )) {
      $start.ArgumentList.Add($argument)
    }
    [System.Diagnostics.Process]::Start($start)
  }
  $concurrent = foreach ($process in $processes) {
    if (-not $process.WaitForExit(30000)) {
      $process.Kill($true)
      throw "Concurrent psql timed out."
    }
    $stdout = $process.StandardOutput.ReadToEnd().Trim()
    $stderr = $process.StandardError.ReadToEnd().Trim()
    if ($process.ExitCode -ne 0) {
      throw "Concurrent psql failed: $stderr"
    }
    $stdout | ConvertFrom-Json
  }
  if (($concurrent | Where-Object outcome -eq "execute").Count -ne 1 -or
      ($concurrent | Where-Object outcome -eq "reconciliation_required").Count -ne 1) {
    throw "Two-session provider permission did not serialize exactly once."
  }
  if (($concurrent.command.providerIdempotencyKey | Sort-Object -Unique).Count -ne 1) {
    throw "Concurrent sessions did not preserve one exact provider key."
  }

  $rollbackSql = @"
begin;
select public.research_commerce_refund_command_v1(
  'complete',null,null,null,null,null,'$commandId','$providerKey',1,
  null,null,'re_disposable_2',4000,'2026-08-28T09:04:00Z'
);
do `$forced_rollback`$ begin raise exception 'forced rollback'; end `$forced_rollback`$;
commit;
"@
  & $docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d refund_test -c $rollbackSql *> $null
  if ($LASTEXITCODE -eq 0) { throw "Forced rollback unexpectedly committed." }
  $rolledBack = Invoke-PsqlText @"
select o.state || '|' || o.refunded_cents || '|' || c.state || '|' ||
       coalesce(c.resolution,'') || '|' || rc.state || '|' ||
       (select count(*) from public.research_refund_keys where scope =
          '30000000-0000-4000-8000-000000000002:disposable-key-2') || '|' ||
       (select count(*) from public.research_order_state_events where order_id = o.id)
  from public.research_orders o
  join public.research_claims c on c.order_id = o.id
  join public.research_refund_commands rc on rc.order_id = o.id
 where o.id = '10000000-0000-4000-8000-000000000002';
"@
  if ($rolledBack -ne "delivered|0|approved||provider_in_flight|0|0") {
    throw "Forced completion rollback left a partial financial fact: $rolledBack"
  }

  $completed = Invoke-RefundRpc `
    "complete" $null $null $null $null $null $commandId $providerKey 1 `
    $null $null "re_disposable_2" 4000 "2026-08-28T09:05:00Z"
  if ($completed.outcome -ne "applied") { throw "Atomic completion did not apply." }
  $published = Invoke-PsqlText @"
select o.state || '|' || o.refunded_cents || '|' || c.state || '|' ||
       c.resolution || '|' || rc.state || '|' ||
       (select count(*) from public.research_refund_keys where scope =
          '30000000-0000-4000-8000-000000000002:disposable-key-2') || '|' ||
       (select count(*) from public.research_order_state_events where order_id = o.id)
  from public.research_orders o
  join public.research_claims c on c.order_id = o.id
  join public.research_refund_commands rc on rc.order_id = o.id
 where o.id = '10000000-0000-4000-8000-000000000002';
"@
  if ($published -ne "refunded|4000|resolved|partial_refund|applied|1|1") {
    throw "Atomic completion bundle was incomplete: $published"
  }

  $ambiguous = Invoke-RefundRpc `
    "prepare" "30000000-0000-4000-8000-000000000003" "admin-disposable" 4000 `
    "disposable-key-3" "stripe" $null $null $null $null $null $null $null `
    "2026-08-28T09:06:00Z"
  $ambiguousCommand = [string]$ambiguous.command.commandId
  $ambiguousKey = [string]$ambiguous.command.providerIdempotencyKey
  $claimed = Invoke-RefundRpc `
    "claim_provider" $null $null $null $null $null $ambiguousCommand $ambiguousKey `
    $null $null $null $null $null "2026-08-28T09:06:01Z"
  if ($claimed.outcome -ne "execute") { throw "Ambiguity seed did not claim execution." }
  $recorded = Invoke-RefundRpc `
    "record_outcome" $null $null $null $null $null $ambiguousCommand $ambiguousKey `
    1 "reconciliation_required" "RETRYABLE" $null $null "2026-08-28T09:06:02Z"
  $ordinaryRetry = Invoke-RefundRpc `
    "claim_provider" $null $null $null $null $null $ambiguousCommand $ambiguousKey `
    $null $null $null $null $null "2026-08-28T09:06:03Z"
  if ($recorded.outcome -ne "reconciliation_required" -or
      $ordinaryRetry.outcome -ne "reconciliation_required" -or
      [int]$ordinaryRetry.command.attempt -ne 1) {
    throw "Unknown provider result was not quarantined from ordinary retry."
  }

  $reconciled = Invoke-RefundRpc `
    "complete" $null $null $null $null $null $ambiguousCommand $ambiguousKey `
    1 $null $null "re_disposable_3" 4000 "2026-08-28T09:06:04Z"
  if ($reconciled.outcome -ne "applied") {
    throw "Exact proof from a trusted reconciler did not atomically apply."
  }
  $reconciledFacts = Invoke-PsqlText @"
select o.state || '|' || o.refunded_cents || '|' || c.state || '|' ||
       c.resolution || '|' || rc.state || '|' ||
       (select count(*) from public.research_refund_keys where scope =
          '30000000-0000-4000-8000-000000000003:disposable-key-3') || '|' ||
       (select count(*) from public.research_order_state_events where order_id = o.id)
  from public.research_orders o
  join public.research_claims c on c.order_id = o.id
  join public.research_refund_commands rc on rc.order_id = o.id
 where o.id = '10000000-0000-4000-8000-000000000003';
"@
  if ($reconciledFacts -ne "refunded|4000|resolved|partial_refund|applied|1|1") {
    throw "Reconciled proof did not publish one atomic fact set: $reconciledFacts"
  }

  $candidateHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash
  Write-Output "PASS refund command candidate offline attacks"
  Write-Output "image=$image"
  Write-Output "candidate_sha256=$candidateHash"
  Write-Output "concurrency=one_execute_one_reconciliation"
  Write-Output "forced_rollback=all_domain_and_ledger_facts_rolled_back"
  Write-Output "ambiguous_retry=no_second_execution_permission"
  Write-Output "reconciliation=confirmed_proof_atomic_publish"
} finally {
  $exists = & $docker ps -a --filter "name=^/$container`$" --format '{{.Names}}'
  if ($exists -eq $container) {
    & $docker rm -f $container *> $null
  }
}
