// The issues of the project in the focused pane: its git repository's root, or its folder outside one.
// Each repository remembers which status sections the person opened or closed (open-sections.js), across
// focus changes and restarts, and lists a remembered open section's issues when it is focused. Clicking an issue shows it in the panel in place of the list (detail.js). The list draws a limited
// number of rows, and Show more draws more. Status and priority dropdowns are popups of this same mod
// with props { menu } (menu.js), and the worktree dialog is a dialog of it with props { action }
// (worktree-dialog.js). Edit swaps an open issue's body for a Markdown editor; Save,
// Cmd-Enter or the issues.save key command writes it back to the tracker. Start and Continue open the
// issue's worktree, with a Claude session working it when `claude` runs (work-session.js), and Merge brings a
// finished branch in main (merge.js) and removes its worktree. A finished session's `issues close` closes its space
// through the removal dialog once the session is idle (close-request.js). Clicking a task-list
// checkbox in the body saves that one change at once. A repository with no tracker, or one whose tracker
// can't load, shows the setup view (setup.js) in place of the list, and a folder outside a git repository
// shows a button that initializes one there. The header's gear opens the repository's settings in place of the
// list (settings.js). The issues.toggle key command and the
// strip's button collapse the panel to a thin strip and expand it again (collapse.js). The list polls its
// tracker, and the issues.refresh key command fetches it at once. Every updateCheckHours, the panel checks the
// checkout it runs from for an update, and its footer offers one with an Update button (update.js).
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, EditorState, ScrollHandle } from "gpui-base";
import {
  theme,
  props,
  settings,
  nextCommand,
  openOverlay,
  spaces,
  panes,
  terminals,
  focused,
  notify,
  exec,
  hc,
  run,
  watchFolder,
  appHome,
  updates,
} from "herdr";
import { location, repositoryRoot, mainCheckout, initializeRepository } from "./location.js";
import { trackerFor } from "./trackers/index.js";
import {
  settingsPath,
  pollSettings,
  nameSettings,
  updateSettings,
  DEFAULT_POLL_SECONDS,
  DEFAULT_UPDATE_CHECK_HOURS,
} from "./trackers/setting.js";
import { offeredUpdate, dismissUpdate, installTab, finishedUpdate } from "./update.js";
import { updateFooter } from "./update-footer.js";
import { findScope, linearKeyPath } from "./trackers/linear.js";
import { forgetLookups } from "./lookups.js";
import { publishScope, publishOpenIssue } from "./scope-context.js";
import { listedScopeName, headerTitleText, listsProject } from "./listed-scope.js";
import { listFilters } from "./filters.js";
import { filterRow, ROW_PADDING_X_PX } from "./filter-row.js";
import {
  groupIssues,
  groupCountText,
  holdsNoIssues,
  stripBadges,
  statusIcon,
  loadsFor,
  holdingBlockers,
  canStartWork,
  canFinishWork,
  needsNewBranch,
  blockedIssues,
  waitingIssues,
  slaStatus,
  dueStatus,
  PRIORITIES,
} from "./issue.js";
import {
  issueDetail,
  issueLinks,
  workButton,
  labelChips,
  projectName,
  PANEL_TEXT_PX,
  PROPERTY_TEXT_PX,
  COMPACT_BUTTON_WIDTH_PX,
} from "./detail.js";
import { collapseButton, headerBar, iconButton, HEADER_HEIGHT_PX, ICON_BUTTON_PX } from "./header.js";
import {
  FieldMenu,
  ScopeMenu,
  LabelMenu,
  openMenu,
  openScopeMenu,
  openLabelMenu,
  openIssueLabelsMenu,
  selectedScope,
  selectedLabel,
} from "./menu.js";
import { worktreeFor, repositoryState, deleteMergedBranches, worktreeSpace, isLinkedWorktree } from "./worktree.js";
import { toggleTask } from "./tasks.js";
import { linkTarget, codeSpanPaths, linkCodeSpanFiles } from "./links.js";
import { isTextFile, openInEditor, prefetchEditor } from "./editor.js";
import { avatarImage, AVATAR_PX } from "./avatars.js";
import { lastList, fetchList, rememberedList } from "./lists.js";
import { issuesChangedAt, announceIssueChange } from "./changes.js";
import { DUE_COLORS, rowHover, statusTints } from "./colors.js";
import { card, CARD_RADIUS_PX } from "./section.js";
import { fieldEdits, markEditFailed, forgetEdits, claimEdit, showFieldEdit, trackerFields } from "./edits.js";
import { WorktreeDialog } from "./worktree-dialog.js";
import { closeWorktreeSpace } from "./worktree-removal.js";
import { issueIdOfSpace, panelIssueSpaceName } from "./space-name.js";
import { panelVisible } from "./visibility.js";
import { collapseState } from "./collapse.js";
import { isSectionOpen, setSectionOpen } from "./open-sections.js";
import { KeptSetups, untrackableView, notARepositoryView, emptyListView } from "./setup.js";
import { SettingsView } from "./settings.js";
import { workIssueSession, issuesWorktreeArgs } from "./work-session.js";
import { openBehindArgs } from "./open-behind.js";
import { stillWaitingForSpace } from "./opening-wait.js";
import { Openings } from "./openings.js";
import { canOfferMerge, MergedWithProblems, mergeIssue, MergeRefusal } from "./merge.js";
import { CLOSE_LABEL, readyCloseRequests } from "./close-request.js";
import { idColumnWidth } from "./id-column.js";
import { groupSpacing } from "./group-spacing.js";

/** @import { Context, AsyncContext, Color } from "gpui-kit" */
/** @import { Issue, Tracker, Project } from "./trackers/index.js" */
/** @import { ListedGroup as Group } from "./issue.js" */
/** @import { Theme } from "./menu.js" */
/** @typedef {ReturnType<typeof location>} Where */
/** @typedef {Awaited<ReturnType<typeof repositoryState>>} Repository */
/** @typedef {ReturnType<typeof fieldEdits>[string]} FieldEdit */
/** @import { SetupProblem } from "./trackers/problems.js" */
/** @import { TrackerSetup } from "./setup.js" */
/**
 * @typedef {object} Shown
 * @property {Project} project
 * @property {Tracker} tracker
 * @property {string} scopeKey
 * @property {string} listKey
 * @property {Set<string>} unloaded
 * @property {string | undefined} listedScope
 * @property {Repository | null} repository
 * @property {string | null} repositoryName
 */

// With strictNullChecks off, a bare `() => null` is typed any, so a caught call returns this, which is `never` to the checker.
const NONE = /** @type {never} */ (null);
const REFRESH_CHECK_MS = 10 * 1000;
// Reading terminals' labels and statuses asks nothing of the machine, so close requests are checked often.
const CLOSE_REQUEST_CHECK_MS = 1000;
const HOUR_MS = 60 * 60 * 1000;
// A remote list at least this old refreshes when the person comes back to the panel or Herdr's window.
const STALE_ON_RETURN_MS = 10 * 1000;
// A Claude hook (claude-plugin/hooks/herdr-issues-changed.mjs) touches this file after Claude creates or changes a remote issue.
const changedStampPath = () => `${appHome()}/data/issues/changed`;
// Rows the list draws at first, and how many more each Show more adds: drawing every issue of a large
// team at once is too slow.
const ROW_LIMIT = 100;
/** @type {Record<number, string>} */
const PRIORITY_COLORS = { 1: "ansi1", 2: "working" };
// Lucide icons for Urgent, High, Medium and Low, as Linear shows priority.
/** @type {Record<number, string>} */
const PRIORITY_ICONS = { 1: "circle-alert", 2: "signal-high", 3: "signal-medium", 4: "signal-low" };
const PRIORITY_ICON_PX = 18;
const SLA_COLORS = { breached: "ansi1", high: "ansi1", medium: "working", low: "dim" };
/** @type {Record<string, string>} */
const SLA_ICONS = { breached: "🚨", high: "🔥", medium: "⚠️" };
// An issue row's padding inside its group's card.
const ROW_PADDING_PX = 14;
// The row's work button, kept on rows without one so every title wraps at the same edge.
const ACTION_COLUMN_PX = COMPACT_BUTTON_WIDTH_PX;
/** @returns {string} */
const contextKey = () => JSON.stringify(location());

// Closes the focused space, removing the checkout with it when it shows a linked worktree once removal's checks
// pass, and asking through the remove-worktree dialog when they don't.
/** @param {Context} cx */
async function closeFocusedSpace(cx) {
  const space = spaces().find((candidate) => candidate.id === focused()?.space);
  if (!space) return;
  if (await isLinkedWorktree(focused()?.cwd ?? space.folder, space.machine)) {
    await closeWorktreeSpace(space.id, { sleep: (ms) => cx.sleep(ms) });
  } else {
    run("space.close", { id: space.id });
  }
}

// Terminals whose close request is being acted on, until its label is removed, so the next check doesn't open a
// second dialog.
const closingTerminals = new Set();

