import { convertSync } from '../src';
import { getSchema } from './helpers';

['basic', 'address', 'calendar', 'events'].forEach((test) => {
	it(`converts ${test}/openapi.json synchronously`, ({ expect }) => {
		const schema = getSchema(test + '/json-schema.json');
		const result = convertSync(schema);

		const expected = getSchema(test + '/openapi.json');

		expect(result).toEqual(expected);
	});

	it(`converting ${test}/openapi.json in place synchronously`, ({ expect }) => {
		const schema = getSchema(test + '/json-schema.json');
		const result = convertSync(schema, { cloneSchema: false });
		const expected = getSchema(test + '/openapi.json');

		expect(schema).toEqual(result);
		expect(result).toEqual(expected);
	});
});

it('handles unreferenced definitions synchronously', ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: 'object',
		properties: {
			name: {
				type: 'string',
			},
		},
		definitions: {
			Address: {
				type: 'object',
				properties: {
					street: { type: 'string' },
					city: { type: 'string' },
				},
			},
			Person: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					age: { type: 'integer' },
				},
			},
		},
	};

	const result = convertSync(schema, { convertUnreferencedDefinitions: true });

	expect((result as any).definitions).toBeDefined();
	expect((result as any).definitions.Address).toEqual({
		type: 'object',
		properties: {
			street: { type: 'string' },
			city: { type: 'string' },
		},
	});
	expect((result as any).definitions.Person).toEqual({
		type: 'object',
		properties: {
			name: { type: 'string' },
			age: { type: 'integer' },
		},
	});
});

it('handles definitions without type synchronously', ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: 'object',
		properties: {
			name: {
				type: 'string',
			},
		},
		definitions: {
			NoType: {
				properties: {
					value: { type: 'string' },
				},
			},
		},
	};

	const result = convertSync(schema, { convertUnreferencedDefinitions: true });

	expect((result as any).definitions.NoType).toEqual({
		properties: {
			value: { type: 'string' },
		},
	});
});

// Synchronous version of const test
it('const synchronously', ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: 'string',
		const: 'hello',
	};

	const result = convertSync(schema);

	const expected = {
		type: 'string',
		enum: ['hello'],
	};

	expect(result).toEqual(expected);
});

// Synchronous version of if-then-else test
it('if-then-else synchronously', ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		if: { type: 'object' },
		then: { properties: { id: { type: 'string' } } },
		else: { format: 'uuid' },
	};

	const result = convertSync(schema);

	const expected = {
		oneOf: [
			{
				allOf: [{ type: 'object' }, { properties: { id: { type: 'string' } } }],
			},
			{ allOf: [{ not: { type: 'object' } }, { format: 'uuid' }] },
		],
	};

	expect(result).toEqual(expected);
});

// Synchronous version of nullable test
it('nullable synchronously', ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: ['string', 'null'],
	};

	const result = convertSync(schema);

	expect(result).toEqual({
		type: 'string',
		nullable: true,
	});
});

// Synchronous version of pattern properties test
it('patternProperties synchronously', ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: 'object',
		additionalProperties: {
			type: 'string',
		},
		patternProperties: {
			'^[a-z]*$': {
				type: 'string',
			},
		},
	};

	const result = convertSync(schema);

	const expected = {
		type: 'object',
		additionalProperties: {
			type: 'string',
		},
		'x-patternProperties': {
			'^[a-z]*$': {
				type: 'string',
			},
		},
	};

	expect(result).toEqual(expected);
});

// Invalid types synchronously (error case)
it('invalid type synchronously', ({ expect }) => {
	const schema = { type: 'dateTime' };
	expect(() => convertSync(schema)).toThrowError(/is not a valid type/);
});

// External references (unsupported in sync)
it('external reference synchronously', ({ expect }) => {
	const schema = {
		$ref: 'https://example.com/schema.json#/definitions/Type',
	};
	// Since sync doesn't support deref, it should leave as-is
	const result = convertSync(schema);
	expect(result).toHaveProperty('$ref');
});

// Options: convertUnreferencedDefinitions false
it('skips unreferenced definitions when option is false', ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		type: 'object',
		properties: {
			name: { type: 'string' },
		},
		definitions: {
			Address: {
				type: 'object',
				properties: {
					street: { type: 'string' },
					city: { type: 'string' },
				},
			},
		},
	};

	const result = convertSync(schema, { convertUnreferencedDefinitions: false });

	expect((result as any).definitions).toBeDefined();
	// Expect Address to remain as-is since not processed
	expect((result as any).definitions.Address).toEqual({
		type: 'object',
		properties: {
			street: { type: 'string' },
			city: { type: 'string' },
		},
	});
});

// Malformed schema
it('handles malformed schema synchronously', ({ expect }) => {
	const schema = null as any;
	expect(() => convertSync(schema)).toThrow();
});

// Large number of definitions (stress test)
it('handles many unreferenced definitions synchronously', ({ expect }) => {
	const definitions: any = {};
	for (let i = 0; i < 100; i++) {
		definitions[`Def${i}`] = { type: 'string' };
	}
	const schema = {
		type: 'object',
		definitions,
	};

	const result = convertSync(schema, { convertUnreferencedDefinitions: true });

	expect(Object.keys((result as any).definitions)).toHaveLength(100);
	for (let i = 0; i < 100; i++) {
		expect((result as any).definitions[`Def${i}`]).toEqual({ type: 'string' });
	}
});
