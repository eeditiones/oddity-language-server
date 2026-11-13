// ── element editing: select, remove tags, split, surround ─────────────────
// The commands of opm studio's src/ui/xmlCommands.ts, on plain text: each takes
// the text and one selection and returns the changes plus the selection after them.
import { pairs, scanTags, type Tag } from './tags.ts';
import type { TextEdit } from './association.ts';

export interface Element {
  name: string;
  from: number;
  to: number;
  open: Tag;
  /** Missing for a self-closing element. */
  close?: Tag;
}

export interface Selection { anchor: number; head: number }

/** The result of a command for one selection: changes and the selection after them (counting only these changes). */
export interface ElementEdit { changes: TextEdit[]; selection: Selection }

/** Every complete element in text, in document order of their start tags. */
export function elements(text: string): Element[] {
  const tags = scanTags(text), pair = pairs(tags), out: Element[] = [];
  tags.forEach((t, i) => {
    if (t.kind === 'empty') out.push({ name: t.name, from: t.from, to: t.to, open: t });
    else if (t.kind === 'open' && pair.has(i)) {
      const close = tags[pair.get(i)!];
      out.push({ name: t.name, from: t.from, to: close.to, open: t, close });
    }
  });
  return out;
}

/** The elements holding from..to, innermost first. */
export function elementsAround(text: string, from: number, to = from): Element[] {
  return elements(text).filter(e => e.from <= from && e.to >= to).sort((a, b) => (a.to - a.from) - (b.to - b.from));
}

/**
 * The element around a range. With `outer`, one that is larger than the range,
 * so that selecting the element again moves on to its parent.
 */
export function elementAround(text: string, from: number, to: number, outer: boolean): Element | undefined {
  return elementsAround(text, from, to).find(e => !outer || from === to || e.from < from || e.to > to);
}

/** Select the element around the selection; again for its parent. */
export function selectElement(text: string, from: number, to: number): ElementEdit | null {
  const e = elementAround(text, from, to, true);
  return e ? { changes: [], selection: { anchor: e.from, head: e.to } } : null;
}

/** Remove the tags of the element around the selection, keeping its content selected. */
export function removeElementTags(text: string, from: number, to: number): ElementEdit | null {
  const e = elementAround(text, from, to, false);
  if (!e) return null;
  const { open, close } = e;
  if (!close) return { changes: [{ from: open.from, to: open.to, insert: '' }], selection: { anchor: open.from, head: open.from } };
  const length = open.to - open.from;
  return {
    changes: [{ from: open.from, to: open.to, insert: '' }, { from: close.from, to: close.to, insert: '' }],
    selection: { anchor: open.from, head: close.from - length },
  };
}

/**
 * Split the element around the cursor in two at the cursor: its end tag, then its
 * start tag again, with the same attributes but for an id, which has to stay unique.
 */
export function splitElement(text: string, pos: number): ElementEdit | null {
  // the innermost element whose content holds the cursor, not one whose tag does
  const e = elementsAround(text, pos).find(x => x.close && pos >= x.open.to && pos <= x.close.from);
  if (!e) return null;
  const start = text.slice(e.open.from, e.open.to).replace(/\s(xml:)?id\s*=\s*("[^"]*"|'[^']*')/g, '');
  const insert = `</${e.name}>${start}`;
  return { changes: [{ from: pos, to: pos, insert }], selection: { anchor: pos + insert.length, head: pos + insert.length } };
}

/** Wrap from..to in an element; `tag` is its name, optionally followed by attributes. The text stays selected. */
export function surroundWithElement(from: number, to: number, tag: string): ElementEdit {
  const start = `<${tag.trim()}>`, end = `</${tag.trim().split(/\s/)[0]}>`;
  return {
    changes: [{ from, to: from, insert: start }, { from: to, to, insert: end }],
    selection: { anchor: from + start.length, head: to + start.length },
  };
}
