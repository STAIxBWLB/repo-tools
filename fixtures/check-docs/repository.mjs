import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * @param {(root: string, stamp: string, git: (...args: string[]) => string) => void} run
 */
export function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "ahub-docs-"));
  /** @param {...string} args */
  const git = (...args) => {
    const result = spawnSync("git", ["--no-pager", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "-c", "maintenance.auto=false", "-c", "gc.auto=0", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  try {
    mkdirSync(join(root, "docs/agent-notes"), { recursive: true });
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/covered.ts"), "initial\n");
    writeFileSync(join(root, "src/unrelated.ts"), "initial\n");
    writeFileSync(join(root, "package.json"), '{"version":"1.2.3"}\n');
    const docs = ["README.md", "docs/security.md", "docs/operations.md", "docs/quickstart.md", "docs/agent-notes/example.md"];
    for (const doc of docs) writeFileSync(join(root, doc), doc === "README.md" ? "Status: 1.2.3, control protocol 13.\n" : "Fixture\n");
    git("init", "-q"); git("add", "."); git("commit", "-qm", "Initial fixture");
    const stamp = git("rev-parse", "HEAD");
    writeFileSync(join(root, "docs/verified.json"), JSON.stringify({ schemaVersion: 1, documents: Object.fromEntries(docs.map((doc) => [doc, { verifiedAgainst: stamp, paths: ["src/covered.ts"] }])) }));
    git("add", "."); git("commit", "-qm", "Record reviewed documentation");
    run(root, stamp, git);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
