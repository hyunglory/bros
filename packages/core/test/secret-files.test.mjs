import assert from "node:assert/strict";
import { chmod, link, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileSecretProvider,
  SecretFileError,
  readRuntimeSecret,
  readSecretFile,
} from "../dist/index.js";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "bros-secret-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "key");
  await writeFile(path, "synthetic-old-value", { mode: 0o600 });
  return { root, path };
}

test("file provider reads a rotated generation without caching or mutating environment", async (t) => {
  const { root, path } = await fixture(t);
  const env = Object.freeze({ BROS_SECRET_PROVIDER_IMAGE_API_KEY_FILE: path });
  const provider = new FileSecretProvider(env);
  assert.equal(await provider.get("provider.image.apiKey"), "synthetic-old-value");
  await writeFile(join(root, "next"), "synthetic-new-value\n", { mode: 0o600 });
  await rename(join(root, "next"), path);
  assert.equal(await provider.get("provider.image.apiKey"), "synthetic-new-value");
  assert.equal(env.BROS_SECRET_PROVIDER_IMAGE_API_KEY, undefined);
  assert.equal(await provider.get("browser.profile.demo.cookie"), undefined);
});

test("production rejects plaintext secrets and ambiguous file/env configuration", async (t) => {
  const { path } = await fixture(t);
  for (const key of [
    "DATABASE_URL",
    "API_PROXY_AUTH_TOKEN",
    "BROS_SECRET_STORAGE_R2_ACCESS_KEY_ID",
    "BROS_SECRET_PROVIDER_IMAGE_API_KEY",
    "BROS_SECRET_BROWSER_PROFILE_DEMO_COOKIE",
  ]) {
    assert.throws(
      () => readRuntimeSecret({ APP_ENV: "production", [key]: "DO_NOT_REFLECT" }, key),
      (error) => error instanceof SecretFileError && !error.message.includes("DO_NOT_REFLECT"),
    );
  }
  assert.throws(
    () => readRuntimeSecret({ DATABASE_URL_FILE: path, DATABASE_URL: "conflict" }, "DATABASE_URL"),
    SecretFileError,
  );
  assert.throws(() => readSecretFile("relative"), SecretFileError);
});

test("rejects empty, oversized, NUL and non-file secrets with stable errors", async (t) => {
  const { path, root } = await fixture(t);
  for (const value of ["", "x".repeat(65_537), "unsafe\0value"]) {
    await writeFile(path, value);
    assert.throws(() => readSecretFile(path), SecretFileError);
  }
  assert.throws(() => readSecretFile(root), SecretFileError);
});

test(
  "Linux owner-only permission, parent, symlink and hardlink negative checks",
  { skip: process.platform !== "linux" },
  async (t) => {
    const { path, root } = await fixture(t);
    assert.equal(readSecretFile(path, true), "synthetic-old-value");
    for (const mode of [0o644, 0o660, 0o666]) {
      await chmod(path, mode);
      assert.throws(() => readSecretFile(path, true), SecretFileError);
    }
    await chmod(path, 0o600);
    await symlink(path, join(root, "symlink"));
    assert.throws(() => readSecretFile(join(root, "symlink"), true), SecretFileError);
    await mkdir(join(root, "parent"), { mode: 0o700 });
    await writeFile(join(root, "parent", "secret"), "fixture", { mode: 0o600 });
    await symlink(join(root, "parent"), join(root, "linked-parent"));
    assert.throws(
      () => readSecretFile(join(root, "linked-parent", "secret"), true),
      SecretFileError,
    );
    await chmod(join(root, "parent"), 0o777);
    assert.throws(() => readSecretFile(join(root, "parent", "secret"), true), SecretFileError);
    await link(path, join(root, "hardlink"));
    assert.throws(() => readSecretFile(path, true), SecretFileError);
  },
);
