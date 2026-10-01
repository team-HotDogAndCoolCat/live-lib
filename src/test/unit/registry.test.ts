import * as assert from "assert";
import { parsePackument } from "../../registry";

suite("parsePackument", () => {
  test("latest 태그의 버전 정보를 쓴다", () => {
    const result = parsePackument({
      description: "top-level",
      homepage: "https://top.example",
      "dist-tags": { latest: "2.0.0" },
      versions: {
        "1.0.0": { description: "old", homepage: "https://old.example" },
        "2.0.0": { description: "new", homepage: "https://new.example" },
      },
    });

    assert.deepStrictEqual(result, {
      description: "new",
      homepage: "https://new.example",
      latestVersion: "2.0.0",
      versions: ["1.0.0", "2.0.0"],
    });
  });

  test("latest 버전에 정보가 없으면 정보가 있는 가장 높은 버전을 쓴다", () => {
    const result = parsePackument({
      "dist-tags": { latest: "3.0.0" },
      versions: {
        "1.0.0": { description: "v1" },
        "2.0.0": { description: "v2", homepage: "https://v2.example" },
        "3.0.0": {},
      },
    });

    assert.strictEqual(result.description, "v2");
    assert.strictEqual(result.homepage, "https://v2.example");
    assert.strictEqual(result.latestVersion, "3.0.0");
  });

  test("버전 정보가 없으면 최상위 필드를 쓴다", () => {
    const result = parsePackument({
      description: "top-level",
      homepage: "https://top.example",
    });

    assert.deepStrictEqual(result, {
      description: "top-level",
      homepage: "https://top.example",
      latestVersion: undefined,
      versions: [],
    });
  });

  test("semver 형식이 아닌 버전 키는 목록에서 뺀다", () => {
    const result = parsePackument({
      versions: { "1.0.0": {}, "not-a-version": {}, "2.0.0-beta.1": {} },
    });
    assert.deepStrictEqual(result.versions, ["1.0.0", "2.0.0-beta.1"]);
  });
});
