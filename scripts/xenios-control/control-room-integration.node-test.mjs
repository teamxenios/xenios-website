import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createControlRoomServer} from './control-room-server.mjs';

test('additive wrapper preserves original cockpit and independent mutation guards', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xenios-wrapper-test-'));
  const server = createControlRoomServer({runtimeDirectory: directory,
    coordinator: {read: async () => {throw Error('Test: no native binding');}}, snapshotReader: async () => {throw Error('Test: no snapshot');}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {await new Promise(resolve => server.close(resolve)); await fs.rm(directory, {recursive: true, force: true});});
  function request(route, {method = 'GET', headers = {}, payload} = {}) {
    return new Promise((resolve, reject) => {
      const bytes = payload ? JSON.stringify(payload) : null;
      const req = http.request({host: '127.0.0.1', port: server.address().port, path: route, method,
        headers: {Host: '127.0.0.1:4177', ...(bytes ? {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes)} : {}), ...headers}}, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => {
          const text = Buffer.concat(chunks).toString(); let body; try {body = JSON.parse(text);} catch {body = null;}
          resolve({status: res.statusCode, body, text, headers: res.headers});
        });
      }); req.on('error', reject); if (bytes) req.write(bytes); req.end();
    });
  }
  const legacy = await request('/api/bootstrap'), room = await request('/api/control-room/bootstrap');
  assert.equal(legacy.status, 200); assert.equal(room.status, 200);
  assert.notEqual(legacy.body.csrfToken, room.body.csrfToken);
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/control-room')).body.room.source.availability, 'unavailable');
  assert.equal((await request('/api/factory/assurance')).status, 503);
  assert.equal((await request('/api/control-room', {headers: {Host: 'attacker.invalid'}})).status, 403);
  const origin = {Origin: 'http://127.0.0.1:4177'};
  const newTokenToOld = await request('/api/actions/not-allowlisted', {method: 'POST', headers: {...origin, 'X-Xenios-Control-Token': room.body.csrfToken}});
  assert.equal(newTokenToOld.status, 403);
  const oldTokenToNew = await request('/api/control-room/handoffs', {method: 'POST', payload: {}, headers: {...origin, 'X-Xenios-Control-Token': legacy.body.csrfToken}});
  assert.equal(oldTokenToNew.status, 403);
  const unknownLegacyAction = await request('/api/actions/not-allowlisted', {method: 'POST', headers: {...origin, 'X-Xenios-Control-Token': legacy.body.csrfToken}});
  assert.equal(unknownLegacyAction.status, 400);
  const oldPage = await request('/'), newPage = await request('/control-room');
  assert.equal(oldPage.status, 200); assert.equal(newPage.status, 200);
  assert.match(newPage.text, /Control Room · Xenios Factory/);
  assert.notEqual(oldPage.text, newPage.text);
  assert.equal(newPage.headers['x-frame-options'], 'DENY');
  assert.equal((await request('/api/source/file?path=..%2F.env')).status, 403);
});
