import * as vscode from "vscode";
import { promises as fs } from "fs";
import type { LibraryInfo } from "./types";
import type { LibraryMetadataService } from "./registry";
import {
  buildInstallCommand,
  buildRemoveCommand,
  detectPackageManager,
  type PackageManager,
} from "./packageManager";
import {
  LibraryTreeDataProvider,
  LibraryTreeItem,
  packageManagerSetting,
} from "./libraryTree";
import {
  isSafePackageName,
  isSafeVersion,
  normalizeVersion,
  planUpdate,
  resolveCurrentVersion,
  type UpdatePlan,
} from "./version";

type LibraryCommandArg = LibraryTreeItem | LibraryInfo | undefined;

const t = vscode.l10n.t;

function resolveLibrary(arg: LibraryCommandArg) {
  return arg instanceof LibraryTreeItem ? arg.library : arg;
}

export function registerCommands(
  metadataService: LibraryMetadataService,
  treeDataProvider: LibraryTreeDataProvider
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(
      "lib-extension.refreshLibraries",
      async () => {
        // 새로고침 버튼은 저장된 정보를 무시하고 레지스트리를 다시 조회한다
        await metadataService.clearCache();
        treeDataProvider.refresh();
      }
    ),
    vscode.commands.registerCommand(
      "lib-extension.showLibraryInfo",
      (arg?: LibraryCommandArg) => showLibraryInfo(metadataService, arg)
    ),
    vscode.commands.registerCommand(
      "lib-extension.updateLibrary",
      (arg?: LibraryCommandArg) =>
        updateLibrary(metadataService, treeDataProvider, arg)
    ),
    vscode.commands.registerCommand(
      "lib-extension.deleteLibrary",
      (arg?: LibraryCommandArg) => deleteLibrary(arg)
    ),
  ];
}

async function showLibraryInfo(
  metadataService: LibraryMetadataService,
  arg: LibraryCommandArg
) {
  const library = resolveLibrary(arg);

  if (!library) {
    vscode.window.showWarningMessage(t("Could not load library information."));
    return;
  }

  const metadata = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t("Loading {0}...", library.name),
      cancellable: false,
    },
    async () => metadataService.getMetadata(library)
  );

  const detailLines = [
    t("Name: {0}", library.name),
    t("Installed: {0}", library.installedVersion ?? t("Not installed")),
    t("Declared: {0}", library.version),
  ];

  detailLines.push(
    "",
    t("Description"),
    metadata?.description ?? t("Not available.")
  );

  if (metadata?.homepage) {
    detailLines.push("", t("Homepage: {0}", metadata.homepage));
  }

  const detail = detailLines.join("\n");

  const copyAction = t("Copy");
  const openHomepageAction = t("Open Homepage");
  const actions = [copyAction];
  if (metadata?.homepage) {
    actions.unshift(openHomepageAction);
  }

  const action = await vscode.window.showInformationMessage(
    detail,
    { modal: true },
    ...actions
  );

  if (action === copyAction) {
    await vscode.env.clipboard.writeText(detail);
    vscode.window.showInformationMessage(t("Library information copied."));
  } else if (action === openHomepageAction && metadata?.homepage) {
    vscode.env.openExternal(vscode.Uri.parse(metadata.homepage));
  }
}

async function updateLibrary(
  metadataService: LibraryMetadataService,
  treeDataProvider: LibraryTreeDataProvider,
  arg: LibraryCommandArg
) {
  const library = resolveLibrary(arg);

  if (!library) {
    vscode.window.showWarningMessage(t("Could not find the library to update."));
    return;
  }

  if (!library.workspaceFolder) {
    vscode.window.showWarningMessage(
      t("Could not find the workspace folder, so the update was not run.")
    );
    return;
  }

  const metadata = await metadataService.getMetadata(library);

  const latestVersion = normalizeVersion(
    metadata?.latestVersion ?? library.latestVersion
  );

  if (!latestVersion) {
    vscode.window.showWarningMessage(
      t("Could not get the latest version, so the update was not run.")
    );
    return;
  }

  const currentVersion = resolveCurrentVersion(
    library.version,
    library.installedVersion
  );
  let plan = planUpdate({
    declaredRange: library.version,
    currentVersion,
    latestVersion,
  });

  let targetVersion = latestVersion;
  if (plan?.isMajor) {
    // 범위 내 최신 버전을 찾으려면 전체 버전 목록이 필요하다. 수 MB일 수 있어 이때만 받는다.
    const versions = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t("Loading versions of {0}...", library.name),
      },
      () => metadataService.getVersions(library.name, library.registry)
    );
    plan =
      planUpdate({
        declaredRange: library.version,
        currentVersion,
        latestVersion,
        versions: versions ?? undefined,
      }) ?? plan;

    const chosen = await confirmMajorUpdate(
      library.name,
      library.version,
      currentVersion,
      plan,
      metadata?.homepage
    );
    if (!chosen) {
      return;
    }
    targetVersion = chosen;
  }

  if (!isSafePackageName(library.name) || !isSafeVersion(targetVersion)) {
    vscode.window.showErrorMessage(
      t(
        "The update was not run because the package name or version is not allowed: {0}",
        `${library.name}@${targetVersion}`
      )
    );
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `Update ${library.name}`,
    cwd: library.workspaceFolder.uri.fsPath,
  });

  terminal.show();
  const packageManager = await resolvePackageManager(library);
  terminal.sendText(
    buildInstallCommand(packageManager, library.name, targetVersion, library.scope)
  );

  vscode.window.showInformationMessage(
    t("Started updating {0} to {1}.", library.name, targetVersion)
  );

  treeDataProvider.refresh();
}

