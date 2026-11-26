import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { closingMisuse, commitMisuse, intentionalCloses, keywordReferences, mentioned } from "../src/index.mjs";
import { ghFixture } from "../fixtures/closing-refs/gh.mjs";
import fixtures from "../fixtures/closing-refs/cases.json";

const { repo, cases } = fixtures;
const bin = resolve(import.meta.dir, "../bin/check-closing-refs.mjs");

for (const [index, { check, issues, ...pr }] of cases.entries()) {
  test(`fixture ${index + 1} (${check}): ${pr.body}`, () => {
    const text = `${pr.title}\n${pr.body}`;
    if (check === "closing") {
      expect(closingMisuse(text, pr.closingIssuesReferences, repo)).toEqual(issues);
    } else if (check === "commits") {
      const commits = pr.commits.map((commit: { messageHeadline: string; messageBody?: string }) =>
        `${commit.messageHeadline}\n${commit.messageBody ?? ""}`);
      expect(commitMisuse(commits, text, repo)).toEqual(issues);
    } else {
      const dir = mkdtempSync(join(tmpdir(), "repo-tools-closing-refs-"));
      try {
        const result = spawnSync("node", [bin], { cwd: dir, encoding: "utf8", env: ghFixture(dir, repo, pr) });
        expect(result.status, result.stderr).toBe(issues.length ? 1 : 0);
        if (!issues.length) expect(result.stdout).toContain("closing-refs: OK");
        for (const issue of issues) expect(result.stderr).toContain(issue);
        if (issues.length && pr.commits.length) expect(result.stderr).toContain("a commit message of PR #753");
        else if (issues.length) {
          expect(result.stderr).toContain(`would close ${issues.join(", ")}`);
          expect(result.stderr).toContain("Refs #N");
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
}

test("keyword parser retains negation and accepted reference forms", () => {
  expect(keywordReferences("Fixes #1. Not fixes #2", repo)).toEqual([{ id: "staixbwlb/agent-hub#1", negated: false }, { id: "staixbwlb/agent-hub#2", negated: true }]);
  expect([...mentioned("see #1, org/r#2 and https://github.com/Org/R/issues/3", repo)].sort()).toEqual(["org/r#2", "org/r#3", "staixbwlb/agent-hub#1"]);
  expect([...intentionalCloses("Fixes #1. Does not close #2. Resolves org/r#3", repo)].sort()).toEqual(["org/r#3", "staixbwlb/agent-hub#1"]);
  expect([...intentionalCloses("closes #5 fix:#6 prefix #7 fixture #8", repo)].sort()).toEqual(["staixbwlb/agent-hub#5", "staixbwlb/agent-hub#6"]);
});

test("the CLI accepts a positional PR number and falls back to gh for the repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "repo-tools-closing-refs-"));
  try {
    const env: NodeJS.ProcessEnv = ghFixture(dir, repo, { title: "Refs #15." });
    delete env.GITHUB_REPOSITORY;
    const result = spawnSync("node", [bin, "753"], { cwd: dir, encoding: "utf8", env });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("closing-refs: OK");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI requires a PR number", () => {
  const result = spawnSync("node", [bin], { encoding: "utf8", env: { ...process.env, PR_NUMBER: "" } });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("usage:");
});
