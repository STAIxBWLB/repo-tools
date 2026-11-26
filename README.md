# repo-tools

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

For a repository whose manifest lists every document it wants to check and whose README has no version line, use:

```json
{
  "requiredDocuments": [],
  "stampDirectories": [],
  "readmeStatusVersion": false
}
```

The checker still verifies the stamps and covered paths for documents listed in `docs/verified.json`. Unknown keys and invalid values fail with a diagnostic.
