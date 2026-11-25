# Review

- Compare the complete diff with spec #1 and its acceptance criteria; name each AC the PR claims and the test that proves it.
- Important: a result that differs from agent-hub's current tool on the same input, a dropped flag, or a ported test removed without a reason.
- Important: git run with a pager, external diff, textconv or any repository-controlled program; a workflow with write permissions or `id-token: write` in a job that runs repository code.
- Important: `check-closing-refs` passing a PR that would close an issue its text only mentions, or a negation ("does not close #N") read as safe.
- Important: a runtime dependency, or behaviour that differs between Bun and Node 22.
- Error messages: a new or changed error names the cause and the next step.
- Do not report: formatting, naming preferences, `ponytail:` simplifications that state their ceiling. At most five nits.
