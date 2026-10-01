import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import type { LibraryInfo } from "./types";
import type { LibraryMetadataService } from "./registry";
import { extractLibraries } from "./packageJson";
import { findImportedLibraries } from "./usage";
import { compareSemver, normalizeVersion } from "./version";

type TreeItemType = "workspace" | "library" | "info";

export class LibraryTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: TreeItemType,
    public readonly workspaceFolder?: vscode.WorkspaceFolder,
    public readonly library?: LibraryInfo
  ) {
    super(label, collapsibleState);
  }
}

export class LibraryTreeDataProvider
  implements vscode.TreeDataProvider<LibraryTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    LibraryTreeItem | undefined | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly watcher: vscode.FileSystemWatcher | undefined;

  constructor(private readonly metadataService: LibraryMetadataService) {
    if (vscode.workspace.workspaceFolders?.length) {
      this.watcher =
        vscode.workspace.createFileSystemWatcher("**/package.json");
      this.watcher.onDidChange(() => this.refresh());
      this.watcher.onDidCreate(() => this.refresh());
      this.watcher.onDidDelete(() => this.refresh());
    }
  }

  refresh(element?: LibraryTreeItem) {
    this._onDidChangeTreeData.fire(element);
  }

  dispose() {
    this.watcher?.dispose();
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: LibraryTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LibraryTreeItem): Promise<LibraryTreeItem[]> {
    if (!element) {
      return this.getWorkspaceItems();
    }

    if (element.type === "workspace") {
      return this.getLibrariesForWorkspace(element.workspaceFolder);
    }

    return [];
  }

  private getWorkspaceItems(): LibraryTreeItem[] {
    const folders = vscode.workspace.workspaceFolders ?? [];

    if (!folders.length) {
      const item = new LibraryTreeItem(
        "열려 있는 워크스페이스가 없습니다",
        vscode.TreeItemCollapsibleState.None,
        "info"
      );
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }

    return folders.map((folder) => {
      const item = new LibraryTreeItem(
        folder.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        "workspace",
        folder
      );
      item.tooltip = folder.uri.fsPath;
      item.iconPath = new vscode.ThemeIcon("root-folder");
      return item;
    });
  }

  private async getLibrariesForWorkspace(
    folder?: vscode.WorkspaceFolder
  ): Promise<LibraryTreeItem[]> {
    if (!folder) {
      return [];
    }

    const packageJsonPath = path.join(folder.uri.fsPath, "package.json");

    try {
      const fileContents = await fs.readFile(packageJsonPath, "utf8");
      const pkg = JSON.parse(fileContents);
      const libraries = extractLibraries(pkg, folder, packageJsonPath);

      if (!libraries.length) {
        return [this.createInfoItem("등록된 라이브러리가 없습니다.")];
      }

      const usedLibraries = await this.checkLibraryUsage(libraries, folder);

      const items = await Promise.all(
        libraries.map(async (lib) => {
          lib.isUsed = usedLibraries.has(lib.name);
          const metadata = await this.metadataService
            .getMetadata(lib)
            .catch(() => null);

          const latestVersion = metadata?.latestVersion;
          const cleanCurrent = normalizeVersion(lib.version);
          const cleanLatest = latestVersion
            ? normalizeVersion(latestVersion)
            : undefined;

          const isOutdated =
            !!cleanCurrent &&
            !!cleanLatest &&
            compareSemver(cleanLatest, cleanCurrent) > 0;

          lib.latestVersion = latestVersion;

          const item = new LibraryTreeItem(
            lib.name,
            vscode.TreeItemCollapsibleState.None,
            "library",
            folder,
            lib
          );

          if (isOutdated && cleanLatest) {
            item.description = `${cleanCurrent} → ${cleanLatest}`;
          } else if (!lib.isUsed) {
            item.description = `${cleanCurrent ?? lib.version} (unused)`;
          } else {
            item.description = cleanCurrent ?? lib.version;
          }

          const tooltipParts = [
            `${lib.name} (${lib.scope})`,
            `Current: ${lib.version}`,
          ];
          if (latestVersion) {
            tooltipParts.push(`Latest: ${latestVersion}`);
          }
          if (lib.isUsed === false) {
            tooltipParts.push("Unused");
          }
          item.tooltip = tooltipParts.join(" • ");

          if (isOutdated) {
            item.iconPath = new vscode.ThemeIcon("arrow-circle-up");
          } else if (!lib.isUsed) {
            item.iconPath = new vscode.ThemeIcon("circle-slash");
          } else {
            item.iconPath = new vscode.ThemeIcon(
              lib.scope === "devDependencies" ? "beaker" : "package"
            );
          }

          if (isOutdated) {
            item.contextValue = "libraryItemOutdated";
          } else if (!lib.isUsed) {
            item.contextValue = "libraryItemUnused";
          } else {
            item.contextValue = "libraryItem";
          }
          item.command = {
            command: "lib-extension.showLibraryInfo",
            title: "Show Library Info",
            arguments: [lib],
          };
          return item;
        })
      );

      return items;
    } catch (error) {
      const label =
        error instanceof Error && error.message.includes("ENOENT")
          ? "package.json을 찾을 수 없습니다."
          : "라이브러리 정보를 불러오지 못했습니다.";
      return [this.createInfoItem(label)];
    }
  }

  private async checkLibraryUsage(
    libraries: LibraryInfo[],
    folder: vscode.WorkspaceFolder
  ): Promise<Set<string>> {
    const usedLibraries = new Set<string>();
    const libraryNames = new Set(libraries.map((lib) => lib.name));

    try {
      const sourceFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, "**/*.{js,jsx,ts,tsx,mjs,cjs}"),
        "**/node_modules/**"
      );

      for (const file of sourceFiles) {
        try {
          const content = await fs.readFile(file.fsPath, "utf8");
          const remaining = [...libraryNames].filter(
            (name) => !usedLibraries.has(name)
          );

          for (const name of findImportedLibraries(content, remaining)) {
            usedLibraries.add(name);
          }
        } catch {
          continue;
        }
      }
    } catch {
      return usedLibraries;
    }

    return usedLibraries;
  }

  private createInfoItem(label: string) {
    const item = new LibraryTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      "info"
    );
    item.iconPath = new vscode.ThemeIcon("info");
    item.tooltip = label;
    return item;
  }
}
