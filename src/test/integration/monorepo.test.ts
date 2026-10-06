import * as assert from "assert";
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { LibraryTreeDataProvider } from "../../libraryTree";
import { LibraryMetadataService } from "../../registry";

suite("Monorepo", () => {
  let root: string;
  let provider: LibraryTreeDataProvider;
  let folder: vscode.WorkspaceFolder;

  const write = async (file: string, contents: string | object) => {
    const full = path.join(root, ...file.split("/"));
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(
      full,
      typeof contents === "string" ? contents : JSON.stringify(contents)
    );
  };

  const libraries = async (packageDir?: string) => {
    const items = await provider.getLibrariesForPackage(
      folder,
      packageDir && path.join(root, ...packageDir.split("/"))
    );
    return new Map(
      items.flatMap((item) => (item.library ? [[item.library.name, item.library]] : []))
    );
  };

  suiteSetup(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-monorepo-"));
    folder = { uri: vscode.Uri.file(root), name: "monorepo", index: 0 };

    // npm처럼 하위 패키지의 의존성을 루트 node_modules에 모아 설치한 상태
    await write("package.json", {
      name: "root",
      private: true,
      packageManager: "pnpm@9.15.0",
      workspaces: ["apps/*"],
      dependencies: { "shared-lib": "^1.0.0" },
    });
    await write("node_modules/shared-lib/package.json", { version: "1.2.0" });
    await write("node_modules/react/package.json", { version: "18.3.1" });
    await write("node_modules/lodash/package.json", { version: "4.17.21" });

    await write("apps/web/package.json", {
      name: "web",
      dependencies: { react: "^18.0.0", lodash: "^4.0.0" },
    });
    await write(
      "apps/web/src/index.ts",
      `import React from "react";\nimport { helper } from "shared-lib";\n`
    );
    await write("apps/admin/package.json", {
      name: "admin",
      dependencies: { lodash: "^4.0.0" },
    });
    await write("apps/admin/src/index.ts", `import _ from "lodash";\n`);

    provider = new LibraryTreeDataProvider(
      new LibraryMetadataService({
        fetchJson: async () => ({ version: "99.0.0" }),
      })
    );
  });

  suiteTeardown(async () => {
    provider.dispose();
    await fs.rm(root, { recursive: true, force: true });
  });

  test("하위 패키지의 설치 버전을 루트 node_modules에서 찾는다", async () => {
    const web = await libraries("apps/web");
    assert.deepStrictEqual([...web.keys()].sort(), ["lodash", "react"]);
    assert.strictEqual(web.get("react")?.installedVersion, "18.3.1");
    assert.strictEqual(web.get("lodash")?.installedVersion, "4.17.21");
    assert.strictEqual(
      web.get("react")?.packageJsonPath,
      path.join(root, "apps", "web", "package.json")
    );
  });

  test("하위 패키지의 사용 여부는 그 패키지 폴더 안에서만 판단한다", async () => {
    const web = await libraries("apps/web");
    // apps/admin은 lodash를 쓰지만 apps/web은 쓰지 않는다
    assert.strictEqual(web.get("react")?.usage, "used");
    assert.strictEqual(web.get("lodash")?.usage, "unused");

    const admin = await libraries("apps/admin");
    assert.strictEqual(admin.get("lodash")?.usage, "used");
  });

  test("루트 의존성은 하위 패키지의 코드까지 보고 판단한다", async () => {
    const rootLibs = await libraries();
    assert.strictEqual(rootLibs.get("shared-lib")?.usage, "used");
    assert.strictEqual(rootLibs.get("shared-lib")?.installedVersion, "1.2.0");
  });

  test("하위 패키지는 루트의 packageManager 필드로 매니저를 정한다", async () => {
    const web = await libraries("apps/web");
    assert.deepStrictEqual(web.get("react")?.packageManager, {
      name: "pnpm",
      source: "packageManager field",
    });
  });
});
