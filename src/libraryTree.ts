import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import type { LibraryInfo } from "./types";
import type { LibraryMetadataService } from "./registry";
import { extractLibraries } from "./packageJson";
import { classifyUsage, type UsageEvidence } from "./usage";
import { buildExcludeGlob } from "./scanExclude";
import { collectUsageEvidence, type ImportCache } from "./usageEvidence";
import { readInstalledVersion } from "./installed";
import { buildLibraryView } from "./libraryView";
import {
  isRegistrySpecifier,
  readRegistryConfig,
  resolveRegistry,
} from "./npmrc";
import { detectPackageManager } from "./packageManager";

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

  // 파일별 import 결과. 수정되지 않은 파일은 새로고침 때 다시 읽지 않는다.
  private readonly importCache: ImportCache = new Map();

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

  private async getWorkspaceItems(): Promise<LibraryTreeItem[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];

    if (!folders.length) {
      const item = new LibraryTreeItem(
        vscode.l10n.t("No workspace is open."),
        vscode.TreeItemCollapsibleState.None,
        "info"
      );
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }

    return Promise.all(
      folders.map(async (folder) => {
        const item = new LibraryTreeItem(
          folder.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          "workspace",
          folder
        );
        item.iconPath = new vscode.ThemeIcon("root-folder");
        item.tooltip = folder.uri.fsPath;

        const pkg = await readPackageJson(folder);
        if (pkg) {
          const pm = await detectPackageManager(
            folder.uri.fsPath,
            pkg,
            packageManagerSetting(folder)
          );
          item.description = pm.name;
          item.tooltip = `${folder.uri.fsPath}\n${vscode.l10n.t(
            "Package manager: {0} ({1})",
            pm.name,
            pm.source
          )}`;
        }
        return item;
      })
    );
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
      const packageManager = await detectPackageManager(
        folder.uri.fsPath,
        pkg,
        packageManagerSetting(folder)
      );

      if (!libraries.length) {
        return [this.createInfoItem(vscode.l10n.t("No dependencies found."))];
      }

      const evidence = await this.collectEvidence(pkg, libraries, folder);

      const registryConfig = await readRegistryConfig(folder.uri.fsPath);

      const items = await Promise.all(
        libraries.map(async (lib) => {
          lib.usage = classifyUsage(lib, evidence);
          lib.registry = resolveRegistry(registryConfig, lib.name);
          // workspace:, file:, git 주소처럼 레지스트리에 없는 패키지는 조회하지 않는다
          const lookup = isRegistrySpecifier(lib.version);
          const [metadata, installedVersion] = await Promise.all([
            lookup
              ? this.metadataService.getMetadata(lib).catch(() => null)
              : undefined,
            readInstalledVersion(folder.uri.fsPath, lib.name),
          ]);

          lib.installedVersion = installedVersion;
          lib.packageManager = packageManager;
          lib.latestVersion = metadata?.latestVersion;
          lib.latestLookupFailed = lookup && metadata === null;

          const view = buildLibraryView(lib, undefined, vscode.l10n.t);
          const item = new LibraryTreeItem(
            lib.name,
            vscode.TreeItemCollapsibleState.None,
            "library",
            folder,
            lib
          );
          item.description = view.description;
          item.tooltip = view.tooltip;
          item.iconPath = new vscode.ThemeIcon(view.icon);
          item.contextValue = view.contextValue;
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
          ? vscode.l10n.t("Could not find package.json.")
          : vscode.l10n.t("Could not load the dependencies.");
      return [this.createInfoItem(label)];
    }
  }

  private async collectEvidence(
    pkg: Record<string, unknown>,
    libraries: LibraryInfo[],
    folder: vscode.WorkspaceFolder
  ): Promise<UsageEvidence> {
    const exclude = buildExcludeGlob({
      gitignore: await fs
        .readFile(path.join(folder.uri.fsPath, ".gitignore"), "utf8")
        .catch(() => ""),
      filesExclude: vscode.workspace
        .getConfiguration("files", folder.uri)
        .get<Record<string, unknown>>("exclude"),
    });
    const sourceFiles = await vscode.workspace
      .findFiles(
        new vscode.RelativePattern(folder, "**/*.{js,jsx,ts,tsx,mjs,cjs}"),
        new vscode.RelativePattern(folder, exclude)
      )
      .then(
        (uris) => uris.map((uri) => uri.fsPath),
        () => [] as string[]
      );

    return collectUsageEvidence(
      folder.uri.fsPath,
      pkg,
      libraries.map((lib) => lib.name),
      sourceFiles,
      this.importCache
    );
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

async function readPackageJson(
  folder: vscode.WorkspaceFolder
): Promise<Record<string, unknown> | undefined> {
  try {
    const contents = await fs.readFile(
      path.join(folder.uri.fsPath, "package.json"),
      "utf8"
    );
    return JSON.parse(contents);
  } catch {
    return undefined;
  }
}

export function packageManagerSetting(folder: vscode.WorkspaceFolder) {
  return vscode.workspace
    .getConfiguration("liveLib", folder.uri)
    .get<string>("packageManager");
}
