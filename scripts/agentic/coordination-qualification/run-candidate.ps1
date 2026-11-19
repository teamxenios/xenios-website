param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedSourceSha,
  [ValidatePattern('^[A-Za-z0-9_.-]{1,120}$')][string]$AllocationId='HOSTED-COORDINATION-QUALIFICATION',
  [string]$OutputParentDirectory,
  [ValidateRange(0,1000)][int]$ExpectedCaseCount=0
)
$ErrorActionPreference='Stop'
$watch=[Diagnostics.Stopwatch]::StartNew()
$utf8=[Text.UTF8Encoding]::new($false,$true)
$uuid='^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$'
$pins=[Collections.Generic.List[object]]::new()
$heldJson=[Collections.Generic.List[object]]::new()
$owned=@{}
$errors=[Collections.Generic.List[object]]::new()
$captures=[Collections.Generic.List[object]]::new()
$guardCommands=[Collections.Generic.List[object]]::new()
$fixtureDiagnostics=[Collections.Generic.List[object]]::new()
$diagnosticStage='setup.initial'
$runner=$null;$outWriter=$null;$errWriter=$null;$outTask=$null;$errTask=$null
$outDone=$false;$errDone=$false;$tap='';$stopReason=$null;$firstFailure=$null
$firstFailureObservedAt=$null;$runDirectory=$null;$artifactFence=$null
$artifactIncomplete=$false;$sourceUnchanged=$false;$qualified=$false
$environmentRestored=$false;$resourcesDisposed=$false
$nonce=[Guid]::NewGuid().ToString()
$environmentKeys=@('XENIOS_COORDINATION_CANDIDATE_RECEIPT','XENIOS_COORDINATION_SUPERVISOR_NONCE','XENIOS_COORDINATION_SUPERVISOR_ARTIFACT_ROOT','XENIOS_COORDINATION_SUPERVISOR_ALLOCATION')
$environmentBefore=@{}
foreach($key in $environmentKeys){$environmentBefore[$key]=@{Present=(Test-Path ('Env:'+$key));Value=[Environment]::GetEnvironmentVariable($key,'Process')}}
function Check-Budget([double]$Limit=600){if($watch.Elapsed.TotalSeconds -ge $Limit){throw 'qualification_budget_exhausted'}}
function Set-DiagnosticStage([string]$Stage){$script:diagnosticStage=$Stage}
function Error-Metadata($Exception){
  $chain=[Collections.Generic.List[object]]::new();$current=$Exception
  for($depth=0;$current -and $depth -lt 4;$depth++){
    $native=if($current -is [ComponentModel.Win32Exception]){$current.NativeErrorCode}else{$null}
    $chain.Add([ordered]@{type=$current.GetType().FullName;hresult=$current.HResult;nativeErrorCode=$native})
    $current=$current.InnerException
  }
  # Only exact authored refusal messages become codes; never record arbitrary
  # exception text, paths, command lines, environment, or customer content.
  $refusals=@{
    'qualification_budget_exhausted'='budget_exhausted';'JSON boundary or size refused'='json_boundary_or_size';
    'Filesystem provider required'='filesystem_provider';'Local drive path required'='local_drive';
    'Canonical path identity unstable'='canonical_path_unstable';'Local fixed NTFS required'='fixed_ntfs';
    'New directory crossed physical boundary'='new_directory_boundary';'Fixture not direct physical temp child'='fixture_parent_boundary';
    'Invalid owned fixture identity'='fixture_identity';'Duplicate fixture identity/scenario'='fixture_duplicate';
    'Fixture receipt identity/exit claim mismatch'='fixture_receipt_binding';'Empty completed fixture receipt'='fixture_receipt_empty';
    'Invalid fixture process exit claim'='fixture_process_exit';'Suite identity/status mismatch'='suite_binding';
    'Case manifest/receipt mismatch'='case_manifest_binding';'Duplicate or aliased manifest case'='case_manifest_duplicate';
    'Fixture set differs from manifest'='fixture_manifest_count';'Directory alias/boundary refused'='copy_directory_boundary';
    'File alias/boundary refused'='copy_file_boundary';'Reparse entry refused'='copy_reparse';
    'Reparse point refused'='native_reparse';'File hard-link alias refused'='native_hardlink';
    'Unexpected path kind'='native_path_kind';'Only local DOS-volume paths qualified'='native_local_dos_path'
  }
  $code=$null;$current=$Exception
  for($depth=0;$current -and $depth -lt 4;$depth++){if($refusals.ContainsKey($current.Message)){$code=$refusals[$current.Message];break};$current=$current.InnerException}
  return [ordered]@{type=$Exception.GetType().FullName;hresult=$Exception.HResult;refusalCode=$code;chain=$chain.ToArray()}
}
function Note-Error([string]$Stage,$Exception){
  $metadata=Error-Metadata $Exception
  $entry=[ordered]@{stage=$Stage;substage=$script:diagnosticStage;at=[DateTime]::UtcNow.ToString('o');error=$metadata}
  $errors.Add($entry)
  # Independent of fixture scans/copies and terminal receipt serialization.
  try{[Console]::Error.WriteLine('XENIOS_SUPERVISOR_DIAGNOSTIC '+($entry|ConvertTo-Json -Depth 8 -Compress))}catch{}
}
function Dispose-Fence($Fence){if($Fence){foreach($handle in $Fence.Handles){try{$handle.Dispose()}catch{}}}}
function Same-Path([string]$A,[string]$B){return [StringComparer]::OrdinalIgnoreCase.Equals($A.TrimEnd('\'),$B.TrimEnd('\'))}

# Read-only Win32 metadata/final-name APIs; never follows a final reparse point.
# https://learn.microsoft.com/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle
# https://learn.microsoft.com/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew
if($PSVersionTable.PSVersion.Major -lt 7 -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){throw 'PowerShell7 Windows required'}
if('XeniosQualificationFenceV2' -as [type]){throw 'Unexpected preloaded qualification interop type'}
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class XeniosQualificationFenceV2 {
  [StructLayout(LayoutKind.Sequential)] struct Info {
    public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  public sealed class Entry {
    public SafeFileHandle Handle; public string Path, Key; public bool Directory;
    public long Length; public uint Links;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle,StringBuilder name,uint length,uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateDirectoryW(string name,IntPtr security);
  static string Extended(string path) {
    if(path.Length<3||path[1]!=':'||path[2]!='\\')throw new IOException("Local DOS path required");
    return @"\\?\"+path;
  }
  public static void CreateNewDirectory(string path) {
    if(!CreateDirectoryW(Extended(path),IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error(),"Exclusive directory creation failed");
  }
  public static Entry Open(string path,bool directory,bool readable) {
    var handle=CreateFileW(Extended(path),readable?0x80000000u:0x80u,directory?3u:1u,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
    if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();handle.Dispose();throw new Win32Exception(error,"Metadata open failed");}
    try {
      Info info;if(!GetFileInformationByHandle(handle,out info))throw new Win32Exception(Marshal.GetLastWin32Error(),"File identity unavailable");
      if((info.Attributes&0x400)!=0)throw new IOException("Reparse point refused");
      bool actualDirectory=(info.Attributes&0x10)!=0;
      if(actualDirectory!=directory)throw new IOException("Unexpected path kind");
      if(!directory&&info.Links!=1)throw new IOException("File hard-link alias refused");
      var text=new StringBuilder(512);uint count=GetFinalPathNameByHandleW(handle,text,(uint)text.Capacity,0);
      if(count==0)throw new Win32Exception(Marshal.GetLastWin32Error(),"Final path unavailable");
      if(count>=text.Capacity){if(count>32767)throw new IOException("Path too long");text=new StringBuilder((int)count+1);count=GetFinalPathNameByHandleW(handle,text,(uint)text.Capacity,0);if(count==0||count>=text.Capacity)throw new IOException("Final path incomplete");}
      string final=text.ToString();if(final.StartsWith(@"\\?\"))final=final.Substring(4);
      if(final.Length<3||final[1]!=':'||final[2]!='\\')throw new IOException("Only local DOS-volume paths qualified");
      if(final.Length>3)final=final.TrimEnd('\\');
      return new Entry{Handle=handle,Path=final,Key=info.Volume.ToString("X8")+"-"+info.IndexHigh.ToString("X8")+info.IndexLow.ToString("X8"),Directory=actualDirectory,Length=((long)info.SizeHigh<<32)|info.SizeLow,Links=info.Links};
    }catch{handle.Dispose();throw;}
  }
}
'@

function Fence-Directory([string]$InputPath,[bool]$CanonicalPass=$false){
  Check-Budget
  $provider=$null;$drive=$null
  $path=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($InputPath,[ref]$provider,[ref]$drive)
  if($provider.Name -ne 'FileSystem'){throw 'Filesystem provider required'}
  $full=[IO.Path]::GetFullPath($path)
  if($full -notmatch '^[A-Za-z]:\\'){throw 'Local drive path required'}
  $handles=[Collections.Generic.List[object]]::new()
  $ancestors=[Collections.Generic.List[string]]::new()
  try{
    $root=[IO.Path]::GetPathRoot($full)
    $entry=[XeniosQualificationFenceV2]::Open($root,$true,$false);$handles.Add($entry.Handle);$ancestors.Add($entry.Key)
    $parentKey=$null
    foreach($part in $full.Substring($root.Length).TrimEnd('\').Split('\',[StringSplitOptions]::RemoveEmptyEntries)){
      Check-Budget
      $parentKey=$entry.Key
      $entry=[XeniosQualificationFenceV2]::Open((Join-Path $entry.Path $part),$true,$false)
      $handles.Add($entry.Handle);$ancestors.Add($entry.Key)
    }
    $volume=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($entry.Path))
    if(-not $volume.IsReady -or $volume.DriveType -ne [IO.DriveType]::Fixed -or $volume.DriveFormat -ne 'NTFS'){throw 'Local fixed NTFS required'}
    if(-not(Same-Path $full $entry.Path)){
      if($CanonicalPass){throw 'Canonical path identity unstable'}
      $canonical=Fence-Directory $entry.Path $true
      foreach($h in $handles){$h.Dispose()}
      return $canonical
    }
    return [pscustomobject]@{Path=$entry.Path;Key=$entry.Key;ParentKey=$parentKey;Ancestors=$ancestors.ToArray();Handles=$handles.ToArray()}
  }catch{foreach($h in $handles){$h.Dispose()};throw}
}
function New-FencedDirectory($Parent,[string]$Leaf){
  Check-Budget
  if($Leaf -notmatch '^[A-Za-z0-9._-]{1,180}$' -or $Leaf -in @('.','..')){throw 'Unsafe new directory name'}
  $path=Join-Path $Parent.Path $Leaf
  [XeniosQualificationFenceV2]::CreateNewDirectory($path)
  $fence=Fence-Directory $path
  if($fence.ParentKey -ne $Parent.Key){Dispose-Fence $fence;throw 'New directory crossed physical boundary'}
  return $fence
}
function Open-HeldJson($Parent,[string]$Leaf,[long]$MaxBytes){
  Check-Budget
  if($Leaf -notmatch '^[A-Za-z0-9._-]+$' -or $Leaf -in @('.','..')){throw 'Unsafe JSON leaf'}
  $entry=$null;$stream=$null;$reader=$null
  try{
    $entry=[XeniosQualificationFenceV2]::Open((Join-Path $Parent.Path $Leaf),$false,$true)
    if(-not(Same-Path ([IO.Path]::GetDirectoryName($entry.Path)) $Parent.Path) -or $entry.Length -gt $MaxBytes){throw 'JSON boundary or size refused'}
    $stream=[IO.FileStream]::new($entry.Handle,[IO.FileAccess]::Read)
    $reader=[IO.StreamReader]::new($stream,$utf8,$true,4096,$true)
    $text=$reader.ReadToEnd();$reader.Dispose();$reader=$null;$stream.Position=0
    $value=ConvertFrom-Json -InputObject $text
    return [pscustomobject]@{Entry=$entry;Stream=$stream;Value=$value}
  }catch{if($reader){$reader.Dispose()};if($stream){$stream.Dispose()}elseif($entry){$entry.Handle.Dispose()};throw}
}
function Write-NewJson($Parent,[string]$Leaf,$Value){
  $file=[IO.FileStream]::new((Join-Path $Parent.Path $Leaf),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try{$bytes=$utf8.GetBytes(($Value|ConvertTo-Json -Depth 14));$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
}
function Invoke-GuardCommand([string]$File,[string[]]$Arguments,[string]$WorkingDirectory){
  Check-Budget
  $process=[Diagnostics.Process]::new();$started=$false
  $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$File;$info.WorkingDirectory=$WorkingDirectory
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.EnvironmentVariables.Remove('NODE_OPTIONS')
  foreach($argument in $Arguments){$info.ArgumentList.Add($argument)}
  $process.StartInfo=$info
  $record=[ordered]@{kind='setup_guard';pid=$null;birth=$null;exited=$false;exitCode=$null}
  try{
    $started=$process.Start();if(-not $started){throw 'Guard launch failed'}
    $record.pid=$process.Id;$null=$process.Handle;$record.birth=$process.StartTime.ToUniversalTime().ToString('o')
    $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
    $end=[math]::Min(600,$watch.Elapsed.TotalSeconds+8)
    while(-not $process.HasExited){if($watch.Elapsed.TotalSeconds -ge $end){throw 'Guard command timeout'};Start-Sleep -Milliseconds 20}
    if(-not $out.Wait(1000) -or -not $err.Wait(1000)){throw 'Guard pipe incomplete'}
    $stdout=$out.GetAwaiter().GetResult();$stderr=$err.GetAwaiter().GetResult()
    if($process.ExitCode -ne 0 -or $stdout.Length -gt 65536 -or $stderr.Length -gt 65536){throw 'Guard command refused'}
    return $stdout.Trim()
  }finally{
    try{if($started -and -not $process.HasExited){$process.Kill();$null=$process.WaitForExit(1000)}
      if($started){$record.exited=$process.HasExited;if($record.exited){$record.exitCode=$process.ExitCode}}}
    finally{$guardCommands.Add($record);$process.Dispose()}
  }
}
function Stop-Known{
  # Root fallback is an actual Process returned by Start, even if registration failed.
  foreach($record in @($owned.Values|Sort-Object birthTicks -Descending)){
    try{if(-not $record.process.HasExited){$record.process.Kill();$record.killed=$true}}catch{Note-Error 'stop_known' $_.Exception}
  }
  if($runner){try{if(-not $runner.HasExited){$runner.Kill()}}catch{Note-Error 'stop_root' $_.Exception}}
}
function Restore-RunEnvironment{
  $complete=$true
  foreach($key in $environmentKeys){
    try{$prior=$environmentBefore[$key];if($prior.Present){[Environment]::SetEnvironmentVariable($key,$prior.Value,'Process')}else{[Environment]::SetEnvironmentVariable($key,$null,'Process')}}
    catch{$complete=$false;Note-Error 'environment_restore' $_.Exception}
  }
  $script:environmentRestored=$complete
}
function Dispose-OwnedResources{
  if($script:resourcesDisposed){return}
  Stop-Known
  foreach($item in @($outWriter,$errWriter)){if($item){try{$item.Dispose()}catch{Note-Error 'stream_dispose' $_.Exception}}}
  foreach($item in $heldJson){try{$item.Stream.Dispose()}catch{Note-Error 'json_dispose' $_.Exception}}
  foreach($entry in $owned.Values){try{$entry.process.Dispose()}catch{Note-Error 'process_dispose' $_.Exception}}
  if($runner){try{$runner.Dispose()}catch{Note-Error 'root_dispose' $_.Exception}}
  $script:resourcesDisposed=$true
}
function Capture-Owned([double]$Limit){
  Check-Budget $Limit
  $at=[DateTime]::UtcNow
  try{$snapshot=@(Get-CimInstance Win32_Process -OperationTimeoutSec 3|Select-Object ProcessId,ParentProcessId,CreationDate,Name)}
  catch{Note-Error 'capture' $_.Exception;return}
  $captures.Add([ordered]@{at=$at.ToString('o');milliseconds=([DateTime]::UtcNow-$at).TotalMilliseconds})
  $changed=$true
  while($changed -and $watch.Elapsed.TotalSeconds -lt $Limit){
    $changed=$false
    foreach($entry in $snapshot){
      if($watch.Elapsed.TotalSeconds -ge $Limit){break}
      $childId=[int]$entry.ProcessId;$parentId=[int]$entry.ParentProcessId
      if($owned.ContainsKey($childId) -or -not $owned.ContainsKey($parentId) -or -not $entry.CreationDate){continue}
      $parent=$owned[$parentId];$cimBirth=$entry.CreationDate.ToUniversalTime()
      if($cimBirth.Ticks -lt $parent.birthTicks){continue}
      $actual=$null
      try{
        if($parent.process.HasExited -and $cimBirth.Ticks -gt $parent.process.ExitTime.ToUniversalTime().Ticks){continue}
        $actual=[Diagnostics.Process]::GetProcessById($childId);$null=$actual.Handle;$birth=$actual.StartTime.ToUniversalTime()
        if([decimal]::Floor(([decimal]$birth.Ticks)/10) -ne [decimal]::Floor(([decimal]$cimBirth.Ticks)/10)){$actual.Dispose();continue}
        $owned[$childId]=[ordered]@{process=$actual;pid=$childId;parentPid=$parentId;birth=$birth.ToString('o');birthTicks=$birth.Ticks;cimBirth=$cimBirth.ToString('o');name=$entry.Name;killed=$false;root=$false}
        $actual=$null;$changed=$true
      }catch{if($actual){$actual.Dispose()}}
    }
  }
}
function Pump-Streams{
  if($outTask -and -not $script:outDone -and $outTask.IsCompleted){
    $n=$outTask.GetAwaiter().GetResult()
    if($n -eq 0){$script:outDone=$true}else{$text=[string]::new($outChars,0,$n);$outWriter.Write($text);[Console]::Out.Write($text);$script:tap+=$text;$script:outTask=$runner.StandardOutput.ReadAsync($outChars,0,$outChars.Length)}
  }
  if($errTask -and -not $script:errDone -and $errTask.IsCompleted){
    $n=$errTask.GetAwaiter().GetResult()
    if($n -eq 0){$script:errDone=$true}else{$text=[string]::new($errChars,0,$n);$errWriter.Write($text);[Console]::Error.Write($text);$script:errTask=$runner.StandardError.ReadAsync($errChars,0,$errChars.Length)}
  }
}
function Copy-PinnedTree($Source,$Destination,$Seen){
  Check-Budget
  foreach($path in [IO.Directory]::EnumerateFileSystemEntries($Source.Path)){
    Check-Budget
    Set-DiagnosticStage 'fixtures.copy.entry_metadata'
    # Attributes are read from a no-follow handle, before any content.
    $metadata=$null
    try{
      # Directory.Open versus File.Open is chosen by no-follow metadata attributes.
      $attrs=[IO.File]::GetAttributes($path)
      if($attrs -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse entry refused'}
      $isDirectory=($attrs -band [IO.FileAttributes]::Directory) -ne 0
      if($isDirectory){
        Set-DiagnosticStage 'fixtures.copy.source_directory_fence'
        $child=Fence-Directory $path
        if($child.ParentKey -ne $Source.Key -or -not $Seen.Add($child.Key)){Dispose-Fence $child;throw 'Directory alias/boundary refused'}
        $pins.Add($child)
        Set-DiagnosticStage 'fixtures.copy.destination_directory'
        $dest=New-FencedDirectory $Destination ([IO.Path]::GetFileName($child.Path));$pins.Add($dest)
        Copy-PinnedTree $child $dest $Seen
      }else{
        Set-DiagnosticStage 'fixtures.copy.source_file_open'
        $metadata=[XeniosQualificationFenceV2]::Open($path,$false,$true)
        if(-not(Same-Path ([IO.Path]::GetDirectoryName($metadata.Path)) $Source.Path) -or -not $Seen.Add($metadata.Key)){throw 'File alias/boundary refused'}
        $sourceStream=[IO.FileStream]::new($metadata.Handle,[IO.FileAccess]::Read)
        $output=$null
        try{
          Set-DiagnosticStage 'fixtures.copy.destination_file'
          $output=[IO.FileStream]::new((Join-Path $Destination.Path ([IO.Path]::GetFileName($metadata.Path))),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
          $buffer=[byte[]]::new(65536)
          Set-DiagnosticStage 'fixtures.copy.file_bytes'
          while(($n=$sourceStream.Read($buffer,0,$buffer.Length)) -gt 0){Check-Budget;$output.Write($buffer,0,$n)}
          $output.Flush($true)
        }finally{if($output){$output.Dispose()};$sourceStream.Dispose()}
      }
    }finally{if($metadata){$metadata.Handle.Dispose()}}
  }
}
function Supervisor-Matches($Identity){
  return $Identity -and $Identity.nonce -ceq $nonce -and $Identity.allocation -ceq $AllocationId -and (Same-Path $Identity.artifactRoot $artifactFence.Path)
}
function Read-OwnedFixtures($TempFences){
  $found=[Collections.Generic.List[object]]::new();$foreign=[Collections.Generic.List[object]]::new()
  $physical=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $ids=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $scenarios=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $ordinal=0
  foreach($temp in $TempFences){
    Check-Budget
    Set-DiagnosticStage 'fixtures.inventory.enumerate'
    foreach($path in [IO.Directory]::EnumerateDirectories($temp.Path,'xenios-coordination-candidate-*')){
      Check-Budget
      $ordinal++
      $fence=$null;$marker=$null;$retain=$false
      try{
        Set-DiagnosticStage 'fixtures.inventory.root_fence'
        $fence=Fence-Directory $path
        Set-DiagnosticStage 'fixtures.inventory.parent_binding'
        if($fence.ParentKey -ne $temp.Key){throw 'Fixture not direct physical temp child'}
        Set-DiagnosticStage 'fixtures.inventory.marker_open'
        $marker=Open-HeldJson $fence 'fixture-owner.json' 65536
        Set-DiagnosticStage 'fixtures.inventory.supervisor_binding'
        if($marker.Value.kind -cne 'xenios-coordination-candidate-v1' -or -not(Supervisor-Matches $marker.Value.supervisor)){
          $foreign.Add([ordered]@{path=$fence.Path;physicalKey=$fence.Key;reason='foreign_marker'});continue
        }
        Set-DiagnosticStage 'fixtures.inventory.fixture_identity'
        if($marker.Value.runId -cnotmatch $uuid -or -not $marker.Value.scenario){throw 'Invalid owned fixture identity'}
        if(-not $physical.Add($fence.Key) -or -not $ids.Add($marker.Value.runId) -or -not $scenarios.Add($marker.Value.scenario)){throw 'Duplicate fixture identity/scenario'}
        $pins.Add($fence);$heldJson.Add($marker);$retain=$true
        $receipt=$null
        Set-DiagnosticStage 'fixtures.inventory.receipt_open'
        try{$receipt=Open-HeldJson $fence 'receipt.json' 33554432;$heldJson.Add($receipt)}catch{if([IO.File]::Exists((Join-Path $fence.Path 'receipt.json'))){throw}}
        if($receipt){
          Set-DiagnosticStage 'fixtures.inventory.receipt_binding'
          $value=$receipt.Value
          $bindingPredicates=[ordered]@{
            kind=($value.kind -ceq $marker.Value.kind);runId=($value.runId -ceq $marker.Value.runId)
            scenario=($value.scenario -ceq $marker.Value.scenario);supervisor=(Supervisor-Matches $value.supervisor)
            rootLexical=(Same-Path $value.root $fence.Path);allOwnedChildrenExited=($value.allOwnedChildrenExited -eq $true)
          }
          $bindingEvent=[ordered]@{ordinal=$ordinal;outcome='receipt_binding_predicates';runId=$marker.Value.runId;predicates=$bindingPredicates}
          $fixtureDiagnostics.Add($bindingEvent)
          try{[Console]::Error.WriteLine('XENIOS_SUPERVISOR_BINDING '+($bindingEvent|ConvertTo-Json -Depth 5 -Compress))}catch{}
          if($value.kind -cne $marker.Value.kind -or $value.runId -cne $marker.Value.runId -or $value.scenario -cne $marker.Value.scenario -or -not(Supervisor-Matches $value.supervisor) -or -not(Same-Path $value.root $fence.Path) -or $value.allOwnedChildrenExited -ne $true){throw 'Fixture receipt identity/exit claim mismatch'}
          Set-DiagnosticStage 'fixtures.inventory.process_exit_claims'
          if($value.processes.Count -lt 1){throw 'Empty completed fixture receipt'}
          foreach($process in $value.processes){if($process.exited -ne $true -or $process.completeOutput -ne $true -or $process.pid -le 0 -or $process.invocationId -cnotmatch $uuid -or -not $process.finishedAt -or ($null -eq $process.exitCode -and -not $process.signal)){throw 'Invalid fixture process exit claim'}}
        }
        $found.Add([pscustomobject]@{Fence=$fence;Marker=$marker;Receipt=$receipt})
        $fixtureDiagnostics.Add([ordered]@{ordinal=$ordinal;outcome='owned_marker_validated';runId=$marker.Value.runId;completedReceipt=($null -ne $receipt)})
      }catch{
        $fixtureDiagnostics.Add([ordered]@{ordinal=$ordinal;outcome='inventory_refused';substage=$script:diagnosticStage;error=(Error-Metadata $_.Exception)})
        $foreign.Add([ordered]@{path=$path;reason='untrusted_or_incomplete_boundary';error=$_.Exception.GetType().FullName})
        if($marker -and (Supervisor-Matches $marker.Value.supervisor)){throw}
      }finally{
        if(-not $retain){if($marker){$marker.Stream.Dispose()};Dispose-Fence $fence}
      }
    }
  }
  return [pscustomobject]@{Owned=$found.ToArray();Untrusted=$foreign.ToArray()}
}

$phaseStart=$null;$nodePath=$null;$gitPath=$null;$repoFence=$null;$tempFences=@()
$record=[ordered]@{schemaVersion=2;allocation=$AllocationId;sourceSha=$ExpectedSourceSha;supervisorNonce=$nonce;qualified=$false;errors=@();fixtures=@();untrustedPaths=@();incompleteArtifacts=$true}
try{
  Set-DiagnosticStage 'setup.source_fence'
  $repoFence=Fence-Directory ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..')));$pins.Add($repoFence)
  if(-not $OutputParentDirectory){$OutputParentDirectory=[IO.Path]::GetTempPath()}
  Set-DiagnosticStage 'setup.artifact_parent_fence'
  $parent=Fence-Directory $OutputParentDirectory;$pins.Add($parent)
  if($parent.Ancestors -contains $repoFence.Key -or (Same-Path $parent.Path $repoFence.Path) -or $parent.Path.StartsWith($repoFence.Path+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact parent routes into source checkout'}
  Set-DiagnosticStage 'setup.artifact_directory'
  $artifactFence=New-FencedDirectory $parent ('xenios-coordination-run-'+$nonce);$pins.Add($artifactFence);$runDirectory=$artifactFence.Path
  Write-NewJson $artifactFence 'run-owner.json' ([ordered]@{kind='xenios-finite-qualification-monitor-v2';nonce=$nonce;allocation=$AllocationId;sourceSha=$ExpectedSourceSha;artifactRoot=$artifactFence.Path;monitorPid=$PID;createdAt=[DateTime]::UtcNow.ToString('o')})
  Set-DiagnosticStage 'setup.executable_paths'
  $nodeCommand=Get-Command node -CommandType Application -ErrorAction Stop|Select-Object -First 1
  $gitCommand=Get-Command git -CommandType Application -ErrorAction Stop|Select-Object -First 1
  $nodePath=[string]$nodeCommand.Path;$gitPath=[string]$gitCommand.Path
  if([string]::IsNullOrWhiteSpace($nodePath) -or [string]::IsNullOrWhiteSpace($gitPath) -or -not[IO.Path]::IsPathFullyQualified($nodePath) -or -not[IO.Path]::IsPathFullyQualified($gitPath) -or -not[IO.File]::Exists($nodePath) -or -not[IO.File]::Exists($gitPath)){throw 'Scalar application path required'}
  $record.nodePath=$nodePath;$record.gitPath=$gitPath
  Set-DiagnosticStage 'setup.node_version'
  $nodeVersion=Invoke-GuardCommand $nodePath @('--version') $repoFence.Path
  if($nodeVersion -cne 'v20.19.0'){throw 'Exact Node20.19.0 required'}
  Set-DiagnosticStage 'setup.source_guard'
  $head=Invoke-GuardCommand $gitPath @('-C',$repoFence.Path,'rev-parse','HEAD') $repoFence.Path
  $dirty=Invoke-GuardCommand $gitPath @('-C',$repoFence.Path,'status','--porcelain') $repoFence.Path
  if($head -cne $ExpectedSourceSha -or $dirty){throw 'Exact clean source required'}
  Set-DiagnosticStage 'setup.plan_open'
  $planFence=Fence-Directory (Join-Path $repoFence.Path 'scripts/agentic/coordination-qualification');$pins.Add($planFence)
  $planHeld=Open-HeldJson $planFence 'candidate-qualification-plan.json' 1048576;$heldJson.Add($planHeld);$plan=$planHeld.Value
  if($ExpectedCaseCount -eq 0){$ExpectedCaseCount=[int]$plan.acceptance.candidateTestCases}
  if($ExpectedCaseCount -ne [int]$plan.acceptance.candidateTestCases -or $ExpectedCaseCount -lt 1){throw 'Source case count mismatch'}
  $tempKeys=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  Set-DiagnosticStage 'setup.temp_fences'
  foreach($path in @($env:TEMP,$env:TMP,([IO.Path]::GetTempPath()))|Select-Object -Unique){
    if(-not $path){continue};$temp=Fence-Directory $path
    if($tempKeys.Add($temp.Key)){$pins.Add($temp);$tempFences+=,$temp}else{Dispose-Fence $temp}
  }
  Set-DiagnosticStage 'setup.ram_observations'
  $memory=1..3|ForEach-Object{Check-Budget;$os=Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 3;[ordered]@{at=[DateTime]::UtcNow.ToString('o');freeMiB=[math]::Floor($os.FreePhysicalMemory/1024)};Start-Sleep -Milliseconds 200}
  Write-NewJson $artifactFence 'preflight.json' ([ordered]@{nodePath=$nodePath;gitPath=$gitPath;nodeVersion=$nodeVersion;ram=$memory})
  if(@($memory|Where-Object{$_.freeMiB -lt 700}).Count){throw 'Fresh RAM failed'}
  $stdoutPath=Join-Path $artifactFence.Path 'candidate.stdout.log';$stderrPath=Join-Path $artifactFence.Path 'candidate.stderr.log'
  $receiptPath=Join-Path $artifactFence.Path 'candidate.qualification.json'
  $record.stdout=$stdoutPath;$record.stderr=$stderrPath;$record.suiteReceipt=$receiptPath
  Set-DiagnosticStage 'setup.output_streams'
  $outWriter=[IO.StreamWriter]::new([IO.FileStream]::new($stdoutPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read),$utf8);$outWriter.AutoFlush=$true
  $errWriter=[IO.StreamWriter]::new([IO.FileStream]::new($stderrPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read),$utf8);$errWriter.AutoFlush=$true
  [Environment]::SetEnvironmentVariable($environmentKeys[0],$receiptPath,'Process')
  [Environment]::SetEnvironmentVariable($environmentKeys[1],$nonce,'Process')
  [Environment]::SetEnvironmentVariable($environmentKeys[2],$artifactFence.Path,'Process')
  [Environment]::SetEnvironmentVariable($environmentKeys[3],$AllocationId,'Process')
  $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$nodePath;$info.WorkingDirectory=$repoFence.Path
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.EnvironmentVariables.Remove('NODE_OPTIONS')
  $info.StandardOutputEncoding=$utf8;$info.StandardErrorEncoding=$utf8
  foreach($arg in @('--max-old-space-size=384','--test','--test-concurrency=1','scripts/agentic/corpus-store.node-test.mjs')){$info.ArgumentList.Add($arg)}
  Check-Budget 570
  # The governing try is already active before Start. Nothing after successful
  # launch, including Handle/StartTime/streams/artifacts, can bypass finally.
  Set-DiagnosticStage 'run.launch'
  $runner=[Diagnostics.Process]::Start($info)
  $phaseStart=[DateTime]::UtcNow;$record.runnerPid=$runner.Id
  $null=$runner.Handle;$birth=$runner.StartTime.ToUniversalTime()
  $owned[$runner.Id]=[ordered]@{process=$runner;pid=$runner.Id;parentPid=$null;birth=$birth.ToString('o');birthTicks=$birth.Ticks;cimBirth=$null;name='node';root=$true;killed=$false}
  $outChars=[char[]]::new(4096);$errChars=[char[]]::new(4096)
  $outTask=$runner.StandardOutput.ReadAsync($outChars,0,$outChars.Length);$errTask=$runner.StandardError.ReadAsync($errChars,0,$errChars.Length)
  $nextCapture=0
  while($watch.Elapsed.TotalSeconds -lt 570){
    Set-DiagnosticStage 'run.stream_pump'
    Pump-Streams
    if($tap -match '(?m)^not ok [^\r\n]+'){$firstFailure=$Matches[0];$firstFailureObservedAt=[DateTime]::UtcNow.ToString('o');$stopReason='first_test_failure';break}
    if($outDone -and $errDone -and $runner.HasExited){break}
    if($watch.ElapsedMilliseconds -ge $nextCapture){Set-DiagnosticStage 'run.capture_owned';Capture-Owned 570;$nextCapture=$watch.ElapsedMilliseconds+700}
    if($errors.Count){$stopReason='ownership_observation_failed';break}
    Start-Sleep -Milliseconds 20
  }
  if(-not($outDone -and $errDone -and $runner.HasExited) -and -not $stopReason){$stopReason='supervision_deadline'}
}catch{
  $stopReason=if($stopReason){$stopReason}else{'setup_or_monitor_failure'};Note-Error 'run' $_.Exception
}finally{
  try{
    # Always stop actual retained known objects before a potentially slow sweep.
    Set-DiagnosticStage 'finalize.stop_known_before_capture'
    Stop-Known
    Set-DiagnosticStage 'finalize.capture_owned'
    if($runner -and $watch.Elapsed.TotalSeconds -lt 592){try{Capture-Owned 595}catch{Note-Error 'cleanup_capture' $_.Exception}}
    Set-DiagnosticStage 'finalize.stop_known_after_capture'
    Stop-Known
    Set-DiagnosticStage 'finalize.stream_drain'
    while($watch.Elapsed.TotalSeconds -lt 600){
      $live=@($owned.Values|Where-Object{-not $_.process.HasExited})
      try{Pump-Streams}catch{Note-Error 'drain' $_.Exception;break}
      $streamsSettled=((-not $outTask -or $outDone) -and (-not $errTask -or $errDone))
      if(-not $live.Count -and (-not $runner -or $runner.HasExited) -and $streamsSettled){break}
      Start-Sleep -Milliseconds 20
    }
    Set-DiagnosticStage 'finalize.close_streams'
    if($outWriter){try{$outWriter.Dispose()}catch{Note-Error 'stdout_close' $_.Exception};$outWriter=$null}
    if($errWriter){try{$errWriter.Dispose()}catch{Note-Error 'stderr_close' $_.Exception};$errWriter=$null}
    Set-DiagnosticStage 'finalize.process_exit_projection'
    $processRecords=@($owned.Values|ForEach-Object{[ordered]@{pid=$_.pid;parentPid=$_.parentPid;birth=$_.birth;cimBirth=$_.cimBirth;name=$_.name;root=$_.root;killed=$_.killed;exited=$_.process.HasExited;exitCode=if($_.process.HasExited){$_.process.ExitCode}else{$null}}})
    $record.processes=$processRecords;$record.guardCommands=$guardCommands.ToArray()
    $record.runnerExited=if($runner){$runner.HasExited}else{$null};$record.runnerExitCode=if($runner -and $runner.HasExited){$runner.ExitCode}else{$null}
    $record.allCapturedOwnedProcessesExited=(@($processRecords|Where-Object{-not $_.exited}).Count -eq 0 -and (-not $runner -or $runner.HasExited))
    $record.streamsComplete=($outDone -and $errDone)
    $record.observedPassed=[regex]::Matches($tap,'(?m)^ok \d+ - ').Count
    $record.observedFailed=[regex]::Matches($tap,'(?m)^not ok \d+ - ').Count
    $record.observedSkipped=[regex]::Matches($tap,'(?m)^(?:not )?ok \d+ - [^\r\n]*# SKIP').Count
    $suite=$null
    Set-DiagnosticStage 'finalize.suite_receipt_open'
    if($artifactFence -and $watch.Elapsed.TotalSeconds -lt 600 -and [IO.File]::Exists((Join-Path $artifactFence.Path 'candidate.qualification.json'))){
      $suiteHeld=Open-HeldJson $artifactFence 'candidate.qualification.json' 33554432;$heldJson.Add($suiteHeld);$suite=$suiteHeld.Value
    }
    $manifestValid=$false
    if($suite){
      Set-DiagnosticStage 'finalize.suite_binding'
      if(-not(Supervisor-Matches $suite.supervisor) -or $suite.allCasesPassed -ne $true -or $suite.definedCases -ne $ExpectedCaseCount -or $suite.cases.Count -ne $ExpectedCaseCount -or $suite.sourceBefore.sourceSha -cne $ExpectedSourceSha -or $suite.sourceAfter.sourceSha -cne $ExpectedSourceSha){throw 'Suite identity/status mismatch'}
      $manifestValid=$true
    }
    if($artifactFence -and $watch.Elapsed.TotalSeconds -lt 600){
      Set-DiagnosticStage 'fixtures.inventory.start'
      $inventory=Read-OwnedFixtures $tempFences;$record.untrustedPaths=$inventory.Untrusted
      $copies=[Collections.Generic.List[object]]::new()
      $manifestRoots=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
      $manifestIds=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
      $manifestNames=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
      if($suite){
        Set-DiagnosticStage 'fixtures.manifest_binding'
        foreach($case in $suite.cases){
          Check-Budget
          $match=@($inventory.Owned|Where-Object{$_.Marker.Value.runId -ceq $case.runId -and $_.Marker.Value.scenario -ceq $case.name})
          if($match.Count -ne 1 -or -not $match[0].Receipt -or $case.result -cne 'PASS' -or $case.allOwnedChildrenExited -ne $true){throw 'Case manifest/receipt mismatch'}
          $fixture=$match[0]
          if(-not(Same-Path $case.fixtureRoot $fixture.Fence.Path) -or -not(Same-Path $case.processReceipt $fixture.Receipt.Entry.Path) -or -not $manifestRoots.Add($fixture.Fence.Key) -or -not $manifestIds.Add($case.runId) -or -not $manifestNames.Add($case.name)){throw 'Duplicate or aliased manifest case'}
        }
        if($inventory.Owned.Count -ne $ExpectedCaseCount){throw 'Fixture set differs from manifest'}
      }
      foreach($fixture in $inventory.Owned){
        Check-Budget
        Set-DiagnosticStage 'fixtures.copy.destination_root'
        $dest=New-FencedDirectory $artifactFence ('fixture-'+$fixture.Marker.Value.runId);$pins.Add($dest)
        $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal);$null=$seen.Add($fixture.Fence.Key)
        Copy-PinnedTree $fixture.Fence $dest $seen
        $copies.Add([ordered]@{root=$fixture.Fence.Path;physicalKey=$fixture.Fence.Key;runId=$fixture.Marker.Value.runId;scenario=$fixture.Marker.Value.scenario;destination=$dest.Path;completedReceipt=($null -ne $fixture.Receipt)})
      }
      $record.fixtures=$copies.ToArray();$artifactIncomplete=$false
    }else{$artifactIncomplete=$true}
    if($repoFence -and $watch.Elapsed.TotalSeconds -lt 598){
      Set-DiagnosticStage 'finalize.source_after_guard'
      $after=Invoke-GuardCommand $gitPath @('-C',$repoFence.Path,'rev-parse','HEAD') $repoFence.Path
      $dirty=Invoke-GuardCommand $gitPath @('-C',$repoFence.Path,'status','--porcelain') $repoFence.Path
      $sourceUnchanged=($after -ceq $ExpectedSourceSha -and -not $dirty)
    }
    $qualified=($null -eq $stopReason -and $errors.Count -eq 0 -and $record.runnerExitCode -eq 0 -and $record.streamsComplete -and $record.allCapturedOwnedProcessesExited -and $sourceUnchanged -and $manifestValid -and -not $artifactIncomplete -and $record.observedPassed -eq $ExpectedCaseCount -and $record.observedFailed -eq 0 -and $record.observedSkipped -eq 0 -and $record.fixtures.Count -eq $ExpectedCaseCount -and $watch.Elapsed.TotalSeconds -lt 600)
  }catch{
    $qualified=$false;$artifactIncomplete=$true;Note-Error 'finalize' $_.Exception
  }finally{
    try{
      Set-DiagnosticStage 'finalize.dispose_owned'
      Dispose-OwnedResources
      Set-DiagnosticStage 'finalize.restore_environment'
      Restore-RunEnvironment
      if($errors.Count -or -not $environmentRestored){$qualified=$false}
      $record.qualified=$qualified;$record.errors=$errors.ToArray();$record.captures=$captures.ToArray();$record.stopReason=$stopReason
      $record.fixtureInventoryDiagnostics=$fixtureDiagnostics.ToArray()
      $record.firstFailure=$firstFailure;$record.firstFailureObservedAt=$firstFailureObservedAt
      $record.sourceUnchanged=$sourceUnchanged;$record.incompleteArtifacts=$artifactIncomplete
      $record.environmentRestored=$environmentRestored;$record.ownedResourcesDisposed=$resourcesDisposed
      $record.expectedCases=$ExpectedCaseCount;$record.phaseStartedAt=if($phaseStart){$phaseStart.ToString('o')}else{$null}
      $record.finishedAt=[DateTime]::UtcNow.ToString('o');$record.overallMilliseconds=$watch.ElapsedMilliseconds
      $record.limits=@('Synchronous CIM may delay failure observation; later incomplete cases may have started.','Uncaptured already-exited fast children are not individually proved.','Overall budget600s:570supervision,30cleanup; OS/filesystem stalls still require an outer CI job timeout.')
      Set-DiagnosticStage 'finalize.terminal_receipt'
      if($artifactFence){Write-NewJson $artifactFence 'candidate.monitor.json' $record;Write-Output ('MONITOR RECEIPT '+(Join-Path $artifactFence.Path 'candidate.monitor.json'))}
    }catch{$qualified=$false;Note-Error 'terminal_receipt' $_.Exception;[Console]::Error.WriteLine('Terminal receipt incomplete')}
    finally{
      try{
        if(-not $resourcesDisposed){Dispose-OwnedResources}
      }finally{
        try{if(-not $environmentRestored){Restore-RunEnvironment}}
        finally{for($i=$pins.Count-1;$i -ge 0;$i--){Dispose-Fence $pins[$i]}}
      }
    }
  }
}
if(-not $qualified){exit 1}