// Closes the space of each finished session that asked with `issues close` and is now idle, removing its worktree.
/** @param {Context} cx */
function closeFinishedSessions(cx) {
  for (const request of readyCloseRequests(terminals(), spaces(), panes())) {
    if (closingTerminals.has(request.terminal)) continue;
    closingTerminals.add(request.terminal);
    hc(["label", request.terminal, `${CLOSE_LABEL}=`])
      .catch(() => {})
      .finally(() => closingTerminals.delete(request.terminal));
    closeWorktreeSpace(request.space, { ask: request.ask, sleep: (ms) => cx.sleep(ms) }).catch((error) =>
      notify({ title: "Could not remove the worktree", body: String(error) }),
    );
  }
}
// The new list, keeping each body already loaded for an issue that hasn't changed since.
/**
 * @param {Issue[]} issues
 * @param {Issue[]} previous
 * @returns {Issue[]}
 */
function withLoadedBodies(issues, previous) {
  const loaded = new Map(previous.filter((issue) => issue.body !== null).map((issue) => [issue.id, issue]));
  return issues.map((issue) => {
    const before = issue.body === null && loaded.get(issue.id);
    if (!before) return issue;
    return {
      ...issue,
      body: before.body,
      comments: before.comments,
      bodyStale: before.bodyStale || before.updated !== issue.updated,
    };
  });
}

/**
 * @param {(cx: Context) => void} onClick
 * @param {Theme} t
 */
const settingsButton = (onClick, t) =>
  iconButton({ id: "issues-settings-open", icon: "settings", tooltip: "Settings", onClick }, t);

/**
 * @param {number} count
 * @param {Theme} t
 */
const pullRequestBadge = (count, t) =>
  h_flex()
    .flex_none()
    .gap(3)
    .items_center()
    .text_color(t.dim)
    .child(svg("mods/issues/icons/pull-request.svg").flex_none().size(11))
    .child(div().child(String(count)));

const STRIP_ICON_PX = 16;
const STATUS_ICON_PX = 14;
// The open and closed arrows differ in width, so a group's name would shift as it toggles without a fixed slot.
const GROUP_ARROW_PX = 10;
const GROUP_REFRESH_ICON_PX = 11,
  STRIP_REFRESH_ICON_PX = 10;
const SYNC_SPIN_MS = 1000;
const NOT_A_REPOSITORY = "not-a-repository";
const ON_ANOTHER_MACHINE = "The issues panel can't track issues for a folder on another machine.";

// issues worktree sets up new checkouts, which can take minutes in a box app.
const ISSUES_WORKTREE_TIMEOUT_MS = 10 * 60 * 1000;
// issues worktree works on this computer's checkouts and needs the issue's branch.
/**
 * @param {Issue} issue
 * @param {Project | null} project
 */
const opensWithIssuesWorktree = (issue, project) => Boolean(issue.branch && project && !project.on);
/**
 * @param {number} count
 * @param {string} noun
 * @param {string} [nouns]
 */
const plural = (count, noun, nouns = `${noun}s`) => `${count} ${count === 1 ? noun : nouns}`;

