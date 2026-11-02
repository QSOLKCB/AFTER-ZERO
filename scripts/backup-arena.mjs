import {backupStore} from '../server/sqlite-store.mjs';
const [destination] = process.argv.slice(2);
if (!process.env.ARENA_DB_PATH || !destination) throw Error('Usage: ARENA_DB_PATH=/path/arena.sqlite node scripts/backup-arena.mjs /path/backup.sqlite');
backupStore(process.env.ARENA_DB_PATH, destination);
console.log('Arena backup completed.');
