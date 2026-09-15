import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout } from "node:timers";

// Local Docker only. Synthetic, per-run credentials, no Cloudflare or production resources.
const id = `bros-p602-${randomUUID().slice(0, 8)}`;
const volume = `${id}-secrets`;
const network = `${id}-net`;
const containers = new Set();
const docker = (args, input, options = {}) => {
  if (args[0] === "run") args = ["run", "--label", `bros.p602.run=${id}`, ...args.slice(1)];
  const result = spawnSync("docker", args, {
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0 || result.error)
    throw new Error(`Docker operation failed: ${args[0]}`, { cause: result });
  return args[0] === "logs" ? result.stdout + result.stderr : result.stdout;
};
const image = "bros-p602-worker";
const mounts = [
  "scripts",
  "tests",
  "ops",
  ".dockerignore",
  ".gitignore",
  "compose.production.yml",
  "compose.public-staging.yml",
  "packages/core/dist",
  "packages/core/test",
  "packages/browser/dist",
  "packages/browser/test",
].flatMap((path) => ["--mount", `type=bind,src=${resolve(path)},dst=/srv/bros/${path},readonly`]);
const secretMount = (scope) => [
  "--mount",
  `type=volume,src=${volume},dst=/run/secrets,volume-subpath=${scope},readonly`,
];
const hardened = [
  "--read-only",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "--tmpfs",
  "/tmp:rw,noexec,nosuid,size=512m,mode=1777",
];
const env = (values) => Object.entries(values).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
const runtimeEnv = {
  APP_ENV: "production",
  DATABASE_URL_FILE: "/run/secrets/database_url",
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  API_PUBLIC_ORIGIN: "https://fixture.invalid",
  WORKER_CONCURRENCY: "1",
  STORAGE_DRIVER: "r2",
  STORAGE_R2_ENDPOINT: "https://fixture.r2.cloudflarestorage.com",
  STORAGE_R2_BUCKET: "fixture-private",
  BROS_SECRET_STORAGE_R2_ACCESS_KEY_ID_FILE: "/run/secrets/r2_access_key",
  BROS_SECRET_STORAGE_R2_SECRET_ACCESS_KEY_FILE: "/run/secrets/r2_secret_key",
};
const helper = "tests/ops/production-hardening-fixture.mjs";
const oneShot = (args, mode, input) =>
  docker(["run", "--rm", "-i", ...args, ...mounts, image, "node", helper, mode], input);
const launch = (name, args) => {
  containers.add(name);
  return docker(["run", "-d", "--name", name, ...args]);
};
const remove = (name) => {
  docker(["rm", "-f", "-v", name]);
  containers.delete(name);
};
let volumeCreated = false;
let networkCreated = false;
let stage = "initialize";
try {
  docker(["volume", "create", volume]);
  volumeCreated = true;
  docker(["network", "create", "--internal", network]);
  networkCreated = true;
  const password = randomUUID();
  const hash = docker([
    "run",
    "--rm",
    "--entrypoint",
    "caddy",
    "bros-p602-edge",
    "hash-password",
    "--plaintext",
    password,
  ]).trim();
  const bundles = Object.fromEntries(
    [1, 2].map((version) => [
      `g${version}`,
      {
        database: { user: "bros_test", name: "bros_test", password: randomUUID() },
        proxyToken: randomUUID().replaceAll("-", ""),
        admin: { username: "operator", passwordHash: hash },
        r2: { accessKeyId: randomUUID(), secretAccessKey: randomUUID() },
        backupEncryptionKey: randomUUID().replaceAll("-", "").repeat(2),
      },
    ]),
  );
  const cookie = randomUUID();
  const fixtureMount = ["--mount", `type=volume,src=${volume},dst=/fixture`];
  stage = "provision";
  oneShot(["--user", "0", ...fixtureMount], "prepare", bundles);
  console.log("P602_PROVISION_PASS");
  stage = "postgres";
  const postgres = `${id}-postgres`;
  launch(postgres, [
    "--network",
    network,
    "--network-alias",
    "postgres",
    ...secretMount("postgres1"),
    ...env({
      POSTGRES_USER: "bros_test",
      POSTGRES_DB: "bros_test",
      POSTGRES_PASSWORD_FILE: "/run/secrets/postgres_password",
    }),
    "postgres:18.6-bookworm@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af",
  ]);
  // Migration connection retries are bounded and only target this newly created DB.
  for (let i = 0; ; i++) {
    try {
      docker(["exec", postgres, "pg_isready", "-U", "bros_test", "-d", "bros_test"]);
      break;
    } catch {
      if (i >= 30) throw new Error("Postgres readiness failed");
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  stage = "migrate";
  docker([
    "run",
    "--rm",
    ...hardened,
    ...mounts,
    "--network",
    network,
    ...secretMount("worker1"),
    ...env({ APP_ENV: "production", DATABASE_URL_FILE: "/run/secrets/database_url" }),
    image,
    "node",
    "scripts/migrate.mjs",
  ]);
  console.log("P602_FILE_MIGRATION_PASS");
  for (const version of [1, 2]) {
    stage = `generation-${version}`;
    const api = `${id}-api${version}`;
    const worker = `${id}-worker${version}`;
    const edge = `${id}-edge${version}`;
    launch(api, [
      ...hardened,
      ...mounts,
      "--network",
      network,
      ...secretMount(`api${version}`),
      ...env({ ...runtimeEnv, API_PROXY_AUTH_TOKEN_FILE: "/run/secrets/proxy_token" }),
      image,
      "node",
      "apps/api/dist/main.js",
    ]);
    launch(worker, [
      ...hardened,
      ...mounts,
      "--network",
      network,
      ...secretMount(`worker${version}`),
      ...env(runtimeEnv),
      image,
      "node",
      "apps/worker/dist/main.js",
    ]);
    const probe = {
      password,
      r2Secret: bundles[`g${version}`].r2.secretAccessKey,
      oldToken: version === 1 ? "invalid-old-token" : bundles.g1.proxyToken,
    };
    docker(["exec", "-i", api, "node", helper, "probe"], probe);
    launch(edge, [
      "--read-only",
      "--security-opt=no-new-privileges",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=16m,mode=1777",
      "--network",
      `container:${api}`,
      ...secretMount(`edge${version}`),
      "--mount",
      `type=bind,src=${resolve("ops/Caddyfile.public-staging")},dst=/etc/caddy/Caddyfile.staging,readonly`,
      ...env({ BROS_API_PORT: "3000", BROS_IDENTITY_PORT: "3001" }),
      "bros-p602-edge",
      "caddy",
      "run",
      "--config",
      "/etc/caddy/Caddyfile.staging",
      "--adapter",
      "caddyfile",
    ]);
    await new Promise((done) => setTimeout(done, 1500));
    docker(["exec", "-i", api, "node", helper, "probe"], { ...probe, edge: true });
    assert.match(docker(["logs", worker]), /WORKER_READY/);
    const sensitive = [
      password,
      cookie,
      ...Object.values(bundles).flatMap((bundle) => [
        bundle.database.password,
        bundle.proxyToken,
        bundle.r2.accessKeyId,
        bundle.r2.secretAccessKey,
        bundle.admin.passwordHash,
        bundle.backupEncryptionKey,
      ]),
    ];
    for (const name of [api, worker, edge, postgres]) {
      const metadata = docker(["inspect", name]);
      const logs = docker(["logs", name]);
      for (const value of sensitive) {
        assert.ok(!metadata.includes(value), "Secret in container metadata");
        assert.ok(!logs.includes(value), "Secret in logs");
      }
    }
    assert.equal(
      docker([
        "exec",
        edge,
        "sh",
        "-c",
        "test ! -f /config/caddy/autosave.json && echo PRIVATE_CONFIG",
      ]).trim(),
      "PRIVATE_CONFIG",
    );
    console.log(`P602_GENERATION_${version}_API_WORKER_CADDY_METADATA_PASS`);
    remove(edge);
    remove(worker);
    remove(api);
    if (version === 1) oneShot(["--user", "0", "--network", network, ...fixtureMount], "rotate");
  }
  stage = "secret-other-uid-denied";
  oneShot(["--user", "1001:1001", ...secretMount("api2")], "denied", {
    path: "/run/secrets/database_url",
  });
  stage = "secret-weak-mode-denied";
  oneShot([...secretMount("bad")], "bad-secret");
  stage = "persistent-profile";
  oneShot(
    [
      ...hardened,
      "--shm-size=512m",
      "--mount",
      `type=volume,src=${volume},dst=/srv/bros/profiles,volume-subpath=profiles`,
    ],
    "profile",
    { cookie },
  );
  stage = "profile-other-uid-denied";
  oneShot(
    [
      "--user",
      "1001:1001",
      "--mount",
      `type=volume,src=${volume},dst=/srv/bros/profiles,volume-subpath=profiles,readonly`,
    ],
    "denied",
    { path: "/srv/bros/profiles/demo/Default/Cookies" },
  );
  stage = "linux-unit";
  const output = docker([
    "run",
    "--rm",
    ...hardened,
    ...mounts,
    image,
    "node",
    "--test",
    "packages/core/test/secret-files.test.mjs",
    "packages/core/test/security.test.mjs",
    "packages/browser/test/session-manager.test.mjs",
    "packages/browser/test/browser-manager.test.mjs",
    "packages/browser/test/artifact-service.test.mjs",
  ]);
  assert.match(output, /(?:#|ℹ) fail 0/);
  assert.match(output, /(?:#|ℹ) skipped 0/);
  console.log("P602_LINUX_PERMISSIONS_PROFILE_AND_UNIT_PASS");
  stage = "backup-exclusion";
  oneShot([...hardened], "backup-excludes");
  console.log("P602_BACKUP_EXCLUSION_PASS");
  stage = "browser-retention-regression";
  console.log(
    oneShot(
      [...hardened, "--shm-size=512m", "--network", network, ...secretMount("worker2")],
      "regression",
    ).trim(),
  );
  for (const name of [image, "bros-p602-edge"]) {
    const history = docker(["history", "--no-trunc", name]);
    for (const bundle of Object.values(bundles))
      assert.ok(
        !history.includes(bundle.database.password) &&
          !history.includes(bundle.proxyToken) &&
          !history.includes(bundle.r2.secretAccessKey) &&
          !history.includes(bundle.backupEncryptionKey),
      );
  }
  console.log("P602_HARDENING_PASS");
} catch (error) {
  console.error(`P602_HARDENING_FAILED stage=${stage}; credential-bearing output withheld`);
  const safeCode = String(error.cause?.stderr ?? "").match(
    /PROFILE_STORAGE_UNSAFE|SESSION_LAUNCH_FAILED|AssertionError|EACCES|EPERM|ECONNREFUSED|MODULE_NOT_FOUND/,
  );
  if (safeCode) console.error(`P602_FAILURE_CODE ${safeCode[0]}`);
  process.exitCode = 1;
} finally {
  // Also collect a timed-out one-shot whose Docker client exited before its container.
  try {
    for (const name of docker([
      "ps",
      "-a",
      "--filter",
      `label=bros.p602.run=${id}`,
      "--format",
      "{{.Names}}",
    ])
      .trim()
      .split("\n")
      .filter(Boolean))
      containers.add(name);
  } catch {
    console.error("P602_FIXTURE_DISCOVERY_FAILED");
    process.exitCode = 1;
  }
  for (const name of [...containers].reverse()) {
    try {
      remove(name);
    } catch {
      console.error("P602_CONTAINER_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  }
  if (networkCreated) {
    try {
      docker(["network", "rm", network]);
    } catch {
      console.error("P602_NETWORK_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  }
  if (volumeCreated) {
    try {
      docker(["volume", "rm", volume]);
    } catch {
      console.error("P602_VOLUME_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  }
  console.log("P602_CLEANUP_FINISHED");
}
