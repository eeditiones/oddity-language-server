// Light helpers for editors, without salve: tag matching and closing, xml-model and opm.toml edits.
export { scanTags, pairs, matchingTags, openElementAt, closeTagAt, type Tag } from './core/tags.ts';
export {
  xmlModels, isRngModel, xmlModelEdits, relativeHref, RNG_NS, type TextEdit,
} from './core/association.ts';
export { readToml, setToml, unsetToml, tomlString, type TomlConfig, type TomlValue } from './core/toml.ts';
export {
  elements, elementsAround, elementAround, selectElement, removeElementTags, splitElement, surroundWithElement,
  type Element, type ElementEdit, type Selection,
} from './core/elements.ts';
