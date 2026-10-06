$ErrorActionPreference = 'Stop'
$qoReceiptPath = 'docs/health-launch/quick-order-20261005/evidence/g1-precheck-20261006.json'
if (Test-Path -LiteralPath $qoReceiptPath) { throw 'G1 consumed: never repeat this check' }
function Get-QoHash([string]$path) {
  $bytes = [Text.Encoding]::UTF8.GetBytes([IO.File]::ReadAllText((Join-Path (Get-Location) $path)).Replace("`r`n", "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
$qoPlanPath = 'docs/health-launch/quick-order-20261005/evidence/http-regression-plan-fd023e8.json'
$qoPlan = Get-Content -LiteralPath $qoPlanPath -Raw | ConvertFrom-Json
$qoIntegrity = Get-Content -LiteralPath 'docs/health-launch/quick-order-20261005/evidence/packet-integrity-http-fd023e8.json' -Raw | ConvertFrom-Json
$qoBaselineChecks = @($qoIntegrity.baselines | ForEach-Object { [ordered]@{path=$_.path;expected=$_.sha256lf;actual=(Get-QoHash $_.path)} })
$qoSourceDiff = @(git diff --name-only fd023e8c03baa2326baf707c944bcd25dce7f453 -- client server shared)
if ($LASTEXITCODE -ne 0) { throw 'Source comparison unavailable' }
$qoFiles = @(git ls-tree -r --name-only HEAD -- client/src/research/quick-order server/research/health/quick-order)
$qoOwnership = Get-Content -LiteralPath '.xenios/CODE_OWNERSHIP.json' -Raw | ConvertFrom-Json
$qoLease = @($qoOwnership.leases | Where-Object { $_.id -eq '17093695-69b5-4cc0-8b29-aedb82bf6409' -and $_.session -eq 'codex-health-quick-order-20261005' -and $_.state -eq 'active' })
$qoUnchanged = $qoFiles.Count -eq 24 -and $qoSourceDiff.Count -eq 0 -and $qoBaselineChecks.Count -eq 14 -and @($qoBaselineChecks | Where-Object {$_.expected -ne $_.actual}).Count -eq 0
$qoAt = [DateTime]::UtcNow
$qoOs = Get-CimInstance Win32_OperatingSystem
$qoDisk = Get-PSDrive -Name C
$qoJobs = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|npm|python|docker|postgres|chrome|msedge)\.exe$' -and $_.CommandLine -match '(vitest|vite[/\\]|vite\.js|tsc|build\.mjs|--test|playwright|puppeteer|pgbench|pytest)' } | Select-Object ProcessId, Name, ExecutablePath, CommandLine)
$qoMiB = [math]::Floor($qoOs.FreePhysicalMemory / 1024)
$qoInWindow = $qoAt -lt [DateTime]::Parse('2026-10-06T18:00:00Z').ToUniversalTime()
$qoAllowed = $qoInWindow -and $qoUnchanged -and $qoLease.Count -eq 1 -and $qoMiB -ge 1536 -and $qoDisk.Free -ge 20GB -and $qoJobs.Count -eq 0
$qoReceipt = [ordered]@{schemaVersion=1; reservation='QO-FIRST-20261006-G1'; authorityCommit='60d593ae2fc0623edc869e373bfe52e830968df9'; sampledAtUtc=$qoAt.ToString('o'); groupConsumed=1; maximumGroups=6; startBy='2026-10-06T18:00:00Z'; expiresAt='2026-10-06T21:43:37Z'; requiredMiB=1536;availableMiB=$qoMiB;requiredDiskGiB=20;freeDiskGiB=[math]::Round($qoDisk.Free/1GB,4); matchingHeavyJobs=$qoJobs; beforeStartExpiry=$qoInWindow;head=(git rev-parse HEAD);source=$qoPlan.source;sourceTree=$qoPlan.sourceTree; planSha256lf=(Get-QoHash $qoPlanPath); moduleFileCount=$qoFiles.Count;runtimeDiff=$qoSourceDiff;baselineChecks=$qoBaselineChecks;unchanged=$qoUnchanged;leaseValid=($qoLease.Count -eq 1);allowed=$qoAllowed;testProcessesStarted=0;reservationStatus=$(if($qoAllowed){'ADMITTED'}else{'REFUSED_RELEASED'});retryAuthorized=$false}
$qoReceipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $qoReceiptPath -Encoding utf8
[pscustomobject]@{sampledAtUtc=$qoReceipt.sampledAtUtc;allowed=$qoAllowed;availableMiB=$qoMiB;freeDiskGiB=$qoReceipt.freeDiskGiB;heavyJobs=$qoJobs.Count;unchanged=$qoUnchanged;leaseValid=$qoReceipt.leaseValid;reservationStatus=$qoReceipt.reservationStatus} | ConvertTo-Json -Compress
