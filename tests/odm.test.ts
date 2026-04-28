import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { z } from "zod/v4";
import {
    dbSchema,
    embeddedSchema,
    relation,
    snapshot,
    getPipeline,
    toSave,
} from "../src/odm.js";

// ============================================
// dbSchema
// ============================================

describe("dbSchema", () => {
    it("should create a schema extending dbModelSchema", () => {
        const userSchema = dbSchema({
            name: z.string(),
            email: z.string().email(),
        });

        const result = userSchema.parse({
            name: "Mauro",
            email: "m@b.com",
        });

        expect(result.id).toBeNull();
        expect(result.createdAt).toBeNull();
        expect(result.updatedAt).toBeNull();
        expect(result.name).toBe("Mauro");
        expect(result.email).toBe("m@b.com");
    });

    it("should accept valid ObjectId as id", () => {
        const userSchema = dbSchema({ name: z.string() });
        const id = new ObjectId().toString();
        const result = userSchema.parse({ id, name: "Test" });
        expect(result.id).toBe(id);
    });

    it("should reject invalid data", () => {
        const userSchema = dbSchema({ name: z.string() });
        expect(() => userSchema.parse({})).toThrow();
    });

    it("should have a pipeline() method", () => {
        const userSchema = dbSchema({ name: z.string() });
        expect(typeof userSchema.pipeline).toBe("function");
        const pipeline = userSchema.pipeline();
        expect(Array.isArray(pipeline)).toBe(true);
    });

    it("should have a toSave() method", () => {
        const userSchema = dbSchema({ name: z.string() });
        expect(typeof userSchema.toSave).toBe("function");
    });

    it("should preserve pipeline() after .transform()", () => {
        const userSchema = dbSchema({
            name: z.string(),
        });

        const transformed = userSchema.transform((data) => ({
            ...data,
            slug: data.name.toLowerCase(),
        })) as any;

        expect(typeof transformed.pipeline).toBe("function");
        const pipeline = transformed.pipeline();
        expect(Array.isArray(pipeline)).toBe(true);
    });

    it("should preserve toSave() after .transform()", () => {
        const userSchema = dbSchema({
            name: z.string(),
        });

        const transformed = userSchema.transform((data) => ({
            ...data,
            slug: data.name.toLowerCase(),
        })) as any;

        expect(typeof transformed.toSave).toBe("function");
    });
});

// ============================================
// embeddedSchema
// ============================================

describe("embeddedSchema", () => {
    it("should create a schema WITHOUT dbModel fields", () => {
        const addressSchema = embeddedSchema({
            street: z.string(),
            city: z.string(),
        });

        const result = addressSchema.parse({
            street: "123 Main St",
            city: "NYC",
        });

        expect(result.street).toBe("123 Main St");
        expect(result.city).toBe("NYC");
        expect((result as any).id).toBeUndefined();
        expect((result as any).createdAt).toBeUndefined();
        expect((result as any).updatedAt).toBeUndefined();
    });

    it("should have a pipeline() method", () => {
        const schema = embeddedSchema({ name: z.string() });
        expect(typeof schema.pipeline).toBe("function");
    });

    it("should have a toSave() method", () => {
        const schema = embeddedSchema({ name: z.string() });
        expect(typeof schema.toSave).toBe("function");
    });

    it("should preserve pipeline() after .transform()", () => {
        const schema = embeddedSchema({ name: z.string() });
        const transformed = schema.transform((data) => ({ ...data, upper: data.name.toUpperCase() })) as any;
        expect(typeof transformed.pipeline).toBe("function");
    });
});

// ============================================
// relation
// ============================================

