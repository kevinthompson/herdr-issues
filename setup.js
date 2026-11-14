// The panel's view for a repository whose issues it can't list. With no tracker, it offers GitHub Issues or
// Linear: choosing one checks what that tracker needs (gh installed and logged in with origin on GitHub, or a
// Linear API key that works), then writes the repository's entry in issues.json (setting.js), and the panel
// lists the issues. A configured tracker that fails to load with a SetupProblem (trackers/problems.js) shows the
// problem and its fix, with Check again and a way to choose a different tracker. Linear's team dropdown is a
// scope menu popup (menu.js), whose pick comes back through shared state.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { exec, shared, setShared } from "herdr";
import { button } from "./detail.js";
import { openScopeMenu } from "./menu.js";
import { saveTrackerSetting } from "./trackers/setting.js";
import { linearClient } from "./trackers/linear.js";
import { planningCenterRepoName, detectedTeam } from "./trackers/linear-team.js";
import { ghMissing, ghLoggedOut, originNotOnGitHub } from "./trackers/problems.js";

const TEAM_PICKS = "issues.setupTeams";
const TEAMS = "query { teams(first: 250) { nodes { key name } } }";
const TRACKERS = [{ id: "github", label: "GitHub Issues" }, { id: "linear", label: "Linear" }];
const TEAM_DROPDOWN_MAX_PX = 280;
const CONFIG_HINT = "For saved Linear views and other options the panel doesn't offer, run `/issues:config` in Claude instead.";

async function checkGitHub(main) {
  const installed = await exec("gh", ["--version"]).catch(() => null);
  if (installed?.code !== 0) throw ghMissing();
  const auth = await exec("gh", ["auth", "status", "--hostname", "github.com"]).catch(() => null);
  if (auth?.code !== 0) throw ghLoggedOut();
  const origin = await exec("git", ["remote", "get-url", "origin"], { cwd: main }).catch(() => null);
  if (origin?.code !== 0 || !/github\.com[:/]/.test(origin.stdout)) throw originNotOnGitHub();
}

// The teams the API key can see, by name, with the one the repository's pull requests point to first.
async function linearTeams(main) {
  const linear = await linearClient();
  const { teams } = await linear(TEAMS);
  const repoName = await planningCenterRepoName(main);
  const detected = repoName ? await detectedTeam(main, repoName, linear) : null;
  const byName = [...teams.nodes].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return [...byName.filter((team) => team.key === detected), ...byName.filter((team) => team.key !== detected)];
}

const markdown = (id, text, color) => TextView.markdown(id, text).flex_none().text_size(12).text_color(color);

// A plain sentence for a folder no tracker can serve: outside a git repository, or on another machine.
export function untrackableView(sentence, t) {
  return v_flex().p(14).child(div().whitespace_normal().text_color(t.dim).child(sentence));
}

export class TrackerSetup {
  // main: the repository's main checkout. onSaved(cx) runs once its entry is written.
  constructor(main, onSaved) {
    this.main = main; this.onSaved = onSaved;
    this.failure = null; this.choosingAnother = false;
    this.choice = null; this.checking = false; this.problem = null; this.teams = null;
  }

  // The configured tracker's SetupProblem, or null when the repository has no tracker.
  showFailure(failure) {
    this.failure = failure;
    if (!failure) this.choosingAnother = false;
  }

  choose(choice, cx) {
    this.choice = choice;
    this.check(cx);
  }

  check(cx) {
    const choice = this.choice;
    Object.assign(this, { checking: true, problem: null, teams: null });
    cx.spawn(async (cx) => {
      try {
        if (choice === "github") {
          await checkGitHub(this.main);
          await this.save({ tracker: "github" }, cx);
        } else {
          const teams = await linearTeams(this.main);
          if (this.choice === choice) this.teams = teams;
        }
      } catch (e) { if (this.choice === choice) this.problem = e; }
      finally { if (this.choice === choice) this.checking = false; cx.notify(); }
    });
    cx.notify();
  }

