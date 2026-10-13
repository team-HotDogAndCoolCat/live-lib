import { DEFAULT_REGISTRY } from "./npmrc";
import type { LibraryInfo, LibraryMetadata } from "./types";
import { planUpdate, resolveCurrentVersion } from "./version";

/** vscode.l10n.t와 같은 모양. {0}, {1} 자리에 값을 넣는다. */
export type Translate = (message: string, ...args: (string | number)[]) => string;

/** 번역 없이 영어 원문에 값만 채운다. 테스트와 기본값에 쓴다. */
export const english: Translate = (message, ...args) =>
  message.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)] ?? ""));

export type LibraryContextValue =
  | "libraryItem"
  | "libraryItemOutdated"
  | "libraryItemUnused";

export interface LibraryView {
  description: string;
  /** 툴팁의 첫 줄. 이름과 scope (예: react (dependencies)) */
  tooltipTitle: string;
  /** 툴팁 본문. 한 줄에 항목 하나 */
  tooltipLines: string[];
  /** 툴팁 전체를 줄바꿈으로 이은 일반 텍스트 */
  tooltip: string;
  /** vscode.ThemeIcon id */
  icon: string;
  contextValue: LibraryContextValue;
}

/**
 * 트리에 표시할 라이브러리 한 줄의 문구, 툴팁, 아이콘, 버튼 종류를 정한다.
 * 현재 버전은 실제 설치된 버전을 우선으로 하고, 없으면 package.json 범위로 판단한다.
 */
type LibraryViewInput = Pick<
  LibraryInfo,
  | "name"
  | "version"
  | "scope"
  | "installedVersion"
  | "latestVersion"
  | "usage"
  | "registry"
  | "latestLookupFailed"
>;

export function buildLibraryView(
  lib: LibraryViewInput,
  versions?: string[],
  t: Translate = english
): LibraryView {
  const currentVersion = resolveCurrentVersion(lib.version, lib.installedVersion);
  const plan = planUpdate({
    declaredRange: lib.version,
    currentVersion,
    latestVersion: lib.latestVersion,
    versions,
  });
  const outdated = !!plan;
  const unused = lib.usage === "unused";
  const shownVersion = currentVersion ?? lib.version;

  // 쓰지 않는 라이브러리는 업데이트보다 삭제가 먼저라 미사용 표시를 우선한다.
  // "not detected"는 실제로 쓰일 수 있어 업데이트 표시를 그대로 둔다.
  let description: string;
  if (unused) {
    description = t("{0} (unused)", shownVersion);
  } else if (plan?.isMajor) {
    description = t("{0} → {1} (major)", shownVersion, plan.latest);
  } else if (outdated) {
    description = `${shownVersion} → ${lib.latestVersion}`;
  } else if (lib.usage === "unverified") {
    description = t("{0} (not detected)", shownVersion);
  } else {
    description = shownVersion;
  }

  const tooltipLines = [
    lib.installedVersion
      ? t("Installed: {0}", lib.installedVersion)
      : t("Not installed"),
    t("Declared: {0}", lib.version),
  ];
  if (lib.latestVersion) {
    tooltipLines.push(t("Latest: {0}", lib.latestVersion));
  } else if (lib.latestLookupFailed) {
    tooltipLines.push(t("Latest: not available (registry lookup failed)"));
  }
  if (lib.registry && lib.registry !== DEFAULT_REGISTRY) {
    tooltipLines.push(t("Registry: {0}", lib.registry));
  }
  if (plan?.isMajor) {
    tooltipLines.push(
      t("Major update: outside {0}, may include breaking changes", lib.version)
    );
    if (plan.wanted) {
      tooltipLines.push(t("Latest within range: {0}", plan.wanted));
    }
  }
  if (lib.usage === "unused") {
    tooltipLines.push(t("Unused: not imported anywhere in the project"));
  } else if (lib.usage === "unverified") {
    tooltipLines.push(
      t("Usage not detected: it may still be used by CI, your editor or other tools")
    );
  }

  let icon: string;
  let contextValue: LibraryContextValue;
  if (outdated) {
    // 미사용이어도 업데이트 버튼은 남긴다
    icon = unused ? "circle-slash" : plan?.isMajor ? "warning" : "arrow-circle-up";
    contextValue = "libraryItemOutdated";
  } else if (unused) {
    icon = "circle-slash";
    contextValue = "libraryItemUnused";
  } else if (lib.usage === "unverified") {
    icon = "question";
    contextValue = "libraryItem";
  } else {
    icon = lib.scope === "devDependencies" ? "beaker" : "package";
    contextValue = "libraryItem";
  }

  const tooltipTitle = `${lib.name} (${lib.scope})`;
  return {
    description,
    tooltipTitle,
    tooltipLines,
    tooltip: [tooltipTitle, ...tooltipLines].join("\n"),
    icon,
    contextValue,
  };
}

export interface LibraryInfoMessage {
  /** 정보 창 제목. 이름과 현재 버전 */
  title: string;
  /** 정보 창 본문 */
  detail: string;
}

/**
 * 라이브러리 정보 창의 제목과 본문을 만든다.
 * 본문은 설명 → 버전·상태(툴팁과 같은 항목) → 홈페이지 순서다.
 */
export function buildLibraryInfoMessage(
  lib: LibraryViewInput,
  metadata: LibraryMetadata | null | undefined,
  t: Translate = english
): LibraryInfoMessage {
  // 정보 창을 열 때 새로 받은 최신 버전이 있으면 그것을 쓴다
  const view = buildLibraryView(
    { ...lib, latestVersion: metadata?.latestVersion ?? lib.latestVersion },
    undefined,
    t
  );
  // 설치되지 않았으면 설치된 것처럼 보이지 않도록 선언된 범위를 그대로 보여준다
  const titleVersion = lib.installedVersion ?? lib.version;

  const detail = [
    metadata?.description ?? t("No description available."),
    "",
    ...view.tooltipLines,
  ];
  if (metadata?.homepage) {
    detail.push(t("Homepage: {0}", metadata.homepage));
  }

  return {
    title: `${lib.name} ${titleVersion}`,
    detail: detail.join("\n"),
  };
}
