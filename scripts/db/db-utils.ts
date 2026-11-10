/**
 * scripts/db/db-utils.ts
 *
 * Centralized CLI execution, environment resolution, and container socket helpers
 * shared across database verification and preflight scripts.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type EnvironmentVariables = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type CommandExecutor = (command: string, env?: EnvironmentVariables) => string;

/**
 * Validates that target host is local to prevent accidental execution against remote environments.
 * Complies with AGENTS.md Guardrail #1.
 */
export function assertLocalEnvironment(url: string): void {
  try {
    const parsed = new URL(url);
    const isLocal =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '0.0.0.0';

    if (!isLocal) {
      throw new Error(
        `Safety Guardrail Triggered: Target URL ${url} is not local. Execution against remote projects is strictly prohibited by AGENTS.md.`
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Safety Guardrail')) {
      throw err;
    }
    throw new Error(`Invalid Supabase URL: ${url}`);
  }
}

/**
 * Detects portable Docker / Podman socket location.
 * Respects explicit DOCKER_HOST if provided, falls back to user Podman socket
 * only if present on disk, or returns undefined for default Docker daemon.
 */
export function resolveDockerHost(): string | undefined {
  if (process.env.DOCKER_HOST) {
    return process.env.DOCKER_HOST;
  }
  const uid = process.getuid ? process.getuid() : 1000;
  const podmanSock = `/run/user/${uid}/podman/podman.sock`;
  if (fs.existsSync(podmanSock)) {
    return `unix://${podmanSock}`;
  }
  return undefined;
}

/**
 * Builds process environment with DOCKER_HOST and PATH prepended with scripts/bin.
 */
export function buildProcessEnv(baseEnv?: EnvironmentVariables): NodeJS.ProcessEnv {
  const dockerHost = resolveDockerHost();
  const binPath = path.resolve(process.cwd(), 'scripts/bin');
  const envObj = (baseEnv || process.env) as NodeJS.ProcessEnv;
  return {
    ...envObj,
    PATH: envObj.PATH ? `${binPath}:${envObj.PATH}` : binPath,
    ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}),
  };
}

/**
 * Default child_process execution engine.
 */
export const defaultCommandExecutor: CommandExecutor = (
  command: string,
  env?: EnvironmentVariables
): string => {
  return execSync(command, {
    env: (env || process.env) as NodeJS.ProcessEnv,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};
