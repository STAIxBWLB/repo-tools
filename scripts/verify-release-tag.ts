import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tag = process.env.GITHUB_REF_NAME;
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (typeof version !== "string" || tag !== `v${version}`) {
  throw new Error(`Release tag ${tag ?? "(missing)"} does not match package.json version ${version}; tag the main commit with the matching v-prefixed version.`);
}

const ancestry = spawnSync("git", [
  "--no-pager", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
  "merge-base", "--is-ancestor", "HEAD", "refs/remotes/origin/main",
], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 10_000 });
if (ancestry.status === 1) {
  throw new Error("The tagged commit is not on origin/main; merge the release commit and tag it on main.");
}
if (ancestry.status !== 0) {
  throw new Error("Cannot verify release ancestry; fetch origin/main and the complete tag history before retrying.");
}
console.log(`Release tag ${tag} matches package.json and is on origin/main.`);
