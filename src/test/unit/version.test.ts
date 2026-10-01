import * as assert from "assert";
import {
  isOutdated,
  isSafePackageName,
  isSafeVersion,
  normalizeVersion,
  resolveCurrentVersion,
} from "../../version";

suite("normalizeVersion", () => {
  test("범위 기호를 제거한다", () => {
    assert.strictEqual(normalizeVersion("^1.2.3"), "1.2.3");
    assert.strictEqual(normalizeVersion("~1.2.3"), "1.2.3");
    assert.strictEqual(normalizeVersion(">=1.2.3"), "1.2.3");
    assert.strictEqual(normalizeVersion("  1.2.3  "), "1.2.3");
  });

  test("값이 없거나 와일드카드뿐이면 undefined", () => {
    assert.strictEqual(normalizeVersion(undefined), undefined);
    assert.strictEqual(normalizeVersion(""), undefined);
    assert.strictEqual(normalizeVersion("*"), undefined);
  });
});

suite("resolveCurrentVersion", () => {
  test("설치된 버전이 있으면 그 버전을 쓴다", () => {
    // package.json에는 ^1.2.0이지만 실제로는 1.9.0이 설치된 경우
    assert.strictEqual(resolveCurrentVersion("^1.2.0", "1.9.0"), "1.9.0");
  });

  test("설치되지 않았으면 범위가 허용하는 최소 버전을 쓴다", () => {
    assert.strictEqual(resolveCurrentVersion("^1.2.0"), "1.2.0");
    assert.strictEqual(resolveCurrentVersion("~3.4.5"), "3.4.5");
    assert.strictEqual(resolveCurrentVersion("1.x"), "1.0.0");
    assert.strictEqual(resolveCurrentVersion(">=2.1.0 <3"), "2.1.0");
  });

  test("설치된 버전이 semver가 아니면 범위로 판단한다", () => {
    assert.strictEqual(resolveCurrentVersion("^1.2.0", "not-a-version"), "1.2.0");
  });

  test("비교할 수 없는 범위는 undefined", () => {
    for (const range of [
      "*",
      "latest",
      "workspace:*",
      "file:../local",
      "github:user/repo",
      "npm:other@^1.0.0",
    ]) {
      assert.strictEqual(resolveCurrentVersion(range), undefined, range);
    }
  });
});

suite("isOutdated", () => {
  test("최신 버전이 더 높으면 true", () => {
    assert.ok(isOutdated("1.9.0", "2.0.0"));
    assert.ok(isOutdated("1.9.0", "1.10.0"));
  });

  test("같거나 낮으면 false", () => {
    assert.ok(!isOutdated("2.0.0", "2.0.0"));
    assert.ok(!isOutdated("2.1.0", "2.0.0"));
  });

  test("프리릴리스는 정식 버전보다 낮다", () => {
    assert.ok(isOutdated("2.0.0-beta.1", "2.0.0"));
    assert.ok(!isOutdated("2.0.0", "2.0.0-beta.1"));
  });

  test("값이 없거나 최신 버전이 semver가 아니면 false", () => {
    assert.ok(!isOutdated(undefined, "2.0.0"));
    assert.ok(!isOutdated("1.0.0", undefined));
    assert.ok(!isOutdated("1.0.0", "garbage"));
  });
});

suite("isSafePackageName", () => {
  test("정상적인 npm 패키지 이름은 허용한다", () => {
    for (const name of [
      "react",
      "@types/node",
      "lodash.merge",
      "JSONStream",
      "@babel/core",
      "left-pad",
      "a_b",
    ]) {
      assert.ok(isSafePackageName(name), name);
    }
  });

  test("셸 메타문자나 옵션처럼 보이는 이름은 거부한다", () => {
    for (const name of [
      "foo; rm -rf ~",
      "$(whoami)",
      "x`id`",
      "a && b",
      "foo bar",
      "--registry=http://evil",
      "-g",
      "@scope/../x",
      "",
    ]) {
      assert.ok(!isSafePackageName(name), name);
    }
  });

  test("214자를 넘으면 거부한다", () => {
    assert.ok(isSafePackageName("a".repeat(214)));
    assert.ok(!isSafePackageName("a".repeat(215)));
  });
});

suite("isSafeVersion", () => {
  test("semver 형식은 허용한다", () => {
    for (const v of ["18.3.1", "5.0.0-beta.1", "1.0.0+build.5"]) {
      assert.ok(isSafeVersion(v), v);
    }
  });

  test("셸 메타문자가 섞이면 거부한다", () => {
    for (const v of ["1.0.0;id", "$(id)", "1.0.0 && x", "-1.0.0"]) {
      assert.ok(!isSafeVersion(v), v);
    }
  });
});
