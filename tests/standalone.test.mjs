import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync, copyFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {request} from 'node:http';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createArenaServer, parseOrigins} from '../server/standalone.mjs';
import {backupStore,openStore} from '../server/sqlite-store.mjs';
import {DatabaseSync} from 'node:sqlite';

const origin = 'https://qsolkcb.github.io';
const token = n => n.toString(16).padStart(2, '0').repeat(32);
test('schema-one rooms upgrade to the command inbox without losing stored state',t=>{
 const directory=mkdtempSync(join(tmpdir(),'afterzero-upgrade-')),path=join(directory,'arena.sqlite');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const old=new DatabaseSync(path);old.exec(readFileSync(new URL('../drizzle/0000_moaning_karnak.sql',import.meta.url),'utf8'));old.exec('PRAGMA user_version=1');
 old.prepare('INSERT INTO arena_rooms (code,revision,data,owner,expires) VALUES (?,?,?,?,?)').run('AABBCCDD',7,'{"preserved":true}','owner',999999);old.close();
 const upgraded=openStore(path);assert.equal(upgraded.sqlite.prepare('PRAGMA user_version').get().user_version,2);assert.deepEqual(JSON.parse(upgraded.sqlite.prepare('SELECT data FROM arena_rooms').get().data),{preserved:true});
 assert.equal(upgraded.sqlite.prepare('SELECT lease_until FROM arena_rooms').get().lease_until,0);assert.equal(upgraded.sqlite.prepare('SELECT count(*) AS n FROM arena_commands').get().n,0);upgraded.close();
});
async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'afterzero-'));
  const filename = join(directory, 'arena.sqlite');
  const apps = [];
  async function start(path = filename) {
    const app = createArenaServer({databasePath: path, allowedOrigins: origin, log: () => {}, ...options});
    apps.push(app); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    app.url = `http://127.0.0.1:${app.server.address().port}`;
    app.call = async (body, headers = {}) => {
      const response = await fetch(app.url + '/api/arena', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
      return {status: response.status, headers: response.headers, body: await response.json()};
    };
    return app;
  }
  t.after(async () => { for (const app of apps) await app.close(); rmSync(directory, {recursive: true, force: true}); });
  return {directory, filename, start, app: await start()};
}

test('standalone HTTP clients share a room with private sessions, valid CORS and replay-safe inputs', async t => {
  const {app} = await fixture(t);
  const a = await app.call({action: 'create', token: token(1), name: 'ALPHA', options: {mode: 'tdm', slots: 8}});
  assert.equal(a.status, 201); assert.equal(a.headers.get('access-control-allow-origin'), origin);
  assert.equal(a.headers.get('access-control-allow-credentials'), null);
  const code = a.body.code;
  const b = await app.call({action: 'join', token: token(2), code, name: 'BETA', kind: 'engineer'});
  const humans = b.body.snapshot.players.filter(p => !p.bot);
  assert.equal(humans.length, 2); assert.notEqual(humans[0].team, humans[1].team);
  assert(!JSON.stringify(b.body).includes(token(1))); assert(!JSON.stringify(b.body).includes('sessions'));
  const fire = {action: 'sync', token: token(1), code, seq: 1, input: {timePressed: true}};
  const first = await app.call(fire), retry = await app.call(fire);
  assert.equal(first.status, 200); assert.equal(retry.status, 200);
  assert(retry.body.snapshot.players.find(p => p.id === retry.body.snapshot.you).energy >= 50);
  assert.equal((await app.call({action: 'sync', token: token(3), code, seq: 999, input: {health: 999}})).status, 401);
  assert.equal((await app.call({action: 'leave', token: token(2), code})).status, 200);
  const state = await app.call({...fire, seq: 2, input: {}});
  assert.equal(state.body.snapshot.players.length, 8);
  assert.equal(state.body.snapshot.players.filter(p => !p.bot).length, 1);
});

