// Writes the default schemas into schema/:
//   schema/odd/teipublisher_odds.rng  compiled by opm from jinks' teipublisher_odds.odd
//   schema/tei/tei_all.rng            downloaded from the TEI
//
//   npm run schemas            # both
//   npm run schemas -- odd     # one
//
// The ODD comes from $JINKS_DIR, else a jinks checkout at ../../apps/tei-publisher/jinks
// or ../jinks, else GitHub. opm is $OPM (a command), else `opm` on the PATH, else
// `uvx --from open-processing-model opm`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ODD_SOURCE = 'profiles/base10/resources/odd/teipublisher_odds.odd';
const ODD_URL = `https://raw.githubusercontent.com/eeditiones/jinks/main/${ODD_SOURCE}`;
const TEI_URL = 'https://tei-c.org/release/xml/tei/custom/schema/relaxng/tei_all.rng';

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

async function tei() {
  const out = join(ROOT, 'schema/tei/tei_all.rng');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await download(TEI_URL));
  console.log(`Wrote schema/tei/tei_all.rng from ${TEI_URL}`);
}

const tasks = { odd, tei };
const names = process.argv.slice(2);
for (const name of names.length ? names : Object.keys(tasks)) {
  if (!tasks[name]) throw new Error(`Unknown schema ${name}; known: ${Object.keys(tasks).join(', ')}`);
  await tasks[name]();
}
