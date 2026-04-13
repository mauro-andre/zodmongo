# Connection

ZodMongo manages a single MongoDB connection. You connect once and use it throughout your application.

## connect

```typescript
import { connect } from "zodmongo";

const db = await connect("mongodb://localhost:27017", "mydb");
```

`connect` returns the MongoDB `Db` instance. If already connected, it returns the existing instance without reconnecting.

## getDb

Access the current database instance anywhere in your code:

```typescript
import { getDb } from "zodmongo";

const db = getDb();
const collection = db.collection("users");
```

Throws an error if called before `connect()`.

## close

Closes the connection. Waits for all tracked promises to complete first.

```typescript
import { close } from "zodmongo";

await close();
```

## Promise tracking

For fire-and-forget operations, use `trackPromise` to ensure `close()` waits for them:

```typescript
import { trackPromise, save, close } from "zodmongo";

// Fire and forget — but close() will wait for it
trackPromise(save("logs", logEntry));
trackPromise(save("logs", anotherEntry));

// Waits for both saves to finish before disconnecting
await close();
```

## Direct database access

`getDb()` returns the native MongoDB `Db` object, so you can always drop down to the driver when needed:

```typescript
const db = getDb();

// Create indexes
await db.collection("users").createIndex({ email: 1 }, { unique: true });

// Use any MongoDB operation
const result = await db.collection("users").aggregate([
    { $group: { _id: "$role", count: { $sum: 1 } } },
]).toArray();
```
