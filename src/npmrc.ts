import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";

export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

/** .npmrc에서 Live Lib이 쓰는 값. 인증 토큰 같은 다른 키는 읽지 않는다. */
export interface RegistryConfig {
  registry?: string;
  /** "@scope" → 레지스트리 주소 */
  scopes: Record<string, string>;
}

/**
 * .npmrc 내용을 읽어 registry와 @scope:registry만 꺼낸다.
 * ${VAR} 형태의 환경 변수를 치환하고, 치환할 수 없는 값은 버린다.
 */
export function parseNpmrc(
  text: string,
  env: NodeJS.ProcessEnv = process.env
): RegistryConfig {
  const config: RegistryConfig = { scopes: {} };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = substituteEnv(stripQuotes(line.slice(eq + 1).trim()), env);
    if (value === undefined) {
      continue;
    }

    if (key === "registry") {
      config.registry = value;
    } else {
      const scope = /^(@[^:]+):registry$/.exec(key)?.[1];
      if (scope) {
        config.scopes[scope] = value;
      }
    }
  }

  return config;
}

function stripQuotes(value: string) {
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function substituteEnv(value: string, env: NodeJS.ProcessEnv) {
  let missing = false;
  const result = value.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    const replacement = env[name];
    if (replacement === undefined) {
      missing = true;
      return "";
    }
    return replacement;
  });
  return missing ? undefined : result;
}

/**
 * 앞의 설정을 뒤의 설정으로 덮어쓴다. (사용자 홈 → 저장소 루트 → 프로젝트 순)
 */
export function mergeRegistryConfigs(configs: RegistryConfig[]): RegistryConfig {
  return configs.reduce<RegistryConfig>(
    (merged, next) => ({
      registry: next.registry ?? merged.registry,
      scopes: { ...merged.scopes, ...next.scopes },
    }),
    { scopes: {} }
  );
}

/**
 * 사용자 홈과 프로젝트(모노레포라면 저장소 루트까지)의 .npmrc를 읽어 합친다.
 * 프로젝트에 가까운 파일이 우선한다.
 */
export async function readRegistryConfig(
  projectRoot: string,
  homeDir: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env
): Promise<RegistryConfig> {
  const projectFiles: string[] = [];
  let dir = projectRoot;
  for (;;) {
    projectFiles.unshift(path.join(dir, ".npmrc"));
    const parent = path.dirname(dir);
    const isRepoRoot = await fs
      .stat(path.join(dir, ".git"))
      .then(() => true, () => false);
    if (isRepoRoot || parent === dir) {
      break;
    }
    dir = parent;
  }

  const files = [path.join(homeDir, ".npmrc"), ...projectFiles];
  const configs = await Promise.all(
    [...new Set(files)].map(async (file) =>
      parseNpmrc(await fs.readFile(file, "utf8").catch(() => ""), env)
    )
  );
  return mergeRegistryConfigs(configs);
}

/**
 * 패키지를 조회할 레지스트리 주소. @scope:registry → registry → npm 공식 레지스트리 순.
 * http(s)가 아닌 값은 무시한다.
 */
export function resolveRegistry(config: RegistryConfig, packageName: string): string {
  const scope = packageName.startsWith("@") ? packageName.split("/")[0] : undefined;
  const candidates = [scope && config.scopes[scope], config.registry];
  for (const candidate of candidates) {
    const normalized = candidate && normalizeRegistry(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return DEFAULT_REGISTRY;
}

function normalizeRegistry(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

/**
 * 레지스트리에서 조회할 수 있는 버전 표기인지. workspace:, file:, git 주소처럼
 * 레지스트리에 없는 패키지는 조회하지 않는다.
 */
export function isRegistrySpecifier(spec: string): boolean {
  const value = spec.trim();
  if (/^(workspace|file|link|portal|git|git\+[a-z]+|github|gitlab|bitbucket|https?|npm):/i.test(value)) {
    return false;
  }
  // user/repo 형태의 GitHub 줄임 표기
  if (/^[^@\s]+\/[^\s]+$/.test(value)) {
    return false;
  }
  return true;
}
