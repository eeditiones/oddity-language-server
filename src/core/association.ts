// ── which RELAX NG schema an XML file gets ────────────────────────────────
// The same order as opm studio (src/ui/xmlSchema.ts there):
// 1. a local RNG named by the document's <?xml-model?>
// 2. for documents other than ODDs, [editor] schema in the nearest opm.toml
// 3. a default by vocabulary: TEI Publisher's ODD schema for ODDs, tei_all for TEI
// Everything is a URL, so relative paths resolve the same way on every platform.
import { readToml, tomlString } from './toml.ts';

export const RNG_NS = 'http://relaxng.org/ns/structure/1.0';

/** What association needs to know about files: synchronous, as the files are small or only checked. */
export interface Files {
  exists(url: string): boolean;
  read(url: string): string | undefined;
}

/** Default schema URL by vocabulary ('odd', 'tei', …). */
export type Defaults = Record<string, string | undefined>;

export interface SchemaChoice {
  /** URL of the main RNG. */
  url: string;
  /** Where the choice came from. */
  via: 'xml-model' | 'project' | 'default';
}

export const isOdd = (url: string) => /\.odd$/i.test(new URL(url).pathname);

/** The vocabulary of a document by namespace or root element; '' for none we know. */
export function vocabulary(text: string): string {
  const head = text.slice(0, 5000);
  if (head.includes('http://www.tei-c.org/ns/1.0') || /<(TEI|teiCorpus)[\s>]/.test(head)) return 'tei';
  return '';
}

/** The <?xml-model?> processing instructions in the head of a document, with their pseudo-attributes. */
export function xmlModels(text: string): { from: number; to: number; href?: string; schematypens?: string; raw: string }[] {
  const out = [];
  for (const m of text.slice(0, 5000).matchAll(/<\?xml-model\s([^?]*)\?>/g)) {
    const pseudo = (name: string) => m[1].match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`))?.[1];
    out.push({ from: m.index!, to: m.index! + m[0].length, href: pseudo('href'), schematypens: pseudo('schematypens'), raw: m[0] });
  }
  return out;
}

/** True for an xml-model PI that points at a RELAX NG schema (not Schematron). */
export const isRngModel = (pi: { href?: string; schematypens?: string; raw: string }) =>
  pi.schematypens === RNG_NS || (!pi.schematypens && !!pi.href && /\.rng$/i.test(pi.href) && !/schematron/i.test(pi.raw));

/** URL of the folder (ending in '/') holding the nearest opm.toml above url, stopping at any of stops. */
export function projectRoot(url: string, files: Files, stops: string[] = []): string | undefined {
  let dir = new URL('./', url);
  for (;;) {
    if (files.exists(new URL('opm.toml', dir).href)) return dir.href;
    const parent = new URL('../', dir);
    if (parent.href === dir.href || stops.some(s => sameDir(s, dir.href))) return undefined;
    dir = parent;
  }
}

const sameDir = (a: string, b: string) => a.replace(/\/?$/, '/') === b.replace(/\/?$/, '/');

/** The schema of the document at url with text, or null when it has none. */
export function schemaFor(url: string, text: string, files: Files, defaults: Defaults, stops: string[] = []): SchemaChoice | null {
  for (const pi of xmlModels(text)) {
    // remote schemas are left alone: they would be fetched on every edit
    if (!isRngModel(pi) || !pi.href || /^(https?|ftp):/i.test(pi.href)) continue;
    const target = new URL(pi.href, url).href;
    if (files.exists(target)) return { url: target, via: 'xml-model' };
  }
  const odd = isOdd(url);
  if (!odd) {
    const root = projectRoot(url, files, stops);
    const toml = root && files.read(new URL('opm.toml', root).href);
    const configured = toml ? tomlString(readToml(toml), 'editor', 'schema') : '';
    if (configured && /\.rng$/i.test(configured)) {
      const target = new URL(configured, root).href;
      if (files.exists(target)) return { url: target, via: 'project' };
    }
  }
  const fallback = defaults[odd ? 'odd' : vocabulary(text)];
  return fallback ? { url: fallback, via: 'default' } : null;
}

/** A relative href from the document at `from` to `to`, or `to` itself when they share no root. */
export function relativeHref(from: string, to: string): string {
  const a = new URL(from), b = new URL(to);
  if (a.protocol !== b.protocol || a.host !== b.host) return to;
  const dir = a.pathname.split('/').slice(0, -1), target = b.pathname.split('/');
  let i = 0;
  while (i < dir.length && i < target.length - 1 && dir[i] === target[i]) i++;
  return [...Array(dir.length - i).fill('..'), ...target.slice(i)].join('/');
}

export interface TextEdit { from: number; to: number; insert: string }

/**
 * The edit that makes text associate with the RNG at href: it replaces the first RELAX NG
 * xml-model PI, or adds one after the XML declaration. With href null it removes them all.
 */
export function xmlModelEdits(text: string, href: string | null): TextEdit[] {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const models = xmlModels(text).filter(isRngModel);
  const pi = href && `<?xml-model href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" type="application/xml" schematypens="${RNG_NS}"?>`;
  const removal = (m: { from: number; to: number }): TextEdit => {
    const after = text.slice(m.to).match(/^\r?\n/)?.[0].length ?? 0;
    return { from: m.from, to: m.to + after, insert: '' };
  };
  if (!pi) return models.map(removal);
  if (models.length) return [{ from: models[0].from, to: models[0].to, insert: pi }, ...models.slice(1).map(removal)];
  const decl = text.match(/^﻿?<\?xml\s[^?]*\?>/);
  if (decl) return [{ from: decl[0].length, to: decl[0].length, insert: nl + pi }];
  const bom = text.startsWith('﻿') ? 1 : 0;
  return [{ from: bom, to: bom, insert: pi + nl }];
}
