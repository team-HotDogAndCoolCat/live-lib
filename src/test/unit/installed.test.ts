import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { readInstalledVersion } from "../../installed";

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
});
