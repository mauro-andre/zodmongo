import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { dbSchema, embeddedSchema, relation, getPipeline } from "../src/odm.js";

/**
 * Helper to mutate a dbSchema/embeddedSchema's object shape at runtime so we
 * can wire up circular references after both schemas exist.
 */
const addField = (schema: any, key: string, fieldSchema: z.ZodTypeAny): void => {
    const def = schema._zod?.def ?? schema._def;
    if (!def || !def.shape) {
        throw new Error("Cannot mutate shape — schema has no shape def");
    }
    def.shape[key] = fieldSchema;
};

/** Collects every $lookup stage in a (possibly nested) pipeline, recursively. */
const collectLookups = (pipeline: any[]): any[] => {
    const lookups: any[] = [];
    for (const stage of pipeline) {
        if (stage.$lookup) {
            lookups.push(stage.$lookup);
            if (stage.$lookup.pipeline) {
                lookups.push(...collectLookups(stage.$lookup.pipeline));
            }
        }
    }
    return lookups;
};

// ============================================
// Baseline: no cycle
// ============================================

describe("cycle detection — baseline (no cycles)", () => {
    it("should not truncate when no cycles exist", () => {
        const tagSchema = dbSchema({ label: z.string() });
        const postSchema = dbSchema({
            title: z.string(),
            tags: z.array(relation(tagSchema, { collection: "tags" })),
        });

        const pipeline = getPipeline(postSchema);
        const lookups = collectLookups(pipeline);

        expect(lookups).toHaveLength(1);
        expect(lookups[0].from).toBe("tags");
    });

    it("should allow multiple sibling relations to the same collection", () => {
        const userSchema = dbSchema({ name: z.string() });
        const postSchema = dbSchema({
            title: z.string(),
            author: relation(userSchema, { collection: "users" }),
            editor: relation(userSchema, { collection: "users" }),
        });

        const pipeline = getPipeline(postSchema);
        const topLevelLookups = pipeline.filter((s) => s.$lookup);

        expect(topLevelLookups).toHaveLength(2);
        expect(topLevelLookups.map((l) => l.$lookup.as).sort()).toEqual([
            "author",
            "editor",
        ]);
    });

    it("should generate nested pipelines deeply when no cycles exist", () => {
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
        const companyLookup = pipeline.find((s) => s.$lookup?.from === "companies");

        expect(companyLookup).toBeDefined();
        expect(companyLookup!.$lookup.pipeline).toBeDefined();
        const nestedTagsLookup = collectLookups(companyLookup!.$lookup.pipeline).find(
            (l) => l.from === "tags",
        );
        expect(nestedTagsLookup).toBeDefined();
    });
});

// ============================================
// Self-reference (A -> A)
// ============================================

describe("cycle detection — self-reference", () => {
    const buildSelfRef = () => {
        const userSchema: any = dbSchema({ name: z.string() });
        addField(
            userSchema,
            "manager",
            relation(userSchema, { collection: "users" }),
        );
        return userSchema;
    };

    it("should not stack overflow on self-reference", () => {
        const userSchema = buildSelfRef();
        expect(() => getPipeline(userSchema)).not.toThrow();
    });

    it("should generate top-level lookup with nested pipeline", () => {
        const userSchema = buildSelfRef();
        const pipeline = getPipeline(userSchema);

        const managerLookup = pipeline.find((s) => s.$lookup?.as === "manager");
        expect(managerLookup).toBeDefined();
        expect(managerLookup!.$lookup.from).toBe("users");
        expect(managerLookup!.$lookup.pipeline).toBeDefined();
    });

    it("should truncate the second-level manager lookup", () => {
        const userSchema = buildSelfRef();
        const pipeline = getPipeline(userSchema);

        const managerLookup = pipeline.find((s) => s.$lookup?.as === "manager");
        const innerManagerLookup = managerLookup!.$lookup.pipeline.find(
            (s: any) => s.$lookup?.as === "manager",
        );

        expect(innerManagerLookup).toBeDefined();
        expect(innerManagerLookup.$lookup.pipeline).toBeUndefined();
    });

    it("should produce exactly 2 lookups total for self-reference", () => {
        const userSchema = buildSelfRef();
        const pipeline = getPipeline(userSchema);
        const lookups = collectLookups(pipeline);

        // Level 1 (expanded) + level 2 (truncated) = 2
        expect(lookups).toHaveLength(2);
    });
});

