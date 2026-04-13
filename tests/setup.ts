import { connect, close } from "../src/engine.js";
import { beforeAll, afterAll } from "vitest";

const MONGO_URI = "mongodb://localhost:27017";
const DB_NAME = "zodmongo_test";

beforeAll(async () => {
    const db = await connect(MONGO_URI, DB_NAME);
    // Drop all collections to start clean
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
        await db.dropCollection(col.name);
    }
});

afterAll(async () => {
    await close();
});

export { MONGO_URI, DB_NAME };
