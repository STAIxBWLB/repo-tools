import { appendFileSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function alter(root: string, modify: (manifest: any) => void) {
  const path = join(root, "docs/verified.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  modify(manifest);
  writeFileSync(path, JSON.stringify(manifest));
}

export function applyScenario(setup: string, root: string, stamp: string, git: (...args: string[]) => string): void {
  switch (setup) {
    case "fresh":
      break;
    case "stale":
      writeFileSync(join(root, "src/covered.ts"), "changed\n");
      git("add", "src/covered.ts");
      git("commit", "-qm", "Change covered source");
      break;
    case "dirty":
      appendFileSync(join(root, "README.md"), "uncommitted note\n");
      break;
    case "nonancestor": {
      const sibling = git("commit-tree", `${stamp}^{tree}`, "-m", "Detached review");
      alter(root, manifest => { manifest.documents["README.md"].verifiedAgainst = sibling; });
      break;
    }
    case "invalid":
      alter(root, manifest => { manifest.schemaVersion = 2; });
      break;
    case "missing-required":
      alter(root, manifest => { delete manifest.documents["docs/security.md"]; });
      break;
    case "unstamped-page":
      mkdirSync(join(root, "docs/addons"));
      writeFileSync(join(root, "docs/addons/new.md"), "New doc\n");
      git("add", "docs/addons/new.md");
      git("commit", "-qm", "Add new documentation page");
      break;
    case "missing-notes":
      git("rm", "-r", "docs/agent-notes");
      git("commit", "-qm", "Remove notes directory");
      alter(root, manifest => { delete manifest.documents["docs/agent-notes/example.md"]; });
      git("add", "docs/verified.json");
      git("commit", "-qm", "Remove old stamp");
      break;
    case "missing-version":
      writeFileSync(join(root, "README.md"), "# Fixture\n");
      git("add", "README.md");
      git("commit", "-qm", "Remove status line");
      break;
    default: {
      const example = copyOnlyCases.find(example => example.setup === setup);
      if (!example) throw new Error(`Unknown fixture setup: ${setup}`);
      example.apply(root, git);
    }
  }
}

// These are the pinned copies' required sets, minus the README shared by all.
const copyRequiredDocuments = [
  "docs/contracts.md", "docs/purge.md", "docs/curated-shard-migration.md",
  "docs/jcode.md", "docs/opencode.md", "docs/gemini-cli.md", "docs/qwen-code.md",
  "docs/antigravity.md", "docs/setup.md", "docs/cli.md", "docs/sync.md",
  "docs/development.md", "docs/recall.md",
  "docs/cutover-checklist.md", "docs/release-readiness.md", "docs/release-workflow.md",
  "src/playbook.ts", "CHANGELOG.md",
];

type CopyOnlyCase = {
  setup: string;
  apply: (root: string, git: (...args: string[]) => string) => void;
};

export const copyOnlyCases: CopyOnlyCase[] = [
  ...copyRequiredDocuments.map(path => ({
    setup: `missing-copy-document:${path}`,
    apply(root: string, git: (...args: string[]) => string) {
      git("rm", path);
      alter(root, manifest => { delete manifest.documents[path]; });
      git("add", "docs/verified.json");
      git("commit", "-qm", "Remove a document required by a copy");
    },
  })),
  {
    setup: "missing-reference-directory",
    apply(root) { rmdirSync(join(root, "docs/reference")); },
  },
  {
    setup: "unstamped-reference-page",
    apply(root, git) {
      writeFileSync(join(root, "docs/reference/new.md"), "Reference fixture\n");
      git("add", "docs/reference/new.md");
      git("commit", "-qm", "Add unstamped reference page");
    },
  },
];

export function seedCopyRequirements(root: string, stamp: string, git: (...args: string[]) => string): void {
  mkdirSync(join(root, "docs/reference")); // vault-mem requires the directory even when it contains no pages.
  for (const path of copyRequiredDocuments) writeFileSync(join(root, path), "Fixture\n");
  alter(root, manifest => {
    for (const path of copyRequiredDocuments) manifest.documents[path] = { verifiedAgainst: stamp, paths: ["src/covered.ts"] };
  });
  git("add", ".");
  git("commit", "-qm", "Record documentation required by the reference copies");
}
