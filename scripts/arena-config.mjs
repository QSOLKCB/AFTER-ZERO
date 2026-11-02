export function validateArenaEndpoint(value) {
  if (value === './api/arena') return value;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/arena') {
    throw Error('ARENA_API_URL must be an HTTPS /api/arena URL without credentials, query or fragment.');
  }
  return value;
}
