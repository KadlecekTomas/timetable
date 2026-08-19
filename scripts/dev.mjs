import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const solverDir = path.join(repoRoot, "apps", "solver");
const webPort = 3000;
const solverPortStart = 8000;
const solverPortEnd = 8010;
const venvDir = path.join(solverDir, ".venv");
const venvPython = path.join(
  venvDir,
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} skončil ${signal ? `signálem ${signal}` : `s kódem ${code}`}.`,
        ),
      );
    });
  });
}

function pythonVersion(command, prefixArgs = []) {
  const result = spawnSync(
    command,
    [
      ...prefixArgs,
      "-c",
      "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
    ],
    { cwd: solverDir, encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  const match = result.stdout.trim().match(/^(\d+)\.(\d+)$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function supportedPython(version) {
  return (
    version?.major === 3 && version.minor >= 11 && version.minor <= 13
  );
}

function pythonCandidates() {
  const candidates = [];
  if (process.env.PYTHON) {
    candidates.push({ command: process.env.PYTHON, args: [] });
  }
  if (process.platform === "win32") {
    candidates.push(
      { command: "py", args: ["-3.13"] },
      { command: "py", args: ["-3.12"] },
      { command: "py", args: ["-3.11"] },
      { command: "python", args: [] },
    );
  } else {
    candidates.push(
      { command: "python3.13", args: [] },
      { command: "python3.12", args: [] },
      { command: "python3.11", args: [] },
      { command: "python3", args: [] },
    );
  }
  return candidates;
}

function selectSupportedPython() {
  for (const candidate of pythonCandidates()) {
    const version = pythonVersion(candidate.command, candidate.args);
    if (supportedPython(version)) {
      return { ...candidate, version };
    }
  }
  const installHint =
    process.platform === "darwin"
      ? "Nainstalujte Python 3.13: brew install python@3.13"
      : "Nainstalujte Python 3.11, 3.12 nebo 3.13 a spusťte npm run dev znovu.";
  throw new Error(
    `Solver podporuje Python 3.11–3.13. Python 3.14 zatím není kompatibilní s připnutým pydantic-core/OR-Tools. ${installHint}`,
  );
}

async function portIsAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function selectSolverPort() {
  for (let port = solverPortStart; port <= solverPortEnd; port += 1) {
    if (await portIsAvailable(port)) return port;
  }
  throw new Error(
    `Pro solver není volný žádný port ${solverPortStart}–${solverPortEnd}. Ukončete staré lokální procesy a spusťte npm run dev znovu.`,
  );
}

async function solverIsHealthy(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureSolverEnvironment() {
  if (existsSync(venvPython)) {
    const existingVersion = pythonVersion(venvPython);
    if (!supportedPython(existingVersion)) {
      console.log(
        `[dev] Mažu nekompatibilní .venv s Pythonem ${existingVersion ? `${existingVersion.major}.${existingVersion.minor}` : "neznámé verze"}…`,
      );
      rmSync(venvDir, { recursive: true, force: true });
    }
  }

  if (!existsSync(venvPython)) {
    const python = selectSupportedPython();
    console.log(
      `[dev] Připravuji Python ${python.version.major}.${python.version.minor} prostředí solveru…`,
    );
    await run(
      python.command,
      [...python.args, "-m", "venv", ".venv"],
      { cwd: solverDir },
    );
  }

  const dependencyCheck = spawnSync(
    venvPython,
    ["-c", "import fastapi, ortools, uvicorn"],
    {
      cwd: solverDir,
      stdio: "ignore",
    },
  );

  if (dependencyCheck.status !== 0) {
    console.log("[dev] Instaluji závislosti solveru…");
    await run(venvPython, ["-m", "pip", "install", "-e", "."], {
      cwd: solverDir,
    });
  }
}

async function waitForSolver(child, port) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Solver skončil s kódem ${child.exitCode} ještě před startem webu.`,
      );
    }
    if (await solverIsHealthy(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Solver se do 45 sekund nepodařilo spustit na portu ${port}.`,
  );
}

let solverProcess = null;
let webProcess = null;
let shuttingDown = false;

function shutdown(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  if (webProcess && webProcess.exitCode === null) webProcess.kill(signal);
  if (solverProcess && solverProcess.exitCode === null) solverProcess.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

try {
  if (!(await portIsAvailable(webPort))) {
    throw new Error(
      `Port ${webPort} už používá jiný proces. Ukončete předchozí npm run dev (Ctrl+C) a spusťte příkaz znovu. Rozvrhář záměrně nespustí druhou starou/novou verzi vedle sebe.`,
    );
  }

  await ensureSolverEnvironment();
  const solverPort = await selectSolverPort();
  const solverUrl = `http://127.0.0.1:${solverPort}`;
  if (solverPort !== solverPortStart) {
    console.log(
      `[dev] Port ${solverPortStart} už používá jiný proces. Spouštím aktuální solver na ${solverUrl}, aby se nepoužila stará verze solveru.`,
    );
  }

  solverProcess = spawn(
    venvPython,
    [
      "-m",
      "uvicorn",
      "app.runtime:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(solverPort),
    ],
    {
      cwd: solverDir,
      env: {
        ...process.env,
        ALLOW_LONG_SOLVES: process.env.ALLOW_LONG_SOLVES ?? "1",
      },
      stdio: "inherit",
    },
  );
  solverProcess.once("error", (error) => {
    console.error("[dev] Solver se nepodařilo spustit:", error);
    shutdown();
  });
  await waitForSolver(solverProcess, solverPort);
  console.log(`[dev] Solver je připravený na ${solverUrl}.`);

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  webProcess = spawn(
    npmCommand,
    ["run", "dev", "--workspace", "@timetable/web", "--", "--port", String(webPort)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        SOLVER_URL: solverUrl,
      },
      stdio: "inherit",
    },
  );

  webProcess.once("error", (error) => {
    console.error("[dev] Web se nepodařilo spustit:", error);
    shutdown();
  });

  const exitCode = await new Promise((resolve) => {
    webProcess.once("exit", (code) => resolve(code ?? 1));
  });
  shutdown();
  process.exitCode = exitCode;
} catch (error) {
  console.error("[dev] Lokální vývoj se nepodařilo spustit.");
  console.error(error instanceof Error ? error.message : error);
  shutdown();
  process.exitCode = 1;
}
