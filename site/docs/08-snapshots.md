# Snapshots

A snapshot is a persisted copy of a related document. Unlike a relation, a snapshot is stored as-is in the document — no `$lookup` is generated, and `toSave` won't convert it to an ObjectId.

## When to use snapshots

Use snapshots for denormalized data that you want to store as a full copy:

- An order storing a snapshot of the product at the time of purchase
- A log entry storing a snapshot of the user who performed the action
- Any case where you need the data as it was, not as it is now

## Declaring a snapshot

```typescript
import { dbSchema, snapshot, relation } from "@mauroandre/zodmongo";
import { z } from "zod/v4";

const companySchema = dbSchema({
    name: z.string(),
    plan: z.string(),
});

const auditSchema = dbSchema({
    action: z.string(),
    company: snapshot(companySchema), // stored as a full copy
});
```

## Snapshot vs Relation

| | Relation | Snapshot |
|---|---|---|
| Storage | ObjectId reference | Full document copy |
| `$lookup` generated | Yes | No |
| `toSave` conversion | Object → ObjectId | Kept as-is |
| Data freshness | Always current | Frozen at save time |

## Snapshot on a relation

You can wrap a relation with `snapshot()` to override its behavior:

```typescript
const userSchema = dbSchema({
    name: z.string(),
    currentCompany: relation(companySchema, { collection: "companies" }), // lookup
    companyAtHire: snapshot(relation(companySchema, { collection: "companies" })), // no lookup
});
```

The `snapshot()` wrapper clears the `_relation` metadata, so no `$lookup` is generated for that field.

## Arrays of snapshots

```typescript
const orderSchema = dbSchema({
    items: z.array(snapshot(productSchema)),
});
```

Each item in the array is stored as a full copy. No lookups, no ObjectId conversion.
