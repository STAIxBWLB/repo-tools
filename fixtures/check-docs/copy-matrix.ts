import type { SpawnSyncReturns } from "node:child_process";

export const copies = {
  "agent-hub": { source: "scripts/check-docs.mjs", flags: ["--require-fresh", "--json", "--committed"] },
  "agent-mem": { source: "scripts/check-docs.ts", flags: ["--require-fresh"], files: ["src/memory/platform.ts"] },
  "vault-mem": { source: "scripts/check-docs.mjs", flags: ["--require-fresh"] },
  "agent-research": { source: "scripts/check-docs.mjs", flags: ["--require-fresh"] },
  "agent-console": { source: "scripts/check-docs.mjs", flags: ["--require-fresh", "--json"] },
} as const;

export type Verdict = { status: 0 | 1; fresh: boolean };
export type Recording = {
  commit: string;
  source: string;
  supportedFlags: readonly string[];
  cases: Record<string, Record<string, Verdict>>;
};

export function flagSets(flags: readonly string[]): string[][] {
  return flags.reduce<string[][]>((sets, flag) => [...sets, ...sets.map(set => [...set, flag])], [[]]);
}

export function flagKey(flags: readonly string[]): string {
  return flags.join(" ") || "default";
}

export function readVerdict(result: SpawnSyncReturns<string>, json: boolean): Verdict {
  if (result.error) throw result.error;
  const { status, stdout, stderr } = result;
  if (status !== 0 && status !== 1) throw new Error(`Unexpected checker exit ${status}: ${stderr}`);
  if (json) {
    const evidence = JSON.parse(stdout);
    if (typeof evidence.fresh !== "boolean") throw new Error("Checker JSON did not contain a freshness verdict");
    return { status, fresh: evidence.fresh };
  }
  if (status === 1 && !stderr.includes("docs: ERROR ")) throw new Error(`Checker failed before reporting a verdict: ${stderr}`);
  if (status === 0 && !/^docs: OK \(\d+ stale documents?\)$/m.test(stdout)) throw new Error(`Checker did not report a text verdict: ${stdout}`);
  return { status, fresh: status === 0 && /^docs: OK \(0 stale documents\)$/m.test(stdout) };
}

export function verdictLabel({ status, fresh }: Verdict): string {
  return `exit ${status}, ${fresh ? "fresh" : "not fresh"}`;
}
