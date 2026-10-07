import * as assert from "assert";
import { buildLibraryView } from "../../libraryView";

suite("buildLibraryView", () => {
  const base = {
    name: "react",
    scope: "dependencies" as const,
    usage: "used" as const,
  };

  test("범위는 낮아도 최신 버전이 설치돼 있으면 outdated가 아니다 (#28)", () => {
    const view = buildLibraryView({
      ...base,
      version: "^18.0.0",
      installedVersion: "18.3.1",
      latestVersion: "18.3.1",
    });

    assert.strictEqual(view.description, "18.3.1");
    assert.strictEqual(view.contextValue, "libraryItem");
    assert.strictEqual(view.icon, "package");
  });

  test("범위를 벗어난 최신 버전은 major로 표시한다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^18.0.0",
      installedVersion: "18.2.0",
      latestVersion: "19.1.0",
    });

    assert.strictEqual(view.description, "18.2.0 → 19.1.0 (major)");
    assert.strictEqual(view.contextValue, "libraryItemOutdated");
    assert.strictEqual(view.icon, "warning");
  });

  test("설치되지 않았으면 범위의 최소 버전으로 판단한다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^18.0.0",
      latestVersion: "18.3.1",
    });

    assert.strictEqual(view.description, "18.0.0 → 18.3.1");
    assert.strictEqual(view.contextValue, "libraryItemOutdated");
    assert.ok(view.tooltip.includes("Not installed"));
  });

  test("비교할 수 없는 범위는 원래 표기 그대로 보여주고 outdated로 보지 않는다", () => {
    const view = buildLibraryView({
      ...base,
      version: "workspace:*",
      latestVersion: "1.0.0",
    });

    assert.strictEqual(view.description, "workspace:*");
    assert.strictEqual(view.contextValue, "libraryItem");
  });

  test("미사용 라이브러리 표시", () => {
    const view = buildLibraryView({
      ...base,
      version: "^1.0.0",
      installedVersion: "1.0.0",
      latestVersion: "1.0.0",
      usage: "unused",
    });

    assert.strictEqual(view.description, "1.0.0 (unused)");
    assert.strictEqual(view.contextValue, "libraryItemUnused");
    assert.strictEqual(view.icon, "circle-slash");
  });

  test("업데이트할 수 있어도 미사용이면 미사용 표시를 우선하고 업데이트 버튼은 남긴다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^1.0.0",
      installedVersion: "1.0.0",
      latestVersion: "1.2.0",
      usage: "unused",
    });

    assert.strictEqual(view.description, "1.0.0 (unused)");
    assert.strictEqual(view.icon, "circle-slash");
    assert.strictEqual(view.contextValue, "libraryItemOutdated");
    assert.ok(view.tooltip.includes("Latest: 1.2.0"));
    assert.ok(view.tooltip.includes("Unused"));
  });

  test("major 업데이트가 있어도 미사용이면 미사용 표시를 우선하고 major 경고는 툴팁에 남긴다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^1.0.0",
      installedVersion: "1.0.0",
      latestVersion: "2.0.0",
      usage: "unused",
    });

    assert.strictEqual(view.description, "1.0.0 (unused)");
    assert.strictEqual(view.icon, "circle-slash");
    assert.strictEqual(view.contextValue, "libraryItemOutdated");
    assert.ok(view.tooltip.includes("Major update"));
  });

  test("not detected는 업데이트 표시를 그대로 우선한다", () => {
    const view = buildLibraryView({
      ...base,
      scope: "devDependencies",
      version: "^1.0.0",
      installedVersion: "1.0.0",
      latestVersion: "2.0.0",
      usage: "unverified",
    });

    assert.strictEqual(view.description, "1.0.0 → 2.0.0 (major)");
    assert.strictEqual(view.icon, "warning");
    assert.strictEqual(view.contextValue, "libraryItemOutdated");
  });

  test("devDependencies는 비커 아이콘", () => {
    const view = buildLibraryView({
      ...base,
      scope: "devDependencies",
      version: "^5.0.0",
      installedVersion: "5.9.3",
      latestVersion: "5.9.3",
    });

    assert.strictEqual(view.icon, "beaker");
  });

  test("툴팁에 설치 버전, 선언 범위, 최신 버전을 모두 보여준다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^18.0.0",
      installedVersion: "18.2.0",
      latestVersion: "19.1.0",
    });

    assert.strictEqual(
      view.tooltip,
      "react (dependencies) • Installed: 18.2.0 • Declared: ^18.0.0 • Latest: 19.1.0" +
        " • Major update: outside ^18.0.0, may include breaking changes"
    );
  });

  test("사용 근거가 없는 devDependency는 not detected로 표시하고 삭제 버튼은 유지한다", () => {
    const view = buildLibraryView({
      ...base,
      name: "husky",
      scope: "devDependencies",
      version: "^9.0.0",
      installedVersion: "9.1.0",
      latestVersion: "9.1.0",
      usage: "unverified",
    });

    assert.strictEqual(view.description, "9.1.0 (not detected)");
    assert.strictEqual(view.icon, "question");
    assert.strictEqual(view.contextValue, "libraryItem");
    assert.ok(view.tooltip.includes("Usage not detected"));
  });

  test("범위 안의 업데이트는 일반 outdated로 표시한다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^18.0.0",
      installedVersion: "18.2.0",
      latestVersion: "18.3.1",
    });

    assert.strictEqual(view.description, "18.2.0 → 18.3.1");
    assert.strictEqual(view.icon, "arrow-circle-up");
    assert.ok(!view.tooltip.includes("Major"));
  });

  test("major 업데이트면 툴팁에 범위 내 최신 버전을 알려준다", () => {
    const view = buildLibraryView(
      {
        ...base,
        version: "^18.0.0",
        installedVersion: "18.2.0",
        latestVersion: "19.1.0",
      },
      ["18.2.0", "18.3.1", "19.1.0"]
    );

    assert.ok(view.tooltip.endsWith("Latest within range: 18.3.1"));
  });

  test("레지스트리 조회에 실패하면 툴팁에 알려준다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^2.0.0",
      installedVersion: "2.1.0",
      latestLookupFailed: true,
    });
    assert.ok(view.tooltip.includes("Latest: not available (registry lookup failed)"));
    assert.strictEqual(view.description, "2.1.0");
  });

  test("npm 공식 레지스트리가 아니면 툴팁에 레지스트리 주소를 보여준다", () => {
    const custom = buildLibraryView({
      ...base,
      version: "^2.0.0",
      registry: "https://npm.mycompany.com",
    });
    const npmjs = buildLibraryView({
      ...base,
      version: "^2.0.0",
      registry: "https://registry.npmjs.org",
    });
    assert.ok(custom.tooltip.includes("Registry: https://npm.mycompany.com"));
    assert.ok(!npmjs.tooltip.includes("Registry:"));
  });
});
