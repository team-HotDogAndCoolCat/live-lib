import * as assert from "assert";
import { buildExcludeGlob, gitignoreToExcludeGlobs } from "../../scanExclude";

suite("gitignoreToExcludeGlobs", () => {
  test("단순한 폴더 이름을 제외 패턴으로 바꾼다", () => {
    assert.deepStrictEqual(gitignoreToExcludeGlobs("dist\ngenerated/\n"), [
      "**/dist/**",
      "**/generated/**",
    ]);
  });

  test("/로 시작하거나 중간에 /가 있으면 루트 기준 경로로 본다", () => {
    assert.deepStrictEqual(gitignoreToExcludeGlobs("/build/\npackages/legacy\n"), [
      "build/**",
      "packages/legacy/**",
    ]);
  });

  test("주석, 빈 줄, 부정, 와일드카드 규칙은 건너뛴다", () => {
    assert.deepStrictEqual(
      gitignoreToExcludeGlobs("# comment\n\n!keep\n*.log\n.env.*\nfoo?\n[ab]\n"),
      []
    );
  });

  test("Windows 줄바꿈도 처리한다", () => {
    assert.deepStrictEqual(gitignoreToExcludeGlobs("dist\r\nout\r\n"), [
      "**/dist/**",
      "**/out/**",
    ]);
  });
});

suite("buildExcludeGlob", () => {
  const parts = (glob: string) => glob.slice(1, -1).split(",");

  test("기본 제외 폴더를 포함한다", () => {
    const globs = parts(buildExcludeGlob({}));
    for (const dir of ["node_modules", "dist", "build", "out", "coverage", ".next", ".vscode-test"]) {
      assert.ok(globs.includes(`**/${dir}/**`), dir);
    }
  });

  test(".gitignore와 files.exclude를 합치고 중복은 한 번만 넣는다", () => {
    const globs = parts(
      buildExcludeGlob({
        gitignore: "dist\n/generated\n",
        filesExclude: { "**/.git": true, "**/tmp/**": true, "**/off": false },
      })
    );
    assert.strictEqual(globs.filter((g) => g === "**/dist/**").length, 1);
    assert.ok(globs.includes("generated/**"));
    assert.ok(globs.includes("**/.git"));
    assert.ok(globs.includes("**/tmp/**"));
    assert.ok(!globs.includes("**/off"));
  });

  test("조건부 규칙이나 중괄호가 든 패턴은 건너뛴다", () => {
    const globs = parts(
      buildExcludeGlob({
        filesExclude: {
          "**/*.js": { when: "$(basename).ts" },
          "**/{a,b}": true,
        },
      })
    );
    assert.ok(!globs.some((g) => g.includes("*.js") || g.includes("{")));
  });
});
