# Queries

`findMany` is the main query function. It accepts a simple match object or a full MongoDB aggregation pipeline.

## Find all

```typescript
import { findMany } from "zodmongo";

const users = await findMany<User>("users");
```

## Simple match

Pass an object and it becomes a `$match` stage:

```typescript
const admins = await findMany<User>("users", { role: "admin" });
```

## Find by id

Use `id` (not `_id`) — ZodMongo converts it automatically:

```typescript
const found = await findMany<User>("users", { id: userId });
```

Dot-notation works too:

```typescript
const found = await findMany<User>("users", { "company.id": companyId });
// Becomes: { "company._id": ObjectId(companyId) }
```

## Aggregation pipeline

Pass an array for a full pipeline:

```typescript
const topAdmins = await findMany<User>("users", [
    { $match: { role: "admin" } },
    { $sort: { createdAt: -1 } },
    { $limit: 10 },
]);
```

ZodMongo automatically converts `id` to `_id` and ObjectId strings inside `$match` stages.

## Pipeline with $group

```typescript
const stats = await findMany<any>("users", [
    { $group: { _id: "$role", count: { $sum: 1 } } },
]);
```

## Pipeline with $project

```typescript
const names = await findMany<any>("users", [
    { $project: { name: 1, email: 1 } },
]);
```

## Automatic transformations

All results from `findMany` are automatically transformed:

| MongoDB format | App format |
|---|---|
| `_id: ObjectId(...)` | `id: "string"` |
| Nested `ObjectId` values | Converted to strings |
| `_id` in sub-documents | Converted to `id` |

This conversion is recursive and works on arrays too.

## Empty results

When nothing matches, `findMany` returns an empty array — never `null` or `undefined`.

```typescript
const empty = await findMany<User>("users", { name: "nonexistent" });
// []
```
