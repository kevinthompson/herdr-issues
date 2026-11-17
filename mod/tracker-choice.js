// Choosing a repository's tracker, which the setup view (setup.js) and the settings view (settings.js) share:
// GitHub Issues, Linear or Beads, each checked step by step before it counts as ready (gh installed and logged in
// with origin on GitHub, a Linear API key found and accepted, or bd installed with a database in the main
// checkout, which it offers to make), with each step's result listed as passed, failed or skipped, and Linear's
// team. A Linear API key that is missing, unreadable or refused comes with a masked field that saves a key Linear
// accepts (linear.js), and a link to the page where Linear creates one. Linear's team dropdown is a scope menu
// popup (menu.js), whose pick comes back through the shared state its owner names.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, Input, InputState } from "gpui-base";
import { exec, shared, setShared } from "herdr";
import { button } from "./detail.js";
import { openScopeMenu } from "./menu.js";
import { linearClient, saveLinearKey } from "./trackers/linear.js";
import { checkGhInstalled, checkGhLoggedIn } from "./trackers/github.js";
import { checkBeadsInstalled, checkBeadsDatabase, initializeBeads } from "./trackers/beads.js";
import { forgetLookups } from "./lookups.js";
import { originNotOnGitHub, BEADS_NOT_INITIALIZED, LINEAR_KEY_PROBLEM, LINEAR_KEY_PAGE } from "./trackers/problems.js";
import { TEXT_SM_PX, TEXT_XS_PX } from "./type-scale.js";

/** @import { AsyncContext, Color, Context, NativeElement } from "gpui-kit" */
/** @import { Theme } from "./menu.js" */
/** @import { SetupProblem } from "./trackers/problems.js" */

/** @typedef {{ key: string, name: string }} Team */

export const TRACKERS = [
  { id: "github", label: "GitHub Issues" },
  { id: "linear", label: "Linear" },
  { id: "beads", label: "Beads" },
];
const TEAMS = "query { teams(first: 250) { nodes { key name } } }";
const TEAM_DROPDOWN_MAX_PX = 280;
const STEP_ICON_PX = 14;
const STEP_LINE_HEIGHT_PX = 18;

// The steps each tracker checks before it's ready, in order. A step throws the SetupProblem it finds, and is
// handed the main checkout and the previous step's result; Linear's last step answers with the teams the key can see.
/** @typedef {{ label: string, run: (main: string, previous: any) => Promise<any> }} ReadinessStep */
/** @typedef {{ label: string, status: "passed" | "failed" | "skipped" }} StepResult */
/** @type {Record<string, ReadinessStep[]>} */
const READINESS_STEPS = {
  github: [
    { label: "GitHub CLI installed", run: checkGhInstalled },
    { label: "GitHub CLI logged in", run: checkGhLoggedIn },
    { label: "Origin on GitHub", run: checkOriginOnGitHub },
  ],
  linear: [
    { label: "Linear API key found", run: linearClient },
    { label: "Linear API access verified", run: linearTeams },
  ],
  beads: [
    { label: "Beads installed", run: checkBeadsInstalled },
    { label: "Beads database found", run: checkBeadsDatabase },
  ],
};

const STEP_ICONS = {
  passed: "mods/issues/icons/circle-check.svg",
  failed: "mods/issues/icons/circle-alert.svg",
  skipped: "mods/issues/icons/circle-dashed.svg",
};

// Runs `choice`'s steps in order until one fails: each step's result (a failed step labeled with its problem's
// message, and the steps after it skipped), the problem, and the last step's value once every step passed.
/**
 * @param {string} choice
 * @param {string} main
 * @returns {Promise<{ results: StepResult[], problem: SetupProblem | null, value: any }>}
 */
export async function runReadinessSteps(choice, main) {
  const steps = READINESS_STEPS[choice];
  /** @type {StepResult[]} */
  const results = [];
  let value;
  for (const [index, step] of steps.entries()) {
    try {
      value = await step.run(main, value);
      results.push({ label: step.label, status: "passed" });
    } catch (/** @type {any} */ problem) {
      results.push({ label: problem.message ?? step.label, status: "failed" });
      for (const { label } of steps.slice(index + 1)) results.push({ label, status: "skipped" });
      return { results, problem, value: null };
    }
  }
  return { results, problem: null, value };
}

