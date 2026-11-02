// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,index,primaryKey} from 'drizzle-orm/sqlite-core';
export const arenaRooms=sqliteTable('arena_rooms',{
 code:text('code').primaryKey(),revision:integer('revision').notNull().default(0),
 data:text('data').notNull(),owner:text('owner').notNull(),expires:integer('expires').notNull(),
 leaseUntil:integer('lease_until').notNull().default(0),leaseId:text('lease_id').notNull().default('')
},table=>[index('arena_expiry').on(table.expires),index('arena_owner').on(table.owner)]);
export const arenaCommands=sqliteTable('arena_commands',{
 code:text('code').notNull(),player:text('player').notNull(),seq:integer('seq').notNull(),
 received:integer('received').notNull(),command:text('command').notNull()
},table=>[primaryKey({columns:[table.code,table.player,table.seq]}),index('arena_command_time').on(table.code,table.received)]);
