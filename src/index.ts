import type {
	JSONSchema4,
	JSONSchema6Definition,
	JSONSchema7Definition,
} from 'json-schema';
import type { Options, OptionsSync, SchemaType, SchemaTypeKeys } from './types';
import { Walker } from 'json-schema-walker';
import { allowedKeywords } from './const';
import { type OpenAPIV3 } from 'openapi-types';
import type { JSONSchema } from '@apidevtools/json-schema-ref-parser';

class InvalidTypeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidTypeError';
		this.message = message;
	}
}

const oasExtensionPrefix = 'x-';

const handleDefinition = async <T extends JSONSchema4 = JSONSchema4>(
	def: JSONSchema7Definition | JSONSchema6Definition | JSONSchema4,
	schema: T,
) => {
	if (typeof def !== 'object') {
		return def;
	}

	const type = def.type;
	if (type) {
		// Walk just the definitions types
		const walker = new Walker<T>();
		await walker.loadSchema(
			{
				definitions: schema['definitions'] || [],
				...def,
				$schema: schema['$schema'],
			} as any,
			{
				dereference: true,
				cloneSchema: true,
				dereferenceOptions: {
					dereference: {
						circular: 'ignore',
					},
				},
			},
		);
		await walker.walk(convertSchema, walker.vocabularies.DRAFT_07);
		if ('definitions' in walker.rootSchema) {
			delete (<any>walker.rootSchema).definitions;
		}
		return walker.rootSchema;
	}
	if (Array.isArray(def)) {
		// if it's an array, we might want to reconstruct the type;
		const typeArr = def;
		const hasNull = typeArr.includes('null');
		if (hasNull) {
			const actualTypes = typeArr.filter((l) => l !== 'null');
			return {
				type: actualTypes.length === 1 ? actualTypes[0] : actualTypes,
				nullable: true,
				// this is incorrect but thats ok, we are in the inbetween phase here
			} as JSONSchema7Definition | JSONSchema6Definition | JSONSchema4;
		}
	}

	return def;
};

const handleDefinitionSync = <T extends JSONSchema4 = JSONSchema4>(
	def: JSONSchema7Definition | JSONSchema6Definition | JSONSchema4,
	schema: T,
) => {
	if (typeof def !== 'object') {
		return def;
	}

	const type = def.type;
	if (type) {
		// Walk just the definitions types
		const walker = new Walker<T>();
		walker.loadSchemaSync(
			{
				definitions: schema['definitions'] || [],
				...def,
				$schema: schema['$schema'],
			} as any,
			{
				cloneSchema: true,
			},
		);
		walker.walkSync(convertSchema, walker.vocabularies.DRAFT_07);
		if ('definitions' in walker.rootSchema) {
			delete (<any>walker.rootSchema).definitions;
		}
		return walker.rootSchema;
	}
	if (Array.isArray(def)) {
		// if it's an array, we might want to reconstruct the type;
		const typeArr = def;
		const hasNull = typeArr.includes('null');
		if (hasNull) {
			const actualTypes = typeArr.filter((l) => l !== 'null');
			return {
				type: actualTypes.length === 1 ? actualTypes[0] : actualTypes,
				nullable: true,
				// this is incorrect but thats ok, we are in the inbetween phase here
			} as JSONSchema7Definition | JSONSchema6Definition | JSONSchema4;
		}
	}

	return def;
};

export const convert = async <T extends object = JSONSchema4>(
	schema: T,
	options?: Options,
): Promise<OpenAPIV3.Document> => {
	const walker = new Walker<T>();
	const convertDefs = options?.convertUnreferencedDefinitions ?? true;
	await walker.loadSchema(schema, options);
	await walker.walk(convertSchema, walker.vocabularies.DRAFT_07);
	// if we want to convert unreferenced definitions, we need to do it iteratively here
	const rootSchema = walker.rootSchema as unknown as JSONSchema;
	if (convertDefs && rootSchema?.definitions) {
		for (const defName in rootSchema.definitions) {
			const def = rootSchema.definitions[defName];
			rootSchema.definitions[defName] = await handleDefinition(def, schema);
		}
	}
	return rootSchema as OpenAPIV3.Document;
};

