import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { z } from "zod/v4";
import { connect, close, getDb, save, findMany, deleteMany } from "../src/engine.js";
import { dbModelSchema } from "../src/schema.js";

const MONGO_URI = "mongodb://localhost:27017";
const DB_NAME = "zodmongo_test_engine";

const userSchema = dbModelSchema.extend({
    name: z.string(),
    email: z.string().email(),
    age: z.number().optional().default(0),
});
type User = z.infer<typeof userSchema>;

beforeAll(async () => {
    await connect(MONGO_URI, DB_NAME);
});

afterAll(async () => {
    const db = getDb();
    await db.dropDatabase();
    await close();
});

beforeEach(async () => {
    const db = getDb();
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
        await db.dropCollection(col.name);
    }
});

// ============================================
// connect / getDb / close
// ============================================

describe("connect", () => {
    it("should return the same instance if already connected", async () => {
        const db1 = getDb();
        const db2 = await connect(MONGO_URI, DB_NAME);
        expect(db1).toBe(db2);
    });
});

describe("getDb", () => {
    it("should return the Db instance", () => {
        const db = getDb();
        expect(db).toBeDefined();
        expect(db.databaseName).toBe(DB_NAME);
    });
});

// ============================================
// save
// ============================================

describe("save", () => {
    it("should insert a new document (no id)", async () => {
        const user = userSchema.parse({
            name: "Mauro",
            email: "m@b.com",
            age: 30,
        });

        const result = await save("users", user);
        expect(result.upsertedId).toBeDefined();
        expect(user.id).toBeDefined();
        expect(typeof user.id).toBe("string");
        expect(ObjectId.isValid(user.id!)).toBe(true);
    });

    it("should set createdAt on insert", async () => {
        const user = userSchema.parse({ name: "Test", email: "t@b.com" });
        await save("users", user);

        const db = getDb();
        const raw = await db.collection("users").findOne({ _id: new ObjectId(user.id!) });
        expect(raw?.createdAt).toBeInstanceOf(Date);
    });

    it("should update an existing document (with id)", async () => {
        const user = userSchema.parse({ name: "Original", email: "o@b.com" });
        await save("users", user);
        const originalId = user.id;

        user.name = "Updated";
        await save("users", user);

        const docs = await findMany<User>("users", { id: originalId });
        expect(docs).toHaveLength(1);
        expect(docs[0].name).toBe("Updated");
    });

    it("should set updatedAt on update", async () => {
        const user = userSchema.parse({ name: "TimeTest", email: "tt@b.com" });
        await save("users", user);

        await new Promise((r) => setTimeout(r, 50));

        user.name = "TimeTestUpdated";
        await save("users", user);

        const db = getDb();
        const raw = await db.collection("users").findOne({ _id: new ObjectId(user.id!) });
        expect(raw?.updatedAt).toBeInstanceOf(Date);
        expect(raw?.createdAt).toBeInstanceOf(Date);
        expect(raw!.updatedAt!.getTime()).toBeGreaterThan(raw!.createdAt!.getTime());
    });

    it("should keep createdAt unchanged on update", async () => {
        const user = userSchema.parse({ name: "Keep", email: "k@b.com" });
        await save("users", user);

        const db = getDb();
        const firstRaw = await db.collection("users").findOne({ _id: new ObjectId(user.id!) });
        const firstCreatedAt = firstRaw?.createdAt;

        await new Promise((r) => setTimeout(r, 50));
        user.name = "KeepUpdated";
        await save("users", user);

        const secondRaw = await db.collection("users").findOne({ _id: new ObjectId(user.id!) });
        expect(secondRaw?.createdAt.getTime()).toBe(firstCreatedAt.getTime());
    });

    it("should upsert with custom filter", async () => {
        const user = userSchema.parse({ name: "Upsert", email: "u@b.com" });
        await save("users", user, { email: "u@b.com" });

        const docs = await findMany<User>("users", { email: "u@b.com" });
        expect(docs).toHaveLength(1);
        expect(docs[0].name).toBe("Upsert");

        // Upsert again with same filter — should update, not insert
        const user2 = userSchema.parse({ name: "UpsertUpdated", email: "u@b.com" });
        await save("users", user2, { email: "u@b.com" });

        const docs2 = await findMany<User>("users", { email: "u@b.com" });
        expect(docs2).toHaveLength(1);
        expect(docs2[0].name).toBe("UpsertUpdated");
    });

    it("should convert id to _id in filter", async () => {
        const user = userSchema.parse({ name: "FilterId", email: "fi@b.com" });
        await save("users", user);

        user.name = "FilterIdUpdated";
        await save("users", user, { id: user.id });

        const docs = await findMany<User>("users", { id: user.id });
        expect(docs).toHaveLength(1);
        expect(docs[0].name).toBe("FilterIdUpdated");
    });

    it("should convert _id string to ObjectId in filter", async () => {
        const user = userSchema.parse({ name: "StrFilter", email: "sf@b.com" });
        await save("users", user);

        user.name = "StrFilterUpdated";
        await save("users", user, { _id: user.id });

        const docs = await findMany<User>("users", { id: user.id });
        expect(docs).toHaveLength(1);
        expect(docs[0].name).toBe("StrFilterUpdated");
    });

    it("should convert ObjectId strings in nested fields on save", async () => {
        const refId = new ObjectId().toString();
        const schema = dbModelSchema.extend({
            name: z.string(),
            companyId: z.string(),
        });

        const doc = schema.parse({ name: "Nested", companyId: refId });
        await save("docs", doc);

        const db = getDb();
        const raw = await db.collection("docs").findOne({ _id: new ObjectId(doc.id!) });
        expect(raw?.companyId).toBeInstanceOf(ObjectId);
    });

    it("should not insert when upsert is false and doc does not exist", async () => {
        const user = userSchema.parse({ name: "NoUpsert", email: "nu@b.com" });
        await save("users", user, { email: "nu@b.com" }, { upsert: false });

        const docs = await findMany<User>("users", { email: "nu@b.com" });
        expect(docs).toHaveLength(0);
    });

    it("should handle saving multiple documents sequentially", async () => {
        for (let i = 0; i < 10; i++) {
            const user = userSchema.parse({ name: `Bulk${i}`, email: `bulk${i}@b.com` });
            await save("users", user);
            expect(user.id).toBeDefined();
        }

        const docs = await findMany<User>("users");
        expect(docs).toHaveLength(10);
    });
});

