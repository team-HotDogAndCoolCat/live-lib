import type * as vscode from "vscode";
import type { LibraryInfo, LibraryScope } from "./types";

export function extractLibraries(
  pkg: Record<string, unknown>,
  folder: vscode.WorkspaceFolder,
  packageJsonPath: string
): LibraryInfo[] {
  const collect = (scope: LibraryScope) => {
    const group = pkg?.[scope];
    if (!group || typeof group !== "object") {
      return [];
    }
    return Object.entries(group).map(([name, version]) => ({
      name,
      version: String(version),
      scope,
      packageJsonPath,
      workspaceFolder: folder,
    }));
  };

  return [...collect("dependencies"), ...collect("devDependencies")];
}
