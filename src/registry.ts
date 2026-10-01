import type * as vscode from "vscode";
import * as https from "https";
import type { LibraryInfo, LibraryMetadata } from "./types";
import { compareSemver } from "./version";

interface VersionMetadata {
  description?: string;
  homepage?: string;
}

export interface RegistryPackument {
  description?: string;
  homepage?: string;
  "dist-tags"?: {
    latest?: string;
  };
  versions?: Record<string, VersionMetadata>;
}

export class LibraryMetadataService implements vscode.Disposable {
  private readonly cache = new Map<string, LibraryMetadata | null>();

  async getMetadata(library: LibraryInfo): Promise<LibraryMetadata | null> {
    const cacheKey = library.name;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    const metadata = await fetchFromRegistry(library.name).catch((error) => {
      console.warn(
        `[lib-extension] 메타데이터 조회 실패: ${library.name}`,
        error
      );
      return null;
    });
    this.cache.set(cacheKey, metadata);
    return metadata;
  }

  dispose() {
    this.cache.clear();
  }
}

async function fetchFromRegistry(
  packageName: string
): Promise<LibraryMetadata> {
  const encodedName = encodeURIComponent(packageName);
  const url = `https://registry.npmjs.org/${encodedName}`;

  const data = await new Promise<string>((resolve, reject) => {
    const request = https
      .get(
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "lib-extension",
          },
        },
        (response) => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(
              new Error(`Failed to fetch metadata (${response.statusCode})`)
            );
            response.resume();
            return;
          }

          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve(Buffer.concat(chunks).toString()));
        }
      )
      .on("error", reject);

    request.end();
  });

  return parsePackument(JSON.parse(data) as RegistryPackument);
}

export function parsePackument(parsed: RegistryPackument): LibraryMetadata {
  let latestVersion: VersionMetadata | undefined;

  const latestTag = parsed["dist-tags"]?.latest;
  if (latestTag && parsed.versions && parsed.versions[latestTag]) {
    latestVersion = parsed.versions[latestTag];
  }

  const fallbackMetadata = findFallbackMetadata(parsed.versions);

  return {
    description:
      latestVersion?.description ??
      fallbackMetadata?.description ??
      parsed.description ??
      undefined,
    homepage:
      latestVersion?.homepage ??
      fallbackMetadata?.homepage ??
      parsed.homepage ??
      undefined,
    latestVersion: latestTag ?? undefined,
  };
}

function findFallbackMetadata(
  versions?: Record<string, VersionMetadata>
): VersionMetadata | null {
  if (!versions) {
    return null;
  }

  const sortedKeys = Object.keys(versions).sort((a, b) => compareSemver(b, a));

  for (const key of sortedKeys) {
    const candidate = versions[key];
    if (candidate?.description || candidate?.homepage) {
      return candidate;
    }
  }

  return null;
}
