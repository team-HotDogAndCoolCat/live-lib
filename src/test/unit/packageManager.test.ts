import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import {
  buildInstallCommand,
  buildRemoveCommand,
  detectPackageManager,
  parsePackageManagerField,
  parsePackageManagerSetting,
  pickByLockfile,
} from "../../packageManager";

suite("parsePackageManagerField", () => {
  test("packageManager 필드에서 매니저 이름을 읽는다", () => {
    assert.strictEqual(parsePackageManagerField("pnpm@9.1.0"), "pnpm");
    assert.strictEqual(parsePackageManagerField("yarn@4.0.2+sha256.abc"), "yarn");
    assert.strictEqual(parsePackageManagerField("npm@10.0.0"), "npm");
    assert.strictEqual(parsePackageManagerField("bun@1.1.0"), "bun");
  });

  test("알 수 없는 값이면 undefined", () => {
    assert.strictEqual(parsePackageManagerField("deno@1.0.0"), undefined);
    assert.strictEqual(parsePackageManagerField(undefined), undefined);
    assert.strictEqual(parsePackageManagerField(42), undefined);
  });
});

suite("parsePackageManagerSetting", () => {
  test("지정한 매니저를 돌려준다", () => {
    for (const pm of ["npm", "pnpm", "yarn", "bun"]) {
      assert.strictEqual(parsePackageManagerSetting(pm), pm);
    }
  });

  test("auto나 알 수 없는 값이면 undefined", () => {
    assert.strictEqual(parsePackageManagerSetting("auto"), undefined);
    assert.strictEqual(parsePackageManagerSetting("deno"), undefined);
    assert.strictEqual(parsePackageManagerSetting(undefined), undefined);
  });
});

suite("pickByLockfile", () => {
  test("lockfile 종류로 매니저를 고른다", () => {
    assert.strictEqual(pickByLockfile(["pnpm-lock.yaml"])?.name, "pnpm");
    assert.strictEqual(pickByLockfile(["yarn.lock"])?.name, "yarn");
    assert.strictEqual(pickByLockfile(["bun.lockb"])?.name, "bun");
    assert.strictEqual(pickByLockfile(["bun.lock"])?.name, "bun");
    assert.strictEqual(pickByLockfile(["package-lock.json"])?.name, "npm");
  });

  test("다른 매니저 lockfile과 package-lock.json이 함께 있으면 다른 매니저를 우선한다", () => {
    // pnpm 프로젝트에서 실수로 npm install을 해 package-lock.json이 생긴 경우
    assert.strictEqual(
      pickByLockfile(["package-lock.json", "pnpm-lock.yaml"])?.name,
      "pnpm"
    );
  });

  test("lockfile이 없으면 undefined", () => {
    assert.strictEqual(pickByLockfile(["package.json", "README.md"]), undefined);
  });
});

suite("detectPackageManager", () => {
  let root: string;

  setup(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-pm-"));
  });

  teardown(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test("설정으로 지정한 매니저를 가장 우선한다", async () => {
    await fs.writeFile(path.join(root, "yarn.lock"), "");
    assert.deepStrictEqual(
      await detectPackageManager(root, { packageManager: "npm@10.0.0" }, "pnpm"),
      { name: "pnpm", source: "liveLib.packageManager setting" }
    );
  });

  test("설정이 auto면 자동 감지한다", async () => {
    await fs.writeFile(path.join(root, "yarn.lock"), "");
    assert.deepStrictEqual(await detectPackageManager(root, {}, "auto"), {
      name: "yarn",
      source: "yarn.lock",
    });
  });

  test("packageManager 필드를 lockfile보다 우선한다", async () => {
    await fs.writeFile(path.join(root, "package-lock.json"), "{}");
    assert.deepStrictEqual(
      await detectPackageManager(root, { packageManager: "pnpm@9.1.0" }),
      { name: "pnpm", source: "packageManager field" }
    );
  });

  test("프로젝트 루트의 lockfile로 감지한다", async () => {
    await fs.writeFile(path.join(root, "yarn.lock"), "");
    assert.deepStrictEqual(await detectPackageManager(root, {}), {
      name: "yarn",
      source: "yarn.lock",
    });
  });

  test("모노레포 하위 패키지면 상위 폴더의 lockfile을 찾는다", async () => {
    const pkgDir = path.join(root, "packages", "app");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "");
    assert.deepStrictEqual(await detectPackageManager(pkgDir, {}), {
      name: "pnpm",
      source: path.join("..", "..", "pnpm-lock.yaml"),
    });
  });

  test(".git이 있는 저장소 루트 위로는 찾지 않는다", async () => {
    const repo = path.join(root, "repo");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    // 저장소 바깥(상위 폴더)의 lockfile은 다른 프로젝트 것이다
    await fs.writeFile(path.join(root, "yarn.lock"), "");
    assert.deepStrictEqual(await detectPackageManager(repo, {}), {
      name: "npm",
      source: "default",
    });
  });
});

suite("buildInstallCommand", () => {
  test("매니저별 설치 명령을 만든다", () => {
    assert.strictEqual(
      buildInstallCommand("npm", "react", "18.3.1", "dependencies"),
      "npm install react@18.3.1"
    );
    assert.strictEqual(
      buildInstallCommand("pnpm", "react", "18.3.1", "dependencies"),
      "pnpm add react@18.3.1"
    );
    assert.strictEqual(
      buildInstallCommand("yarn", "react", "18.3.1", "dependencies"),
      "yarn add react@18.3.1"
    );
    assert.strictEqual(
      buildInstallCommand("bun", "react", "18.3.1", "dependencies"),
      "bun add react@18.3.1"
    );
  });

  test("devDependencies는 dev 플래그를 붙여 위치가 바뀌지 않게 한다", () => {
    assert.strictEqual(
      buildInstallCommand("npm", "eslint", "9.39.5", "devDependencies"),
      "npm install --save-dev eslint@9.39.5"
    );
    assert.strictEqual(
      buildInstallCommand("pnpm", "eslint", "9.39.5", "devDependencies"),
      "pnpm add --save-dev eslint@9.39.5"
    );
    assert.strictEqual(
      buildInstallCommand("yarn", "eslint", "9.39.5", "devDependencies"),
      "yarn add --dev eslint@9.39.5"
    );
    assert.strictEqual(
      buildInstallCommand("bun", "eslint", "9.39.5", "devDependencies"),
      "bun add --dev eslint@9.39.5"
    );
  });
});

suite("buildRemoveCommand", () => {
  test("매니저별 삭제 명령을 만든다", () => {
    assert.strictEqual(buildRemoveCommand("npm", "lodash"), "npm uninstall lodash");
    assert.strictEqual(buildRemoveCommand("pnpm", "lodash"), "pnpm remove lodash");
    assert.strictEqual(buildRemoveCommand("yarn", "lodash"), "yarn remove lodash");
    assert.strictEqual(buildRemoveCommand("bun", "lodash"), "bun remove lodash");
  });
});
