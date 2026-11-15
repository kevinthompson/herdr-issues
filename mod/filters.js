// The filters that narrow the panel's list, each shown as its own section under the header: a project's
// milestones, when the listed project has any, and the labels the listed issues carry, when they carry any.
// Each is { id, heading, shown, menu, options, selected }: menu "scope" opens openScopeMenu with options as
// scopes, and menu "label" opens openLabelMenu with options as label names (menu.js).

export function listFilters({ project, milestone } = {}, labels, label) {
  const filters = [];
  if (project?.milestones.length) {
    const allMilestones = { id: project.id, label: "All milestones" };
    filters.push({
      id: "issues-milestone", heading: "Milestone", shown: milestone?.label ?? allMilestones.label,
      menu: "scope", options: [allMilestones, ...project.milestones], selected: milestone?.id ?? project.id,
    });
  }
  if (labels.length) {
    filters.push({ id: "issues-label", heading: "Label", shown: label ?? "All labels", menu: "label", options: labels, selected: label });
  }
  return filters;
}
