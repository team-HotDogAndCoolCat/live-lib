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
- **라이브러리 업데이트**: 최신 버전으로 업데이트
- **미사용 라이브러리 감지**: 프로젝트에서 실제로 사용하지 않는 라이브러리 표시
- **라이브러리 삭제**: 불필요한 라이브러리 제거

## 사용 방법

1. VS Code의 Activity Bar에서 Live Lib 아이콘을 클릭합니다.
2. 프로젝트의 모든 라이브러리 목록이 표시됩니다.
3. 라이브러리를 클릭하면 세부 정보가 열리고, 마우스를 올리면 나타나는 버튼으로 다음 작업을 할 수 있습니다:
   - **세부 정보 보기**: 라이브러리 정보 확인
   - **업데이트**: 최신 버전으로 업데이트 (새 버전이 있을 때만 표시)
   - **삭제**: 라이브러리 제거

## 요구사항

- VS Code 1.74 이상
- Node.js 프로젝트 (`package.json` 파일 필요)
- npm 패키지 매니저

## 확장 설정

이 확장은 현재 추가 설정을 제공하지 않습니다.

## 알려진 문제

- 라이브러리 사용 여부 감지는 정적 분석을 기반으로 하므로, 동적 import나 간접 참조는 감지하지 못할 수 있습니다.
- 대규모 프로젝트의 경우 라이브러리 사용 여부 검사에 시간이 걸릴 수 있습니다.
- 코드에서 import하지 않는 도구(`typescript`, `eslint`, `@types/*` 등)는 미사용으로 표시됩니다.

## 릴리즈 노트

[CHANGELOG.md](CHANGELOG.md)를 참고하세요.
