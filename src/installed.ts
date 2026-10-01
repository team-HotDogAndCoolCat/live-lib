import * as path from "path";
import { promises as fs } from "fs";

async function readInstalledManifest(
  projectRoot: string,
  packageName: string
): Promise<Record<string, unknown> | undefined> {
  const manifestPath = path.join(
    projectRoot,
    "node_modules",
    ...packageName.split("/"),
    "package.json"
  );

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return manifest && typeof manifest === "object" ? manifest : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 프로젝트 루트의 node_modules에서 실제 설치된 패키지 버전을 읽는다.
 * 설치되지 않았거나 읽을 수 없으면 undefined를 돌려준다.
 */
export async function readInstalledVersion(
  projectRoot: string,
  packageName: string
): Promise<string | undefined> {
  const manifest = await readInstalledManifest(projectRoot, packageName);
  return typeof manifest?.version === "string" ? manifest.version : undefined;
}

/**
 * 패키지가 제공하는 실행 파일(bin) 이름을 읽는다.
 * 설치되지 않아 알 수 없으면 npm 관례대로 패키지 이름(scope 제외)을 실행 파일 이름으로 본다.
 * 설치됐는데 bin이 없으면 빈 배열이다.
 * 예: typescript → ["tsc", "tsserver"], @vscode/test-cli → ["vscode-test"]
 */
export async function readInstalledBins(
  projectRoot: string,
  packageName: string
): Promise<string[]> {
  const unscoped = packageName.split("/").pop() ?? packageName;
  const manifest = await readInstalledManifest(projectRoot, packageName);

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
