import {readdir,readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CAMPAIGN,validateMap} from '../public/src/maps.js';
import {ARENA_API_URL} from '../public/src/arena-endpoint.js';
import {validateArenaEndpoint} from './arena-config.mjs';
const root=fileURLToPath(new URL('../public/',import.meta.url));
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);files.push(...e.isDirectory()?await walk(p):[p]);}return files;}
const files=await walk(root);let bytes=0;
validateArenaEndpoint(ARENA_API_URL);
for(const file of files){bytes+=(await stat(file)).size;if(!/\.(js|html|css|svg)$/.test(file))continue;const text=await readFile(file,'utf8');if(file.endsWith('.js')){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))await stat(fileURLToPath(new URL(match[1], pathToFileURL(file))));}const checked=file===path.join(root,'src/arena-endpoint.js')?text.replace(JSON.stringify(ARENA_API_URL),'"CONFIGURED_API"'):text;assert(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(checked),`Unexpected network dependency: ${file}`);}
for(const m of CAMPAIGN)assert.deepEqual(validateMap(m),[],m.name);
const html=await readFile(path.join(root,'index.html'),'utf8');for(const [,href]of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))await stat(path.join(root,href.split(/[?#]/)[0]));
assert.equal(CAMPAIGN.length,8);assert(new Set(CAMPAIGN.map(m=>JSON.stringify(m.tiles))).size===8);
console.log(`PASS: ${files.length} distributable files, ${Math.round(bytes/1024)} KiB, eight valid unique maps, local paths and JavaScript syntax.`);
