import { defineConfig } from '@vscode/test-cli';

const korean = {
	launchArgs: ['--locale=ko'],
	// 언어 팩이 없으면 --locale=ko를 줘도 영어로 실행된다
	installExtensions: ['MS-CEINTL.vscode-language-pack-ko'],
};

export default defineConfig([
	{
		label: 'default',
		files: 'out/test/integration/**/*.test.js',
	},
	{
		// 언어 팩은 설치 후 첫 실행에서 등록되고 다음 실행부터 적용된다.
		// 매번 새 환경인 CI에서도 'ko'가 한국어로 실행되도록 한 번 먼저 띄운다.
		label: 'ko-warmup',
		files: 'out/test/integration-ko-warmup/**/*.test.js',
		...korean,
	},
	{
		// 번역 파일(package.nls.ko.json, l10n/bundle.l10n.ko.json)이 실제로 적용되는지 확인한다
		label: 'ko',
		files: 'out/test/integration-ko/**/*.test.js',
		...korean,
	},
]);
