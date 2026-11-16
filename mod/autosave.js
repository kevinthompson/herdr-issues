// Saves a settings form (settings-form.js) as it changes: schedule() waits for typing to pause, restarting the wait
// on each call so a burst makes one write; now() saves at once; flush() runs a waiting save at once. Saves never
// overlap: a save asked for while one is writing runs after it, so the last change is what's written. Each save asks
// the form what to write when it starts, so a value that can't be saved yet writes nothing. It needs nothing from
// the app beyond the `cx` it's handed, so the tests run it with a stand-in.
export const SAVE_DEBOUNCE_MS = 500;

export class AutosaveQueue {
  // request(): { write, written } to save now, where write() is async and written() runs once it succeeds, or null
  // when there's nothing that can be saved. onStart(cx) runs as a write starts, onSaved(cx) after it succeeds,
  // onFailed(error, cx) when it throws, and onSettled(cx) once no write is running or queued.
  constructor({ request, onStart, onSaved, onFailed, onSettled }) {
    this.request = request;
    this.onStart = onStart;
    this.onSaved = onSaved;
    this.onFailed = onFailed;
    this.onSettled = onSettled;
    this.timer = null;
    this.saving = false;
    this.again = false;
  }

  get waiting() {
    return Boolean(this.timer);
  }

  schedule(cx, ms = SAVE_DEBOUNCE_MS) {
    this.timer?.cancel();
    this.timer = cx.timer.after(ms, (cx) => {
      this.timer = null;
      this.now(cx);
    });
  }

  flush(cx) {
    if (this.timer) this.now(cx);
  }

  now(cx) {
    this.timer?.cancel();
    this.timer = null;
    if (this.saving) {
      this.again = true;
      return;
    }
    const pending = this.request();
    if (!pending) return;
    this.saving = true;
    this.onStart(cx);
    cx.spawn(async (cx) => {
      try {
        await pending.write();
        pending.written();
        this.onSaved(cx);
      } catch (e) {
        this.onFailed(e, cx);
      } finally {
        this.saving = false;
        if (this.again) {
          this.again = false;
          this.now(cx);
        }
        if (!this.saving) this.onSettled(cx);
      }
    });
  }
}
