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

export interface UpdatePlan {
  /** 레지스트리의 latest 버전 */
  latest: string;
  /** latest가 package.json 범위를 벗어나 호환되지 않는 변경이 있을 수 있는지 */
  isMajor: boolean;
  /** package.json 범위 안에서 가장 높은 버전. 현재보다 높고 latest와 다를 때만 있다 */
  wanted?: string;
}

/**
 * 업데이트 방법을 정한다.
 * major 판단은 package.json 범위를 기준으로 한다. ^0.2.0 → 0.3.0처럼 0.x의 minor 변경도
 * 범위를 벗어나면 major로 본다. 범위를 해석할 수 없으면 semver의 major 자리로 판단한다.
 */
export function planUpdate(input: {
  declaredRange: string;
  currentVersion: string | undefined;
  latestVersion: string | undefined;
  versions?: string[];
}): UpdatePlan | undefined {
  const { declaredRange, currentVersion, latestVersion } = input;
  if (!currentVersion || !isOutdated(currentVersion, latestVersion)) {
    return undefined;
  }
  const latest = latestVersion as string;

  const range = semver.validRange(declaredRange);
  const comparable = range && range !== "*" ? range : undefined;

  const isMajor = comparable
    ? !semver.satisfies(latest, comparable)
    : semver.major(latest) > semver.major(currentVersion) ||
      (semver.major(currentVersion) === 0 &&
        semver.minor(latest) > semver.minor(currentVersion));

  let wanted: string | undefined;
  if (isMajor && comparable && input.versions?.length) {
    const candidate = semver.maxSatisfying(input.versions, comparable);
    if (candidate && semver.gt(candidate, currentVersion)) {
      wanted = candidate;
    }
  }

  return { latest, isMajor, wanted };
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
