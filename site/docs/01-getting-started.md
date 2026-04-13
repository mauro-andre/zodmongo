# Getting Started

ZodMongo is a lightweight MongoDB ODM powered by Zod schemas. It's built on the native MongoDB driver — no Mongoose, no overhead.

## Install

```bash
npm install zodmongo
```

ZodMongo has two peer dependencies: `mongodb` and `zod`. Both are included as regular dependencies, so they're installed automatically.

## Connect to MongoDB

```typescript
import { connect, close } from "zodmongo";

await connect("mongodb://localhost:27017", "mydb");

// ... use the database

await close();
```

## Define a schema

Use `dbSchema` to create a model. It automatically includes `id`, `createdAt`, and `updatedAt`.

```typescript
import { dbSchema } from "zodmongo";
import { z } from "zod/v4";

const userSchema = dbSchema({
    name: z.string(),
    email: z.string().email(),
    age: z.number().optional().default(0),
});

type User = z.infer<typeof userSchema>;
```

## Basic CRUD

```typescript
import { save, findMany, deleteMany } from "zodmongo";

// Insert
const user = userSchema.parse({ name: "Mauro", email: "mauro@example.com" });
await save("users", user);
console.log(user.id); // auto-assigned ObjectId string

// Update
user.name = "Mauro André";
await save("users", user);

// Find all
const users = await findMany<User>("users");

// Find with filter
const found = await findMany<User>("users", { email: "mauro@example.com" });

// Delete
await deleteMany("users", { email: "mauro@example.com" });
```

## What's next

- [Schemas](/docs/schemas) — learn about `dbSchema`, `embeddedSchema`, and the base types
- [Queries](/docs/queries) — `findMany` with match filters and aggregation pipelines
- [Pagination](/docs/pagination) — built-in paginated queries
- [Relations](/docs/relations) — declare references between collections
