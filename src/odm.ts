import { z } from "zod/v4";
import type { Document } from "mongodb";
import { ObjectId } from "mongodb";
import { dbModelSchema } from "./schema.js";

// ============================================
// TYPES
// ============================================

interface RelationConfig {
    collection: string;
    foreignField?: string;
    localField?: string;
}

interface RelationMeta {
    _relation?: RelationConfig;
}

interface SnapshotMeta {
    _snapshot?: true;
}

type SchemaWithPipeline<T extends z.ZodTypeAny> = T & {
    pipeline: (visited?: Set<string>) => Document[];
    toSave: (data: z.input<T>) => z.output<T>;
};

// ============================================
// HELPERS
// ============================================

const getDef = (schema: z.ZodTypeAny): any => {
    return (schema as any)._zod?.def ?? (schema as any)._def ?? {};
};

const getTypeName = (schema: z.ZodTypeAny): string => {
    const def = getDef(schema);
    return def.type ?? def.typeName ?? "";
};

const unwrapSchema = (schema: z.ZodTypeAny): z.ZodTypeAny => {
    let inner = schema;
    let typeName = getTypeName(inner);

    while (
        typeName === "optional" ||
        typeName === "nullable" ||
        typeName === "default" ||
        typeName === "pipe"
    ) {
        const def = getDef(inner);

        if (typeName === "pipe") {
            inner = def.in ?? inner;
        } else {
            inner = def.innerType ?? inner;
        }

        typeName = getTypeName(inner);
    }

    return inner;
};

const getRelationMeta = (schema: z.ZodTypeAny): RelationConfig | undefined => {
    return (schema as z.ZodTypeAny & RelationMeta)._relation;
};

const isSnapshot = (schema: z.ZodTypeAny): boolean => {
    return (schema as z.ZodTypeAny & SnapshotMeta)._snapshot === true;
};

const hasPipeline = (
    schema: z.ZodTypeAny,
): schema is SchemaWithPipeline<z.ZodTypeAny> => {
    return typeof (schema as any).pipeline === "function";
};

const isObjectSchema = (schema: z.ZodTypeAny): boolean => {
    return getTypeName(schema) === "object";
};

const isArraySchema = (schema: z.ZodTypeAny): boolean => {
    return getTypeName(schema) === "array";
};

const getArrayElement = (schema: z.ZodTypeAny): z.ZodTypeAny | undefined => {
    const def = getDef(schema);
    return def.element;
};

const getObjectShape = (
    schema: z.ZodTypeAny,
): Record<string, z.ZodTypeAny> | undefined => {
    const def = getDef(schema);
    return def.shape;
};

// ============================================
// PIPELINE GENERATION
// ============================================

