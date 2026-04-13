# ZodMongo

Lightweight MongoDB ODM powered by [Zod](https://zod.dev) schemas. TypeScript-first, built on the native MongoDB driver — no Mongoose.

## Why ZodMongo?

- **No Mongoose** — uses the native MongoDB driver, zero overhead
- **Zod-native** — define schemas with Zod, not a proprietary format
- **TypeScript-first** — types inferred directly from your Zod schemas
- **Tiny** — ~300 lines of code, only `mongodb` and `zod` as dependencies
- **Transparent id/ObjectId** — work with `id` (string) in your app, `_id` (ObjectId) in MongoDB
- **Automatic timestamps** — `createdAt` and `updatedAt` managed by the ODM
- **Built-in pagination** — via aggregation pipeline with `$facet`
- **Full aggregation pipeline** — `findMany` accepts a complete pipeline, not just match filters
- **Relations & Snapshots** — declare references to other collections with automatic `$lookup` generation

## Install

```bash
npm install @mauroandre/zodmongo
```

## Quick Start

```typescript
import { connect, close, save, findMany, deleteMany } from "@mauroandre/zodmongo";
import { dbSchema } from "@mauroandre/zodmongo";
import { z } from "zod/v4";

// Connect
await connect("mongodb://localhost:27017", "mydb");

// Define a schema
const userSchema = dbSchema({
    name: z.string(),
    email: z.string().email(),
});
type User = z.infer<typeof userSchema>;

// Insert
const user = userSchema.parse({ name: "Mauro", email: "mauro@example.com" });
await save("users", user);
console.log(user.id); // ObjectId string, auto-assigned

// Update
user.name = "Mauro André";
await save("users", user);

// Find
const users = await findMany<User>("users", { name: "Mauro André" });
const all = await findMany<User>("users");

// Delete
await deleteMany("users", { email: "mauro@example.com" });

// Close
await close();
```

## Schemas

### `dbSchema(shape)`

Creates a schema that extends the base model with `id`, `createdAt`, and `updatedAt`. This is the primary way to define your models.

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

### `embeddedSchema(shape)`

Creates a schema **without** the base model fields (`id`, `createdAt`, `updatedAt`). Use for nested objects that don't need their own identity.

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

### `dbModelSchema` and `idSchema`

Low-level schemas if you need to extend manually:

```typescript
import { dbModelSchema, idSchema } from "@mauroandre/zodmongo/schema";

const customSchema = dbModelSchema.extend({
    name: z.string(),
});

// idSchema validates a string as a valid ObjectId
idSchema.parse("507f1f77bcf86cd799439011"); // ok
idSchema.parse("invalid"); // throws
```

## API

### `connect(uri, dbName)`

Connects to MongoDB. Returns the `Db` instance.

```typescript
const db = await connect("mongodb://localhost:27017", "mydb");
```

### `close()`

Waits for pending promises and closes the connection.

```typescript
await close();
```

### `getDb()`

Returns the current `Db` instance. Throws if not connected.

```typescript
const db = getDb();
const collection = db.collection("users");
```

### `save(collection, doc, filter?, options?)`

Smart upsert — inserts if no `id`, updates if `id` exists. Automatically manages `createdAt` and `updatedAt`.

```typescript
// Insert (no id)
const user = userSchema.parse({ name: "Mauro", email: "m@b.com" });
await save("users", user);
// user.id is now set to the generated ObjectId string

// Update (has id)
user.name = "Updated";
await save("users", user);

// Upsert with custom filter
await save("users", user, { email: "m@b.com" });

// Disable upsert (update only, no insert)
await save("users", user, { email: "m@b.com" }, { upsert: false });
```

### `findMany<T>(collection, matchOrPipeline?, options?)`

Finds documents using a simple match object or a full aggregation pipeline. Automatically converts `_id` to `id` and ObjectIds to strings in the results.

```typescript
// All documents
const all = await findMany<User>("users");

// Simple match
const admins = await findMany<User>("users", { role: "admin" });

// Find by id
const found = await findMany<User>("users", { id: "507f1f77bcf86cd799439011" });

// Full aggregation pipeline
const topAdmins = await findMany<User>("users", [
    { $match: { role: "admin" } },
    { $sort: { createdAt: -1 } },
    { $limit: 10 },
]);
```

#### Pagination

Pass `{ paginate: true }` to get paginated results via `$facet`:

```typescript
const page = await findMany<User>("users", {}, {
    paginate: true,
    currentPage: 1,
    docsPerPage: 20,
});

page.docs;          // User[]
page.currentPage;   // 1
page.pageQuantity;  // total pages
page.docsQuantity;  // total documents
```

### `deleteMany(collection, filter)`

Deletes documents matching the filter. Automatically converts `id` to `_id`.

```typescript
await deleteMany("users", { email: "m@b.com" });
await deleteMany("users", { id: "507f1f77bcf86cd799439011" });
```

## Relations

Declare references between collections. The ODM generates `$lookup` pipelines automatically.

### `relation(schema, config)`

Marks a field as a reference to another collection.

```typescript
const companySchema = dbSchema({ name: z.string() });

const userSchema = dbSchema({
    name: z.string(),
    company: relation(companySchema, { collection: "companies" }),
});

// When fetching, use getPipeline() to auto-generate $lookup stages
const pipeline = getPipeline(userSchema);
const users = await findMany<User>("users", pipeline);
// users[0].company is now the full company document, not just an ObjectId
```

When saving, use `toSave()` to convert relations back to ObjectIds:

```typescript
const dataToSave = toSave(userSchema, userData);
// dataToSave.company is now an ObjectId
await save("users", dataToSave);
```

#### Array relations

```typescript
const tagSchema = dbSchema({ label: z.string() });

const postSchema = dbSchema({
    title: z.string(),
    tags: z.array(relation(tagSchema, { collection: "tags" })),
});
```

#### Custom foreign field

```typescript
const categorySchema = dbSchema({ slug: z.string(), name: z.string() });

const postSchema = dbSchema({
    title: z.string(),
    category: relation(categorySchema, { collection: "categories", foreignField: "slug" }),
});
```

### `snapshot(schema)`

Marks a field as a persisted copy. The ODM will **not** generate `$lookup` for it and will **not** convert it to ObjectId when saving. Useful for denormalized data you want to store as-is.

```typescript
const userSchema = dbSchema({
    name: z.string(),
    company: snapshot(companySchema), // stored as a full copy, no lookup
});
```

### `getPipeline(schema)`

Generates the aggregation pipeline (with `$lookup`, `$set`, `$project`) from a schema.

```typescript
const pipeline = getPipeline(userSchema);
// Use it with findMany
const users = await findMany<User>("users", [...pipeline, { $match: { active: true } }]);
```

### `toSave(schema, data)`

Parses data through the schema and converts relations to ObjectIds for saving.

```typescript
const prepared = toSave(userSchema, rawData);
await save("users", prepared);
```

## id ↔ _id ↔ ObjectId

ZodMongo automatically handles conversions between your app's `id` (string) and MongoDB's `_id` (ObjectId):

| Direction | What happens |
|---|---|
| **Reading** (MongoDB → App) | `_id` (ObjectId) becomes `id` (string), recursively |
| **Saving** (App → MongoDB) | `id` (string) becomes `_id` (ObjectId), valid ObjectId strings are converted |
| **Querying** | `{ id: "..." }` becomes `{ _id: ObjectId("...") }`, supports dot-notation (`company.id` → `company._id`) |

## Automatic Timestamps

- `createdAt` — set automatically on insert (`$setOnInsert`), never modified on update
- `updatedAt` — set on every save (`$set`)

## Promise Tracking

Use `trackPromise()` to register fire-and-forget operations. `close()` waits for all tracked promises before disconnecting.

```typescript
import { trackPromise, close } from "@mauroandre/zodmongo";

trackPromise(save("logs", logEntry));
trackPromise(save("logs", anotherEntry));

await close(); // waits for both saves to complete
```

## Development

```bash
# Start MongoDB
docker compose up -d

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build
```

## License

MIT
