import * as path from "path";
import { promises as fs } from "fs";

/**
 * 프로젝트 루트의 node_modules에서 실제 설치된 패키지 버전을 읽는다.
 * 설치되지 않았거나 읽을 수 없으면 undefined를 돌려준다.
 */
export async function readInstalledVersion(
  projectRoot: string,
  packageName: string
): Promise<string | undefined> {
  const manifestPath = path.join(
    projectRoot,
    "node_modules",
    ...packageName.split("/"),
    "package.json"
  );

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return typeof manifest?.version === "string" ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}
