/** @typedef {{path: string, required?: boolean}} StampDirectory */
/**
 * @typedef {{
 *   requiredDocuments: string[],
 *   stampDirectories: StampDirectory[],
 *   stampExcludedDocuments: string[],
 *   readmeStatusVersion: boolean,
 *   committedDirtinessPaths: string[],
 *   extraCommittedDirtinessPaths: string[],
 * }} DocsConfig
 */

/** @type {DocsConfig} */
const defaults = {
  requiredDocuments: ["README.md", "docs/security.md", "docs/operations.md", "docs/quickstart.md"],
  stampDirectories: [{ path: "docs" }, { path: "docs/addons" }, { path: "docs/agent-notes", required: true }],
  stampExcludedDocuments: ["docs/smoke.md", "docs/gsd-collaboration-analysis.md", "docs/roadmap.md"],
  readmeStatusVersion: true,
  committedDirtinessPaths: ["docs", "README.md", "package.json"],
  extraCommittedDirtinessPaths: [],
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** @param {unknown} value @returns {value is string} */
const isPath = value => typeof value === "string" &&
  !/[:*?\[\\\r\n]/.test(value) && !value.includes(String.fromCharCode(0)) &&
  value.split("/").every(part => part && part !== "." && part !== "..");

/** @param {string} key @param {string} fix @returns {never} */
function invalid(key, fix) {
  throw new Error(`repo-tools.json: ${key}: ${fix}`);
}

/** @param {string} key @param {unknown} value @returns {string[]} */
function paths(key, value) {
  if (!Array.isArray(value) || !value.every(isPath)) {
    invalid(key, "use an array of repository-relative paths without wildcards, or omit the key");
  }
  return value;
}

/** @param {unknown} value @returns {StampDirectory[]} */
function directories(value) {
  if (!Array.isArray(value)) invalid("stampDirectories", "use an array of directory objects, or omit the key");
  return value.map((entry, index) => {
    const key = `stampDirectories[${index}]`;
    if (!isObject(entry)) invalid(key, "use an object with a path and an optional required boolean");
    for (const field of Object.keys(entry)) {
      if (field !== "path" && field !== "required") invalid(`${key}.${field}`, "remove this unknown key");
    }
    if (!isPath(entry.path)) invalid(`${key}.path`, "use a repository-relative directory path without wildcards");
    if (Object.hasOwn(entry, "required") && typeof entry.required !== "boolean") {
      invalid(`${key}.required`, "use true or false, or omit the key");
    }
    return { path: entry.path, required: entry.required === true };
  });
}

/** @param {string} [text] @returns {DocsConfig} */
export function parseConfig(text) {
  if (text === undefined) return defaults;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid("file", "use valid JSON containing a configuration object");
  }
  if (!isObject(parsed)) invalid("file", "use a JSON object");
  const config = { ...defaults };
  for (const [key, value] of Object.entries(parsed)) {
    switch (key) {
      case "requiredDocuments":
      case "stampExcludedDocuments":
      case "committedDirtinessPaths":
      case "extraCommittedDirtinessPaths":
        config[key] = paths(key, value);
        break;
      case "stampDirectories":
        config.stampDirectories = directories(value);
        break;
      case "readmeStatusVersion":
        if (typeof value !== "boolean") invalid(key, "use true or false, or omit the key");
        config.readmeStatusVersion = value;
        break;
      default:
        invalid(key, "remove this unknown key");
    }
  }
  return config;
}
