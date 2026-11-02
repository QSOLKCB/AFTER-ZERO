import {writeFileSync} from 'node:fs';
import {validateArenaEndpoint} from './arena-config.mjs';
const value = validateArenaEndpoint(process.env.ARENA_API_URL || './api/arena');
writeFileSync(new URL('../public/src/arena-endpoint.js', import.meta.url), `// Public API endpoint; never place credentials here.\nexport const ARENA_API_URL = ${JSON.stringify(value)};\n`);
console.log('Configured the public arena endpoint.');
