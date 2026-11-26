import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fixture } from "../fixtures/check-docs/repository.mjs";
import { checkDocs } from "../src/index.mjs";

function configure(root: string, config: object) {
  writeFileSync(join(root, "repo-tools.json"), JSON.stringify(config));
}

test("an empty config object inherits every default", () => fixture(root => {
  const baseline = checkDocs(root);
  configure(root, {});
  expect(checkDocs(root)).toEqual(baseline);
}));

test("consumers can use only their manifest without agent-hub-specific docs or README version", () => fixture((root, stamp) => {
  rmSync(join(root, "docs/agent-notes"), { recursive: true });
  rmSync(join(root, "docs/security.md"));
  rmSync(join(root, "docs/operations.md"));
  rmSync(join(root, "docs/quickstart.md"));
  writeFileSync(join(root, "README.md"), "# Example\n");
  writeFileSync(join(root, "docs/verified.json"), JSON.stringify({
    schemaVersion: 1,
    documents: { "README.md": { paths: ["src/covered.ts"], verifiedAgainst: stamp } },
  }));
  expect(checkDocs(root).evidence.fresh).toBe(false);
  configure(root, { requiredDocuments: [], stampDirectories: [], readmeStatusVersion: false });
  expect(checkDocs(root).evidence).toMatchObject({ fresh: true, version: "1.2.3" });
  writeFileSync(join(root, "src/covered.ts"), "changed\n");
  expect(checkDocs(root).evidence.fresh).toBe(false);
}));

test("required docs, stamp directories and record exemptions can be replaced independently", () => fixture(root => {
  mkdirSync(join(root, "guides"));
  writeFileSync(join(root, "guides/guide.md"), "Guide\n");
  writeFileSync(join(root, "guides/log.md"), "Historical record\n");
  mkdirSync(join(root, "guides/nested"));
  writeFileSync(join(root, "guides/nested/deep.md"), "Deep\n");
  configure(root, {
    requiredDocuments: ["CONTRIBUTING.md"],
    stampDirectories: [{ path: "guides", required: true }, { path: "optional" }],
    stampExcludedDocuments: ["guides/log.md"],
  });
  expect(checkDocs(root).errors).toEqual([
    "missing manifest entry: CONTRIBUTING.md",
    "missing manifest entry: guides/guide.md",
  ]);
  configure(root, { stampDirectories: [{ path: "missing", required: true }] });
  expect(checkDocs(root).errors[0]).toContain("missing");
}));

test("the dated-record list can be emptied", () => fixture(root => {
  writeFileSync(join(root, "docs/smoke.md"), "Smoke ledger\n");
  expect(checkDocs(root).evidence.fresh).toBe(true);
  configure(root, { stampExcludedDocuments: [] });
  expect(checkDocs(root).errors).toEqual(["missing manifest entry: docs/smoke.md"]);
}));

test("committed configuration comes from HEAD, including added dirtiness paths", () => fixture((root, _stamp, git) => {
  writeFileSync(join(root, "src/unrelated.ts"), "dirty\n");
  configure(root, { extraCommittedDirtinessPaths: ["src/unrelated.ts"] });
  expect(checkDocs(root, { committed: true }).evidence.fresh).toBe(true);
  git("add", "repo-tools.json");
  git("commit", "-qm", "Configure more evidence paths");
  expect(checkDocs(root, { committed: true }).errors).toContain("documentation evidence files are dirty or unavailable");
  configure(root, {});
  expect(checkDocs(root, { committed: true }).evidence.fresh).toBe(false);
}));

test("committed dirtiness checks honor an empty or replacement list", () => fixture((root, _stamp, git) => {
  configure(root, { committedDirtinessPaths: [] });
  git("add", "repo-tools.json");
  git("commit", "-qm", "Clear evidence dirtiness paths");
  writeFileSync(join(root, "README.md"), "Working tree only\n");
  expect(checkDocs(root, { committed: true }).evidence.fresh).toBe(true);
  configure(root, { committedDirtinessPaths: ["src/unrelated.ts"] });
  git("add", "repo-tools.json");
  git("commit", "-qm", "Replace evidence dirtiness paths");
  expect(checkDocs(root, { committed: true }).evidence.fresh).toBe(true);
  writeFileSync(join(root, "src/unrelated.ts"), "dirty\n");
  expect(checkDocs(root, { committed: true }).evidence.fresh).toBe(false);
}));

test("invalid config names the field and how to correct it", () => fixture((root, _stamp, git) => {
  const cases: [object, string, string][] = [
    [{ typo: false }, "typo", "remove this unknown key"],
    [{ requiredDocuments: "../README.md" }, "requiredDocuments", "use an array"],
    [{ requiredDocuments: ["../README.md"] }, "requiredDocuments", "repository-relative paths"],
    [{ stampDirectories: "docs" }, "stampDirectories", "use an array"],
    [{ stampDirectories: [{ path: "docs", required: 1 }] }, "stampDirectories[0].required", "use true or false"],
    [{ stampDirectories: [{ path: "docs", recurse: true }] }, "stampDirectories[0].recurse", "remove this unknown key"],
    [{ stampDirectories: [{ path: "/docs" }] }, "stampDirectories[0].path", "repository-relative directory"],
    [{ stampExcludedDocuments: ["docs/*.md"] }, "stampExcludedDocuments", "without wildcards"],
    [{ readmeStatusVersion: "false" }, "readmeStatusVersion", "use true or false"],
    [{ committedDirtinessPaths: null }, "committedDirtinessPaths", "use an array"],
    [{ extraCommittedDirtinessPaths: [""] }, "extraCommittedDirtinessPaths", "repository-relative paths"],
  ];
  for (const [config, key, fix] of cases) {
    configure(root, config);
    const message = checkDocs(root).errors[0];
    expect(message).toStartWith(`repo-tools.json: ${key}: `);
    expect(message).toContain(fix);
  }
  writeFileSync(join(root, "repo-tools.json"), "not JSON");
  expect(checkDocs(root).errors[0]).toContain("use valid JSON");
  expect(checkDocs(root, { committed: true }).evidence.fresh).toBe(true);
  git("add", "repo-tools.json");
  git("commit", "-qm", "Record an invalid configuration");
  expect(checkDocs(root, { committed: true }).errors[0]).toContain("use valid JSON");
}));
