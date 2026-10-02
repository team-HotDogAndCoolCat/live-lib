import * as vscode from "vscode";

// 언어 팩을 설치한 직후 첫 실행에서는 VS Code가 아직 영어로 뜬다.
// 이 실행에서 언어 팩이 등록되고, 다음 'ko' 구성부터 한국어로 실행된다.
suite("한국어 언어 팩 준비", () => {
  test("VS Code를 한 번 실행해 언어 팩을 등록한다", () => {
    console.log(`[ko-warmup] display language: ${vscode.env.language}`);
  });
});
