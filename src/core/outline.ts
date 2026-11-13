// ── document outline: ODD structure for ODDs, divisions for TEI ───────────
// The ODD outline is ODDity's (src/oddOutline.ts there), with editor-neutral results.
import { parse } from '@xml-tools/parser';
import { buildAst, type XMLElement, type XMLDocument } from '@xml-tools/ast';

/** LSP symbol kinds used here (the protocol's numbers). */
export const Kind = {
  Module: 2, Namespace: 3, Package: 4, Class: 5, Method: 6, Property: 7,
  Interface: 11, Constant: 14, Array: 18, Object: 19, Struct: 23, TypeParameter: 26,
} as const;

export interface OutlineSymbol {
  name: string;
  detail: string;
  kind: number;
  from: number;
  to: number;
  nameFrom: number;
  nameTo: number;
  children: OutlineSymbol[];
}

const localName = (name: string | null) => (name ?? '').replace(/^[^:]*:/, '');

const unescape = (v: string) => v.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(quot|lt|gt|apos|amp));/g, (_, d, h, n) =>
  d ? String.fromCharCode(Number(d)) : h ? String.fromCharCode(parseInt(h, 16)) : ({ quot: '"', lt: '<', gt: '>', apos: "'", amp: '&' } as Record<string, string>)[n]);

function attr(el: XMLElement, key: string): string | undefined {
  const raw = el.attributes.find(a => a.key === key && a.value !== null)?.value;
  return raw != null ? unescape(raw) : undefined;
}

function children(root: XMLDocument | XMLElement, name: string): XMLElement[] {
  const out: XMLElement[] = [];
  const walk = (el: XMLElement) => { if (localName(el.name) === name) out.push(el); el.subElements.forEach(walk); };
  ('rootElement' in root ? (root.rootElement ? [root.rootElement] : []) : [root]).forEach(walk);
  return out;
}

function symbol(el: XMLElement, name: string, detail: string, kind: number, kids: OutlineSymbol[] = []): OutlineSymbol {
  const p = el.position, open = el.syntax?.openName;
  const from = p && p.startOffset >= 0 ? p.startOffset : 0, to = p && p.startOffset >= 0 ? p.endOffset + 1 : 0;
  const named = open && open.startOffset >= 0;
  return { name, detail, kind, from, to, nameFrom: named ? open.startOffset : from, nameTo: named ? open.endOffset + 1 : to, children: kids };
}

function ast(text: string): XMLDocument {
  const { cst, tokenVector } = parse(text);
  return buildAst(cst as Parameters<typeof buildAst>[0], tokenVector);
}

/** The outline of an ODD: tagsDecl, then each schemaSpec with its specs and processing models. */
export function oddOutline(text: string): OutlineSymbol[] {
  const doc = ast(text);
  return [
    ...children(doc, 'tagsDecl').map(tagsDecl),
    ...children(doc, 'schemaSpec').map(schemaSpec),
  ];
}

function tagsDecl(el: XMLElement): OutlineSymbol {
  const kids = el.subElements.flatMap(c => {
    switch (localName(c.name)) {
      case 'behaviour': {
        const ident = attr(c, 'ident') ?? '(no ident)', output = attr(c, 'output');
        return [symbol(c, output ? `${ident} · ${output}` : ident, '', Kind.Method)];
      }
      case 'rendition': return [symbol(c, attr(c, 'xml:id') ?? attr(c, 'source') ?? '(rendition)', '', Kind.Property)];
      case 'namespace': return [symbol(c, attr(c, 'name') ?? '(namespace)', '', Kind.Namespace)];
      default: return [];
    }
  });
  return symbol(el, 'tagsDecl', '', Kind.Namespace, kids);
}

