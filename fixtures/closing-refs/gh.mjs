import { chmodSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Return an offline gh fixture environment. Unexpected calls fail.
 * @param {string} directory
 * @param {string} repo
 * @param {unknown} pr
 */
export function ghFixture(directory, repo, pr) {
  const gh = join(directory, "gh");
  writeFileSync(gh, `#!/bin/sh
set -eu
case "$*" in
  'repo view --json nameWithOwner') printf '%s' "$FIXTURE_REPO" ;;
  "pr view $PR_NUMBER --repo $EXPECTED_REPO --json closingIssuesReferences,body,title,commits")
    test "$GH_TOKEN" = offline-fixture
    printf '%s' "$FIXTURE_PR" ;;
  *) exit 64 ;;
esac
`);
  chmodSync(gh, 0o755);
  return {
    ...process.env,
    PATH: `${directory}${delimiter}${process.env.PATH}`,
    GH_TOKEN: "offline-fixture",
    GITHUB_REPOSITORY: repo,
    PR_NUMBER: "753",
    EXPECTED_REPO: repo,
    FIXTURE_REPO: JSON.stringify({ nameWithOwner: repo }),
    FIXTURE_PR: JSON.stringify(pr),
  };
}
