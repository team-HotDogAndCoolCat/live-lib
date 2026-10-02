import * as assert from "assert";
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { buildExcludeGlob } from "../../scanExclude";

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

  test("새로고침 명령이 캐시를 비우고 정상적으로 끝난다", async () => {
    await vscode.commands.executeCommand("lib-extension.refreshLibraries");
  });

  test("스캔에서 빌드 산출물과 .gitignore 폴더를 실제 findFiles로 제외한다", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-scan-"));
    const write = async (file: string) => {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), "export {};\n");
    };
    try {
      for (const file of [
        "src/index.ts",
        "src/tmp-out/helper.ts", // .gitignore의 /tmp-out은 루트에서만 무시하므로 남아야 한다
        "eslint.config.mjs",
        "dist/bundle.js",
        "coverage/lcov-report/prettify.js",
        "packages/app/dist/index.js",
        "node_modules/pkg/index.js",
        "build/out.js",
        "tmp-out/client.js",
        "src/generated/client.ts",
      ]) {
        await write(file);
      }

      const exclude = buildExcludeGlob({ gitignore: "/tmp-out\ngenerated/\n*.log\n" });
      const base = vscode.Uri.file(root);
      const found = await vscode.workspace.findFiles(
        new vscode.RelativePattern(base, "**/*.{js,jsx,ts,tsx,mjs,cjs}"),
        new vscode.RelativePattern(base, exclude)
      );
      const relative = found
        .map((uri) => path.relative(root, uri.fsPath).split(path.sep).join("/"))
        .sort();

      assert.deepStrictEqual(relative, [
        "eslint.config.mjs",
        "src/index.ts",
        "src/tmp-out/helper.ts",
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
