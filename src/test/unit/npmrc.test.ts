import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import {
  DEFAULT_REGISTRY,
  isRegistrySpecifier,
  mergeRegistryConfigs,
  parseNpmrc,
  readRegistryConfig,
  resolveRegistry,
} from "../../npmrc";

suite("parseNpmrc", () => {
  test("registry와 @scope:registry만 읽는다", () => {
    const config = parseNpmrc(
      [
        "registry=https://npm.mycompany.com/",
        "@mycompany:registry = https://npm.pkg.github.com",
        "//npm.pkg.github.com/:_authToken=secret-token",
        "save-exact=true",
      ].join("\n")
    );
    assert.deepStrictEqual(config, {
      registry: "https://npm.mycompany.com/",
      scopes: { "@mycompany": "https://npm.pkg.github.com" },
    });
    // 인증 토큰은 어디에도 남지 않는다
    assert.ok(!JSON.stringify(config).includes("secret-token"));
  });

  test("주석, 빈 줄, 따옴표를 처리한다", () => {
    const config = parseNpmrc('# comment\n; comment\n\nregistry="https://r.example.com"\n');
    assert.strictEqual(config.registry, "https://r.example.com");
  });

  test("${VAR} 환경 변수를 치환하고, 값이 없으면 그 줄을 버린다", () => {
    const env = { REGISTRY_HOST: "npm.internal" };
    assert.strictEqual(
      parseNpmrc("registry=https://${REGISTRY_HOST}/", env).registry,
      "https://npm.internal/"
    );
    assert.strictEqual(parseNpmrc("registry=https://${MISSING}/", env).registry, undefined);
  });
});

suite("mergeRegistryConfigs", () => {
  test("뒤의 설정이 앞의 설정을 덮어쓴다", () => {
    const merged = mergeRegistryConfigs([
      { registry: "https://home.example.com", scopes: { "@a": "https://a-home" } },
      { scopes: { "@a": "https://a-project", "@b": "https://b-project" } },
    ]);
    assert.deepStrictEqual(merged, {
      registry: "https://home.example.com",
      scopes: { "@a": "https://a-project", "@b": "https://b-project" },
    });
  });
});

suite("resolveRegistry", () => {
  const config = {
    registry: "https://npm.mycompany.com/",
    scopes: { "@gh": "https://npm.pkg.github.com/" },
  };

  test("scope 레지스트리 → registry → npm 공식 레지스트리 순으로 고른다", () => {
    assert.strictEqual(resolveRegistry(config, "@gh/utils"), "https://npm.pkg.github.com");
    assert.strictEqual(resolveRegistry(config, "react"), "https://npm.mycompany.com");
    assert.strictEqual(resolveRegistry(config, "@other/pkg"), "https://npm.mycompany.com");
    assert.strictEqual(resolveRegistry({ scopes: {} }, "react"), DEFAULT_REGISTRY);
  });

  test("경로가 있는 레지스트리 주소를 유지한다", () => {
    assert.strictEqual(
      resolveRegistry({ registry: "https://repo.example.com/api/npm/npm-remote/", scopes: {} }, "x"),
      "https://repo.example.com/api/npm/npm-remote"
    );
  });

  test("http(s)가 아니거나 잘못된 주소는 무시한다", () => {
    assert.strictEqual(resolveRegistry({ registry: "file:///tmp/registry", scopes: {} }, "x"), DEFAULT_REGISTRY);
    assert.strictEqual(resolveRegistry({ registry: "not a url", scopes: {} }, "x"), DEFAULT_REGISTRY);
  });
});

suite("isRegistrySpecifier", () => {
  test("버전 범위와 태그는 레지스트리에서 조회한다", () => {
    for (const spec of ["^1.2.0", "~1.0.0", "1.2.3", "*", "latest", ">=1 <2", "1.x"]) {
      assert.ok(isRegistrySpecifier(spec), spec);
    }
  });

  test("레지스트리에 없는 표기는 조회하지 않는다", () => {
    for (const spec of [
      "workspace:*",
      "file:../lib",
      "link:../lib",
      "git+https://github.com/u/r.git",
      "github:user/repo",
      "user/repo",
      "https://example.com/pkg.tgz",
      "npm:other@^1.0.0",
    ]) {
      assert.ok(!isRegistrySpecifier(spec), spec);
    }
  });
});

suite("readRegistryConfig", () => {
  let root: string;

  setup(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-npmrc-"));
  });

  teardown(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test("사용자 홈 → 저장소 루트 → 프로젝트 순으로 합친다", async () => {
    const home = path.join(root, "home");
    const repo = path.join(root, "repo");
    const app = path.join(repo, "packages", "app");
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    await fs.mkdir(app, { recursive: true });

    await fs.writeFile(
      path.join(home, ".npmrc"),
      "registry=https://home.example.com\n@a:registry=https://a-home\n"
    );
    await fs.writeFile(path.join(repo, ".npmrc"), "@a:registry=https://a-repo\n");
    await fs.writeFile(path.join(app, ".npmrc"), "@b:registry=https://b-app\n");
    // 저장소 바깥의 .npmrc는 읽지 않는다
    await fs.writeFile(path.join(root, ".npmrc"), "registry=https://outside.example.com\n");

    assert.deepStrictEqual(await readRegistryConfig(app, home, {}), {
      registry: "https://home.example.com",
      scopes: { "@a": "https://a-repo", "@b": "https://b-app" },
    });
  });

  test(".npmrc가 하나도 없으면 빈 설정", async () => {
    const repo = path.join(root, "repo");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    assert.deepStrictEqual(await readRegistryConfig(repo, path.join(root, "nohome"), {}), {
      registry: undefined,
      scopes: {},
    });
  });
});