export const convertSync = <T extends object = JSONSchema4>(
	schema: T,
	options?: OptionsSync,
): OpenAPIV3.Document => {
	const walker = new Walker<T>();
	const convertDefs = options?.convertUnreferencedDefinitions ?? true;
	walker.loadSchemaSync(schema, options);
	walker.walkSync(convertSchema, walker.vocabularies.DRAFT_07);
	// if we want to convert unreferenced definitions, we need to do it iteratively here
	const rootSchema = walker.rootSchema as unknown as JSONSchema;
	if (convertDefs && rootSchema?.definitions) {
		for (const defName in rootSchema.definitions) {
			const def = rootSchema.definitions[defName];
			rootSchema.definitions[defName] = handleDefinitionSync(def, schema);
		}
	}
	return rootSchema as OpenAPIV3.Document;
};

function stripIllegalKeywords(schema: SchemaType) {
	if (typeof schema !== 'object') {
		return schema;
	}
	delete schema['$schema'];
	delete schema['$id'];
	if ('id' in schema) {
		delete schema['id'];
	}
	return schema;
}

function convertSchema(schema: SchemaType | undefined) {
	if (!schema) {
		return schema;
	}
	schema = stripIllegalKeywords(schema);
	schema = convertTypes(schema);
	schema = rewriteConst(schema);
	schema = convertDependencies(schema);
	schema = convertNullable(schema);
	schema = rewriteIfThenElse(schema);
	schema = rewriteExclusiveMinMax(schema);
	schema = convertExamples(schema);

	if (typeof schema['patternProperties'] === 'object') {
		schema = convertPatternProperties(schema);
	}

	if (schema.type === 'array' && typeof schema.items === 'undefined') {
		schema.items = {};
	}

	// should be called last
	schema = convertIllegalKeywordsAsExtensions(schema);
	return schema;
}
const validTypes = new Set([
	'null',
	'boolean',
	'object',
	'array',
	'number',
	'string',
	'integer',
]);
function validateType(type: any) {
	if (typeof type === 'object' && !Array.isArray(type)) {
		// Refs are allowed because they fix circular references
		if (type.$ref) {
			return;
		}
		// this is a de-referenced circular ref
		if (type.properties) {
			return;
		}
	}
	const types = Array.isArray(type) ? type : [type];
	types.forEach((type) => {
		if (type && !validTypes.has(type))
			throw new InvalidTypeError('Type "' + type + '" is not a valid type');
	});
}

function convertDependencies(schema: SchemaType) {
	const deps = schema.dependencies;
	if (typeof deps !== 'object') {
		return schema;
	}

	// Turns the dependencies keyword into an allOf of oneOf's
	// "dependencies": {
	// 		"post-office-box": ["street-address"]
	// },
	//
	// becomes
	//
	// "allOf": [
	// 	{
	// 		"oneOf": [
	// 			{"not": {"required": ["post-office-box"]}},
	// 			{"required": ["post-office-box", "street-address"]}
	// 		]
	// 	}
	//

	delete schema['dependencies'];
	if (!Array.isArray(schema.allOf)) {
		schema.allOf = [];
	}

	for (const key in deps) {
		const foo: (JSONSchema4 & JSONSchema6Definition) & JSONSchema7Definition = {
			oneOf: [
				{
					not: {
						required: [key],
					},
				},
				{
					required: [key, deps[key]].flat() as string[],
				},
			],
		};
		schema.allOf.push(foo);
	}
	return schema;
}

