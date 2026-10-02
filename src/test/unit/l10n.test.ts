import * as assert from "assert";
import * as path from "path";
import { readFileSync, readdirSync } from "fs";

// out/test/unit → 저장소 루트
const root = path.resolve(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const readJson = (file: string) => JSON.parse(read(file)) as Record<string, string>;

const sourceFiles = readdirSync(path.join(root, "src"))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => `src/${file}`);

/** 코드에서 t("...") 또는 l10n.t("...")로 번역하는 문구 */
function translatableMessages(): Set<string> {
  const messages = new Set<string>();
  for (const file of sourceFiles) {
    for (const match of read(file).matchAll(/\b(?:l10n\.)?t\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      messages.add(JSON.parse(`"${match[1]}"`));
    }
  }
  return messages;
}

const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();

suite("다국어 문구", () => {
  const koBundle = readJson("l10n/bundle.l10n.ko.json");

  test("코드의 모든 번역 문구에 한국어 번역이 있다", () => {
    const missing = [...translatableMessages()].filter((m) => !(m in koBundle));
    assert.deepStrictEqual(missing, []);
  });

  test("번역 파일에 코드에서 쓰지 않는 문구가 남아 있지 않다", () => {
    const used = translatableMessages();
    const stale = Object.keys(koBundle).filter((m) => !used.has(m));
    assert.deepStrictEqual(stale, []);
  });

  test("번역문은 원문과 같은 {0}, {1} 자리를 가진다", () => {
    const mismatched = Object.entries(koBundle)
      .filter(([en, ko]) => placeholders(en).join() !== placeholders(ko).join())
      .map(([en]) => en);
    assert.deepStrictEqual(mismatched, []);
  });

  test("package.json의 %키%가 영어·한국어 파일에 모두 있다", () => {
    const keys = [...read("package.json").matchAll(/"%([^%"]+)%"/g)].map((m) => m[1]);
    assert.ok(keys.length > 0);
    const en = readJson("package.nls.json");
    const ko = readJson("package.nls.ko.json");
    assert.deepStrictEqual(keys.filter((k) => !(k in en)), [], "package.nls.json");
    assert.deepStrictEqual(keys.filter((k) => !(k in ko)), [], "package.nls.ko.json");
    assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(ko).sort());
  });

  test("코드에 번역되지 않은 한국어 문자열이 없다", () => {
    const found: string[] = [];
    for (const file of sourceFiles) {
      read(file)
        .split("\n")
        .forEach((line, index) => {
          const code = line.trim();
          if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) {
            return;
          }
          if (/["'`][^"'`]*[가-힣][^"'`]*["'`]/.test(code)) {
            found.push(`${file}:${index + 1}`);
          }
        });
    }
    assert.deepStrictEqual(found, []);
  });
});
