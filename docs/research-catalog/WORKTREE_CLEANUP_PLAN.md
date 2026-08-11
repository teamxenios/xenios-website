# Catalog Reconciliation Worktree Cleanup Plan

No cleanup was executed. The following untracked local files have verified
byte-identical external copies under
`C:\xenios-wt\research-expansion-control\catalog-reconciliation`:

| File | SHA-256 |
| --- | --- |
| `CATALOG_LAUNCH_PRIORITY.md` | `a7a512a0a7bcce14f87059d30550884b52706b8863ab96eda9d6676a05f58ba9` |
| `CATALOG_RECONCILIATION_DECISIONS.csv` | `ff182373b714aa5d366c715791644ac9e190fd4aa0386b672944634f166efc86` |
| `CATALOG_RECONCILIATION_REPORT.md` | `edbb7eae30f785a78386382094e599faa91e20d93f8e355a07581b387c963c63` |

## Re-verification before authorized cleanup

```powershell
$local = 'C:\xenios-wt\research-expansion\shared'
$external = 'C:\xenios-wt\research-expansion-control\catalog-reconciliation'
$names = @(
  'CATALOG_LAUNCH_PRIORITY.md',
  'CATALOG_RECONCILIATION_DECISIONS.csv',
  'CATALOG_RECONCILIATION_REPORT.md'
)
foreach ($name in $names) {
  $localHash = (Get-FileHash -LiteralPath (Join-Path $local $name) -Algorithm SHA256).Hash
  $externalHash = (Get-FileHash -LiteralPath (Join-Path $external $name) -Algorithm SHA256).Hash
  if ($localHash -ne $externalHash) { throw "Evidence mismatch: $name" }
}
```

After explicit cleanup authorization only, remove the three exact local paths
with `Remove-Item -LiteralPath` in the same PowerShell session. Do not use a
glob, recursive removal, or a computed directory target. Re-run `git status`
and confirm the external copies still match the recorded digests.

`shared/CATALOG_FOUNDATION_HANDOFF.md` is tracked Catalog Foundation evidence
and is not part of this cleanup.
