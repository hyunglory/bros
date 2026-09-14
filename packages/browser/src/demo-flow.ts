import { createBrowserManager } from "./browser-manager.js";
import { mapBrowserError } from "./error-taxonomy.js";
import type { BrowserErrorCode } from "./error-taxonomy.js";
import type { BrowserArtifactService } from "./artifact-service.js";
import { createFlowRunner, FlowRunnerError } from "./flow-registry.js";
import type { BrowserFlowContext, BrowserFlowHandler, BrowserFlowStep } from "./flow-registry.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";

export const demoBrowserFlowHandlerKey = "demo.browser" as const;

export type DemoFlowMode = "failure" | "success";

export interface DemoFlowArtifact {
  readonly handlerKey: typeof demoBrowserFlowHandlerKey;
  readonly outcome: "FAILED" | "SUCCEEDED";
  readonly result: "COMPLETED" | "NOT_COMPLETED" | "REJECTED";
  readonly runPublicId: string;
  readonly steps: readonly (BrowserFlowStep | "cleanup")[];
  readonly url: "about:blank";
}

export interface DemoArtifactSink {
  write(artifact: DemoFlowArtifact): Promise<void>;
}

export type DemoFlowHarnessResult = Readonly<
  | { artifact: DemoFlowArtifact; status: "SUCCESS" }
  | {
      artifact: DemoFlowArtifact;
      errorCode: BrowserErrorCode;
      status: "FAILED";
    }
>;

export type DurableDemoFlowResult = Readonly<
  | {
      artifact: DemoFlowArtifact;
      currentStep: "completed";
      currentUrl: string;
      resultKey: string;
      screenshotKey: string;
      status: "SUCCESS";
      traceKey: string;
    }
  | {
      artifact: DemoFlowArtifact;
      currentStep: "failed";
      currentUrl: string;
      errorCode: BrowserErrorCode;
      resultKey: string;
      screenshotKey: string;
      status: "FAILED" | "TIMEOUT";
      traceKey: string;
    }
>;

function readMode(context: BrowserFlowContext): DemoFlowMode {
  const mode = context.input.mode;
  if (mode !== "failure" && mode !== "success") throw new Error("Invalid demo flow mode");
  return mode;
}

async function readResult(page: Page): Promise<DemoFlowArtifact["result"]> {
  const result = await page
    .locator("#result")
    .textContent()
    .catch(() => null);
  return result === "COMPLETED" || result === "REJECTED" ? result : "NOT_COMPLETED";
}

export function createDemoBrowserFlow(options: {
  afterPrepare?: () => Promise<void>;
  artifactSink: DemoArtifactSink;
  page: Page;
}): BrowserFlowHandler {
  const steps: (BrowserFlowStep | "cleanup")[] = [];

  return {
    handlerKey: demoBrowserFlowHandlerKey,
    async prepare(context) {
      steps.push("prepare");
      const mode = readMode(context);
      await options.page.setContent(`
        <!doctype html>
        <html lang="en">
          <head><meta name="demo-auth" content="authenticated"></head>
          <body data-mode="${mode}">
            <button id="run" type="button">Run deterministic demo</button>
            <output id="result">NOT_COMPLETED</output>
            <script>
              document.querySelector("#run").addEventListener("click", () => {
                const mode = document.body.dataset.mode;
                document.querySelector("#result").textContent =
                  mode === "success" ? "COMPLETED" : "REJECTED";
              });
            </script>
          </body>
        </html>
      `);
      await options.afterPrepare?.();
    },
    async authenticate() {
      steps.push("authenticate");
      const authenticated = await options.page
        .locator('meta[name="demo-auth"]')
        .getAttribute("content");
      if (authenticated !== "authenticated") throw new Error("Demo authentication failed");
    },
    async execute() {
      steps.push("execute");
      await options.page.locator("#run").click();
    },
    async verify() {
      steps.push("verify");
      if ((await readResult(options.page)) !== "COMPLETED") {
        throw new Error("Demo verification failed");
      }
    },
    async cleanup(context) {
      steps.push("cleanup");
      await options.artifactSink.write(
        Object.freeze({
          handlerKey: demoBrowserFlowHandlerKey,
          outcome: context.outcome,
          result: await readResult(options.page),
          runPublicId: context.runPublicId,
          steps: Object.freeze([...steps]),
          url: "about:blank" as const,
        }),
      );
    },
  };
}

