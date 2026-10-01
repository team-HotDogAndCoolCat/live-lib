import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension", () => {
  test("활성화되고 모든 명령을 등록한다", async () => {
    const extension = vscode.extensions.getExtension("gugitgugit.live-lib");
    assert.ok(extension, "익스텐션을 찾을 수 없습니다");

    await extension.activate();
    assert.ok(extension.isActive);

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      "lib-extension.refreshLibraries",
      "lib-extension.showLibraryInfo",
      "lib-extension.updateLibrary",
      "lib-extension.deleteLibrary",
    ]) {
      assert.ok(commands.includes(id), `${id} 명령이 등록되지 않았습니다`);
    }
  });

  test("liveLib.packageManager 설정을 기본값 auto로 등록한다", () => {
    const inspected = vscode.workspace
      .getConfiguration("liveLib")
      .inspect<string>("packageManager");
    assert.strictEqual(inspected?.defaultValue, "auto");
  });
});
