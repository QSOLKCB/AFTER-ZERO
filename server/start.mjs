import {createArenaServer} from './standalone.mjs';
const app = createArenaServer({
  databasePath: process.env.ARENA_DB_PATH,
  allowedOrigins: process.env.ALLOWED_ORIGINS || '',
  maxRooms: Number(process.env.MAX_ACTIVE_ROOMS || 2),
});
const port = Number(process.env.PORT || 10000);
app.server.listen(port, '0.0.0.0', () => console.log(`AFTER//ZERO arena listening on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  app.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
});
