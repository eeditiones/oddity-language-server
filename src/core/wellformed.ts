// ── well-formedness alone, for documents without a schema ─────────────────
import { SaxesParser } from 'saxes';
import type { Problem } from './validate.ts';

/** The first syntax error in xml, if any, as validate() reports it. */
export function wellFormed(xml: string): Problem[] {
  const parser = new SaxesParser({ xmlns: true, position: true });
  const problems: Problem[] = [];
  parser.on('error', e => {
    if (problems.length) return;
    const at = Math.min(parser.position, xml.length);
    problems.push({ from: Math.max(0, at - 1), to: at, message: e.message.replace(/^(?:[^:\n]*:)?\d+:\d+: /, '') });
  });
  try { parser.write(xml).close(); } catch { /* reported through 'error' */ }
  return problems;
}
