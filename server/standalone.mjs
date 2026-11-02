import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {handleArena} from './arena-api.js';
import {openStore} from './sqlite-store.mjs';

const MAX_BODY = 125000;
const digest = text => createHash('sha256').update(text).digest('hex');

export function parseOrigins(value) {
  return new Set(value.split(',').map(s => s.trim()).filter(Boolean).map(value => {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== value || url.username || url.password ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
      throw Error('ALLOWED_ORIGINS must contain HTTPS origins without paths (HTTP is allowed on localhost).');
    }
    return value;
  }));
}

function bucket(capacity, perSecond) {
  let tokens = capacity, previous = performance.now();
  return () => {
    const now = performance.now();
    tokens = Math.min(capacity, tokens + (now - previous) * perSecond / 1000);
    previous = now;
    if (tokens < 1) return false;
    tokens--; return true;
  };
}

async function readBody(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req.iterator({destroyOnReturn: false})) {
    bytes += chunk.length;
    if (bytes > MAX_BODY) throw Object.assign(Error('Request too large.'), {status: 413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createArenaServer({databasePath, allowedOrigins, maxRooms = 2, maxRequests = 700, maxInFlight = 32, log = console.error}) {
  if (!databasePath) throw Error('ARENA_DB_PATH is required.');
  const origins = parseOrigins(allowedOrigins);
  if (!origins.size) throw Error('At least one allowed origin is required.');
  for (const value of [maxRooms, maxRequests, maxInFlight]) {
    if (!Number.isSafeInteger(value) || value < 1) throw Error('Server limits must be positive integers.');
  }
  if (maxRooms > 6) throw Error('MAX_ACTIVE_ROOMS cannot exceed the shared API owner limit of six.');
  const DB = openStore(databasePath), globalLimit = bucket(maxRequests, maxRequests);
  const sessions = new Map();
  let closing = false, inFlight = 0, tail = Promise.resolve(), closePromise;
  // Serialize the single SQLite writer. This also makes capacity checks + create atomic.
  const exclusive = task => { const work = tail.then(task); tail = work.catch(() => {}); return work; };
  const server = createServer({maxHeaderSize: 16384}, async (req, res) => {
    const origin = req.headers.origin;
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin'};
    if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status, value, extra = {}) => {
      if (!res.destroyed) { res.writeHead(status, {...headers, ...extra}); res.end(JSON.stringify(value)); }
    };
    if (req.url === '/healthz' && req.method === 'GET') return reply(200, {status: 'ok'});
    if (req.url === '/readyz' && req.method === 'GET') {
      try { DB.sqlite.prepare('SELECT 1').get(); return reply(closing ? 503 : 200, {ready: !closing}); }
      catch { return reply(503, {ready: false}); }
    }
    if (req.url !== '/api/arena') return reply(404, {error: 'Not found.'});
    if (closing) return reply(503, {error: 'Server restarting. Please retry.'}, {'Retry-After': '2'});
    if (!origins.has(origin)) return reply(403, {error: 'Origin not allowed.'});
    if (req.method === 'OPTIONS') {
      const requested = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
      if (req.headers['access-control-request-method'] !== 'POST' || requested.some(v => v !== 'content-type')) return reply(403, {error: 'Preflight not allowed.'});
      res.writeHead(204, {...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'});
      return res.end();
    }
    if (req.method !== 'POST') return reply(405, {error: 'Use POST.'}, {Allow: 'POST, OPTIONS'});
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reply(415, {error: 'JSON required.'});
    if (Number(req.headers['content-length']) > MAX_BODY) return reply(413, {error: 'Request too large.'}, {Connection: 'close'});
    if (!globalLimit()) return reply(429, {error: 'Server request limit reached. Please retry.'}, {'Retry-After': '1'});
    if (inFlight >= maxInFlight) return reply(503, {error: 'Server busy. Please retry.'}, {'Retry-After': '1'});
    inFlight++;
    try {
      const raw = await readBody(req);
      let body; try { body = JSON.parse(raw); } catch { return reply(400, {error: 'Invalid JSON.'}); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return reply(400, {error: 'Expected a JSON object.'});
      if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return reply(401, {error: 'Invalid player session.'});
      const hash = digest(body.token), now = Date.now();
      let session = sessions.get(hash);
      if (!session) {
        for (const [key, value] of sessions) if (now - value.lastSeen > 60000) sessions.delete(key);
        if (sessions.size >= 1024) return reply(503, {error: 'Server session limit reached. Please retry.'});
        sessions.set(hash, session = {allow: bucket(60, 30), lastSeen: now});
      }
      session.lastSeen = now;
      if (!session.allow()) return reply(429, {error: 'Player request limit reached. Please retry.'}, {'Retry-After': '1'});
      const response = await exclusive(async () => {
        const now = Date.now();
        DB.sqlite.prepare('DELETE FROM arena_rooms WHERE expires < ?').run(now);
        if (body.action === 'create') {
          const code = hash.slice(20, 28).toUpperCase();
          const prior = DB.sqlite.prepare('SELECT code FROM arena_rooms WHERE code = ?').get(code);
          if (!prior && DB.sqlite.prepare('SELECT count(*) AS n FROM arena_rooms').get().n >= maxRooms) {
            return Response.json({error: 'Arena capacity reached. Join an existing room or try again later.'}, {status: 429});
          }
        }
        // Validate CORS above, then call the unchanged same-origin API internally.
        // Never forward caller-supplied Cloudflare/Sites identity or proxy headers.
        const internal = new Request('https://arena.internal/api/arena', {method: 'POST', body: raw,
          headers: {'Content-Type': 'application/json', Origin: 'https://arena.internal', 'CF-Connecting-IP': 'standalone-shared-owner'}});
        return handleArena(internal, {DB}, now);
      });
      reply(response.status, await response.json());
    } catch (error) {
      if (error.status === 413) reply(413, {error: 'Request too large.'}, {Connection: 'close'});
      else { log('Arena request failed'); reply(500, {error: 'Arena request failed. Please retry.'}); }
    } finally { inFlight--; }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  const cleanup = setInterval(() => { if (!closing) DB.sqlite.prepare('DELETE FROM arena_rooms WHERE expires < ?').run(Date.now()); }, 60000);
  cleanup.unref();
  return {
    server, DB,
    close() {
      if (closePromise) return closePromise;
      closing = true; clearInterval(cleanup);
      closePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => server.closeAllConnections(), 10000); timeout.unref();
        server.close(async error => {
          await tail;
          clearTimeout(timeout); DB.close();
          if (error) reject(error); else resolve();
        });
        server.closeIdleConnections();
      });
      return closePromise;
    },
  };
}
