# Why ZodMongo

## vs Mongoose

Mongoose is a great ODM, but it comes with its own schema system, a large API surface, and a significant abstraction layer over the MongoDB driver.

ZodMongo takes a different approach:

| | Mongoose | ZodMongo |
|---|---|---|
| Schema format | Mongoose Schema | Zod |
| Type inference | Manual or plugin | Automatic from Zod |
| Driver | Wrapped | Native (direct access) |
| Size | ~1MB | ~300 lines |
| id handling | `_id` everywhere, virtual `id` | `id` in app, `_id` in DB (automatic) |
| Timestamps | Plugin or option | Built-in, always |
| Pagination | Not built-in | Built-in via `$facet` |
| Aggregation | Separate API | First-class in `findMany` |
| Relations | Populate (separate queries) | `$lookup` (single pipeline) |

## vs raw MongoDB driver

The native driver is powerful but verbose. ZodMongo adds a thin layer that handles:

- **id conversion** — you never touch `_id` or `ObjectId` in your app code
- **Timestamps** — no manual `$set: { updatedAt: new Date() }`
- **Pagination** — no manual `$facet` + count boilerplate
- **Validation** — Zod schemas validate before save
- **Type safety** — generic types on `findMany<T>` give you typed results

You keep full access to the driver via `getDb()` whenever you need it.

## Philosophy

ZodMongo is intentionally small. It solves the common cases — save, find, paginate, delete — and gets out of your way for everything else. No query builders, no middleware chains, no hooks system. Just Zod schemas and the MongoDB driver.