/**
 * @param {string} main
 */
async function checkOriginOnGitHub(main) {
  const origin = await exec("git", ["remote", "get-url", "origin"], { cwd: main }).catch(
    /** @returns {{ code: number, stdout: string }} */ () => null,
  );
  if (origin?.code !== 0 || !/github\.com[:/]/.test(origin.stdout)) throw originNotOnGitHub();
}

// The teams the API key can see, by name.
/**
 * @param {string} _main
 * @param {(query: string) => Promise<any>} linear
 * @returns {Promise<Team[]>}
 */
async function linearTeams(_main, linear) {
  const { teams } = await linear(TEAMS);
  return [...teams.nodes].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/**
 * @param {string} id
 * @param {string} text
 * @param {Color} color
 */
export const markdown = (id, text, color) =>
  TextView.markdown(id, text).flex_none().text_size(TEXT_XS_PX).text_color(color);

// Each step's result on a line of its own: a green check when it passed, the error icon and its problem in red
// when it failed, and a dimmed icon with muted text when it never ran.
/**
 * @param {string} id
 * @param {StepResult[]} results
 * @param {Theme} t
 */
function stepList(id, results, t) {
  /** @type {Record<StepResult["status"], { icon: Color, text: Color }>} */
  const colors = {
    passed: { icon: t.ansi2, text: t.foreground },
    failed: { icon: t.ansi1, text: t.ansi1 },
    skipped: { icon: t.dim, text: t.muted },
  };
  return v_flex()
    .id(id)
    .flex_none()
    .gap(4)
    .children(
      results.map(({ label, status }, index) =>
        h_flex()
          .id(`${id}-${index}`)
          .items_start()
          .gap(6)
          .text_color(colors[status].text)
          .child(
            h_flex()
              .flex_none()
              .h(STEP_LINE_HEIGHT_PX)
              .items_center()
              .child(svg(STEP_ICONS[status]).size(STEP_ICON_PX).text_color(colors[status].icon)),
          )
          .child(
            div()
              .flex_1()
              .min_w(0)
              .whitespace_normal()
              .text_size(TEXT_SM_PX)
              .line_height(`${STEP_LINE_HEIGHT_PX}px`)
              .when(status === "failed", (e) => e.font_semibold())
              .child(label),
          ),
      ),
    );
}

/**
 * @template A
 */
export class TrackerChoice {
  // main: the repository's main checkout. picks: the shared state the team dropdown hands its pick back through.
  // alongside(): more work the check waits for; onReady(its result, cx) runs once the chosen tracker's check
  // passes. onTeam(cx) runs once a team is picked, from the owner's render, where Herdr refuses cx.notify().
  /**
   * @param {string} main
   * @param {{ picks: string, alongside?: () => Promise<A>, onReady: (alongside: A, cx: AsyncContext) => void, onTeam: (cx: Context) => void }} callbacks
   */
  constructor(main, { picks, alongside = /** @returns {Promise<A>} */ async () => null, onReady, onTeam }) {
    this.main = main;
    this.picks = picks;
    this.alongside = alongside;
    this.onReady = onReady;
    this.onTeam = onTeam;
    /** @type {string | null} */
    this.choice = null;
    /** @type {Team[] | null} */
    this.teams = null;
    /** @type {string | null} */
    this.team = null;
    this.checking = false;
    /** @type {SetupProblem | null} */
    this.problem = null;
    // Each readiness step's result from the last check that failed one.
    /** @type {StepResult[] | null} */
    this.results = null;
    // The Linear API key being entered, which is never kept once saved.
    this.keyInput = InputState.new({ placeholder: "lin_api_…" });
    this.keyInput.set_masked(true);
    this.keyText = "";
    this.savingKey = false;
    /** @type {string | null} */
    this.keyError = null;
    this.keyInput.on("change", (_e, cx) => {
      this.keyText = this.keyInput.value();
      this.keyError = null;
      cx.notify();
    });
    this.keyInput.on("submit", (_e, cx) => this.saveKey(cx));
  }

  reset() {
    Object.assign(this, { choice: null, teams: null, team: null, checking: false, problem: null, results: null });
  }

  /**
   * @param {string} choice
   * @param {Context} cx
   */
  choose(choice, cx) {
    if (choice !== this.choice) this.team = null;
    this.choice = choice;
    this.check(cx);
  }

  /**
   * @param {Context} cx
   */
  check(cx) {
    const choice = this.choice;
    Object.assign(this, { checking: true, problem: null, results: null });
    forgetLookups();
    cx.spawn(async (cx) => {
      try {
        const [outcome, alongside] = await Promise.all([runReadinessSteps(choice, this.main), this.alongside()]);
        if (this.choice !== choice) return;
        if (outcome.problem) return Object.assign(this, { problem: outcome.problem, results: outcome.results });
        this.teams = /** @type {Team[] | undefined} */ (outcome.value) ?? null;
        this.onReady(alongside, cx);
      } catch (/** @type {any} */ e) {
        if (this.choice === choice) this.problem = e;
      } finally {
        if (this.choice === choice) this.checking = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  // Makes the Beads database the check found missing, then checks again.
  /**
   * @param {Context} cx
   */
  makeBeadsDatabase(cx) {
    const choice = this.choice;
    Object.assign(this, { checking: true, problem: null, results: null });
    cx.spawn(async (cx) => {
      try {
        await initializeBeads(this.main);
        if (this.choice === choice) this.check(cx);
      } catch (/** @type {any} */ e) {
        if (this.choice === choice) Object.assign(this, { problem: e, checking: false });
        cx.notify();
      }
    });
    cx.notify();
  }

  // Saves the entered key, then checks again as `onKeySaved` says.
  /**
   * @param {Context} cx
   */
  saveKey(cx) {
    const apiKey = this.keyText.trim();
    if (!apiKey || this.savingKey) return;
    Object.assign(this, { savingKey: true, keyError: null });
    cx.spawn(async (cx) => {
      try {
        await saveLinearKey(apiKey);
        this.keyInput.set_value("");
        this.keyText = "";
        this.onKeySaved?.(cx);
      } catch (/** @type {any} */ e) {
        this.keyError = String(e.message ?? e);
      } finally {
        this.savingKey = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  /**
   * @param {string} id
   * @param {Theme} t
   */
  keyForm(id, t) {
    return v_flex()
      .flex_none()
      .gap(6)
      .child(div().text_size(12).font_semibold().child("Linear API key"))
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(
            Input.new(this.keyInput)
              .flex_1()
              .min_w(0)
              .h(26)
              .px(8)
              .items_center()
              .rounded(7)
              .border(1)
              .border_color(t.input)
              .bg(t.surface)
              .text_size(12)
              .text_color(t.foreground),
          )
          .child(
            button(`${id}-save-key`, this.savingKey ? "Saving…" : "Save key", (cx) => this.saveKey(cx), t, {
              primary: true,
              enabled: !this.savingKey && Boolean(this.keyText.trim()),
            }),
          ),
      )
      .child(
        div()
          .id(`${id}-key-page`)
          .flex_none()
          .text_size(12)
          .text_color(t.accent)
          .cursor_pointer()
          .hover((s) => s.underline())
          .on_click((_e, cx) => cx.open_url(LINEAR_KEY_PAGE))
          .child("Create a personal API key in Linear ↗"),
      )
      .when(Boolean(this.keyError), (e) =>
        e.child(
          div()
            .whitespace_normal()
            .text_size(12)
            .text_color(t.ansi1)
            .child(this.keyError ?? ""),
        ),
      );
  }

  // A problem with its fix: each readiness step's result when `results` has them, or else the message marked with
  // an error icon, then the fix beneath it and the buttons. A Linear key problem asks for the key, and saving one
  // runs onCheckAgain.
  /**
   * @param {string} id
   * @param {SetupProblem} problem
   * @param {(cx: Context) => void} onCheckAgain
   * @param {Theme} t
   * @param {NativeElement | null} [extra]
   * @param {StepResult[] | null} [results]
   */
  problemView(id, problem, onCheckAgain, t, extra = null, results = null) {
    const asksForKey = problem.code === LINEAR_KEY_PROBLEM;
    if (asksForKey) this.onKeySaved = onCheckAgain;
    return v_flex()
      .flex_none()
      .gap(8)
      .child(stepList(`${id}-steps`, results ?? [{ label: problem.message, status: "failed" }], t))
      .when(asksForKey, (e) => e.child(this.keyForm(id, t)))
      .when(Boolean(problem.fix), (e) =>
        e.child(markdown(`${id}-fix`, problem.fix ?? "", t.muted).on_link_click((url, cx) => cx.open_url(url))),
      )
      .child(
        h_flex()
          .gap(6)
          .child(button(`${id}-check`, "Check again", onCheckAgain, t))
          .when(Boolean(extra), (e) => e.child(extra)),
      );
  }

  // The chosen tracker's passing check: every step it checked, each marked as passed.
  /**
   * @param {string} id
   * @param {Theme} t
   */
  successView(id, t) {
    const steps = READINESS_STEPS[this.choice ?? ""] ?? [];
    return stepList(
      id,
      steps.map(({ label }) => ({ label, status: "passed" })),
      t,
    );
  }

  // Adds to `content` that the check is running, or the problem it found, with a way to make a missing Beads database.
  /**
   * @param {NativeElement} content
   * @param {string} id
   * @param {Theme} t
   */
  withCheckStatus(content, id, t) {
    return content
      .when(this.checking, (e) => e.child(div().text_size(TEXT_XS_PX).text_color(t.dim).child("Checking…")))
      .when(!this.checking && Boolean(this.problem), (e) =>
        e.child(
          this.problemView(
            id,
            this.problem ?? /** @type {SetupProblem} */ ({}),
            (cx) => this.check(cx),
            t,
            this.problem?.code === BEADS_NOT_INITIALIZED
              ? button(`${id}-beads-init`, "Run bd init", (cx) => this.makeBeadsDatabase(cx), t)
              : null,
            this.results,
          ),
        ),
      );
  }

  openTeamMenu() {
    const scopes = this.teams.map(({ key, name }) => ({ id: key, label: `${name} (${key})` }));
    openScopeMenu(scopes, this.team, this.main, this.picks);
  }

  // Takes the team picked in the dropdown, which hands it over through shared state.
  /**
   * @param {Context} cx
   */
  takePickedTeam(cx) {
    const picks = /** @type {Record<string, any>} */ (shared(this.picks) ?? {}),
      team = picks[this.main];
    if (!team) return;
    const others = { ...picks };
    delete others[this.main];
    setShared(this.picks, others);
    this.team = team;
    this.onTeam(cx);
  }

  teamLabel() {
    const team = this.teams?.find(({ key }) => key === this.team);
    return team ? `${team.name} (${team.key})` : (this.team ?? "");
  }

  /**
   * @param {string} id
   * @param {Theme} t
   */
  teamDropdown(id, t) {
    if (!this.teams?.length)
      return div().text_size(12).text_color(t.dim).child("The Linear API key can't see any teams.");
    return h_flex()
      .id(id)
      .flex_none()
      .max_w(TEAM_DROPDOWN_MAX_PX)
      .h(26)
      .px(10)
      .gap(6)
      .items_center()
      .rounded(7)
      .border_1()
      .border_color(t.border)
      .bg(t.raised)
      .text_size(12)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.openTeamMenu())
      .child(
        div()
          .flex_1()
          .truncate()
          .child(this.team ? this.teamLabel() : "Choose a team"),
      )
      .child(div().flex_none().text_color(t.dim).child("▾"));
  }
}
