# Pure offline admission check. This file has no network or dispatch operation.
# Requires the existing PowerShell 7 runtime (System.Text.Json); never falls back.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-Kan31PinnedJson {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Sha256)
    if ($Sha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'INVALID_HASH' }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -eq 0 -or $bytes.Length -gt 32768) { throw 'INPUT_SIZE' }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    if ($actual -cne $Sha256) { throw 'INPUT_HASH' }
    $json = [Text.UTF8Encoding]::new($false,$true).GetString($bytes)
    return [System.Text.Json.JsonDocument]::Parse($json)
}

function Assert-Kan31UniqueKeys {
    param($Node)
    if ($Node.ValueKind -eq [System.Text.Json.JsonValueKind]::Object) {
        $keys = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($p in $Node.EnumerateObject()) {
            if (-not $keys.Add($p.Name)) { throw 'DUPLICATE_KEY' }
            Assert-Kan31UniqueKeys $p.Value
        }
    } elseif ($Node.ValueKind -eq [System.Text.Json.JsonValueKind]::Array) {
        foreach ($v in $Node.EnumerateArray()) { Assert-Kan31UniqueKeys $v }
    }
}

function ConvertTo-Kan31Instant {
    param([Parameter(Mandatory)]$Value)
    if ($Value -is [DateTimeOffset]) { return $Value }
    if ($Value -is [DateTime]) {
        if ($Value.Kind -eq [DateTimeKind]::Unspecified) { throw 'AMBIGUOUS_PROVIDER_TIME' }
        return [DateTimeOffset]$Value
    }
    if ($Value -isnot [string] -or $Value -cnotmatch '(Z|[+-][0-9]{2}:[0-9]{2})$') { throw 'AMBIGUOUS_PROVIDER_TIME' }
    return [DateTimeOffset]::Parse($Value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind)
}

function Compare-Kan31JsonNodeExact {
    param($Base,$Candidate,[string]$Field,$Allowed,$Changes)
    if ($Base.ValueKind -ne $Candidate.ValueKind) { throw 'JSON_TYPE_CHANGED' }
    if ($Base.ValueKind -eq [System.Text.Json.JsonValueKind]::Object) {
        $a = @($Base.EnumerateObject())
        $b = @($Candidate.EnumerateObject())
        if ($a.Count -ne $b.Count) { throw 'KEYSET_CHANGED' }
        foreach ($p in $a) {
            $found = [System.Text.Json.JsonElement]::new()
            if (-not $Candidate.TryGetProperty($p.Name,[ref]$found)) { throw 'KEYSET_CHANGED' }
            $next = if ($Field) { "$Field.$($p.Name)" } else { $p.Name }
            Compare-Kan31JsonNodeExact $p.Value $found $next $Allowed $Changes
        }
    } elseif ($Base.ValueKind -eq [System.Text.Json.JsonValueKind]::Array) {
        if ($Base.GetArrayLength() -ne $Candidate.GetArrayLength()) { throw 'ARRAY_LENGTH_CHANGED' }
        for ($i=0; $i -lt $Base.GetArrayLength(); $i++) {
            Compare-Kan31JsonNodeExact $Base[$i] $Candidate[$i] "$Field[$i]" $Allowed $Changes
        }
    } else {
        $a = if ($Base.ValueKind -eq [System.Text.Json.JsonValueKind]::String) { $Base.GetString() } else { $Base.GetRawText() }
        $b = if ($Candidate.ValueKind -eq [System.Text.Json.JsonValueKind]::String) { $Candidate.GetString() } else { $Candidate.GetRawText() }
        if ($a -cne $b) {
            if (-not $Allowed.Contains($Field)) { throw 'UNAPPROVED_FIELD_CHANGE' }
            $Changes.Add($Field)
        }
    }
}

