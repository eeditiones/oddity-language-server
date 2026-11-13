// Node entry: run with --node-ipc (VS Code) or --stdio.
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { startServer, type Host } from './server/server.ts';

const local = (url: string | URL) => {
  const u = typeof url === 'string' ? new URL(url) : url;
  return u.protocol === 'file:' ? fileURLToPath(u) : undefined;
};

const host: Host = {
  files: {
    exists: url => { const p = local(url); return !!p && existsSync(p); },
    read: url => {
      const p = local(url);
      try { return p ? readFileSync(p, 'utf8') : undefined; } catch { return undefined; }
    },
  },
  async readText(url) {
    const p = local(url);
    if (p) return readFile(p, 'utf8');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} could not be loaded: ${r.status}`);
    return r.text();
  },
};

// The schemas shipped with the package, beside dist/ (or the bundle that includes this file).
const schemaDir = process.env.ODDITY_LS_SCHEMAS;
if (schemaDir) {
  const base = pathToFileURL(schemaDir.endsWith('/') ? schemaDir : `${schemaDir}/`);
  host.defaults = { odd: new URL('odd/teipublisher_odds.rng', base).href, tei: new URL('tei/tei_all.rng', base).href };
}

startServer(createConnection(ProposedFeatures.all), host);
