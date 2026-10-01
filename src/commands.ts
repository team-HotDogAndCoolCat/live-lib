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
import { LibraryTreeDataProvider, LibraryTreeItem } from "./libraryTree";
import {
  isSafePackageName,
  isSafeVersion,
  normalizeVersion,
  planUpdate,
  resolveCurrentVersion,
  type UpdatePlan,
} from "./version";

type LibraryCommandArg = LibraryTreeItem | LibraryInfo | undefined;

function resolveLibrary(arg: LibraryCommandArg) {
  return arg instanceof LibraryTreeItem ? arg.library : arg;
}

export function registerCommands(
  metadataService: LibraryMetadataService,
  treeDataProvider: LibraryTreeDataProvider
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("lib-extension.refreshLibraries", () =>
      treeDataProvider.refresh()
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
    vscode.window.showWarningMessage("라이브러리 정보를 불러올 수 없습니다.");
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
    `Installed: ${library.installedVersion ?? "Not installed"}`,
    `Declared: ${library.version}`,
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
    vscode.window.showInformationMessage("라이브러리 정보가 복사되었습니다.");
  } else if (action === "Open Homepage" && metadata?.homepage) {
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
    vscode.window.showWarningMessage(
      "업데이트할 라이브러리를 찾을 수 없습니다."
    );
    return;
  }

  if (!library.workspaceFolder) {
    vscode.window.showWarningMessage(
      "워크스페이스 정보를 찾을 수 없어 업데이트를 실행할 수 없습니다."
    );
    return;
  }

  const metadata = await metadataService.getMetadata(library);

  const latestVersion = normalizeVersion(
    metadata?.latestVersion ?? library.latestVersion
  );

  if (!latestVersion) {
    vscode.window.showWarningMessage(
      "최신 버전 정보를 가져올 수 없어 업데이트를 실행할 수 없습니다."
    );
    return;
  }

  const currentVersion = resolveCurrentVersion(
    library.version,
    library.installedVersion
  );
  const plan = planUpdate({
    declaredRange: library.version,
    currentVersion,
    latestVersion,
    versions: metadata?.versions,
  });

  let targetVersion = latestVersion;
  if (plan?.isMajor) {
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
      `허용되지 않는 패키지 이름 또는 버전이라 업데이트를 실행하지 않았습니다: ${library.name}@${targetVersion}`
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
    `${library.name} 업데이트를 시작했습니다 (${targetVersion}).`
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
  const updateLatest = `${plan.latest}로 업데이트 (major)`;
  const updateWanted = plan.wanted
    ? `${plan.wanted}로 업데이트 (범위 내 최신)`
    : undefined;
  const openHomepage = homepage ? "변경 내역 확인" : undefined;

  const actions = [updateWanted, updateLatest, openHomepage].filter(
    (action): action is string => !!action
  );

  const choice = await vscode.window.showWarningMessage(
    `${name} ${currentVersion ?? declaredRange} → ${plan.latest}은(는) major 업데이트입니다.`,
    {
      modal: true,
      detail:
        `package.json에 적힌 범위(${declaredRange})를 벗어나는 버전이라 호환되지 않는 변경이 있을 수 있습니다. ` +
        "변경 내역을 확인한 뒤 업데이트하세요." +
        (plan.wanted
          ? `\n\n범위 안에서 가장 높은 버전은 ${plan.wanted}입니다.`
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
    vscode.window.showWarningMessage("삭제할 라이브러리를 찾을 수 없습니다.");
    return;
  }

  if (!library.workspaceFolder) {
    vscode.window.showWarningMessage(
      "워크스페이스 정보를 찾을 수 없어 삭제를 실행할 수 없습니다."
    );
    return;
  }

  if (!isSafePackageName(library.name)) {
    vscode.window.showErrorMessage(
      `허용되지 않는 패키지 이름이라 삭제를 실행하지 않았습니다: ${library.name}`
    );
    return;
  }

  const removeCommand = buildRemoveCommand(
    await resolvePackageManager(library),
    library.name
  );
  const confirm = await vscode.window.showWarningMessage(
    `${library.name}을(를) 삭제하시겠습니까?`,
    { modal: true, detail: `터미널에서 \`${removeCommand}\`를 실행합니다.` },
    "삭제"
  );

  if (confirm !== "삭제") {
    return;
  }

  // package.json 수정은 패키지 매니저에 맡긴다 (직접 수정하면 들여쓰기 등 포맷이 바뀜)
  const terminal = vscode.window.createTerminal({
    name: `Delete ${library.name}`,
    cwd: library.workspaceFolder.uri.fsPath,
  });

  terminal.show();
  terminal.sendText(removeCommand);

  vscode.window.showInformationMessage(`${library.name} 삭제를 시작했습니다.`);
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
  return (await detectPackageManager(library.workspaceFolder.uri.fsPath, pkg))
    .name;
}
