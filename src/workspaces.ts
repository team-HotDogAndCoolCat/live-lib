import * as path from "path";
import { promises as fs } from "fs";

/** 모노레포에서 찾은 하위 패키지 하나 */
export interface WorkspacePackage {
  /** 패키지 폴더의 절대 경로 */
  dir: string;
  /** 루트 기준 상대 경로. 운영체제와 상관없이 / 로 구분한다 (예: apps/web) */
  relativePath: string;
  /** 패키지 package.json의 name */
  name?: string;
}

export interface WorkspacePatterns {
  patterns: string[];
  /** 어디서 읽었는지 (pnpm-workspace.yaml 또는 package.json) */
  source: "pnpm-workspace.yaml" | "package.json";
}

// ** 로 내려갈 수 있는 최대 깊이. 잘못된 패턴이 저장소 전체를 훑지 않도록 막는다.
const MAX_DEPTH = 8;

/**
 * package.json의 workspaces 필드에서 패턴 목록을 읽는다.
 * npm·yarn·bun의 배열 형식과 yarn classic의 { packages: [...] } 형식을 모두 받는다.
 */
export function parseWorkspacesField(value: unknown): string[] | undefined {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? (value as { packages?: unknown }).packages
      : undefined;

  if (!Array.isArray(list)) {
    return undefined;
  }
  return list.filter((item): item is string => typeof item === "string");
}

/**
 * pnpm-workspace.yaml에서 packages 목록만 읽는다.
 * catalog 같은 다른 키는 쓰지 않으므로 YAML 전체를 해석하지 않는다.
 */
export function parsePnpmWorkspaceYaml(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages\s*:/.test(line));
  if (start === -1) {
    return [];
  }

  // packages: ["apps/*", "packages/*"] 처럼 한 줄로 쓴 경우
  const inline = stripComment(lines[start].replace(/^packages\s*:/, "")).trim();
  if (inline.startsWith("[")) {
    return inline
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map(unquote)
      .filter(Boolean);
  }

  const patterns: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (!item) {
      // 들여쓰기 없는 줄은 다음 최상위 키다
      if (/^\S/.test(line)) {
        break;
      }
      continue;
    }
    const value = unquote(item[1]);
    if (value) {
      patterns.push(value);
    }
  }
  return patterns;
}

function stripComment(text: string) {
  return text.replace(/\s+#.*$/, "");
}

function unquote(raw: string) {
  const text = raw.trim();
  const quoted = /^(["'])(.*?)\1/.exec(text);
  return quoted ? quoted[2] : stripComment(text).trim();
}

/**
 * 워크스페이스 패턴을 읽는다. pnpm은 pnpm-workspace.yaml만 보므로 그 파일이 있으면 우선한다.
 * 모노레포가 아니면 undefined를 돌려준다.
 */
export async function readWorkspacePatterns(
  root: string,
  pkg: Record<string, unknown>
): Promise<WorkspacePatterns | undefined> {
  const yaml = await fs
    .readFile(path.join(root, "pnpm-workspace.yaml"), "utf8")
    .catch(() => undefined);
  if (yaml !== undefined) {
    const patterns = parsePnpmWorkspaceYaml(yaml);
    return patterns.length
      ? { patterns, source: "pnpm-workspace.yaml" }
      : undefined;
  }

  const patterns = parseWorkspacesField(pkg.workspaces);
  return patterns?.length ? { patterns, source: "package.json" } : undefined;
}

function normalizePattern(pattern: string) {
  return pattern
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
}

function hasGlob(segment: string) {
  return /[*?]/.test(segment);
}

function segmentSource(segment: string) {
  return segment
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
}

/** 패턴 전체를 상대 경로에 맞춰 보는 정규식. ** 는 0개 이상의 폴더에 맞는다. */
export function globToRegExp(pattern: string): RegExp {
  const segments = normalizePattern(pattern).split("/");
  let source = "";
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    if (segment === "**") {
      source = last
        ? `${source.replace(/\/$/, "")}(?:/.*)?`
        : `${source}(?:[^/]+/)*`;
    } else {
      source += segmentSource(segment) + (last ? "" : "/");
    }
  });
  return new RegExp(`^${source}$`);
}

async function listSubdirectories(dir: string): Promise<string[]> {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        !entry.name.startsWith(".")
    )
    .map((entry) => entry.name);
}

async function expand(
  root: string,
  relative: string[],
  segments: string[],
  found: Set<string>
): Promise<void> {
  if (!segments.length) {
    found.add(relative.join("/"));
    return;
  }
  if (relative.length > MAX_DEPTH) {
    return;
  }

  const [segment, ...rest] = segments;
  const dir = path.join(root, ...relative);

  if (segment === "**") {
    await expand(root, relative, rest, found);
    for (const sub of await listSubdirectories(dir)) {
      await expand(root, [...relative, sub], segments, found);
    }
    return;
  }

  if (hasGlob(segment)) {
    const matcher = new RegExp(`^${segmentSource(segment)}$`);
    for (const sub of await listSubdirectories(dir)) {
      if (matcher.test(sub)) {
        await expand(root, [...relative, sub], rest, found);
      }
    }
    return;
  }

  if (segment === ".." || segment === "node_modules") {
    return;
  }
  await expand(root, [...relative, segment], rest, found);
}

/**
 * 워크스페이스 패턴을 실제 폴더로 펼친다.
 * package.json이 있는 폴더만 패키지로 보고, ! 로 시작하는 패턴에 맞는 폴더와 루트 자신은 뺀다.
 */
export async function findWorkspacePackages(
  root: string,
  patterns: string[]
): Promise<WorkspacePackage[]> {
  const include = patterns
    .filter((pattern) => !pattern.trim().startsWith("!"))
    .map(normalizePattern);
  const exclude = patterns
    .filter((pattern) => pattern.trim().startsWith("!"))
    .map((pattern) => globToRegExp(pattern.trim().slice(1)));

  const found = new Set<string>();
  for (const pattern of include) {
    await expand(
      root,
      [],
      pattern.split("/").filter((segment) => segment && segment !== "."),
      found
    );
  }

  const candidates = [...found]
    .filter((relative) => relative !== "")
    .filter((relative) => !exclude.some((regex) => regex.test(relative)))
    .sort();

  const packages = await Promise.all(
    candidates.map(
      async (relativePath): Promise<WorkspacePackage | undefined> => {
        const dir = path.join(root, ...relativePath.split("/"));
        try {
          const manifest = JSON.parse(
            await fs.readFile(path.join(dir, "package.json"), "utf8")
          );
          const name =
            typeof manifest?.name === "string" ? manifest.name : undefined;
          return { dir, relativePath, name };
        } catch {
          return undefined;
        }
      }
    )
  );
  return packages.filter((pkg): pkg is WorkspacePackage => pkg !== undefined);
}

/**
 * 루트 폴더가 모노레포면 하위 패키지 목록을, 아니면 빈 배열을 돌려준다.
 */
export async function discoverWorkspacePackages(
  root: string,
  pkg: Record<string, unknown>
): Promise<WorkspacePackage[]> {
  const config = await readWorkspacePatterns(root, pkg);
  return config ? findWorkspacePackages(root, config.patterns) : [];
}
