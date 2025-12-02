# Live Lib

A VS Code extension for managing npm libraries in your project.

## Features

- **View Library List**: See all project dependencies at a glance
- **View Details**: Check description, version, and homepage information for each library
- **Update Availability**: Compare with the latest version to see which libraries can be updated
- **Update Libraries**: Update to the latest version
- **Detect Unused Libraries**: Identify libraries that are not actually used in the project
- **Delete Libraries**: Remove unnecessary libraries

## Usage

1. Click the Live Lib icon in the Activity Bar of VS Code.
2. All libraries in your project will be displayed.
3. Click or right-click on each library to perform the following actions:
   - **Show Details**: View library information
   - **Update**: Update to the latest version (if available)
   - **Delete**: Remove the library

## Requirements

- Node.js project (requires `package.json` file)
- npm package manager

## Extension Settings

This extension currently does not provide additional settings.

## Known Issues

- Library usage detection is based on static analysis, so dynamic imports or indirect references may not be detected.
- Library usage checking may take time for large projects.

## Release Notes

### 0.0.1

Initial release of Live Lib

- Display library list
- View library details
- Show update availability and update functionality
- Detect unused libraries
- Delete library functionality

---

# Live Lib

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
3. 각 라이브러리를 클릭하거나 우클릭하여 다음 작업을 수행할 수 있습니다:
   - **세부 정보 보기**: 라이브러리 정보 확인
   - **업데이트**: 최신 버전으로 업데이트 (업데이트 가능한 경우)
   - **삭제**: 라이브러리 제거

## 요구사항

- Node.js 프로젝트 (`package.json` 파일 필요)
- npm 패키지 매니저

## 확장 설정

이 확장은 현재 추가 설정을 제공하지 않습니다.

## 알려진 문제

- 라이브러리 사용 여부 감지는 정적 분석을 기반으로 하므로, 동적 import나 간접 참조는 감지하지 못할 수 있습니다.
- 대규모 프로젝트의 경우 라이브러리 사용 여부 검사에 시간이 걸릴 수 있습니다.

## 릴리즈 노트

### 0.0.1

Initial release of Live Lib

- 라이브러리 목록 표시
- 라이브러리 세부 정보 보기
- 업데이트 가능 여부 표시 및 업데이트 기능
- 미사용 라이브러리 감지
- 라이브러리 삭제 기능
