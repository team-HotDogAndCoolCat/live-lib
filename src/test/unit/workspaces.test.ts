import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import {
  discoverWorkspacePackages,
  findWorkspacePackages,
  findWorkspaceRoot,
  globToRegExp,
  parsePnpmWorkspaceYaml,
  parseWorkspacesField,
  readWorkspacePatterns,
} from "../../workspaces";

suite("parseWorkspacesField", () => {
  test("배열 형식을 읽는다", () => {
    assert.deepStrictEqual(parseWorkspacesField(["apps/*", "packages/*"]), [
      "apps/*",
      "packages/*",
    ]);
  });

  test("yarn classic의 { packages } 형식을 읽는다", () => {
    assert.deepStrictEqual(
      parseWorkspacesField({ packages: ["apps/*"], nohoist: ["**/react"] }),
      ["apps/*"]
    );
  });

  test("문자열이 아닌 항목은 버린다", () => {
    assert.deepStrictEqual(parseWorkspacesField(["apps/*", 1, null]), [
      "apps/*",
    ]);
  });

  test("workspaces가 없거나 형식이 다르면 undefined", () => {
    assert.strictEqual(parseWorkspacesField(undefined), undefined);
    assert.strictEqual(parseWorkspacesField("apps/*"), undefined);
    assert.strictEqual(parseWorkspacesField({ nohoist: ["x"] }), undefined);
  });
});

suite("parsePnpmWorkspaceYaml", () => {
  test("packages 목록을 따옴표와 주석을 빼고 읽는다", () => {
    const yaml = [
      "# 모노레포 설정",
      "packages:",
      "  - 'apps/*'",
      '  - "packages/*" # 공용 패키지',
      "  - tools/*",
      "",
      "  # 테스트 폴더는 뺀다",
      "  - '!**/test/**'",
    ].join("\n");
    assert.deepStrictEqual(parsePnpmWorkspaceYaml(yaml), [
      "apps/*",
      "packages/*",
      "tools/*",
      "!**/test/**",
    ]);
  });

  test("다음 최상위 키가 나오면 멈춘다", () => {
    const yaml = [
      "packages:",
      "  - apps/*",
      "catalog:",
      "  - react: ^19.0.0",
    ].join("\r\n");
    assert.deepStrictEqual(parsePnpmWorkspaceYaml(yaml), ["apps/*"]);
  });

  test("한 줄 배열 형식을 읽는다", () => {
    assert.deepStrictEqual(
      parsePnpmWorkspaceYaml("packages: ['apps/*', \"packages/*\"]"),
      ["apps/*", "packages/*"]
    );
  });

  test("packages가 없으면 빈 배열", () => {
    assert.deepStrictEqual(parsePnpmWorkspaceYaml("catalog:\n  react: 19"), []);
    assert.deepStrictEqual(parsePnpmWorkspaceYaml(""), []);
  });
});

suite("globToRegExp", () => {
  test("* 는 폴더 하나 안에서만 맞는다", () => {
    const regex = globToRegExp("apps/*");
    assert.ok(regex.test("apps/web"));
    assert.ok(!regex.test("apps/web/sub"));
    assert.ok(!regex.test("packages/web"));
  });

  test("** 는 0개 이상의 폴더에 맞는다", () => {
    const regex = globToRegExp("**/test/**");
    assert.ok(regex.test("test"));
    assert.ok(regex.test("packages/test"));
    assert.ok(regex.test("packages/test/fixture"));
    assert.ok(!regex.test("packages/testing"));
  });

  test("./ 와 끝의 / 를 무시한다", () => {
    assert.ok(globToRegExp("./apps/web/").test("apps/web"));
  });
});

