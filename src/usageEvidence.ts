import * as path from "path";
import { promises as fs } from "fs";
import { createLimiter } from "./concurrency";
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
const MAX_CONCURRENT_READS = 32;
const readLimit = createLimiter(MAX_CONCURRENT_READS);

interface CachedImports {
  mtimeMs: number;
  size: number;
  packages: string[];
}

/** 파일 경로 → 마지막으로 읽었을 때의 import 결과 */
export type ImportCache = Map<string, CachedImports>;

/**
 * 파일 하나의 import를 읽는다. 수정 시각과 크기가 그대로면 이전 결과를 쓴다.
 */
async function readImports(
  file: string,
  cache: ImportCache | undefined
): Promise<string[]> {
  try {
    const stat = await fs.stat(file);
    const cached = cache?.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.packages;
    }
    const packages = [
      ...extractImportedPackages(await fs.readFile(file, "utf8")),
    ];
    cache?.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, packages });
    return packages;
  } catch {
    return [];
  }
}

/**
 * 프로젝트 하나에서 라이브러리 사용 근거를 모은다.
 * - 소스 파일의 import/require
 * - package.json scripts에서 실행하는 명령
 * - 루트의 설정 파일 이름과, 설정 파일 안에 문자열로 적힌 패키지 이름
 * - package.json 최상위의 도구 설정 키
 *
 * 모노레포 하위 패키지면 projectRoot는 그 패키지 폴더이고, installRoot는 설치된 bin을
 * 찾을 때 올라갈 모노레포 루트다.
 */
export async function collectUsageEvidence(
  projectRoot: string,
  pkg: Record<string, unknown>,
  libraryNames: string[],
  sourceFiles: string[],
  importCache?: ImportCache,
  installRoot?: string
): Promise<UsageEvidence> {
  const imported = new Set<string>();
  const results = await Promise.all(
    sourceFiles.map((file) => readLimit(() => readImports(file, importCache)))
  );
  for (const packages of results) {
    for (const name of packages) {
      imported.add(name);
    }
  }
  // 지워진 파일의 결과가 계속 쌓이지 않게 정리한다.
  // 캐시는 여러 패키지가 함께 쓰므로 이번에 훑은 폴더 안의 항목만 정리한다.
  if (importCache) {
    const current = new Set(sourceFiles);
    const scope = projectRoot.endsWith(path.sep)
      ? projectRoot
      : projectRoot + path.sep;
    for (const file of importCache.keys()) {
      if (file.startsWith(scope) && !current.has(file)) {
        importCache.delete(file);
      }
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
          [name, await readInstalledBins(projectRoot, name, installRoot)] as const
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
