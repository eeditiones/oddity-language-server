// Writes the default schemas into schema/:
//   schema/odd/teipublisher_odds.rng  compiled by opm from jinks' teipublisher_odds.odd
//   schema/tei/tei_all.rng            downloaded from the TEI
//   schema/docbook/docbook.rng        DocBook 5.2, downloaded from docbook.org
//   schema/jats/…                     JATS 1.3 Archiving with MathML 3, downloaded from the NLM
//
// Downloaded schemas come with every file they include, at their relative paths.
//
//   npm run schemas            # all
//   npm run schemas -- odd     # one
//
// The ODD comes from $JINKS_DIR, else a jinks checkout at ../../apps/tei-publisher/jinks
// or ../jinks, else GitHub. opm is $OPM (a command), else `opm` on the PATH, else
// `uvx --from open-processing-model opm`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ODD_SOURCE = 'profiles/base10/resources/odd/teipublisher_odds.odd';
const ODD_URL = `https://raw.githubusercontent.com/eeditiones/jinks/main/${ODD_SOURCE}`;
const DOWNLOADS = {
  tei: 'https://tei-c.org/release/xml/tei/custom/schema/relaxng/tei_all.rng',
  docbook: 'https://cdn.docbook.org/schema/5.2/rng/docbook.rng',
  // Archiving, the loosest JATS tag set and a superset of Publishing, with MathML 3
  jats: 'https://jats.nlm.nih.gov/archiving/1.3/rng/JATS-archivearticle1-3-mathml3.rng',
};

function onPath(cmd) {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}

async function odd() {
  const candidates = [process.env.JINKS_DIR, join(ROOT, '../../apps/tei-publisher/jinks'), join(ROOT, '../jinks')].filter(Boolean);
  let source = candidates.map(d => join(d, ODD_SOURCE)).find(existsSync);
  if (!source) {
    source = join(mkdtempSync(join(tmpdir(), 'odds-')), 'teipublisher_odds.odd');
    writeFileSync(source, await download(ODD_URL));
  }
  const run = process.env.OPM ? process.env.OPM.split(' ') : onPath('opm') ? ['opm'] : ['uvx', '-q', '--from', 'open-processing-model', 'opm'];
  const out = join(ROOT, 'schema/odd/teipublisher_odds.rng');
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(run[0], [...run.slice(1), 'odd', 'compile', source, '--format', 'rng', '-o', out, '--force'], { stdio: 'inherit' });
  console.log(`Wrote schema/odd/teipublisher_odds.rng from ${source}`);
}

/** Save url and, recursively, the RNGs it includes, at their paths relative to base. */
async function save(url, base, into, seen) {
  if (seen.has(url)) return;
  seen.add(url);
  const text = await download(url);
  const target = join(into, url.slice(base.length));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  for (const m of text.matchAll(/<(?:[\w-]+:)?(?:include|externalRef)\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/g)) {
    const href = new URL(m[1].trim(), url).href;
    if (!href.startsWith(base)) throw new Error(`${url} includes ${href}, outside ${base}`);
    await save(href, base, into, seen);
  }
}

const fetched = name => async () => {
  const url = DOWNLOADS[name], base = url.slice(0, url.lastIndexOf('/') + 1), into = join(ROOT, 'schema', name);
  rmSync(into, { recursive: true, force: true });
  const seen = new Set();
  await save(url, base, into, seen);
  console.log(`Wrote schema/${name}/ (${seen.size} files) from ${url}`);
};

const tasks = { odd, tei: fetched('tei'), docbook: fetched('docbook'), jats: fetched('jats') };
const names = process.argv.slice(2);
for (const name of names.length ? names : Object.keys(tasks)) {
  if (!tasks[name]) throw new Error(`Unknown schema ${name}; known: ${Object.keys(tasks).join(', ')}`);
  await tasks[name]();
}
