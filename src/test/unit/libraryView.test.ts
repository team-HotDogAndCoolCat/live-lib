import * as assert from "assert";
import { buildLibraryView } from "../../libraryView";

suite("buildLibraryView", () => {
  const base = {
    name: "react",
    scope: "dependencies" as const,
    isUsed: true,
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

  test("설치된 버전이 최신보다 낮으면 outdated", () => {
    const view = buildLibraryView({
      ...base,
      version: "^18.0.0",
      installedVersion: "18.2.0",
      latestVersion: "19.1.0",
    });

    assert.strictEqual(view.description, "18.2.0 → 19.1.0");
    assert.strictEqual(view.contextValue, "libraryItemOutdated");
    assert.strictEqual(view.icon, "arrow-circle-up");
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
      isUsed: false,
    });

    assert.strictEqual(view.description, "1.0.0 (unused)");
    assert.strictEqual(view.contextValue, "libraryItemUnused");
    assert.strictEqual(view.icon, "circle-slash");
  });

  test("outdated가 unused보다 우선한다", () => {
    const view = buildLibraryView({
      ...base,
      version: "^1.0.0",
      installedVersion: "1.0.0",
      latestVersion: "2.0.0",
      isUsed: false,
    });

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
      "react (dependencies) • Installed: 18.2.0 • Declared: ^18.0.0 • Latest: 19.1.0"
    );
  });
});
