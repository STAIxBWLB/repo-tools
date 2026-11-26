#!/usr/bin/env node
import { checkDocs } from "../src/check-docs/index.mjs";

const args = process.argv.slice(2);
const flags = ["--require-fresh", "--json", "--committed"];
const root = args.find(arg => !flags.includes(arg)) ?? process.cwd();
const requireFresh = args.includes("--require-fresh");
const jsonOutput = args.includes("--json");
const committed = args.includes("--committed");
const { evidence, reports, errors } = checkDocs(root, { requireFresh, committed });

if (jsonOutput) {
  console.log(JSON.stringify(evidence));
} else {
  for (const report of reports) console.log(`docs: ${report}`);
  for (const error of errors) console.error(`docs: ERROR ${error}`);
  if (!errors.length) console.log(`docs: OK (${reports.length} stale document${reports.length === 1 ? "" : "s"})`);
}
if (errors.length) process.exitCode = 1;
