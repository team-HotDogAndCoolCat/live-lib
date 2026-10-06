import * as assert from "assert";
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { LibraryTreeDataProvider, LibraryTreeItem } from "../../libraryTree";
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
    await fs.mkdir(path.join(root, ".git"));

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
      // npm·yarn은 내부 패키지를 "*"처럼 버전 범위로 적는다
      dependencies: { react: "^18.0.0", lodash: "^4.0.0", admin: "*" },
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
    assert.deepStrictEqual([...web.keys()].sort(), ["admin", "lodash", "react"]);
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

  test("워크스페이스 폴더를 펼치면 루트와 하위 패키지가 나란히 나온다", async () => {
    const workspaceItem = new LibraryTreeItem(
      "monorepo",
      vscode.TreeItemCollapsibleState.Collapsed,
      "workspace",
      folder
    );
    const children = await provider.getChildren(workspaceItem);
    assert.deepStrictEqual(
      children.map((item) => [item.type, item.label, item.description]),
      [
        ["package", "(root)", "root"],
        ["package", "apps/admin", "admin"],
        ["package", "apps/web", "web"],
      ]
    );

    // 패키지 줄을 펼치면 그 패키지의 라이브러리가 나온다
    const web = children[2];
    assert.strictEqual(web.packageDir, path.join(root, "apps", "web"));
    const libs = await provider.getChildren(web);
    assert.deepStrictEqual(
      libs.map((item) => item.label).sort(),
      ["admin", "lodash", "react"]
    );
  });

  test("내부 패키지는 레지스트리에서 최신 버전을 조회하지 않는다", async () => {
    const web = await libraries("apps/web");
    // 조회했다면 가짜 레지스트리가 돌려주는 99.0.0이 들어간다
    assert.strictEqual(web.get("react")?.latestVersion, "99.0.0");
    assert.strictEqual(web.get("admin")?.latestVersion, undefined);
    assert.strictEqual(web.get("admin")?.latestLookupFailed, false);
  });

  test("모노레포가 아니면 폴더 아래에 라이브러리가 바로 나온다", async () => {
    const single = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-single-"));
    try {
      await fs.writeFile(
        path.join(single, "package.json"),
        JSON.stringify({ name: "single", dependencies: { react: "^18.0.0" } })
      );
      const singleFolder = { uri: vscode.Uri.file(single), name: "single", index: 0 };
      const children = await provider.getChildren(
        new LibraryTreeItem(
          "single",
          vscode.TreeItemCollapsibleState.Collapsed,
          "workspace",
          singleFolder
        )
      );
      assert.deepStrictEqual(
        children.map((item) => [item.type, item.label]),
        [["library", "react"]]
      );
    } finally {
      await fs.rm(single, { recursive: true, force: true });
    }
  });

  test("하위 패키지 폴더만 열어도 모노레포 루트 기준으로 찾는다", async () => {
    const webDir = path.join(root, "apps", "web");
    const webFolder = { uri: vscode.Uri.file(webDir), name: "web", index: 0 };
    const items = await provider.getLibrariesForPackage(webFolder);
    const web = new Map(
      items.flatMap((item) => (item.library ? [[item.library.name, item.library]] : []))
    );

    // 루트 node_modules에 설치된 버전
    assert.strictEqual(web.get("react")?.installedVersion, "18.3.1");
    // 내부 패키지는 레지스트리에서 조회하지 않는다
    assert.strictEqual(web.get("admin")?.latestVersion, undefined);
    assert.strictEqual(web.get("react")?.latestVersion, "99.0.0");
    // 루트 package.json의 packageManager 필드를 따른다
    assert.deepStrictEqual(web.get("react")?.packageManager, {
      name: "pnpm",
      source: "packageManager field",
    });
    // 사용 여부는 그대로 그 폴더 안에서만 본다
    assert.strictEqual(web.get("react")?.usage, "used");
    assert.strictEqual(web.get("lodash")?.usage, "unused");
  });
});
