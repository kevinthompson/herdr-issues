// What the remove-worktree dialog found, and its verdict on removing the checkout. Each check is
// undefined while it runs, { error } when it couldn't run, or its answer:
// - dirty: whether the checkout has uncommitted changes;
// - submodules: the names of its submodules with commits pushed nowhere;
// - branch: branchState's answer (worktree.js), null when no branch is checked out;
// - warning: work outside the checkout that removing it would leave behind, or none.
// Every space gets every check: a session marked done working with `issues complete` may have handed off before its
// branch was merged, so that mark says nothing about whether the checkout is safe to remove.

export const PASS = "pass";
// A failure that loses work existing only in this checkout.
export const LOSS = "loss";
// A failure worth a look that loses nothing only this checkout holds, or a check that couldn't run.
export const CAUTION = "caution";

// Runs the checks side by side through `lookups`, { dirty, submodules, branch }, handing each answer to
// `answered(name, result)` as it arrives.
export function runChecks(lookups, answered) {
  return Promise.all(
    ["dirty", "submodules", "branch"].map((name) =>
      Promise.resolve()
        .then(lookups[name])
        .catch((error) => ({ error: String(error?.message ?? error) }))
        .then((result) => answered(name, result)),
    ),
  );
}

/** @param {{ dirty?: any, submodules?: any, branch?: any }} checks */
export function checksAnswered({ dirty, submodules, branch }) {
  return dirty !== undefined && submodules !== undefined && branch !== undefined;
}

// The answered checks' findings, { result, text }, in a fixed order: uncommitted changes, submodule
// commits, whether the branch is on main or in review, whether it is pushed, and the warning.
/** @param {{ dirty?: any, submodules?: any, branch?: any, warning?: any }} checks */
export function removalFindings({ dirty, submodules, branch, warning }) {
  const findings = [];
  if (dirty?.error) findings.push({ result: CAUTION, text: `Couldn't check for uncommitted changes: ${dirty.error}` });
  else if (dirty === true) findings.push({ result: LOSS, text: "It has uncommitted changes: they will be lost." });
  else if (dirty === false) findings.push({ result: PASS, text: "It has no uncommitted changes." });
  if (submodules?.error) findings.push({ result: CAUTION, text: `Couldn't check its submodules: ${submodules.error}` });
  else if (submodules?.length)
    findings.push({
      result: LOSS,
      text: `Submodule ${submodules.join(", ")} has commits that aren't pushed anywhere: they will be lost.`,
    });
  else if (submodules) findings.push({ result: PASS, text: "Its submodules have no commits that aren't pushed." });
  if (branch?.error) findings.push({ result: CAUTION, text: `Couldn't check the branch: ${branch.error}` });
  else if (branch === null) findings.push({ result: CAUTION, text: "No branch is checked out." });
  else if (branch) findings.push(...branchFindings(branch));
  if (warning) findings.push({ result: CAUTION, text: warning });
  return findings;
}

function branchFindings({ bases, mergedInto, unpushed, pullRequest }) {
  return [
    mergedInto
      ? { result: PASS, text: `Worktree branch has nothing that isn't on ${mergedInto}.` }
      : pullRequest
        ? { result: PASS, text: `Worktree branch has an open pull request: ${pullRequest}` }
        : {
            result: CAUTION,
            text: bases.length
              ? `Worktree branch has changes that aren't on ${bases.join(" or ")}.`
              : `Worktree branch has no main branch to compare with.`,
          },
    unpushed === 0
      ? { result: PASS, text: "Worktree branch is pushed to origin." }
      : // Commits on no origin branch are lost with the checkout, unless main already has their changes.
        mergedInto
        ? { result: PASS, text: `Worktree branch needs no push: its changes are on ${mergedInto}.` }
        : unpushed === null
          ? { result: LOSS, text: "Worktree branch has no origin to push to." }
          : {
              result: LOSS,
              text: `Worktree branch has ${unpushed} ${unpushed === 1 ? "commit" : "commits"} that aren't pushed to origin.`,
            },
  ];
}

// Whether the dialog removes the checkout without asking: every check answered and passed, and no other space nests
// under this one, since closing a space closes the spaces nested under it. `ask`: whoever opened it wants the person
// to confirm whatever the checks find.
/** @param {{ dirty?: any, submodules?: any, branch?: any, warning?: any }} checks */
export function removesWithoutAsking(checks, nestedSpaceCount, { ask = false } = {}) {
  if (ask || !checksAnswered(checks) || nestedSpaceCount > 0) return false;
  return removalFindings(checks).every((finding) => finding.result === PASS);
}

// { mark, text }: ❌ when a finding loses work only this checkout holds, ⚠️ for any other failure, ✅ otherwise.
export function removalVerdict(findings) {
  if (findings.some((finding) => finding.result === LOSS))
    return { mark: "❌", text: "Removing it loses work that exists only in this checkout." };
  if (findings.some((finding) => finding.result === CAUTION))
    return { mark: "⚠️", text: "Look over the list before removing it." };
  return { mark: "✅", text: "Safe to remove." };
}
