param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSourceSha,
  [ValidatePattern('^[A-Za-z0-9_.-]{1,120}$')][string]$AllocationId = 'HOSTED-COORDINATION-QUALIFICATION',
  [string]$OutputParentDirectory,
  [ValidateRange(0,1000)][int]$ExpectedCaseCount = 0
)
$ErrorActionPreference = 'Stop'
$overallWatch = [Diagnostics.Stopwatch]::StartNew()
if ($PSVersionTable.PSVersion.Major -lt 7 -or [System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) { throw 'PowerShell7 on Windows is required' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$gitPath = (Get-Command git -CommandType Application -ErrorAction Stop).Source
$nodePath = (Get-Command node -CommandType Application -ErrorAction Stop).Source
function Git-Value {
  param([string[]]$GitArguments)
  $value = & $gitPath -C $repoRoot @GitArguments
  if ($LASTEXITCODE -ne 0) { throw 'Source Git read failed' }
  return ($value -join "`n").Trim()
}
$nodeVersion = (& $nodePath --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne 'v20.19.0') { throw 'Exact Node20.19.0 is required' }
$sourceHead = Git-Value -GitArguments @('rev-parse','HEAD')
if ($sourceHead -ne $ExpectedSourceSha -or (Git-Value -GitArguments @('status','--porcelain'))) { throw 'Exact clean source required' }
$plan = Get-Content -LiteralPath (Join-Path $repoRoot 'scripts/agentic/coordination-qualification/candidate-qualification-plan.json') -Raw | ConvertFrom-Json
if ($ExpectedCaseCount -eq 0) { $ExpectedCaseCount = [int]$plan.acceptance.candidateTestCases }
if ($ExpectedCaseCount -ne [int]$plan.acceptance.candidateTestCases -or $ExpectedCaseCount -lt 1) { throw 'Case count does not match source plan' }
if (-not $OutputParentDirectory) { $OutputParentDirectory = [IO.Path]::GetTempPath() }
$artifactParent = (Resolve-Path -LiteralPath $OutputParentDirectory).ProviderPath
if ([IO.Path]::GetFullPath($artifactParent).ToLowerInvariant().StartsWith($repoRoot.ToLowerInvariant() + [IO.Path]::DirectorySeparatorChar) -or [IO.Path]::GetFullPath($artifactParent).ToLowerInvariant() -eq $repoRoot.ToLowerInvariant()) { throw 'Artifacts must be outside the source worktree' }
$runDirectory = Join-Path $artifactParent ('xenios-coordination-run-' + [Guid]::NewGuid().ToString())
if (Test-Path -LiteralPath $runDirectory) { throw 'Artifact directory must be new' }
$null = New-Item -ItemType Directory -Path $runDirectory
$runKey = $AllocationId
$OutputStem = 'candidate'
$monitorScriptSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$priorReceiptEnvPresent = Test-Path Env:XENIOS_COORDINATION_CANDIDATE_RECEIPT
$priorReceiptEnv = $env:XENIOS_COORDINATION_CANDIDATE_RECEIPT
$scriptStartedAt = [DateTime]::UtcNow
[IO.File]::WriteAllText((Join-Path $runDirectory 'run-owner.json'), ([ordered]@{kind='xenios-finite-qualification-monitor-v1';allocation=$runKey;sourceSha=$ExpectedSourceSha;createdAt=$scriptStartedAt.ToString('o');monitorPid=$PID}|ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$stdoutPath = Join-Path $runDirectory ($OutputStem+'.stdout.log')
$stderrPath = Join-Path $runDirectory ($OutputStem+'.stderr.log')
$monitorPath = Join-Path $runDirectory ($OutputStem+'.monitor.json')
$receiptPath = Join-Path $runDirectory ($OutputStem+'.qualification.json')
foreach ($newPath in @($stdoutPath,$stderrPath,$monitorPath,$receiptPath)) { if (Test-Path -LiteralPath $newPath) { throw 'Refusing existing run destination' } }
$memory = 1..3 | ForEach-Object { $osSample = Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 3; [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); freeMiB=[math]::Floor($osSample.FreePhysicalMemory/1024) }; Start-Sleep -Milliseconds 200 }
[IO.File]::WriteAllText((Join-Path $runDirectory 'preflight.json'),([ordered]@{sourceSha=$ExpectedSourceSha;nodePath=$nodePath;nodeVersion=$nodeVersion;ramSamples=$memory;observedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
if (@($memory | Where-Object {$_.freeMiB -lt 700}).Count) { throw 'Fresh RAM failed' }
$env:XENIOS_COORDINATION_CANDIDATE_RECEIPT = $receiptPath
$info = [Diagnostics.ProcessStartInfo]::new($nodePath, '--max-old-space-size=384 --test --test-concurrency=1 scripts/agentic/corpus-store.node-test.mjs')
$info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
$info.WorkingDirectory=$repoRoot
$info.EnvironmentVariables.Remove('NODE_OPTIONS')
$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false); $info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
try { $runner=[Diagnostics.Process]::Start($info) }
catch {
  if($priorReceiptEnvPresent) {$env:XENIOS_COORDINATION_CANDIDATE_RECEIPT=$priorReceiptEnv} else {Remove-Item Env:XENIOS_COORDINATION_CANDIDATE_RECEIPT -ErrorAction SilentlyContinue}
  throw
}
$null=$runner.Handle
$owned=@{}
$captureErrors=[Collections.Generic.List[object]]::new()
$captureTimings=[Collections.Generic.List[object]]::new()
$owned[$runner.Id]=[ordered]@{process=$runner;pid=$runner.Id;parentPid=$null;birthTicks=$runner.StartTime.ToUniversalTime().Ticks;birth=$runner.StartTime.ToUniversalTime().ToString('o');cimBirth=$null;name='node';root=$true;killed=$false}
function Capture-Owned {
  $captureStart=[DateTime]::UtcNow
  try { $snapshot=@(Get-CimInstance Win32_Process -OperationTimeoutSec 3 | Select-Object ProcessId,ParentProcessId,CreationDate,Name) }
  catch { $captureErrors.Add([ordered]@{at=[DateTime]::UtcNow.ToString('o');type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult}); return }
  $captureTimings.Add([ordered]@{startedAt=$captureStart.ToString('o');finishedAt=[DateTime]::UtcNow.ToString('o');milliseconds=([DateTime]::UtcNow-$captureStart).TotalMilliseconds})
  $changed=$true
  while($changed) {
    $changed=$false
    foreach($entry in $snapshot) {
      $childId=[int]$entry.ProcessId; $parentId=[int]$entry.ParentProcessId
      if($owned.ContainsKey($childId) -or -not $owned.ContainsKey($parentId)) { continue }
      if($entry.CreationDate.ToUniversalTime().Ticks -lt $owned[$parentId].birthTicks) { continue }
      try {
        $parentProcess=$owned[$parentId].process
        if($parentProcess.HasExited -and $entry.CreationDate.ToUniversalTime().Ticks -gt $parentProcess.ExitTime.ToUniversalTime().Ticks) {continue}
        $actual=[Diagnostics.Process]::GetProcessById($childId); $null=$actual.Handle
        $birthTicks=$actual.StartTime.ToUniversalTime().Ticks
        if([decimal]::Floor(([decimal]$birthTicks)/10) -ne [decimal]::Floor(([decimal]$entry.CreationDate.ToUniversalTime().Ticks)/10)) { $actual.Dispose(); continue }
        $owned[$childId]=[ordered]@{process=$actual;pid=$childId;parentPid=$parentId;birthTicks=$birthTicks;birth=$actual.StartTime.ToUniversalTime().ToString('o');cimBirth=$entry.CreationDate.ToUniversalTime().ToString('o');name=$entry.Name;root=$false;killed=$false}
        $changed=$true
      } catch { continue }
    }
  }
}
function Stop-KnownOwned {
  # Actual retained handles, newest first (known worker before its root). No
  # expensive discovery can delay this stop after a first failure is observed.
  foreach($record in @($owned.Values | Sort-Object birthTicks -Descending)) {
    try { if(-not $record.process.HasExited) { $record.process.Kill(); $record.killed=$true } } catch { $record.killError=$_.Exception.Message }
  }
}
function Stop-Owned {
  Stop-KnownOwned
  # Keep parent handles pinned while discovering/sweeping any late descendant.
  # Unknown already-exited fast children remain an explicit coverage limit.
  Capture-Owned
  Stop-KnownOwned
}
function Copy-OwnedFixtures {
  $copies=[Collections.Generic.List[object]]::new()
  $roots=@(@($env:TEMP,$env:TMP,([IO.Path]::GetTempPath()))|Where-Object{$_ -and (Test-Path -LiteralPath $_)}|Select-Object -Unique)
  $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $destination=Join-Path $runDirectory 'fixtures'
  $null=New-Item -ItemType Directory -Path $destination
  foreach($tempRoot in $roots) {
    foreach($directory in @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'xenios-coordination-candidate-*')) {
      if($directory.CreationTimeUtc -lt $scriptStartedAt -or -not $seen.Add($directory.FullName)) {continue}
      $copy=[ordered]@{source=$directory.FullName;createdAt=$directory.CreationTimeUtc.ToString('o');copied=$false;scenario=$null;runId=$null;completedReceipt=$false;error=$null}
      try {
        if($overallWatch.Elapsed.TotalSeconds -ge 600) {throw 'artifact_budget_exhausted'}
        $markerFile=Join-Path $directory.FullName 'fixture-owner.json'
        if(-not(Test-Path -LiteralPath $markerFile)) {throw 'unmarked_incomplete_directory_not_copied'}
        $marker=Get-Content -LiteralPath $markerFile -Raw|ConvertFrom-Json
        if($marker.kind -ne 'xenios-coordination-candidate-v1' -or $marker.runId -notmatch '^[a-f0-9-]{36}$') {throw 'unknown_fixture_marker'}
        $copy.scenario=$marker.scenario;$copy.runId=$marker.runId
        if($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) {throw 'fixture_reparse_point'}
        $entries=@(Get-ChildItem -LiteralPath $directory.FullName -Recurse -Force)
        if(@($entries|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count) {throw 'fixture_reparse_point'}
        Copy-Item -LiteralPath $directory.FullName -Destination $destination -Recurse -Force
        $copy.copied=$true;$copy.completedReceipt=Test-Path -LiteralPath (Join-Path $directory.FullName 'receipt.json')
      } catch {$copy.error=$_.Exception.Message}
      $copies.Add($copy)
    }
  }
  return $copies.ToArray()
}
$outWriter=[IO.StreamWriter]::new($stdoutPath,$false,[Text.UTF8Encoding]::new($false)); $outWriter.AutoFlush=$true
$errWriter=[IO.StreamWriter]::new($stderrPath,$false,[Text.UTF8Encoding]::new($false)); $errWriter.AutoFlush=$true
$outChars=[char[]]::new(4096); $errChars=[char[]]::new(4096)
$outRead=$runner.StandardOutput.ReadAsync($outChars,0,$outChars.Length)
$errRead=$runner.StandardError.ReadAsync($errChars,0,$errChars.Length)
$outDone=$false; $errDone=$false; $tap=''; $stopReason=$null; $firstFailure=$null; $monitorError=$null
$startedAt=[DateTime]::UtcNow
$firstFailureObservedAt=$null
$nextCapture=[DateTime]::UtcNow
Write-Output ('PHASE START '+$startedAt.ToString('o')+' runner '+$runner.Id+' RAM '+(($memory|ForEach-Object {$_.freeMiB}) -join '/'))
try {
  while(-not ($outDone -and $errDone -and $runner.HasExited)) {
    if(-not $outDone -and $outRead.IsCompleted) {
      $count=$outRead.GetAwaiter().GetResult()
      if($count -eq 0) {$outDone=$true} else {
        $text=[string]::new($outChars,0,$count); $outWriter.Write($text); [Console]::Out.Write($text); $tap+=$text
        if(-not $stopReason -and $tap -match '(?m)^not ok [^\r\n]+') { $firstFailure=$Matches[0]; $firstFailureObservedAt=[DateTime]::UtcNow.ToString('o'); $stopReason='first_test_failure'; Stop-Owned }
        $outRead=$runner.StandardOutput.ReadAsync($outChars,0,$outChars.Length)
      }
    }
    if(-not $errDone -and $errRead.IsCompleted) {
      $count=$errRead.GetAwaiter().GetResult()
      if($count -eq 0) {$errDone=$true} else { $text=[string]::new($errChars,0,$count); $errWriter.Write($text); [Console]::Error.Write($text); $errRead=$runner.StandardError.ReadAsync($errChars,0,$errChars.Length) }
    }
    if(-not $stopReason -and $overallWatch.Elapsed.TotalSeconds -ge 570) {$stopReason='overall_deadline';Stop-Owned}
    if([DateTime]::UtcNow -ge $nextCapture) {Capture-Owned; $nextCapture=[DateTime]::UtcNow.AddMilliseconds(700)}
    if($captureErrors.Count -and -not $stopReason) {$stopReason='ownership_observation_failed';Stop-KnownOwned}
    if($stopReason) {Stop-Owned}
    Start-Sleep -Milliseconds 20
  }
} catch { if(-not $stopReason) {$stopReason='monitor_error'}; $monitorError=[ordered]@{type=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult}; Stop-KnownOwned }
finally {
  Stop-Owned
  foreach($record in @($owned.Values)) {try {$remaining=[math]::Max(0,600000-$overallWatch.ElapsedMilliseconds); if($remaining -gt 0) {$null=$record.process.WaitForExit([int][math]::Min(5000,$remaining))}} catch {}}
  # On a monitor exception, drain the pending async chunk and all subsequent
  # output after the retained handles have been stopped. Never tail/truncate.
  while(-not($outDone -and $errDone) -and $overallWatch.Elapsed.TotalSeconds -lt 600) {
    if(-not $outDone -and $outRead.IsCompleted) {
      $count=$outRead.GetAwaiter().GetResult()
      if($count -eq 0) {$outDone=$true} else {$text=[string]::new($outChars,0,$count);$outWriter.Write($text);[Console]::Out.Write($text);$tap+=$text;$outRead=$runner.StandardOutput.ReadAsync($outChars,0,$outChars.Length)}
    }
    if(-not $errDone -and $errRead.IsCompleted) {
      $count=$errRead.GetAwaiter().GetResult()
      if($count -eq 0) {$errDone=$true} else {$text=[string]::new($errChars,0,$count);$errWriter.Write($text);[Console]::Error.Write($text);$errRead=$runner.StandardError.ReadAsync($errChars,0,$errChars.Length)}
    }
    Start-Sleep -Milliseconds 10
  }
  $outWriter.Dispose(); $errWriter.Dispose()
  $runner.Refresh()
  $records=@($owned.Values|ForEach-Object {[ordered]@{pid=$_.pid;parentPid=$_.parentPid;birth=$_.birth;birthTicks=$_.birthTicks;cimBirth=$_.cimBirth;name=$_.name;root=$_.root;killed=$_.killed;exited=$_.process.HasExited;exitCode=if($_.process.HasExited){$_.process.ExitCode}else{$null}}})
  $passed=@([regex]::Matches($tap,'(?m)^ok \d+ - ')).Count
  $failed=@([regex]::Matches($tap,'(?m)^not ok \d+ - ')).Count
  $skips=@([regex]::Matches($tap,'(?m)^(?:not )?ok \d+ - [^\r\n]*# SKIP')).Count
  $result=[ordered]@{allocation=$runKey;
    sourceSha=$ExpectedSourceSha;
    nodePath=$nodePath;
    nodeVersion=$nodeVersion;
    monitorScriptSha256=$monitorScriptSha256;
    artifactDirectory=$runDirectory;
    overallBudgetSeconds=600;
    supervisionBudgetSeconds=570;
    cleanupReserveSeconds=30;
    firstFailureObservedAt=$firstFailureObservedAt;
    startedAt=$startedAt.ToString('o');
    finishedAt=[DateTime]::UtcNow.ToString('o');
    ramSamples=$memory;
    stopReason=$stopReason;
    firstFailure=$firstFailure;
    monitorError=$monitorError;
    runnerExitCode=if($runner.HasExited){$runner.ExitCode}else{$null};
    plannedCases=$ExpectedCaseCount;
    observedPassed=$passed;
    observedFailed=$failed;
    observedSkipped=$skips;
    stdout=$stdoutPath;
    stderr=$stderrPath;
    qualificationReceipt=if(Test-Path -LiteralPath $receiptPath){$receiptPath}else{$null};
    allCapturedOwnedProcessesExited=(@($records|Where-Object {-not $_.exited}).Count -eq 0);
    processes=$records;
    processBirthComparison='exact_decimal_microsecond_floors';
    stopStrategy='known_retained_handles_before_CIM_sweep';
    captureCoverage='Only records with retained actual handles and verified birth; fixture receipts additionally retain actual CLI closes';
    uncapturedFastChildCoverage='Already exited children not observed/opened are not individually proved; allCapturedOwnedProcessesExited is not exhaustive process accounting'}
  $result.streamsComplete=($outDone -and $errDone)
  $result.fixtureCollectionError=$null;$result.suiteReceiptError=$null
  $result.captureErrors=$captureErrors.ToArray();$result.captureTimings=$captureTimings.ToArray()
  $result.failureObservationLimit='Synchronous CIM can delay TAP observation; firstFailureObservedAt is observation time. Incomplete later cases may have started and are not passes.'
  try {$result.fixtures=@(Copy-OwnedFixtures)} catch {$result.fixtureCollectionError=$_.Exception.GetType().FullName;$result.fixtures=@()}
  $result.incompleteFixtures=@($result.fixtures|Where-Object{-not $_.completedReceipt})
  $suite=$null
  if(Test-Path -LiteralPath $receiptPath) {try {$suite=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json} catch {$result.suiteReceiptError='invalid_json'}}
  $result.sourceUnchanged=$false
  try {$result.sourceUnchanged=((Git-Value -GitArguments @('rev-parse','HEAD')) -eq $ExpectedSourceSha -and -not(Git-Value -GitArguments @('status','--porcelain')))} catch {$result.sourceUnchanged=$false}
  $suiteValid=$false
  if($suite) {try {$suiteValid=($suite.allCasesPassed -eq $true -and $suite.definedCases -eq $ExpectedCaseCount -and $suite.cases.Count -eq $ExpectedCaseCount -and $suite.sourceBefore.sourceSha -eq $ExpectedSourceSha -and $suite.sourceAfter.sourceSha -eq $ExpectedSourceSha)} catch {$result.suiteReceiptError='invalid_schema'}}
  $result.qualified=(
    $null -eq $stopReason -and
    $result.runnerExitCode -eq 0 -and
    $result.streamsComplete -and
    $result.sourceUnchanged -and
    $result.allCapturedOwnedProcessesExited -and
    $captureErrors.Count -eq 0 -and
    $suiteValid -and
    $passed -eq $ExpectedCaseCount -and
    $failed -eq 0 -and
    $skips -eq 0 -and
    -not $result.fixtureCollectionError -and
    $result.fixtures.Count -eq $ExpectedCaseCount -and
    @($result.fixtures|Where-Object{-not $_.copied}).Count -eq 0 -and
    $result.incompleteFixtures.Count -eq 0 -and
    $overallWatch.Elapsed.TotalSeconds -le 600
  )
  $result.outerTimeoutLimit='600-second relative budget with30-second cleanup reserve; CI must also enforce an outer job timeout because OS/filesystem calls can stall.'
  $result.finishedAt=[DateTime]::UtcNow.ToString('o');$result.overallElapsedMilliseconds=$overallWatch.ElapsedMilliseconds
  [IO.File]::WriteAllText($monitorPath,($result|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
  Write-Output ('MONITOR RECEIPT '+$monitorPath)
  foreach($record in @($owned.Values)) {$record.process.Dispose()}
  if($priorReceiptEnvPresent) {$env:XENIOS_COORDINATION_CANDIDATE_RECEIPT=$priorReceiptEnv} else {Remove-Item Env:XENIOS_COORDINATION_CANDIDATE_RECEIPT -ErrorAction SilentlyContinue}
}
if(-not $result.qualified) {exit 1}
