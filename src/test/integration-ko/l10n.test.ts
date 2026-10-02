import * as assert from "assert";
import * as vscode from "vscode";

suite("한국어 VS Code", () => {
  test("명령 이름과 메시지가 한국어로 나온다", async () => {
    assert.strictEqual(vscode.env.language, "ko");

    const extension = vscode.extensions.getExtension("gugitgugit.live-lib");
    assert.ok(extension);
    // 번역된 이름은 { original, value } 형태로 들어온다
    type Title = string | { original: string; value: string };
    const titles = Object.fromEntries(
      (extension.packageJSON.contributes.commands as { command: string; title: Title }[]).map(
        (c) => [c.command, typeof c.title === "string" ? c.title : c.title.value]
      )
    );
    assert.strictEqual(titles["lib-extension.refreshLibraries"], "새로고침");
    assert.strictEqual(titles["lib-extension.deleteLibrary"], "삭제");

    // 번역 파일은 확장이 활성화될 때 연결된다. 실제 메시지도 활성화된 뒤에만 나온다.
    await extension.activate();
    assert.strictEqual(vscode.l10n.t("Delete {0}?", "lodash"), "lodash을(를) 삭제하시겠습니까?");
    assert.strictEqual(vscode.l10n.t("{0} (unused)", "1.0.0"), "1.0.0 (미사용)");
  });
});
