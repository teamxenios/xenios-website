param(
  [string]$PostgresImage = "postgres:16"
)

$ErrorActionPreference = "Stop"
$expectedImageId = "sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$bootstrap = Join-Path $repo "supabase\candidates\tests\checkout_atomic_saga_bootstrap.sql"
$candidate = Join-Path $repo "supabase\candidates\20260828_research_commerce_checkout_atomic_saga.sql"
$test = Join-Path $repo "supabase\candidates\tests\checkout_atomic_saga_two_session.sql"
$container = "xr-checkout-atomic-$PID"

foreach ($path in @($bootstrap, $candidate, $test)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required harness input is absent: $path"
  }
}

$actualImageId = (docker image inspect $PostgresImage --format '{{.Id}}').Trim()
if ($actualImageId -ne $expectedImageId) {
  throw "Refusing unpinned PostgreSQL image. Expected $expectedImageId, got $actualImageId"
}

try {
  docker run --detach --rm --name $container --network none `
    --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=1g `
    --env POSTGRES_PASSWORD=checkout-test-only `
    $PostgresImage | Out-Null

  $ready = $false
  foreach ($attempt in 1..30) {
    docker exec $container pg_isready --username postgres --dbname postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Disposable PostgreSQL did not become ready" }

  foreach ($path in @($bootstrap, $candidate, $test)) {
    Get-Content -LiteralPath $path -Raw |
      docker exec --interactive $container psql `
        --quiet --username postgres --dbname postgres --set ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL harness failed while applying $path" }
  }
}
finally {
  docker stop --time 1 $container 2>$null | Out-Null
}
