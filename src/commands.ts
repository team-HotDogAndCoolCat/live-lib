import * as vscode from "vscode";
import type { LibraryInfo } from "./types";
import type { LibraryMetadataService } from "./registry";
import { LibraryTreeDataProvider, LibraryTreeItem } from "./libraryTree";
import { isSafePackageName, isSafeVersion, normalizeVersion } from "./version";

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

  const detailLines = [`Name: ${library.name}`, `Version: ${library.version}`];

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

  const metadata =
    library.latestVersion && normalizeVersion(library.latestVersion)
      ? { latestVersion: library.latestVersion }
      : await metadataService.getMetadata(library);

  const latestVersion = normalizeVersion(
    metadata?.latestVersion ?? library.latestVersion
  );

  if (!latestVersion) {
    vscode.window.showWarningMessage(
      "최신 버전 정보를 가져올 수 없어 업데이트를 실행할 수 없습니다."
    );
    return;
  }

  if (!isSafePackageName(library.name) || !isSafeVersion(latestVersion)) {
    vscode.window.showErrorMessage(
      `허용되지 않는 패키지 이름 또는 버전이라 업데이트를 실행하지 않았습니다: ${library.name}@${latestVersion}`
    );
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `Update ${library.name}`,
    cwd: library.workspaceFolder.uri.fsPath,
  });

  terminal.show();
  terminal.sendText(`npm install ${library.name}@${latestVersion}`);

  vscode.window.showInformationMessage(
    `${library.name} 업데이트를 시작했습니다 (${latestVersion}).`
  );

  treeDataProvider.refresh();
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

  const confirm = await vscode.window.showWarningMessage(
    `${library.name}을(를) 삭제하시겠습니까?`,
    { modal: true },
    "삭제"
  );

  if (confirm !== "삭제") {
    return;
  }

  // package.json 수정은 npm uninstall에 맡긴다 (직접 수정하면 들여쓰기 등 포맷이 바뀜)
  const terminal = vscode.window.createTerminal({
    name: `Delete ${library.name}`,
    cwd: library.workspaceFolder.uri.fsPath,
  });

  terminal.show();
  terminal.sendText(`npm uninstall ${library.name}`);

  vscode.window.showInformationMessage(`${library.name} 삭제를 시작했습니다.`);
}
