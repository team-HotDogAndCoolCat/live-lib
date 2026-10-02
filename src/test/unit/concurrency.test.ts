import * as assert from "assert";
import { createLimiter } from "../../concurrency";

suite("createLimiter", () => {
  test("동시에 실행되는 작업 수를 제한하고 모든 결과를 돌려준다", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = (value: number) => () =>
      new Promise<number>((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        setTimeout(() => {
          active -= 1;
          resolve(value);
        }, 5);
      });

    const results = await Promise.all([1, 2, 3, 4, 5].map((v) => limit(task(v))));
    assert.deepStrictEqual(results, [1, 2, 3, 4, 5]);
    assert.strictEqual(peak, 2);
  });

  test("실패한 작업이 있어도 다음 작업을 계속 실행한다", async () => {
    const limit = createLimiter(1);
    const failed = limit(() => Promise.reject(new Error("boom")));
    const next = limit(() => Promise.resolve("ok"));
    await assert.rejects(failed, /boom/);
    assert.strictEqual(await next, "ok");
  });
});
