import * as path from "path";
import { promises as fs } from "fs";

/**
 * node_modules를 찾아볼 폴더 목록. projectRoot에서 시작해 stopAt까지 올라간다.
 * 모노레포에서 npm·yarn은 하위 패키지의 의존성을 루트 node_modules에 모아 설치하기 때문이다.
 * stopAt 밖으로는 올라가지 않아 홈 폴더 같은 상관없는 node_modules를 읽지 않는다.
 */
export function nodeModulesSearchDirs(
  projectRoot: string,
  stopAt: string = projectRoot
): string[] {
  const dirs = [projectRoot];
  let dir = projectRoot;
  for (;;) {
    const relative = path.relative(stopAt, dir);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return dirs;
    }
    dir = path.dirname(dir);
    dirs.push(dir);
  }
}

async function readInstalledManifest(
  projectRoot: string,
  packageName: string,
  stopAt?: string
): Promise<Record<string, unknown> | undefined> {
  for (const dir of nodeModulesSearchDirs(projectRoot, stopAt)) {
    const manifestPath = path.join(
      dir,
      "node_modules",
      ...packageName.split("/"),
      "package.json"
    );
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      return manifest && typeof manifest === "object" ? manifest : undefined;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * node_modules에서 실제 설치된 패키지 버전을 읽는다.
 * projectRoot에 없으면 stopAt(모노레포 루트)까지 올라가며 찾는다.
 * 설치되지 않았거나 읽을 수 없으면 undefined를 돌려준다.
 */
export async function readInstalledVersion(
  projectRoot: string,
  packageName: string,
  stopAt?: string
): Promise<string | undefined> {
  const manifest = await readInstalledManifest(projectRoot, packageName, stopAt);
  return typeof manifest?.version === "string" ? manifest.version : undefined;
}

/**
 * 패키지가 제공하는 실행 파일(bin) 이름을 읽는다.
 * 찾는 위치는 readInstalledVersion과 같다.
 * 설치되지 않아 알 수 없으면 npm 관례대로 패키지 이름(scope 제외)을 실행 파일 이름으로 본다.
 * 설치됐는데 bin이 없으면 빈 배열이다.
 * 예: typescript → ["tsc", "tsserver"], @vscode/test-cli → ["vscode-test"]
 */
export async function readInstalledBins(
  projectRoot: string,
  packageName: string,
  stopAt?: string
): Promise<string[]> {
  const unscoped = packageName.split("/").pop() ?? packageName;
  const manifest = await readInstalledManifest(projectRoot, packageName, stopAt);

  if (!manifest) {
    return packageName.startsWith("@types/") ? [] : [unscoped];
  }

  const bin = manifest.bin;
  if (typeof bin === "string") {
    return [unscoped];
  }
  if (bin && typeof bin === "object") {
    return Object.keys(bin);
  }
  return [];
}
