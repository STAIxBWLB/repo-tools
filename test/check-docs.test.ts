import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { fixture } from "../fixtures/check-docs/repository.mjs";
import cases from "../fixtures/check-docs/cases.json";
import { checkDocs } from "../src/index.mjs";

const checker = resolve(import.meta.dir, "../bin/check-docs.mjs");

const check = (root: string) => spawnSync("node", [checker, root], { encoding: "utf8" });
function alter(root: string, modify: (manifest: any) => void) {
  const path = join(root, "docs/verified.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  modify(manifest); writeFileSync(path, JSON.stringify(manifest));
}

describe("documentation source verification gate", () => {
  test("release requires fresh stamps and preserves release-branch ancestry", () => fixture((root, _stamp, git) => {
    const base = git("rev-parse", "HEAD");
    git("checkout", "-qb", "release-fixture");
    writeFileSync(join(root, "src/covered.ts"), "release source\n");
    git("add", "."); git("commit", "-qm", "Release source");
    const reviewed = git("rev-parse", "HEAD");
    const strict = () => spawnSync("node", [checker, root, "--require-fresh"], { encoding: "utf8" });
    expect(strict().status).toBe(1);
    expect(strict().stderr).toContain("release requires fresh documentation stamps");
    alter(root, m => { for (const entry of Object.values(m.documents) as any[]) entry.verifiedAgainst = reviewed; });
    git("add", "."); git("commit", "-qm", "Review release source");
    const release = git("rev-parse", "HEAD");
    git("checkout", "-qb", "merge-fixture", base);
    git("merge", "--no-ff", "-m", "Merge release", release);
    const tree = git("rev-parse", "HEAD^{tree}");
    expect(strict().status).toBe(0);
    git("checkout", "-qb", "squash-fixture", base);
    git("merge", "--squash", release); git("commit", "-qm", "Squash release");
    expect(git("rev-parse", "HEAD^{tree}")).toBe(tree);
    const rejected = strict();
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("verified commit is not an ancestor of HEAD");
    expect(rejected.stderr).toContain("merge the release PR with a merge commit");
  }));
  test("ancestor stamps and unrelated commits stay fresh; source drift is sorted and counted once per commit", () => fixture((root, _stamp, git) => {
    writeFileSync(join(root, "src/unrelated.ts"), "unrelated\n"); git("add", "."); git("commit", "-qm", "Unrelated edit");
    expect(check(root).stdout).toBe("docs: OK (0 stale documents)\n");
    writeFileSync(join(root, "src/covered.ts"), "changed\n"); git("add", "."); git("commit", "-qm", "Covered edit");
    const result = check(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe([
      "docs: README.md: stale (1 source commit)",
      "docs: docs/agent-notes/example.md: stale (1 source commit)",
      "docs: docs/operations.md: stale (1 source commit)",
      "docs: docs/quickstart.md: stale (1 source commit)",
      "docs: docs/security.md: stale (1 source commit)",
      "docs: OK (5 stale documents)", "",
    ].join("\n"));
    expect(check(root).stdout).toBe(result.stdout);
    writeFileSync(join(root, "src/covered.ts"), "dirty\n");
    expect(check(root).stdout).toContain("1 source commit; uncommitted source changes");
  }));
  test("rejects README version drift", () => fixture((root) => {
    writeFileSync(join(root, "README.md"), "Status: 1.2.2, control protocol 13.\n");
    const result = check(root); expect(result.status).toBe(1);
    expect(result.stderr).toContain("README status version 1.2.2 differs from package.json 1.2.3");
  }));
  test("rejects nonexistent and nonancestor commit stamps", () => fixture((root, stamp, git) => {
    alter(root, (m) => { m.documents["README.md"].verifiedAgainst = "0".repeat(40); });
    expect(check(root).stderr).toContain("verified commit does not resolve");
    const sibling = git("commit-tree", `${stamp}^{tree}`, "-m", "Detached review");
    alter(root, (m) => { m.documents["README.md"].verifiedAgainst = sibling; });
    const result = check(root); expect(result.status).toBe(1);
    expect(result.stderr).toContain("verified commit is not an ancestor of HEAD");
  }));
  test("#1268 every page directly under docs/ and docs/addons/ needs a stamp, in the working tree and at HEAD; the smoke ledger does not", () => fixture((root, _stamp, git) => {
    mkdirSync(join(root, "docs/addons"));
    for (const page of ["docs/guide.md", "docs/addons/tool.md", "docs/smoke.md"]) writeFileSync(join(root, page), "Fixture\n");
    const strayed = check(root);
    expect(strayed.status).toBe(1);
    expect(strayed.stderr).toContain("missing manifest entry: docs/guide.md");
    expect(strayed.stderr).toContain("missing manifest entry: docs/addons/tool.md");
    expect(strayed.stderr).not.toContain("docs/smoke.md");
    git("add", "."); git("commit", "-qm", "Unstamped pages");
    const committed = spawnSync("node", [checker, root, "--json", "--committed"], { encoding: "utf8" });
    expect(committed.status).toBe(1);
    const stamp = git("rev-parse", "HEAD");
    alter(root, m => { for (const page of ["docs/guide.md", "docs/addons/tool.md"]) m.documents[page] = { verifiedAgainst: stamp, paths: ["src/covered.ts"] }; });
    expect(check(root).status).toBe(0);
  }));
  test("rejects missing coverage and removed sources", () => fixture((root) => {
    alter(root, (m) => { delete m.documents["docs/agent-notes/example.md"]; });
    expect(check(root).stderr).toContain("missing manifest entry: docs/agent-notes/example.md");
    rmSync(join(root, "src/covered.ts"));
    const result = check(root); expect(result.status).toBe(1);
    expect(result.stderr).toContain("covered path no longer exists: src/covered.ts");
  }));
});


test("structured docs evidence reports fresh stale and dirty states without changing release refusal (#257)", () => fixture((root, stamp, git) => {
  const machine = (strict = false) => spawnSync("node", [checker, "--json", root, ...(strict ? ["--require-fresh"] : [])], { encoding: "utf8" });
  const fresh = machine(); expect(fresh.status).toBe(0); expect(fresh.stderr).toBe("");
  const data = JSON.parse(fresh.stdout); expect(data).toMatchObject({ schemaVersion: 1, head: git("rev-parse", "HEAD"), version: "1.2.3", fresh: true, errors: 0 });
  expect(data.documents).toHaveLength(5); expect(data.documents.every((d: any) => d.state === "fresh" && d.verifiedAgainst === stamp && d.commits === 0 && d.dirty === false)).toBe(true);
  writeFileSync(join(root, "src/covered.ts"), "changed\n"); git("add", "."); git("commit", "-qm", "Covered edit");
  const stale = JSON.parse(machine().stdout); expect(stale.fresh).toBe(false); expect(stale.documents.every((d: any) => d.state === "stale" && d.commits === 1)).toBe(true);
  writeFileSync(join(root, "src/covered.ts"), "dirty\n"); expect(JSON.parse(machine().stdout).documents.every((d: any) => d.dirty)).toBe(true);
  const strict = machine(true); expect(strict.status).toBe(1); expect(JSON.parse(strict.stdout).fresh).toBe(false);
}));
test("release doc evidence rejects working-tree restamps and reads committed metadata (#257)", () => fixture((root, _stamp, git) => {
  writeFileSync(join(root, "src/covered.ts"), "new source\n");
  git("add", "."); git("commit", "-qm", "Change covered source");
  const head = git("rev-parse", "HEAD");
  alter(root, manifest => { for (const entry of Object.values(manifest.documents) as any[]) entry.verifiedAgainst = head; });
  const ordinary = spawnSync("node", [checker, root, "--json"], { encoding: "utf8" });
  expect(JSON.parse(ordinary.stdout).fresh).toBe(true);
  const committed = () => {
    const result = spawnSync("node", [checker, root, "--json", "--committed"], { encoding: "utf8" });
    return JSON.parse(result.stdout);
  };
  expect(committed().fresh).toBe(false);
  git("add", "docs/verified.json"); expect(committed().fresh).toBe(false);
  git("commit", "-qm", "Commit reviewed stamps"); expect(committed().fresh).toBe(true);
  writeFileSync(join(root, "package.json"), '{"version":"9.9.9"}\n');
  const dirty = committed(); expect(dirty.version).toBe("1.2.3"); expect(dirty.fresh).toBe(false);
}));
test("structured invalid stamp evidence preserves uncertainty and excludes raw error payloads (#257)", () => fixture((root, stamp, git) => {
  alter(root, m => { m.documents["README.md"].verifiedAgainst = "PRIVATE_INVALID_STAMP_MARKER"; });
  const invalid = spawnSync("node", [checker, root, "--json"], { encoding: "utf8" }); expect(invalid.status).toBe(1); expect(invalid.stdout + invalid.stderr).not.toContain("PRIVATE_INVALID_STAMP_MARKER");
  expect(JSON.parse(invalid.stdout).documents.find((d: any) => d.path === "README.md").state).toBe("unknown");
  const sibling = git("commit-tree", `${stamp}^{tree}`, "-m", "Detached review"); alter(root, m => { m.documents["README.md"].verifiedAgainst = sibling; });
  const rejected = spawnSync("node", [checker, root, "--json"], { encoding: "utf8" }); expect(rejected.status).toBe(1); expect(JSON.parse(rejected.stdout).documents.find((d: any) => d.path === "README.md").state).toBe("nonancestor");
}));
test("documentation readbacks never execute the repository fsmonitor helper (#257)", () => fixture((root, _stamp, git) => {
  const marker = join(root, "monitor-ran"), script = join(root, "monitor.sh"); writeFileSync(script, '#!/bin/sh\nprintf marker > "' + marker + '"\n'); chmodSync(script, 0o755); git("config", "core.fsmonitor", script);
  const result = spawnSync("node", [checker, root, "--json"], { encoding: "utf8" }); expect(result.status).toBe(0); expect(JSON.parse(result.stdout).fresh).toBe(true); expect(existsSync(marker)).toBe(false);
}));
test("documentation fixture commits suppress detached maintenance while the fsmonitor trap remains effective (#369)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ahub-docs-maintenance-")), trace = join(dir, "git.jsonl"), previous = process.env.GIT_TRACE2_EVENT;
  try {
    process.env.GIT_TRACE2_EVENT = trace;
    fixture((root, _stamp, git) => {
      git("config", "gc.auto", "1");
      writeFileSync(join(root, "src/covered.ts"), "force fixture commit\n"); git("add", "."); git("commit", "-qm", "Exercise fixture maintenance isolation");
      const events = readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
      expect(events.some(event => event.event === "child_start" && event.argv?.includes("maintenance"))).toBe(false);
      const marker = join(root, "control-monitor-ran"), script = join(root, "control-monitor.sh");
      writeFileSync(script, '#!/bin/sh\nprintf marker > "' + marker + '"\n'); chmodSync(script, 0o755);
      for (const enabled of [false, true]) {
        const result = spawnSync("git", ["--no-pager", "-c", `core.fsmonitor=${enabled ? script : "false"}`, "-c", "maintenance.auto=false", "-c", "gc.auto=0", "pack-objects", "--stdout", "--all", "--indexed-objects"], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
        expect(result.status).toBe(0); expect(existsSync(marker)).toBe(enabled);
      }
    });
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT; else process.env.GIT_TRACE2_EVENT = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
test("documentation drift checks never execute configured clean or process filters (#257)", () => fixture((root, _stamp, git) => {
  writeFileSync(join(root, ".gitattributes"), "src/covered.ts filter=metadata-trap\n");
  git("add", ".gitattributes"); git("commit", "-qm", "Declare fixture filter attribute");
  const marker = join(root, "filter-ran"), script = join(root, "filter.sh");
  writeFileSync(script, '#!/bin/sh\nprintf marker > "' + marker + '"\ncat\n'); chmodSync(script, 0o755);
  for (const helper of ["clean", "process"]) {
    git("config", `filter.metadata-trap.${helper}`, script);
    // Match the indexed byte length so legacy git status must hash through its configured filter.
    writeFileSync(join(root, "src/covered.ts"), helper === "clean" ? "changed\n" : "altered\n");
    if (helper === "clean") {
      git("status", "--porcelain", "--", "src/covered.ts");
      expect(existsSync(marker)).toBe(true);
      rmSync(marker);
    }
    const result = spawnSync("node", [checker, root, "--json"], { encoding: "utf8", timeout: 15_000 });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout).fresh).toBe(false);
    expect(existsSync(marker)).toBe(false);
  }
}));

test("committed docs reject ignored document and coverage ghosts absent from HEAD (#257)", () => {
  for (const kind of ["document", "coverage"] as const) fixture((root, stamp, git) => {
    const path = kind === "document" ? "docs/ghost.md" : "src/ghost.ts";
    writeFileSync(join(root, ".gitignore"), path + "\n");
    alter(root, m => {
      if (kind === "document") m.documents[path] = { verifiedAgainst: stamp, paths: ["src/covered.ts"] };
      else m.documents["README.md"].paths = [path];
    });
    git("add", "."); git("commit", "-qm", "Record missing ignored evidence");
    writeFileSync(join(root, path), "ignored local copy\n");
    expect(git("ls-files", "--", path)).toBe("");
    const result = spawnSync("node", [checker, root, "--json", "--committed"], { encoding: "utf8" });
    expect(result.status).toBe(1); expect(JSON.parse(result.stdout).fresh).toBe(false);
    expect(JSON.parse(result.stdout).errors).toBeGreaterThan(0);
  });
});

test("committed coverage preserves tracked wildcards and ignores local note-name additions (#257)", () => fixture((root, _stamp, git) => {
  alter(root, m => { for (const entry of Object.values(m.documents) as any[]) entry.paths = ["src/covered*.ts"]; });
  writeFileSync(join(root, ".gitignore"), "docs/agent-notes/ignored.md\n");
  git("add", "."); git("commit", "-qm", "Use wildcard source coverage");
  writeFileSync(join(root, "docs/agent-notes/ignored.md"), "local only\n");
  const result = spawnSync("node", [checker, root, "--json", "--committed"], { encoding: "utf8" });
  expect(result.status).toBe(0); expect(JSON.parse(result.stdout).fresh).toBe(true);
}));

for (const example of cases) {
  test(`fixture: ${example.name}`, () => fixture((root, stamp, git) => {
    switch (example.setup) {
      case "fresh":
        break;
      case "stale":
        writeFileSync(join(root, "src/covered.ts"), "changed\n");
        git("add", "src/covered.ts");
        git("commit", "-qm", "Change covered source");
        break;
      case "dirty":
        writeFileSync(join(root, "README.md"), "uncommitted\n");
        break;
      case "nonancestor": {
        const sibling = git("commit-tree", `${stamp}^{tree}`, "-m", "Detached review");
        alter(root, manifest => { manifest.documents["README.md"].verifiedAgainst = sibling; });
        break;
      }
      case "invalid":
        alter(root, manifest => { manifest.schemaVersion = 2; });
        break;
      default:
        throw new Error(`Unknown fixture setup: ${example.setup}`);
    }
    const flags: readonly string[] = example.flags;
    const result = spawnSync("node", [checker, "--json", ...flags], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(example.status);
    const evidence = JSON.parse(result.stdout);
    expect(evidence.fresh).toBe(example.fresh);
    expect(evidence.documents.find((doc: { path: string }) => doc.path === "README.md")?.state).toBe(example.state);
    expect(checkDocs(root, {
      committed: flags.includes("--committed"),
      requireFresh: flags.includes("--require-fresh"),
    }).evidence).toEqual(evidence);
  }));
}
