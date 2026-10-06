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
import { discoverWorkspacePackages } from "./workspaces";

type TreeItemType = "workspace" | "package" | "library" | "info";

export class LibraryTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: TreeItemType,
    public readonly workspaceFolder?: vscode.WorkspaceFolder,
    public readonly library?: LibraryInfo,
    /** 모노레포 패키지 줄이 가리키는 package.json 폴더 */
    public readonly packageDir?: string
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
      // pnpm-workspace.yaml이 바뀌면 모노레포 패키지 목록도 바뀐다
      this.watcher = vscode.workspace.createFileSystemWatcher(
        "**/{package.json,pnpm-workspace.yaml}"
      );
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

    if (element.type === "workspace" && element.workspaceFolder) {
      return this.getWorkspaceChildren(element.workspaceFolder);
    }

    if (element.type === "package" && element.workspaceFolder) {
      return this.getLibrariesForPackage(
        element.workspaceFolder,
        element.packageDir
      );
    }

    return [];
  }

  /**
   * 워크스페이스 폴더를 펼쳤을 때의 항목.
   * 모노레포면 루트와 하위 패키지를 나란히 보여주고, 아니면 라이브러리를 바로 보여준다.
   */
  private async getWorkspaceChildren(
    folder: vscode.WorkspaceFolder
  ): Promise<LibraryTreeItem[]> {
    const root = folder.uri.fsPath;
    const pkg = await readPackageJson(folder);
    const packages = pkg ? await discoverWorkspacePackages(root, pkg) : [];

    if (!packages.length) {
      return this.getLibrariesForPackage(folder);
    }

    const rootName = typeof pkg?.name === "string" ? pkg.name : undefined;
    return [
      this.createPackageItem(folder, vscode.l10n.t("(root)"), root, rootName),
      ...packages.map((workspacePackage) =>
        this.createPackageItem(
          folder,
          workspacePackage.relativePath,
          workspacePackage.dir,
          workspacePackage.name
        )
      ),
    ];
  }

  private createPackageItem(
    folder: vscode.WorkspaceFolder,
    label: string,
    packageDir: string,
    name?: string
  ) {
    const item = new LibraryTreeItem(
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
      "package",
      folder,
      undefined,
      packageDir
    );
    item.iconPath = new vscode.ThemeIcon("package");
    item.description = name;
    item.tooltip = name
      ? `${packageDir}\n${vscode.l10n.t("Package: {0}", name)}`
      : packageDir;
    item.contextValue = "workspacePackage";
    return item;
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

  /**
   * package.json 하나의 라이브러리 목록을 만든다.
   * packageDir를 주지 않으면 워크스페이스 폴더 루트의 package.json을 읽는다.
   * 모노레포 하위 패키지면 설치 버전은 워크스페이스 루트까지 올라가며 찾고,
   * 사용 여부는 그 패키지 폴더 안에서만 판단한다.
   */
  async getLibrariesForPackage(
    folder: vscode.WorkspaceFolder,
    packageDir: string = folder.uri.fsPath
  ): Promise<LibraryTreeItem[]> {
    const root = folder.uri.fsPath;
    const packageJsonPath = path.join(packageDir, "package.json");

    try {
      const fileContents = await fs.readFile(packageJsonPath, "utf8");
      const pkg = JSON.parse(fileContents);
      const libraries = extractLibraries(pkg, folder, packageJsonPath);
      const packageManager = await detectPackageManager(
        packageDir,
        await withRootPackageManagerField(pkg, root, packageDir),
        packageManagerSetting(folder)
      );

      if (!libraries.length) {
        return [this.createInfoItem(vscode.l10n.t("No dependencies found."))];
      }

      const evidence = await this.collectEvidence(
        pkg,
        libraries,
        folder,
        packageDir
      );

      const registryConfig = await readRegistryConfig(packageDir);
      const internalNames = await workspacePackageNames(
        folder,
        root,
        packageDir,
        pkg
      );

      const items = await Promise.all(
        libraries.map(async (lib) => {
          lib.usage = classifyUsage(lib, evidence);
          lib.registry = resolveRegistry(registryConfig, lib.name);
          // workspace:, file:, git 주소처럼 레지스트리에 없는 패키지는 조회하지 않는다.
          // npm·yarn 모노레포는 내부 패키지를 "*" 같은 버전 범위로 적으므로 이름으로도 거른다.
          const lookup =
            isRegistrySpecifier(lib.version) && !internalNames.has(lib.name);
          const [metadata, installedVersion] = await Promise.all([
            lookup
              ? this.metadataService.getMetadata(lib).catch(() => null)
              : undefined,
            readInstalledVersion(packageDir, lib.name, root),
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

  /**
   * packageDir 아래의 코드에서 사용 근거를 모은다.
   * 루트 패키지는 하위 패키지 폴더까지 포함해 훑는다. 루트에 둔 공용 의존성을
   * 하위 패키지가 import하는 경우가 많아서, 빼면 실제로 쓰는 라이브러리가 unused로 보인다.
   */
  private async collectEvidence(
    pkg: Record<string, unknown>,
    libraries: LibraryInfo[],
    folder: vscode.WorkspaceFolder,
    packageDir: string
  ): Promise<UsageEvidence> {
    const root = folder.uri.fsPath;
    const readGitignore = (dir: string) =>
      fs.readFile(path.join(dir, ".gitignore"), "utf8").catch(() => "");
    const gitignores = [await readGitignore(root)];
    if (packageDir !== root) {
      gitignores.push(await readGitignore(packageDir));
    }
    const exclude = buildExcludeGlob({
      gitignore: gitignores.join("\n"),
      filesExclude: vscode.workspace
        .getConfiguration("files", folder.uri)
        .get<Record<string, unknown>>("exclude"),
    });
    const base = vscode.Uri.file(packageDir);
    const sourceFiles = await vscode.workspace
      .findFiles(
        new vscode.RelativePattern(base, "**/*.{js,jsx,ts,tsx,mjs,cjs}"),
        new vscode.RelativePattern(base, exclude)
      )
      .then(
        (uris) => uris.map((uri) => uri.fsPath),
        () => [] as string[]
      );

    return collectUsageEvidence(
      packageDir,
      pkg,
      libraries.map((lib) => lib.name),
      sourceFiles,
      this.importCache,
      root
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

/**
 * 모노레포 안의 패키지 이름(루트 포함). 모노레포가 아니면 빈 집합이다.
 */
async function workspacePackageNames(
  folder: vscode.WorkspaceFolder,
  root: string,
  packageDir: string,
  pkg: Record<string, unknown>
): Promise<Set<string>> {
  const rootPkg = packageDir === root ? pkg : await readPackageJson(folder);
  if (!rootPkg) {
    return new Set();
  }
  const packages = await discoverWorkspacePackages(root, rootPkg);
  if (!packages.length) {
    return new Set();
  }
  return new Set(
    [rootPkg.name, ...packages.map((p) => p.name)].filter(
      (name): name is string => typeof name === "string"
    )
  );
}

/**
 * 하위 패키지에는 보통 packageManager 필드가 없고 루트에만 있다.
 * 하위 패키지에 없으면 루트 package.json의 값을 대신 쓴다.
 */
async function withRootPackageManagerField(
  pkg: Record<string, unknown>,
  root: string,
  packageDir: string
): Promise<Record<string, unknown>> {
  if (packageDir === root || pkg.packageManager !== undefined) {
    return pkg;
  }
  const rootPkg = await fs
    .readFile(path.join(root, "package.json"), "utf8")
    .then(JSON.parse, () => undefined)
    .catch(() => undefined);
  return rootPkg?.packageManager !== undefined
    ? { ...pkg, packageManager: rootPkg.packageManager }
    : pkg;
}

export function packageManagerSetting(folder: vscode.WorkspaceFolder) {
  return vscode.workspace
    .getConfiguration("liveLib", folder.uri)
    .get<string>("packageManager");
}
