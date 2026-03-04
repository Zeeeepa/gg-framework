import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

export const APP_NAME = "gg-coding-agent";
export const VERSION = "0.0.1";

export interface AppPaths {
  agentDir: string;
  sessionsDir: string;
  settingsFile: string;
  authFile: string;
  skillsDir: string;
  extensionsDir: string;
}

export function getAppPaths(): AppPaths {
  const agentDir = path.join(os.homedir(), ".gg");
  return {
    agentDir,
    sessionsDir: path.join(agentDir, "sessions"),
    settingsFile: path.join(agentDir, "settings.json"),
    authFile: path.join(agentDir, "auth.json"),
    skillsDir: path.join(agentDir, "skills"),
    extensionsDir: path.join(agentDir, "extensions"),
  };
}

export async function ensureAppDirs(): Promise<AppPaths> {
  const paths = getAppPaths();
  await fs.mkdir(paths.agentDir, { recursive: true });
  await fs.mkdir(paths.sessionsDir, { recursive: true });
  await fs.mkdir(paths.skillsDir, { recursive: true });
  await fs.mkdir(paths.extensionsDir, { recursive: true });
  return paths;
}
