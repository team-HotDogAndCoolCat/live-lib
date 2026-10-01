import { builtinModules } from "module";

export type LibraryUsage = "used" | "unused" | "unverified";

// from "x" / import "x" / import("x") / require("x") / require.resolve("x")
const SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire(?:\.resolve)?\s*\(\s*)(['"`])([^'"`\s]+)\1/g;

const BUILTIN_MODULES = new Set(builtinModules);

/**
 * import 경로에서 패키지 이름을 뽑는다. 상대 경로나 절대 경로면 undefined.
 * 예: "lodash/debounce" → "lodash", "@babel/core/lib/x" → "@babel/core", "node:fs" → "node:fs"
 */
export function toPackageName(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return undefined;
  }
  if (specifier.startsWith("node:")) {
    return specifier;
  }
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
  }
  return parts[0];
}

/**
 * 소스 코드 한 파일에서 import/require로 참조하는 패키지 이름을 모두 찾는다.
 */
export function extractImportedPackages(content: string): Set<string> {
  const packages = new Set<string>();
  for (const match of content.matchAll(SPECIFIER_PATTERN)) {
    const name = toPackageName(match[2]);
    if (name) {
      packages.add(name);
    }
  }
  return packages;
}

/**
 * 소스 코드 한 파일에서 import/require로 참조하는 라이브러리 이름을 찾는다.
 */
export function findImportedLibraries(
  content: string,
  libraryNames: Iterable<string>
): string[] {
  const imported = extractImportedPackages(content);
  return [...libraryNames].filter((name) => imported.has(name));
}

export function isNodeBuiltin(packageName: string) {
  return (
    packageName.startsWith("node:") || BUILTIN_MODULES.has(packageName)
  );
}

/**
 * @types 패키지가 타입을 제공하는 대상 패키지 이름.
 * 예: "@types/react" → "react", "@types/babel__core" → "@babel/core"
 */
export function typesTarget(name: string): string | undefined {
  if (!name.startsWith("@types/")) {
    return undefined;
  }
  const target = name.slice("@types/".length);
  return target.includes("__") ? `@${target.replace("__", "/")}` : target;
}

/**
 * package.json scripts에서 실행하는 명령 이름(bin)을 찾는다.
 * binsByPackage: 패키지 이름 → 그 패키지가 제공하는 실행 파일 이름들
 */
export function findUsedByScripts(
  scripts: Record<string, unknown> | undefined,
  binsByPackage: Map<string, string[]>
): Set<string> {
  const tokens = new Set<string>();
  for (const script of Object.values(scripts ?? {})) {
    if (typeof script !== "string") {
      continue;
    }
    for (const token of script.split(/[\s;&|()<>"'=]+/)) {
      if (token) {
        // ./node_modules/.bin/eslint 같은 경로는 마지막 이름만 본다
        tokens.add(token.split("/").pop() ?? token);
        tokens.add(token);
      }
    }
  }

  const used = new Set<string>();
  for (const [name, bins] of binsByPackage) {
    // npx/pnpm dlx 처럼 패키지 이름을 직접 쓰는 경우도 포함
    if (tokens.has(name) || bins.some((bin) => tokens.has(bin))) {
      used.add(name);
    }
  }
  return used;
}

/**
 * 프로젝트 루트의 설정 파일 이름으로 쓰이는 도구를 찾는다.
 * 예: eslint.config.mjs → eslint, .prettierrc → prettier, tsconfig.json → typescript
 */
export function findUsedByConfigFileNames(
  fileNames: string[],
  libraryNames: Iterable<string>
): Set<string> {
  const used = new Set<string>();
  const lowerFiles = fileNames.map((f) => f.toLowerCase());

  for (const name of libraryNames) {
    if (name === "typescript" && lowerFiles.some((f) => /^tsconfig.*\.json$/.test(f))) {
      used.add(name);
      continue;
    }
    for (const stem of configStems(name)) {
      const matches = lowerFiles.some(
        (f) =>
          f.startsWith(`${stem}.config.`) ||
          f === `.${stem}rc` ||
          f.startsWith(`.${stem}rc.`) ||
          f === `${stem}rc` ||
          f.startsWith(`${stem}rc.`)
      );
      if (matches) {
        used.add(name);
        break;
      }
    }
  }
  return used;
}

function configStems(name: string): string[] {
  const stems = new Set<string>();
  const [scope, base] = name.startsWith("@")
    ? name.slice(1).split("/")
    : [undefined, name];
  for (const candidate of [base, scope]) {
    if (!candidate || candidate === "types") {
      continue;
    }
    stems.add(candidate);
    // tailwindcss → tailwind, postcss는 그대로
    if (candidate.endsWith("css") && candidate.length > "css".length + 3) {
      stems.add(candidate.slice(0, -"css".length));
    }
  }
  return [...stems];
}

/**
 * 설정 파일 안에 문자열로 적힌 패키지 이름을 찾는다.
 * 예: webpack.config.js의 loader: "ts-loader"
 */
export function findQuotedReferences(
  content: string,
  libraryNames: Iterable<string>
): Set<string> {
  const used = new Set<string>();
  for (const name of libraryNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`['"\`]${escaped}(?:/[^'"\`]*)?['"\`]`).test(content)) {
      used.add(name);
    }
  }
  return used;
}

/**
 * package.json 최상위에 도구 설정 키가 있으면 사용 중으로 본다.
 * 예: "eslintConfig", "prettier", "jest", "babel"
 */
export function findUsedByPackageJsonKeys(
  pkg: Record<string, unknown>,
  libraryNames: Iterable<string>
): Set<string> {
  const used = new Set<string>();
  const keys = new Set(Object.keys(pkg));
  for (const name of libraryNames) {
    if (keys.has(name) || keys.has(`${name}Config`)) {
      used.add(name);
    }
  }
  return used;
}

export interface UsageEvidence {
  /** 소스 코드에서 import/require한 패키지 (Node 내장 모듈 포함) */
  imported: Set<string>;
  /** scripts, 설정 파일 등 소스 코드 밖에서 쓰이는 것이 확인된 패키지 */
  referenced: Set<string>;
}

/**
 * 라이브러리 하나의 사용 여부를 판단한다.
 * dependencies는 코드에서 import되어야 하므로 근거가 없으면 unused,
 * devDependencies는 CI나 에디터 등 보이지 않는 곳에서 쓰일 수 있어 unverified로 둔다.
 */
export function classifyUsage(
  lib: { name: string; scope: "dependencies" | "devDependencies" },
  evidence: UsageEvidence
): LibraryUsage {
  if (evidence.imported.has(lib.name) || evidence.referenced.has(lib.name)) {
    return "used";
  }

  const target = typesTarget(lib.name);
  if (target) {
    if (evidence.imported.has(target) || evidence.referenced.has(target)) {
      return "used";
    }
    if (target === "node" && [...evidence.imported].some(isNodeBuiltin)) {
      return "used";
    }
  }

  return lib.scope === "dependencies" ? "unused" : "unverified";
}
