import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const source = "git:github.com/h1057399903-web/pi-mcp-adapter";
const bootstrapSha = "a42ff1e35e402d7887f450d4367777cbfe76ff84";
const expectedStableSha = process.env.PI_EXPECTED_STABLE_SHA;
const workbenchRoot = resolve(
  process.env.PI_WORKBENCH_DIR ?? join(process.cwd(), "..", "pi-plugin-workbench"),
);
const piCli = join(
  workbenchRoot,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
  "dist",
  "cli.js",
);
const agentDir = mkdtempSync(join(tmpdir(), "pi-mcp-distribution-"));
const cloneDir = join(
  agentDir,
  "git",
  "github.com",
  "h1057399903-web",
  "pi-mcp-adapter",
);

if (!expectedStableSha) {
  throw new Error("PI_EXPECTED_STABLE_SHA must be the reviewed stable commit");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      PI_CODING_AGENT_DIR: agentDir,
    },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function pi(...args) {
  return run(process.execPath, [piCli, ...args]);
}

function head() {
  return run("git", ["-C", cloneDir, "rev-parse", "HEAD"]);
}

try {
  pi("install", source);
  if (head() !== expectedStableSha) {
    throw new Error(`Fresh install did not resolve stable: ${head()}`);
  }

  pi("update", "--extensions");
  if (head() !== expectedStableSha) {
    throw new Error(`Routine update moved away from stable: ${head()}`);
  }

  pi("install", `${source}@${bootstrapSha}`);
  if (head() !== bootstrapSha) {
    throw new Error(`Pinned rollback did not resolve bootstrap: ${head()}`);
  }

  pi("install", source);
  pi("update", "--extensions");
  if (head() !== expectedStableSha) {
    throw new Error(`Return to the moving stable lane failed: ${head()}`);
  }

  const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));
  const packages = settings.packages ?? [];
  const configuredSources = packages.map((entry) =>
    typeof entry === "string" ? entry : entry.source,
  );
  if (!configuredSources.includes(source)) {
    throw new Error(`Unqualified stable source not persisted: ${JSON.stringify(packages)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      source,
      stable: expectedStableSha,
      rollback: bootstrapSha,
      isolatedAgentDir: agentDir,
    }),
  );
} finally {
  if (process.env.PI_KEEP_DISPOSABLE_HOME !== "1") {
    rmSync(agentDir, { recursive: true, force: true });
  }
}