suite("findWorkspacePackages", () => {
  let root: string;

  async function addPackage(relative: string, name?: string) {
    const dir = path.join(root, ...relative.split("/"));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(name ? { name } : {})
    );
  }

  setup(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-ws-"));
    await addPackage("", "root");
    await addPackage("apps/web", "web");
    await addPackage("apps/admin", "@acme/admin");
    await addPackage("packages/ui", "@acme/ui");
    await addPackage("packages/ui/node_modules/dep", "dep");
    await addPackage("packages/test/fixture", "fixture");
    await addPackage("packages/.cache/tmp", "tmp");
    await fs.mkdir(path.join(root, "apps", "docs"), { recursive: true });
  });

  teardown(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test("package.json이 있는 폴더만 이름순으로 찾는다", async () => {
    const found = await findWorkspacePackages(root, ["apps/*"]);
    assert.deepStrictEqual(found, [
      {
        dir: path.join(root, "apps", "admin"),
        relativePath: "apps/admin",
        name: "@acme/admin",
      },
      {
        dir: path.join(root, "apps", "web"),
        relativePath: "apps/web",
        name: "web",
      },
    ]);
  });

  test("** 는 node_modules와 . 폴더로 내려가지 않고, ! 패턴은 뺀다", async () => {
    const found = await findWorkspacePackages(root, [
      "packages/**",
      "!**/test/**",
    ]);
    assert.deepStrictEqual(
      found.map((pkg) => pkg.relativePath),
      ["packages/ui"]
    );
  });

  test("glob 없는 경로와 중복 패턴도 처리한다", async () => {
    const found = await findWorkspacePackages(root, [
      "./apps/web",
      "apps/*",
      "apps/missing",
    ]);
    assert.deepStrictEqual(
      found.map((pkg) => pkg.relativePath),
      ["apps/admin", "apps/web"]
    );
  });

  test("루트 자신과 상위 폴더는 패키지로 보지 않는다", async () => {
    const found = await findWorkspacePackages(root, [".", "../*"]);
    assert.deepStrictEqual(found, []);
  });

  test("name이 없으면 name은 undefined", async () => {
    await addPackage("tools/script");
    const [found] = await findWorkspacePackages(root, ["tools/*"]);
    assert.strictEqual(found.relativePath, "tools/script");
    assert.strictEqual(found.name, undefined);
  });

  test("pnpm-workspace.yaml이 있으면 workspaces 필드보다 우선한다", async () => {
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n"
    );
    assert.deepStrictEqual(
      await readWorkspacePatterns(root, { workspaces: ["apps/*"] }),
      { patterns: ["packages/*"], source: "pnpm-workspace.yaml" }
    );
    const found = await discoverWorkspacePackages(root, {
      workspaces: ["apps/*"],
    });
    // packages/test 자체에는 package.json이 없어서 빠진다
    assert.deepStrictEqual(
      found.map((pkg) => pkg.relativePath),
      ["packages/ui"]
    );
  });

  test("모노레포가 아니면 빈 배열", async () => {
    assert.strictEqual(await readWorkspacePatterns(root, {}), undefined);
    assert.deepStrictEqual(await discoverWorkspacePackages(root, {}), []);
  });
});

suite("findWorkspaceRoot", () => {
  let base: string;

  const write = async (file: string, contents: string | object) => {
    const full = path.join(base, ...file.split("/"));
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(
      full,
      typeof contents === "string" ? contents : JSON.stringify(contents)
    );
  };
  const dir = (relative: string) => path.join(base, ...relative.split("/"));

  setup(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-wsroot-"));
  });

  teardown(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  test("선언된 하위 패키지면 모노레포 루트를 찾는다", async () => {
    await fs.mkdir(dir("repo/.git"), { recursive: true });
    await write("repo/package.json", { workspaces: ["apps/*"] });
    await write("repo/apps/web/package.json", { name: "web" });
    assert.strictEqual(await findWorkspaceRoot(dir("repo/apps/web")), dir("repo"));
  });

  test("pnpm-workspace.yaml로 선언된 패키지도 찾는다", async () => {
    await fs.mkdir(dir("repo/.git"), { recursive: true });
    await write("repo/package.json", { name: "root" });
    await write("repo/pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    await write("repo/packages/ui/package.json", { name: "ui" });
    assert.strictEqual(await findWorkspaceRoot(dir("repo/packages/ui")), dir("repo"));
  });

  test("같은 저장소 안이라도 선언되지 않은 폴더는 undefined", async () => {
    await fs.mkdir(dir("repo/.git"), { recursive: true });
    await write("repo/package.json", { workspaces: ["apps/*"] });
    await write("repo/tools/script/package.json", { name: "script" });
    assert.strictEqual(await findWorkspaceRoot(dir("repo/tools/script")), undefined);
  });

  test("모노레포 루트 자신을 열었으면 undefined", async () => {
    await fs.mkdir(dir("repo/.git"), { recursive: true });
    await write("repo/package.json", { workspaces: ["apps/*"] });
    assert.strictEqual(await findWorkspaceRoot(dir("repo")), undefined);
  });

  test("저장소 루트(.git)보다 위로는 올라가지 않는다", async () => {
    // 저장소 밖의 폴더가 우연히 이 패키지를 가리키는 workspaces를 갖고 있어도 무시한다
    await write("package.json", { workspaces: ["repo/apps/*"] });
    await fs.mkdir(dir("repo/.git"), { recursive: true });
    await write("repo/package.json", { name: "repo" });
    await write("repo/apps/web/package.json", { name: "web" });
    assert.strictEqual(await findWorkspaceRoot(dir("repo/apps/web")), undefined);
  });
});