const generatePipeline = (
    schema: z.ZodTypeAny,
    visited: Set<string> = new Set(),
): Document[] => {
    const pipeline: Document[] = [];
    const projection: Record<string, 1> = {};

    const buildNestedPipeline = (
        fieldSchema: z.ZodTypeAny,
        fieldUnwrapped: z.ZodTypeAny,
        collection: string,
    ): Document[] => {
        if (visited.has(collection)) {
            // Cycle detected — truncate: no nested pipeline
            return [];
        }
        const nextVisited = new Set(visited);
        nextVisited.add(collection);
        if (hasPipeline(fieldSchema)) return fieldSchema.pipeline(nextVisited);
        if (hasPipeline(fieldUnwrapped)) return fieldUnwrapped.pipeline(nextVisited);
        return [];
    };

    const process = (currentSchema: z.ZodTypeAny, prefix: string) => {
        const unwrapped = unwrapSchema(currentSchema);

        if (isArraySchema(unwrapped)) {
            const innerSchema = getArrayElement(unwrapped);
            if (!innerSchema) return;

            const innerUnwrapped = unwrapSchema(innerSchema);

            if (isSnapshot(innerSchema) || isSnapshot(innerUnwrapped)) {
                projection[prefix] = 1;
                return;
            }

            const relationMeta =
                getRelationMeta(innerSchema) ?? getRelationMeta(innerUnwrapped);

            if (relationMeta) {
                const nestedPipeline = buildNestedPipeline(
                    innerSchema,
                    innerUnwrapped,
                    relationMeta.collection,
                );

                pipeline.push({
                    $lookup: {
                        from: relationMeta.collection,
                        localField: relationMeta.localField ?? prefix,
                        foreignField: relationMeta.foreignField ?? "_id",
                        as: prefix,
                        ...(nestedPipeline.length > 0 && {
                            pipeline: nestedPipeline,
                        }),
                    },
                });
                projection[prefix] = 1;
            } else if (isObjectSchema(innerUnwrapped)) {
                process(innerSchema, prefix);
            } else {
                projection[prefix] = 1;
            }

            return;
        }

        if (isObjectSchema(unwrapped)) {
            const shape = getObjectShape(unwrapped);
            if (!shape) return;

            for (const [key, fieldSchema] of Object.entries(shape)) {
                const mongoKey = key === "id" ? "_id" : key;
                const fieldPath = prefix ? `${prefix}.${mongoKey}` : mongoKey;
                const fieldUnwrapped = unwrapSchema(fieldSchema);

                if (isSnapshot(fieldSchema) || isSnapshot(fieldUnwrapped)) {
                    projection[fieldPath] = 1;
                    continue;
                }

                const relationMeta =
                    getRelationMeta(fieldSchema) ?? getRelationMeta(fieldUnwrapped);

                if (relationMeta) {
                    const nestedPipeline = buildNestedPipeline(
                        fieldSchema,
                        fieldUnwrapped,
                        relationMeta.collection,
                    );

                    pipeline.push({
                        $lookup: {
                            from: relationMeta.collection,
                            localField: relationMeta.localField ?? fieldPath,
                            foreignField: relationMeta.foreignField ?? "_id",
                            as: fieldPath,
                            ...(nestedPipeline.length > 0 && {
                                pipeline: nestedPipeline,
                            }),
                        },
                    });

                    pipeline.push({
                        $set: {
                            [fieldPath]: { $arrayElemAt: [`$${fieldPath}`, 0] },
                        },
                    });

                    projection[fieldPath] = 1;
                } else if (isObjectSchema(fieldUnwrapped)) {
                    process(fieldSchema, fieldPath);
                } else if (isArraySchema(fieldUnwrapped)) {
                    process(fieldSchema, fieldPath);
                } else {
                    projection[fieldPath] = 1;
                }
            }
        }
    };

    process(schema, "");

    if (Object.keys(projection).length > 0) {
        pipeline.push({ $project: projection });
    }

    return pipeline;
};

/**
 * A reverse relation is one where `localField` is set to a field different
 * from the field itself. The value lives elsewhere in the document — this
 * field is a populated destination, not stored data.
 */
const isReverseRelation = (schema: z.ZodTypeAny, fieldName: string): boolean => {
    const unwrapped = unwrapSchema(schema);
    const meta = getRelationMeta(schema) ?? getRelationMeta(unwrapped);
    if (!meta || !meta.localField) return false;
    return meta.localField !== fieldName;
};

/**
 * Transform data for saving - converts relations to ObjectIds recursively.
 * Reverse relations (localField !== field name) are omitted from the output.
 */
const transformForSave = (schema: z.ZodTypeAny, data: any): any => {
    if (data === null || data === undefined) return data;

    const unwrapped = unwrapSchema(schema);

    if (isSnapshot(schema) || isSnapshot(unwrapped)) {
        return data;
    }

    const relationMeta =
        getRelationMeta(schema) ?? getRelationMeta(unwrapped);
    if (relationMeta) {
        return new ObjectId(data.id as string);
    }

    if (isArraySchema(unwrapped) && Array.isArray(data)) {
        const innerSchema = getArrayElement(unwrapped);
        if (!innerSchema) return data;
        return data.map((item) => transformForSave(innerSchema, item));
    }

    if (isObjectSchema(unwrapped) && typeof data === "object") {
        const shape = getObjectShape(unwrapped);
        if (!shape) return data;

        const result: any = { ...data };
        for (const [key, fieldSchema] of Object.entries(shape)) {
            if (isReverseRelation(fieldSchema, key)) {
                delete result[key];
                continue;
            }

            // Array of reverse relations
            const fieldUnwrapped = unwrapSchema(fieldSchema);
            if (isArraySchema(fieldUnwrapped)) {
                const innerSchema = getArrayElement(fieldUnwrapped);
                if (innerSchema && isReverseRelation(innerSchema, key)) {
                    delete result[key];
                    continue;
                }
            }

            if (key in data) {
                result[key] = transformForSave(fieldSchema, data[key]);
            }
        }
        return result;
    }

    return data;
};

