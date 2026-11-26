import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fixture } from "../fixtures/check-docs/repository.mjs";

const gate = resolve(import.meta.dir, "../scripts/verify-release-tag.ts");

test("release gate validates the matching tag and rejects a wrong version or an off-main commit", () => fixture((root, _stamp, git) => {
  const run = (tag: string) => spawnSync("node", [gate], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GITHUB_REF_NAME: tag },
  });

  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const matched = run("v1.2.3");
  expect(matched.status, matched.stderr).toBe(0);
  expect(matched.stdout).toContain("is on origin/main");

  const wrongVersion = run("v9.9.9");
  expect(wrongVersion.status).toBe(1);
  expect(wrongVersion.stderr).toContain("does not match package.json version 1.2.3");

  writeFileSync(join(root, "src/covered.ts"), "off-main change\n");
  git("add", "src/covered.ts");
  git("commit", "-qm", "Create an off-main release candidate");
  const offMain = run("v1.2.3");
  expect(offMain.status).toBe(1);
  expect(offMain.stderr).toContain("tagged commit is not on origin/main");

  git("update-ref", "-d", "refs/remotes/origin/main");
  const missingHistory = run("v1.2.3");
  expect(missingHistory.status).toBe(1);
  expect(missingHistory.stderr).toContain("fetch origin/main and the complete tag history");
}));
