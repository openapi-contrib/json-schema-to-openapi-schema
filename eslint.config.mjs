import eslint from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';

import prettierExtends from 'eslint-config-prettier';
import { fixupPluginRules } from '@eslint/compat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const globalToUse = {
	...globals.browser,
	...globals.serviceworker,
	...globals.es2021,
	...globals.worker,
	...globals.node,
};

export default tseslint.config({
	extends: [
		{
			ignores: ['dist/**', 'bin/**'],
		},
		prettierExtends,
		eslint.configs.recommended,
		...tseslint.configs.recommended,
	],
	settings: {
		react: { version: 'detect' },
	},
	plugins: {
		prettierPlugin,
		'unused-imports': fixupPluginRules(unusedImportsPlugin),
	},
	rules: {
		indent: [
			'error',
			'tab',
			{
				SwitchCase: 1,
			},
		],
		'linebreak-style': [
			'error',
			process.platform === 'win32' ? 'windows' : 'unix',
		],
		quotes: ['error', 'single'],
		semi: ['error', 'always'],
		'@typescript-eslint/ban-ts-comment': 'off',
		'@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
		'@typescript-eslint/consistent-type-imports': [
			'error',
			{
				prefer: 'type-imports',
			},
		],
		'@typescript-eslint/no-explicit-any': 'off',
	},
	languageOptions: {
		globals: globalToUse,
		parserOptions: {
			ecmaFeatures: {
				jsx: true,
			},
		},
	},
});
