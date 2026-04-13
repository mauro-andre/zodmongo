import { MongoClient, type Db, ObjectId } from "mongodb";
import type { Document, UpdateResult } from "mongodb";
import type { DbModel } from "./schema.js";
import {
    transformDoc,
    transformDocForSave,
    transformMatchQuery,
} from "./transforms.js";

let db: Db;
let client: MongoClient;

const pendingPromises = new Set<Promise<any>>();

const trackPromise = <T>(promise: Promise<T>): Promise<T> => {
    pendingPromises.add(promise);
    promise.finally(() => pendingPromises.delete(promise));
    return promise;
};

const waitPendingPromises = async (): Promise<void> => {
    if (pendingPromises.size > 0) {
        await Promise.all(pendingPromises);
    }
};

const connect = async (uri: string, dbName: string): Promise<Db> => {
    if (db) {
        return db;
    }

    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);

    return db;
};

const getDb = (): Db => {
    if (!db) {
        throw new Error("Database not initialized. Call connect() first.");
    }
    return db;
};

const close = async (): Promise<void> => {
    if (client) {
        await waitPendingPromises();
        await client.close();
        db = undefined as any;
        client = undefined as any;
    }
};

// --- Interfaces ---

interface PaginateResponse<T> {
    currentPage: number;
    pageQuantity: number;
    docsQuantity: number;
    docs: T[];
}

interface FindOptions {
    paginate?: boolean;
    currentPage?: number;
    docsPerPage?: number;
}

interface SaveOptions {
    upsert?: boolean;
}

// --- Database Operations ---

const save = async <T extends DbModel>(
    collectionName: string,
    doc: T,
    find?: any,
    options: SaveOptions = { upsert: true },
): Promise<UpdateResult> => {
    const db = getDb();
    const now = new Date();

    const { id, createdAt, updatedAt, ...docData } = doc;

    const transformedDocData = transformDocForSave({ ...docData });

    let filter =
        find || (id ? { _id: new ObjectId(id) } : { _id: new ObjectId() });

    if (filter.id) {
        filter = { ...filter, _id: new ObjectId(filter.id) };
        delete filter.id;
    }

    if (filter._id && typeof filter._id === "string") {
        filter = { ...filter, _id: new ObjectId(filter._id) };
    }

    const result = await db.collection(collectionName).updateMany(
        filter,
        {
            $set: { ...transformedDocData, updatedAt: now },
            $setOnInsert: { createdAt: now },
        },
        { upsert: options.upsert ?? true },
    );

    if (result.upsertedId) {
        doc.id = result.upsertedId.toString();
    }

    return result;
};

// Overload: paginate true → PaginateResponse<T>
async function findMany<T>(
    collectionName: string,
    matchOrPipeline: Document[] | any,
    options: FindOptions & { paginate: true },
): Promise<PaginateResponse<T>>;

// Overload: paginate false/undefined → T[]
async function findMany<T>(
    collectionName: string,
    matchOrPipeline?: Document[] | any,
    options?: FindOptions,
): Promise<T[]>;

// Implementation
async function findMany<T>(
    collectionName: string,
    matchOrPipeline?: Document[] | any,
    options: FindOptions = {},
): Promise<T[] | PaginateResponse<T>> {
    const db = getDb();
    const collection = db.collection(collectionName);

    let pipeline: Document[];
    if (Array.isArray(matchOrPipeline)) {
        pipeline = matchOrPipeline;
    } else if (matchOrPipeline) {
        pipeline = [{ $match: matchOrPipeline }];
    } else {
        pipeline = [];
    }

    for (const stage of pipeline) {
        if (stage.$match) {
            stage.$match = transformMatchQuery(stage.$match);
        }
    }

    if (options.paginate) {
        const currentPage =
            options.currentPage && options.currentPage > 0
                ? options.currentPage
                : 1;
        const docsPerPage =
            options.docsPerPage && options.docsPerPage > 0
                ? options.docsPerPage
                : 100;
        const skip = (currentPage - 1) * docsPerPage;

        const facetPipeline = [
            ...pipeline,
            {
                $facet: {
                    docs: [{ $skip: skip }, { $limit: docsPerPage }],
                    docsQuantity: [{ $count: "count" }],
                },
            },
        ];

        const result = await collection.aggregate(facetPipeline).toArray();

        const rawDocs = (result[0]?.docs || []) as any[];
        const docs = rawDocs.map(transformDoc<T>);
        const docsQuantity = result[0]?.docsQuantity[0]?.count || 0;
        const pageQuantity = Math.ceil(docsQuantity / docsPerPage);

        return {
            docs,
            docsQuantity,
            pageQuantity,
            currentPage,
        };
    }

    const rawDocs = await collection.aggregate(pipeline).toArray();
    return rawDocs.map(transformDoc<T>);
}

const deleteMany = async (collectionName: string, filter: any) => {
    const transformedFilter = transformMatchQuery(filter);
    const db = getDb();
    return await db.collection(collectionName).deleteMany(transformedFilter);
};

export { connect, getDb, close, save, findMany, deleteMany, trackPromise };
export type { PaginateResponse, FindOptions, SaveOptions };
