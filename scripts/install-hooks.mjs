import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";

const existing = spawnSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" });
const configured = existing.stdout.trim();
if (configured && configured !== ".githooks") {
  throw new Error("Existing hooks configuration preserved; integrate the QA gate manually.");
}
for (const hook of ["pre-commit", "pre-push"]) chmodSync(`.githooks/${hook}`, 0o755);
execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
console.log("Repository-local QA hooks installed.");
