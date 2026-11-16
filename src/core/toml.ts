// ── opm.toml: write the keys the page controls, read the few it needs ─────
// Reading parses the whole file with smol-toml (TOML 1.0). Writing does not
// serialize: the edits leave every other line of the file, comments included, as it is.
import { parse } from 'smol-toml';

export type TomlValue = string | string[];
export type TomlConfig = Record<string, Record<string, TomlValue>>;

const q = (s: string) => JSON.stringify(s);
const sectionEnd = (lines: string[], head: number) => {
  for (let i = head + 1; i < lines.length; i++) if (/^\s*\[/.test(lines[i])) return i;
  return lines.length;
};

/** Set section.key = value in place, keeping everything else in the file as it is. */
export function setToml(text: string, section: string, key: string, value: string): string {
  const line = `${key} = ${q(value)}`, lines = text ? text.split('\n') : [];
  const head = lines.findIndex(l => l.trim() === `[${section}]`);
  if (head < 0) return (text && !text.endsWith('\n') ? text + '\n' : text) + (text ? '\n' : '') + `[${section}]\n${line}\n`;
  const end = sectionEnd(lines, head), re = new RegExp(`^\\s*${key}\\s*=`);
  for (let i = head + 1; i < end; i++) if (re.test(lines[i])) { lines[i] = line; return lines.join('\n'); }
  lines.splice(head + 1, 0, line);
  return lines.join('\n');
}

/** Drop section.key, leaving the rest of the file as it is. */
export function unsetToml(text: string, section: string, key: string): string {
  const lines = text.split('\n'), head = lines.findIndex(l => l.trim() === `[${section}]`);
  if (head < 0) return text;
  const end = sectionEnd(lines, head), re = new RegExp(`^\\s*${key}\\s*=`);
  for (let i = head + 1; i < end; i++) if (re.test(lines[i])) { lines.splice(i, 1); break; }
  return lines.join('\n');
}

/**
 * The string and string-array values of a TOML file, by table: `[transform.web] template = …`,
 * `[transform] web.template = …` and `transform.web.template = …` all end up under
 * cfg['transform.web'].template. Other values and arrays of tables are left out.
 * A file that is not valid TOML gives no values, as opm would not run with it either.
 */
export function readToml(text: string): TomlConfig {
  let doc: Record<string, unknown>;
  try { doc = parse(text); } catch { return {}; }
  const cfg: TomlConfig = {};
  const walk = (table: Record<string, unknown>, path: string[]) => {
    for (const [key, v] of Object.entries(table)) {
      if (typeof v === 'string' || (Array.isArray(v) && v.length && v.every(x => typeof x === 'string'))) {
        (cfg[path.join('.')] ||= {})[key] = v as TomlValue;
      } else if (Array.isArray(v) && !v.length) {
        (cfg[path.join('.')] ||= {})[key] = [];
      } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        walk(v as Record<string, unknown>, [...path, key]);
      }
    }
  };
  walk(doc, []);
  return cfg;
}

/** A string value from the config, or '' when it is missing or not a string. */
export const tomlString = (cfg: TomlConfig, section: string, key: string): string => {
  const v = cfg[section]?.[key];
  return typeof v === 'string' ? v : '';
};
