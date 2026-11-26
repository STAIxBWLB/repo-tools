// Usage: bun scripts/record-copy-verdicts.ts /path/to/directory/containing/sibling/checkouts [copy]
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { copies, flagKey, flagSets, readVerdict, type Recording } from "../fixtures/check-docs/copy-matrix.ts";
import cases from "../fixtures/check-docs/cases.json";
import { fixture } from "../fixtures/check-docs/repository.mjs";
import { applyScenario, seedCopyRequirements } from "../fixtures/check-docs/scenarios.ts";

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error("Pass the directory containing the five sibling repository checkouts.");
const requestedCopy = process.argv[3];
if (requestedCopy && !Object.hasOwn(copies, requestedCopy)) {
  throw new Error(`Unknown copy: ${requestedCopy}; use one of ${Object.keys(copies).join(", ")}`);
}
const output = resolve(import.meta.dir, "../fixtures/check-docs/copies");
const snapshots = mkdtempSync(join(tmpdir(), "repo-tools-copies-"));
const env = { ...process.env };
delete env.AHUB_CHECK_ROADMAP;
delete env.GITHUB_ACTIONS;

try {
  const recordings = new Map<string, Recording>();
  for (const [name, copy] of Object.entries(copies)) {
    if (requestedCopy && name !== requestedCopy) continue;
    const checkout = resolve(sourceRoot, name);
    const git = (...args: string[]) => execFileSync("git", ["--no-pager", ...args], { cwd: checkout, encoding: "utf8" });
    const commit = git("rev-parse", "--verify", "origin/main^{commit}").trim();
    const snapshot = join(snapshots, name);
    for (const path of [copy.source, ...("files" in copy ? copy.files : [])]) {
      const target = join(snapshot, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, git("show", "--no-ext-diff", "--no-textconv", `${commit}:${path}`));
    }
    const entry = join(snapshot, copy.source);
    const casesByFlag: Recording["cases"] = {};
    for (const example of cases) {
      fixture((root, stamp, fixtureGit) => {
        seedCopyRequirements(root, stamp, fixtureGit);
        applyScenario(example.setup, root, stamp, fixtureGit);
        casesByFlag[example.setup] = Object.fromEntries(flagSets(copy.flags).map(flags => {
          const runtime = copy.source.endsWith(".ts") ? process.execPath : "node";
          const result = spawnSync(runtime, [entry, root, ...flags], { cwd: root, env, encoding: "utf8", timeout: 20_000 });
          try {
            return [flagKey(flags), readVerdict(result, flags.includes("--json"))];
          } catch (error) {
            throw new Error(`Cannot record ${name}/${example.setup}/${flagKey(flags)}`, { cause: error });
          }
        }));
      });
    }
    recordings.set(name, { commit, source: copy.source, supportedFlags: copy.flags, cases: casesByFlag });
    console.log(`Recorded ${name} at ${commit}`);
  }
  mkdirSync(output, { recursive: true });
  for (const [name, record] of recordings) {
    writeFileSync(join(output, `${name}.json`), JSON.stringify(record, null, 2) + "\n");
  }
} finally {
  rmSync(snapshots, { recursive: true, force: true });
}
