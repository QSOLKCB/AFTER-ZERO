import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

// The same SQL contract as D1; schema creation runs at startup, after the disk mounts.
export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), {recursive: true});
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  const version = sqlite.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) { sqlite.close(); throw Error('Database schema is newer than this server.'); }
  if (version === 0) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(readFileSync(new URL('../drizzle/0000_moaning_karnak.sql', import.meta.url), 'utf8'));
      sqlite.exec('PRAGMA user_version = 1; COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); sqlite.close(); throw error; }
  }
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {bind(...values) {
        return {
          async first() { return statement.get(...values) ?? null; },
          async run() { return {meta: {changes: Number(statement.run(...values).changes)}}; },
        };
      }};
    },
    close() { sqlite.close(); },
  };
}

export function backupStore(source, destination) {
  // VACUUM INTO produces a consistent SQLite backup, including committed WAL data.
  // SQLite refuses to overwrite a nonempty destination.
  if (resolve(source) === resolve(destination)) throw Error('Backup must use a different path.');
  mkdirSync(dirname(resolve(destination)), {recursive: true});
  const db = new DatabaseSync(source, {readOnly: true});
  try { db.exec('PRAGMA busy_timeout = 5000'); db.prepare('VACUUM INTO ?').run(resolve(destination)); }
  finally { db.close(); }
}
