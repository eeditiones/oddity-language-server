// The server over a real connection: spawned with --stdio, spoken to over JSON-RPC.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';

const root = fileURLToPath(new URL('..', import.meta.url));
const proc = spawn(process.execPath, [join(root, 'src/node.ts'), '--stdio'], {
  env: { ...process.env, ODDITY_LS_SCHEMAS: join(root, 'schema') },
  stdio: ['pipe', 'pipe', 'inherit'],
});
const conn = createMessageConnection(new StreamMessageReader(proc.stdout!), new StreamMessageWriter(proc.stdin!));
const diagnostics = new Map<string, (d: { diagnostics: { message: string; code: string }[] }) => void>();
conn.onNotification('textDocument/publishDiagnostics', (p: { uri: string; diagnostics: { message: string; code: string }[] }) => diagnostics.get(p.uri)?.(p));
conn.listen();
after(() => { conn.dispose(); proc.kill(); });

// a project: an RNG that allows <doc> with <item>s, associated through opm.toml
const dir = mkdtempSync(join(tmpdir(), 'oddity-ls-'));
mkdirSync(join(dir, 'schema')); mkdirSync(join(dir, 'data'));
writeFileSync(join(dir, 'opm.toml'), '[editor]\nschema = "schema/doc.rng"\n');
writeFileSync(join(dir, 'schema/doc.rng'), '<grammar xmlns="http://relaxng.org/ns/structure/1.0"><start><element name="doc">' +
  '<oneOrMore><element name="item"><attribute name="type"><choice><value>a</value><value>b</value></choice></attribute><text/></element></oneOrMore>' +
  '</element></start></grammar>');
const uri = pathToFileURL(join(dir, 'data/x.xml')).href;

await conn.sendRequest('initialize', { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: [{ uri: pathToFileURL(dir).href, name: 'p' }] });
conn.sendNotification('initialized', {});

function open(u: string, text: string) {
  const got = new Promise<{ message: string; code: string }[]>(r => diagnostics.set(u, p => r(p.diagnostics)));
  conn.sendNotification('textDocument/didOpen', { textDocument: { uri: u, languageId: 'xml', version: 1, text } });
  return got;
}

test('diagnostics come from the project schema', async () => {
  const d = await open(uri, '<doc><other/></doc>');
  assert.deepEqual(d.map(x => [x.code, x.message]), [['schema', '<other> is not allowed here'], ['schema', '<item> is required here']]);
});

test('completion follows the schema at the cursor', async () => {
  const items = await conn.sendRequest<{ label: string }[]>('textDocument/completion', {
    textDocument: { uri }, position: { line: 0, character: 6 }, context: { triggerKind: 2, triggerCharacter: '<' },
  });
  assert.deepEqual(items.map(i => i.label), ['item']);
});

test('the schema in use is reported', async () => {
  const choice = await conn.sendRequest<{ url: string; via: string }>('oddity/schemaFor', { uri });
  assert.deepEqual(choice, { url: pathToFileURL(join(dir, 'schema/doc.rng')).href, via: 'project' });
});

test('well-formedness errors without any schema', async () => {
  const d = await open(pathToFileURL(join(tmpdir(), 'none.xml')).href, '<a><b></a>');
  assert.equal(d.length, 1);
  assert.equal(d[0].code, 'well-formedness');
});

test('an ODD is validated against the bundled ODD schema', async () => {
  const d = await open(pathToFileURL(join(dir, 'm.odd')).href,
    '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>t</title></titleStmt>' +
    '<publicationStmt><p>x</p></publicationStmt><sourceDesc><p>x</p></sourceDesc></fileDesc></teiHeader>' +
    '<text><body><schemaSpec ident="t" start="TEI"><elementSpec ident="hi" mode="change"><model behaviour="inline"/><desc>late</desc>' +
    '</elementSpec></schemaSpec></body></text></TEI>');
  assert.deepEqual(d.map(x => x.message), ['<desc> is not allowed here']);
});
