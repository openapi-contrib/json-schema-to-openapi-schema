import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		watch: false,
		isolate: false,
		reporters: 'verbose',
	},
	esbuild: {
		target: 'node22',
	},
});