describe("relation", () => {
    it("should mark a schema with _relation metadata", () => {
        const companySchema = dbSchema({ name: z.string() });
        const relSchema = relation(companySchema, { collection: "companies" });

        expect((relSchema as any)._relation).toEqual({ collection: "companies" });
    });

    it("should accept custom foreignField", () => {
        const schema = relation(z.string(), {
            collection: "tags",
            foreignField: "slug",
        });

        expect((schema as any)._relation).toEqual({
            collection: "tags",
            foreignField: "slug",
        });
    });

    it("should preserve the original schema functionality", () => {
        const companySchema = dbSchema({ name: z.string() });
        const relSchema = relation(companySchema, { collection: "companies" });

        const result = relSchema.parse({ name: "Acme" });
        expect(result.name).toBe("Acme");
    });

    it("should NOT mutate the source schema", () => {
        const sceneSchema = dbSchema({ name: z.string() });

        relation(sceneSchema, { collection: "scenes" });

        // Original schema must remain untouched — no _relation leaked onto it
        expect((sceneSchema as any)._relation).toBeUndefined();

        // And it must still behave as a primary schema when used on its own:
        // toSave should produce a document, not an ObjectId reference.
        const result: any = sceneSchema.toSave({ name: "Living room" });

        expect(result).not.toBeInstanceOf(ObjectId);
        expect(result.name).toBe("Living room");
    });

    it("should not cross-contaminate when the same schema is used as a relation in multiple places", () => {
        const tagSchema = dbSchema({ label: z.string() });

        const postSchema = dbSchema({
            title: z.string(),
            tag: relation(tagSchema, { collection: "tags" }),
        });
        const articleSchema = dbSchema({
            heading: z.string(),
            tag: relation(tagSchema, {
                collection: "tags",
                foreignField: "slug",
            }),
        });

        // Each call produces an isolated wrapper; the shared tagSchema is clean.
        expect((tagSchema as any)._relation).toBeUndefined();

        const postPipeline = postSchema.pipeline();
        const articlePipeline = articleSchema.pipeline();

        const postLookup = postPipeline.find((s) => "$lookup" in s);
        const articleLookup = articlePipeline.find((s) => "$lookup" in s);

        expect(postLookup?.$lookup.foreignField).toBe("_id");
        expect(articleLookup?.$lookup.foreignField).toBe("slug");
    });
});

// ============================================
// snapshot
// ============================================

describe("snapshot", () => {
    it("should mark a schema with _snapshot metadata", () => {
        const companySchema = dbSchema({ name: z.string() });
        const snapSchema = snapshot(companySchema);

        expect((snapSchema as any)._snapshot).toBe(true);
    });

    it("should clear _relation on snapshot", () => {
        const companySchema = dbSchema({ name: z.string() });
        const relSchema = relation(companySchema, { collection: "companies" });
        const snapSchema = snapshot(relSchema);

        expect((snapSchema as any)._relation).toBeUndefined();
        expect((snapSchema as any)._snapshot).toBe(true);
    });

    it("should preserve the original schema functionality", () => {
        const companySchema = dbSchema({ name: z.string() });
        const snapSchema = snapshot(companySchema);

        const result = snapSchema.parse({ name: "Acme" });
        expect(result.name).toBe("Acme");
    });
});

// ============================================
// getPipeline
// ============================================

