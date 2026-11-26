import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import cases from "../fixtures/check-docs/cases.json";
import { copies, flagKey, flagSets, readVerdict, verdictLabel, type Recording } from "../fixtures/check-docs/copy-matrix.ts";
import { fixture } from "../fixtures/check-docs/repository.mjs";
import { applyScenario, seedCopyRequirements } from "../fixtures/check-docs/scenarios.ts";

const data = resolve(import.meta.dir, "../fixtures/check-docs/copies");
const bin = resolve(import.meta.dir, "../bin/check-docs.mjs");
const divergenceFile = resolve(import.meta.dir, "../fixtures/DIVERGENCES.md");

const recordings = Object.entries(copies).map(([name, copy]) => {
  const record: Recording = JSON.parse(readFileSync(join(data, `${name}.json`), "utf8"));
  return { name, copy, record, modes: flagSets(copy.flags).map(flagKey) };
});
test("copy recordings identify every pinned source and fixture", () => {
  for (const { name, copy, record } of recordings) {
    expect(record.commit, name).toMatch(/^[0-9a-f]{40}$/);
    expect(record.source, name).toBe(copy.source);
    expect(record.supportedFlags, name).toEqual([...copy.flags]);
    expect(Object.keys(record.cases).sort(), name).toEqual(cases.map(example => example.setup).sort());
  }
});

const expectedRows = new Map<string, string[]>();
for (const line of readFileSync(divergenceFile, "utf8").split("\n")) {
  if (!line.startsWith("| ")) continue;
  const [, copy, example, previous, current, reason] = line.split("|").map(field => field.trim());
  if (copy === "Copy" || copy === "---" || example === "`AHUB_CHECK_ROADMAP=1`") continue;
  const setup = /^`([^`]+)` \(/.exec(example ?? "")?.[1];
  if (!setup || !cases.some(item => item.setup === setup) || !copy || !Object.hasOwn(copies, copy) || !reason) {
    throw new Error(`Invalid divergence row: ${line}`);
  }
  const rows = expectedRows.get(setup) ?? [];
  rows.push([copy, example, previous, current].join(" | "));
  expectedRows.set(setup, rows);
}

for (const example of cases) {
  test(`copy verdicts: ${example.setup}`, () => fixture((root, stamp, git) => {
    const actualRows: string[] = [];
    seedCopyRequirements(root, stamp, git);
    applyScenario(example.setup, root, stamp, git);
    const packageVerdicts = new Map(flagSets(copies["agent-hub"].flags).map(flags => {
      const result = spawnSync("node", [bin, root, ...flags], { cwd: root, encoding: "utf8", timeout: 20_000 });
      return [flagKey(flags), verdictLabel(readVerdict(result, flags.includes("--json")))];
    }));
    for (const { name, record, modes } of recordings) {
      const old = record.cases[example.setup];
      if (!old) throw new Error(`Missing recording for ${name}/${example.setup}`);
      expect(Object.keys(old).sort(), `${name}/${example.setup}`).toEqual([...modes].sort());
      const differences = new Map<string, string[]>();
      for (const mode of modes) {
        const oldVerdict = old[mode];
        const current = packageVerdicts.get(mode);
        if (!oldVerdict || !current) throw new Error(`Missing verdict for ${name}/${example.setup}/${mode}`);
        expect([0, 1], `${name}/${example.setup}/${mode}`).toContain(oldVerdict.status);
        expect(typeof oldVerdict.fresh).toBe("boolean");
        const previous = verdictLabel(oldVerdict);
        if (previous === current) continue;
        const key = `${previous} | ${current}`;
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
