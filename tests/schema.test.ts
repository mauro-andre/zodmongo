import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { dbModelSchema, idSchema } from "../src/schema.js";
import { z } from "zod/v4";

describe("idSchema", () => {
    it("should accept a valid ObjectId string", () => {
        const id = new ObjectId().toString();
        const result = idSchema.parse(id);
        expect(result).toBe(id);
    });

    it("should reject an invalid ObjectId string", () => {
        expect(() => idSchema.parse("invalid")).toThrow();
    });

    it("should reject empty string", () => {
        expect(() => idSchema.parse("")).toThrow();
    });

    it("should reject number", () => {
        expect(() => idSchema.parse(123 as any)).toThrow();
    });

    it("should accept multiple different valid ObjectIds", () => {
        const ids = Array.from({ length: 10 }, () => new ObjectId().toString());
        for (const id of ids) {
            expect(idSchema.parse(id)).toBe(id);
        }
    });
});

describe("dbModelSchema", () => {
    it("should default all fields to null", () => {
        const result = dbModelSchema.parse({});
        expect(result.id).toBeNull();
        expect(result.createdAt).toBeNull();
        expect(result.updatedAt).toBeNull();
    });

    it("should accept id as a valid ObjectId string", () => {
        const id = new ObjectId().toString();
        const result = dbModelSchema.parse({ id });
        expect(result.id).toBe(id);
    });

    it("should accept id as null", () => {
        const result = dbModelSchema.parse({ id: null });
        expect(result.id).toBeNull();
    });

    it("should reject invalid id", () => {
        expect(() => dbModelSchema.parse({ id: "abc" })).toThrow();
    });

    it("should coerce date string into Date for createdAt", () => {
        const result = dbModelSchema.parse({ createdAt: "2024-01-01" });
        expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("should coerce date string into Date for updatedAt", () => {
        const result = dbModelSchema.parse({ updatedAt: "2024-06-15T10:30:00Z" });
        expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("should accept Date objects directly", () => {
        const now = new Date();
        const result = dbModelSchema.parse({ createdAt: now, updatedAt: now });
        expect(result.createdAt).toEqual(now);
        expect(result.updatedAt).toEqual(now);
    });

    it("should include all fields even when omitted from input", () => {
        const result = dbModelSchema.parse({});
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("createdAt");
        expect(result).toHaveProperty("updatedAt");
    });

    it("should be extensible with .extend()", () => {
        const userSchema = dbModelSchema.extend({
            name: z.string(),
            email: z.string().email(),
        });

        const id = new ObjectId().toString();
        const result = userSchema.parse({
            id,
            name: "Mauro",
            email: "m@b.com",
        });

        expect(result.id).toBe(id);
        expect(result.name).toBe("Mauro");
        expect(result.email).toBe("m@b.com");
        expect(result.createdAt).toBeNull();
        expect(result.updatedAt).toBeNull();
    });

    it("should reject when required extended field is missing", () => {
        const userSchema = dbModelSchema.extend({
            name: z.string(),
        });

        expect(() => userSchema.parse({})).toThrow();
    });
});
