import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";

const testKind = process.argv[2];

if (testKind !== "unit" && testKind !== "integration") {
  console.error("Usage: node scripts/run-tests.mjs <unit|integration>");
  process.exit(2);
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const roots =
  testKind === "unit"
    ? [join(repositoryRoot, "apps"), join(repositoryRoot, "packages")]
    : [join(repositoryRoot, "tests", "integration")];

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = [];

  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }

    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...(await findTests(entryPath)));
      continue;
    }

    const isIntegration = entry.name.endsWith(".integration.test.mjs");
    const isUnit = entry.name.endsWith(".test.mjs") && !isIntegration;
    if ((testKind === "unit" && isUnit) || (testKind === "integration" && isIntegration)) {
      discovered.push(entryPath);
    }
  }

  return discovered;
}

const testFiles = (await Promise.all(roots.map(findTests))).flat().sort();

if (testFiles.length === 0) {
  console.error(`No ${testKind} test files were discovered`);
  process.exit(1);
}

console.log(
  `Running ${testFiles.length} ${testKind} test file(s): ${testFiles
    .map((file) => relative(repositoryRoot, file))
    .join(", ")}`,
);

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
