Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'kan31-pre-dispatch-comparison.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('kan31-comparison-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$script:passed=0
$script:dispatches=0
function Assert-Offline($Condition,[string]$Code) {if(-not $Condition) {throw $Code}}
function Invoke-OfflineCase([string]$Name,[scriptblock]$Action) {
    & $Action
    $script:passed++
    Write-Output "PASS $Name"
}
function Save-OfflineJson([string]$Name,$Object) {
    $file=Join-Path $root $Name
    [IO.File]::WriteAllText($file,($Object | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
    return $file
}
function Pin-Offline([string]$Path) {return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
try {
    $now=[DateTimeOffset]::Parse('2026-10-17T03:00:00Z')
    $app='8efa9a9ef4e94773c446e7fa2a17cf00c6592d85'
    $tree='0c92fdc66b122c5128d3904936c85ba9c912a5cc'
    $source='032ec068e3102c9f04bb194dc6c261e02b5e6f73'
    $baseProof=[ordered]@{appSha=$app;appTree=$tree;serviceId='srv-d9h4f4m7r5hc73ctjng0';origin='https://xenios-research-staging.onrender.com';
        deployId='old';status='live';providerOnlyBasisAccepted=$true;authorizationReference='old';publicStagingWindowReference='old';observedAt='2026-10-17T02:00:00Z'}
    $baseManifest=[ordered]@{appSha=$app;appTree=$tree;workflowSourceCommit=$source;deployId='old';providerProofSha256=('0'*64);
        executionAuthorization='old';expiresAt='2026-10-17T03:00:00Z';
        publicModeWindow=[ordered]@{startsAt='2026-10-17T02:00:00Z';endsAt='2026-10-17T04:00:00Z'};
        limits=[ordered]@{maxPosts=40};cases=@(@{label='one'},@{label='two'})}
    $am=Save-OfflineJson 'accepted-manifest.json' $baseManifest
    $ap=Save-OfflineJson 'accepted-proof.json' $baseProof
    $params=@{AcceptedManifestPath=$am;AcceptedManifestSha256=(Pin-Offline $am);AcceptedProofPath=$ap;AcceptedProofSha256=(Pin-Offline $ap);
        ObservedMainSha=$source;Now=$now;ProviderReceipt=@{commit=$app;status='live';serviceId='srv-d9h4f4m7r5hc73ctjng0';
        deployId='new';startedAt='2026-10-17T02:58:00Z';finishedAt='2026-10-17T02:59:00Z'}}
    function New-OfflineInputs {
        $p=$baseProof | ConvertTo-Json -Depth 20 | ConvertFrom-Json
        $p.deployId='new';$p.observedAt='2026-10-17T02:59:30Z';$p.authorizationReference='NEW_APPROVAL';$p.publicStagingWindowReference='NEW_WINDOW'
        $pf=Save-OfflineJson 'proof.json' $p
        $m=$baseManifest | ConvertTo-Json -Depth 20 | ConvertFrom-Json
        $m.deployId='new';$m.providerProofSha256=Pin-Offline $pf;$m.executionAuthorization='NEW_APPROVAL'
        $m.publicModeWindow.startsAt='2026-10-17T02:58:00Z';$m.publicModeWindow.endsAt='2026-10-17T06:58:00Z';$m.expiresAt='2026-10-17T03:30:00Z'
        return @{m=$m;p=$p}
    }
    function Invoke-OfflineCheck($Inputs,$Override=@{}) {
        $q=$params.Clone()
        $q.ManifestPath=Save-OfflineJson 'manifest.json' $Inputs.m
        $q.ManifestSha256=Pin-Offline $q.ManifestPath
        $q.ProofPath=Save-OfflineJson 'proof.json' $Inputs.p
        $q.ProofSha256=Pin-Offline $q.ProofPath
        foreach($k in $Override.Keys) {$q[$k]=$Override[$k]}
        return Test-Kan31DispatchComparison @q
    }
    function Assert-Refused($Inputs,$Override=@{}) {
        $before=$script:dispatches;$refused=$false
        try {
            $r=Invoke-OfflineCheck $Inputs $Override
            if($r.comparison -ceq 'PASS_SAME_KEYSETS_ONLY_ALLOWED_VALUE_CHANGES') {$script:dispatches++}
        } catch {$refused=$true}
        Assert-Offline $refused 'DID_NOT_REFUSE'
        Assert-Offline ($script:dispatches -eq $before) 'DISPATCH_REACHED'
    }
    Invoke-OfflineCase 'valid comparison enumerates changed fields and binds exact hashes' {
        $i=New-OfflineInputs;$r=Invoke-OfflineCheck $i
        Assert-Offline ($r.manifestChangedFields.Count -eq 6 -and $r.proofChangedFields.Count -eq 4) 'CHANGES_NOT_ENUMERATED'
        Assert-Offline (-not $r.dispatchAuthorized) 'NO_EXECUTION_AUTHORITY'
    }
    Invoke-OfflineCase 'Diff alias cannot affect uniquely named comparator' {
        Set-Alias -Name Diff -Value Compare-Object -Scope Local
        $r=Invoke-OfflineCheck (New-OfflineInputs)
        Assert-Offline ($r.comparison -ceq 'PASS_SAME_KEYSETS_ONLY_ALLOWED_VALUE_CHANGES') 'ALIAS_COLLISION'
    }
    Invoke-OfflineCase 'unexpected field prevents dispatch' {$i=New-OfflineInputs;$i.m | Add-Member unexpected 1;Assert-Refused $i}
    Invoke-OfflineCase 'changed nested limit prevents dispatch' {$i=New-OfflineInputs;$i.m.limits.maxPosts=41;Assert-Refused $i}
    Invoke-OfflineCase 'changed array element prevents dispatch' {$i=New-OfflineInputs;$i.m.cases[0].label='changed';Assert-Refused $i}
    Invoke-OfflineCase 'case-only key change prevents dispatch' {
        $i=New-OfflineInputs;$v=$i.m.appSha;$i.m.PSObject.Properties.Remove('appSha');$i.m | Add-Member AppSha $v;Assert-Refused $i
    }
    Invoke-OfflineCase 'base/head drift prevents dispatch' {Assert-Refused (New-OfflineInputs) @{ObservedMainSha=('f'*40)}}
    Invoke-OfflineCase 'hash mismatch prevents dispatch' {Assert-Refused (New-OfflineInputs) @{ManifestSha256=('f'*64)}}
    Invoke-OfflineCase 'missing file terminates before dispatch' {Assert-Refused (New-OfflineInputs) @{ManifestPath=(Join-Path $root 'missing')}}
    Invoke-OfflineCase 'empty input terminates before dispatch' {
        $empty=Join-Path $root 'empty';[IO.File]::WriteAllText($empty,'')
        Assert-Refused (New-OfflineInputs) @{ManifestPath=$empty;ManifestSha256=(Pin-Offline $empty)}
    }
    Invoke-OfflineCase 'duplicate JSON keys terminate before dispatch' {
        $dup=Join-Path $root 'duplicate';[IO.File]::WriteAllText($dup,'{"deployId":"a","deployId":"b"}')
        Assert-Refused (New-OfflineInputs) @{ManifestPath=$dup;ManifestSha256=(Pin-Offline $dup)}
    }
    Invoke-OfflineCase 'stale provider proof prevents dispatch' {
        $i=New-OfflineInputs;$i.p.observedAt='2026-10-17T02:57:00Z';Assert-Refused $i
    }
    Invoke-OfflineCase 'oversized public window prevents dispatch' {
        $i=New-OfflineInputs;$i.m.publicModeWindow.endsAt='2026-10-17T07:00:00Z';Assert-Refused $i
    }
    Invoke-OfflineCase 'wrong provider target prevents dispatch' {
        $receipt=$params.ProviderReceipt.Clone();$receipt.serviceId='production-excluded'
        Assert-Refused (New-OfflineInputs) @{ProviderReceipt=$receipt}
    }
    Invoke-OfflineCase 'typed UTC provider dates preserve time identity' {
        $receipt=$params.ProviderReceipt.Clone()
        $receipt.startedAt=[DateTime]::Parse('2026-10-17T02:58:00Z').ToUniversalTime()
        $receipt.finishedAt=[DateTimeOffset]::Parse('2026-10-17T02:59:00Z')
        $r=Invoke-OfflineCheck (New-OfflineInputs) @{ProviderReceipt=$receipt}
        Assert-Offline ($r.comparison -ceq 'PASS_SAME_KEYSETS_ONLY_ALLOWED_VALUE_CHANGES') 'TYPED_UTC'
    }
    Invoke-OfflineCase 'ambiguous provider time prevents dispatch' {
        $receipt=$params.ProviderReceipt.Clone();$receipt.startedAt='2026-10-17T02:58:00'
        Assert-Refused (New-OfflineInputs) @{ProviderReceipt=$receipt}
    }
    Write-Output "SUMMARY: $script:passed PASS; mock dispatches=$script:dispatches; actual dispatches=0"
} finally {
    # Only this test's freshly generated, exact private scratch folder.
    [IO.Directory]::Delete($root,$true)
}