/**
 * major 업데이트 전에 확인을 받는다. 업데이트할 버전을 돌려주고, 취소하면 undefined.
 */
async function confirmMajorUpdate(
  name: string,
  declaredRange: string,
  currentVersion: string | undefined,
  plan: UpdatePlan,
  homepage: string | undefined
): Promise<string | undefined> {
  const updateLatest = t("Update to {0} (major)", plan.latest);
  const updateWanted = plan.wanted
    ? t("Update to {0} (latest within range)", plan.wanted)
    : undefined;
  const openHomepage = homepage ? t("Check What Changed") : undefined;

  const actions = [updateWanted, updateLatest, openHomepage].filter(
    (action): action is string => !!action
  );

  const choice = await vscode.window.showWarningMessage(
    t(
      "{0} {1} → {2} is a major update.",
      name,
      currentVersion ?? declaredRange,
      plan.latest
    ),
    {
      modal: true,
      detail:
        t(
          "This version is outside the range in package.json ({0}), so it may include breaking changes. Check what changed before updating.",
          declaredRange
        ) +
        (plan.wanted
          ? "\n\n" +
            t("The highest version within the range is {0}.", plan.wanted)
          : ""),
    },
    ...actions
  );

  if (choice === updateLatest) {
    return plan.latest;
  }
  if (choice === updateWanted) {
    return plan.wanted;
  }
  if (choice === openHomepage && homepage) {
    vscode.env.openExternal(vscode.Uri.parse(homepage));
  }
  return undefined;
}

async function deleteLibrary(arg: LibraryCommandArg) {
  const library = resolveLibrary(arg);

  if (!library) {
    vscode.window.showWarningMessage(t("Could not find the library to delete."));
    return;
  }

  if (!library.workspaceFolder) {
    vscode.window.showWarningMessage(
      t("Could not find the workspace folder, so the delete was not run.")
    );
    return;
  }

  if (!isSafePackageName(library.name)) {
    vscode.window.showErrorMessage(
      t(
        "The delete was not run because the package name is not allowed: {0}",
        library.name
      )
    );
    return;
  }

  const removeCommand = buildRemoveCommand(
    await resolvePackageManager(library),
    library.name
  );
  const deleteAction = t("Delete");
  const confirm = await vscode.window.showWarningMessage(
    t("Delete {0}?", library.name),
    {
      modal: true,
      detail: t("This runs `{0}` in the terminal.", removeCommand),
    },
    deleteAction
  );

  if (confirm !== deleteAction) {
    return;
  }

  // package.json 수정은 패키지 매니저에 맡긴다 (직접 수정하면 들여쓰기 등 포맷이 바뀜)
  const terminal = vscode.window.createTerminal({
    name: `Delete ${library.name}`,
    cwd: library.workspaceFolder.uri.fsPath,
  });

  terminal.show();
  terminal.sendText(removeCommand);

  vscode.window.showInformationMessage(t("Started deleting {0}.", library.name));
}

/**
 * 트리에서 감지해 둔 패키지 매니저를 쓰고, 없으면 그 자리에서 감지한다.
 */
async function resolvePackageManager(
  library: LibraryInfo
): Promise<PackageManager> {
  if (library.packageManager) {
    return library.packageManager.name;
  }
  if (!library.workspaceFolder) {
    return "npm";
  }
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(await fs.readFile(library.packageJsonPath, "utf8"));
  } catch {
    // package.json을 읽지 못해도 lockfile로 감지할 수 있다
  }
  return (
    await detectPackageManager(
      library.workspaceFolder.uri.fsPath,
      pkg,
      packageManagerSetting(library.workspaceFolder)
    )
  ).name;
}
