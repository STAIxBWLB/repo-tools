# repo-tools

Status: 0.1.0, initial release.

`@staix/repo-tools` provides documentation freshness and GitHub closing-reference checks as a development dependency. It runs on Bun 1.4.4 or later and Node 22 or later.

## Installation

```sh
npm install --save-dev --save-exact @staix/repo-tools@0.1.0
```

## Documentation freshness

```sh
npm exec -- check-docs [root] [--require-fresh] [--json] [--committed]
```

`root` defaults to the current working directory. Run against a Git checkout with full history. The checker reads `docs/verified.json`, whose `schemaVersion` is `1` and whose `documents` maps each document path to a `paths` array and a `verifiedAgainst` commit. It warns when covered paths changed after that stamp or have uncommitted edits. Invalid or missing evidence exits with status 1.

- `--require-fresh` makes stale stamps fail.
- `--json` emits one JSON object with overall freshness and the state of each document.
- `--committed` reads the manifest, configuration and evidence from `HEAD` and checks the configured evidence paths for uncommitted changes.

The package exports `checkDocs(root, { requireFresh, committed })` for programmatic use.

## Closing references

```sh
npm exec -- check-closing-refs 42
```

The CLI invokes `gh` to compare GitHub's reported closing references with the PR title, body and commit messages. An unintended reference exits with status 1. The positional PR number takes precedence over `PR_NUMBER`. Set `GITHUB_REPOSITORY` to select `owner/repo`; otherwise the CLI asks `gh` for the current repository. In CI, provide `GH_TOKEN` with read access to the PR, or use the reusable workflow below.

The package exports `closingMisuse`, `commitMisuse`, `intentionalCloses`, `keywordReferences` and `mentioned` for callers that supply their own PR data.

## Configuration

`check-docs` reads optional `repo-tools.json` at the root of the repository being checked. With `--committed`, it reads the file from `HEAD`. Omitted keys use the defaults below. Paths are repository-relative, with forward slashes and no wildcard or traversal segments.

| Key | Type | Default | Customize |
| --- | --- | --- | --- |
| `requiredDocuments` | Array of paths | `README.md`, `docs/security.md`, `docs/operations.md`, `docs/quickstart.md` | Replace the list of documents that need a stamp. An empty array disables this requirement. |
| `stampDirectories` | Array of objects with a `path` and optional boolean `required` | `docs`, `docs/addons`, and `docs/agent-notes`. Only `docs/agent-notes` is required to exist. | Replace the set of directories whose immediate Markdown entries need stamps. An empty array disables directory scanning. Set `required` to `true` to require a directory to exist. |
| `stampExcludedDocuments` | Array of paths | `docs/smoke.md`, `docs/gsd-collaboration-analysis.md`, `docs/roadmap.md` | Replace the dated-record exemptions for directory scanning. An empty array removes all exemptions. |
| `readmeStatusVersion` | Boolean | `true` | Set to `false` to skip checking that the README `Status: <version>,` line matches `package.json`. |
| `committedDirtinessPaths` | Array of paths | `docs`, `README.md`, `package.json` | Replace the paths that `--committed` requires to be clean. An empty array clears the default list. |
| `extraCommittedDirtinessPaths` | Array of paths | Empty array | Add paths to the committed dirtiness check. |

For a repository whose manifest lists every document it wants to check and whose README has no version line, the following minimal configuration removes the default required-document and directory checks. Use the per-copy configurations below to preserve a migrating repository's own requirements.

```json
{
  "requiredDocuments": [],
  "stampDirectories": [],
  "readmeStatusVersion": false
}
```

The checker still verifies the stamps and covered paths for documents listed in `docs/verified.json`. Unknown keys and invalid values fail with a diagnostic.

## Reusable workflows

Replace `REPO_TOOLS_COMMIT_SHA` with the full commit SHA of the version you reviewed. Both workflows run the repo-tools code from the pinned workflow commit. Use the 14-day age rule before adopting a new package version or workflow pin. See the [stage 3 adoption plan](https://github.com/STAIxBWLB/agent-hub/issues/1495).

```yaml
name: Repository gates
on:
  pull_request:
    types: [opened, edited, reopened, synchronize]
permissions: {}
jobs:
  closing-refs:
    permissions:
      contents: read
      pull-requests: read
    uses: STAIxBWLB/repo-tools/.github/workflows/closing-refs.yml@REPO_TOOLS_COMMIT_SHA
  docs-freshness:
    permissions:
      contents: read
    uses: STAIxBWLB/repo-tools/.github/workflows/docs-freshness.yml@REPO_TOOLS_COMMIT_SHA
```

`closing-refs.yml` uses the caller's PR and fails on an unintended close. `docs-freshness.yml` runs against the caller's committed history and warns on stale or invalid evidence.

## Migration

1. Pin the package exactly as a dev dependency and pin each workflow by full commit SHA after the 14-day age requirement. Keep the lockfile in the adoption PR.
2. For agent-mem, vault-mem, agent-research or agent-console, copy the matching [verified per-repository configuration](fixtures/check-docs/copies/) to `repo-tools.json`. The generic opt-out above drops the consumer's own required documents. See the [recorded verdicts and divergences](fixtures/DIVERGENCES.md) for the behavior changes to list in the adoption PR.
3. Replace the local `check-docs` script with the CLI and use the closing-reference workflow. agent-hub keeps its runtime `scripts/check-docs.mjs` for its release reader and uses the shared fixtures to check parity. It can replace its local closing-reference script with the workflow.
4. Run repo-tools and other repository scripts in a gate job without `id-token: write`. agent-mem and agent-research need to move their existing repository-script steps out of their publish jobs before or during adoption. Keep the publish job in the consumer repository.

## Release

The owner configures npm trusted publishing for `release.yml` and authorizes each tag. A version tag must match `package.json` and point to a commit on `origin/main`. The read-only gate checks the tag, documentation stamps, tests, and the npm package before handing its tarball to the OIDC publish job.

During 0.x, breaking CLI flag or output changes receive a minor version. Other changes receive a patch version. Version 1.0.0 follows consumer migration.