// ============================================
// Direct cycle A -> B -> A
// ============================================

describe("cycle detection — direct cycle A -> B -> A", () => {
    const buildCyclicSchemas = () => {
        const userSchema: any = dbSchema({ name: z.string() });
        const companySchema: any = dbSchema({ name: z.string() });

        addField(
            userSchema,
            "company",
            relation(companySchema, { collection: "companies" }),
        );
        addField(
            companySchema,
            "owner",
            relation(userSchema, { collection: "users" }),
        );

        return { userSchema, companySchema };
    };

    it("should not cause stack overflow on cyclic schemas", () => {
        const { userSchema } = buildCyclicSchemas();
        expect(() => getPipeline(userSchema)).not.toThrow();
    });

    it("should generate level-1 lookup for company (expanded)", () => {
        const { userSchema } = buildCyclicSchemas();
        const pipeline = getPipeline(userSchema);

        const companyLookup = pipeline.find((s) => s.$lookup?.from === "companies");
        expect(companyLookup).toBeDefined();
        expect(companyLookup!.$lookup.pipeline).toBeDefined();
    });

    it("should generate level-2 owner lookup (expanded, inside company)", () => {
        const { userSchema } = buildCyclicSchemas();
        const pipeline = getPipeline(userSchema);

        const companyLookup = pipeline.find((s) => s.$lookup?.from === "companies");
        const ownerLookup = companyLookup!.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "users",
        );
        expect(ownerLookup).toBeDefined();
        expect(ownerLookup.$lookup.pipeline).toBeDefined();
    });

    it("should truncate level-3 company lookup (inside owner — cycle!)", () => {
        const { userSchema } = buildCyclicSchemas();
        const pipeline = getPipeline(userSchema);

        const companyLookup = pipeline.find((s) => s.$lookup?.from === "companies");
        const ownerLookup = companyLookup!.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "users",
        );
        const innerCompanyLookup = ownerLookup.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "companies",
        );

        expect(innerCompanyLookup).toBeDefined();
        expect(innerCompanyLookup.$lookup.pipeline).toBeUndefined();
    });

    it("should generate exactly 3 lookups total", () => {
        const { userSchema } = buildCyclicSchemas();
        const pipeline = getPipeline(userSchema);
        const lookups = collectLookups(pipeline);

        // L1 companies + L2 users + L3 companies (truncated) = 3
        expect(lookups).toHaveLength(3);
    });
});

// ============================================
// Indirect cycle A -> B -> C -> A
// ============================================

