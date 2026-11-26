// Keep the installed entry point runnable on Node 22 without type stripping.
export { checkDocs } from "./check-docs/index.mjs";
export { closingMisuse, commitMisuse, intentionalCloses, keywordReferences, mentioned } from "./check-closing-refs/index.mjs";
