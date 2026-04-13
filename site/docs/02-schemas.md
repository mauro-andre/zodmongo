# Schemas

ZodMongo uses Zod schemas to define your models. Every document has three automatic fields: `id`, `createdAt`, and `updatedAt`.

## dbSchema

The primary way to define a model. Extends the base model with your custom fields.

```typescript
import { dbSchema } from "@mauroandre/zodmongo";
import { z } from "zod/v4";

const postSchema = dbSchema({
    title: z.string(),
    body: z.string(),
    published: z.boolean().default(false),
});

type Post = z.infer<typeof postSchema>;
// { id: string | null, createdAt: Date | null, updatedAt: Date | null, title: string, body: string, published: boolean }
```

The `id` field is `null` for new documents. After saving, ZodMongo assigns the generated ObjectId string automatically.

## embeddedSchema

For nested objects that don't need their own `id`, `createdAt`, or `updatedAt`.

```typescript
import { embeddedSchema } from "@mauroandre/zodmongo";
import { z } from "zod/v4";

const addressSchema = embeddedSchema({
    street: z.string(),
    city: z.string(),
    zip: z.string(),
});

const userSchema = dbSchema({
    name: z.string(),
    address: addressSchema,
});
```

## idSchema

A Zod string schema that validates the value is a valid MongoDB ObjectId.

```typescript
import { idSchema } from "@mauroandre/zodmongo/schema";

idSchema.parse("507f1f77bcf86cd799439011"); // ok
idSchema.parse("invalid"); // throws ZodError
```

## dbModelSchema

The base schema used internally by `dbSchema`. You can extend it manually if needed.

```typescript
import { dbModelSchema } from "@mauroandre/zodmongo/schema";
import { z } from "zod/v4";

const customSchema = dbModelSchema.extend({
    name: z.string(),
});
```

## Type inference

Use `z.infer` to extract TypeScript types from your schemas:

```typescript
type User = z.infer<typeof userSchema>;
type Address = z.infer<typeof addressSchema>;
```

These types are fully inferred — no need to maintain separate interfaces.
