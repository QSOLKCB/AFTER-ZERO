import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

// The same SQL contract as D1; schema creation runs at startup, after the disk mounts.
export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), {recursive: true});
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  const version = sqlite.prepare('PRAGMA user_version').get().user_version;
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8')).entries;
  if (version > journal.length) { sqlite.close(); throw Error('Database schema is newer than this server.'); }
  if (version < journal.length) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      for(const entry of journal.slice(version))sqlite.exec(readFileSync(new URL('../drizzle/'+entry.tag+'.sql',import.meta.url),'utf8'));
      sqlite.exec('PRAGMA user_version = '+journal.length+'; COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); sqlite.close(); throw error; }
  }
  const execute=(sql,values)=>{
    const statement=sqlite.prepare(sql);
    if(/^\s*(SELECT|WITH)/i.test(sql)||/\bRETURNING\b/i.test(sql))return {results:statement.all(...values),meta:{changes:Number(sqlite.prepare('SELECT changes() AS n').get().n)}};
    return {results:[],meta:{changes:Number(statement.run(...values).changes)}};
  };
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {bind(...values) {
        return {
          sql,values,
          async first() { return statement.get(...values) ?? null; },
          async run() { return {meta: {changes: Number(statement.run(...values).changes)}}; },
          async all() { return execute(sql,values); },
        };
      }};
    },
    async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>execute(s.sql,s.values));sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},
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
