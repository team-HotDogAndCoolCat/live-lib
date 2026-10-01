export function compareSemver(a: string, b: string) {
  const parse = (version: string) =>
    version.split(".").map((part) => Number(part.replace(/\D+/g, "")) || 0);

  const aParts = parse(a);
  const bParts = parse(b);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const aValue = aParts[i] ?? 0;
    const bValue = bParts[i] ?? 0;

    if (aValue > bValue) {
      return 1;
    }
    if (aValue < bValue) {
      return -1;
    }
  }

  return a.localeCompare(b);
}

export function normalizeVersion(version: string | undefined) {
  if (!version) {
    return undefined;
  }
  const trimmed = version.trim();
  const cleaned = trimmed.replace(/^[~^><=*\s]+/, "");
  return cleaned || undefined;
}

// 터미널로 전달되는 값은 셸 메타문자가 없도록 npm 이름 규칙 기준으로 제한한다.
const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

export function isSafePackageName(name: string) {
  return name.length <= 214 && PACKAGE_NAME_PATTERN.test(name);
}

export function isSafeVersion(version: string) {
  return VERSION_PATTERN.test(version);
}
