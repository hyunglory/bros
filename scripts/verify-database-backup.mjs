import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

// Local Docker only: synthetic credentials and disposable data; no production resources.
const runId = `bros-p606-${randomUUID().slice(0, 8)}`;
const image = `${runId}-backup`;
const postgres = `${runId}-postgres`;
const alertReceiver = `${runId}-alert-receiver`;
const network = `${runId}-network`;
const fixture = `${runId}-fixture`;
const label = `bros.p606.run=${runId}`;
let networkCreated = false;
let volumeCreated = false;
let postgresCreated = false;
let alertReceiverCreated = false;
let stage = "build";

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input: options.input === undefined ? undefined : JSON.stringify(options.input),
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: options.timeout ?? 180_000,
  });
  if (!options.allowFailure && (result.status !== 0 || result.error))
    throw new Error(`Docker operation failed at ${stage}`, { cause: result });
  return result;
}

function fixtureRun(mode, input, extra = []) {
  return docker(
    [
      "run",
      "--rm",
      "-i",
      "--label",
      label,
      "--user",
      "0",
      "--mount",
      `type=volume,src=${fixture},dst=/fixture`,
      ...extra,
      image,
      "node",
      "tests/ops/database-backup-fixture.mjs",
      mode,
    ],
    { input },
  );
}

const secretMount = [
  "--mount",
  `type=volume,src=${fixture},dst=/run/secrets,volume-subpath=backup,readonly`,
];
const objectMount = ["--mount", `type=volume,src=${fixture},dst=/objects,volume-subpath=objects`];
const statusMount = ["--mount", `type=volume,src=${fixture},dst=/status,volume-subpath=status`];
const alertStateMount = [
  "--mount",
  `type=volume,src=${fixture},dst=/alert-state,volume-subpath=alert-state`,
];
const hardened = [
  "--read-only",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "--tmpfs",
  "/tmp:rw,noexec,nosuid,size=1g,mode=1777",
];
const environment = (values) =>
  Object.entries(values).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
const runtime = {
  APP_ENV: "test",
  BACKUP_ENCRYPTION_KEY_FILE: "/run/secrets/backup_encryption_key",
  BACKUP_LOCAL_STORAGE_ROOT: "/objects",
  BACKUP_STATUS_PATH: "/status/status.json",
  DATABASE_URL_FILE: "/run/secrets/database_url",
};
const oneShot = (command, env = runtime, options = {}) =>
  docker(
    [
      "run",
      "--rm",
      "-i",
      "--label",
      label,
      ...hardened,
      "--network",
      network,
      ...secretMount,
      ...objectMount,
      ...statusMount,
      ...alertStateMount,
      ...environment(env),
      image,
      "node",
      command,
    ],
    options,
  );

const databasePassword = randomUUID();
const encryptionKey = randomBytes(32).toString("hex");
const wrongEncryptionKey = randomBytes(32).toString("hex");
const sentinel = `P606-${randomUUID()}`;

