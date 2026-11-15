// The Keychain that test/support/bin/security keeps under the temporary home, read and written as the
// mod's `security` commands would.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const fakeSecurityFolder = new URL("./bin", import.meta.url).pathname;

// Each takes the home folder the stand-in runs with, the test process's own unless a test gives another.
const keychainFolder = (home) => join(home, ".test-keychain");
const itemPath = (service, account, home) => join(keychainFolder(home), `${service}-${account}`);

export const keychainPassword = (service, account, home = process.env.HOME) =>
  existsSync(itemPath(service, account, home)) ? readFileSync(itemPath(service, account, home), "utf8") : null;

export function saveKeychainPassword(service, account, password, home = process.env.HOME) {
  mkdirSync(keychainFolder(home), { recursive: true });
  writeFileSync(itemPath(service, account, home), password);
}

export const clearKeychain = (home = process.env.HOME) => rmSync(keychainFolder(home), { recursive: true, force: true });
