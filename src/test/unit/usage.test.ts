import * as assert from "assert";
import {
  classifyUsage,
  extractImportedPackages,
  findImportedLibraries,
  findQuotedReferences,
  findUsedByConfigFileNames,
  findUsedByPackageJsonKeys,
  findUsedByScripts,
  toPackageName,
  typesTarget,
} from "../../usage";

suite("findImportedLibraries", () => {
  const find = (content: string, names: string[]) =>
    findImportedLibraries(content, names).sort();

  test("ESM import를 찾는다", () => {
    assert.deepStrictEqual(
      find(`import React from "react";`, ["react", "vue"]),
      ["react"]
    );
    assert.deepStrictEqual(find(`import { x } from 'lodash'`, ["lodash"]), [
      "lodash",
    ]);
  });

  test("side-effect import를 찾는다", () => {
    assert.deepStrictEqual(find(`import "reflect-metadata";`, ["reflect-metadata"]), [
      "reflect-metadata",
    ]);
  });

  test("CommonJS require를 찾는다", () => {
    assert.deepStrictEqual(find(`const fs = require("fs-extra");`, ["fs-extra"]), [
      "fs-extra",
    ]);
  });

  test("하위 경로 import도 같은 패키지로 본다", () => {
    assert.deepStrictEqual(find(`import debounce from "lodash/debounce";`, ["lodash"]), [
      "lodash",
    ]);
  });

  test("하위 경로 require도 같은 패키지로 본다", () => {
    assert.deepStrictEqual(find(`require('date-fns/format')`, ["date-fns"]), [
      "date-fns",
    ]);
  });

  test("scoped 패키지를 찾는다", () => {
    assert.deepStrictEqual(
      find(`import { parse } from "@babel/parser";`, ["@babel/parser", "@babel/core"]),
      ["@babel/parser"]
    );
  });

  test("이름이 앞부분만 같은 다른 패키지와 헷갈리지 않는다", () => {
    assert.deepStrictEqual(find(`import { render } from "react-dom";`, ["react"]), []);
  });

  test("이름에 정규식 특수문자가 있어도 안전하게 처리한다", () => {
    assert.deepStrictEqual(find(`import x from "lodash.merge";`, ["lodash.merge"]), [
      "lodash.merge",
    ]);
    assert.deepStrictEqual(find(`import x from "lodashXmerge";`, ["lodash.merge"]), []);
  });

  test("참조가 없으면 빈 배열", () => {
    assert.deepStrictEqual(find(`console.log("react");`, ["react"]), []);
  });

  test("동적 import와 require.resolve를 찾는다", () => {
    assert.deepStrictEqual(find(`const m = await import("chart.js");`, ["chart.js"]), [
      "chart.js",
    ]);
    assert.deepStrictEqual(find(`require.resolve("ts-node/register")`, ["ts-node"]), [
      "ts-node",
    ]);
  });

  test("re-export와 type import를 찾는다", () => {
    assert.deepStrictEqual(find(`export * from "zod";`, ["zod"]), ["zod"]);
    assert.deepStrictEqual(find(`import type { Foo } from "foo";`, ["foo"]), ["foo"]);
  });
});

suite("extractImportedPackages", () => {
  test("상대 경로는 무시하고 Node 내장 모듈은 포함한다", () => {
    const found = extractImportedPackages(`
      import a from "./local";
      import b from "../up";
      import fs from "fs";
      import { join } from "node:path";
    `);
    assert.deepStrictEqual([...found].sort(), ["fs", "node:path"]);
  });
});

suite("toPackageName", () => {
  test("import 경로에서 패키지 이름을 뽑는다", () => {
    assert.strictEqual(toPackageName("lodash/debounce"), "lodash");
    assert.strictEqual(toPackageName("@babel/core/lib/x"), "@babel/core");
    assert.strictEqual(toPackageName("node:fs"), "node:fs");
    assert.strictEqual(toPackageName("./x"), undefined);
    assert.strictEqual(toPackageName("@scope"), undefined);
  });
});

suite("typesTarget", () => {
  test("@types 패키지가 타입을 제공하는 대상을 돌려준다", () => {
    assert.strictEqual(typesTarget("@types/react"), "react");
    assert.strictEqual(typesTarget("@types/babel__core"), "@babel/core");
    assert.strictEqual(typesTarget("react"), undefined);
  });
});

