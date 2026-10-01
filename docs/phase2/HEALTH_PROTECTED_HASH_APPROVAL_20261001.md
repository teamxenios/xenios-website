# Exact owner-approved Health protection baseline amendment

The user's current pasted request explicitly approves these two hash pairs only.
Source attachment: `49cbb379-464a-4486-a3df-1925c7b633c3/Pasted text.txt`, SHA-256
`6cbc2b4e199b858fe254ca3625e85c811fcb17adc4ac78538670b01df6528c90`.
It directs the normal protected-change procedure, a separate baseline amendment,
gate re-execution, and continued Health implementation. It gives no hosted authority.

| File | Previous sha256-lf | Approved sha256-lf |
| --- | --- | --- |
| server/routes.ts | f17d518ee2a3bcda2ff4d4ffca6bc8475c0ced5f7c9f5f85b19bd189e09ea2ae | 7c21ea1ac26c6359c46d6070a9295a41b16f93355b3475a44f7831c668069137 |
| server/index.ts | 598ffd2e79038c35b5c9e6662cb05258a6b27a33bc3ee96b8b23757f9e2fd888 | 1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315 |

Both current working files match exactly after CRLF-to-LF normalization. Neither
source file is modified in this amendment. Source runtime remains
`947f6ee7739bf2a1381b4b29a4f9d132c751d64c`, tree
`03ccddee03fbad2966655c2ce1a3cb46c468d8d5`, at starting records
`49234f8a2dd804845245a18056a73904b320158a`.

Independent evidence is Claude report19 and report22, including the947f6ee
addendum, on reviewer commit `c2e4beaa796015dd08134c009c0aaebbbb48644f` under
`docs/review/xenios-health-launch-review-20260930/`. The report expressly confirms
these full-file bytes remain identical to its prior PASS review.

The same existing implementation session is the exclusive protection amendment
owner under task `HEALTH-EXACT-PROTECTED-HASH-AMENDMENT-20261001`.
This commit is protection-record-only. No zones, routes, runtime source, tests,
skip lists, timeout limits or provider/configuration flags are changed.

The Research gateway `server/research/index.ts` is NOT included in this approval.
Its current hash is `5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188`;
its existing baseline `b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070`
remains unchanged. Claude report22 independently exercises the gateway (F10
closed), but that is not permission to extend this exact two-hash amendment.
The unchanged clean-seam test can therefore remain red for that separate path.

Reproduction uses private Node v20.19.0, without a permanent PATH change:

```powershell
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe' scripts/acceptance/verify-core-site-protection.mjs 49234f8a2dd804845245a18056a73904b320158a HEAD
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe' node_modules/vitest/vitest.mjs run server/core-site-protection.test.ts --maxWorkers=1 --no-file-parallelism
```

Results are recorded after the exact amendment commit in the next handoff.
Prior failed whole-suite results remain unchanged, not retroactively passed.
Deployment, managed migration, real email, money and hosted configuration: none.
