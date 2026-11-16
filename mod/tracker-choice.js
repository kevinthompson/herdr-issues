// Choosing a repository's tracker, which the setup view (setup.js) and the settings view (settings.js) share:
// GitHub Issues, Linear or Beads, each checked before it counts as ready (gh installed and logged in with origin
// on GitHub, a Linear API key that works, or bd installed with a database in the main checkout, which it offers
// to make), and Linear's team. A Linear API key that is missing, unreadable or refused comes with a masked field
// that saves a key Linear accepts (linear.js), and a link to the page where Linear creates one. Linear's team
// dropdown is a scope menu popup (menu.js), whose pick comes back through the shared state its owner names.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextView, Input, InputState } from "gpui-base";
import { exec, shared, setShared } from "herdr";
import { button } from "./detail.js";
import { openScopeMenu } from "./menu.js";
import { linearClient, saveLinearKey } from "./trackers/linear.js";
import { checkGitHubLogin } from "./trackers/github.js";
import { checkBeads, initializeBeads } from "./trackers/beads.js";
import { forgetLookups } from "./lookups.js";
import { originNotOnGitHub, BEADS_NOT_INITIALIZED, LINEAR_KEY_PROBLEM, LINEAR_KEY_PAGE } from "./trackers/problems.js";

export const TRACKERS = [
  { id: "github", label: "GitHub Issues" },
  { id: "linear", label: "Linear" },
  { id: "beads", label: "Beads" },
];
const TEAMS = "query { teams(first: 250) { nodes { key name } } }";
const TEAM_DROPDOWN_MAX_PX = 280;

// What each tracker checks before it's ready; Linear's check answers with the teams the key can see.
const READINESS_CHECKS = { github: checkGitHub, linear: linearTeams, beads: checkBeads };

async function checkGitHub(main) {
  await checkGitHubLogin();
  const origin = await exec("git", ["remote", "get-url", "origin"], { cwd: main }).catch(() => null);
  if (origin?.code !== 0 || !/github\.com[:/]/.test(origin.stdout)) throw originNotOnGitHub();
}

// The teams the API key can see, by name.
async function linearTeams() {
  const linear = await linearClient();
  const { teams } = await linear(TEAMS);
  return [...teams.nodes].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export const markdown = (id, text, color) => TextView.markdown(id, text).flex_none().text_size(12).text_color(color);

export class TrackerChoice {
  // main: the repository's main checkout. picks: the shared state the team dropdown hands its pick back through.
  // alongside(): more work the check waits for; onReady(its result, cx) runs once the chosen tracker's check
  // passes. onTeam(cx) runs once a team is picked, from the owner's render, where Herdr refuses cx.notify().
  constructor(main, { picks, alongside = async () => null, onReady, onTeam }) {
    this.main = main;
    this.picks = picks;
    this.alongside = alongside;
    this.onReady = onReady;
    this.onTeam = onTeam;
    this.choice = null;
    this.teams = null;
    this.team = null;
    this.checking = false;
    this.problem = null;
    // The Linear API key being entered, which is never kept once saved.
    this.keyInput = InputState.new({ placeholder: "lin_api_…" });
    this.keyInput.set_masked(true);
    this.keyText = "";
    this.savingKey = false;
    this.keyError = null;
    this.keyInput.on("change", (_e, cx) => {
      this.keyText = this.keyInput.value();
      this.keyError = null;
      cx.notify();
    });
    this.keyInput.on("submit", (_e, cx) => this.saveKey(cx));
  }

  reset() {
    Object.assign(this, { choice: null, teams: null, team: null, checking: false, problem: null });
  }

  choose(choice, cx) {
    if (choice !== this.choice) this.team = null;
    this.choice = choice;
    this.check(cx);
  }

  check(cx) {
    const choice = this.choice;
    Object.assign(this, { checking: true, problem: null });
    forgetLookups();
    cx.spawn(async (cx) => {
      try {
        const [teams, alongside] = await Promise.all([READINESS_CHECKS[choice](this.main), this.alongside()]);
        if (this.choice !== choice) return;
        this.teams = teams ?? null;
        this.onReady(alongside, cx);
      } catch (e) {
        if (this.choice === choice) this.problem = e;
      } finally {
        if (this.choice === choice) this.checking = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  // Makes the Beads database the check found missing, then checks again.
  makeBeadsDatabase(cx) {
    const choice = this.choice;
    Object.assign(this, { checking: true, problem: null });
    cx.spawn(async (cx) => {
      try {
        await initializeBeads(this.main);
        if (this.choice === choice) this.check(cx);
      } catch (e) {
        if (this.choice === choice) Object.assign(this, { problem: e, checking: false });
        cx.notify();
      }
    });
    cx.notify();
  }

  // Saves the entered key, then checks again as `onKeySaved` says.
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
      } catch (e) {
        this.keyError = String(e.message ?? e);
      } finally {
        this.savingKey = false;
        cx.notify();
      }
    });
    cx.notify();
  }

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

  // A problem with its fix. A Linear key problem asks for the key, and saving one runs onCheckAgain.
  problemView(id, problem, onCheckAgain, t, extra = null) {
    const asksForKey = problem.code === LINEAR_KEY_PROBLEM;
    if (asksForKey) this.onKeySaved = onCheckAgain;
    return v_flex()
      .flex_none()
      .gap(8)
      .child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(problem.message))
      .when(asksForKey, (e) => e.child(this.keyForm(id, t)))
      .when(Boolean(problem.fix), (e) =>
        e.child(markdown(`${id}-fix`, problem.fix ?? "", t.foreground).on_link_click((url, cx) => cx.open_url(url))),
      )
      .child(
        h_flex()
          .gap(6)
          .child(button(`${id}-check`, "Check again", onCheckAgain, t, { primary: true }))
          .when(Boolean(extra), (e) => e.child(extra)),
      );
  }

  // Adds to `content` that the check is running, or the problem it found, with a way to make a missing Beads database.
  withCheckStatus(content, id, t) {
    return content
      .when(this.checking, (e) => e.child(div().text_size(12).text_color(t.dim).child("Checking…")))
      .when(!this.checking && Boolean(this.problem), (e) =>
        e.child(
          this.problemView(
            id,
            this.problem ?? {},
            (cx) => this.check(cx),
            t,
            this.problem?.code === BEADS_NOT_INITIALIZED
              ? button(`${id}-beads-init`, "Run bd init", (cx) => this.makeBeadsDatabase(cx), t)
              : null,
          ),
        ),
      );
  }

  openTeamMenu() {
    const scopes = this.teams.map(({ key, name }) => ({ id: key, label: `${name} (${key})` }));
    openScopeMenu(scopes, this.team, this.main, this.picks);
  }

  // Takes the team picked in the dropdown, which hands it over through shared state.
  takePickedTeam(cx) {
    const picks = shared(this.picks) ?? {},
      team = picks[this.main];
    if (!team) return;
    const { [this.main]: _taken, ...others } = picks;
    setShared(this.picks, others);
    this.team = team;
    this.onTeam(cx);
  }

  teamLabel() {
    const team = this.teams?.find(({ key }) => key === this.team);
    return team ? `${team.name} (${team.key})` : (this.team ?? "");
  }

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
