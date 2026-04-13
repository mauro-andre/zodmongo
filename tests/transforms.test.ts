import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
    transformDoc,
    transformDocForSave,
    transformMatchQuery,
} from "../src/transforms.js";

// ============================================
// transformDoc: MongoDB → App (_id → id, ObjectId → string)
// ============================================

describe("transformDoc", () => {
    it("should convert _id ObjectId to id string", () => {
        const oid = new ObjectId();
        const doc = { _id: oid, name: "Test" };
        const result = transformDoc<any>(doc);
        expect(result.id).toBe(oid.toString());
        expect(result._id).toBeUndefined();
        expect(result.name).toBe("Test");
    });

    it("should convert _id string to id", () => {
        const doc = { _id: "abc123", name: "Test" };
        const result = transformDoc<any>(doc);
        expect(result.id).toBe("abc123");
        expect(result._id).toBeUndefined();
    });

    it("should convert nested ObjectId properties to string", () => {
        const oid = new ObjectId();
        const doc = { _id: new ObjectId(), nested: { ref: oid } };
        const result = transformDoc<any>(doc);
        expect(result.nested.ref).toBe(oid.toString());
    });

    it("should convert ObjectIds inside arrays to string", () => {
        const oid1 = new ObjectId();
        const oid2 = new ObjectId();
        const doc = { _id: new ObjectId(), tags: [oid1, oid2] };
        const result = transformDoc<any>(doc);
        expect(result.tags).toEqual([oid1.toString(), oid2.toString()]);
    });

    it("should convert _id inside objects within arrays", () => {
        const oid = new ObjectId();
        const doc = {
            _id: new ObjectId(),
            items: [{ _id: oid, name: "item1" }],
        };
        const result = transformDoc<any>(doc);
        expect(result.items[0].id).toBe(oid.toString());
        expect(result.items[0]._id).toBeUndefined();
    });

    it("should handle empty document", () => {
        const result = transformDoc<any>({});
        expect(result).toEqual({});
    });

    it("should handle null", () => {
        const result = transformDoc<any>(null);
        expect(result).toBeNull();
    });

    it("should handle undefined", () => {
        const result = transformDoc<any>(undefined);
        expect(result).toBeUndefined();
    });

    it("should convert standalone ObjectId to string", () => {
        const oid = new ObjectId();
        const result = transformDoc<string>(oid);
        expect(result).toBe(oid.toString());
    });

    it("should preserve non-ObjectId fields", () => {
        const doc = {
            _id: new ObjectId(),
            name: "Test",
            age: 30,
            active: true,
            tags: ["a", "b"],
            nested: { key: "value" },
        };
        const result = transformDoc<any>(doc);
        expect(result.name).toBe("Test");
        expect(result.age).toBe(30);
        expect(result.active).toBe(true);
        expect(result.tags).toEqual(["a", "b"]);
        expect(result.nested.key).toBe("value");
    });

    it("should handle deeply nested objects", () => {
        const oid = new ObjectId();
        const doc = {
            _id: new ObjectId(),
            level1: {
                level2: {
                    level3: {
                        ref: oid,
                    },
                },
            },
        };
        const result = transformDoc<any>(doc);
        expect(result.level1.level2.level3.ref).toBe(oid.toString());
    });

    it("should preserve Date objects", () => {
        const now = new Date();
        const doc = { _id: new ObjectId(), createdAt: now };
        const result = transformDoc<any>(doc);
        expect(result.createdAt).toEqual(now);
    });

    it("should handle empty array", () => {
        const result = transformDoc<any[]>([]);
        expect(result).toEqual([]);
    });

    it("should convert array of documents", () => {
        const docs = [
            { _id: new ObjectId(), name: "A" },
            { _id: new ObjectId(), name: "B" },
        ];
        const result = transformDoc<any[]>(docs);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBeDefined();
        expect(result[0]._id).toBeUndefined();
        expect(result[1].id).toBeDefined();
    });
});

// ============================================
// transformDocForSave: App → MongoDB (id → _id, string → ObjectId)
// ============================================

