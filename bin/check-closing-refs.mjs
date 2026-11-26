#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { closingMisuse, commitMisuse } from "../src/check-closing-refs/index.mjs";

function main() {
  const number = process.argv[2] ?? process.env.PR_NUMBER;
  if (!number || !/^\d+$/.test(number)) throw new Error("usage: check-closing-refs.mjs <pr number> (or PR_NUMBER)");
  const repo = process.env.GITHUB_REPOSITORY ?? JSON.parse(execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], { encoding: "utf8" })).nameWithOwner;
  /** @type {{title?: string, body?: string, closingIssuesReferences?: import("../src/check-closing-refs/index.mjs").ClosingIssue[], commits?: {messageHeadline?: string, messageBody?: string}[]}} */
  const pr = JSON.parse(execFileSync("gh", ["pr", "view", number, "--repo", repo, "--json", "closingIssuesReferences,body,title,commits"], { encoding: "utf8" }));
  const text = `${pr.title ?? ""}\n${pr.body ?? ""}`;
  const bad = closingMisuse(text, pr.closingIssuesReferences ?? [], repo);
  const commits = commitMisuse((pr.commits ?? []).map(commit => `${commit.messageHeadline ?? ""}\n${commit.messageBody ?? ""}`), text, repo);
  if (bad.length) {
    console.error(`closing-refs: PR #${number} would close ${bad.join(", ")}, but its title and body only mention it with Refs, a negation or a qualifier.`);
    console.error("GitHub reads `close #N` inside \"does not close #N\" as a closing keyword. Write \"stays open\" or \"Refs #N\" and leave the verb out.");
  }
  if (commits.length) {
    console.error(`closing-refs: a commit message of PR #${number} has a closing keyword for ${commits.join(", ")} that the PR title and body do not mean. A squash merge would close it.`);
    console.error("Reword the commit (or write the same closing keyword in the PR body if the PR should close it).");
  }
  if (bad.length || commits.length) process.exit(1);
  console.log(`closing-refs: OK (${(pr.closingIssuesReferences ?? []).length} closing reference(s) match the text)`);
}

main();