test('preflight allows only configured origins, POST and Content-Type', async t => {
  const {app} = await fixture(t);
  const options = headers => fetch(app.url + '/api/arena', {method: 'OPTIONS', headers});
  const allowed = await options({Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'});
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('vary'), 'Origin');
  for (const bad of ['https://evil.test', 'null', origin + '/AFTER-ZERO/']) {
    const response = await options({Origin: bad, 'Access-Control-Request-Method': 'POST'});
    assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await options({Origin: origin, 'Access-Control-Request-Method': 'DELETE'})).status, 403);
  assert.equal((await options({Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization'})).status, 403);
  assert.equal((await app.call({action: 'create', token: token(1)}, {Origin: 'null'})).status, 403);
  assert.equal((await fetch(app.url + '/api/arena', {method: 'POST'})).status, 403);
  for (const invalid of ['*', 'null', 'https://example.com/path', 'https://example.com/', 'http://example.com', 'https://user:password@example.com']) {
    assert.throws(() => parseOrigins(invalid));
  }
  assert.equal(parseOrigins('https://one.test,http://localhost:8000').size, 2);
});

test('rooms survive process restart and a consistent backup can be restored', async t => {
  const {app, filename, directory, start} = await fixture(t);
  const created = await app.call({action: 'create', token: token(1), options: {mode: 'dom', slots: 8}});
  const code = created.body.code;
  await app.call({action: 'join', token: token(2), code});
  const backup = join(directory, 'backup.sqlite');
  backupStore(filename, backup);
  assert.throws(() => backupStore(filename, filename));
  assert.throws(() => backupStore(filename, backup));
  await app.close();
  for (const path of [filename, backup]) {
    const restarted = await start(path);
    const response = await restarted.call({action: 'sync', token: token(1), code, seq: 1, input: {}});
    assert.equal(response.status, 200); assert.equal(response.body.snapshot.mode, 'dom');
    assert.equal(response.body.snapshot.players.filter(p => !p.bot).length, 2);
    await restarted.close();
  }
});

test('simultaneous room creation respects capacity and ignores forged provider identity headers', async t => {
  const {app} = await fixture(t, {maxRooms: 2});
  const replies = await Promise.all([1, 2, 3, 4, 5].map(n => app.call({action: 'create', token: token(n)}, {
    'oai-authenticated-user-id': 'forged-' + n, 'CF-Connecting-IP': `1.2.3.${n}`, 'X-Forwarded-For': `5.6.7.${n}`,
  })));
  assert.equal(replies.filter(r => r.status === 201).length, 2);
  assert.equal(replies.filter(r => r.status === 429).length, 3);
  assert.equal(app.DB.sqlite.prepare('SELECT count(*) AS n FROM arena_rooms').get().n, 2);
  assert.equal(app.DB.sqlite.prepare('SELECT count(DISTINCT owner) AS n FROM arena_rooms').get().n, 1);
  const index = replies.findIndex(r => r.status === 201);
  assert.equal((await app.call({action: 'create', token: token(index + 1)})).status, 200);
});

test('bad payloads are bounded and health checks remain accessible', async t => {
  const {app} = await fixture(t);
  for (const body of [null, [], 3, 'text']) assert.equal((await app.call(body)).status, 400);
  assert.equal((await app.call({token: 'invalid'})).status, 401);
  assert.equal((await app.call({token: token(1), action: 'bogus'})).status, 400);
  const headers = {Origin: origin, 'Content-Type': 'application/json'};
  assert.equal((await fetch(app.url + '/api/arena', {method: 'POST', headers, body: '{broken'})).status, 400);
  assert.equal((await app.call({token: token(1)}, {'Content-Type': 'text/plain'})).status, 415);
  assert.equal((await app.call({token: token(1), padding: 'x'.repeat(125000)})).status, 413);
  const chunked = await new Promise((resolve, reject) => {
    const req = request(app.url + '/api/arena', {method: 'POST', headers}, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('x'.repeat(70000)); req.end('x'.repeat(70000));
  });
  assert.equal(chunked, 413);
  assert.equal((await fetch(app.url + '/healthz')).status, 200);
  assert.equal((await fetch(app.url + '/readyz')).status, 200);
  assert.equal((await fetch(app.url + '/.env')).status, 404);
});

test('global rate limit rejects excess requests without blocking readiness', async t => {
  const {app} = await fixture(t, {maxRequests: 2});
  const codes = await Promise.all([1, 2, 3, 4].map(n => app.call({action: 'unknown', token: token(n)})));
  assert(codes.some(r => r.status === 429));
  assert.equal((await fetch(app.url + '/readyz')).status, 200);
});

test('static endpoint configuration accepts a public API URL and rejects secrets or insecure URLs', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterzero-config-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  mkdirSync(join(directory, 'scripts')); mkdirSync(join(directory, 'public/src'), {recursive: true});
  const script = join(directory, 'scripts/configure-arena.mjs');
  copyFileSync(new URL('../scripts/configure-arena.mjs', import.meta.url), script);
  copyFileSync(new URL('../scripts/arena-config.mjs', import.meta.url), join(directory, 'scripts/arena-config.mjs'));
  const run = value => spawnSync(process.execPath, [script], {env: {...process.env, ARENA_API_URL: value}, encoding: 'utf8'});
  assert.equal(run('').status, 0);
  assert.match(readFileSync(join(directory, 'public/src/arena-endpoint.js'), 'utf8'), /\.\/api\/arena/);
  assert.equal(run('https://game.example/api/arena').status, 0);
  const configured = await import(pathToFileURL(join(directory, 'public/src/arena-endpoint.js')).href);
  assert.equal(configured.ARENA_API_URL, 'https://game.example/api/arena');
  for (const invalid of ['http://game.example/api/arena', 'https://secret@game.example/api/arena', 'https://game.example/api/arena?token=secret', 'https://game.example/']) {
    assert.notEqual(run(invalid).status, 0);
  }
});
