import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Path guard only: this does not certify file contents or detect every secret.
export function isPrivatePublicationPath(path) {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return (
    /^(examples|data|storage|tmp|temp)\//u.test(normalized) ||
    (/(?:^|\/)\.env(?:\..*)?$/u.test(normalized) && normalized !== ".env.example") ||
    /\.(xlsx?|xlsm|dump|sqlite3?|pem|p12|pfx|key)$/u.test(normalized)
  );
}

export function checkPublication(root, includeUntracked = false) {
  const args = ["-C", root, "ls-files", "-z", "--cached"];
  if (includeUntracked) args.push("--others", "--exclude-standard");
  const paths = [
    ...new Set(execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean)),
  ];
  return { fileCount: paths.length, blocked: paths.filter(isPrivatePublicationPath).sort() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some((arg) => arg !== "--worktree")) throw new Error();
    const result = checkPublication(
      resolve(import.meta.dirname, ".."),
      args.includes("--worktree"),
    );
    if (result.blocked.length) {
      // Print paths, never file contents. Also catches force-added ignored files.
      console.error(JSON.stringify({ code: "PRIVATE_PUBLICATION_PATH", paths: result.blocked }));
      process.exitCode = 1;
    } else console.log(`Publication path check passed (${result.fileCount} files).`);
  } catch {
    console.error("PUBLICATION_CHECK_FAILED");
    process.exitCode = 1;
  }
}
