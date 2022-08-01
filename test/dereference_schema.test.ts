import convert from '../src';
import { join } from 'path';
import nock from 'nock';

it('not dereferencing schema by default', async ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		properties: {
			foo: {
				$ref: '#/definitions/foo',
			},
		},
		definitions: {
			foo: ['string', 'null'],
		},
	};

	const result = await convert(JSON.parse(JSON.stringify(schema)));

	const expected: any = { ...schema };
	if ('$schema' in expected) {
		delete expected.$schema;
	}

	expect(result).toEqual(expected);
});

it('dereferencing schema with deference option', async ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: {
			$ref: '#/definitions/foo',
		},
		definitions: {
			foo: ['string', 'null'],
		},
	};

	const result = await convert(schema, { dereference: true });

	const expected = {
		type: 'string',
		nullable: true,
		definitions: {
			foo: ['string', 'null'],
		},
	};

	expect(result).toEqual(expected);
});

it('dereferencing schema with remote http and https references', async ({
	expect,
}) => {
	nock('http://foo.bar/')
		.get('/schema.yaml')
		.replyWithFile(200, join(__dirname, 'fixtures/definitions.yaml'), {
			'Content-Type': 'application/yaml',
		});

	nock('https://baz.foo/')
		.get('/schema.yaml')
		.replyWithFile(200, join(__dirname, 'fixtures/definitions.yaml'), {
			'Content-Type': 'application/yaml',
		});

	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		allOf: [
			{ $ref: 'http://foo.bar/schema.yaml#/definitions/foo' },
			{ $ref: 'https://baz.foo/schema.yaml#/definitions/bar' },
		],
	};

	const result = await convert(schema, { dereference: true });

	const expected = {
		allOf: [{ type: 'string' }, { type: 'number' }],
	};

	expect(result).toEqual(expected);
});

it('dereferencing schema with file references', async ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		allOf: [
			// points to current working directory, hence the `test` prefix
			{ $ref: './test/fixtures/definitions.yaml#/definitions/foo' },
			{ $ref: join(__dirname, 'fixtures/definitions.yaml#/definitions/bar') },
		],
	};

	const result = await convert(schema, { dereference: true });

	const expected = {
		allOf: [{ type: 'string' }, { type: 'number' }],
	};

	expect(result).toEqual(expected);
});

it('throws an error when dereferecing fails', async ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		properties: {
			foo: {
				$ref: './bad.json',
			},
		},
	};

	let error;
	try {
		await convert(schema, { dereference: true });
	} catch (e) {
		error = e;
	}

	expect(error).have.property('ioErrorCode', 'ENOENT');
});
