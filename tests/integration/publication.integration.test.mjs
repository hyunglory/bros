import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkPublication, isPrivatePublicationPath } from "../../scripts/check-publication.mjs";

test("publication paths allow synthetic fixtures and block private artifacts", () => {
  for (const path of [
    "examples/source.xlsx",
    "data/capture.json",
    "storage/raw.json",
    ".env",
    ".env.production",
    "other/.env.example",
    "other/PRIVATE.KEY",
    "other\\review.XLSX",
  ])
    assert.equal(isPrivatePublicationPath(path), true, path);
  for (const path of [
    ".env.example",
    "packages/resolver/test/fixtures/golden-v1.json",
    "docs/evaluations/p314-golden-v1/report.json",
    "scripts/migrate.mjs",
  ])
    assert.equal(isPrivatePublicationPath(path), false, path);
});

test("publication guard catches force-added ignored files and pending untracked files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bros-publication-"));
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init");
  await writeFile(join(root, ".gitignore"), ".env\n");
  await writeFile(join(root, ".env"), "FIXTURE_ONLY=empty\n");
  git("add", ".gitignore");
  assert.deepEqual(checkPublication(root, true).blocked, []);
  git("add", "-f", ".env");
  assert.deepEqual(checkPublication(root).blocked, [".env"]);
  await writeFile(join(root, "review.xlsx"), "synthetic placeholder");
  assert.deepEqual(checkPublication(root, true).blocked, [".env", "review.xlsx"]);
});
