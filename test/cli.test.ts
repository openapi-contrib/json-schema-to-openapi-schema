import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { getSchema } from './helpers';

const execFileAsync = promisify(execFile);
const repoRoot = join(__dirname, '..');
const cliPath = join(repoRoot, 'bin', 'json-schema-to-openapi-schema.js');
const schemaPath = join(repoRoot, 'test', 'schemas', 'basic', 'json-schema.json');
const expectedOpenApiPath = 'basic/openapi.json';

it('prints help without crashing', async ({ expect }) => {
	const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, '-h'], {
		cwd: repoRoot,
	});

	expect(stderr).toBe('');
	expect(stdout).toContain('json-schema-to-openapi-schema <command> [options] <file>');
});

it('converts a schema through the CLI', async ({ expect }) => {
	const { stdout, stderr } = await execFileAsync(
		process.execPath,
		[cliPath, 'convert', schemaPath],
		{
			cwd: repoRoot,
		},
	);

	expect(stderr).toBe('');
	expect(JSON.parse(stdout)).toEqual(getSchema(expectedOpenApiPath));
});
