import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { classifyUsage } from "../../usage";
import { collectUsageEvidence } from "../../usageEvidence";

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
});
