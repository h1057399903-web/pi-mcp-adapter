import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const adapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workbenchRoot = resolve(
  process.env.PI_WORKBENCH_DIR ?? join(adapterRoot, "..", "pi-plugin-workbench"),
);
const piPackageRoot = join(
  workbenchRoot,
  "node_modules",
  "@earendil-works",
  "pi-coding-agent",
);
const piCli = join(piPackageRoot, "dist", "cli.js");
const agentDir = mkdtempSync(join(tmpdir(), "pi-mcp-compat-"));

try {
  const result = spawnSync(
    process.execPath,
    [
      piCli,
      "--mode",
      "rpc",
      "--no-session",
      "--no-context-files",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "-e",
      join(adapterRoot, "index.ts"),
      "-e",
      join(workbenchRoot, "src", "index.ts"),
    ],
    {
      cwd: adapterRoot,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_MCP_CONFIG_MODE: "exclusive",
        PI_OFFLINE: "1",
      },
      input: '{"type":"get_commands","id":"downstream-compat"}\n',
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Pi RPC exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  const events = result.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const response = events.find((event) => event.id === "downstream-compat");
  if (!response?.success) {
    throw new Error(`No successful command response: ${result.stdout}`);
  }

  const commands = (response.data?.commands ?? response.data ?? []).map((command) =>
    typeof command === "string" ? command : command.name,
  );
  const required = ["mcp", "pi-mcp", "mcp-auth", "web", "goal", "plan"];
  const missing = required.filter((command) => !commands.includes(command));
  if (missing.length > 0) {
    throw new Error(`Missing commands: ${missing.join(", ")}`);
  }

  const piVersion = JSON.parse(
    readFileSync(join(piPackageRoot, "package.json"), "utf8"),
  ).version;
  console.log(
    JSON.stringify({
      ok: true,
      piVersion,
      commands: required,
      adapter: join(adapterRoot, "index.ts"),
      workbench: join(workbenchRoot, "src", "index.ts"),
    }),
  );
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
