import * as assert from "assert";
import {
  encodeName,
  LibraryMetadataService,
  parseLatestManifest,
  parseVersionList,
  RegistryHttpError,
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

suite("LibraryMetadataService 레지스트리 선택", () => {
  const silenceWarn = async (fn: () => Promise<void>) => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      await fn();
    } finally {
      console.warn = warn;
    }
  };

  test("지정한 레지스트리로 요청한다", async () => {
    const urls: string[] = [];
    const fetchJson: FetchJson = async (url) => {
      urls.push(url);
      return { version: "2.0.0" };
    };
    const service = new LibraryMetadataService({ fetchJson });

    await service.getMetadata({ name: "@mycompany/ui", registry: "https://npm.mycompany.com" });
    await service.getVersions("@mycompany/ui", "https://npm.mycompany.com");

    assert.deepStrictEqual(urls, [
      "https://npm.mycompany.com/@mycompany%2Fui/latest",
      "https://npm.mycompany.com/@mycompany%2Fui",
    ]);
  });

  test("사내 레지스트리가 /latest를 지원하지 않으면 버전 목록에서 latest 태그를 꺼낸다", async () => {
    const fetchJson: FetchJson = async (url) => {
      if (url.endsWith("/latest")) {
        throw new RegistryHttpError(404);
      }
      return { "dist-tags": { latest: "3.1.0" }, versions: { "3.1.0": {} } };
    };
    const metadata = await new LibraryMetadataService({ fetchJson }).getMetadata({
      name: "internal-lib",
      registry: "https://npm.mycompany.com",
    });
    assert.deepStrictEqual(metadata, { latestVersion: "3.1.0" });
  });

  test("npm 공식 레지스트리나 인증 오류에서는 다시 시도하지 않는다", async () => {
    await silenceWarn(async () => {
      for (const [registry, status] of [
        ["https://registry.npmjs.org", 404],
        ["https://npm.mycompany.com", 401],
        ["https://npm.mycompany.com", 403],
      ] as const) {
        let calls = 0;
        const fetchJson: FetchJson = async () => {
          calls += 1;
          throw new RegistryHttpError(status);
        };
        const metadata = await new LibraryMetadataService({ fetchJson }).getMetadata({
          name: "private-lib",
          registry,
        });
        assert.strictEqual(metadata, null, `${registry} ${status}`);
        assert.strictEqual(calls, 1, `${registry} ${status}`);
      }
    });
  });

  test("같은 이름이라도 레지스트리가 다르면 따로 캐시한다", async () => {
    const fetchJson: FetchJson = async (url) => ({
      version: url.startsWith("https://registry.npmjs.org") ? "1.0.0" : "9.0.0",
    });
    const service = new LibraryMetadataService({ fetchJson });
    const a = await service.getMetadata({ name: "utils" });
    const b = await service.getMetadata({ name: "utils", registry: "https://npm.mycompany.com" });
    assert.strictEqual(a?.latestVersion, "1.0.0");
    assert.strictEqual(b?.latestVersion, "9.0.0");
  });
});