describe("getPipeline", () => {
    it("should generate pipeline with $project for simple schema", () => {
        const userSchema = dbSchema({
            name: z.string(),
            email: z.string(),
        });

        const pipeline = getPipeline(userSchema);
        const projectStage = pipeline.find((s) => s.$project);
        expect(projectStage).toBeDefined();
        expect(projectStage!.$project._id).toBe(1);
        expect(projectStage!.$project.name).toBe(1);
        expect(projectStage!.$project.email).toBe(1);
    });

    it("should generate $lookup for relation fields", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }),
        });

        const pipeline = getPipeline(userSchema);
        const lookupStage = pipeline.find((s) => s.$lookup);
        expect(lookupStage).toBeDefined();
        expect(lookupStage!.$lookup.from).toBe("companies");
        expect(lookupStage!.$lookup.localField).toBe("company");
        expect(lookupStage!.$lookup.foreignField).toBe("_id");
    });

    it("should generate $set to extract single relation from array", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }),
        });

        const pipeline = getPipeline(userSchema);
        const setStage = pipeline.find((s) => s.$set);
        expect(setStage).toBeDefined();
        expect(setStage!.$set.company).toEqual({ $arrayElemAt: ["$company", 0] });
    });

    it("should generate $lookup without $set for array relations", () => {
        const tagSchema = dbSchema({ label: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            tags: z.array(relation(tagSchema, { collection: "tags" })),
        });

        const pipeline = getPipeline(userSchema);
        const lookupStage = pipeline.find((s) => s.$lookup);
        expect(lookupStage).toBeDefined();
        expect(lookupStage!.$lookup.from).toBe("tags");

        // Should NOT have $set for array relations
        const setStage = pipeline.find((s) => s.$set?.tags);
        expect(setStage).toBeUndefined();
    });

    it("should NOT generate $lookup for snapshot fields", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: snapshot(relation(companySchema, { collection: "companies" })),
        });

        const pipeline = getPipeline(userSchema);
        const lookupStage = pipeline.find((s) => s.$lookup);
        expect(lookupStage).toBeUndefined();
    });

    it("should project snapshot fields as-is", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: snapshot(companySchema),
        });

        const pipeline = getPipeline(userSchema);
        const projectStage = pipeline.find((s) => s.$project);
        expect(projectStage!.$project.company).toBe(1);
    });

    it("should use pipeline() method if available on schema", () => {
        const userSchema = dbSchema({ name: z.string() });
        const pipeline = getPipeline(userSchema);
        expect(pipeline).toEqual(userSchema.pipeline());
    });

    it("should handle nested relation with pipeline", () => {
        const tagSchema = dbSchema({ label: z.string() });
        const companySchema = dbSchema({
            name: z.string(),
            tags: z.array(relation(tagSchema, { collection: "tags" })),
        });

        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }),
        });

        const pipeline = getPipeline(userSchema);
        const lookupStage = pipeline.find(
            (s) => s.$lookup && s.$lookup.from === "companies",
        );
        expect(lookupStage).toBeDefined();
        // Nested pipeline should contain the tags lookup
        expect(lookupStage!.$lookup.pipeline).toBeDefined();
    });

    it("should handle optional/nullable relation fields", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }).nullable().optional(),
        });

        const pipeline = getPipeline(userSchema);
        const lookupStage = pipeline.find((s) => s.$lookup);
        expect(lookupStage).toBeDefined();
        expect(lookupStage!.$lookup.from).toBe("companies");
    });

    it("should generate top-level $lookup for nested relation wrapped with .nullable().optional()", () => {
        // Reproducer for the my-ha bug report: a relation whose target is
        // itself a schema with relations, wrapped with .nullable().optional().
        // Pre-fix: relation() mutated the target; .nullable().optional() in
        // Zod 4 lost the mutation, so getPipeline failed to detect _relation
        // and recursed into the nested schema's fields instead — generating
        // bogus $lookups with dot-notation localField like "app.stack".
        const stackSchema = dbSchema({ name: z.string() });
        const appSchema = dbSchema({
            name: z.string(),
            stack: relation(stackSchema, { collection: "stacks" }),
        });
        const domainSchema = dbSchema({
            domain: z.string(),
            app: relation(appSchema, { collection: "apps" })
                .nullable()
                .optional(),
        });

        const pipeline = getPipeline(domainSchema);

        // Top-level $lookup must be on "app", not "app.stack".
        const appLookup = pipeline.find(
            (s) => s.$lookup && s.$lookup.as === "app",
        );
        expect(appLookup).toBeDefined();
        expect(appLookup!.$lookup.from).toBe("apps");
        expect(appLookup!.$lookup.localField).toBe("app");

        // No bogus dot-notation lookup at the top level.
        const bogus = pipeline.find(
            (s) => s.$lookup && s.$lookup.localField === "app.stack",
        );
        expect(bogus).toBeUndefined();

        // Nested pipeline for apps should include the stacks lookup.
        const nested = appLookup!.$lookup.pipeline as any[];
        expect(nested).toBeDefined();
        const stackLookup = nested.find(
            (s) => s.$lookup && s.$lookup.from === "stacks",
        );
        expect(stackLookup).toBeDefined();
        expect(stackLookup!.$lookup.localField).toBe("stack");
    });

    it("should generate top-level $lookup when the relation target is a transformed schema (ZodPipe) wrapped with .nullable().optional()", () => {
        // Bug report: appSchema is built with .transform(...), which makes it
        // a ZodPipe in Zod 4. relation() clones the pipe and sets _relation
        // on the clone, but unwrapSchema descends past the pipe into pipe.in
        // (the original base schema, without _relation) — so the marker is
        // lost and the pipeline recurses into sub-fields generating bogus
        // dot-notation $lookups like "app.stack".
        const stackSchema = dbSchema({ name: z.string() });
        const appBaseSchema = dbSchema({
            name: z.string(),
            stack: relation(stackSchema, { collection: "stacks" }),
        });
        const appSchema = appBaseSchema.transform((data) => ({
            ...data,
            upper: data.name.toUpperCase(),
        }));

        const domainSchema = dbSchema({
            domain: z.string(),
            app: relation(appSchema, { collection: "apps" })
                .nullable()
                .optional(),
        });

        const pipeline = getPipeline(domainSchema);

        const appLookup = pipeline.find(
            (s) => s.$lookup && s.$lookup.as === "app",
        );
        expect(appLookup, "should generate top-level $lookup for `app`").toBeDefined();
        expect(appLookup!.$lookup.from).toBe("apps");
        expect(appLookup!.$lookup.localField).toBe("app");
        expect(appLookup!.$lookup.foreignField).toBe("_id");

        // No bogus dot-notation lookup leaking through.
        const dotted = pipeline.filter(
            (s) =>
                s.$lookup &&
                typeof s.$lookup.localField === "string" &&
                s.$lookup.localField.includes("."),
        );
        expect(dotted).toEqual([]);

        // Nested pipeline must still resolve the inner stack relation.
        const nested = (appLookup!.$lookup.pipeline as any[]) ?? [];
        const stackLookup = nested.find(
            (s) => s.$lookup && s.$lookup.from === "stacks",
        );
        expect(stackLookup).toBeDefined();
        expect(stackLookup!.$lookup.localField).toBe("stack");
    });

    it("should use custom foreignField in $lookup", () => {
        const schema = dbSchema({
            name: z.string(),
            category: relation(z.string(), { collection: "categories", foreignField: "slug" }),
        });

        const pipeline = getPipeline(schema);
        const lookupStage = pipeline.find((s) => s.$lookup);
        expect(lookupStage!.$lookup.foreignField).toBe("slug");
    });

    it("should default localField to the field path (forward relation)", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }),
        });

        const pipeline = getPipeline(userSchema);
        const lookupStage = pipeline.find((s) => s.$lookup);
        expect(lookupStage!.$lookup.localField).toBe("company");
    });

    it("should use custom localField in $lookup (reverse relation)", () => {
        const backupPolicySchema = dbSchema({
            app: z.string(),
            schedule: z.string(),
        });

        const appSchema = dbSchema({
            quadletName: z.string(),
            policy: relation(backupPolicySchema, {
                collection: "backupPolicies",
                localField: "quadletName",
                foreignField: "app",
            }),
        });

        const pipeline = getPipeline(appSchema);
        const lookupStage = pipeline.find(
            (s) => s.$lookup && s.$lookup.from === "backupPolicies",
        );
        expect(lookupStage).toBeDefined();
        expect(lookupStage!.$lookup.localField).toBe("quadletName");
        expect(lookupStage!.$lookup.foreignField).toBe("app");
        expect(lookupStage!.$lookup.as).toBe("policy");
    });

    it("should still generate $set for reverse single relation", () => {
        const backupPolicySchema = dbSchema({ app: z.string() });
        const appSchema = dbSchema({
            quadletName: z.string(),
            policy: relation(backupPolicySchema, {
                collection: "backupPolicies",
                localField: "quadletName",
                foreignField: "app",
            }),
        });

        const pipeline = getPipeline(appSchema);
        const setStage = pipeline.find((s) => s.$set?.policy);
        expect(setStage).toBeDefined();
        expect(setStage!.$set.policy).toEqual({ $arrayElemAt: ["$policy", 0] });
    });

    it("should handle embedded objects recursively", () => {
        const schema = dbSchema({
            name: z.string(),
            address: embeddedSchema({
                street: z.string(),
                city: z.string(),
            }),
        });

        const pipeline = getPipeline(schema);
        const projectStage = pipeline.find((s) => s.$project);
        expect(projectStage!.$project["address.street"]).toBe(1);
        expect(projectStage!.$project["address.city"]).toBe(1);
    });
});

