import * as assert from "assert";
import {
  createLimiter,
  encodeName,
  LibraryMetadataService,
  parseLatestManifest,
  parseVersionList,
  type FetchJson,
  type MetadataStore,
} from "../../registry";

suite("parseLatestManifest", () => {
  test("최신 버전의 설명, 홈페이지, 버전을 읽는다", () => {
    assert.deepStrictEqual(
      parseLatestManifest({
        name: "react",
        version: "18.3.1",
        description: "React is a JavaScript library",
        homepage: "https://react.dev",
        dependencies: { "loose-envify": "^1.1.0" },
      }),
      {
        description: "React is a JavaScript library",
        homepage: "https://react.dev",
        latestVersion: "18.3.1",
      }
    );
  });

  test("필드가 없거나 문자열이 아니면 undefined", () => {
    assert.deepStrictEqual(parseLatestManifest({ version: 1, homepage: "" }), {
      description: undefined,
      homepage: undefined,
      latestVersion: undefined,
    });
    assert.deepStrictEqual(parseLatestManifest(null), {
      description: undefined,
      homepage: undefined,
      latestVersion: undefined,
    });
  });
});

suite("parseVersionList", () => {
  test("semver 형식의 버전 키만 돌려준다", () => {
    assert.deepStrictEqual(
      parseVersionList({
        versions: { "1.0.0": {}, "not-a-version": {}, "2.0.0-beta.1": {} },
      }),
      ["1.0.0", "2.0.0-beta.1"]
    );
  });

  test("versions가 없으면 빈 배열", () => {
    assert.deepStrictEqual(parseVersionList({}), []);
    assert.deepStrictEqual(parseVersionList(null), []);
  });
});

suite("encodeName", () => {
  test("scoped 패키지의 /만 인코딩한다", () => {
    assert.strictEqual(encodeName("react"), "react");
    assert.strictEqual(encodeName("@types/node"), "@types%2Fnode");
  });
});

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

suite("LibraryMetadataService", () => {
  const fakeFetch = (responses: Record<string, unknown>) => {
    const calls: { url: string; accept: string }[] = [];
    const fetchJson: FetchJson = async (url, accept) => {
      calls.push({ url, accept });
      if (!(url in responses)) {
        throw new Error(`unexpected request: ${url}`);
      }
      return responses[url];
    };
    return { calls, fetchJson };
  };

  test("트리용 정보는 /latest만 요청한다", async () => {
    const { calls, fetchJson } = fakeFetch({
      "https://registry.npmjs.org/@types%2Fnode/latest": {
        version: "26.6.4",
        description: "TypeScript definitions for node",
      },
    });
    const service = new LibraryMetadataService({ fetchJson });

    const metadata = await service.getMetadata({ name: "@types/node" });

    assert.strictEqual(metadata?.latestVersion, "26.6.4");
    assert.deepStrictEqual(calls, [
      {
        url: "https://registry.npmjs.org/@types%2Fnode/latest",
        accept: "application/json",
      },
    ]);
  });

  test("버전 목록은 축약 형식으로 따로 요청한다", async () => {
    const { calls, fetchJson } = fakeFetch({
      "https://registry.npmjs.org/eslint": { versions: { "9.39.5": {}, "10.11.0": {} } },
    });
    const service = new LibraryMetadataService({ fetchJson });

    assert.deepStrictEqual(await service.getVersions("eslint"), ["9.39.5", "10.11.0"]);
    assert.strictEqual(calls[0].accept, "application/vnd.npm.install-v1+json");
  });

  test("같은 패키지를 동시에 여러 번 요청해도 한 번만 받는다", async () => {
    const { calls, fetchJson } = fakeFetch({
      "https://registry.npmjs.org/react/latest": { version: "18.3.1" },
    });
    const service = new LibraryMetadataService({ fetchJson });

    await Promise.all([
      service.getMetadata({ name: "react" }),
      service.getMetadata({ name: "react" }),
      service.getMetadata({ name: "react" }),
    ]);

    assert.strictEqual(calls.length, 1);
  });

  test("요청이 실패하면 null을 돌려준다", async () => {
    const { fetchJson } = fakeFetch({});
    const service = new LibraryMetadataService({ fetchJson });
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.strictEqual(await service.getMetadata({ name: "missing" }), null);
      assert.strictEqual(await service.getVersions("missing"), null);
    } finally {
      console.warn = warn;
    }
  });
});

