import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { classifyUsage } from "../../usage";
import { collectUsageEvidence, type ImportCache } from "../../usageEvidence";

suite("collectUsageEvidence", () => {
  let root: string;

  const write = async (file: string, contents: string) => {
    const full = path.join(root, file);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
    return full;
  };

  setup(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-usage-"));
  });

  teardown(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test("일반적인 TypeScript 프로젝트에서 사용 여부를 판단한다", async () => {
    const pkg = {
      name: "fixture",
      scripts: { build: "tsc && webpack", test: "vitest run" },
      prettier: {},
      dependencies: { react: "^18.0.0", "date-fns": "^3.0.0", "left-pad": "^1.0.0" },
      devDependencies: {
        typescript: "^5.0.0",
        webpack: "^5.0.0",
        "ts-loader": "^9.0.0",
        vitest: "^1.0.0",
        eslint: "^9.0.0",
        prettier: "^3.0.0",
        "@types/react": "^18.0.0",
        "@types/node": "^20.0.0",
        husky: "^9.0.0",
      },
    };
    const names = [
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.devDependencies),
    ];

    // typescript는 bin 이름(tsc)이 패키지 이름과 다르다
    await write(
      "node_modules/typescript/package.json",
      JSON.stringify({ version: "5.0.0", bin: { tsc: "bin/tsc", tsserver: "bin/tsserver" } })
    );
    const sources = [
      await write("src/App.tsx", `import React from "react";\nimport fs from "node:fs";`),
      await write("src/util.js", `const format = require("date-fns/format");`),
    ];
    await write("tsconfig.json", "{}");
    await write("eslint.config.mjs", "export default [];");
    await write("webpack.config.js", `module.exports = { module: { rules: [{ loader: "ts-loader" }] } };`);

    const evidence = await collectUsageEvidence(root, pkg, names, sources);
    const usage = Object.fromEntries(
      names.map((name) => [
        name,
        classifyUsage(
          {
            name,
            scope: name in pkg.dependencies ? "dependencies" : "devDependencies",
          },
          evidence
        ),
      ])
    );

    assert.deepStrictEqual(usage, {
      react: "used", // import
      "date-fns": "used", // 하위 경로 require
      "left-pad": "unused", // 근거 없음 (dependencies)
      typescript: "used", // scripts의 tsc, tsconfig.json
      webpack: "used", // scripts
      "ts-loader": "used", // webpack.config.js 안의 문자열
      vitest: "used", // scripts
      eslint: "used", // eslint.config.mjs
      prettier: "used", // package.json의 "prettier" 키
      "@types/react": "used", // react가 쓰임
      "@types/node": "used", // node:fs import
      husky: "unverified", // 근거 없음 (devDependencies)
    });
  });

  test("수정되지 않은 파일은 다시 읽지 않고 이전 결과를 쓴다", async () => {
    const file = await write("src/a.ts", `import "react";`);
    // 파일 시스템의 시각은 1ms보다 정밀해서, 비교 전에 utimes로 같은 정밀도로 맞춘다
    const mtime = new Date(2026, 0, 1);
    await fs.utimes(file, mtime, mtime);
    const cache: ImportCache = new Map();
    await collectUsageEvidence(root, {}, ["react"], [file], cache);

    // 내용은 바꾸되 크기와 수정 시각은 그대로 두면 캐시된 결과가 나와야 한다
    await fs.writeFile(file, `import "vuejs";`);
    await fs.utimes(file, mtime, mtime);
    const reused = await collectUsageEvidence(root, {}, ["react"], [file], cache);
    assert.ok(reused.imported.has("react"));
    assert.ok(!reused.imported.has("vuejs"));
  });

  test("수정된 파일은 다시 읽는다", async () => {
    const file = await write("src/a.ts", `import "react";`);
    const cache: ImportCache = new Map();
    await collectUsageEvidence(root, {}, ["react"], [file], cache);

    await fs.writeFile(file, `import "preact";`);
    const later = new Date(Date.now() + 10_000);
    await fs.utimes(file, later, later);
    const evidence = await collectUsageEvidence(root, {}, ["react"], [file], cache);
    assert.ok(evidence.imported.has("preact"));
    assert.ok(!evidence.imported.has("react"));
  });

  test("목록에서 사라진 파일은 캐시에서 지운다", async () => {
    const a = await write("src/a.ts", `import "react";`);
    const b = await write("src/b.ts", `import "vue";`);
    const cache: ImportCache = new Map();
    await collectUsageEvidence(root, {}, [], [a, b], cache);
    assert.strictEqual(cache.size, 2);

    await collectUsageEvidence(root, {}, [], [a], cache);
    assert.deepStrictEqual([...cache.keys()], [a]);
  });

  test("캐시 정리는 이번에 훑은 폴더 안의 항목만 한다", async () => {
    const web = await write("apps/web/src/a.ts", `import "react";`);
    const admin = await write("apps/admin/src/b.ts", `import "vue";`);
    const cache: ImportCache = new Map();
    await collectUsageEvidence(path.join(root, "apps", "web"), {}, [], [web], cache);
    await collectUsageEvidence(path.join(root, "apps", "admin"), {}, [], [admin], cache);
    assert.deepStrictEqual([...cache.keys()].sort(), [admin, web].sort());

    // apps/web을 다시 훑어도 apps/admin 결과는 남는다
    await collectUsageEvidence(path.join(root, "apps", "web"), {}, [], [], cache);
    assert.deepStrictEqual([...cache.keys()], [admin]);
  });

  test("하위 패키지 scripts의 명령은 루트 node_modules의 bin으로 찾는다", async () => {
    await write(
      "node_modules/typescript/package.json",
      JSON.stringify({ version: "5.9.3", bin: { tsc: "bin/tsc" } })
    );
    const pkg = { scripts: { build: "tsc -p ." } };
    const web = path.join(root, "apps", "web");
    await fs.mkdir(web, { recursive: true });

    const scoped = await collectUsageEvidence(web, pkg, ["typescript"], [], undefined, root);
    assert.ok(scoped.referenced.has("typescript"));

    // 루트를 모르면 bin 이름(tsc)을 알 수 없어 찾지 못한다
    const unscoped = await collectUsageEvidence(web, pkg, ["typescript"], []);
    assert.ok(!unscoped.referenced.has("typescript"));
  });
});
