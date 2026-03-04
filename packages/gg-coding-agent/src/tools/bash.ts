import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { killProcessTree } from "../utils/process.js";
import { truncateTail } from "./truncate.js";

const DEFAULT_TIMEOUT = 120_000; // 120 seconds

const BashParams = z.object({
  command: z.string().describe("The bash command to execute"),
  timeout: z
    .number()
    .int()
    .min(1000)
    .optional()
    .describe("Timeout in milliseconds (default: 120000)"),
});

export function createBashTool(cwd: string): AgentTool<typeof BashParams> {
  return {
    name: "bash",
    description:
      "Execute a bash command. Returns exit code and combined stdout/stderr. " +
      "Commands run in a non-interactive bash shell with TERM=dumb. " +
      "Long output is truncated (tail kept).",
    parameters: BashParams,
    async execute({ command, timeout: timeoutMs }, context) {
      const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT;

      return new Promise<string>((resolve) => {
        const child = spawn("bash", ["-c", command], {
          cwd,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, TERM: "dumb" },
        });

        const chunks: Buffer[] = [];

        child.stdout?.on("data", (data: Buffer) => chunks.push(data));
        child.stderr?.on("data", (data: Buffer) => chunks.push(data));

        let killed = false;
        let timedOut = false;

        // Timeout handling
        const timer = setTimeout(() => {
          timedOut = true;
          killed = true;
          if (child.pid) killProcessTree(child.pid);
        }, effectiveTimeout);

        // Abort signal handling
        const onAbort = () => {
          killed = true;
          if (child.pid) killProcessTree(child.pid);
        };
        context.signal.addEventListener("abort", onAbort, { once: true });

        child.on("close", async (code) => {
          clearTimeout(timer);
          context.signal.removeEventListener("abort", onAbort);

          const rawOutput = Buffer.concat(chunks).toString("utf-8");
          const result = truncateTail(rawOutput);

          let output = result.content;
          if (result.truncated) {
            // Save full output to temp file
            const tmpPath = path.join(os.tmpdir(), `gg-bash-${Date.now()}.txt`);
            await fs.writeFile(tmpPath, rawOutput, "utf-8").catch(() => {});
            output = `[Truncated: showing last ${result.keptLines} of ${result.totalLines} lines. Full output: ${tmpPath}]\n${output}`;
          }

          const exitCode = timedOut
            ? `TIMEOUT (${effectiveTimeout}ms)`
            : killed
              ? "KILLED"
              : String(code ?? 1);

          resolve(`Exit code: ${exitCode}\n${output}`);
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          context.signal.removeEventListener("abort", onAbort);
          resolve(`Exit code: 1\nFailed to spawn: ${err.message}`);
        });
      });
    },
  };
}