// ============================================
// findMany
// ============================================

describe("findMany", () => {
    beforeEach(async () => {
        for (let i = 1; i <= 5; i++) {
            const user = userSchema.parse({
                name: `User${i}`,
                email: `user${i}@b.com`,
                age: 20 + i,
            });
            await save("users", user);
        }
    });

    it("should fetch all documents without filter", async () => {
        const docs = await findMany<User>("users");
        expect(docs).toHaveLength(5);
    });

    it("should fetch with simple match", async () => {
        const docs = await findMany<User>("users", { name: "User1" });
        expect(docs).toHaveLength(1);
        expect(docs[0].name).toBe("User1");
    });

    it("should return id as string (not _id)", async () => {
        const docs = await findMany<User>("users", { name: "User1" });
        expect(docs[0].id).toBeDefined();
        expect(typeof docs[0].id).toBe("string");
        expect((docs[0] as any)._id).toBeUndefined();
    });

    it("should fetch by id", async () => {
        const allDocs = await findMany<User>("users");
        const firstId = allDocs[0].id;

        const docs = await findMany<User>("users", { id: firstId });
        expect(docs).toHaveLength(1);
        expect(docs[0].id).toBe(firstId);
    });

    it("should fetch with custom pipeline", async () => {
        const docs = await findMany<User>("users", [
            { $match: { age: { $gte: 23 } } },
            { $sort: { age: 1 } },
        ]);
        expect(docs).toHaveLength(3);
        expect(docs[0].name).toBe("User3");
    });

    it("should fetch with $limit in pipeline", async () => {
        const docs = await findMany<User>("users", [
            { $sort: { name: 1 } },
            { $limit: 2 },
        ]);
        expect(docs).toHaveLength(2);
    });

    it("should fetch with $project in pipeline", async () => {
        const docs = await findMany<any>("users", [
            { $match: { name: "User1" } },
            { $project: { name: 1 } },
        ]);
        expect(docs).toHaveLength(1);
        expect(docs[0].name).toBe("User1");
        expect(docs[0].email).toBeUndefined();
    });

    it("should return empty array when nothing found", async () => {
        const docs = await findMany<User>("users", { name: "NonExistent" });
        expect(docs).toEqual([]);
    });

    it("should convert id in $match within pipeline", async () => {
        const allDocs = await findMany<User>("users");
        const firstId = allDocs[0].id;

        const docs = await findMany<User>("users", [
            { $match: { id: firstId } },
        ]);
        expect(docs).toHaveLength(1);
        expect(docs[0].id).toBe(firstId);
    });

    it("should return empty array for empty collection", async () => {
        const docs = await findMany<any>("empty_collection");
        expect(docs).toEqual([]);
    });

    it("should fetch with $group in pipeline", async () => {
        const docs = await findMany<any>("users", [
            { $group: { _id: null, totalAge: { $sum: "$age" } } },
        ]);
        expect(docs).toHaveLength(1);
        expect(docs[0].totalAge).toBe(21 + 22 + 23 + 24 + 25);
    });

    it("should fetch with multiple $match stages", async () => {
        const docs = await findMany<User>("users", [
            { $match: { age: { $gte: 22 } } },
            { $match: { age: { $lte: 24 } } },
        ]);
        expect(docs).toHaveLength(3);
    });
});

// ============================================
// findMany with pagination
// ============================================

