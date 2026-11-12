// Preview-only static server for the isolated responsive branch.
// No data jobs, scheduled collectors, credentials, or production integrations.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.cwd());
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml'};
createServer(async (req,res)=>{
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  let decoded;
  try { decoded = decodeURIComponent(path); } catch {res.writeHead(400);res.end('Bad request');return;}
  const file = resolve(root, '.'+decoded, decoded.endsWith('/')?'index.html':'');
  if (file!==root && !file.startsWith(root+sep)) {res.writeHead(403);res.end('Forbidden');return;}
  try {
    const info=await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else res.end(data);
  } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','X-Robots-Tag':'noindex, nofollow'});res.end('Not found');}
}).listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('BEFN responsive preview server ready'));
