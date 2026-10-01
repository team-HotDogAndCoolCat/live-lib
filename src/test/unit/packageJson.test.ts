import * as assert from "assert";
import type * as vscode from "vscode";
import { extractLibraries } from "../../packageJson";

suite("extractLibraries", () => {
  const folder = { name: "app" } as vscode.WorkspaceFolder;
  const pkgPath = "/work/app/package.json";

  test("dependencies와 devDependencies를 순서대로 모은다", () => {
    const libs = extractLibraries(
      {
        dependencies: { react: "^18.3.1" },
        devDependencies: { typescript: "~5.9.3" },
      },
      folder,
      pkgPath
    );

    assert.deepStrictEqual(
      libs.map((l) => [l.name, l.version, l.scope]),
      [
        ["react", "^18.3.1", "dependencies"],
        ["typescript", "~5.9.3", "devDependencies"],
      ]
    );
    assert.ok(libs.every((l) => l.packageJsonPath === pkgPath));
    assert.ok(libs.every((l) => l.workspaceFolder === folder));
  });

  test("의존성 필드가 없거나 객체가 아니면 건너뛴다", () => {
    assert.deepStrictEqual(extractLibraries({}, folder, pkgPath), []);
    assert.deepStrictEqual(
      extractLibraries({ dependencies: "oops" }, folder, pkgPath),
      []
    );
  });

  test("peerDependencies 등 다른 필드는 포함하지 않는다", () => {
    const libs = extractLibraries(
      { peerDependencies: { react: "*" }, optionalDependencies: { x: "1" } },
      folder,
      pkgPath
    );
    assert.deepStrictEqual(libs, []);
  });
});
