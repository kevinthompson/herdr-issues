import { test } from "node:test";
import assert from "node:assert/strict";
import { AutosaveQueue, SAVE_DEBOUNCE_MS } from "../mod/autosave.js";

// A stand-in for the app's cx whose timers fire only when the test says, and whose tasks run at once.
function fakeContext() {
  const timers = [], tasks = [];
  const cx = {
    timer: {
      after(ms, handler) {
        const timer = { ms, handler, canceled: false, cancel() { this.canceled = true; } };
        timers.push(timer);
        return timer;
      },
    },
    spawn(body) { const task = body(cx); tasks.push(task); return task; },
  };
  const fire = () => { for (const timer of timers.splice(0)) if (!timer.canceled) timer.handler(cx); };
  const settle = () => Promise.all(tasks.splice(0));
  return { cx, timers, fire, settle };
}

// A form whose value is `value`, saved to `stored` by writes that wait until released.
function fakeForm({ canSave = () => true } = {}) {
  const form = { value: null, saved: null, stored: [], events: [], releases: [] };
  form.queue = new AutosaveQueue({
    request: () => {
      if (!canSave(form.value) || form.value === form.saved) return null;
      const value = form.value;
      return {
        write: () => new Promise((resolve, reject) => form.releases.push({ resolve: () => { form.stored.push(value); resolve(); }, reject })),
        written: () => { form.saved = value; },
      };
    },
    onStart: () => form.events.push("start"),
    onSaved: () => form.events.push("saved"),
    onFailed: (e) => form.events.push(`failed: ${e.message}`),
    onSettled: () => form.events.push("settled"),
  });
  return form;
}

test("a burst of typing makes one write after the debounce", async () => {
  const { cx, timers, fire, settle } = fakeContext(), form = fakeForm();
  for (const value of ["1", "12", "120"]) { form.value = value; form.queue.schedule(cx); }
  assert.equal(timers.filter((timer) => !timer.canceled).length, 1);
  assert.equal(timers.at(-1).ms, SAVE_DEBOUNCE_MS);
  fire();
  form.releases.shift().resolve();
  await settle();
  assert.deepEqual(form.stored, ["120"]);
  assert.deepEqual(form.events, ["start", "saved", "settled"]);
});

test("now saves at once and cancels the waiting debounce", async () => {
  const { cx, timers, settle } = fakeContext(), form = fakeForm();
  form.value = "a"; form.queue.schedule(cx);
  form.queue.now(cx);
  assert.equal(timers[0].canceled, true);
  form.releases.shift().resolve();
  await settle();
  assert.deepEqual(form.stored, ["a"]);
});

test("flush writes a waiting save and does nothing without one", async () => {
  const { cx, settle } = fakeContext(), form = fakeForm();
  form.value = "a";
  form.queue.flush(cx);
  assert.equal(form.releases.length, 0);
  form.queue.schedule(cx);
  assert.equal(form.queue.waiting, true);
  form.queue.flush(cx);
  assert.equal(form.queue.waiting, false);
  form.releases.shift().resolve();
  await settle();
  assert.deepEqual(form.stored, ["a"]);
});

test("a value that can't be saved writes nothing, and saves once it's fixed", async () => {
  const { cx, fire, settle } = fakeContext(), form = fakeForm({ canSave: (value) => Number(value) >= 10 });
  form.value = "5"; form.queue.schedule(cx); fire();
  assert.equal(form.releases.length, 0);
  form.value = "50"; form.queue.schedule(cx); fire();
  form.releases.shift().resolve();
  await settle();
  assert.deepEqual(form.stored, ["50"]);
});

test("a change while a save is writing is written after it, ending on the last value", async () => {
  const { cx, settle } = fakeContext(), form = fakeForm();
  form.value = "a"; form.queue.now(cx);
  form.value = "b"; form.queue.now(cx);
  form.value = "c"; form.queue.now(cx);
  assert.equal(form.releases.length, 1);
  form.releases.shift().resolve();
  await settle();
  assert.equal(form.releases.length, 1);
  form.releases.shift().resolve();
  await settle();
  assert.deepEqual(form.stored, ["a", "c"]);
  assert.deepEqual(form.events, ["start", "saved", "start", "saved", "settled"]);
});

test("a failed save keeps the value unsaved, so the next change writes it", async () => {
  const { cx, settle } = fakeContext(), form = fakeForm();
  form.value = "a"; form.queue.now(cx);
  form.releases.shift().reject(new Error("disk full"));
  await settle();
  assert.equal(form.saved, null);
  assert.deepEqual(form.events, ["start", "failed: disk full", "settled"]);
  form.queue.now(cx);
  form.releases.shift().resolve();
  await settle();
  assert.deepEqual(form.stored, ["a"]);
});