try {
  docker(["build", "--target", "backup", "--tag", image, "--file", "ops/Dockerfile", "."], {
    timeout: 600_000,
  });
  stage = "fixture";
  docker(["volume", "create", fixture]);
  volumeCreated = true;
  fixtureRun("prepare", { databasePassword, encryptionKey, wrongEncryptionKey });
  docker(["network", "create", "--internal", network]);
  networkCreated = true;
  stage = "alert-receiver";
  docker([
    "run",
    "-d",
    "--name",
    alertReceiver,
    "--label",
    label,
    "--network",
    network,
    "--network-alias",
    "alert-receiver",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m,mode=1777",
    image,
    "node",
    "tests/ops/backup-alert-receiver.mjs",
  ]);
  alertReceiverCreated = true;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ready = docker(
      [
        "exec",
        alertReceiver,
        "node",
        "-e",
        "fetch('http://127.0.0.1:8787/events').then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))",
      ],
      { allowFailure: true },
    );
    if (ready.status === 0) break;
    if (attempt === 19) throw new Error("Alert receiver readiness failed");
    await setTimeout(250);
  }

  stage = "postgres";
  docker([
    "run",
    "-d",
    "--name",
    postgres,
    "--label",
    label,
    "--network",
    network,
    "--network-alias",
    "postgres",
    "--mount",
    `type=volume,src=${fixture},dst=/run/secrets,volume-subpath=postgres,readonly`,
    ...environment({
      POSTGRES_DB: "bros",
      POSTGRES_PASSWORD_FILE: "/run/secrets/postgres_password",
      POSTGRES_USER: "bros",
    }),
    "postgres:18.6-bookworm@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af",
  ]);
  postgresCreated = true;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = docker(["exec", postgres, "pg_isready", "-U", "bros", "-d", "bros"], {
      allowFailure: true,
    });
    if (ready.status === 0) break;
    if (attempt === 39) throw new Error("PostgreSQL readiness failed");
    await setTimeout(500);
  }

  stage = "migration";
  oneShot("scripts/migrate.mjs", { APP_ENV: "test", DATABASE_URL_FILE: runtime.DATABASE_URL_FILE });
  fixtureRun("seed", { sentinel }, ["--network", network, ...secretMount]);

  stage = "backup";
  const backupOutput = oneShot("scripts/database-backup-once.mjs");
  assert.equal(backupOutput.status, 0);
  const inspection = fixtureRun(
    "inspect",
    {
      sensitive: [databasePassword, encryptionKey, sentinel],
    },
    [...objectMount, ...statusMount],
  );
  const { manifestKey } = JSON.parse(inspection.stdout.trim());

  stage = "restore";
  const restoreDatabase = `bros_restore_${runId.replaceAll("-", "_")}`;
  fixtureRun("create-restore", { database: restoreDatabase, output: "restore_database_url" }, [
    "--network",
    network,
    "--mount",
    `type=volume,src=${fixture},dst=/run/secrets,volume-subpath=backup`,
  ]);
  const restoreStarted = Date.now();
  const restore = oneShot("scripts/database-restore-drill.mjs", {
    ...runtime,
    BACKUP_MANIFEST_KEY: manifestKey,
    RESTORE_CONFIRM_DISPOSABLE: "YES",
    RESTORE_DATABASE_URL_FILE: "/run/secrets/restore_database_url",
  });
  assert.equal(restore.status, 0);
  const restoreDurationMs = Date.now() - restoreStarted;
  assert.ok(restoreDurationMs < 4 * 60 * 60 * 1_000);
  fixtureRun("verify-restore", { input: "restore_database_url", sentinel }, [
    "--network",
    network,
    ...secretMount,
  ]);

  stage = "wrong-encryption-key";
  const wrongRestoreDatabase = `${restoreDatabase}_wrong`;
  fixtureRun(
    "create-restore",
    { database: wrongRestoreDatabase, output: "wrong_restore_database_url" },
    [
      "--network",
      network,
      "--mount",
      `type=volume,src=${fixture},dst=/run/secrets,volume-subpath=backup`,
    ],
  );
  const wrongRestore = oneShot(
    "scripts/database-restore-drill.mjs",
    {
      ...runtime,
      BACKUP_ENCRYPTION_KEY_FILE: "/run/secrets/wrong_backup_encryption_key",
      BACKUP_MANIFEST_KEY: manifestKey,
      RESTORE_CONFIRM_DISPOSABLE: "YES",
      RESTORE_DATABASE_URL_FILE: "/run/secrets/wrong_restore_database_url",
    },
    { allowFailure: true },
  );
  assert.notEqual(wrongRestore.status, 0);

  stage = "wrong-database-credential";
  const wrongBackup = oneShot(
    "scripts/database-backup-once.mjs",
    { ...runtime, DATABASE_URL_FILE: "/run/secrets/wrong_database_url" },
    { allowFailure: true },
  );
  assert.notEqual(wrongBackup.status, 0);
  const failedHealth = oneShot("scripts/check-database-backup-health.mjs", runtime, {
    allowFailure: true,
  });
  assert.notEqual(failedHealth.status, 0);

  stage = "backup-alert";
  const alertRuntime = {
    ...runtime,
    BACKUP_ALERT_STATE_PATH: "/alert-state/state.json",
    BACKUP_ALERT_WEBHOOK_URL_FILE: "/run/secrets/backup_alert_webhook_url",
  };
  const alert = oneShot("scripts/run-backup-alert-once.mjs", alertRuntime);
  assert.match(alert.stdout, /FAILURE_DELIVERED/);
  const duplicateAlert = oneShot("scripts/run-backup-alert-once.mjs", alertRuntime);
  assert.match(duplicateAlert.stdout, /ALREADY_OPEN/);
  fixtureRun(
    "set-status",
    {
      status: {
        attemptedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        schemaVersion: 1,
        state: "SUCCESS",
      },
    },
    [...statusMount],
  );
  const recoveryAlert = oneShot("scripts/run-backup-alert-once.mjs", alertRuntime);
  assert.match(recoveryAlert.stdout, /RECOVERY_DELIVERED/);
  const events = JSON.parse(
    docker([
      "exec",
      alertReceiver,
      "node",
      "-e",
      "fetch('http://127.0.0.1:8787/events').then(async response=>process.stdout.write(await response.text()))",
    ]).stdout,
  );
  assert.deepEqual(
    events.map((event) => event.kind),
    ["BACKUP_UNHEALTHY", "BACKUP_RECOVERED"],
  );

  stage = "stale-detection";
  fixtureRun("stale-status", { at: new Date(Date.now() - 27 * 60 * 60 * 1_000).toISOString() }, [
    ...statusMount,
  ]);
  const staleHealth = oneShot("scripts/check-database-backup-health.mjs", runtime, {
    allowFailure: true,
  });
  assert.notEqual(staleHealth.status, 0);

  const allOutput = [
    backupOutput.stdout,
    backupOutput.stderr,
    restore.stdout,
    restore.stderr,
    wrongRestore.stdout,
    wrongRestore.stderr,
    wrongBackup.stdout,
    wrongBackup.stderr,
  ].join("\n");
  for (const secret of [databasePassword, encryptionKey, wrongEncryptionKey, sentinel])
    assert.equal(allOutput.includes(secret), false);
  console.log(`P606_BACKUP_ENCRYPT_RESTORE_PASS rto_ms=${restoreDurationMs}`);
  console.log("P606_WRONG_KEY_AND_CREDENTIAL_FAILURE_DETECTION_PASS");
  console.log("P606_26H_STALE_DETECTION_PASS");
  console.log("P603_BACKUP_ALERT_DELIVERY_DEDUP_RECOVERY_PASS");
} catch (error) {
  console.error(`P606_BACKUP_VERIFY_FAILED stage=${stage}; credential-bearing output withheld`);
  const diagnostics = [error.message, error.cause?.stdout, error.cause?.stderr]
    .filter(Boolean)
    .join("\n");
  const redacted = [databasePassword, encryptionKey, wrongEncryptionKey, sentinel].reduce(
    (value, secret) => value.replaceAll(secret, "[REDACTED]"),
    diagnostics,
  );
  const safe = redacted.match(
    /MODULE_NOT_FOUND|EACCES|EPERM|ECONNREFUSED|AssertionError|DATABASE_[A-Z_]+/,
  );
  if (safe) console.error(`P606_FAILURE_CODE ${safe[0]}`);
  console.error(redacted.slice(-4_096));
  process.exitCode = 1;
} finally {
  if (alertReceiverCreated) docker(["rm", "-f", "-v", alertReceiver], { allowFailure: true });
  if (postgresCreated) docker(["rm", "-f", "-v", postgres], { allowFailure: true });
  if (networkCreated) docker(["network", "rm", network], { allowFailure: true });
  if (volumeCreated) docker(["volume", "rm", fixture], { allowFailure: true });
  docker(["image", "rm", image], { allowFailure: true });
  console.log("P606_CLEANUP_FINISHED");
}
