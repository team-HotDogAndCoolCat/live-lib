import type * as vscode from "vscode";

export type LibraryScope = "dependencies" | "devDependencies";

export interface LibraryInfo {
  name: string;
  /** package.json에 적힌 버전 범위 (예: ^1.2.0) */
  version: string;
  /** node_modules에 실제 설치된 버전 */
  installedVersion?: string;
  scope: LibraryScope;
  packageJsonPath: string;
  workspaceFolder?: vscode.WorkspaceFolder;
  latestVersion?: string;
  isUsed?: boolean;
}

export interface LibraryMetadata {
  description?: string;
  homepage?: string;
  latestVersion?: string;
}