describe("transformDocForSave", () => {
    it("should convert id string to _id ObjectId", () => {
        const id = new ObjectId().toString();
        const doc = { id, name: "Test" };
        const result = transformDocForSave(doc);
        expect(result._id).toBeInstanceOf(ObjectId);
        expect(result._id.toString()).toBe(id);
        expect(result.id).toBeUndefined();
    });

    it("should convert valid ObjectId strings automatically", () => {
        const oid = new ObjectId();
        const result = transformDocForSave(oid.toString());
        expect(result).toBeInstanceOf(ObjectId);
        expect(result.toString()).toBe(oid.toString());
    });

    it("should leave ObjectId as is", () => {
        const oid = new ObjectId();
        const result = transformDocForSave(oid);
        expect(result).toBe(oid);
    });

    it("should convert ObjectId strings in nested properties", () => {
        const refId = new ObjectId().toString();
        const doc = { name: "Test", ref: refId };
        const result = transformDocForSave(doc);
        expect(result.ref).toBeInstanceOf(ObjectId);
        expect(result.ref.toString()).toBe(refId);
    });

    it("should convert ObjectId strings in arrays", () => {
        const id1 = new ObjectId().toString();
        const id2 = new ObjectId().toString();
        const doc = { tags: [id1, id2] };
        const result = transformDocForSave(doc);
        expect(result.tags[0]).toBeInstanceOf(ObjectId);
        expect(result.tags[1]).toBeInstanceOf(ObjectId);
    });

    it("should convert id inside objects within arrays", () => {
        const id = new ObjectId().toString();
        const doc = { items: [{ id, name: "item" }] };
        const result = transformDocForSave(doc);
        expect(result.items[0]._id).toBeInstanceOf(ObjectId);
        expect(result.items[0].id).toBeUndefined();
    });

    it("should preserve regular strings (not ObjectId)", () => {
        const doc = { name: "Mauro", email: "m@b.com" };
        const result = transformDocForSave(doc);
        expect(result.name).toBe("Mauro");
        expect(result.email).toBe("m@b.com");
    });

    it("should preserve null and undefined", () => {
        expect(transformDocForSave(null)).toBeNull();
        expect(transformDocForSave(undefined)).toBeUndefined();
    });

    it("should preserve numbers and booleans", () => {
        const doc = { age: 30, active: true };
        const result = transformDocForSave(doc);
        expect(result.age).toBe(30);
        expect(result.active).toBe(true);
    });

    it("should handle deeply nested objects", () => {
        const refId = new ObjectId().toString();
        const doc = {
            level1: {
                level2: {
                    ref: refId,
                },
            },
        };
        const result = transformDocForSave(doc);
        expect(result.level1.level2.ref).toBeInstanceOf(ObjectId);
    });

    it("should not convert short non-ObjectId strings", () => {
        const doc = { code: "abc" };
        const result = transformDocForSave(doc);
        expect(result.code).toBe("abc");
    });

    it("should handle empty array", () => {
        const doc = { items: [] };
        const result = transformDocForSave(doc);
        expect(result.items).toEqual([]);
    });
});

// ============================================
// transformMatchQuery: Search queries
// ============================================

describe("transformMatchQuery", () => {
    it("should convert id to _id", () => {
        const id = new ObjectId().toString();
        const query = { id };
        const result = transformMatchQuery(query);
        expect(result._id).toBeInstanceOf(ObjectId);
        expect(result._id.toString()).toBe(id);
        expect(result.id).toBeUndefined();
    });

    it("should convert ObjectId string value to ObjectId", () => {
        const id = new ObjectId().toString();
        const query = { _id: id };
        const result = transformMatchQuery(query);
        expect(result._id).toBeInstanceOf(ObjectId);
    });

    it("should convert dot-notation .id to ._id", () => {
        const id = new ObjectId().toString();
        const query = { "company.id": id };
        const result = transformMatchQuery(query);
        expect(result["company._id"]).toBeInstanceOf(ObjectId);
        expect(result["company.id"]).toBeUndefined();
    });

    it("should convert deep dot-notation .id to ._id", () => {
        const id = new ObjectId().toString();
        const query = { "respondent.company.id": id };
        const result = transformMatchQuery(query);
        expect(result["respondent.company._id"]).toBeInstanceOf(ObjectId);
    });

    it("should preserve non-id fields", () => {
        const query = { name: "Test", age: 30 };
        const result = transformMatchQuery(query);
        expect(result.name).toBe("Test");
        expect(result.age).toBe(30);
    });

    it("should convert ObjectIds inside $in operator", () => {
        const id1 = new ObjectId().toString();
        const id2 = new ObjectId().toString();
        const query = { id: { $in: [id1, id2] } };
        const result = transformMatchQuery(query);
        expect(result._id.$in[0]).toBeInstanceOf(ObjectId);
        expect(result._id.$in[1]).toBeInstanceOf(ObjectId);
    });

    it("should handle $gt, $lt operators", () => {
        const query = { age: { $gt: 18, $lt: 65 } };
        const result = transformMatchQuery(query);
        expect(result.age.$gt).toBe(18);
        expect(result.age.$lt).toBe(65);
    });

    it("should preserve Date in queries", () => {
        const date = new Date();
        const query = { createdAt: { $gte: date } };
        const result = transformMatchQuery(query);
        expect(result.createdAt.$gte).toBe(date);
    });

    it("should preserve existing ObjectId", () => {
        const oid = new ObjectId();
        const query = { _id: oid };
        const result = transformMatchQuery(query);
        expect(result._id).toBe(oid);
    });

    it("should handle null", () => {
        expect(transformMatchQuery(null)).toBeNull();
    });

    it("should handle undefined", () => {
        expect(transformMatchQuery(undefined)).toBeUndefined();
    });

    it("should convert standalone string to ObjectId", () => {
        const id = new ObjectId().toString();
        const result = transformMatchQuery(id);
        expect(result).toBeInstanceOf(ObjectId);
    });

    it("should preserve non-ObjectId string", () => {
        const result = transformMatchQuery("hello");
        expect(result).toBe("hello");
    });

    it("should convert ObjectIds inside $or", () => {
        const id1 = new ObjectId().toString();
        const id2 = new ObjectId().toString();
        const query = { $or: [{ id: id1 }, { id: id2 }] };
        const result = transformMatchQuery(query);
        expect(result.$or[0]._id).toBeInstanceOf(ObjectId);
        expect(result.$or[1]._id).toBeInstanceOf(ObjectId);
    });

    it("should handle empty query", () => {
        const result = transformMatchQuery({});
        expect(result).toEqual({});
    });
});