function convertNullable(schema: SchemaType) {
	for (const key of ['oneOf', 'anyOf'] as const) {
		const schemas = schema[key] as JSONSchema4[];
		if (!schemas) continue;

		if (!Array.isArray(schemas)) {
			return schema;
		}

		const hasNullable = schemas.some((item) => item.type === 'null');

		if (!hasNullable) {
			return schema;
		}

		const filtered = schemas.filter((l) => l.type !== 'null');
		for (const schemaEntry of filtered) {
			schemaEntry.nullable = true;
		}

		schema[key] = filtered;
	}

	return schema;
}

function convertTypes(schema: SchemaType) {
	if (typeof schema !== 'object') {
		return schema;
	}
	if (schema.type === undefined) {
		return schema;
	}

	validateType(schema.type);

	if (Array.isArray(schema.type)) {
		if (schema.type.includes('null')) {
			schema.nullable = true;
		}
		const typesWithoutNull = schema.type.filter((type) => type !== 'null');
		if (typesWithoutNull.length === 0) {
			delete schema.type;
		} else if (typesWithoutNull.length === 1) {
			schema.type = typesWithoutNull[0];
		} else {
			delete schema.type;
			schema.anyOf = typesWithoutNull.map((type) => ({ type }));
		}
	} else if (schema.type === 'null') {
		delete schema.type;
		schema.nullable = true;
	}

	return schema;
}

// "patternProperties did not make it into OpenAPI v3.0"
// https://github.com/OAI/OpenAPI-Specification/issues/687
function convertPatternProperties(schema: SchemaType) {
	schema['x-patternProperties'] = schema['patternProperties'];
	delete schema['patternProperties'];
	schema.additionalProperties ??= true;
	return schema;
}

// keywords (or property names) that are not recognized within OAS3 are rewritten into extensions.
function convertIllegalKeywordsAsExtensions(schema: SchemaType) {
	const keys = Object.keys(schema) as SchemaTypeKeys[];
	keys
		.filter(
			(keyword) =>
				!keyword.startsWith(oasExtensionPrefix) &&
				!allowedKeywords.includes(keyword),
		)
		.forEach((keyword: SchemaTypeKeys) => {
			const key = `${oasExtensionPrefix}${keyword}` as keyof SchemaType;
			schema[key] = schema[keyword];
			delete schema[keyword];
		});
	return schema;
}

function convertExamples(schema: SchemaType) {
	if (schema['examples'] && Array.isArray(schema['examples'])) {
		schema['example'] = schema['examples'][0];
		delete schema['examples'];
	}

	return schema;
}

function rewriteConst(schema: SchemaType) {
	if (Object.hasOwnProperty.call(schema, 'const')) {
		schema.enum = [schema.const];
		delete schema.const;
	}
	return schema;
}

function rewriteIfThenElse(schema: SchemaType) {
	if (typeof schema !== 'object') {
		return schema;
	}
	/* @handrews https://github.com/OAI/OpenAPI-Specification/pull/1766#issuecomment-442652805
  if and the *Of keywords

  There is a really easy solution for implementations, which is that

  if: X, then: Y, else: Z

  is equivalent to

  oneOf: [allOf: [X, Y], allOf: [not: X, Z]]
  */
	if ('if' in schema && schema.if && schema.then) {
		schema.oneOf = [
			{ allOf: [schema.if, schema.then].filter(Boolean) },
			{ allOf: [{ not: schema.if }, schema.else].filter(Boolean) },
		];
		delete schema.if;
		delete schema.then;
		delete schema.else;
	}
	return schema;
}

function rewriteExclusiveMinMax(schema: SchemaType) {
	if (typeof schema.exclusiveMaximum === 'number') {
		schema.maximum = schema.exclusiveMaximum;
		(schema as JSONSchema4).exclusiveMaximum = true;
	}
	if (typeof schema.exclusiveMinimum === 'number') {
		schema.minimum = schema.exclusiveMinimum;
		(schema as JSONSchema4).exclusiveMinimum = true;
	}
	return schema;
}

export default convert;
