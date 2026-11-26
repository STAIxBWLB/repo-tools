import { equal } from "node:assert/strict";
import { ghFixture } from "../fixtures/closing-refs/gh.mjs";
import { fixture } from "../fixtures/check-docs/repository.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lifecycleScripts = [
  "preinstall", "install", "postinstall", "prepublish",
  "preprepare", "prepare", "postprepare", "prepack", "postpack",
];

function checkPack(): void {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies"]) {
    const value = manifest[field];
    if (value === true || Object.keys(value ?? {}).length > 0) {
      throw new Error(`package.json must not declare ${field}; remove that field or move development-only entries to devDependencies`);
    }
  }
  for (const script of lifecycleScripts) {
    if (Object.hasOwn(manifest.scripts ?? {}, script)) {
      throw new Error(`package.json must not declare the ${script} lifecycle script; remove it or give the command a non-lifecycle name`);
    }
  }

  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  })) as { files: { path: string }[] }[];
  if (!pack) throw new Error("npm pack did not report a package; run npm pack --dry-run --json from the package root and check package.json");
  for (const { path } of pack.files) {
    if (
      ["package.json", "README.md", "LICENSE"].includes(path) ||
      path.startsWith("src/") ||
      path.startsWith("bin/")
    ) continue;
    throw new Error(`unexpected package file: ${path}; remove it from the package files list or use an allowed directory`);
  }
}

function checkNodeInstall(): void {
  const directory = mkdtempSync(join(tmpdir(), "repo-tools-pack-"));
  try {
    const [pack] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
      encoding: "utf8",
    })) as { filename: string }[];
    if (!pack) throw new Error("npm pack did not create a tarball; run npm pack --json from the package root and check package.json");
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(directory, pack.filename)], {
      cwd: directory, stdio: "inherit",
    });
    execFileSync("node", ["--input-type=module", "-e", "await import('@staix/repo-tools')"], {
      cwd: directory, stdio: "inherit",
    });
    fixture(root => {
      const output = execFileSync(join(directory, "node_modules", ".bin", "check-docs"), ["--committed", "--require-fresh", "--json"], {
        cwd: root, encoding: "utf8",
      });
      equal(JSON.parse(output).fresh, true);
    });
    const closing = execFileSync(join(directory, "node_modules", ".bin", "check-closing-refs"), {
      cwd: directory,
      encoding: "utf8",
      env: ghFixture(directory, "STAIxBWLB/repo-tools", { title: "Refs #1.", closingIssuesReferences: [] }),
    });
    equal(closing.trim(), "closing-refs: OK (0 closing reference(s) match the text)");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

checkPack();
if (process.argv.includes("--node-install")) checkNodeInstall();