describe("cycle detection — indirect cycle A -> B -> C -> A", () => {
    const buildCyclicSchemas = () => {
        const aSchema: any = dbSchema({ label: z.string() });
        const bSchema: any = dbSchema({ label: z.string() });
        const cSchema: any = dbSchema({ label: z.string() });

        addField(aSchema, "b", relation(bSchema, { collection: "bs" }));
        addField(bSchema, "c", relation(cSchema, { collection: "cs" }));
        addField(cSchema, "a", relation(aSchema, { collection: "as" }));

        return { aSchema, bSchema, cSchema };
    };

    it("should not cause stack overflow on indirect cycle", () => {
        const { aSchema } = buildCyclicSchemas();
        expect(() => getPipeline(aSchema)).not.toThrow();
    });

    it("should expand A -> B -> C -> A chain and truncate at level 4", () => {
        const { aSchema } = buildCyclicSchemas();
        const pipeline = getPipeline(aSchema);

        // L1: A's lookup to B (expanded)
        const bLookup = pipeline.find((s) => s.$lookup?.from === "bs");
        expect(bLookup!.$lookup.pipeline).toBeDefined();

        // L2: B's lookup to C (expanded)
        const cLookup = bLookup!.$lookup.pipeline.find((s: any) => s.$lookup?.from === "cs");
        expect(cLookup.$lookup.pipeline).toBeDefined();

        // L3: C's lookup to A (expanded — not cycle yet from A's perspective when seen from inside C)
        // Wait — actually "as" isn't in visited yet at this point. Let's check.
        const aLookup = cLookup.$lookup.pipeline.find((s: any) => s.$lookup?.from === "as");
        expect(aLookup).toBeDefined();
        // When C's pipeline is built, visited = {bs, cs}. So "as" is NEW — it expands.
        expect(aLookup.$lookup.pipeline).toBeDefined();

        // L4: A's lookup to B (inside A's expansion under C) — now visited = {bs, cs, as}
        // B is already visited — truncated.
        const innerBLookup = aLookup.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "bs",
        );
        expect(innerBLookup).toBeDefined();
        expect(innerBLookup.$lookup.pipeline).toBeUndefined();
    });

    it("should generate exactly 4 lookups total", () => {
        const { aSchema } = buildCyclicSchemas();
        const pipeline = getPipeline(aSchema);
        const lookups = collectLookups(pipeline);

        // L1 bs + L2 cs + L3 as + L4 bs (truncated) = 4
        expect(lookups).toHaveLength(4);
    });
});

// ============================================
// Cycle in array relation
// ============================================

describe("cycle detection — array relations", () => {
    it("should detect cycle when array relation points back", () => {
        const postSchema: any = dbSchema({ title: z.string() });
        const authorSchema: any = dbSchema({ name: z.string() });

        addField(
            authorSchema,
            "posts",
            z.array(relation(postSchema, { collection: "posts" })),
        );
        addField(
            postSchema,
            "author",
            relation(authorSchema, { collection: "authors" }),
        );

        expect(() => getPipeline(authorSchema)).not.toThrow();

        const pipeline = getPipeline(authorSchema);
        const lookups = collectLookups(pipeline);

        // L1 posts + L2 authors + L3 posts (truncated) = 3
        expect(lookups).toHaveLength(3);

        // Find the innermost posts lookup — it should have no nested pipeline
        const postsLookup = pipeline.find((s) => s.$lookup?.from === "posts");
        const innerAuthorLookup = postsLookup!.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "authors",
        );
        const innerInnerPostsLookup = innerAuthorLookup.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "posts",
        );
        expect(innerInnerPostsLookup.$lookup.pipeline).toBeUndefined();
    });
});

// ============================================
// Cycles with embedded objects
// ============================================

describe("cycle detection — through embedded objects", () => {
    it("should detect cycle even when going through an embedded object", () => {
        const userSchema: any = dbSchema({ name: z.string() });
        const companySchema: any = dbSchema({ name: z.string() });

        addField(
            userSchema,
            "meta",
            embeddedSchema({
                company: relation(companySchema, { collection: "companies" }),
            }),
        );
        addField(
            companySchema,
            "owner",
            relation(userSchema, { collection: "users" }),
        );

        expect(() => getPipeline(userSchema)).not.toThrow();

        const pipeline = getPipeline(userSchema);
        const lookups = collectLookups(pipeline);

        // Top level: lookup for meta.company → companies
        // Inside companies: lookup for owner → users (NEW, visited = {companies})
        // Inside users: lookup for meta.company → companies (visited — TRUNCATED)
        expect(lookups.length).toBeGreaterThanOrEqual(3);

        // Locate the innermost companies lookup (third level) and verify truncation
        const companyLookup = pipeline.find((s) => s.$lookup?.from === "companies");
        const ownerLookup = companyLookup!.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "users",
        );
        const innerCompanyLookup = ownerLookup.$lookup.pipeline.find(
            (s: any) => s.$lookup?.from === "companies",
        );
        expect(innerCompanyLookup).toBeDefined();
        expect(innerCompanyLookup.$lookup.pipeline).toBeUndefined();
    });
});

// ============================================
// Cycles with reverse relations and custom fields
// ============================================

