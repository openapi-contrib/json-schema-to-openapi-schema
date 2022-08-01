import convert from '../src';

it('if-then-else', async ({ expect }) => {
	const schema = {
		$schema: 'http://json-schema.org/draft-04/schema#',
		if: { type: 'object' },
		then: { properties: { id: { type: 'string' } } },
		else: { format: 'uuid' },
	};

	const result = await convert(schema);

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