suite("findUsedByScripts", () => {
  const bins = new Map([
    ["typescript", ["tsc", "tsserver"]],
    ["@vscode/test-cli", ["vscode-test"]],
    ["eslint", ["eslint"]],
    ["rimraf", ["rimraf"]],
    ["prettier", ["prettier"]],
  ]);

  test("scripts에서 실행하는 bin으로 패키지를 찾는다", () => {
    const used = findUsedByScripts(
      {
        build: "tsc -p . && eslint src",
        test: "vscode-test",
        clean: "./node_modules/.bin/rimraf dist",
      },
      bins
    );
    assert.deepStrictEqual(
      [...used].sort(),
      ["@vscode/test-cli", "eslint", "rimraf", "typescript"]
    );
  });

  test("npx로 패키지 이름을 직접 쓰는 경우도 찾는다", () => {
    const used = findUsedByScripts({ fmt: "npx prettier --write ." }, bins);
    assert.ok(used.has("prettier"));
  });

  test("이름 일부만 겹치면 매칭하지 않는다", () => {
    const used = findUsedByScripts({ lint: "eslint-config-check" }, bins);
    assert.ok(!used.has("eslint"));
  });

  test("scripts가 없어도 동작한다", () => {
    assert.strictEqual(findUsedByScripts(undefined, bins).size, 0);
  });
});

suite("findUsedByConfigFileNames", () => {
  const names = [
    "eslint",
    "prettier",
    "typescript",
    "webpack",
    "tailwindcss",
    "@playwright/test",
    "@babel/core",
    "jest",
    "vite",
  ];

  test("설정 파일 이름으로 도구를 찾는다", () => {
    const used = findUsedByConfigFileNames(
      [
        "eslint.config.mjs",
        ".prettierrc",
        "tsconfig.json",
        "webpack.config.js",
        "tailwind.config.ts",
        "playwright.config.ts",
        ".babelrc.json",
        "README.md",
      ],
      names
    );
    assert.deepStrictEqual(
      [...used].sort(),
      [
        "@babel/core",
        "@playwright/test",
        "eslint",
        "prettier",
        "tailwindcss",
        "typescript",
        "webpack",
      ]
    );
  });

  test("관련 없는 파일 이름은 매칭하지 않는다", () => {
    const used = findUsedByConfigFileNames(["jestering.md", "vitepress.config.ts"], names);
    assert.strictEqual(used.size, 0);
  });
});

suite("findQuotedReferences", () => {
  test("설정 파일 안에 문자열로 적힌 패키지를 찾는다", () => {
    const content = `module.exports = { use: [{ loader: 'ts-loader' }], plugins: ["@scope/plugin/sub"] };`;
    const used = findQuotedReferences(content, ["ts-loader", "@scope/plugin", "babel-loader"]);
    assert.deepStrictEqual([...used].sort(), ["@scope/plugin", "ts-loader"]);
  });
});

suite("findUsedByPackageJsonKeys", () => {
  test("package.json의 도구 설정 키로 찾는다", () => {
    const used = findUsedByPackageJsonKeys(
      { name: "app", eslintConfig: {}, prettier: "@company/prettier-config", jest: {} },
      ["eslint", "prettier", "jest", "mocha"]
    );
    assert.deepStrictEqual([...used].sort(), ["eslint", "jest", "prettier"]);
  });
});

suite("classifyUsage", () => {
  const evidence = {
    imported: new Set(["react", "vscode", "fs"]),
    referenced: new Set(["eslint", "mocha"]),
  };
  const dep = (name: string) => ({ name, scope: "dependencies" as const });
  const dev = (name: string) => ({ name, scope: "devDependencies" as const });

  test("import되거나 참조되면 used", () => {
    assert.strictEqual(classifyUsage(dep("react"), evidence), "used");
    assert.strictEqual(classifyUsage(dev("eslint"), evidence), "used");
  });

  test("@types 패키지는 대상 패키지가 쓰이면 used", () => {
    assert.strictEqual(classifyUsage(dev("@types/react"), evidence), "used");
    assert.strictEqual(classifyUsage(dev("@types/vscode"), evidence), "used");
    assert.strictEqual(classifyUsage(dev("@types/mocha"), evidence), "used");
  });

  test("@types/node는 Node 내장 모듈을 import하면 used", () => {
    assert.strictEqual(classifyUsage(dev("@types/node"), evidence), "used");
    assert.strictEqual(
      classifyUsage(dev("@types/node"), { imported: new Set(), referenced: new Set() }),
      "unverified"
    );
  });

  test("근거가 없으면 dependencies는 unused, devDependencies는 unverified", () => {
    assert.strictEqual(classifyUsage(dep("left-pad"), evidence), "unused");
    assert.strictEqual(classifyUsage(dev("webpack-cli"), evidence), "unverified");
  });
});
