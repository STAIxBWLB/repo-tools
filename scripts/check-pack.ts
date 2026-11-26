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
      throw new Error(`package.json must not declare ${field}`);
    }
  }
  for (const script of lifecycleScripts) {
    if (Object.hasOwn(manifest.scripts ?? {}, script)) {
      throw new Error(`package.json must not declare the ${script} lifecycle script`);
    }
  }

  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  })) as { files: { path: string }[] }[];
  if (!pack) throw new Error("npm pack did not report any package");
  for (const { path } of pack.files) {
    if (
      ["package.json", "README.md", "LICENSE"].includes(path) ||
      path.startsWith("src/") ||
      path.startsWith("bin/")
    ) continue;
    throw new Error(`unexpected package file: ${path}`);
  }
}

function checkNodeInstall(): void {
  const directory = mkdtempSync(join(tmpdir(), "repo-tools-pack-"));
  try {
    const [pack] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
      encoding: "utf8",
    })) as { filename: string }[];
    if (!pack) throw new Error("npm pack did not create a tarball");
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(directory, pack.filename)], {
      cwd: directory, stdio: "inherit",
    });
    execFileSync("node", ["--input-type=module", "-e", "await import('@staix/repo-tools')"], {
      cwd: directory, stdio: "inherit",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

checkPack();
if (process.argv.includes("--node-install")) checkNodeInstall();