// ============================================
// PUBLIC API
// ============================================

export const getPipeline = (
    schema: z.ZodTypeAny,
    visited?: Set<string>,
): Document[] => {
    if (hasPipeline(schema)) {
        return schema.pipeline(visited);
    }
    const unwrapped = unwrapSchema(schema);
    if (hasPipeline(unwrapped)) {
        return unwrapped.pipeline(visited);
    }
    return generatePipeline(unwrapped, visited);
};

const hasToSave = (
    schema: z.ZodTypeAny,
): schema is z.ZodTypeAny & { toSave: (data: any) => any } => {
    return typeof (schema as any).toSave === "function";
};

export const toSave = <T extends z.ZodTypeAny>(
    schema: T,
    data: z.input<T>,
): z.output<T> => {
    if (hasToSave(schema)) {
        return schema.toSave(data);
    }
    const parsed = schema.parse(data);
    const unwrapped = unwrapSchema(schema);
    return transformForSave(unwrapped, parsed);
};

export const relation = <T extends z.ZodTypeAny>(
    schema: T,
    config: RelationConfig,
): T & RelationMeta => {
    return Object.assign(schema, { _relation: config });
};

export const snapshot = <T extends z.ZodTypeAny>(schema: T): T => {
    const wrapper = Object.create(schema) as T & SnapshotMeta;
    wrapper._snapshot = true;
    (wrapper as any)._relation = undefined;
    return wrapper;
};

export const dbSchema = <T extends z.ZodRawShape>(
    shape: T,
): SchemaWithPipeline<ReturnType<typeof dbModelSchema.extend<T>>> => {
    const schema = dbModelSchema.extend(shape);
    const pipelineFn = (visited?: Set<string>) => generatePipeline(schema, visited);
    const toSaveFn = (data: z.input<typeof schema>) => {
        const parsed = schema.parse(data);
        return transformForSave(schema, parsed);
    };

    const originalTransform = schema.transform.bind(schema);
    (schema as any).transform = <U>(fn: (data: z.infer<typeof schema>) => U) => {
        const transformed = originalTransform(fn);
        const toSaveTransformed = (data: any) => {
            const parsed = transformed.parse(data);
            return transformForSave(schema, parsed);
        };
        return Object.assign(transformed, {
            pipeline: pipelineFn,
            toSave: toSaveTransformed,
        });
    };

    return Object.assign(schema, {
        pipeline: pipelineFn,
        toSave: toSaveFn,
    });
};

export const embeddedSchema = <T extends z.ZodRawShape>(
    shape: T,
): SchemaWithPipeline<z.ZodObject<T>> => {
    const schema = z.object(shape);
    const pipelineFn = (visited?: Set<string>) => generatePipeline(schema, visited);
    const toSaveFn = (data: z.input<typeof schema>) => {
        const parsed = schema.parse(data);
        return transformForSave(schema, parsed);
    };

    const originalTransform = schema.transform.bind(schema);
    (schema as any).transform = <U>(fn: (data: z.infer<typeof schema>) => U) => {
        const transformed = originalTransform(fn);
        const toSaveTransformed = (data: any) => {
            const parsed = transformed.parse(data);
            return transformForSave(schema, parsed);
        };
        return Object.assign(transformed, {
            pipeline: pipelineFn,
            toSave: toSaveTransformed,
        });
    };

    return Object.assign(schema, {
        pipeline: pipelineFn,
        toSave: toSaveFn,
    });
};

export type { RelationConfig, SchemaWithPipeline };
