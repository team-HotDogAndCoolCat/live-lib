import * as assert from "assert";
import {
  compareSemver,
  isSafePackageName,
  isSafeVersion,
  normalizeVersion,
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

suite("compareSemver", () => {
  test("숫자 단위로 비교한다", () => {
    assert.strictEqual(compareSemver("1.10.0", "1.9.0"), 1);
    assert.strictEqual(compareSemver("1.9.0", "1.10.0"), -1);
    assert.strictEqual(compareSemver("2.0.0", "1.99.99"), 1);
  });

  test("같은 버전은 0", () => {
    assert.strictEqual(compareSemver("1.2.3", "1.2.3"), 0);
  });

  test("숫자가 같으면 문자열 비교로 순서를 정한다", () => {
    // 빈 자리는 0으로 보므로 1.2와 1.2.0은 숫자상 같고, 문자열이 짧은 쪽이 앞선다
    assert.ok(compareSemver("1.2", "1.2.0") < 0);
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
