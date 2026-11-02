import {env} from 'cloudflare:workers';
import {handleArena} from '../../../server/arena-api.js';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handleArena(request,env);}
