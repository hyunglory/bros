import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import {
  EnvSecretProvider,
  SecretNotFoundError,
  createBrowserSecretKeys,
  createRedactedLogger,
  maskSensitiveText,
  requireSecret,
  secretKeyToEnvironmentVariable,
  secretRedactionCensor,
} from "../dist/security/index.js";

test("maps approved secret keys to namespaced environment variables", () => {
  assert.equal(
    secretKeyToEnvironmentVariable("storage.r2.secretAccessKey"),
    "BROS_SECRET_STORAGE_R2_SECRET_ACCESS_KEY",
  );
  assert.deepEqual(createBrowserSecretKeys("default"), {
    accessToken: "browser.profile.default.accessToken",
    cookie: "browser.profile.default.cookie",
    otpSeed: "browser.profile.default.otpSeed",
    password: "browser.profile.default.password",
    username: "browser.profile.default.username",
  });
  assert.throws(() => createBrowserSecretKeys("invalid-profile"), TypeError);
});

test("looks up secrets without exposing missing values", async () => {
  const provider = new EnvSecretProvider({
    BROS_SECRET_PROVIDER_IMAGE_API_KEY: "  image-provider-secret  ",
  });

  await assert.doesNotReject(async () => {
    const secret = await requireSecret(provider, "provider.image.apiKey");
    assert.equal(secret === "image-provider-secret", true);
  });
  await assert.rejects(
    () => requireSecret(provider, "provider.search.apiKey"),
    (error) => {
      assert.ok(error instanceof SecretNotFoundError);
      assert.match(error.message, /provider\.search\.apiKey/);
      assert.doesNotMatch(error.message, /image-provider-secret/);
      return true;
    },
  );
});

test("masks token, cookie, password, signed query, and URL user info in text", () => {
  const raw =
    "Bearer access-value password=hunter2 cookie=session-value " +
    "https://user:db-pass@example.test/file?x-amz-signature=signed-value";
  const masked = maskSensitiveText(raw);

  for (const secret of ["access-value", "hunter2", "session-value", "db-pass", "signed-value"]) {
    assert.doesNotMatch(masked, new RegExp(secret));
  }
  assert.equal(masked.includes(secretRedactionCensor), true);
});

test("redacts structured Pino fields and serialized errors", () => {
  const chunks = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger = createRedactedLogger(destination);
  const secretValues = [
    "password-value",
    "token-value",
    "cookie-value",
    "database-password",
    "signed-value",
  ];

  logger.error({
    password: secretValues[0],
    nested: { accessToken: secretValues[1] },
    req: {
      url: `/asset?token=${secretValues[1]}`,
      headers: { cookie: secretValues[2] },
    },
    database: { url: `postgresql://user:${secretValues[3]}@database/bros` },
    err: new Error(`Bearer ${secretValues[1]} signature=${secretValues[4]}`),
  });

  assert.equal(chunks.length, 1);
  const serialized = chunks[0];
  for (const secret of secretValues) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
  assert.match(serialized, /\[REDACTED\]/);
});

test("redacts deeply nested arrays, cookie headers, OTP and R2 fields without mutating input", () => {
  const chunks = [];
  const logger = createRedactedLogger(
    new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk.toString());
        done();
      },
    }),
  );
  const value = {
    nested: {
      deeper: [
        {
          fields: {
            secretAccessKey: "sentinel-r2",
            accessKeyId: "sentinel-key-id",
            otpSeed: "sentinel-otp",
            headers: { "set-cookie": "a=sentinel-a; b=sentinel-b" },
            note: "Cookie: a=sentinel-c; b=sentinel-d",
          },
        },
      ],
    },
  };
  logger.info(value, "safe event");
  assert.doesNotMatch(chunks.join(""), /sentinel-/);
  assert.equal(value.nested.deeper[0].fields.secretAccessKey, "sentinel-r2");
});

test("masks quoted and space-containing passwords and signed credential query parameters", () => {
  for (const input of [
    'password="secret with spaces"',
    "password=secret with spaces",
    "https://a.test/?X-Amz-Credential=secret-access-id&X-Amz-Security-Token=secret-session-token",
  ]) {
    assert.doesNotMatch(maskSensitiveText(input), /secret|spaces/);
  }
});
