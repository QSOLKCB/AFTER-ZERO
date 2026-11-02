// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const arenaRooms=sqliteTable('arena_rooms',{
 code:text('code').primaryKey(),revision:integer('revision').notNull().default(0),
 data:text('data').notNull(),owner:text('owner').notNull(),expires:integer('expires').notNull()
},table=>[index('arena_expiry').on(table.expires),index('arena_owner').on(table.owner)]);
