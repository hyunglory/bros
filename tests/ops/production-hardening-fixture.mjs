import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { chmod, chown, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { createSessionManager } from "../../packages/browser/dist/index.js";
import {
  createSecretProvider,
  loadConfigFromProcess,
  readSecretFile,
} from "../../packages/core/dist/index.js";

const mode = process.argv[2];
let input = "";
for await (const chunk of process.stdin) input += chunk.toString();
const request = input ? JSON.parse(input) : {};
if (mode === "prepare") {
  for (const version of [1, 2]) {
    execFileSync(
      process.execPath,
      ["scripts/provision-production-secrets.mjs", `/fixture/g${version}`],
      { input: JSON.stringify(request[`g${version}`]), stdio: ["pipe", "pipe", "pipe"] },
    );
    for (const [scope, names] of Object.entries({
      api: ["database_url", "proxy_token", "r2_access_key", "r2_secret_key"],
      worker: ["database_url", "r2_access_key", "r2_secret_key"],
      edge: ["caddy_auth", "caddy_proxy"],
      postgres: ["postgres_password"],
    })) {
      const dir = `/fixture/${scope}${version}`;
      await mkdir(dir, { mode: 0o700 });
      await chown(dir, scope === "postgres" ? 0 : 1000, scope === "postgres" ? 0 : 1000);
      for (const name of names) {
        await copyFile(`/fixture/g${version}/${name}`, `${dir}/${name}`);
        await chown(
          `${dir}/${name}`,
          scope === "postgres" ? 0 : 1000,
          scope === "postgres" ? 0 : 1000,
        );
        await chmod(`${dir}/${name}`, 0o400);
      }
    }
  }
  await mkdir("/fixture/profiles", { mode: 0o700 });
  await chown("/fixture/profiles", 1000, 1000);
  await mkdir("/fixture/bad", { mode: 0o700 });
  await chown("/fixture/bad", 1000, 1000);
  await copyFile("/fixture/g1/database_url", "/fixture/bad/database_url");
  await chmod("/fixture/bad/database_url", 0o644);
  // An existing generation must not be overwritten by the provisioner.
  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/provision-production-secrets.mjs", "/fixture/g1"], {
      input: JSON.stringify(request.g2),
      stdio: "pipe",
    }),
  );
} else if (mode === "rotate") {
  const client = new pg.Client({
    connectionString: await readFile("/fixture/g1/database_url", "utf8"),
  });
  await client.connect();
  try {
    await client.query(
      `ALTER ROLE bros_test PASSWORD ${pg.escapeLiteral(await readFile("/fixture/g2/postgres_password", "utf8"))}`,
    );
  } finally {
    await client.end();
  }
} else if (mode === "probe") {
  const config = loadConfigFromProcess();
  assert.equal(process.env.DATABASE_URL, undefined);
  assert.equal(process.env.API_PROXY_AUTH_TOKEN, undefined);
  assert.equal(await createSecretProvider().get("storage.r2.secretAccessKey"), request.r2Secret);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch("http://127.0.0.1:3000/ready")).status === 200;
    } catch {
      /* startup */
    }
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, "API did not become ready");
  const path = "/api/v1/import-batches";
  const headers = {
    "x-bros-actor": "operator",
    "x-bros-proxy-token": config.api.auth.proxyAuthToken,
  };
  assert.equal((await fetch(`http://127.0.0.1:3000${path}`, { headers })).status, 200);
  assert.equal(
    (
      await fetch(`http://127.0.0.1:3000${path}`, {
        headers: { ...headers, "x-bros-proxy-token": request.oldToken },
      })
    ).status,
    401,
  );
  if (request.edge) {
    const basic = `Basic ${Buffer.from(`operator:${request.password}`).toString("base64")}`;
    assert.equal((await fetch(`http://127.0.0.1:8080${path}`)).status, 401);
    assert.equal(
      (
        await fetch(`http://127.0.0.1:8080${path}`, {
          headers: {
            authorization: basic,
            "x-bros-actor": "forged",
            "x-bros-proxy-token": "forged",
          },
        })
      ).status,
      200,
    );
  }
} else if (mode === "profile") {
  process.umask(0o077);
  const manager = createSessionManager({ profileRoot: "/srv/bros/profiles", production: true });
  try {
    const first = await manager.open({ profileKey: "demo", verifySession: async () => true });
    assert.equal(first.state, "VALID");
    await first.context.addCookies([
      {
        name: "session",
        value: request.cookie,
        domain: "fixture.invalid",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 3600,
        httpOnly: true,
        secure: true,
      },
    ]);
    await first.context.close();
    const second = await manager.open({
      profileKey: "demo",
      verifySession: async (context) =>
        (await context.cookies()).some((cookie) => cookie.value === request.cookie),
    });
    assert.equal(second.state, "VALID");
    await second.context.close();
    assert.equal(
      (await manager.open({ profileKey: "demo", verifySession: async () => false })).state,
      "EXPIRED",
    );
  } finally {
    await manager.close();
  }
} else if (mode === "regression") {
  const databaseUrl = readSecretFile("/run/secrets/database_url", true);
  const output = execFileSync(
    process.execPath,
    [
      "--test",
      "--test-timeout=120000",
      "tests/integration/browser-artifact.integration.test.mjs",
      "tests/integration/browser-durable.integration.test.mjs",
      "tests/integration/artifact-retention.integration.test.mjs",
      "tests/integration/production-deployment.integration.test.mjs",
      "tests/integration/production-hardening.integration.test.mjs",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, TEST_DATABASE_URL: databaseUrl },
      stdio: "pipe",
      timeout: 120000,
    },
  );
  assert.match(output, /(?:#|ℹ) fail 0/);
  console.log(output.match(/(?:#|ℹ) tests \d+/)?.[0] ?? "Targeted regressions completed");
} else if (mode === "backup-excludes") {
  const root = await mkdtemp("/tmp/bros-backup-policy-");
  try {
    for (const dir of ["source", "source/.secrets", "source/profiles", "source/auth-state"])
      await mkdir(`${root}/${dir}`, { mode: 0o700 });
    for (const name of [
      ".env",
      ".secrets/value",
      "profiles/Cookies",
      "auth-state/state",
      "private.key",
      "trace.zip",
      "autosave.json",
      "storage-state.json",
      "safe.txt",
    ])
      await writeFile(`${root}/source/${name}`, "synthetic-only");
    execFileSync(
      "tar",
      [
        "--exclude-from=/srv/bros/ops/backup-excludes.txt",
        "-cf",
        `${root}/archive.tar`,
        "-C",
        `${root}/source`,
        ".",
      ],
      { stdio: "pipe" },
    );
    const listing = execFileSync("tar", ["-tf", `${root}/archive.tar`], { encoding: "utf8" });
    assert.deepEqual(listing.trim().split("\n").sort(), ["./", "./safe.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
} else if (mode === "denied") {
  await assert.rejects(readFile(request.path), { code: "EACCES" });
} else if (mode === "bad-secret") {
  assert.throws(() => readSecretFile("/run/secrets/database_url", true));
} else {
  throw new Error("Unknown hardening fixture operation");
}
console.log(`P602_${mode.toUpperCase()}_PASS`);
