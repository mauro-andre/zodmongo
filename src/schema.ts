import { z } from "zod/v4";
import { ObjectId } from "mongodb";

export const idSchema = z.string().refine((val) => ObjectId.isValid(val), {
    message: "Invalid ObjectId format",
});

export const dbModelSchema = z.object({
    id: idSchema.nullable().optional().default(null),
    createdAt: z.coerce.date().nullable().optional().default(null),
    updatedAt: z.coerce.date().nullable().optional().default(null),
});

export type DbModel = z.infer<typeof dbModelSchema>;
export type Id = z.infer<typeof idSchema>;
