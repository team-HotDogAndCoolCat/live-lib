/**
 * 사용 여부 스캔에서 제외할 폴더. 빌드 산출물이나 캐시라 소스 코드가 아니고,
 * 번들 안의 코드가 import로 잡혀 사용 여부 판정을 흐리기도 한다.
 */
export const DEFAULT_EXCLUDED_DIRS = [
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".vercel",
  ".turbo",
  ".cache",
  "storybook-static",
  ".vscode-test",
];

/**
 * .gitignore에서 폴더 이름처럼 단순한 항목만 제외 패턴으로 바꾼다.
 * 와일드카드나 부정(!)이 들어간 규칙은 정확히 해석하기 어려워 건너뛴다.
 * 예: "dist" → "**\/dist/**", "/build/" → "build/**"
 */
export function gitignoreToExcludeGlobs(gitignore: string): string[] {
  const globs: string[] = [];
  for (const raw of gitignore.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) {
      continue;
    }
    if (/[*?[\]{},]/.test(line)) {
      continue;
    }

    const anchored = line.startsWith("/");
    const name = line.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!name) {
      continue;
    }
    // 중간에 /가 있으면 .gitignore에서도 루트 기준 경로다
    globs.push(anchored || name.includes("/") ? `${name}/**` : `**/${name}/**`);
  }
  return globs;
}

/**
 * vscode.workspace.findFiles의 exclude 인자로 쓸 glob 하나를 만든다.
 * findFiles에 exclude를 넘기면 files.exclude 설정이 적용되지 않으므로 직접 합친다.
 */
export function buildExcludeGlob(options: {
  gitignore?: string;
  filesExclude?: Record<string, unknown>;
}): string {
  const globs = new Set<string>(
    DEFAULT_EXCLUDED_DIRS.map((dir) => `**/${dir}/**`)
  );

  for (const glob of gitignoreToExcludeGlobs(options.gitignore ?? "")) {
    globs.add(glob);
  }

  for (const [pattern, enabled] of Object.entries(options.filesExclude ?? {})) {
    // { "when": ... } 같은 조건부 규칙과, 중괄호 안에 넣을 수 없는 패턴은 건너뛴다
    if (enabled === true && !/[{},]/.test(pattern)) {
      globs.add(pattern);
    }
  }

  return `{${[...globs].join(",")}}`;
}
