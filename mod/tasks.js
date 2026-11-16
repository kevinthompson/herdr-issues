// Markdown task-list items ("- [ ] text") in an issue body, so the detail view can draw them as
// checkboxes and toggle them in place. Lines indented deeper than an item's marker continue its text.
const TASK = /^(\s*)[-*+] \[([ xX])\] (.*)$/;
const FENCE = /^\s*(```|~~~)/;

const indentOf = (line) => /^\s*/.exec(line)[0].length;

// Splits a body into Markdown runs ({ markdown }) and task items ({ line, indent, checked, text }),
// where `line` is the item's index in the body's lines. Items inside fenced code stay Markdown.
export function bodySegments(body) {
  const lines = body.split("\n"),
    segments = [];
  let markdown = [],
    inFence = false;
  const flushMarkdown = () => {
    if (markdown.join("").trim()) segments.push({ markdown: markdown.join("\n") });
    markdown = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (FENCE.test(line)) inFence = !inFence;
    const task = !inFence && TASK.exec(line);
    if (!task) {
      markdown.push(line);
      continue;
    }
    flushMarkdown();
    const taskLine = index,
      indent = task[1].length,
      text = [task[3].trim()];
    const continues = (next) => next !== undefined && next.trim() && indentOf(next) > indent && !TASK.test(next);
    while (continues(lines[index + 1])) text.push(lines[++index].trim());
    segments.push({ line: taskLine, indent, checked: task[2] !== " ", text: text.join(" ") });
  }
  flushMarkdown();
  return segments;
}

// The body with the task item on `line` checked if it was unchecked, and unchecked if it was checked.
export function toggleTask(body, line) {
  const lines = body.split("\n"),
    task = TASK.exec(lines[line] ?? "");
  if (!task) throw new Error("That checkbox is no longer in the issue");
  lines[line] = lines[line].replace(/\[([ xX])\]/, task[2] === " " ? "[x]" : "[ ]");
  return lines.join("\n");
}
