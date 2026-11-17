// Stands in for the app's `gpui-kit` and `gpui-base` modules in tests: every element records the calls made on it
// and the children added to it, so a test can look for what a view drew without the app's renderer.
const element = (tag) => {
  const node = { tag, calls: [], kids: [] };
  const proxy = new Proxy(node, {
    get(target, name) {
      if (name in target) return target[name];
      if (typeof name === "symbol") return undefined;
      return (...args) => {
        if (name === "when") return args[0] ? (args[1](proxy) ?? proxy) : proxy;
        if (name === "child") target.kids.push(args[0]);
        else if (name === "children") target.kids.push(...args[0]);
        else target.calls.push([name, ...args]);
        return proxy;
      };
    },
  });
  return proxy;
};

const classStub = class {
  static new() {
    return element("stub");
  }
};
export const div = () => element("div");
export const svg = (path) => element("svg").path(path);
export const image = () => element("image");
export const v_flex = () => element("v_flex");
export const h_flex = () => element("h_flex");
export const View = classStub;
export const InputState = classStub;
export const TextareaState = classStub;
export const EditorState = classStub;
export const ScrollHandle = classStub;
export const TextView = class extends classStub {
  static markdown(id, text) {
    return element("markdown").id(id).child(text);
  }
};
export const Editor = classStub;
export const Input = classStub;
export const Textarea = classStub;
export const Scrollbar = classStub;
export const Select = classStub;
export const Popup = classStub;

/** Every element in the tree, in order. */
export function* walk(node) {
  if (!node || typeof node !== "object") return;
  yield node;
  for (const child of node.kids ?? []) yield* walk(child);
}

/** The first element whose `id` call was given `id`. */
export const byId = (tree, id) => [...walk(tree)].find((node) => node.calls.some(([n, v]) => n === "id" && v === id));

/** The text children of the tree, in order. */
export const texts = (tree) => [...walk(tree)].flatMap((node) => node.kids.filter((c) => typeof c === "string"));

/** The first value given to the named call on the element, or undefined. */
export const callArg = (node, name) => node.calls.find(([n]) => n === name)?.[1];
