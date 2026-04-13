# Save

The `save` function is a smart upsert. It inserts when there's no `id`, and updates when there is.

## Insert

Parse a document with no `id` and save it. ZodMongo generates a new ObjectId and assigns it to `doc.id`.

```typescript
import { save } from "zodmongo";

const user = userSchema.parse({ name: "Mauro", email: "mauro@example.com" });
console.log(user.id); // null

await save("users", user);
console.log(user.id); // "507f1f77bcf86cd799439011"
```

## Update

When a document already has an `id`, `save` updates the existing document.

```typescript
user.name = "Mauro André";
await save("users", user);
```

## Automatic timestamps

- **`createdAt`** — set on insert via `$setOnInsert`. Never modified on update.
- **`updatedAt`** — set on every save via `$set`.

You don't need to manage these fields manually.

## Custom filter

Pass a third argument to control which document gets updated:

```typescript
// Upsert by email instead of id
await save("users", user, { email: "mauro@example.com" });
```

## Disable upsert

By default, `save` creates the document if it doesn't exist. Pass `{ upsert: false }` to prevent this:

```typescript
await save("users", user, { email: "mauro@example.com" }, { upsert: false });
```

## id/ObjectId conversion

When saving, ZodMongo automatically:

- Strips `id`, `createdAt`, `updatedAt` from the document data
- Converts `id` string to `_id` ObjectId in the filter
- Converts valid ObjectId strings in nested fields to ObjectId instances
- This conversion is recursive — it works on nested objects and arrays

```typescript
const doc = schema.parse({
    name: "Test",
    companyId: "507f1f77bcf86cd799439011", // string
});
await save("docs", doc);
// In MongoDB: companyId is stored as ObjectId("507f1f77bcf86cd799439011")
```
