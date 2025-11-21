// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import * as https from "https";

type LibraryScope = "dependencies" | "devDependencies";

type TreeItemType = "workspace" | "library" | "info";

interface LibraryInfo {
  name: string;
  version: string;
  scope: LibraryScope;
  packageJsonPath: string;
  workspaceFolder?: vscode.WorkspaceFolder;
}

interface LibraryMetadata {
  description?: string;
  homepage?: string;
}

class LibraryTreeItem extends vscode.TreeItem {
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

class LibraryTreeDataProvider
  implements vscode.TreeDataProvider<LibraryTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    LibraryTreeItem | undefined | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly watcher: vscode.FileSystemWatcher | undefined;

  constructor() {
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
      const libraries = this.extractLibraries(pkg, folder, packageJsonPath);

      if (!libraries.length) {
        return [this.createInfoItem("등록된 라이브러리가 없습니다.")];
      }

      return libraries.map((lib) => {
        const item = new LibraryTreeItem(
          lib.name,
          vscode.TreeItemCollapsibleState.None,
          "library",
          folder,
          lib
        );
        item.description = lib.version;
        item.tooltip = `${lib.name} (${lib.scope}) - ${lib.version}`;
        item.iconPath = new vscode.ThemeIcon(
          lib.scope === "devDependencies" ? "beaker" : "package"
        );
        item.contextValue = "libraryItem";
        item.command = {
          command: "lib-extension.showLibraryInfo",
          title: "Show Library Info",
          arguments: [lib],
        };
        return item;
      });
    } catch (error) {
      const label =
        error instanceof Error && error.message.includes("ENOENT")
          ? "package.json을 찾을 수 없습니다."
          : "라이브러리 정보를 불러오지 못했습니다.";
      return [this.createInfoItem(label)];
    }
  }

  private extractLibraries(
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

class LibraryMetadataService implements vscode.Disposable {
  private readonly cache = new Map<string, LibraryMetadata | null>();

  async getMetadata(library: LibraryInfo): Promise<LibraryMetadata | null> {
    const cacheKey = library.name;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    const metadata = await this.fetchFromRegistry(library.name).catch(
      (error) => {
        console.warn(
          `[lib-extension] 메타데이터 조회 실패: ${library.name}`,
          error
        );
        return null;
      }
    );
    this.cache.set(cacheKey, metadata);
    return metadata;
  }

  dispose() {
    this.cache.clear();
  }

  private async fetchFromRegistry(
    packageName: string
  ): Promise<LibraryMetadata> {
    const encodedName = encodeURIComponent(packageName);
    const url = `https://registry.npmjs.org/${encodedName}`;

    const data = await new Promise<string>((resolve, reject) => {
      const request = https
        .get(
          url,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "lib-extension",
            },
          },
          (response) => {
            if (response.statusCode && response.statusCode >= 400) {
              reject(
                new Error(`Failed to fetch metadata (${response.statusCode})`)
              );
              response.resume();
              return;
            }

            const chunks: Buffer[] = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve(Buffer.concat(chunks).toString()));
          }
        )
        .on("error", reject);

      request.end();
    });

    const parsed = JSON.parse(data) as {
      description?: string;
      homepage?: string;
      "dist-tags"?: {
        latest?: string;
      };
      versions?: Record<
        string,
        {
          description?: string;
          homepage?: string;
        }
      >;
    };

    let latestVersion:
      | {
          description?: string;
          homepage?: string;
        }
      | undefined;

    const latestTag = parsed["dist-tags"]?.latest;
    if (latestTag && parsed.versions && parsed.versions[latestTag]) {
      latestVersion = parsed.versions[latestTag];
    }
    console.log(
      `[lib-extension] latest tag for ${packageName}:`,
      latestTag,
      latestVersion
    );

    const fallbackMetadata = this.findFallbackMetadata(parsed.versions);
    console.log(
      `[lib-extension] fallback candidate for ${packageName}:`,
      fallbackMetadata
    );

    return {
      description:
        latestVersion?.description ??
        fallbackMetadata?.description ??
        parsed.description ??
        undefined,
      homepage:
        latestVersion?.homepage ??
        fallbackMetadata?.homepage ??
        parsed.homepage ??
        undefined,
    };
  }

  private findFallbackMetadata(
    versions?: Record<
      string,
      {
        description?: string;
        homepage?: string;
      }
    >
  ): { description?: string; homepage?: string } | null {
    if (!versions) {
      return null;
    }

    const sortedKeys = Object.keys(versions).sort((a, b) =>
      compareSemver(b, a)
    );

    for (const key of sortedKeys) {
      const candidate = versions[key];
      if (candidate?.description || candidate?.homepage) {
        return candidate;
      }
    }

    return null;
  }
}

function compareSemver(a: string, b: string) {
  const parse = (version: string) =>
    version.split(".").map((part) => Number(part.replace(/\D+/g, "")) || 0);

  const aParts = parse(a);
  const bParts = parse(b);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const aValue = aParts[i] ?? 0;
    const bValue = bParts[i] ?? 0;

    if (aValue > bValue) {
      return 1;
    }
    if (aValue < bValue) {
      return -1;
    }
  }

  return a.localeCompare(b);
}

export function activate(context: vscode.ExtensionContext) {
  const treeDataProvider = new LibraryTreeDataProvider();
  const metadataService = new LibraryMetadataService();

  context.subscriptions.push(
    treeDataProvider,
    metadataService,
    vscode.window.registerTreeDataProvider("libExplorer", treeDataProvider),
    vscode.commands.registerCommand("lib-extension.refreshLibraries", () =>
      treeDataProvider.refresh()
    ),
    vscode.commands.registerCommand(
      "lib-extension.showLibraryInfo",
      async (arg?: LibraryTreeItem | LibraryInfo) => {
        const library = arg instanceof LibraryTreeItem ? arg.library : arg;

        if (!library) {
          vscode.window.showWarningMessage(
            "라이브러리 정보를 불러올 수 없습니다."
          );
          return;
        }

        const metadata = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `${library.name} 정보를 불러오는 중...`,
            cancellable: false,
          },
          async () => metadataService.getMetadata(library)
        );

        const detailLines = [
          `Name: ${library.name}`,
          `Version: ${library.version}`,
        ];

        if (metadata?.description) {
          detailLines.push("", "Description", metadata.description);
        } else {
          detailLines.push("", "Description", "Not available.");
        }

        if (metadata?.homepage) {
          detailLines.push("", `Homepage: ${metadata.homepage}`);
        }

        const detail = detailLines.join("\n");
        const actions = ["Copy"];
        if (metadata?.homepage) {
          actions.unshift("Open Homepage");
        }

        const action = await vscode.window.showInformationMessage(
          detail,
          { modal: true },
          ...actions
        );

        if (action === "Copy") {
          await vscode.env.clipboard.writeText(detail);
          vscode.window.showInformationMessage(
            "라이브러리 정보가 복사되었습니다."
          );
        } else if (action === "Open Homepage" && metadata?.homepage) {
          vscode.env.openExternal(vscode.Uri.parse(metadata.homepage));
        }
      }
    )
  );
}

export function deactivate() {}
