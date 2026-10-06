# Live Lib

[![Version](https://vsmarketplacebadges.dev/version-short/gugitgugit.live-lib.svg)](https://marketplace.visualstudio.com/items?itemName=gugitgugit.live-lib)
[![Installs](https://vsmarketplacebadges.dev/installs-short/gugitgugit.live-lib.svg)](https://marketplace.visualstudio.com/items?itemName=gugitgugit.live-lib)
[![License](https://img.shields.io/github/license/team-HotDogAndCoolCat/live-lib)](LICENSE)

[English](README.md) | **한국어**

VS Code 확장으로 프로젝트의 npm 라이브러리를 관리할 수 있는 도구입니다.

## 기능

- **라이브러리 목록 보기**: 프로젝트의 모든 의존성을 한눈에 확인
- **세부 정보 보기**: 각 라이브러리의 설명, 버전, 홈페이지 정보 확인
- **업데이트 가능 여부 표시**: 최신 버전과 비교하여 업데이트 가능한 라이브러리 표시
- **라이브러리 업데이트**: 최신 버전으로 업데이트. `package.json` 범위를 벗어나는 major 업데이트는 한 번 더 확인하고, 범위 안의 최신 버전으로 업데이트하는 선택지도 제공
- **미사용 라이브러리 감지**: 프로젝트에서 실제로 사용하지 않는 라이브러리 표시
- **라이브러리 삭제**: 불필요한 라이브러리 제거
- **모노레포 지원**: 루트와 워크스페이스 패키지를 나란히 표시 (npm·yarn·bun의 `workspaces`, pnpm의 `pnpm-workspace.yaml`)

## 사용 방법

1. VS Code의 Activity Bar에서 Live Lib 아이콘을 클릭합니다.
2. 프로젝트의 모든 라이브러리 목록이 표시됩니다.
3. 라이브러리를 클릭하면 세부 정보가 열리고, 마우스를 올리면 나타나는 버튼으로 다음 작업을 할 수 있습니다:
   - **세부 정보 보기**: 라이브러리 정보 확인
   - **업데이트**: 최신 버전으로 업데이트 (새 버전이 있을 때만 표시)
   - **삭제**: 라이브러리 제거
4. npm 레지스트리에서 가져온 최신 버전 정보는 VS Code를 다시 켜도 6시간 동안 저장해 두고 씁니다. 바로 다시 확인하려면 패널 위쪽의 새로고침 버튼을 누르세요.

## 요구사항

- VS Code 1.74 이상
- Node.js 프로젝트 (`package.json` 파일 필요)
- npm, pnpm, yarn, bun 중 하나. `package.json`의 `packageManager` 필드나 lockfile로 패키지 매니저를 감지하고, 업데이트·삭제 시 그에 맞는 명령(예: `pnpm add` / `pnpm remove`)을 실행합니다.

## 모노레포

루트 `package.json`에 `workspaces`(npm, yarn, bun)가 있거나 `pnpm-workspace.yaml`(pnpm)이 있으면, 트리의 폴더 아래에 `(root)`와 각 워크스페이스 패키지(예: `apps/web`, `packages/ui`)가 나란히 표시됩니다. 패키지를 펼치면 그 패키지의 라이브러리가 나옵니다.

- 업데이트·삭제는 그 패키지 폴더에서 실행되어 해당 패키지의 `package.json`만 바뀝니다.
- 설치된 버전은 그 패키지의 `node_modules`에서 찾고, 없으면 루트 `node_modules`(호이스팅된 경우)에서 찾습니다.
- 패키지의 라이브러리는 그 패키지 폴더 안에서만 사용 여부를 판단합니다. 루트 `package.json`의 라이브러리는 저장소 전체에서 판단합니다. 하위 패키지가 루트에 선언된 공용 의존성을 import하는 경우가 많기 때문입니다.

## 사내·커스텀 레지스트리

최신 버전은 `.npmrc`에 지정한 레지스트리(`registry=`, `@scope:registry=`)에서 조회합니다. 사용자 홈 폴더와, 프로젝트부터 저장소 루트까지의 `.npmrc`를 읽고, 프로젝트에 가까운 파일이 우선합니다.

Live Lib은 `_authToken` 같은 인증 정보를 보내지 않습니다. 인증이 필요한 레지스트리의 패키지는 툴팁에 "Latest: not available"로 표시됩니다.

## 언어

화면 문구는 VS Code의 표시 언어를 따릅니다. 기본은 영어이고, VS Code를 한국어로 설정하면 한국어로 보입니다.

## 확장 설정

| 설정 | 기본값 | 설명 |
| --- | --- | --- |
| `liveLib.packageManager` | `auto` | 업데이트·삭제에 쓸 패키지 매니저입니다. `auto`, `npm`, `pnpm`, `yarn`, `bun` 중에서 고릅니다. `auto`는 `package.json`의 `packageManager` 필드와 lockfile로 감지합니다. 감지 결과가 맞지 않으면 프로젝트의 `.vscode/settings.json`에서 직접 지정하세요. |

## 알려진 문제

- 사용 여부는 `import` / `require` 구문, `package.json`의 scripts, 설정 파일을 보고 판단합니다. 변수로 만든 경로(예: `require(name)`)는 감지하지 못합니다.
- 사용 근거를 찾지 못한 devDependency는 미사용 대신 **not detected**로 표시합니다. 도구는 간접적으로 쓰이는 경우가 많기 때문입니다(예: `webpack`이 내부에서 쓰는 `webpack-cli`). 삭제하기 전에 한 번 확인해 주세요.
- 모노레포에서는 저장소 루트를 여세요. 워크스페이스 패키지 폴더(예: `apps/web`)만 따로 열면 루트 `node_modules`에 설치된 버전을 찾지 못합니다.
- 사용 여부 스캔은 `dist`, `build`, `out`, `coverage` 같은 빌드 산출물 폴더(깊이와 상관없이)와 `.gitignore`에 적힌 폴더를 건너뜁니다. 이런 이름의 폴더에 소스 코드를 두었다면(예: `src/build/`) 그 코드는 스캔하지 않습니다.

## 피드백

- 버그를 발견했거나 아이디어가 있다면 [GitHub 이슈](https://github.com/team-HotDogAndCoolCat/live-lib/issues/new)로 알려주세요.
- Live Lib이 도움이 됐다면 [마켓플레이스 평점](https://marketplace.visualstudio.com/items?itemName=gugitgugit.live-lib&ssr=false#review-details)을 남겨주세요. 다른 개발자들이 찾는 데 큰 도움이 됩니다.

## 릴리즈 노트

[CHANGELOG.md](CHANGELOG.md)를 참고하세요.
