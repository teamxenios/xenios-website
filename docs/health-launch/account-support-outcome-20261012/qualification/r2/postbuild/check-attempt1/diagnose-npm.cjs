'use strict';
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const receipt = JSON.parse(fs.readFileSync('C:/Users/sboad/.codex/tmp/support-postbuild-20261012/check/receipt.json', 'utf8'));
if (process.version !== 'v20.19.0' || receipt.status !== 'PREFLIGHT_FAILED_NO_JOB_STARTED') throw new Error('Unexpected diagnostic input');
const start = Date.now();
execFile('C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe',
  ['C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js', '--version'],
  { cwd: receipt.cwd, env: receipt.environment, windowsHide: true, timeout: 10000, maxBuffer: 65536, encoding: 'utf8' },
  (error, stdout, stderr) => {
    console.log(JSON.stringify({ diagnosticOnly: true, startedUtc: new Date(start).toISOString(), endedUtc: new Date().toISOString(), elapsedMs: Date.now() - start,
      command: 'Pinned Node/npm --version only; no compiler or lifecycle', timeoutMs: 10000,
      error: error ? {name:error.name, code:error.code, killed:error.killed, signal:error.signal, message:error.message} : null,
      stdout, stderr, originalProbeResultStillFailed: true }));
    process.exitCode = error ? 1 : 0;
  });
