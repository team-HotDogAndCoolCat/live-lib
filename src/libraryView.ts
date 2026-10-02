import { DEFAULT_REGISTRY } from "./npmrc";
import type { LibraryInfo } from "./types";
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
  tooltip: string;
  /** vscode.ThemeIcon id */
  icon: string;
  contextValue: LibraryContextValue;
}

/**
 * 트리에 표시할 라이브러리 한 줄의 문구, 툴팁, 아이콘, 버튼 종류를 정한다.
 * 현재 버전은 실제 설치된 버전을 우선으로 하고, 없으면 package.json 범위로 판단한다.
 */
export function buildLibraryView(
  lib: Pick<
    LibraryInfo,
    | "name"
    | "version"
    | "scope"
    | "installedVersion"
    | "latestVersion"
    | "usage"
    | "registry"
    | "latestLookupFailed"
  >,
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
  const shownVersion = currentVersion ?? lib.version;

  let description: string;
  if (plan?.isMajor) {
    description = t("{0} → {1} (major)", shownVersion, plan.latest);
  } else if (outdated) {
    description = `${shownVersion} → ${lib.latestVersion}`;
  } else if (lib.usage === "unused") {
    description = t("{0} (unused)", shownVersion);
  } else if (lib.usage === "unverified") {
    description = t("{0} (not detected)", shownVersion);
  } else {
    description = shownVersion;
  }

  const tooltipParts = [
    `${lib.name} (${lib.scope})`,
    lib.installedVersion
      ? t("Installed: {0}", lib.installedVersion)
      : t("Not installed"),
    t("Declared: {0}", lib.version),
  ];
  if (lib.latestVersion) {
    tooltipParts.push(t("Latest: {0}", lib.latestVersion));
  } else if (lib.latestLookupFailed) {
    tooltipParts.push(t("Latest: not available (registry lookup failed)"));
  }
  if (lib.registry && lib.registry !== DEFAULT_REGISTRY) {
    tooltipParts.push(t("Registry: {0}", lib.registry));
  }
  if (plan?.isMajor) {
    tooltipParts.push(
      t("Major update: outside {0}, may include breaking changes", lib.version)
    );
    if (plan.wanted) {
      tooltipParts.push(t("Latest within range: {0}", plan.wanted));
    }
  }
  if (lib.usage === "unused") {
    tooltipParts.push(t("Unused: not imported anywhere in the project"));
  } else if (lib.usage === "unverified") {
    tooltipParts.push(
      t("Usage not detected: it may still be used by CI, your editor or other tools")
    );
  }

  let icon: string;
  let contextValue: LibraryContextValue;
  if (outdated) {
    icon = plan?.isMajor ? "warning" : "arrow-circle-up";
    contextValue = "libraryItemOutdated";
  } else if (lib.usage === "unused") {
    icon = "circle-slash";
    contextValue = "libraryItemUnused";
  } else if (lib.usage === "unverified") {
    icon = "question";
    contextValue = "libraryItem";
  } else {
    icon = lib.scope === "devDependencies" ? "beaker" : "package";
    contextValue = "libraryItem";
  }

  return {
    description,
    tooltip: tooltipParts.join(" • "),
    icon,
    contextValue,
  };
}
