/** @typedef {{number: number, repository?: {name?: string, owner?: {login?: string}, nameWithOwner?: string}}} ClosingIssue */

// #760: GitHub reads `close #15` inside "Does not close #15" as a closing keyword, whatever comes before it, so a PR that says it stays
// clear of an issue can still close it (agent-mem PR #36 closed #15 while T3 was open). This check compares what GitHub will close
// (`closingIssuesReferences`) with what the title and body mean: a closing reference to an issue the text only mentions, with `Refs` or
// a negation or a qualifier ("partially fixes"), fails; so does a commit message with a closing keyword the PR text does not mean. An issue linked in the sidebar (named nowhere in the text) is a deliberate choice and passes.

const KEYWORD = "(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)";
// The reference forms GitHub accepts after a keyword: `#N`, `owner/repo#N`, and an issue URL.
const REFERENCE = String.raw`(?:https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)|([\w.-]+\/[\w.-]+)?#(\d+))`;
// What stops a closing keyword from being meant, anywhere earlier in its sentence (a sentence ends at . ! ? ; or a line break, so a comma
// does not hide it: "It does not, however, close #15"). Negations, and qualifiers that say the work is partial. A false positive costs a
// rewrite of the PR text; a false negative closes a design issue, so the list errs toward flagging.
const NEGATION = /\b(?:not|never|no|nothing|none|nobody|neither|nor|without|cannot|can't|\w+n['’]t|partially|partly|part|half|hardly|barely|mostly|largely|incomplete|incompletely)\b/i;

/**
 * A reference as `owner/repo#n`, lowercase, the default repository filled in.
 * @param {string | undefined} repo
 * @param {string | number | undefined} number
 * @param {string} fallback
 */
function key(repo, number, fallback) { return `${(repo ?? fallback).toLowerCase()}#${number}`; }

/** All references the text names at all, closing or not. */
/** @param {string} text @param {string} repo */
export function mentioned(text, repo) {
  const found = new Set();
  for (const match of text.matchAll(new RegExp(REFERENCE, "g"))) found.add(match[2] ? key(match[1], match[2], repo) : key(match[3], match[4], repo));
  return found;
}

/** Every closing keyword followed by a reference, with whether its sentence negates or qualifies it. GitHub closes on both. */
/** @param {string} text @param {string} repo */
export function keywordReferences(text, repo) {
  const found = [];
  for (const match of text.matchAll(new RegExp(String.raw`\b${KEYWORD}\b[ \t]*:?[ \t]*\[?[ \t]*${REFERENCE}`, "gi"))) {
    const before = text.slice(0, match.index);
    const sentence = before.slice(Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf(";"), before.lastIndexOf("\n")) + 1);
    found.push({ id: match[2] ? key(match[1], match[2], repo) : key(match[3], match[4], repo), negated: NEGATION.test(sentence) });
  }
  return found;
}

/** The references a closing keyword precedes without a negation or qualifier: the ones the author means to close. */
/** @param {string} text @param {string} repo */
export function intentionalCloses(text, repo) {
  return new Set(keywordReferences(text, repo).filter(reference => !reference.negated).map(reference => reference.id));
}

/**
 * The closing references the text does not mean: GitHub will close them, the text names them, and no non-negated closing keyword precedes
 * them. `closing` is `closingIssuesReferences` from `gh pr view --json` (`number`, `repository.name`, `repository.owner.login`).
 */
/** @param {string} text @param {string} repo @param {readonly ClosingIssue[]} closing */
export function closingMisuse(text, closing, repo) {
  const named = mentioned(text, repo), meant = intentionalCloses(text, repo), bad = [];
  for (const issue of closing) {
    // `gh pr view --json closingIssuesReferences` gives `repository: { name, owner: { login } }`.
    const where = issue.repository?.owner?.login && issue.repository?.name ? `${issue.repository.owner.login}/${issue.repository.name}` : issue.repository?.nameWithOwner;
    const id = key(where, issue.number, repo);
    if (named.has(id) && !meant.has(id)) bad.push(id);
  }
  return bad;
}

/**
 * A squash merge carries commit messages into the merge commit, and a closing keyword there closes the issue on merge whatever the PR text
 * says. Every keyword reference in a commit message (negated or not) that the PR title and body do not mean is returned.
 */
/** @param {readonly string[]} commits @param {string} prText @param {string} repo */
export function commitMisuse(commits, prText, repo) {
  const meant = intentionalCloses(prText, repo), bad = new Set();
  for (const message of commits) for (const reference of keywordReferences(message, repo)) if (!meant.has(reference.id)) bad.add(reference.id);
  return [...bad];
}
