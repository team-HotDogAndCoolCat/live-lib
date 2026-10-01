import * as path from "path";
import { promises as fs } from "fs";
import { readInstalledBins } from "./installed";
import {
  extractImportedPackages,
  findQuotedReferences,
  findUsedByConfigFileNames,
  findUsedByPackageJsonKeys,
  findUsedByScripts,
  type UsageEvidence,
} from "./usage";

const CONFIG_FILE_PATTERN = /(\.config\.|^\..*rc$|^\..*rc\.|^tsconfig.*\.json$)/i;

/**
 * 프로젝트 하나에서 라이브러리 사용 근거를 모은다.
 * - 소스 파일의 import/require
 * - package.json scripts에서 실행하는 명령
 * - 루트의 설정 파일 이름과, 설정 파일 안에 문자열로 적힌 패키지 이름
 * - package.json 최상위의 도구 설정 키
 */
export async function collectUsageEvidence(
  projectRoot: string,
  pkg: Record<string, unknown>,
  libraryNames: string[],
  sourceFiles: string[]
): Promise<UsageEvidence> {
  const imported = new Set<string>();
  for (const file of sourceFiles) {
    try {
      const content = await fs.readFile(file, "utf8");
      for (const name of extractImportedPackages(content)) {
        imported.add(name);
      }
    } catch {
      continue;
    }
  }

  const referenced = new Set<string>();
  const add = (names: Iterable<string>) => {
    for (const name of names) {
      referenced.add(name);
    }
  };

  const binsByPackage = new Map(
    await Promise.all(
      libraryNames.map(
        async (name) =>
          [name, await readInstalledBins(projectRoot, name)] as const
      )
    )
  );
  add(
    findUsedByScripts(
      pkg.scripts as Record<string, unknown> | undefined,
      binsByPackage
    )
  );
  add(findUsedByPackageJsonKeys(pkg, libraryNames));

  const rootFiles = await fs.readdir(projectRoot).catch(() => [] as string[]);
  add(findUsedByConfigFileNames(rootFiles, libraryNames));

  for (const file of rootFiles.filter((f) => CONFIG_FILE_PATTERN.test(f))) {
    try {
      const content = await fs.readFile(path.join(projectRoot, file), "utf8");
      add(findQuotedReferences(content, libraryNames));
    } catch {
      continue;
    }
  }

  return { imported, referenced };
}
