# Delete

`deleteMany` removes documents matching a filter. It uses the same automatic conversions as `findMany`.

## Basic usage

```typescript
import { deleteMany } from "@mauroandre/zodmongo";

await deleteMany("users", { email: "old@example.com" });
```

## Delete by id

```typescript
await deleteMany("users", { id: userId });
// Converted to: { _id: ObjectId(userId) }
```

## Delete with operators

```typescript
// Delete inactive users older than 30 days
await deleteMany("users", {
    active: false,
    updatedAt: { $lt: thirtyDaysAgo },
});
```

## Dot-notation

```typescript
await deleteMany("users", { "company.id": companyId });
// Converted to: { "company._id": ObjectId(companyId) }
```

## Return value

`deleteMany` returns the MongoDB `DeleteResult`:

```typescript
const result = await deleteMany("users", { role: "guest" });
console.log(result.deletedCount); // number of deleted documents
```

## Delete all

Pass an empty filter to delete all documents in a collection:

```typescript
await deleteMany("users", {});
```
