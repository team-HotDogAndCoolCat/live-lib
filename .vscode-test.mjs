import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
	{
		label: 'default',
		files: 'out/test/integration/**/*.test.js',
	},
	{
		// 번역 파일(package.nls.ko.json, l10n/bundle.l10n.ko.json)이 실제로 적용되는지 확인한다
		label: 'ko',
		files: 'out/test/integration-ko/**/*.test.js',
		launchArgs: ['--locale=ko'],
		// 언어 팩이 없으면 --locale=ko를 줘도 영어로 실행된다
		installExtensions: ['MS-CEINTL.vscode-language-pack-ko'],
	},
]);
