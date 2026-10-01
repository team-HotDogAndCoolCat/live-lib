import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { readInstalledBins, readInstalledVersion } from "../../installed";

suite("readInstalledVersion", () => {
  let root: string;

  const writeManifest = async (name: string, contents: string) => {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "package.json"), contents);
  };

  setup(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "live-lib-"));
  });

  teardown(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test("node_modules에 설치된 버전을 읽는다", async () => {
    await writeManifest("react", JSON.stringify({ version: "18.3.1" }));
    assert.strictEqual(await readInstalledVersion(root, "react"), "18.3.1");
  });

  test("scoped 패키지를 읽는다", async () => {
    await writeManifest("@types/node", JSON.stringify({ version: "22.5.0" }));
    assert.strictEqual(await readInstalledVersion(root, "@types/node"), "22.5.0");
  });

  test("설치되지 않았으면 undefined", async () => {
    assert.strictEqual(await readInstalledVersion(root, "missing"), undefined);
  });

  test("package.json이 깨졌거나 version이 없으면 undefined", async () => {
    await writeManifest("broken", "{ not json");
    await writeManifest("noversion", JSON.stringify({ name: "noversion" }));
    assert.strictEqual(await readInstalledVersion(root, "broken"), undefined);
    assert.strictEqual(await readInstalledVersion(root, "noversion"), undefined);
  });

  test("bin이 객체면 키 이름들을 돌려준다", async () => {
    await writeManifest(
      "typescript",
      JSON.stringify({ version: "5.9.3", bin: { tsc: "bin/tsc", tsserver: "bin/tsserver" } })
    );
    assert.deepStrictEqual(await readInstalledBins(root, "typescript"), ["tsc", "tsserver"]);
  });

  test("bin이 문자열이면 scope를 뺀 패키지 이름이다", async () => {
    await writeManifest("@scope/tool", JSON.stringify({ version: "1.0.0", bin: "cli.js" }));
    assert.deepStrictEqual(await readInstalledBins(root, "@scope/tool"), ["tool"]);
  });

  test("설치됐는데 bin이 없으면 빈 배열", async () => {
    await writeManifest("@types/mocha", JSON.stringify({ version: "10.0.10" }));
    assert.deepStrictEqual(await readInstalledBins(root, "@types/mocha"), []);
  });

  test("설치되지 않았으면 패키지 이름으로 추정하고, @types는 추정하지 않는다", async () => {
    assert.deepStrictEqual(await readInstalledBins(root, "eslint"), ["eslint"]);
    assert.deepStrictEqual(await readInstalledBins(root, "@types/node"), []);
  });
});
