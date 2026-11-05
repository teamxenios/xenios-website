param([string]$InFile, [string]$OutFile)
# Pair kerning for Segoe UI faces, measured with WPF text formatting (OpenType kerning on by default).
# kern(a,b) = W("ab") - W("a") - W("b") at a 1000 px em, reported in em units.
# Dictionaries are ordinal (case-sensitive): PowerShell hashtables would merge 'LY' and 'ly'.
Add-Type -AssemblyName PresentationCore, WindowsBase
$req = Get-Content -Raw -LiteralPath $InFile | ConvertFrom-Json
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$family = New-Object System.Windows.Media.FontFamily('Segoe UI')
$weights = @{ '600' = [System.Windows.FontWeights]::SemiBold; '700' = [System.Windows.FontWeights]::Bold; '900' = [System.Windows.FontWeights]::Black }
$result = [ordered]@{}
foreach ($w in $req.PSObject.Properties.Name) {
  $tf = New-Object System.Windows.Media.Typeface($family, [System.Windows.FontStyles]::Normal, $weights[$w], [System.Windows.FontStretches]::Normal)
  $gt = $null
  [void]$tf.TryGetGlyphTypeface([ref]$gt)
  $cache = New-Object 'System.Collections.Generic.Dictionary[string,double]'   # ordinal, case-sensitive
  $measure = {
    param($s)
    if (-not $cache.ContainsKey($s)) {
      $ft = New-Object System.Windows.Media.FormattedText($s, $culture, [System.Windows.FlowDirection]::LeftToRight, $tf, 1000.0, [System.Windows.Media.Brushes]::Black, 1.0)
      $cache[$s] = $ft.WidthIncludingTrailingWhitespace
    }
    return $cache[$s]
  }
  $pairs = New-Object 'System.Collections.Generic.Dictionary[string,double]'
  foreach ($s in $req.$w) {
    for ($i = 0; $i -lt $s.Length - 1; $i++) {
      $p = $s.Substring($i, 2)
      if (-not $pairs.ContainsKey($p)) {
        $k = (& $measure $p) - (& $measure $p.Substring(0, 1)) - (& $measure $p.Substring(1, 1))
        $pairs[$p] = [math]::Round($k / 1000.0, 5)
      }
    }
  }
  $result[$w] = [ordered]@{ face = $gt.FontUri.LocalPath; pairs = $pairs }
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutFile -Encoding UTF8
