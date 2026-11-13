// Editor-independent core: what opm studio and ODDity share.
export { validate, type Problem } from './core/validate.ts';
export { possibleAt, described, type Possible, type Suggestion } from './core/complete.ts';
export { wellFormed } from './core/wellformed.ts';
export { Grammars, type ReadText } from './core/schema.ts';
export {
  schemaFor, projectRoot, vocabulary, isOdd, xmlModels, isRngModel, xmlModelEdits, relativeHref, RNG_NS,
  type Files, type Defaults, type SchemaChoice, type TextEdit,
} from './core/association.ts';
export { scanTags, pairs, matchingTags, openElementAt, closeTagAt, type Tag } from './core/tags.ts';
export { oddOutline, teiOutline, elementOutline, Kind, type OutlineSymbol } from './core/outline.ts';
export { readToml, setToml, unsetToml, tomlString, type TomlConfig, type TomlValue } from './core/toml.ts';
export {
  elements, elementsAround, elementAround, selectElement, removeElementTags, splitElement, surroundWithElement,
  type Element, type ElementEdit, type Selection,
} from './core/elements.ts';
