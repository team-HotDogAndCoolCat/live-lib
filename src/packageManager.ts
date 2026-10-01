import * as path from "path";
import { promises as fs } from "fs";
import type { LibraryScope } from "./types";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface DetectedPackageManager {
  name: PackageManager;
  /** 어떤 근거로 판단했는지 (예: "packageManager field", "pnpm-lock.yaml", "default") */
  source: string;
}

const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

// lockfile이 여러 개면 위에 있는 것을 우선한다.
// package-lock.json은 다른 매니저 프로젝트에서 실수로 생기는 경우가 많아 마지막에 본다.
const LOCKFILES: [string, PackageManager][] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

/**
 * package.json의 packageManager 필드(예: "pnpm@9.1.0")에서 매니저 이름을 읽는다.
 */
export function parsePackageManagerField(
  value: unknown
): PackageManager | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const name = value.split("@")[0].trim();
  return PACKAGE_MANAGERS.find((pm) => pm === name);
}

/**
 * 파일 이름 목록에서 lockfile로 매니저를 고른다.
 */
export function pickByLockfile(
  fileNames: string[]
): { name: PackageManager; lockfile: string } | undefined {
  const files = new Set(fileNames);
  for (const [lockfile, name] of LOCKFILES) {
    if (files.has(lockfile)) {
      return { name, lockfile };
    }
  }
  return undefined;
}

/**
 * 프로젝트의 패키지 매니저를 감지한다.
 * 1. package.json의 packageManager 필드
 * 2. 프로젝트 루트의 lockfile
 * 3. 상위 폴더의 lockfile (모노레포에서 하위 패키지를 연 경우)
 * 4. 찾지 못하면 npm
 */
export async function detectPackageManager(
  projectRoot: string,
  pkg: Record<string, unknown>
): Promise<DetectedPackageManager> {
  const fromField = parsePackageManagerField(pkg.packageManager);
  if (fromField) {
    return { name: fromField, source: "packageManager field" };
  }

  let dir = projectRoot;
  for (;;) {
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const found = pickByLockfile(files);
    if (found) {
      const relative = path.relative(projectRoot, path.join(dir, found.lockfile));
      return { name: found.name, source: relative };
    }
    // 저장소 루트를 넘어서까지 찾지 않는다
    const parent = path.dirname(dir);
    if (files.includes(".git") || parent === dir) {
      break;
    }
    dir = parent;
  }

  return { name: "npm", source: "default" };
}

/**
 * 특정 버전으로 설치(업데이트)하는 명령. devDependencies는 위치가 바뀌지 않도록 dev 플래그를 붙인다.
 * 이름과 버전은 호출하는 쪽에서 isSafePackageName / isSafeVersion으로 검증해야 한다.
 */
export function buildInstallCommand(
  pm: PackageManager,
  name: string,
  version: string,
  scope: LibraryScope
) {
  const dev = scope === "devDependencies";
  const spec = `${name}@${version}`;
  switch (pm) {
    case "pnpm":
      return `pnpm add ${dev ? "--save-dev " : ""}${spec}`;
    case "yarn":
      return `yarn add ${dev ? "--dev " : ""}${spec}`;
    case "bun":
      return `bun add ${dev ? "--dev " : ""}${spec}`;
    default:
      return `npm install ${dev ? "--save-dev " : ""}${spec}`;
  }
}

export function buildRemoveCommand(pm: PackageManager, name: string) {
  switch (pm) {
    case "pnpm":
      return `pnpm remove ${name}`;
    case "yarn":
      return `yarn remove ${name}`;
    case "bun":
      return `bun remove ${name}`;
    default:
      return `npm uninstall ${name}`;
  }
}
