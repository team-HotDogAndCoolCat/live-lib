import * as assert from "assert";
import {
  isOutdated,
  isSafePackageName,
  isSafeVersion,
  normalizeVersion,
  planUpdate,
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

suite("planUpdate", () => {
  const versions = ["17.0.0", "18.0.0", "18.2.0", "18.3.1", "19.0.0-rc.1", "19.1.0"];

  test("범위 안의 업데이트는 major가 아니다", () => {
    assert.deepStrictEqual(
      planUpdate({
        declaredRange: "^18.0.0",
        currentVersion: "18.2.0",
        latestVersion: "18.3.1",
        versions,
      }),
      { latest: "18.3.1", isMajor: false, wanted: undefined }
    );
  });

  test("범위를 벗어나면 major이고, 범위 내 최신 버전을 함께 알려준다", () => {
    assert.deepStrictEqual(
      planUpdate({
        declaredRange: "^18.0.0",
        currentVersion: "18.2.0",
        latestVersion: "19.1.0",
        versions,
      }),
      { latest: "19.1.0", isMajor: true, wanted: "18.3.1" }
    );
  });

  test("이미 범위 내 최신이면 wanted는 없다", () => {
    const plan = planUpdate({
      declaredRange: "^18.0.0",
      currentVersion: "18.3.1",
      latestVersion: "19.1.0",
      versions,
    });
    assert.strictEqual(plan?.isMajor, true);
    assert.strictEqual(plan?.wanted, undefined);
  });

  test("0.x 버전은 minor 변경도 범위를 벗어나면 major로 본다", () => {
    const plan = planUpdate({
      declaredRange: "^0.2.0",
      currentVersion: "0.2.5",
      latestVersion: "0.3.0",
      versions: ["0.2.5", "0.2.9", "0.3.0"],
    });
    assert.deepStrictEqual(plan, { latest: "0.3.0", isMajor: true, wanted: "0.2.9" });
  });

  test("~ 범위는 minor 변경도 범위 밖이다", () => {
    const plan = planUpdate({
      declaredRange: "~1.2.0",
      currentVersion: "1.2.3",
      latestVersion: "1.3.0",
    });
    assert.strictEqual(plan?.isMajor, true);
  });

  test("범위를 해석할 수 없으면 semver major 자리로 판단한다", () => {
    assert.strictEqual(
      planUpdate({ declaredRange: "*", currentVersion: "1.9.0", latestVersion: "2.0.0" })?.isMajor,
      true
    );
    assert.strictEqual(
      planUpdate({ declaredRange: "latest", currentVersion: "1.9.0", latestVersion: "1.10.0" })?.isMajor,
      false
    );
  });

  test("업데이트할 게 없으면 undefined", () => {
    assert.strictEqual(
      planUpdate({ declaredRange: "^18.0.0", currentVersion: "18.3.1", latestVersion: "18.3.1" }),
      undefined
    );
    assert.strictEqual(
      planUpdate({ declaredRange: "workspace:*", currentVersion: undefined, latestVersion: "1.0.0" }),
      undefined
    );
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
