import { chown, lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
import { secretKeyToEnvironmentVariable } from "../packages/core/dist/index.js";

// Accept a bundle from the operator's secret manager on stdin, never argv/env.
// Each invocation creates a NEW generation. No existing secret is overwritten.
try {
  if (process.platform !== "linux" || process.getuid() !== 0) throw new Error();
  process.umask(0o077);
  const target = process.argv[2];
  const repo = resolve(fileURLToPath(new URL("../", import.meta.url)));
  if (!target || !isAbsolute(target) || !relative(repo, resolve(target)).startsWith(".."))
    throw new Error();
  for (let parent = dirname(resolve(target)); ; parent = dirname(parent)) {
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o022) !== 0)
      throw new Error();
    if (parent === dirname(parent)) break;
  }
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 65_536) throw new Error();
  }
  const bundle = JSON.parse(input);
  const plain = (value) =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\r\n\0]/.test(value);
  if (
    !plain(bundle.database?.password) ||
    !/^[a-z][a-z0-9_]{0,30}$/.test(bundle.database?.user ?? "") ||
    !/^[a-z][a-z0-9_]{0,30}$/.test(bundle.database?.name ?? "") ||
    !plain(bundle.r2?.accessKeyId) ||
    !plain(bundle.r2?.secretAccessKey) ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(bundle.proxyToken ?? "") ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(bundle.admin?.username ?? "") ||
    !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(bundle.admin?.passwordHash ?? "")
  )
    throw new Error();
  const url = new URL("postgresql://postgres:5432");
  url.username = bundle.database.user;
  url.password = bundle.database.password;
  url.pathname = `/${bundle.database.name}`;
  const files = new Map([
    ["database_url", [url.toString(), 1000]],
    ["postgres_password", [bundle.database.password, 0]],
    ["proxy_token", [bundle.proxyToken, 1000]],
    ["r2_access_key", [bundle.r2.accessKeyId, 1000]],
    ["r2_secret_key", [bundle.r2.secretAccessKey, 1000]],
    ["caddy_auth", [`${bundle.admin.username} ${bundle.admin.passwordHash}\n`, 1000]],
    ["caddy_proxy", [`header_up X-BROS-Proxy-Token "${bundle.proxyToken}"\n`, 1000]],
  ]);
  for (const [key, value] of Object.entries(bundle.additionalSecrets ?? {})) {
    if (!plain(value) || !/^(provider|browser)\./.test(key)) throw new Error();
    files.set(secretKeyToEnvironmentVariable(key), [value, 1000]);
  }
  await mkdir(target, { mode: 0o700 });
  for (const [name, [value, uid]] of files) {
    const path = join(target, name);
    await writeFile(path, value, { flag: "wx", mode: 0o400 });
    await chown(path, uid, uid);
  }
  console.log("New secret generation provisioned; select its path and recreate consumers");
} catch {
  console.error("Secret provisioning failed; existing generations were not overwritten");
  process.exitCode = 1;
}
