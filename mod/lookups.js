// Answers that stay put while the mod runs, such as a folder's repository or a parsed settings file, kept so
// each panel refresh doesn't run git or read the file again. forgetLookups clears them all, for when issues.json
// or the Linear key file changes or the setup view checks again.
const caches = [];

// A function (key, lookup) that runs lookup once per key and answers its promise from then on. A lookup that
// fails, or whose answer `keep` refuses, is forgotten so the next call asks again.
export function cachedLookup(keep = () => true) {
  const answers = new Map();
  caches.push(answers);
  return (key, lookup) => {
    if (!answers.has(key)) {
      const answer = lookup();
      answers.set(key, answer);
      answer.then((value) => { if (!keep(value) && answers.get(key) === answer) answers.delete(key); },
        () => { if (answers.get(key) === answer) answers.delete(key); });
    }
    return answers.get(key);
  };
}

export function forgetLookups() {
  for (const answers of caches) answers.clear();
}
