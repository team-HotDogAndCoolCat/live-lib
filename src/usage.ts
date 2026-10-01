/**
 * 소스 코드 한 파일에서 import/require로 참조하는 라이브러리 이름을 찾는다.
 */
export function findImportedLibraries(
  content: string,
  libraryNames: Iterable<string>
): string[] {
  const found: string[] = [];

  for (const libName of libraryNames) {
    const escapedName = libName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `(?:import|require|from)\\s+['"]${escapedName}(?:/|['"])`,
        "g"
      ),
      new RegExp(`(?:import|require|from)\\s+['"]${escapedName}['"]`, "g"),
      new RegExp(`require\\(['"]${escapedName}(?:/|['"])\\)`, "g"),
    ];

    if (patterns.some((pattern) => pattern.test(content))) {
      found.push(libName);
    }
  }

  return found;
}
