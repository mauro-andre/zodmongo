# Pagination

ZodMongo has built-in pagination using MongoDB's `$facet` aggregation. One query returns both the documents and the total count.

## Basic usage

```typescript
import { findMany } from "zodmongo";

const page = await findMany<User>("users", {}, {
    paginate: true,
    currentPage: 1,
    docsPerPage: 20,
});
```

## Response format

When `paginate: true`, the return type changes from `T[]` to `PaginateResponse<T>`:

```typescript
interface PaginateResponse<T> {
    docs: T[];           // documents for the current page
    currentPage: number; // the requested page (1-based)
    pageQuantity: number; // total number of pages
    docsQuantity: number; // total number of matching documents
}
```

## With filters

Pagination works with both match objects and pipelines:

```typescript
// Match filter
const page = await findMany<User>(
    "users",
    { role: "admin" },
    { paginate: true, currentPage: 2, docsPerPage: 10 },
);

// Pipeline
const page = await findMany<User>(
    "users",
    [{ $match: { active: true } }, { $sort: { name: 1 } }],
    { paginate: true, currentPage: 1, docsPerPage: 25 },
);
```

## Defaults

- `currentPage` defaults to `1` if not provided, `0`, or negative
- `docsPerPage` defaults to `100` if not provided or `0`

## Type safety

TypeScript overloads ensure the return type is correct:

```typescript
// paginate: true → PaginateResponse<User>
const page = await findMany<User>("users", {}, { paginate: true });
page.docs;        // User[]
page.pageQuantity; // number

// paginate: false/undefined → User[]
const users = await findMany<User>("users");
users.length; // number
```