export default class Issues extends View {
  /**
   * @param {import("gpui-shell").Props | undefined} _props
   * @param {AsyncContext} cx
   */
  init(_props, cx) {
    if (props()?.menu) {
      /** @type {Record<string, typeof FieldMenu | typeof ScopeMenu | typeof LabelMenu>} */
      const menus = { scope: ScopeMenu, labels: LabelMenu };
      this.menu = new (menus[props().menu] ?? FieldMenu)();
      return;
    }
    if (props()?.action) {
      this.worktreeDialog = new WorktreeDialog(cx);
      return;
    }
    /** @type {Issue[]} */
    this.issues = [];
    /** @type {Set<string>} */
    this.unloaded = new Set();
    this.generation = 0;
    this.listScroll = ScrollHandle.new();
    this.revealing = null;
    this.rowLimit = ROW_LIMIT;
    this.untrackedFolder = null;
    /** @type {Map<string, Shown>} */
    this.shownByContext = new Map();
    this.keptSetups = new KeptSetups((/** @type {Context} */ cx) => this.refresh(cx));
    this.editing = null;
    this.saving = false;
    this.detailError = null;
    this.openings = new Openings();
    this.links = {
      hasIssue: (/** @type {string} */ id) => this.hasIssue(id),
      onOpen: (/** @type {string} */ id, /** @type {Context} */ cx) => this.open(id, cx),
    };
    this.noticeSpaceSwitch();
    this.refresh(cx, { reuse: true });
    this.collapse = collapseState();
    /** @type {Awaited<ReturnType<typeof offeredUpdate>> | null} */
    this.availableUpdate = null;
    this.updated = false;
    this.updateCheckedAt = null;
    this.updateCheckMs = DEFAULT_UPDATE_CHECK_HOURS * HOUR_MS;
    this.checkForUpdate(cx);
    cx.timer.every(REFRESH_CHECK_MS, (cx) => this.poll(cx));
    cx.timer.every(CLOSE_REQUEST_CHECK_MS, (cx) => closeFinishedSessions(cx));
    // Herdr delivers a mod's commands only to a shown copy, so the keys in keys.json, such as cmd-shift-w's
    // close-space, do nothing in a layout without the panel.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "save") this.save(cx);
        else if (command === "toggle") this.toggleCollapsed(cx);
        else if (command === "refresh" && !this.busy()) this.refreshView(cx);
        else if (command === "close-space")
          closeFocusedSpace(cx).catch((error) => notify({ title: "Could not close the space", body: String(error) }));
        cx.notify();
      }
    });
  }

  // With `reuse`, a remote list fetched moments ago, by this copy or another, is shown without asking again,
  // so switching between spaces of one repository or coming back to the panel doesn't repeat the request.
  /**
   * @param {Context} cx
   * @param {{ reuse?: boolean }} [options]
   */
  refresh(cx, { reuse = false } = {}) {
    const context = contextKey();
    if (context !== this.context) {
      /** @type {string} */
      this.context = context;
      this.error = null;
      this.closeIssue();
      this.openingSpaceIssue = null;
      this.restoreShown(context);
    }
    const generation = ++this.generation;
    this.refreshedAt = Date.now();
    this.seenChangeAt = issuesChangedAt();
    this.refreshing = true;
    cx.spawn(async (cx) => {
      /** @type {string | null} */
      let scopeKey = null;
      try {
        const where = location();
        if (!where.cwd) throw new Error("No folder in focus");
        const root = where.on == null ? await repositoryRoot(where) : null;
        if (generation !== this.generation) return;
        if (!root) {
          this.showUntrackable(where, context);
          return;
        }
        scopeKey = await mainCheckout(root, where.on);
        const scope = selectedScope(scopeKey);
        if (generation !== this.generation) return;
        // Every checkout of a repository lists the same issues, so its list stays up across its spaces.
        if (scopeKey !== this.scopeKey) {
          this.forgetList();
          cx.notify();
        }
        this.project = { root, on: where.on };
        this.resolvedContext = context;
        /** @type {string | null} */
        this.scopeKey = scopeKey;
        this.untrackable = null;
        this.watchAppFiles(cx);
        const tracker = await trackerFor({ root, on: where.on });
        const { pollSeconds } = await pollSettings({ root, on: where.on });
        const { name: repositoryName } = await nameSettings({ root, on: where.on }).catch(() => ({
          name: /** @type {string | null} */ (null),
        }));
        if (generation !== this.generation) return;
        this.pollMs = pollSeconds * 1000;
        this.repositoryName = repositoryName;
        this.listedScope = scope;
        if (!tracker) {
          this.showSetup(scopeKey, null, cx);
          return;
        }
        // Collapsed groups that can wait aren't listed, so Linear isn't asked for issues nobody is looking at.
        const loads = loadsFor((group) => this.isExpanded(group));
        const unloaded = new Set(
          (tracker?.deferred?.(scope) ?? []).filter((each) => !(/** @type {Set<string>} */ (loads).has(each))),
        );
        const project = { root, on: where.on },
          listKey = `${scopeKey}\n${scope ?? ""}\n${[...loads].sort()}`;
        // A tracker is slow to list, so a scope not shown yet starts from its last list.
        if (tracker && this.listKey !== listKey) {
          const last = await lastList(listKey);
          if (last && generation === this.generation) {
            Object.assign(this, { project, tracker, scopeKey, listKey, issues: last, unloaded, loaded: true });
            cx.notify();
          }
        }
        const issues = tracker ? await fetchList(listKey, () => tracker.list(scope, loads), reuse) : [];
        if (generation !== this.generation) return;
        const leaving =
          this.openId && !issues.some((each) => each.id === this.openId) ? this.findIssue(this.openId) : null;
        Object.assign(this, {
          project,
          tracker,
          scopeKey,
          listKey,
          issues: withLoadedBodies(issues, this.issues),
          unloaded,
          error: null,
          setup: null,
        });
        this.shownByContext.set(context, {
          project,
          tracker,
          scopeKey,
          listKey,
          unloaded,
          listedScope: scope,
          repository: null,
          repositoryName,
        });
        if (leaving) this.holdOpenIssue(leaving, tracker, cx);
        publishScope(scopeKey, tracker, scope).catch(() => {});
        this.scanRepository(project, generation, cx);
      } catch (/** @type {any} */ e) {
        if (generation !== this.generation) return;
        if (e.fix && scopeKey) this.showSetup(scopeKey, e, cx);
        else this.error = String(e.message ?? e);
      } finally {
        if (generation === this.generation) {
          this.loaded = true;
          this.refreshing = false;
          cx.notify();
        }
      }
    });
  }

  // The setup view in place of the list: choosing a tracker, or `failure`, the problem that stops the
  // configured one loading. Each repository's setup is kept, so progress survives polls and other repositories.
  /**
   * @param {string} main
   * @param {SetupProblem | null} failure
   * @param {Context} cx
   */
  showSetup(main, failure, cx) {
    /** @type {TrackerSetup | null} */
    this.setup = this.keptSetups.forRepository(main);
    this.setup.showFailure(failure);
    Object.assign(this, {
      tracker: null,
      issues: [],
      unloaded: new Set(),
      listKey: null,
      repository: null,
      error: null,
      settingsView: null,
    });
    this.closeIssue();
    cx.notify();
  }

  /**
   * @param {Where} where
   * @param {string} context
   */
  showUntrackable(where, context) {
    this.forgetList();
    this.closeIssue();
    if (this.untrackedFolder !== where.cwd) this.initializeError = null;
    Object.assign(this, {
      setup: null,
      error: null,
      resolvedContext: context,
      untrackable: where.on == null ? NOT_A_REPOSITORY : ON_ANOTHER_MACHINE,
      untrackedFolder: where.cwd,
    });
  }

  // Runs git init in the folder outside a repository, then lists it, which leads into choosing a tracker.
  /** @param {Context} cx */
  initializeUntrackedFolder(cx) {
    const folder = this.untrackedFolder;
    this.initializing = true;
    this.initializeError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await initializeRepository(folder);
        this.refresh(cx);
      } catch (/** @type {any} */ e) {
        this.initializeError = e.message;
      } finally {
        this.initializing = false;
        cx.notify();
      }
    });
  }

  // A space shown before shows its last list at once, while the lookups that confirm it run again.
  /** @param {string} context */
  restoreShown(context) {
    const shown = this.shownByContext.get(context),
      issues = shown && rememberedList(shown.listKey);
    if (!issues || selectedScope(shown.scopeKey) !== shown.listedScope) return;
    Object.assign(this, { ...shown, issues, resolvedContext: context, untrackable: null, setup: null, loaded: true });
  }

  forgetList() {
    this.project = null;
    this.tracker = null;
    this.repositoryName = null;
    /** @type {Issue[]} */
    this.issues = [];
    /** @type {Set<string>} */
    this.unloaded = new Set();
    this.loaded = false;
    this.repository = null;
    this.scopeKey = null;
    this.listedScope = undefined;
    this.listKey = null;
    this.rowLimit = ROW_LIMIT;
    this.openingSpaceIssue = null;
    this.setup = null;
    this.settingsView = null;
  }

  // Settings change issues.json, which only this computer's repositories have entries in.
  canOpenSettings() {
    return Boolean(this.tracker && this.project && !this.project.on && this.scopeKey);
  }

  // Each saved setting refreshes the list at once, so the panel acts on it without waiting for the next poll.
  /** @param {Context} cx */
  openSettings(cx) {
    if (this.hasUnsavedEdits()) {
      this.detailError = "Save or cancel your edits first";
      cx.notify();
      return;
    }
    const view = new SettingsView(this.project, this.scopeKey, this.tracker, {
      onBack: (/** @type {Context} */ cx) => {
        if (this.settingsView === view) this.settingsView = null;
        cx.notify();
      },
      onSaved: (/** @type {Context} */ cx) => this.refresh(cx),
    });
    this.settingsView = view;
    view.load(cx);
    cx.notify();
  }

  // The open issue stays up after leaving the list, such as when it's done and the Done group isn't
  // listed, so its work can still be reviewed; it's read again for the change that moved it.
  /**
   * @param {Issue} issue
   * @param {Tracker} tracker
   * @param {Context} cx
   */
  holdOpenIssue(issue, tracker, cx) {
    /** @type {Issue | null} */
    this.heldIssue = issue;
    cx.spawn(async (cx) => {
      const current = await tracker.get(issue.id).catch(() => NONE);
      if (!current || this.heldIssue !== issue) return;
      this.heldIssue = current;
      cx.notify();
    });
  }

  // A listed issue, or the open one held after it left the list.
  /**
   * @param {string} id
   * @returns {Issue | undefined}
   */
  findIssue(id) {
    return this.issues.find((each) => each.id === id) ?? (this.heldIssue?.id === id ? this.heldIssue : undefined);
  }

  // Reads the repository's worktrees and branches for the issues just listed, after the list shows, and
  // deletes the branches of done issues that have been merged into main, so finished work leaves nothing behind.
  /**
   * @param {Project} project
   * @param {number} generation
   * @param {Context} cx
   */
  scanRepository(project, generation, cx) {
    cx.spawn(async (cx) => {
      const repository = await repositoryState(this.issues, project).catch(() => NONE);
      if (generation !== this.generation) return;
      this.repository = repository;
      this.settleOpening(cx);
      const shown = this.shownByContext.get(this.resolvedContext);
      if (shown?.listKey === this.listKey) shown.repository = repository;
      cx.notify();
      if (!repository?.mergedFinished.length) return;
      const deleted = await deleteMergedBranches(repository.mergedFinished, repository).catch(
        () => /** @type {string[]} */ ([]),
      );
      if (deleted.length)
        notify({
          title: `Deleted ${plural(deleted.length, "merged branch", "merged branches")}`,
          body: deleted.join(", "),
        });
    });
  }

  // A panel out of sight skips its polls, and refreshes once when it comes back instead. A collapsed panel
  // is still in sight, so its strip describes the focused repository.
  /** @param {Context} cx */
  poll(cx) {
    this.noticeSpaceSwitch();
    if (this.openings.awaiting) {
      this.settleOpening(cx);
      if (this.openings.awaiting) this.refresh(cx);
    }
    if (!this.refreshOnReturn(cx) && this.visible && this.pollDue()) this.refresh(cx);
    this.checkForUpdate(cx);
  }

  // Checks the mod's own checkout for an update when the panel loads and every updateCheckHours after, and
  // notices an update Update started having finished. Any failure is silent: the footer just shows nothing.
  /** @param {Context} cx */
  checkForUpdate(cx) {
    if (this.checkingUpdate || Date.now() - (this.updateCheckedAt ?? -Infinity) < this.updateCheckMs) return;
    this.checkingUpdate = true;
    cx.spawn(async (cx) => {
      const settings = await updateSettings().catch(() => NONE);
      if (settings) this.updateCheckMs = settings.updateCheckHours * HOUR_MS;
      if (await finishedUpdate().catch(() => false)) this.updated = true;
      this.availableUpdate = await offeredUpdate().catch(() => NONE);
      this.updateCheckedAt = Date.now();
      this.checkingUpdate = false;
      cx.notify();
    });
  }

  /** @param {Context} cx */
  startUpdate(cx) {
    const update = this.availableUpdate,
      { space } = focused() ?? {};
    if (!space) {
      this.detailError = "Focus a space to run the update in";
      cx.notify();
      return;
    }
    this.availableUpdate = null;
    cx.spawn(async (cx) => {
      try {
        run("tab.new", { space, ...(await installTab(update)) });
      } catch (/** @type {any} */ e) {
        this.detailError = `Could not start the update: ${e.message ?? e}`;
      }
      cx.notify();
    });
  }

  /** @param {Context} cx */
  dismissUpdate(cx) {
    const update = this.availableUpdate;
    this.availableUpdate = null;
    dismissUpdate(update).catch(() => {});
    cx.notify();
  }

  pollDue() {
    return Date.now() - this.refreshedAt >= (this.pollMs ?? DEFAULT_POLL_SECONDS * 1000);
  }

  /** @param {Context} cx */
  refreshOnReturn(cx) {
    const visible = panelVisible(),
      returned = visible && this.visible === false;
    this.visible = visible;
    const stale = returned && this.tracker && Date.now() - this.refreshedAt >= STALE_ON_RETURN_MS;
    if (stale) this.refresh(cx, { reuse: true });
    return stale;
  }

  // Crossing the collapse threshold, by a toggle or a drag, redraws the panel as the strip or the list.
  /**
   * @param {number} width
   * @param {Context} cx
   */
  noticeWidth(width, cx) {
    const wasCollapsed = this.collapse.collapsed;
    this.collapse.noticeWidth(width);
    if (this.collapse.collapsed !== wasCollapsed) cx.notify();
  }

  /** @param {Context} cx */
  toggleCollapsed(cx) {
    this.collapse.toggle();
    cx.notify();
  }

  // A badge in the strip expands the panel to the list, with the badge's group open and scrolled to the top,
  // listing the group's issues when they weren't, as opening it in the list does.
  /**
   * @param {string} groupId
   * @param {Context} cx
   * @param {{ unloaded?: boolean }} [options]
   */
  expandToGroup(groupId, cx, { unloaded = false } = {}) {
    if (this.hasUnsavedEdits()) this.detailError = "Save or cancel your edits first";
    else {
      this.closeIssue();
      setSectionOpen(this.scopeKey, groupId, true);
      this.revealing = { groupId, step: "end" };
      if (unloaded) this.refresh(cx);
    }
    this.toggleCollapsed(cx);
    cx.notify();
  }

  // A scroll handle reveals a child with the least scroll it can, which would stop a group below the view at
  // its bottom edge, so the list first scrolls to its end and, once that frame is laid out, back up to the
  // group. A render can run again before layout, so only the list's size report, which comes after layout,
  // moves on to the second scroll.
  /** @param {Group[]} groups */
  revealGroup(groups) {
    const revealing = this.revealing;
    if (!revealing) return;
    const index = groups.findIndex((group) => group.id === revealing.groupId);
    if (index < 0) {
      this.revealing = null;
      return;
    }
    if (revealing.step === "end") {
      this.listScroll.scroll_to_item(groups.length - 1);
      revealing.step = "laying-out";
    } else if (revealing.step === "group") {
      this.listScroll.scroll_to_item(index);
      this.revealing = null;
    }
  }

  /** @param {Context} cx */
  noticeListLaidOut(cx) {
    if (this.revealing?.step !== "laying-out") return;
    this.revealing.step = "group";
    cx.notify();
  }

  // issues.json picks each repository's tracker, the key file holds Linear's API key on a system without the
  // Keychain, and the changed stamp says Claude just made or changed an issue, so a change to any of them refreshes
  // the panel at once rather than at the next poll, without the lookups kept from those files. The app's folder holds more than these files, so other
  // changes there are ignored.
  /** @param {Context} cx */
  watchAppFiles(cx) {
    if (this.watchingAppFiles) return;
    this.watchingAppFiles = true;
    const folder = appHome(),
      files = [settingsPath(), linearKeyPath(), changedStampPath()];
    cx.spawn(async (cx) => {
      try {
        // Changes arrive under the folder's real path when the app's folder is reached through a symlink.
        const realFolder = (await exec("pwd", ["-P"], { cwd: folder })).stdout.trim();
        const watched = new Set([
          folder,
          realFolder,
          ...files,
          ...files.map((file) => `${realFolder}${file.slice(folder.length)}`),
        ]);
        for (;;) {
          const paths = await watchFolder(folder);
          if (paths.some((path) => watched.has(path))) {
            forgetLookups();
            this.refresh(cx);
          }
        }
      } catch {
        this.watchingAppFiles = false;
      }
    });
  }

  // Keeps the issue as it was read, so saving can tell whether it changed underneath the edit.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  edit(issue, cx) {
    const t = /** @type {Theme} */ (theme());
    this.detailError = null;
    this.editing = {
      issue,
      state: EditorState.new({
        language: "markdown",
        value: issue.body,
        soft_wrap: true,
        line_numbers: false,
        folding: false,
        font_family: /** @type {string} */ (settings().font_family),
        font_size: 12,
        syntax: {
          keyword: t.ansi5,
          string: t.ansi2,
          comment: t.dim,
          function: t.ansi4,
          type: t.ansi3,
          number: t.ansi1,
          constant: t.ansi6,
        },
      }),
    };
    this.editing.state.on("submit", (event, cx) => {
      if (event.secondary) this.save(cx);
    });
    cx.notify();
  }

  stopEditing() {
    this.editing?.state.release();
    this.editing = null;
    this.saving = false;
    this.detailError = null;
  }

  hasUnsavedEdits() {
    return Boolean(this.editing) && this.editing.state.value().trim() !== this.editing.issue.body;
  }

  closeIssue() {
    this.stopEditing();
    this.openId = null;
    this.heldIssue = null;
  }

  // Shows another issue, such as a blocker, unless that would throw away unsaved edits.
  /**
   * @param {string} id
   * @param {Context} cx
   */
  open(id, cx) {
    if (this.hasUnsavedEdits()) this.detailError = "Save or cancel your edits first";
    else {
      this.stopEditing();
      this.openId = id;
    }
    cx.notify();
  }

  // Remembers a switch to another space, which polls notice while the panel is hidden, so the panel opens
  // the issue the space is named after once it's shown there.
  noticeSpaceSwitch() {
    const space = spaces().find((each) => each.active);
    if (space?.id === this.activeSpaceId) return;
    /** @type {string | undefined} */
    this.activeSpaceId = space?.id;
    this.spaceRequest = space?.named ? { space: space.id, name: space.name } : null;
  }

  // Opens the issue the space just switched to is named after, once the space's issues have loaded. An issue
  // the list leaves out, such as a done one, is read on its own.
  /** @param {Context} cx */
  openSpaceIssue(cx) {
    const request = this.spaceRequest,
      project = this.project,
      tracker = this.tracker;
    if (!request || !this.loaded || this.resolvedContext !== this.context || request.space !== this.activeSpaceId)
      return;
    this.spaceRequest = null;
    if (!project || !tracker || this.hasUnsavedEdits()) return;
    this.openingSpaceIssue = request;
    const stillWanted = () =>
      this.openingSpaceIssue === request &&
      this.activeSpaceId === request.space &&
      this.tracker === tracker &&
      !this.hasUnsavedEdits();
    cx.spawn(async (cx) => {
      const id = await issueIdOfSpace(project, request.name);
      if (!id || !stillWanted()) return;
      const issue = this.hasIssue(id) ? null : await tracker.get(id).catch(() => NONE);
      if (!stillWanted() || (!issue && !this.hasIssue(id))) return;
      this.stopEditing();
      this.openId = issue?.id ?? id;
      if (issue) this.heldIssue = issue;
      cx.notify();
    });
  }

  // Fetches the open issue's body when its list left it out.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  loadBody(issue, cx) {
    const tracker = this.tracker;
    if ((issue.body !== null && !issue.bodyStale) || this.loadingBody === issue.id || !tracker) return;
    /** @type {string | null} */
    this.loadingBody = issue.id;
    cx.spawn(async (cx) => {
      try {
        const full = await tracker.get(issue.id);
        if (!full) throw new Error(`${issue.id} was not found`);
        Object.assign(issue, { body: full.body, comments: full.comments, updated: full.updated, bodyStale: false });
      } catch (/** @type {any} */ e) {
        this.detailError = `Could not load ${issue.id}: ${e.message ?? e}`;
      }
      this.loadingBody = null;
      cx.notify();
    });
  }

  /** @param {string} id */
  hasIssue(id) {
    return this.issues.some((issue) => issue.id === id);
  }

  /** @param {Context} cx */
  back(cx) {
    if (this.hasUnsavedEdits()) this.detailError = "Save or cancel your edits first";
    else this.closeIssue();
    cx.notify();
  }

  /** @param {Context} cx */
  save(cx) {
    const editing = this.editing,
      tracker = this.tracker;
    if (!editing || this.saving || !tracker?.writable) return;
    if (!this.hasUnsavedEdits()) {
      this.stopEditing();
      cx.notify();
      return;
    }
    this.saving = true;
    this.detailError = null;
    cx.spawn(async (cx) => {
      try {
        await tracker.update(editing.issue, { body: editing.state.value() });
        if (this.editing === editing) this.stopEditing();
        this.refresh(cx);
      } catch (/** @type {any} */ e) {
        if (this.editing === editing) {
          this.saving = false;
          this.detailError = `Could not save: ${e.message ?? e}`;
        }
      }
      cx.notify();
    });
    cx.notify();
  }

  // The code spans in the issue's body that name files in the project, found once per body.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  filesInBody(issue, cx) {
    const { root, on } = this.project,
      key = `${root}\n${issue.body}`;
    if (issue.body === null) return new Set();
    if (!on) prefetchEditor();
    if (this.bodyFiles?.key === key) return this.bodyFiles.files;
    /** @type {{ key: string, files: Set<string> }} */
    this.bodyFiles = { key, files: new Set() };
    const bodyFiles = this.bodyFiles,
      paths = codeSpanPaths(issue.body);
    if (!paths.length) return bodyFiles.files;
    cx.spawn(async (cx) => {
      const listFiles = 'for path; do [ -f "$path" ] && printf "%s\\n" "$path"; done; true';
      const found = await exec("sh", ["-c", listFiles, "sh", ...paths], { cwd: root, on }).catch(() => NONE);
      if (found?.code !== 0 || this.bodyFiles !== bodyFiles) return;
      bodyFiles.files = new Set(found.stdout.split("\n").filter(Boolean));
      cx.notify();
    });
    return bodyFiles.files;
  }

  // Opens a text file in the user's editor, and hands a URL or any other file to macOS `open`.
  /**
   * @param {Issue} issue
   * @param {string} url
   * @param {Context} cx
   */
  openLink(issue, url, cx) {
    const { file, url: address } = /** @type {{ file?: string, url?: string }} */ (linkTarget(url, this.project.root));
    if (file && this.project?.on) {
      this.detailError = `${file} is on ${this.project.on}, so it can't be opened here`;
      cx.notify();
      return;
    }
    this.detailError = null;
    cx.spawn(async (cx) => {
      if (file && (await isTextFile(file)))
        await openInEditor(file, this.project.root).catch((e) => {
          this.detailError = `Could not open ${file}: ${e.message ?? e}`;
        });
      else {
        const target = file ?? address;
        const opened = await exec("open", [target]).catch((e) => ({ code: 1, stderr: String(e.message ?? e) }));
        if (opened.code !== 0) this.detailError = `Could not open ${target}: ${opened.stderr.trim()}`;
      }
      cx.notify();
    });
    cx.notify();
  }

  // Shows the checkbox's new state at once. Saves run one after another, each over the body the
  // previous one wrote, so quick clicks never look like an edit made elsewhere meanwhile.
  /**
   * @param {Issue} issue
   * @param {number} line
   * @param {Context} cx
   */
  toggleTask(issue, line, cx) {
    const tracker = this.tracker;
    if (!tracker?.writable || this.editing) return;
    const before = { ...issue };
    try {
      issue.body = toggleTask(issue.body, line);
    } catch (/** @type {any} */ e) {
      this.detailError = String(e.message ?? e);
      cx.notify();
      return;
    }
    const body = issue.body;
    this.detailError = null;
    /** @type {Promise<void>} */
    const saved = (this.taskSaves ?? Promise.resolve()).catch(() => {}).then(() => tracker.update(before, { body }));
    this.taskSaves = saved;
    cx.spawn(async (cx) => {
      try {
        await saved;
      } catch (/** @type {any} */ e) {
        this.detailError = `Could not save the checkbox: ${e.message ?? e}`;
        this.refresh(cx);
      }
      cx.notify();
    });
    cx.notify();
  }

  // A fresh Claude session, or a shell without Claude Code, in a new worktree space on the issue's branch, working the issue with /issues:work.
  // Without a branch, the worktree dialog asks for one. The tracker saves the start while the worktree opens, and the
  // list shows it as soon as it's saved, since opening can take many seconds.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  startWork(issue, cx) {
    const tracker = this.tracker;
    if (!tracker?.writable) {
      this.detailError = "Can't mark this issue in progress here";
      cx.notify();
      return;
    }
    this.detailError = null;
    this.showOpening(issue, `Opening ${issue.id}'s worktree…`, cx);
    cx.spawn(async (cx) => {
      try {
        const opening = opensWithIssuesWorktree(issue, this.project)
          ? this.openWithIssuesWorktree(issue)
          : this.spaceName(issue)
              .then((spaceName) => this.openWorktreeDialog(issue, spaceName))
              .then(() => NONE);
        const starting = tracker.start(issue).then(
          /** @returns {string | null} */
          () => {
            this.refresh(cx);
            return null;
          },
          /** @returns {string | null} */
          (/** @type {any} */ e) => `Could not start: ${e.message ?? e}`,
        );
        const [openError, startError] = await Promise.all([opening, starting]);
        this.detailError = startError ?? openError;
        this.refresh(cx);
        this.finishOpening(issue, opensWithIssuesWorktree(issue, this.project), cx);
      } catch (e) {
        this.openings.end(issue.id);
        cx.notify();
        throw e;
      }
    });
  }

  // Ends the opening state, unless the issues worktree opened without error: then the issue's buttons stay loading
  // until a read of the repository shows its space, or the wait times out.
  /**
   * @param {Issue} issue
   * @param {boolean} awaitSpace
   * @param {Context} cx
   */
  finishOpening(issue, awaitSpace, cx) {
    if (awaitSpace && !this.detailError) {
      this.openings.awaitSpace(issue.id, Date.now());
      this.settleOpening(cx);
    } else {
      this.openings.end(issue.id);
      cx.notify();
    }
  }

  // Ends each opening state that was waiting for its issue's space once the space shows or the wait runs out.
  /** @param {Context} cx */
  settleOpening(cx) {
    if (!this.openings.awaiting) return;
    this.openings.settle((id, awaitingSince) => {
      const issue = this.findIssue(id);
      return Boolean(
        issue &&
        stillWaitingForSpace({
          failed: false,
          inSpace: this.spaceShowingWorktree(issue).inSpace,
          waitedMs: Date.now() - awaitingSince,
          timeoutMs: ISSUES_WORKTREE_TIMEOUT_MS,
        }),
      );
    });
    cx.notify();
  }

  // The tracker's labels, read once per tracker, which the panel makes anew each refresh, with the issue's own
  // labels. A tracker without a list, Beads, offers only the issue's labels, to remove.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  openLabelsMenu(issue, cx) {
    const tracker = this.tracker;
    if (this.labelChoices?.tracker !== tracker)
      this.labelChoices = { tracker, names: tracker.labels?.() ?? Promise.resolve([]) };
    const { names } = this.labelChoices;
    cx.spawn(async (cx) => {
      try {
        openIssueLabelsMenu(issue, this.project, await names);
      } catch (/** @type {any} */ e) {
        if (this.labelChoices?.names === names) this.labelChoices = null;
        this.detailError = `Could not list the labels: ${e.message ?? e}`;
      }
      cx.notify();
    });
  }

  // This project's field edits that haven't saved yet, or whose save failed: [[id, edit]].
  projectEdits() {
    const project = this.project;
    if (!project) return [];
    return Object.entries(fieldEdits()).filter(
      ([, edit]) => edit.root === project.root && edit.on === (project.on ?? null),
    );
  }

  // Shows each edit on its issue, puts a failed one's field back, and saves the edits no copy has claimed.
  /** @param {Context} cx */
  applyFieldEdits(cx) {
    for (const [id, edit] of this.projectEdits()) {
      const issue = this.findIssue(edit.issueId);
      if (issue) showFieldEdit(issue, edit);
      if (!edit.failed && this.tracker && claimEdit(id)) this.saveFieldEdit(id, edit, cx);
    }
  }

  /**
   * @param {string} id
   * @param {FieldEdit} edit
   * @param {Context} cx
   */
  saveFieldEdit(id, edit, cx) {
    const tracker = this.tracker;
    cx.spawn(async (cx) => {
      try {
        const issue = this.issues.find((each) => each.id === edit.issueId) ?? (await tracker.get(edit.issueId));
        if (!issue) throw new Error(`${edit.issueId} was not found`);
        await tracker.update(issue, trackerFields(edit));
        forgetEdits([id]);
        announceIssueChange();
      } catch (/** @type {any} */ e) {
        markEditFailed(id, `Could not change the ${edit.field} of ${edit.issueId}: ${e.message ?? e}`);
      }
      cx.notify();
    });
  }

  // Re-lists the issues and, with an issue open, reads that issue again in full, even when the list kept its body.
  /** @param {Context} cx */
  refreshView(cx) {
    const issue = this.findIssue(this.openId),
      tracker = this.tracker;
    this.refresh(cx);
    if (!issue || !tracker) return;
    this.refreshingIssue = issue.id;
    cx.spawn(async (cx) => {
      try {
        const current = await tracker.get(issue.id);
        if (!current) throw new Error(`${issue.id} was not found`);
        if (tracker !== this.tracker) return;
        if (this.heldIssue?.id === current.id) this.heldIssue = current;
        this.issues = this.issues.map((each) => (each.id === current.id ? current : each));
      } catch (/** @type {any} */ e) {
        this.detailError = `Could not load ${issue.id}: ${e.message ?? e}`;
      } finally {
        if (this.refreshingIssue === issue.id) this.refreshingIssue = null;
        cx.notify();
      }
    });
  }

  // A refresh running or an edit saving.
  busy() {
    return Boolean(this.refreshing || this.refreshingIssue || this.projectEdits().some(([, edit]) => !edit.failed));
  }

  /** @param {Theme} t */
  refreshButton(t) {
    const busy = this.busy();
    return iconButton(
      {
        id: "issues-refresh",
        icon: "rotate-cw",
        tooltip: "Refresh",
        spin: busy ? SYNC_SPIN_MS : undefined,
        onClick: busy
          ? null
          : (cx) => {
              this.refreshView(cx);
              cx.notify();
            },
      },
      t,
    );
  }

  // An alert while any edit failed to save, which a click dismisses.
  /** @param {Theme} t */
  failedEditAlert(t) {
    const failed = this.projectEdits().filter(([, edit]) => edit.failed);
    if (!failed.length) return null;
    return iconButton(
      {
        id: "issues-edit-failed",
        icon: "circle-alert",
        color: t.ansi1,
        tooltip: `${failed.map(([, edit]) => edit.failed).join("\n")}\nClick to dismiss.`,
        onClick: (cx) => {
          forgetEdits(failed.map(([id]) => id));
          cx.notify();
        },
      },
      t,
    );
  }

  // Starting and continuing work wait on the tracker and issues worktree, so the footer says what they're doing meanwhile.
  /**
   * @param {Issue} issue
   * @param {string} status
   * @param {Context} cx
   * @param {{ merging?: boolean }} [options]
   */
  showOpening(issue, status, cx, options) {
    this.openings.begin(issue.id, status, options);
    cx.notify();
  }

  /**
   * @param {Theme} t
   * @param {string} status
   */
  openingFooter(t, status) {
    return h_flex()
      .flex_none()
      .h(30)
      .px(14)
      .items_center()
      .border_t(1)
      .border_color(t.border)
      .text_size(11)
      .text_color(t.dim)
      .child(div().min_w(0).truncate().child(status));
  }

  // An available update, with a link that starts it and a dismiss control, or the note that an update finished.
  /** @param {Theme} t */
  updateFooter(t) {
    return updateFooter(t, {
      updateAvailable: Boolean(this.availableUpdate),
      onUpdate: (cx) => this.startUpdate(cx),
      onDismissUpdate: (cx) => this.dismissUpdate(cx),
      onDismissUpdated: (cx) => {
        this.updated = false;
        cx.notify();
      },
    });
  }

  // Whether the issue view offers Merge for the open issue, checked again for each list the panel reads. The last
  // answer for the same issue stands meanwhile, so the button doesn't flicker on every poll.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  mergeOffered(issue, cx) {
    const key = `${issue.id}\n${issue.branch}\n${this.generation}`;
    if (this.mergeOffer?.key === key) return this.mergeOffer.offered;
    const project = this.project,
      kept = this.mergeOffer?.id === issue.id && this.mergeOffer.offered;
    /** @type {{ key: string, id: string, offered: boolean }} */
    this.mergeOffer = { key, id: issue.id, offered: kept };
    const offer = this.mergeOffer;
    if (!this.tracker?.writable || !project) {
      offer.offered = false;
      return false;
    }
    cx.spawn(async (cx) => {
      const offered = await canOfferMerge(issue.branch, project).catch(() => false);
      if (this.mergeOffer !== offer || offer.offered === offered) return;
      offer.offered = offered;
      cx.notify();
    });
    return kept;
  }

  // Merges the issue's branch into main and marks it done, through the same module as `issues merge`, then removes
  // its worktree and closes the space showing it, through the removal dialog only when a check fails. When main moved
  // on and needs verifying, it keeps the issue open and the space, whose waiting session verifies main and finishes.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  mergeBranch(issue, cx) {
    const tracker = this.tracker,
      project = this.project;
    this.detailError = null;
    this.showOpening(issue, `Merging ${issue.branch} into main…`, cx, { merging: true });
    cx.spawn(async (cx) => {
      try {
        const { needsVerifying } = await mergeIssue(issue, tracker, project);
        const space = worktreeSpace(this.repository, issue.branch);
        if (needsVerifying)
          notify({
            title: `Merged ${issue.branch}; main needs verifying`,
            body: `main moved on since the branch was tested, so ${issue.id} stays open until its session verifies main.`,
          });
        else if (space)
          closeWorktreeSpace(space.id, { sleep: (ms) => cx.sleep(ms) }).catch((error) =>
            notify({ title: "Could not remove the worktree", body: String(error) }),
          );
      } catch (/** @type {any} */ e) {
        this.detailError =
          e instanceof MergeRefusal || e instanceof MergedWithProblems
            ? e.message
            : `Could not merge: ${e.message ?? e}`;
      }
      this.openings.end(issue.id);
      this.refresh(cx);
      cx.notify();
    });
  }

  // Picks up an issue already in progress: its space when one is open, selected at once, else a new space on
  // its worktree, else a new worktree on its branch, fetched from origin when the work began elsewhere.
  /**
   * @param {Issue} issue
   * @param {Context} cx
   */
  continueWork(issue, cx) {
    const project = this.project;
    this.detailError = null;
    const space = worktreeSpace(this.repository, issue.branch);
    if (space) {
      run("space.select", { id: space.id });
      return;
    }
    this.showOpening(issue, `Opening ${issue.id}'s worktree…`, cx);
    cx.spawn(async (cx) => {
      try {
        if (opensWithIssuesWorktree(issue, project)) this.detailError = await this.openWithIssuesWorktree(issue);
        else {
          const spaceName = await this.spaceName(issue);
          const worktree = project && (await worktreeFor(issue.branch, project));
          if (worktree?.space) run("space.select", { id: worktree.space.id });
          else if (worktree)
            run("space.new", {
              name: spaceName,
              folder: worktree.path,
              machine: worktree.on,
              ...(await workIssueSession(issue, project)),
              ...openBehindArgs(updates().app.version),
            });
          else await this.openWorktreeDialog(issue, spaceName);
        }
      } catch (/** @type {any} */ e) {
        this.detailError = `Could not continue: ${e.message ?? e}`;
      }
      this.refresh(cx);
      this.finishOpening(issue, opensWithIssuesWorktree(issue, project), cx);
    });
  }

  // Opens the issue's branch with issues worktree, which switches to the space already showing it, or opens one
  // nested under the repository's space with Claude working the issue when it runs. Returns an error message, or null.
  // Without issues installed, the worktree dialog opens instead.
  /**
   * @param {Issue} issue
   * @returns {Promise<string | null>}
   */
  async openWithIssuesWorktree(issue) {
    const spaceName = await this.spaceName(issue);
    const args = await issuesWorktreeArgs(issue, { spaceName, isNew: needsNewBranch(issue) });
    const result = await exec("issues", args, { cwd: this.project.root, timeout: ISSUES_WORKTREE_TIMEOUT_MS }).catch(
      () => NONE,
    );
    if (!result) {
      await this.openWorktreeDialog(issue, spaceName);
      return null;
    }
    if (result.code === 0) return null;
    const lastLine = (result.stderr || result.stdout).trim().split("\n").pop();
    return `Could not open the worktree: ${lastLine || `issues worktree exited with ${result.code}`}`;
  }

  /** @param {Issue} issue */
  spaceName(issue) {
    return panelIssueSpaceName(this.project, issue.id);
  }

  /**
   * @param {Issue} issue
   * @param {string} spaceName
   */
  async openWorktreeDialog(issue, spaceName) {
    const project = this.project;
    const session = await workIssueSession(issue, project);
    openOverlay({
      mod: "issues",
      kind: "dialog",
      width: 440,
      height: 260,
      props: {
        folder: project?.root,
        machine: project?.on ?? null,
        action: "new",
        branch: issue.branch ?? undefined,
        name: spaceName,
        ...session,
        behind: true,
      },
    });
  }
  // Expanding a group whose issues weren't listed lists them.
  /**
   * @param {Group} group
   * @param {Context} cx
   */
  toggle(group, cx) {
    setSectionOpen(this.scopeKey, group.id, !this.isExpanded(group));
    if (group.unloaded && this.isExpanded(group)) this.refresh(cx);
    cx.notify();
  }

  /** @param {import("./issue.js").Group} group */
  isExpanded(group) {
    return isSectionOpen(this.scopeKey, group);
  }

  prioritized() {
    return this.tracker?.prioritized !== false;
  }

  /**
   * @param {Issue} issue
   * @param {number} idColumnPx
   * @param {Theme} t
   */
  row(issue, idColumnPx, t) {
    const blockers = holdingBlockers(issue, this.issues);
    const waiting = waitingIssues(issue, this.issues),
      sla = slaStatus(issue),
      due = dueStatus(issue),
      pullRequestCount = issue.pullRequests?.length ?? 0,
      project = listsProject(this.listedScope, issue.project) ? null : issue.project,
      chips = labelChips(issue, t, { withProject: false }).slice(0, 3);
    const finishable = canFinishWork(issue),
      startable = canStartWork(issue, this.issues);
    const { inSpace, inActiveSpace } = this.spaceShowingWorktree(issue);
    return v_flex()
      .id(`issue-${issue.id}`)
      .flex_none()
      .px(ROW_PADDING_PX)
      .py(10)
      .gap(3)
      .cursor_pointer()
      .hover((s) => s.bg(/** @type {Color} */ (rowHover(t))))
      .on_mouse_up("left", (_e, cx) => {
        cx.stop_propagation();
        this.openId = issue.id;
        cx.notify();
      })
      .child(
        h_flex()
          .gap(12)
          .items_start()
          .child(
            v_flex()
              .flex_none()
              .w(idColumnPx)
              .pt(1)
              .gap(3)
              .text_size(11)
              .child(div().truncate().text_color(t.accent).child(issue.id))
              .when(Boolean(sla), (e) =>
                e.child(
                  div()
                    .text_color(t[SLA_COLORS[sla.risk]])
                    .child([SLA_ICONS[sla.risk], sla.text].filter(Boolean).join(" ")),
                ),
              )
              .when(Boolean(due), (e) =>
                e.child(div().whitespace_normal().text_color(t[DUE_COLORS[due.urgency]]).child(due.text)),
              )
              .when(issue.priority > 0, (e) =>
                e.child(
                  h_flex()
                    .gap(6)
                    .items_center()
                    .child(
                      div()
                        .id(`priority-${issue.id}`)
                        .flex_none()
                        .tooltip(PRIORITIES[issue.priority])
                        .child(
                          svg(`mods/issues/icons/${PRIORITY_ICONS[issue.priority]}.svg`)
                            .size(PRIORITY_ICON_PX)
                            .text_color(t[PRIORITY_COLORS[issue.priority]] ?? t.dim),
                        ),
                    )
                    .when(pullRequestCount > 0, (e) => e.child(pullRequestBadge(pullRequestCount, t))),
                ),
              )
              .when(issue.priority <= 0 && pullRequestCount > 0, (e) => e.child(pullRequestBadge(pullRequestCount, t))),
          )
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(3)
              .child(div().whitespace_normal().child(issue.title))
              .when(Boolean(project), (e) =>
                e.child(
                  projectName(/** @type {import("./trackers/index.js").IssueProject} */ (project))
                    .text_size(11)
                    .text_color(t.dim),
                ),
              )
              .when(chips.length > 0 || blockers.length > 0 || waiting.length > 0, (e) =>
                e.child(
                  h_flex()
                    .flex_wrap()
                    .gap_x(8)
                    .gap_y(2)
                    .items_center()
                    .text_size(11)
                    .text_color(t.dim)
                    .overflow_hidden()
                    .children(chips)
                    .when(blockers.length > 0, (e) =>
                      e.child(
                        h_flex()
                          .flex_none()
                          .gap(4)
                          .items_center()
                          .text_color(t.blocked)
                          .child(div().flex_none().child("Blocked by"))
                          .child(issueLinks(`row-blocker-${issue.id}`, blockers, this.links, t, t.blocked)),
                      ),
                    )
                    .when(waiting.length > 0, (e) =>
                      e.child(
                        h_flex()
                          .flex_none()
                          .gap(4)
                          .items_center()
                          .child(div().flex_none().child("Blocking"))
                          .child(issueLinks(`row-blocking-${issue.id}`, waiting, this.links, t, t.accent)),
                      ),
                    ),
                ),
              )
              .when(Boolean(issue.assignee), (e) => e.child(this.assignee(issue, t))),
          )
          .when(Boolean(this.tracker?.writable), (e) =>
            e.child(
              h_flex()
                .flex_none()
                .w(ACTION_COLUMN_PX)
                .justify_end()
                .when(finishable || startable || inSpace, (e) =>
                  e.child(
                    workButton(
                      `row-${issue.id}`,
                      {
                        finishable,
                        startable,
                        inSpace,
                        inActiveSpace,
                        opening: Boolean(this.openings.get(issue.id)),
                        loading: this.openings.get(issue.id)?.merging === false,
                        onStart: (cx) => this.startWork(issue, cx),
                        onContinue: (cx) => this.continueWork(issue, cx),
                      },
                      t,
                      { primary: false, compact: true },
                    ),
                  ),
                ),
            ),
          ),
      );
  }

  // Whether a space shows the issue's worktree, and whether it is the active space.
  /** @param {Issue} issue */
  spaceShowingWorktree(issue) {
    const space = worktreeSpace(this.repository, issue.branch);
    return { inSpace: Boolean(space), inActiveSpace: Boolean(space?.active) };
  }

  // The assignee's name after their avatar once it is cached, then the agent it's delegated to, if any.
  /**
   * @param {Issue} issue
   * @param {Theme} t
   * @param {Color} [textColor]
   */
  assignee(issue, t, textColor = t.dim) {
    const avatar = avatarImage(issue.assigneeAvatar, (loading) => this.avatarLoads.push(loading));
    const delegateAvatar = avatarImage(issue.delegateAvatar, (loading) => this.avatarLoads.push(loading));
    return h_flex()
      .min_w(0)
      .gap(5)
      .items_center()
      .text_size(11)
      .text_color(textColor)
      .when(Boolean(avatar), (e) =>
        e.child(
          image(avatar ?? "")
            .flex_none()
            .size(AVATAR_PX)
            .rounded(AVATAR_PX / 2),
        ),
      )
      .child(
        div()
          .min_w(0)
          .truncate()
          .child(issue.assignee ?? ""),
      )
      .when(Boolean(issue.delegate), (e) =>
        e
          .child(div().flex_none().child("›"))
          .child(
            delegateAvatar
              ? image(delegateAvatar)
                  .flex_none()
                  .size(AVATAR_PX)
                  .rounded(AVATAR_PX / 2)
              : svg("mods/issues/icons/cloud.svg").flex_none().size(AVATAR_PX).text_color(t.ansi4),
          )
          .child(
            div()
              .min_w(0)
              .truncate()
              .child(issue.delegate ?? ""),
          ),
      );
  }

  // The name of the person who created the issue, after their avatar once it is cached.
  /**
   * @param {Issue} issue
   * @param {Theme} t
   */
  creator(issue, t) {
    const avatar = avatarImage(issue.creatorAvatar, (loading) => this.avatarLoads.push(loading));
    return h_flex()
      .min_w(0)
      .gap(5)
      .items_center()
      .text_size(PROPERTY_TEXT_PX)
      .text_color(t.foreground)
      .when(Boolean(avatar), (e) =>
        e.child(
          image(avatar ?? "")
            .flex_none()
            .size(AVATAR_PX)
            .rounded(AVATAR_PX / 2),
        ),
      )
      .child(
        div()
          .min_w(0)
          .truncate()
          .child(issue.creator ?? ""),
      );
  }

  /** @param {string | null} label */
  groups(label) {
    const { tracker } = this;
    if (!tracker) return [];
    return groupIssues(this.issues, this.unloaded, label, { recentlyClosed: tracker.recentlyClosed ?? null });
  }

  // Its issue count, or while its issues aren't listed, … when expanded and so being listed, else a refresh icon.
  /**
   * @param {Group} group
   * @param {boolean} expanded
   * @param {Theme} t
   */
  groupCount(group, expanded, t) {
    const count = groupCountText(group);
    if (count !== null) return div().text_color(t.dim).child(count);
    if (expanded) return div().text_color(t.dim).child("…");
    return svg("mods/issues/icons/rotate-cw.svg").flex_none().size(GROUP_REFRESH_ICON_PX).text_color(t.dim);
  }

  // The group's heading, and when it is expanded, a card of its first `shown` issues, then Show more for the rest.
  /**
   * @param {Group} group
   * @param {number} shown
   * @param {number} idColumnPx
   * @param {{ above: number, below: number }} spacing
   * @param {Theme} t
   */
  group(group, shown, idColumnPx, spacing, t) {
    const expanded = this.isExpanded(group),
      hidden = group.issues.length - shown;
    const icon = statusIcon(group.id);
    const rows = expanded ? group.issues.slice(0, shown).map((issue) => this.row(issue, idColumnPx, t)) : [];
    if (expanded && hidden > 0)
      rows.push(
        div()
          .id(`show-more-${group.id}`)
          .flex_none()
          .px(ROW_PADDING_PX)
          .py(8)
          .cursor_pointer()
          .text_size(12)
          .text_color(t.accent)
          .hover((s) => s.bg(/** @type {Color} */ (rowHover(t))))
          .on_click((_e, cx) => {
            this.rowLimit += ROW_LIMIT;
            cx.notify();
          })
          .child(`Show ${hidden} more`),
      );
    const fill = /** @type {Color} */ (statusTints(group.id, t)?.fill ?? t.raised),
      joined = rows.length > 0;
    return v_flex()
      .flex_none()
      .mt(spacing.above)
      .mb(spacing.below)
      .child(
        h_flex()
          .id(`group-${group.id}`)
          .px(10)
          .py(4)
          .gap(6)
          .items_center()
          .border_1()
          .border_color(t.border)
          .when(joined, (e) => e.border_b(0).rounded_t(CARD_RADIUS_PX))
          .when(!joined, (e) => e.rounded(CARD_RADIUS_PX))
          .cursor_pointer()
          .text_size(11)
          .bg(fill)
          .text_color(t.foreground)
          .on_click((_e, cx) => this.toggle(group, cx))
          .child(
            div()
              .flex_none()
              .w(GROUP_ARROW_PX)
              .flex()
              .justify_center()
              .opacity(0.7)
              .child(expanded ? "▾" : "▸"),
          )
          .when(Boolean(icon), (e) =>
            e.child(
              image(icon ?? "")
                .flex_none()
                .size(STATUS_ICON_PX),
            ),
          )
          .child(div().font_semibold().child(group.label))
          .child(this.groupCount(group, expanded, t)),
      )
      .when(joined, (e) =>
        e.child(
          card(t)
            .rounded_t(0)
            .children(
              rows.map((row, index) =>
                row
                  .when(index > 0, (e) => e.border_t(1).border_color(t.border))
                  .when(index === rows.length - 1, (e) => e.rounded_b(CARD_RADIUS_PX - 1)),
              ),
            ),
        ),
      );
  }

  // Each expanded group's share of the rows the list draws, in order, until the limit runs out.
  /** @param {Group[]} groups */
  shownCounts(groups) {
    let remaining = this.rowLimit;
    return groups.map((group) => {
      if (!this.isExpanded(group)) return 0;
      const shown = Math.min(group.issues.length, remaining);
      remaining -= shown;
      return shown;
    });
  }

  // The scope listed now: { scope, project, milestone }, a milestone's under its project.
  /** @returns {NonNullable<ReturnType<typeof findScope>>} */
  currentScope() {
    const { scopes } = this.tracker;
    return findScope(scopes, this.listedScope) ?? { scope: scopes[0], project: null, milestone: null };
  }

  // Every label on the listed issues, by name.
  listedLabels() {
    return [...new Set(this.issues.flatMap((issue) => issue.labels))].sort((a, b) => a.localeCompare(b));
  }

  // The label the list is narrowed to: the one picked, unless no listed issue carries it any more.
  /** @param {string[]} labels */
  shownLabel(labels) {
    const label = this.scopeKey ? selectedLabel(this.scopeKey) : null;
    return labels.includes(label) ? label : null;
  }

  // Each filter that narrows the list (filters.js) as its own row: its heading beside its dropdown.
  /**
   * @param {string[]} labels
   * @param {string | null} label
   * @param {Theme} t
   */
  filterSections(labels, label, t) {
    const { scopes } = this.tracker ?? {};
    const listed = scopes ? { scopes, ...this.currentScope() } : {};
    /** @type {Record<string, (options: any, selected: string, key: string) => void>} */
    const openMenu = { scope: openScopeMenu, label: openLabelMenu };
    return listFilters(listed, labels, label).map((filter) =>
      filterRow(
        filter.id,
        filter.heading,
        filter.shown,
        () => openMenu[filter.menu](filter.options, filter.selected, this.scopeKey),
        t,
      ),
    );
  }

  /** @param {Theme} t */
  header(t) {
    return headerBar(
      {
        icon: "issues",
        title: "Issues",
        secondary: this.tracker ? headerTitleText(this.tracker, this.repositoryName) : null,
        trailing: [
          this.failedEditAlert(t),
          this.tracker ? this.refreshButton(t) : null,
          this.canOpenSettings() ? settingsButton((cx) => this.openSettings(cx), t) : null,
          collapseButton((cx) => this.toggleCollapsed(cx), t),
        ],
      },
      t,
    );
  }

  // The panel's header over `content`, which stands in for the list.
  /**
   * @param {import("gpui-kit").Element} content
   * @param {Theme} t
   */
  listFrame(content, t) {
    return v_flex().size_full().min_h(0).child(this.header(t)).child(content);
  }

  // Start and Continue in a row report their failures in detailError, so the list shows them too.
  /** @param {Theme} t */
  list(t) {
    if (this.untrackable === NOT_A_REPOSITORY) {
      return this.listFrame(
        notARepositoryView(
          {
            initializing: this.initializing,
            error: this.initializeError,
            onInitialize: (/** @type {Context} */ cx) => this.initializeUntrackedFolder(cx),
          },
          t,
        ),
        t,
      );
    }
    if (this.untrackable) return this.listFrame(untrackableView(this.untrackable, t), t);
    if (this.setup) {
      return this.setup.render(t, {
        onRetry: (/** @type {Context} */ cx) => {
          forgetLookups();
          this.refresh(cx);
          cx.notify();
        },
        header: this.header(t),
        onCollapse: (/** @type {Context} */ cx) => this.toggleCollapsed(cx),
      });
    }
    if (this.settingsView)
      return this.settingsView.render(t, { onCollapse: (/** @type {Context} */ cx) => this.toggleCollapsed(cx) });
    const labels = this.listedLabels(),
      label = this.shownLabel(labels);
    const groups = this.groups(label),
      error = this.error ?? this.detailError,
      listsNoIssues = this.loaded && holdsNoIssues(groups);
    const shown = this.shownCounts(groups);
    const spacing = groupSpacing(groups.map((group) => this.isExpanded(group) && group.issues.length > 0));
    const idColumnPx = idColumnWidth(
      groups.flatMap((group, index) =>
        this.isExpanded(group) ? group.issues.slice(0, shown[index]).map((issue) => issue.id) : [],
      ),
    );
    this.revealGroup(groups);
    return v_flex()
      .size_full()
      .min_h(0)
      .child(this.header(t))
      .children(this.filterSections(labels, label, t))
      .when(Boolean(error), (e) =>
        e.child(
          div()
            .flex_none()
            .px(14)
            .py(6)
            .text_size(11)
            .text_color(t.ansi1)
            .whitespace_normal()
            .child(error ?? ""),
        ),
      )
      .child(
        v_flex()
          .id("issues-list")
          .track_scroll(this.listScroll)
          .on_size_change((_size, cx) => this.noticeListLaidOut(cx))
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .px(ROW_PADDING_X_PX)
          .pt(16)
          .pb(ROW_PADDING_X_PX)
          .gap(6)
          .children(groups.map((group, index) => this.group(group, shown[index], idColumnPx, spacing[index], t)))
          .when(!this.loaded && !error, (e) => e.child(div().p(8).text_color(t.dim).child("Loading…")))
          .when(listsNoIssues && !error, (e) => e.child(emptyListView(t))),
      );
  }

  /** @param {Theme} t */
  frame(t) {
    return v_flex()
      .id("issues")
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .bg(t.surface)
      .border_1()
      .border_color(t.border)
      .text_color(t.foreground)
      .text_size(PANEL_TEXT_PX)
      .on_size_change((size, cx) => this.noticeWidth(size.width, cx));
  }

  // The expand button, centered on the expanded panel's header, which is 30px tall, over a badge for each
  // group the list shows, with the count its header shows.
  /** @param {Theme} t */
  strip(t) {
    const label = this.shownLabel(this.listedLabels());
    return this.frame(t)
      .items_center()
      .pt((HEADER_HEIGHT_PX - ICON_BUTTON_PX) / 2)
      .gap(10)
      .child(
        iconButton(
          {
            id: "issues-expand",
            icon: "issues",
            tooltip: listedScopeName(this.tracker, this.listedScope),
            onClick: (cx) => this.toggleCollapsed(cx),
          },
          t,
        ),
      )
      .children(stripBadges(this.groups(label)).map((badge) => this.stripBadge(badge, t)));
  }

  /**
   * @param {ReturnType<typeof stripBadges>[number]} badge
   * @param {Theme} t
   */
  stripBadge({ id, label, text, unloaded }, t) {
    const icon = statusIcon(id);
    return v_flex()
      .id(`strip-${id}`)
      .flex_none()
      .w(24)
      .py(3)
      .items_center()
      .gap(2)
      .rounded(6)
      .tooltip(label)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.expandToGroup(id, cx, { unloaded }))
      .when(Boolean(icon), (e) => e.child(image(icon ?? "").size(STRIP_ICON_PX)))
      .child(
        unloaded
          ? svg("mods/issues/icons/rotate-cw.svg").size(STRIP_REFRESH_ICON_PX).text_color(t.muted)
          : div().text_size(10).text_color(t.muted).child(text),
      );
  }

  // Moving to another repository, an issue change and a newly selected scope each refresh the list.
  /** @param {Context} cx */
  keepListCurrent(cx) {
    if (contextKey() !== this.context) this.refresh(cx, { reuse: true });
    else if (issuesChangedAt() !== this.seenChangeAt) this.refresh(cx);
    else if (this.scopeKey && selectedScope(this.scopeKey) !== this.listedScope) {
      this.listedScope = selectedScope(this.scopeKey);
      this.rowLimit = ROW_LIMIT;
      this.refresh(cx);
    } else this.refreshOnReturn(cx);
  }

  /** @param {Context} cx */
  render(cx) {
    if (this.menu) return this.menu.render();
    if (this.worktreeDialog) return this.worktreeDialog.render();
    this.keepListCurrent(cx);
    this.noticeSpaceSwitch();
    if (this.collapse.collapsed) return this.strip(/** @type {Theme} */ (theme()));
    this.openSpaceIssue(cx);
    this.applyFieldEdits(cx);
    this.setup?.takePickedTeam(cx);
    this.settingsView?.takePicks(cx);
    const t = /** @type {Theme} */ (theme()),
      issue = this.findIssue(this.openId);
    publishOpenIssue(this.project && !this.project.on ? this.project.root : null, issue).catch(() => {});
    /** @type {Promise<unknown>[]} */
    this.avatarLoads = [];
    const content =
      issue && this.settingsView
        ? this.settingsView.render(t, { onCollapse: (/** @type {Context} */ cx) => this.toggleCollapsed(cx) })
        : issue
          ? (this.loadBody(issue, cx),
            issueDetail(
              {
                issue,
                writable: this.tracker?.writable,
                prioritized: this.prioritized(),
                editor: this.editing?.state ?? null,
                saving: this.saving,
                error: this.detailError,
                ...this.links,
                failedEditAlert: this.failedEditAlert(t),
                refreshButton: this.refreshButton(t),
                settingsButton: this.canOpenSettings() ? settingsButton((cx) => this.openSettings(cx), t) : null,
                assignee: issue.assignee ? this.assignee(issue, t, t.foreground).text_size(PROPERTY_TEXT_PX) : null,
                creator: issue.creator ? this.creator(issue, t) : null,
                blocking: blockedIssues(issue, this.issues),
                onBack: (cx) => this.back(cx),
                onCollapse: (cx) => this.toggleCollapsed(cx),
                onMenu: (field) => openMenu(field, issue, this.project, this.tracker?.statuses),
                labelsEditable: Boolean(this.tracker?.writable && (this.tracker.labels || issue.labels.length)),
                onLabelsMenu: (cx) => this.openLabelsMenu(issue, cx),
                onEdit: (cx) => this.edit(issue, cx),
                onToggleTask: (line, cx) => this.toggleTask(issue, line, cx),
                trackerName: this.tracker?.name,
                onLink: (url, cx) => this.openLink(issue, url, cx),
                linkFiles: (markdown) => linkCodeSpanFiles(markdown, this.project.root, this.filesInBody(issue, cx)),
                avatarPath: (url) => avatarImage(url, (loading) => this.avatarLoads.push(loading)),
                startable: canStartWork(issue, this.issues),
                opening: Boolean(this.openings.get(issue.id)),
                loading: this.openings.get(issue.id)?.merging === false,
                onStart: (cx) => this.startWork(issue, cx),
                finishable: canFinishWork(issue),
                ...this.spaceShowingWorktree(issue),
                onContinue: (cx) => this.continueWork(issue, cx),
                mergeable: this.mergeOffered(issue, cx),
                merging: Boolean(this.openings.get(issue.id)?.merging),
                onMerge: (cx) => this.mergeBranch(issue, cx),
                onSave: (cx) => this.save(cx),
                onCancel: (cx) => {
                  this.stopEditing();
                  cx.notify();
                },
              },
              t,
            ))
          : this.list(t);
    const avatarLoads = this.avatarLoads;
    if (avatarLoads.length)
      cx.spawn(async (cx) => {
        await Promise.all(avatarLoads);
        cx.notify();
      });
    const latestOpening = this.openings.latest;
    return this.frame(t)
      .child(v_flex().flex_1().min_h(0).child(content))
      .when(Boolean(latestOpening), (e) => e.child(this.openingFooter(t, latestOpening?.status ?? "")))
      .when(!latestOpening && Boolean(this.availableUpdate || this.updated), (e) => e.child(this.updateFooter(t)));
  }
}
