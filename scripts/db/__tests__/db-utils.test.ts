import * as path from 'path';
import {
  assertLocalEnvironment,
  resolveDockerHost,
  buildProcessEnv,
  defaultCommandExecutor,
} from '../db-utils';

describe('db-utils: assertLocalEnvironment', () => {
  it('allows local loopback URLs', () => {
    expect(() => assertLocalEnvironment('http://127.0.0.1:54321')).not.toThrow();
    expect(() => assertLocalEnvironment('http://localhost:54321')).not.toThrow();
    expect(() => assertLocalEnvironment('http://0.0.0.0:54321')).not.toThrow();
  });

  it('rejects remote URLs with safety exception', () => {
    expect(() =>
      assertLocalEnvironment('https://jfsxclrdxmvftxacjuqf.supabase.co')
    ).toThrow(/Safety Guardrail Triggered/);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertLocalEnvironment('not-a-valid-url')).toThrow(/Invalid Supabase URL/);
  });
});

describe('db-utils: resolveDockerHost', () => {
  const originalDockerHost = process.env.DOCKER_HOST;

  afterEach(() => {
    if (originalDockerHost !== undefined) {
      process.env.DOCKER_HOST = originalDockerHost;
    } else {
      delete process.env.DOCKER_HOST;
    }
  });

  it('respects explicitly configured DOCKER_HOST', () => {
    process.env.DOCKER_HOST = 'unix:///custom/docker.sock';
    expect(resolveDockerHost()).toBe('unix:///custom/docker.sock');
  });

  it('detects or returns fallback when DOCKER_HOST is unset', () => {
    delete process.env.DOCKER_HOST;
    const host = resolveDockerHost();
    expect(host === undefined || host.startsWith('unix://')).toBe(true);
  });
});

describe('db-utils: buildProcessEnv', () => {
  it('prepends scripts/bin to PATH and retains environment variables', () => {
    const env = buildProcessEnv({ CUSTOM_VAR: 'test-value', PATH: '/usr/bin' });
    const expectedBin = path.resolve(process.cwd(), 'scripts/bin');

    expect(env.CUSTOM_VAR).toBe('test-value');
    expect(env.PATH?.startsWith(`${expectedBin}:/usr/bin`)).toBe(true);
  });

  it('handles empty or undefined initial PATH', () => {
    const env = buildProcessEnv({ PATH: '' });
    const expectedBin = path.resolve(process.cwd(), 'scripts/bin');
    expect(env.PATH).toBe(expectedBin);
  });
});

describe('db-utils: defaultCommandExecutor', () => {
  it('executes a basic shell command synchronously and returns output', () => {
    const output = defaultCommandExecutor('node -e "process.stdout.write(\'hello-test\')"');
    expect(output).toBe('hello-test');
  });
});