function Test-Kan31DispatchComparison {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$AcceptedManifestPath,
        [Parameter(Mandatory)][string]$AcceptedManifestSha256,
        [Parameter(Mandatory)][string]$AcceptedProofPath,
        [Parameter(Mandatory)][string]$AcceptedProofSha256,
        [Parameter(Mandatory)][string]$ManifestPath,
        [Parameter(Mandatory)][string]$ManifestSha256,
        [Parameter(Mandatory)][string]$ProofPath,
        [Parameter(Mandatory)][string]$ProofSha256,
        [Parameter(Mandatory)]$ProviderReceipt,
        [Parameter(Mandatory)][string]$ObservedMainSha,
        [Parameter(Mandatory)][DateTimeOffset]$Now
    )
    $ErrorActionPreference = 'Stop'
    $docs = [Collections.Generic.List[IDisposable]]::new()
    try {
        $am = Read-Kan31PinnedJson $AcceptedManifestPath $AcceptedManifestSha256; $docs.Add($am)
        $ap = Read-Kan31PinnedJson $AcceptedProofPath $AcceptedProofSha256; $docs.Add($ap)
        $cm = Read-Kan31PinnedJson $ManifestPath $ManifestSha256; $docs.Add($cm)
        $cp = Read-Kan31PinnedJson $ProofPath $ProofSha256; $docs.Add($cp)
        foreach ($d in $docs) {
            if ($d.RootElement.ValueKind -ne [System.Text.Json.JsonValueKind]::Object) { throw 'OBJECT_REQUIRED' }
            Assert-Kan31UniqueKeys $d.RootElement
        }
        $mf = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($v in @('deployId','publicModeWindow.startsAt','publicModeWindow.endsAt','expiresAt','providerProofSha256','executionAuthorization')) { [void]$mf.Add($v) }
        $pf = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($v in @('deployId','observedAt','authorizationReference','publicStagingWindowReference')) { [void]$pf.Add($v) }
        $mc = [Collections.Generic.List[string]]::new()
        $pc = [Collections.Generic.List[string]]::new()
        Compare-Kan31JsonNodeExact $am.RootElement $cm.RootElement '' $mf $mc
        Compare-Kan31JsonNodeExact $ap.RootElement $cp.RootElement '' $pf $pc
        # Parse only after duplicate/type/keyset checks; never infer success from empty output.
        $m = $cm.RootElement.GetRawText() | ConvertFrom-Json -ErrorAction Stop
        $p = $cp.RootElement.GetRawText() | ConvertFrom-Json -ErrorAction Stop
        $source = '032ec068e3102c9f04bb194dc6c261e02b5e6f73'
        $app = '8efa9a9ef4e94773c446e7fa2a17cf00c6592d85'
        $tree = '0c92fdc66b122c5128d3904936c85ba9c912a5cc'
        if ($ObservedMainSha -cne $source -or $m.workflowSourceCommit -cne $source) { throw 'SOURCE_DRIFT' }
        if ($ProviderReceipt.commit -cne $app -or $ProviderReceipt.status -cne 'live' -or
            $ProviderReceipt.serviceId -cne 'srv-d9h4f4m7r5hc73ctjng0') { throw 'PROVIDER_IDENTITY' }
        if ([string]::IsNullOrWhiteSpace($ProviderReceipt.deployId) -or
            $m.deployId -cne $ProviderReceipt.deployId -or $p.deployId -cne $m.deployId -or
            $m.appSha -cne $app -or $m.appTree -cne $tree -or $p.appSha -cne $app -or $p.appTree -cne $tree -or
            $p.status -cne 'live' -or $p.providerOnlyBasisAccepted -ne $true) { throw 'DEPLOY_BINDING' }
        if ($m.providerProofSha256 -cne $ProofSha256) { throw 'PROOF_BINDING' }
        foreach ($s in @($m.executionAuthorization,$p.authorizationReference,$p.publicStagingWindowReference)) {
            if ([string]::IsNullOrWhiteSpace($s)) { throw 'MISSING_AUTHORITY' }
        }
        $style = [Globalization.DateTimeStyles]::RoundtripKind
        $culture = [Globalization.CultureInfo]::InvariantCulture
        # Read literal JSON strings: PowerShell 7.5 auto-converts ISO values in
        # ConvertFrom-Json, whose later culture/string conversion loses UTC.
        $window = $cm.RootElement.GetProperty('publicModeWindow')
        $start = [DateTimeOffset]::Parse($window.GetProperty('startsAt').GetString(),$culture,$style)
        $end = [DateTimeOffset]::Parse($window.GetProperty('endsAt').GetString(),$culture,$style)
        $expires = [DateTimeOffset]::Parse($cm.RootElement.GetProperty('expiresAt').GetString(),$culture,$style)
        $observed = [DateTimeOffset]::Parse($cp.RootElement.GetProperty('observedAt').GetString(),$culture,$style)
        $deployStart = ConvertTo-Kan31Instant $ProviderReceipt.startedAt
        $deployFinish = ConvertTo-Kan31Instant $ProviderReceipt.finishedAt
        if ($start -lt $deployStart -or $start -gt $Now -or $end -le $start -or
            $end -gt $start.AddHours(4) -or $expires -gt $end -or $expires -le $Now -or
            $expires -gt $observed.AddMinutes(60) -or $observed -gt $Now -or
            $observed -lt $Now.AddSeconds(-120) -or $observed -lt $deployFinish) { throw 'TIME_BINDING' }
        return [pscustomobject]@{
            comparison='PASS_SAME_KEYSETS_ONLY_ALLOWED_VALUE_CHANGES'
            manifestSha256=$ManifestSha256; proofSha256=$ProofSha256
            manifestChangedFields=@($mc.ToArray()); proofChangedFields=@($pc.ToArray())
            providerReceipt=$ProviderReceipt; observedMainSha=$ObservedMainSha
            comparedAt=$Now.ToUniversalTime().ToString('o')
            dispatchAuthorized=$false
        }
    } finally { foreach ($d in $docs) { $d.Dispose() } }
}