  async save(setting, cx) {
    await saveTrackerSetting(this.main, setting);
    Object.assign(this, { choice: null, choosingAnother: false, teams: null });
    this.onSaved(cx);
  }

  openTeamMenu() {
    const scopes = this.teams.map(({ key, name }) => ({ id: key, label: `${name} (${key})` }));
    openScopeMenu(scopes, null, this.main, TEAM_PICKS);
  }

  // Saves the team picked in the dropdown, which hands it over through shared state.
  takePickedTeam(cx) {
    const picks = shared(TEAM_PICKS) ?? {}, team = picks[this.main];
    if (!team) return;
    const { [this.main]: _taken, ...others } = picks;
    setShared(TEAM_PICKS, others);
    this.checking = true;
    cx.spawn(async (cx) => {
      try { await this.save({ tracker: "linear", team }, cx); }
      catch (e) { this.problem = e; }
      finally { this.checking = false; cx.notify(); }
    });
  }

  problemView(id, problem, onCheckAgain, t, extra = null) {
    return v_flex().flex_none().gap(8)
      .child(div().whitespace_normal().text_size(12).text_color(t.ansi1).child(problem.message))
      .when(Boolean(problem.fix), (e) => e.child(markdown(`${id}-fix`, problem.fix ?? "", t.foreground)))
      .child(h_flex().gap(6).child(button(`${id}-check`, "Check again", onCheckAgain, t, { primary: true })).when(Boolean(extra), (e) => e.child(extra)));
  }

  render(t, { onRetry }) {
    const content = v_flex().id("issues-setup").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(12);
    if (this.failure && !this.choosingAnother) {
      return content
        .child(div().font_semibold().child("Issues can't load"))
        .child(this.problemView("setup-failure", this.failure, onRetry, t,
          button("setup-choose-another", "Choose a different tracker", (cx) => { this.choosingAnother = true; cx.notify(); }, t)))
        .child(markdown("setup-hint", CONFIG_HINT, t.dim));
    }
    const sentence = this.failure ? "Choose a different issue tracker for this repository." : "This repository has no issue tracker yet. Choose where its issues live.";
    return content
      .child(div().font_semibold().child("Set up issues"))
      .child(div().whitespace_normal().text_size(12).text_color(t.muted).child(sentence))
      .child(h_flex().gap(6).children(TRACKERS.map(({ id, label }) =>
        button(`setup-${id}`, label, (cx) => this.choose(id, cx), t, { primary: this.choice === id, enabled: !this.checking }))))
      .when(this.checking, (e) => e.child(div().text_size(12).text_color(t.dim).child("Checking…")))
      .when(!this.checking && Boolean(this.problem), (e) => e.child(this.problemView("setup-problem", this.problem ?? {}, (cx) => this.check(cx), t)))
      .when(!this.checking && !this.problem && Boolean(this.teams), (e) => e.child(this.teamPicker(t)))
      .when(Boolean(this.failure), (e) => e.child(button("setup-back", "Back", (cx) => { this.choosingAnother = false; this.choice = null; this.problem = null; this.teams = null; cx.notify(); }, t)))
      .child(markdown("setup-hint", CONFIG_HINT, t.dim));
  }

  teamPicker(t) {
    if (!this.teams.length) return div().text_size(12).text_color(t.dim).child("The Linear API key can't see any teams.");
    return v_flex().flex_none().gap(6)
      .child(div().text_size(12).text_color(t.muted).child("Team"))
      .child(h_flex().id("setup-team").flex_none().max_w(TEAM_DROPDOWN_MAX_PX).h(26).px(10).gap(6).items_center().rounded(7).border_1().border_color(t.border)
        .bg(t.raised).text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click(() => this.openTeamMenu())
        .child(div().flex_1().truncate().child("Choose a team"))
        .child(div().flex_none().text_color(t.dim).child("▾")));
  }
}
