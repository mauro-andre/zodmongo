# Relations

ZodMongo can generate `$lookup` aggregation pipelines from your schema definitions. Declare which fields reference other collections, and the ODM handles the rest.

## Declaring a relation

Use `relation()` to mark a field as a reference:

```typescript
import { dbSchema, relation } from "@mauroandre/zodmongo";
import { z } from "zod/v4";

const companySchema = dbSchema({
    name: z.string(),
});

const userSchema = dbSchema({
    name: z.string(),
    company: relation(companySchema, { collection: "companies" }),
});
```

When you query with `getPipeline(userSchema)`, it generates:

```json
[
    { "$lookup": { "from": "companies", "localField": "company", "foreignField": "_id", "as": "company" } },
    { "$set": { "company": { "$arrayElemAt": ["$company", 0] } } },
    { "$project": { "_id": 1, "name": 1, "company": 1, "createdAt": 1, "updatedAt": 1 } }
]
```

## Array relations

For arrays of references, the `$lookup` replaces the array directly (no `$arrayElemAt`):

```typescript
const postSchema = dbSchema({
    title: z.string(),
    tags: z.array(relation(tagSchema, { collection: "tags" })),
});
```

## Custom foreign field

By default, lookups match on `_id`. You can specify a different field:

```typescript
const categorySchema = dbSchema({
    slug: z.string(),
    name: z.string(),
});

const postSchema = dbSchema({
    title: z.string(),
    category: relation(categorySchema, {
        collection: "categories",
        foreignField: "slug",
    }),
});
```

## Nested relations

Relations can be nested. The pipeline generation is recursive:

```typescript
const tagSchema = dbSchema({ label: z.string() });

const companySchema = dbSchema({
    name: z.string(),
    tags: z.array(relation(tagSchema, { collection: "tags" })),
});

const userSchema = dbSchema({
    name: z.string(),
    company: relation(companySchema, { collection: "companies" }),
});

// getPipeline(userSchema) generates lookups for both company and company.tags
```

## Using pipelines with findMany

```typescript
import { getPipeline, findMany } from "@mauroandre/zodmongo";

const pipeline = getPipeline(userSchema);
const users = await findMany<User>("users", [
    ...pipeline,
    { $match: { active: true } },
]);
```

## Saving relations

Use `toSave()` to convert relation objects back to ObjectIds before saving:

```typescript
import { toSave, save } from "@mauroandre/zodmongo";

const dataToSave = toSave(userSchema, userData);
// dataToSave.company is now an ObjectId (not the full object)
await save("users", dataToSave);
```
