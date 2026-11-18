// Saves a Linear API key in the key file under the temporary home, as the panel's setup view would.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { linearKeyPath } from "../../mod/trackers/linear.js";

export function saveLinearKeyFile(apiKey) {
  mkdirSync(dirname(linearKeyPath()), { recursive: true });
  writeFileSync(linearKeyPath(), JSON.stringify({ apiKey }));
}