/**
 * Executes the deterministic demo through the same lifecycle as production browser flows
 * and persists the resulting evidence through the artifact service.
 */
export async function runDurableDemoBrowserHarness(request: {
  artifactService: BrowserArtifactService;
  mode: DemoFlowMode;
  runPublicId: string;
}): Promise<DurableDemoFlowResult> {
  const manager = createBrowserManager();
  return manager.withBrowser(undefined, async (browser) => {
    const page = await browser.newPage();
    const artifacts = request.artifactService.createRun({ runPublicId: request.runPublicId });
    const traceDirectory = await mkdtemp(join(tmpdir(), "bros-browser-trace-"));
    const tracePath = join(traceDirectory, "trace.zip");
    let artifact: DemoFlowArtifact | undefined;
    try {
      await page.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
      const flow = createDemoBrowserFlow({
        afterPrepare: async () => {
          await artifacts.captureScreenshot("start", page);
        },
        artifactSink: {
          async write(value) {
            artifact = value;
          },
        },
        page,
      });
      const runner = createFlowRunner([flow]);
      try {
        await runner.run({
          handlerKey: demoBrowserFlowHandlerKey,
          input: { mode: request.mode },
          runPublicId: request.runPublicId,
        });
        if (artifact === undefined) throw new Error("Demo artifact missing");
        const screenshot = await artifacts.captureScreenshot("final", page);
        await page.context().tracing.stop({ path: tracePath });
        const trace = await artifacts.writeTrace(await readFile(tracePath));
        const result = await artifacts.writeResult({
          currentStep: "completed",
          currentUrl: page.url(),
          errorCode: null,
          result: { demoResult: artifact.result, handlerKey: artifact.handlerKey },
          status: "SUCCESS",
        });
        return {
          artifact,
          currentStep: "completed",
          currentUrl: page.url(),
          resultKey: result.objectKey,
          screenshotKey: screenshot.objectKey,
          status: "SUCCESS",
          traceKey: trace.objectKey,
        };
      } catch (error) {
        if (artifact === undefined) throw error;
        const errorCode =
          error instanceof FlowRunnerError && error.browserErrorCode !== undefined
            ? error.browserErrorCode
            : mapBrowserError(error);
        const screenshot = await artifacts.captureScreenshot("failure", page);
        await page.context().tracing.stop({ path: tracePath });
        const trace = await artifacts.writeTrace(await readFile(tracePath));
        const status = errorCode === "NAVIGATION_TIMEOUT" ? "TIMEOUT" : "FAILED";
        const result = await artifacts.writeResult({
          currentStep: "failed",
          currentUrl: page.url(),
          errorCode,
          result: { demoResult: artifact.result, handlerKey: artifact.handlerKey },
          status,
        });
        return {
          artifact,
          currentStep: "failed",
          currentUrl: page.url(),
          errorCode,
          resultKey: result.objectKey,
          screenshotKey: screenshot.objectKey,
          status,
          traceKey: trace.objectKey,
        };
      }
    } finally {
      await rm(traceDirectory, { force: true, recursive: true }).catch(() => undefined);
    }
  });
}

export async function runDemoBrowserHarness(request: {
  mode: DemoFlowMode;
  runPublicId: string;
}): Promise<DemoFlowHarnessResult> {
  const manager = createBrowserManager();
  return manager.withBrowser(undefined, async (browser) => {
    const page = await browser.newPage();
    let artifact: DemoFlowArtifact | undefined;
    const flow = createDemoBrowserFlow({
      artifactSink: {
        async write(value) {
          artifact = value;
        },
      },
      page,
    });
    const runner = createFlowRunner([flow]);
    try {
      await runner.run({
        handlerKey: demoBrowserFlowHandlerKey,
        input: { mode: request.mode },
        runPublicId: request.runPublicId,
      });
      if (artifact === undefined) throw new Error("Demo artifact missing");
      return { artifact, status: "SUCCESS" };
    } catch (error) {
      if (
        !(error instanceof FlowRunnerError) ||
        (error.code !== "FLOW_EXECUTION_FAILED" && error.code !== "FLOW_CLEANUP_FAILED") ||
        artifact === undefined
      ) {
        throw new Error("Demo browser harness failed", { cause: error });
      }
      return {
        artifact,
        errorCode: error.browserErrorCode ?? mapBrowserError(error),
        status: "FAILED",
      };
    }
  });
}
