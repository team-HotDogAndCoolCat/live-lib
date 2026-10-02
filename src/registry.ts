import type * as vscode from "vscode";
import * as https from "https";
import * as semver from "semver";
import type { LibraryInfo, LibraryMetadata } from "./types";

const REGISTRY_URL = "https://registry.npmjs.org";
const MAX_CONCURRENT_REQUESTS = 8;
const REQUEST_TIMEOUT_MS = 10_000;

// 버전 목록만 담긴 축약 형식. 전체 정보보다 훨씬 작다.
const ABBREVIATED_ACCEPT = "application/vnd.npm.install-v1+json";

export type FetchJson = (url: string, accept: string) => Promise<unknown>;

const CACHE_STORAGE_KEY = "liveLib.registryMetadata";
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** vscode.Memento(globalState)와 같은 모양. 테스트에서는 가짜 저장소를 쓴다. */
export interface MetadataStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

interface StoredMetadata {
  metadata: LibraryMetadata;
  fetchedAt: number;
}

export interface MetadataServiceOptions {
  fetchJson?: FetchJson;
  /** 지정하면 최신 버전 정보를 VS Code를 다시 켜도 남도록 저장한다 */
  store?: MetadataStore;
  ttlMs?: number;
  now?: () => number;
}

export class LibraryMetadataService implements vscode.Disposable {
  private readonly metadataCache = new Map<
    string,
    Promise<LibraryMetadata | null>
  >();
  private readonly versionsCache = new Map<string, Promise<string[] | null>>();
  private readonly limit = createLimiter(MAX_CONCURRENT_REQUESTS);
  private readonly fetchJson: FetchJson;
  private readonly store?: MetadataStore;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private persisted: Record<string, StoredMetadata>;

  constructor(options: MetadataServiceOptions = {}) {
    this.fetchJson = options.fetchJson ?? fetchJsonOverHttps;
    this.store = options.store;
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
    this.persisted = this.loadFreshEntries();
  }

  /**
   * 트리와 상세 보기에 쓰는 최신 버전 정보. /<패키지>/latest만 받는다.
   * 저장된 정보가 유효 시간 안이면 레지스트리를 조회하지 않는다.
   */
  getMetadata(library: Pick<LibraryInfo, "name">): Promise<LibraryMetadata | null> {
    const name = library.name;
    const stored = this.persisted[name];
    if (!this.metadataCache.has(name) && stored && this.isFresh(stored)) {
      this.metadataCache.set(name, Promise.resolve(stored.metadata));
    }

    return this.cached(this.metadataCache, name, async () => {
      const metadata = parseLatestManifest(
        await this.limit(() =>
          this.fetchJson(`${REGISTRY_URL}/${encodeName(name)}/latest`, "application/json")
        )
      );
      this.persist(name, metadata);
      return metadata;
    });
  }

  /**
   * 저장된 정보를 모두 지운다. 새로고침 버튼에서 호출한다.
   */
  async clearCache() {
    this.metadataCache.clear();
    this.versionsCache.clear();
    this.persisted = {};
    await this.store?.update(CACHE_STORAGE_KEY, undefined);
  }

  /**
   * 레지스트리에 배포된 전체 버전 목록. major 업데이트 확인창처럼 꼭 필요할 때만 받는다.
   */
  getVersions(name: string): Promise<string[] | null> {
    return this.cached(this.versionsCache, name, async () =>
      parseVersionList(
        await this.limit(() =>
          this.fetchJson(`${REGISTRY_URL}/${encodeName(name)}`, ABBREVIATED_ACCEPT)
        )
      )
    );
  }

  dispose() {
    this.metadataCache.clear();
    this.versionsCache.clear();
  }

  private isFresh(entry: StoredMetadata) {
    return this.now() - entry.fetchedAt < this.ttlMs;
  }

  private loadFreshEntries(): Record<string, StoredMetadata> {
    const saved =
      this.store?.get<Record<string, StoredMetadata>>(CACHE_STORAGE_KEY) ?? {};
    return Object.fromEntries(
      Object.entries(saved).filter(([, entry]) => this.isFresh(entry))
    );
  }

  private persist(name: string, metadata: LibraryMetadata) {
    if (!this.store) {
      return;
    }
    this.persisted[name] = { metadata, fetchedAt: this.now() };
    Promise.resolve(this.store.update(CACHE_STORAGE_KEY, this.persisted)).catch(
      (error) => console.warn("[lib-extension] 캐시 저장 실패", error)
    );
  }

  // 같은 패키지를 동시에 여러 번 요청해도 한 번만 받도록 Promise를 캐시한다
  private cached<T>(
    cache: Map<string, Promise<T | null>>,
    key: string,
    load: () => Promise<T>
  ): Promise<T | null> {
    const existing = cache.get(key);
    if (existing) {
      return existing;
    }
    const pending = load().catch((error) => {
      console.warn(`[lib-extension] 레지스트리 조회 실패: ${key}`, error);
      return null;
    });
    cache.set(key, pending);
    return pending;
  }
}

/**
 * scoped 패키지의 /는 인코딩하고 @는 그대로 둔다. 예: @types/node → @types%2Fnode
 */
export function encodeName(name: string) {
  return name.startsWith("@")
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);
}

export function parseLatestManifest(manifest: unknown): LibraryMetadata {
  const m = (manifest ?? {}) as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  return {
    description: text(m.description),
    homepage: text(m.homepage),
    latestVersion: text(m.version),
  };
}

export function parseVersionList(packument: unknown): string[] {
  const versions = (packument as { versions?: unknown } | null)?.versions;
  if (!versions || typeof versions !== "object") {
    return [];
  }
  return Object.keys(versions).filter((v) => semver.valid(v));
}

/**
 * 동시에 실행되는 작업 수를 제한한다.
 */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= max) {
      return;
    }
    const start = queue.shift();
    if (start) {
      active += 1;
      start();
    }
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}

function fetchJsonOverHttps(url: string, accept: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { Accept: accept, "User-Agent": "lib-extension" } },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Registry request failed (${response.statusCode})`));
          response.resume();
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Registry request timed out: ${url}`));
    });
    request.on("error", reject);
  });
}
