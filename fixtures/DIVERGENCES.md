# Documentation check divergences

The [recordings](check-docs/copies/) compare exit status and freshness on identical Git fixtures. Each fixture starts with stamps for the union of the five copies' required documents. Each recording names the source commit and the flags that source actually accepts. At these commits, agent-research accepts only `--require-fresh`, and agent-console also accepts `--json`. Only agent-hub accepts `--committed`.

| Copy | Case | Current copy | Package | Reason |
| --- | --- | --- | --- | --- |
| agent-hub | `AHUB_CHECK_ROADMAP=1` | Spawns `check-roadmap.mjs` and adds `roadmap validation failed` on failure. | Ignores the environment variable. | The validator is specific to agent-hub and outside 0.1.0. agent-hub keeps its copy and the hook. |
| agent-mem | `missing-required` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy uses its own required-document list, which omits docs/security.md. Set requiredDocuments and stampDirectories to mirror the copy. |
| agent-mem | `unstamped-page` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not scan docs/addons. Replace stampDirectories with the directories the copy scans. |
| agent-mem | `missing-notes` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not require docs/agent-notes. Omit it from stampDirectories. |
| agent-mem | `missing-version` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not compare a README Status line with package.json. Set readmeStatusVersion to false. |
| vault-mem | `missing-required` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy uses its own required-document list, which omits docs/security.md. Set requiredDocuments and stampDirectories to mirror the copy. |
| vault-mem | `unstamped-page` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not scan docs/addons. Replace stampDirectories with the directories the copy scans. |
| vault-mem | `missing-notes` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not require docs/agent-notes. Omit it from stampDirectories. |
| vault-mem | `missing-version` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not compare a README Status line with package.json. Set readmeStatusVersion to false. |
| agent-research | `missing-required` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy uses its own required-document list, which omits docs/security.md. Set requiredDocuments and stampDirectories to mirror the copy. |
| agent-research | `unstamped-page` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not scan docs/addons. Replace stampDirectories with the directories the copy scans. |
| agent-research | `missing-notes` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not require docs/agent-notes. Omit it from stampDirectories. |
| agent-research | `missing-version` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not compare a README Status line with package.json. Set readmeStatusVersion to false. |
| agent-console | `missing-required` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy uses its own required-document list, which omits docs/security.md. Set requiredDocuments and stampDirectories to mirror the copy. |
| agent-console | `unstamped-page` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not scan docs/addons. Replace stampDirectories with the directories the copy scans. |
| agent-console | `missing-notes` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not require docs/agent-notes. Omit it from stampDirectories. |
| agent-console | `missing-version` (all supported modes) | exit 0, fresh | exit 1, not fresh | The copy does not compare a README Status line with package.json. Set readmeStatusVersion to false. |
