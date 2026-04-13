import { ObjectId } from "mongodb";

/**
 * Recursively converts _id (ObjectId) to id (string).
 * Used to transform documents coming from MongoDB into the application format.
 */
export const transformDoc = <T>(doc: any): T => {
    if (!doc || typeof doc !== "object") {
        return doc;
    }

    if (doc instanceof ObjectId) {
        return doc.toString() as T;
    }

    if (Array.isArray(doc)) {
        return doc.map(transformDoc) as T;
    }

    if (doc._id) {
        if (doc._id instanceof ObjectId) {
            doc.id = doc._id.toString();
        } else {
            doc.id = doc._id;
        }
        delete doc._id;
    }

    for (const key in doc) {
        if (doc[key]) {
            if (doc[key] instanceof ObjectId) {
                doc[key] = doc[key].toString();
            } else if (typeof doc[key] === "object") {
                doc[key] = transformDoc(doc[key]);
            }
        }
    }

    return doc as T;
};

/**
 * Recursively converts id (string) to _id (ObjectId).
 * Automatically converts valid ObjectId strings.
 * Used before saving documents to MongoDB.
 */
export const transformDocForSave = (doc: any): any => {
    if (typeof doc === "string" && ObjectId.isValid(doc)) {
        return new ObjectId(doc);
    }

    if (!doc || typeof doc !== "object") {
        return doc;
    }

    if (doc instanceof ObjectId) {
        return doc;
    }

    if (Array.isArray(doc)) {
        return doc.map(transformDocForSave);
    }

    if (doc.id && typeof doc.id === "string") {
        doc._id = new ObjectId(doc.id);
        delete doc.id;
    }

    for (const key in doc) {
        if (doc[key]) {
            if (doc[key] instanceof ObjectId) {
                continue;
            } else if (
                typeof doc[key] === "string" ||
                typeof doc[key] === "object"
            ) {
                doc[key] = transformDocForSave(doc[key]);
            }
        }
    }

    return doc;
};

/**
 * Converts valid strings to ObjectIds and id to _id in search queries.
 * Supports dot-notation (e.g. "company.id" → "company._id").
 */
export const transformMatchQuery = (query: any): any => {
    if (!query || typeof query !== "object") {
        if (typeof query === "string" && ObjectId.isValid(query)) {
            return new ObjectId(query);
        }
        return query;
    }

    if (query instanceof ObjectId || query instanceof Date) {
        return query;
    }

    if (Array.isArray(query)) {
        return query.map(transformMatchQuery);
    }

    const transformed: any = {};
    for (const key in query) {
        const newKey =
            key === "id"
                ? "_id"
                : key.endsWith(".id")
                  ? key.slice(0, -3) + "._id"
                  : key;
        transformed[newKey] = transformMatchQuery(query[key]);
    }
    return transformed;
};