// ============================================
// toSave
// ============================================

describe("toSave", () => {
    it("should parse and return data for simple schema", () => {
        const userSchema = dbSchema({
            name: z.string(),
            age: z.number(),
        });

        const result = toSave(userSchema, { name: "Mauro", age: 30 });
        expect(result.name).toBe("Mauro");
        expect(result.age).toBe(30);
    });

    it("should convert relation to ObjectId", () => {
        const companyId = new ObjectId().toString();
        const companySchema = dbSchema({ name: z.string() });

        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }),
        });

        const result = toSave(userSchema, {
            name: "Mauro",
            company: { id: companyId, name: "Acme", createdAt: null, updatedAt: null },
        });

        expect(result.company).toBeInstanceOf(ObjectId);
        expect(result.company.toString()).toBe(companyId);
    });

    it("should convert array of relations to ObjectIds", () => {
        const id1 = new ObjectId().toString();
        const id2 = new ObjectId().toString();
        const tagSchema = dbSchema({ label: z.string() });

        const userSchema = dbSchema({
            name: z.string(),
            tags: z.array(relation(tagSchema, { collection: "tags" })),
        });

        const result = toSave(userSchema, {
            name: "Mauro",
            tags: [
                { id: id1, label: "A", createdAt: null, updatedAt: null },
                { id: id2, label: "B", createdAt: null, updatedAt: null },
            ],
        });

        expect(result.tags[0]).toBeInstanceOf(ObjectId);
        expect(result.tags[1]).toBeInstanceOf(ObjectId);
    });

    it("should NOT convert snapshot fields to ObjectId", () => {
        const companyId = new ObjectId().toString();
        const companySchema = dbSchema({ name: z.string() });

        const userSchema = dbSchema({
            name: z.string(),
            company: snapshot(relation(companySchema, { collection: "companies" })),
        });

        const result = toSave(userSchema, {
            name: "Mauro",
            company: { id: companyId, name: "Acme", createdAt: null, updatedAt: null },
        });

        // Snapshot should keep the full object, not convert to ObjectId
        expect(result.company).not.toBeInstanceOf(ObjectId);
        expect(result.company.name).toBe("Acme");
    });

    it("should handle null values", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }).nullable().default(null),
        });

        const result = toSave(userSchema, { name: "Mauro", company: null });
        expect(result.company).toBeNull();
    });

    it("should use schema's toSave method if available", () => {
        const userSchema = dbSchema({
            name: z.string(),
        });

        const data = { name: "Test" };
        const directResult = userSchema.toSave(data);
        const fnResult = toSave(userSchema, data);

        expect(directResult.name).toBe(fnResult.name);
    });

    it("should work with transformed schema", () => {
        const companySchema = dbSchema({ name: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }),
        }).transform((data) => ({
            ...data,
            slug: data.name.toLowerCase(),
        }));

        const companyId = new ObjectId().toString();
        const result = toSave(userSchema, {
            name: "Mauro",
            company: { id: companyId, name: "Acme", createdAt: null, updatedAt: null },
        });

        expect(result.company).toBeInstanceOf(ObjectId);
        expect(result.slug).toBe("mauro");
    });

    it("should handle nested embedded objects", () => {
        const addressSchema = embeddedSchema({
            street: z.string(),
            city: z.string(),
        });

        const userSchema = dbSchema({
            name: z.string(),
            address: addressSchema,
        });

        const result = toSave(userSchema, {
            name: "Mauro",
            address: { street: "Main St", city: "NYC" },
        });

        expect(result.address.street).toBe("Main St");
        expect(result.address.city).toBe("NYC");
    });

    it("should handle empty arrays", () => {
        const tagSchema = dbSchema({ label: z.string() });
        const userSchema = dbSchema({
            name: z.string(),
            tags: z.array(relation(tagSchema, { collection: "tags" })).default([]),
        });

        const result = toSave(userSchema, { name: "Mauro" });
        expect(result.tags).toEqual([]);
    });

    it("should omit reverse relation fields (single)", () => {
        const backupPolicySchema = dbSchema({ app: z.string(), schedule: z.string() });

        const appSchema = dbSchema({
            quadletName: z.string(),
            policy: relation(backupPolicySchema, {
                collection: "backupPolicies",
                localField: "quadletName",
                foreignField: "app",
            }).nullable().optional(),
        });

        const result = toSave(appSchema, {
            quadletName: "my-stack-db",
            policy: null,
        });

        expect(result.quadletName).toBe("my-stack-db");
        expect("policy" in result).toBe(false);
    });

    it("should omit reverse relation fields (array)", () => {
        const backupPolicySchema = dbSchema({ app: z.string() });

        const appSchema = dbSchema({
            quadletName: z.string(),
            policies: z.array(
                relation(backupPolicySchema, {
                    collection: "backupPolicies",
                    localField: "quadletName",
                    foreignField: "app",
                }),
            ).default([]),
        });

        const result = toSave(appSchema, {
            quadletName: "my-stack-db",
            policies: [],
        });

        expect(result.quadletName).toBe("my-stack-db");
        expect("policies" in result).toBe(false);
    });

    it("should still convert forward relation fields to ObjectId (no localField)", () => {
        const companyId = new ObjectId().toString();
        const companySchema = dbSchema({ name: z.string() });

        const userSchema = dbSchema({
            name: z.string(),
            company: relation(companySchema, { collection: "companies" }),
        });

        const result = toSave(userSchema, {
            name: "Mauro",
            company: { id: companyId, name: "Acme", createdAt: null, updatedAt: null },
        });

        expect(result.company).toBeInstanceOf(ObjectId);
    });
});