describe("findMany with pagination", () => {
    beforeEach(async () => {
        for (let i = 1; i <= 25; i++) {
            const user = userSchema.parse({
                name: `PagUser${i.toString().padStart(2, "0")}`,
                email: `pag${i}@b.com`,
                age: 20 + i,
            });
            await save("users", user);
        }
    });

    it("should return first page with docs and metadata", async () => {
        const result = await findMany<User>("users", {}, {
            paginate: true,
            currentPage: 1,
            docsPerPage: 10,
        });
        expect(result.docs).toHaveLength(10);
        expect(result.currentPage).toBe(1);
        expect(result.docsQuantity).toBe(25);
        expect(result.pageQuantity).toBe(3);
    });

    it("should return second page", async () => {
        const result = await findMany<User>("users", {}, {
            paginate: true,
            currentPage: 2,
            docsPerPage: 10,
        });
        expect(result.docs).toHaveLength(10);
        expect(result.currentPage).toBe(2);
    });

    it("should return last page with remaining docs", async () => {
        const result = await findMany<User>("users", {}, {
            paginate: true,
            currentPage: 3,
            docsPerPage: 10,
        });
        expect(result.docs).toHaveLength(5);
        expect(result.currentPage).toBe(3);
    });

    it("should return empty page if currentPage exceeds total", async () => {
        const result = await findMany<User>("users", {}, {
            paginate: true,
            currentPage: 99,
            docsPerPage: 10,
        });
        expect(result.docs).toHaveLength(0);
        expect(result.docsQuantity).toBe(25);
    });

    it("should use defaults (page 1, 100 per page) when not provided", async () => {
        const result = await findMany<User>("users", {}, {
            paginate: true,
        });
        expect(result.docs).toHaveLength(25);
        expect(result.currentPage).toBe(1);
        expect(result.pageQuantity).toBe(1);
    });

    it("should paginate with match filter", async () => {
        const result = await findMany<User>(
            "users",
            { age: { $gte: 40 } },
            { paginate: true, currentPage: 1, docsPerPage: 5 },
        );
        expect(result.docsQuantity).toBe(6); // ages 40-45
        expect(result.docs).toHaveLength(5);
        expect(result.pageQuantity).toBe(2);
    });

    it("should paginate with pipeline", async () => {
        const result = await findMany<User>(
            "users",
            [{ $match: { age: { $lte: 30 } } }, { $sort: { age: 1 } }],
            { paginate: true, currentPage: 1, docsPerPage: 3 },
        );
        expect(result.docsQuantity).toBe(10); // ages 21-30
        expect(result.docs).toHaveLength(3);
    });

    it("should treat currentPage 0 or negative as 1", async () => {
        const result = await findMany<User>("users", {}, {
            paginate: true,
            currentPage: 0,
            docsPerPage: 10,
        });
        expect(result.currentPage).toBe(1);
        expect(result.docs).toHaveLength(10);

        const result2 = await findMany<User>("users", {}, {
            paginate: true,
            currentPage: -1,
            docsPerPage: 10,
        });
        expect(result2.currentPage).toBe(1);
    });

    it("should convert _id to id in paginated docs", async () => {
        const result = await findMany<User>("users", {}, {
            paginate: true,
            currentPage: 1,
            docsPerPage: 5,
        });
        for (const doc of result.docs) {
            expect(doc.id).toBeDefined();
            expect(typeof doc.id).toBe("string");
            expect((doc as any)._id).toBeUndefined();
        }
    });
});

// ============================================
// deleteMany
// ============================================

describe("deleteMany", () => {
    beforeEach(async () => {
        for (let i = 1; i <= 5; i++) {
            const user = userSchema.parse({
                name: `Del${i}`,
                email: `del${i}@b.com`,
                age: 20 + i,
            });
            await save("users", user);
        }
    });

    it("should delete by simple filter", async () => {
        const result = await deleteMany("users", { name: "Del1" });
        expect(result.deletedCount).toBe(1);

        const remaining = await findMany<User>("users");
        expect(remaining).toHaveLength(4);
    });

    it("should delete multiple documents", async () => {
        const result = await deleteMany("users", { age: { $gte: 24 } });
        expect(result.deletedCount).toBe(2);

        const remaining = await findMany<User>("users");
        expect(remaining).toHaveLength(3);
    });

    it("should delete by id", async () => {
        const docs = await findMany<User>("users", { name: "Del1" });
        const result = await deleteMany("users", { id: docs[0].id });
        expect(result.deletedCount).toBe(1);
    });

    it("should return deletedCount 0 when nothing found", async () => {
        const result = await deleteMany("users", { name: "NonExistent" });
        expect(result.deletedCount).toBe(0);
    });

    it("should delete all with empty filter", async () => {
        const result = await deleteMany("users", {});
        expect(result.deletedCount).toBe(5);

        const remaining = await findMany<User>("users");
        expect(remaining).toHaveLength(0);
    });

    it("should convert dot-notation id in filter", async () => {
        const refId = new ObjectId();
        const db = getDb();
        await db.collection("nested").insertOne({
            name: "test",
            company: { _id: refId },
        });

        const result = await deleteMany("nested", { "company.id": refId.toString() });
        expect(result.deletedCount).toBe(1);
    });
});
