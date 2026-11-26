# Documentation check divergences

| Copy | Case | Current copy | Package | Reason |
| --- | --- | --- | --- | --- |
| agent-hub | `AHUB_CHECK_ROADMAP=1` | Spawns `check-roadmap.mjs` and adds `roadmap validation failed` on failure. | Ignores the environment variable. | The validator is specific to agent-hub and outside 0.1.0. agent-hub keeps its copy and the hook. |
