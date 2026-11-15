// Which status sections of the list (GROUPS in issue.js) each repository has open, by its main checkout:
// { "<path>": { "<group id>": true | false } }. Only a section the person opened or closed is stored, so the
// rest follow their `collapsed` default. Shared, so every copy of the panel agrees and the state outlives a
// restart of Herdr.
import { shared, setShared } from "herdr";

const OPEN_SECTIONS = "issues.openSections";

const openSections = () => /** @type {Record<string, Record<string, boolean>>} */ (shared(OPEN_SECTIONS) ?? {});

export function isSectionOpen(repository, group) {
  return openSections()[repository]?.[group.id] ?? !group.collapsed;
}

export function setSectionOpen(repository, groupId, open) {
  if (!repository) return;
  const sections = openSections();
  if (sections[repository]?.[groupId] === open) return;
  setShared(OPEN_SECTIONS, { ...sections, [repository]: { ...sections[repository], [groupId]: open } });
}
