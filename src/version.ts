import * as semver from "semver";

/**
 * 비교에 쓸 현재 버전을 정한다.
 * 설치된 버전이 있으면 그 값을, 없으면 package.json 범위가 허용하는 최소 버전을 쓴다.
 * workspace:, file:, git URL, 태그 이름("latest") 처럼 버전 범위가 아니거나,
 * "*"처럼 아무 버전이나 허용하는 범위는 비교할 수 없으므로 undefined를 돌려준다.
 */
export function resolveCurrentVersion(
  declaredRange: string,
  installedVersion?: string
): string | undefined {
  const installed = installedVersion && semver.valid(installedVersion);
  if (installed) {
    return installed;
  }

  const range = semver.validRange(declaredRange);
  if (!range || range === "*") {
    return undefined;
  }

  return semver.minVersion(range)?.version;
}

export function isOutdated(
  currentVersion: string | undefined,
  latestVersion: string | undefined
) {
  if (!currentVersion || !latestVersion || !semver.valid(latestVersion)) {
    return false;
  }
  return semver.gt(latestVersion, currentVersion);
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
