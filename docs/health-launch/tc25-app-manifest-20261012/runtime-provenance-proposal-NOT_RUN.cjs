const fs = require('node:fs');
if (process.env.TC25_PROVENANCE_FILE) {
  fs.appendFileSync(process.env.TC25_PROVENANCE_FILE, JSON.stringify({
    at: new Date().toISOString(), pid: process.pid, ppid: process.ppid,
    execPath: process.execPath, node: process.version, argv: process.argv,
    cwd: process.cwd(), run: process.env.TC25_RUN_ID
  }) + '\n');
}