function schemaSpec(el: XMLElement): OutlineSymbol {
  const source = attr(el, 'source');
  const kids = el.subElements.flatMap(c => {
    const ident = attr(c, 'ident') ?? '(no ident)', mode = attr(c, 'mode') ?? '';
    switch (localName(c.name)) {
      case 'moduleRef': {
        const include = attr(c, 'include'), except = attr(c, 'except');
        const detail = [include && `include: ${include}`, except && `except: ${except}`].filter(Boolean).join(' · ');
        return [symbol(c, attr(c, 'key') ?? '(no key)', detail, Kind.Module)];
      }
      case 'dataSpec': return [symbol(c, ident, mode, Kind.TypeParameter)];
      case 'macroSpec': return [symbol(c, ident, mode, Kind.Constant)];
      case 'classSpec': return [symbol(c, ident, [attr(c, 'type'), attr(c, 'mode')].filter(Boolean).join(' · '), Kind.Interface)];
      case 'elementSpec': return [symbol(c, ident, mode, Kind.Class, rules(c))];
      default: return [];
    }
  });
  return symbol(el, attr(el, 'ident') ?? '(no ident)', source ? `source: ${source}` : '', Kind.Package, kids);
}

/** Direct model, modelGrp and modelSequence children, nested as in the ODD. */
function rules(parent: XMLElement): OutlineSymbol[] {
  return parent.subElements.flatMap(c => {
    const type = localName(c.name);
    if (type !== 'model' && type !== 'modelGrp' && type !== 'modelSequence') return [];
    const label = [attr(c, 'output'), attr(c, 'predicate'), type === 'model' ? (attr(c, 'behaviour') ?? '(no behaviour)') : type]
      .filter(Boolean).join(' · ');
    const kind = type === 'modelGrp' ? Kind.Namespace : type === 'modelSequence' ? Kind.Array : Kind.Method;
    return [symbol(c, label, '', kind, type === 'model' ? [] : rules(c))];
  });
}

/** TEI elements that make up a document's structure. */
const STRUCTURE = new Set(['teiCorpus', 'TEI', 'teiHeader', 'text', 'front', 'body', 'back', 'group', 'div',
  'div1', 'div2', 'div3', 'div4', 'div5', 'div6', 'div7', 'floatingText']);

/** Text of an element, whitespace collapsed. */
function textOf(el: XMLElement): string {
  const parts: { at: number; text: string }[] = [];
  const walk = (e: XMLElement) => {
    for (const t of e.textContents) parts.push({ at: t.position.startOffset, text: t.text ?? '' });
    e.subElements.forEach(walk);
  };
  walk(el);
  return parts.sort((a, b) => a.at - b.at).map(p => p.text).join('').replace(/\s+/g, ' ').trim();
}

const MAX_LABEL = 60;

/** The outline of a TEI document: its texts and divisions, labelled by their heads. */
export function teiOutline(text: string): OutlineSymbol[] {
  const root = ast(text).rootElement;
  if (!root) return [];
  const walk = (el: XMLElement): OutlineSymbol[] => {
    const name = localName(el.name);
    const kids = el.subElements.flatMap(walk);
    if (!STRUCTURE.has(name)) return kids;
    if (name === 'teiHeader') return [symbol(el, 'teiHeader', '', Kind.Object)];
    const head = el.subElements.find(c => localName(c.name) === 'head');
    let label = head ? textOf(head) : '';
    if (label.length > MAX_LABEL) label = label.slice(0, MAX_LABEL).replace(/\s\S*$/, '') + '…';
    const type = attr(el, 'type'), n = attr(el, 'n'), id = attr(el, 'xml:id');
    const title = label || [type, n].filter(Boolean).join(' ') || name;
    const detail = [label ? name : '', id ? `#${id}` : ''].filter(Boolean).join(' ');
    return [symbol(el, title, detail, name.startsWith('div') ? Kind.Struct : Kind.Namespace, kids)];
  };
  return walk(root);
}

/** A plain element tree, for XML that is neither ODD nor TEI. */
export function elementOutline(text: string, max = 2000): OutlineSymbol[] {
  const root = ast(text).rootElement;
  let count = 0;
  const walk = (el: XMLElement): OutlineSymbol => {
    count++;
    const kids = count < max ? el.subElements.slice(0, max - count).map(walk) : [];
    const id = attr(el, 'xml:id') ?? attr(el, 'id');
    return symbol(el, el.name ?? '?', id ? `#${id}` : '', Kind.Object, kids);
  };
  return root ? [walk(root)] : [];
}
