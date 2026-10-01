import type { LibraryInfo } from "./types";
import { planUpdate, resolveCurrentVersion } from "./version";

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
    "name" | "version" | "scope" | "installedVersion" | "latestVersion" | "usage"
  >,
  versions?: string[]
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
    description = `${shownVersion} → ${plan.latest} (major)`;
  } else if (outdated) {
    description = `${shownVersion} → ${lib.latestVersion}`;
  } else if (lib.usage === "unused") {
    description = `${shownVersion} (unused)`;
  } else if (lib.usage === "unverified") {
    description = `${shownVersion} (not detected)`;
  } else {
    description = shownVersion;
  }

  const tooltipParts = [
    `${lib.name} (${lib.scope})`,
    lib.installedVersion ? `Installed: ${lib.installedVersion}` : "Not installed",
    `Declared: ${lib.version}`,
  ];
  if (lib.latestVersion) {
    tooltipParts.push(`Latest: ${lib.latestVersion}`);
  }
  if (plan?.isMajor) {
    tooltipParts.push(
      `Major update: outside ${lib.version}, may include breaking changes`
    );
    if (plan.wanted) {
      tooltipParts.push(`Latest within range: ${plan.wanted}`);
    }
  }
  if (lib.usage === "unused") {
    tooltipParts.push("Unused: not imported anywhere in the project");
  } else if (lib.usage === "unverified") {
    tooltipParts.push(
      "Usage not detected: it may still be used by CI, your editor or other tools"
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
