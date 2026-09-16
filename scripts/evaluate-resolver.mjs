import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  evaluateResolverDataset,
  resolverHoldoutDigest,
  evaluationDigest,
} from "../packages/resolver/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
async function json(path) {
  if ((await stat(path)).size > 32 * 1024 * 1024) throw new Error("EVALUATION_FILE_TOO_LARGE");
  const value = await readFile(path);
  if (value.byteLength > 32 * 1024 * 1024) throw new Error("EVALUATION_FILE_TOO_LARGE");
  return JSON.parse(value.toString("utf8"));
}
async function algorithmDigest() {
  const files = [];
  for (const name of ["contracts", "resolver"]) {
    const directory = join(root, "packages", name, "dist");
    for (const file of (await readdir(directory)).filter((v) => v.endsWith(".js")).sort())
      files.push([`${name}/${file}`, await readFile(join(directory, file), "utf8")]);
  }
  return evaluationDigest(files);
}
async function main() {
  const [command, inputPath, lockPath, outputPath, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !inputPath ||
    !lockPath ||
    !["seal", "evaluate"].includes(command) ||
    (command === "seal" && outputPath) ||
    (command === "evaluate" && !outputPath)
  )
    throw new Error("INVALID_EVALUATION_ARGUMENTS");
  const dataset = await json(inputPath);
  if (command === "seal") {
    const lock = {
      schemaVersion: 1,
      holdoutDigest: resolverHoldoutDigest(dataset),
      algorithmDigest: await algorithmDigest(),
    };
    await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n", { flag: "wx" });
    console.log("Holdout and algorithm sealed; review and retain this lock before evaluation.");
    return;
  }
  const lock = await json(lockPath),
    digest = await algorithmDigest();
  if (lock.schemaVersion !== 1 || lock.algorithmDigest !== digest)
    throw new Error("ALGORITHM_LOCK_MISMATCH");
  const report = evaluateResolverDataset(dataset, {
    expectedHoldoutDigest: lock.holdoutDigest,
    algorithmDigest: digest,
  });
  // Create a new directory only; do not overwrite earlier evaluation evidence or the dataset.
  const directory = resolve(outputPath);
  await mkdir(directory);
  await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  const h = report.holdout;
  const markdown = [
    "# Resolver Evaluation Report",
    "",
    `- Dataset: ${report.datasetVersion} (${report.sourceKind})`,
    `- Mode: ${report.evaluationMode}`,
    `- Calibration: ${report.calibrationStatus}`,
    "- Automatic promotion: OFF",
    `- Dataset SHA-256: ${report.datasetDigest}`,
    `- Holdout SHA-256: ${report.holdoutDigest}`,
    `- Algorithm SHA-256: ${report.algorithmDigest}`,
    "",
    "| Holdout metric | Value |",
    "|---|---|",
    ...Object.entries(h)
      .filter(([k]) => k !== "scoreBins")
      .map(([k, v]) => `| ${k} | ${v ?? "NOT_MEASURED"} |`),
    "",
    "## Gate checks",
    "",
    ...Object.entries(report.gates).map(([k, v]) => `- ${k}: ${v ? "PASS" : "NOT_MET"}`),
    "",
    "## Limits",
    "",
    "Evidence replay measures normalization/scoring/conflict/decision only. Provider capture and full Worker runtime are not replayed. Cost is the recorded capture cost; missing cost is not zero. Labels and capture provenance require curator verification. See report.json for split/brand/category denominators, score bins, errors and case outcomes. A passing sample is not a statistical guarantee or authorization to enable automatic promotion.",
    "",
  ].join("\n");
  await writeFile(join(directory, "report.md"), markdown, { flag: "wx" });
  console.log(`Resolver evaluation: ${report.calibrationStatus}; automatic promotion OFF`);
  if (report.calibrationStatus !== "PASS") process.exitCode = 2;
}
try {
  await main();
} catch {
  console.error(
    "Resolver evaluation failed; verify input, frozen lock, build and new output path. Raw input was not logged.",
  );
  process.exitCode = 1;
}
