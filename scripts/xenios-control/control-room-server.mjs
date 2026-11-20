import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createControlServer} from './server.mjs';
import {CONTROL_HOST, CONTROL_PORT, currentRuntime, repoRuntimeDirectory} from './lib.mjs';
import {createControlRoomHandler} from './control-room.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '..', '..');

/** One listener, one existing coordinator. Original cockpit routes and their
 * token/Host/Origin/security behavior remain owned by the original server. */
export function createControlRoomServer(options = {}) {
  const repoRoot = options.repoRoot || root;
  const server = createControlServer(options);
  const legacyHandlers = server.listeners('request');
  server.removeAllListeners('request');
  const handle = createControlRoomHandler({repoRoot, assetsDirectory: directory,
    runtimeDirectory: repoRuntimeDirectory(repoRoot), ...options});
  server.on('request', async (request, response) => {
    if (await handle(request, response)) return;
    for (const legacy of legacyHandlers) legacy.call(server, request, response);
  });
  return server;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const runtime = currentRuntime();
  if (!runtime.compatible) {
    process.stderr.write(`Use the existing pinned toolchain: Node ${runtime.requiredNodeVersion}, npm ${runtime.requiredNpmVersion}.\n`);
    process.exitCode = 1;
  } else {
    const server = createControlRoomServer();
    server.listen(CONTROL_PORT, CONTROL_HOST, () => {
      process.stdout.write(`Xenios Factory Control Room: http://${CONTROL_HOST}:${CONTROL_PORT}/control-room\n`);
      process.stdout.write('Existing cockpit: / · Local only · Native session connections require an explicit connector.\n');
    });
    server.on('error', failure => {
      process.stderr.write(failure.code === 'EADDRINUSE' ? 'Port 4177 already has a listener. Keep its owner in control; do not start a second cockpit.\n' : 'Control Room failed to start.\n');
      process.exitCode = 1;
    });
  }
}