suite("LibraryMetadataService 캐시", () => {
  const HOUR = 60 * 60 * 1000;

  const memoryStore = (): MetadataStore & { data: Map<string, unknown> } => {
    const data = new Map<string, unknown>();
    return {
      data,
      get: <T>(key: string) => data.get(key) as T | undefined,
      update: async (key: string, value: unknown) => {
        if (value === undefined) {
          data.delete(key);
        } else {
          // 실제 globalState처럼 JSON으로 저장되는 값만 남긴다
          data.set(key, JSON.parse(JSON.stringify(value)));
        }
      },
    };
  };

  const countingFetch = (version = "18.3.1") => {
    let calls = 0;
    const fetchJson: FetchJson = async () => {
      calls += 1;
      return { version };
    };
    return { fetchJson, calls: () => calls };
  };

  test("VS Code를 다시 켜도 유효 시간 안이면 레지스트리를 조회하지 않는다", async () => {
    const store = memoryStore();
    let now = 0;
    const first = countingFetch();
    await new LibraryMetadataService({ fetchJson: first.fetchJson, store, now: () => now })
      .getMetadata({ name: "react" });
    assert.strictEqual(first.calls(), 1);

    // 새 인스턴스 = VS Code를 다시 켠 상황
    now = 5 * HOUR;
    const second = countingFetch();
    const metadata = await new LibraryMetadataService({
      fetchJson: second.fetchJson,
      store,
      now: () => now,
    }).getMetadata({ name: "react" });

    assert.strictEqual(second.calls(), 0);
    assert.strictEqual(metadata?.latestVersion, "18.3.1");
  });

  test("유효 시간(기본 6시간)이 지나면 다시 조회한다", async () => {
    const store = memoryStore();
    let now = 0;
    await new LibraryMetadataService({
      fetchJson: countingFetch("18.3.1").fetchJson,
      store,
      now: () => now,
    }).getMetadata({ name: "react" });

    now = 7 * HOUR;
    const later = countingFetch("19.0.0");
    const metadata = await new LibraryMetadataService({
      fetchJson: later.fetchJson,
      store,
      now: () => now,
    }).getMetadata({ name: "react" });

    assert.strictEqual(later.calls(), 1);
    assert.strictEqual(metadata?.latestVersion, "19.0.0");
  });

  test("clearCache 후에는 유효 시간 안이어도 다시 조회한다", async () => {
    const store = memoryStore();
    const fetch = countingFetch();
    const service = new LibraryMetadataService({ fetchJson: fetch.fetchJson, store });

    await service.getMetadata({ name: "react" });
    await service.clearCache();
    await service.getMetadata({ name: "react" });

    assert.strictEqual(fetch.calls(), 2);
  });

  test("clearCache는 저장소에서도 지운다", async () => {
    const store = memoryStore();
    const service = new LibraryMetadataService({
      fetchJson: countingFetch().fetchJson,
      store,
    });
    await service.getMetadata({ name: "react" });
    assert.ok(store.data.size > 0);

    await service.clearCache();
    assert.strictEqual(store.data.size, 0);
  });

  test("조회에 실패한 결과는 저장하지 않는다", async () => {
    const store = memoryStore();
    const failing: FetchJson = async () => {
      throw new Error("offline");
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      await new LibraryMetadataService({ fetchJson: failing, store }).getMetadata({
        name: "react",
      });
    } finally {
      console.warn = warn;
    }

    const retry = countingFetch();
    await new LibraryMetadataService({ fetchJson: retry.fetchJson, store }).getMetadata({
      name: "react",
    });
    assert.strictEqual(retry.calls(), 1);
  });

  test("버전 목록은 저장소에 저장하지 않는다", async () => {
    const store = memoryStore();
    const fetchJson: FetchJson = async () => ({ versions: { "1.0.0": {} } });
    await new LibraryMetadataService({ fetchJson, store }).getVersions("react");
    assert.strictEqual(store.data.size, 0);
  });
});
