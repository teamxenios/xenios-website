param([Parameter(Mandatory=$true)][ValidateSet('node2','vitest6','typecheck')][string]$QuickOrderJob)
$ErrorActionPreference = 'Stop'
$qoEvidence = 'docs/health-launch/quick-order-20261005/evidence'
$qoReceiptPath = Join-Path $qoEvidence ('precheck-' + $QuickOrderJob + '-f1e467f.json')
if (Test-Path -LiteralPath $qoReceiptPath) { throw 'Do not overwrite a qualification precheck or retry a job' }
function Get-QuickOrderLfHash([string]$QuickOrderPath) {
  $qoBytes = [Text.Encoding]::UTF8.GetBytes([IO.File]::ReadAllText((Join-Path (Get-Location) $QuickOrderPath)).Replace("`r`n", "`n"))
  [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($qoBytes)).ToLowerInvariant()
}
$qoBaselines = @(Get-Content -Raw (Join-Path $qoEvidence 'proposal-baselines.json') | ConvertFrom-Json)
$qoBaselineChecks = @($qoBaselines | ForEach-Object { [pscustomobject]@{path=$_.path; expected=$_.sha256lf; actual=(Get-QuickOrderLfHash $_.path)} })
$qoInventory = (Get-Content -Raw (Join-Path $qoEvidence 'relocation-inventory.json') | ConvertFrom-Json).inventory
$qoSourceChecks = @($qoInventory | ForEach-Object { [pscustomobject]@{path=$_.newPath; expected=$_.afterSha256lf; actual=(Get-QuickOrderLfHash $_.newPath); oldAbsent=(-not (Test-Path -LiteralPath $_.oldPath))} })
$qoRuntimeDiff = @(git diff --name-only f1e467f74b01ae2ab866bb791a3c11d657a5d69c -- client server shared)
if ($LASTEXITCODE -ne 0) { throw 'Cannot compare qualified runtime' }
$qoRequiredMiB = @{node2=512;vitest6=1536;typecheck=2048}[$QuickOrderJob]
$qoPriorPass = $true
if ($QuickOrderJob -in @('vitest6','typecheck')) {
  $qoNode = Get-Content -Raw (Join-Path $qoEvidence 'node2-source-f1e467f.json') | ConvertFrom-Json
  $qoPriorPass = $qoNode.exit.code -eq 0 -and $qoNode.sourcesUnchanged
}
if ($QuickOrderJob -eq 'typecheck') {
  $qoVitest = Get-Content -Raw (Join-Path $qoEvidence 'vitest6-source-f1e467f.json') | ConvertFrom-Json
  $qoPriorPass = $qoPriorPass -and $qoVitest.exit.code -eq 0 -and $qoVitest.sourcesUnchanged
}
$qoOs = Get-CimInstance Win32_OperatingSystem
$qoDisk = Get-PSDrive -Name C
$qoJobs = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'vitest|vite.js|tsc|build.mjs' } | Select-Object ProcessId,ExecutablePath,CommandLine)
$qoFreeMiB = [math]::Floor($qoOs.FreePhysicalMemory/1024)
$qoUnchanged = $qoBaselineChecks.Count -eq 14 -and $qoSourceChecks.Count -eq 22 -and @($qoBaselineChecks | Where-Object {$_.expected -ne $_.actual}).Count -eq 0 -and @($qoSourceChecks | Where-Object {$_.expected -ne $_.actual -or -not $_.oldAbsent}).Count -eq 0 -and $qoRuntimeDiff.Count -eq 0
$qoBeforeExpiry = $QuickOrderJob -ne 'node2' -or [DateTime]::UtcNow -lt [DateTime]::Parse('2026-10-05T20:50:00Z').ToUniversalTime()
$qoAllowed = $qoUnchanged -and $qoPriorPass -and $qoBeforeExpiry -and $qoFreeMiB -ge $qoRequiredMiB -and $qoDisk.Free -ge 20GB -and $qoJobs.Count -eq 0
$qoReceipt = [ordered]@{ sampledAtUtc=[DateTime]::UtcNow.ToString('o'); job=$QuickOrderJob; coordinatorReservation='fc11f54b2851e964ae9080f8fccccbf06de2eeee'; source='f1e467f74b01ae2ab866bb791a3c11d657a5d69c'; sourceTree='6bc4fd7a7483822d4af87a3c07ab7263c0fbc377'; head=(git rev-parse HEAD); requiredMiB=$qoRequiredMiB; availableMiB=$qoFreeMiB; freeDiskGiB=[math]::Round($qoDisk.Free/1GB,2); matchingHeavyJobs=$qoJobs; baselineChecks=$qoBaselineChecks; sourceChecks=$qoSourceChecks; unchanged=$qoUnchanged; priorFocusedPass=$qoPriorPass; beforeStartExpiry=$qoBeforeExpiry; allowed=$qoAllowed }
$qoReceipt | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 -LiteralPath $qoReceiptPath
[pscustomobject]@{job=$QuickOrderJob;allowed=$qoAllowed;availableMiB=$qoFreeMiB;requiredMiB=$qoRequiredMiB;freeDiskGiB=$qoReceipt.freeDiskGiB;matchingHeavyJobs=$qoJobs.Count;unchanged=$qoUnchanged;priorFocusedPass=$qoPriorPass;beforeStartExpiry=$qoBeforeExpiry} | ConvertTo-Json -Compress
if (-not $qoAllowed) { exit 3 }
