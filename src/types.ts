import type * as vscode from "vscode";

export type LibraryScope = "dependencies" | "devDependencies";

export interface LibraryInfo {
  name: string;
  version: string;
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