describe("cycle detection — with reverse relations", () => {
    it("should detect cycle when both sides use reverse relations", () => {
        const aSchema: any = dbSchema({ aKey: z.string() });
        const bSchema: any = dbSchema({ bKey: z.string() });

        addField(
            aSchema,
            "bRef",
            relation(bSchema, {
                collection: "bs",
                localField: "aKey",
                foreignField: "aLink",
            }),
        );
        addField(
            bSchema,
            "aRef",
            relation(aSchema, {
                collection: "as",
                localField: "bKey",
                foreignField: "bLink",
            }),
        );

        expect(() => getPipeline(aSchema)).not.toThrow();

        const pipeline = getPipeline(aSchema);
        const lookups = collectLookups(pipeline);
        expect(lookups).toHaveLength(3);

        // L1: bs lookup with custom fields preserved
        const outer = pipeline.find((s) => s.$lookup?.from === "bs");
        expect(outer!.$lookup.localField).toBe("aKey");
        expect(outer!.$lookup.foreignField).toBe("aLink");

        // L2: as lookup with custom fields preserved
        const middle = outer!.$lookup.pipeline.find((s: any) => s.$lookup?.from === "as");
        expect(middle.$lookup.localField).toBe("bKey");
        expect(middle.$lookup.foreignField).toBe("bLink");
        expect(middle.$lookup.pipeline).toBeDefined();

        // L3: bs lookup truncated, but custom fields still preserved
        const inner = middle.$lookup.pipeline.find((s: any) => s.$lookup?.from === "bs");
        expect(inner.$lookup.localField).toBe("aKey");
        expect(inner.$lookup.foreignField).toBe("aLink");
        expect(inner.$lookup.pipeline).toBeUndefined();
    });
});

describe("cycle detection — with custom foreignField", () => {
    it("should detect cycle and preserve custom foreignField", () => {
        const aSchema: any = dbSchema({ slug: z.string() });
        const bSchema: any = dbSchema({ slug: z.string() });

        addField(
            aSchema,
            "b",
            relation(bSchema, { collection: "bs", foreignField: "slug" }),
        );
        addField(
            bSchema,
            "a",
            relation(aSchema, { collection: "as", foreignField: "slug" }),
        );

        expect(() => getPipeline(aSchema)).not.toThrow();

        const pipeline = getPipeline(aSchema);
        const outer = pipeline.find((s) => s.$lookup?.from === "bs");
        expect(outer!.$lookup.foreignField).toBe("slug");

        const middle = outer!.$lookup.pipeline.find((s: any) => s.$lookup?.from === "as");
        expect(middle.$lookup.foreignField).toBe("slug");

        const inner = middle.$lookup.pipeline.find((s: any) => s.$lookup?.from === "bs");
        expect(inner.$lookup.foreignField).toBe("slug");
        expect(inner.$lookup.pipeline).toBeUndefined();
    });
});

// ============================================
// Explicit visited set behaviour
// ============================================

describe("cycle detection — explicit visited set", () => {
    it("should respect pre-seeded visited set in getPipeline", () => {
        const tagSchema = dbSchema({ label: z.string() });
        const postSchema = dbSchema({
            title: z.string(),
            tags: z.array(relation(tagSchema, { collection: "tags" })),
        });

        const pipeline = getPipeline(postSchema, new Set(["tags"]));
        const tagsLookup = pipeline.find((s) => s.$lookup?.from === "tags");

        expect(tagsLookup).toBeDefined();
        expect(tagsLookup!.$lookup.pipeline).toBeUndefined();
    });

    it("should isolate sibling visited sets (no cross-contamination)", () => {
        const tagSchema = dbSchema({ label: z.string() });
        const postSchema = dbSchema({
            title: z.string(),
            tags1: z.array(relation(tagSchema, { collection: "tags" })),
            tags2: z.array(relation(tagSchema, { collection: "tags" })),
        });

        const pipeline = getPipeline(postSchema);
        const tags1 = pipeline.find((s) => s.$lookup?.as === "tags1");
        const tags2 = pipeline.find((s) => s.$lookup?.as === "tags2");
        expect(tags1).toBeDefined();
        expect(tags2).toBeDefined();
    });
});
