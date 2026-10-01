import type * as vscode from "vscode";
import type { DetectedPackageManager } from "./packageManager";
import type { LibraryUsage } from "./usage";

export type LibraryScope = "dependencies" | "devDependencies";

export interface LibraryInfo {
  name: string;
  /** package.json에 적힌 버전 범위 (예: ^1.2.0) */
  version: string;
  /** node_modules에 실제 설치된 버전 */
  installedVersion?: string;
  scope: LibraryScope;
  packageJsonPath: string;
  workspaceFolder?: vscode.WorkspaceFolder;
  latestVersion?: string;
  /** 코드·설정·scripts에서 사용 근거를 찾았는지 */
  usage?: LibraryUsage;
  /** 업데이트·삭제에 쓸 패키지 매니저 */
  packageManager?: DetectedPackageManager;
}

export interface LibraryMetadata {
  description?: string;
  homepage?: string;
  latestVersion?: string;
  /** 레지스트리에 배포된 모든 버전 (semver 형식만) */
  versions?: string[];
}
