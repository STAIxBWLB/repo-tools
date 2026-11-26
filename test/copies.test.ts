import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import cases from "../fixtures/check-docs/cases.json";
import { copies, flagKey, flagSets, verdictLabel, type Recording } from "../fixtures/check-docs/copy-matrix.ts";
import { fixture } from "../fixtures/check-docs/repository.mjs";
import { applyScenario, copyOnlyCases, seedCopyRequirements } from "../fixtures/check-docs/scenarios.ts";
import { checkDocs } from "../src/index.mjs";

const data = resolve(import.meta.dir, "../fixtures/check-docs/copies");
const divergenceFile = resolve(import.meta.dir, "../fixtures/DIVERGENCES.md");
const readme = readFileSync(resolve(import.meta.dir, "../README.md"), "utf8");
const optOut = /## Configuration[\s\S]*?```json\n([\s\S]*?)```/.exec(readme)?.[1];
if (!optOut) throw new Error("README Configuration must include the opt-out JSON example");

const comparisonCases = [...cases, ...copyOnlyCases];
const recordings = Object.entries(copies).map(([name, copy]) => {
  const record: Recording = JSON.parse(readFileSync(join(data, `${name}.json`), "utf8"));
  const config = name === "agent-hub" ? undefined : readFileSync(join(data, `${name}.repo-tools.json`), "utf8");
  return { name, copy, config, record, modes: flagSets(copy.flags).map(flagKey) };
});
test("copy recordings identify every pinned source and fixture", () => {
  for (const { name, copy, record } of recordings) {
    expect(record.commit, name).toMatch(/^[0-9a-f]{40}$/);
    expect(record.source, name).toBe(copy.source);
    expect(record.supportedFlags, name).toEqual([...copy.flags]);
    expect(Object.keys(record.cases).sort(), name).toEqual(comparisonCases.map(example => example.setup).sort());
  }
});

const expectedRows = new Map<string, string[]>();
for (const line of readFileSync(divergenceFile, "utf8").split("\n")) {
  if (!line.startsWith("| ")) continue;
  const [, copy, example, previous, current, minimal, configured, reason] = line.split("|").map(field => field.trim());
  if (copy === "Copy" || copy === "---") continue;
  if (copy === "agent-hub" && ["`AHUB_CHECK_ROADMAP=1`", "Omitted root"].includes(example ?? "")) continue;
  const setup = /^`([^`]+)` \(/.exec(example ?? "")?.[1];
  if (!setup || !comparisonCases.some(item => item.setup === setup) || !copy || !Object.hasOwn(copies, copy) || !reason) {
    throw new Error(`Invalid divergence row: ${line}`);
  }
  const rows = expectedRows.get(setup) ?? [];
  rows.push([copy, example, previous, current, minimal, configured].join(" | "));
  expectedRows.set(setup, rows);
}

// JSON changes presentation only. Strict mode rejects stale evidence that otherwise only warns.
function packageLabel(result: ReturnType<typeof checkDocs>, flags: string[]) {
  return verdictLabel({
    status: result.errors.length || (flags.includes("--require-fresh") && result.reports.length) ? 1 : 0,
    fresh: result.evidence.fresh,
  });
}

for (const example of comparisonCases) {
  test(`copy verdicts: ${example.setup}`, () => fixture((root, stamp, git) => {
    const actualRows: string[] = [];
    seedCopyRequirements(root, stamp, git);
    applyScenario(example.setup, root, stamp, git);
    const ordinary = checkDocs(root);
    const committed = checkDocs(root, { committed: true });
    const configPath = join(root, "repo-tools.json");
    let minimal: ReturnType<typeof checkDocs> | undefined;

    for (const { name, record, modes, config } of recordings) {
      const old = record.cases[example.setup];
      if (!old) throw new Error(`Missing recording for ${name}/${example.setup}`);
      expect(Object.keys(old).sort(), `${name}/${example.setup}`).toEqual([...modes].sort());
      let configured = ordinary;
      if (config) {
        writeFileSync(configPath, config);
        configured = checkDocs(root);
      }
      const differences = new Map<string, string[]>();
      for (const mode of modes) {
        const flags = mode.split(" ");
        const baseline = flags.includes("--committed") ? committed : ordinary;
        const current = packageLabel(baseline, flags);
        const oldVerdict = old[mode];
        const context = `${name}/${example.setup}/${mode}`;
        if (!oldVerdict) throw new Error(`Missing verdict for ${context}`);
        expect([0, 1], context).toContain(oldVerdict.status);
        expect(typeof oldVerdict.fresh, context).toBe("boolean");
        const previous = verdictLabel(oldVerdict);
        const afterConfig = config ? packageLabel(configured, flags) : current;
        expect(afterConfig, context).toBe(previous);
        if (previous === current) continue;
        if (!minimal) {
          writeFileSync(configPath, optOut);
          minimal = checkDocs(root);
        }
        const key = `${previous} | ${current} | ${packageLabel(minimal, flags)} | ${afterConfig}`;
        const differingModes = differences.get(key) ?? [];
        differingModes.push(mode);
        differences.set(key, differingModes);
      }
      for (const [verdicts, differingModes] of differences) {
        const scope = differingModes.length === modes.length ? "all supported modes" : differingModes.join("; ");
        actualRows.push(`${name} | \`${example.setup}\` (${scope}) | ${verdicts}`);
      }
    }
    expect(actualRows.sort()).toEqual([...(expectedRows.get(example.setup) ?? [])].sort());
  }), 60_000);
}
