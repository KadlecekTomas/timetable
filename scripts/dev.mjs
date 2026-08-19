import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const solverDir = path.join(repoRoot, "apps", "solver");
const solverHealthUrl = "http://127.0.0.1:8000/health";
const solverUrl = "http://127.0.0.1:8000";
const venvPython = path.join(
  solverDir,
  ".venv",
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

async function solverIsHealthy() {
  try {
    const response = await fetch(solverHealthUrl, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureSolverEnvironment() {
  if (!existsSync(venvPython)) {
    console.log("[dev] Připravuji Python prostředí solveru…");
    const python = process.env.PYTHON ?? "python3";
    await run(python, ["-m", "venv", ".venv"], { cwd: solverDir });
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

async function waitForSolver(child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Solver skončil s kódem ${child.exitCode} ještě před startem webu.`);
    }
    if (await solverIsHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Solver se do 45 sekund nepodařilo spustit na portu 8000.");
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
  if (await solverIsHealthy()) {
    console.log("[dev] Solver už běží na http://127.0.0.1:8000.");
  } else {
    await ensureSolverEnvironment();
    solverProcess = spawn(
      venvPython,
      ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
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
    await waitForSolver(solverProcess);
    console.log("[dev] Solver je připravený.");
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  webProcess = spawn(
    npmCommand,
    ["run", "dev", "--workspace", "@timetable/web"],
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
