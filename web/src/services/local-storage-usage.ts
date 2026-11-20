export type IndexedDbStoreUsage = { name: string; records: number; bytes: number };
export type IndexedDbDatabaseUsage = { name: string; version: number; bytes: number; stores: IndexedDbStoreUsage[]; galleryIndexBytes: number };
export type LocalStorageUsage = { usage: number; quota: number | null; contentBytes: number; databases: IndexedDbDatabaseUsage[] };

export async function readLocalStorageUsage(): Promise<LocalStorageUsage> {
    const [estimate, database] = await Promise.all([readStorageEstimate(), readDatabaseUsage("infinite-canvas")]);
    return { usage: estimate?.usage ?? database.bytes, quota: estimate?.quota ?? null, contentBytes: database.bytes, databases: [database] };
}

async function readStorageEstimate() {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    try {
        return await navigator.storage.estimate();
    } catch {
        return null;
    }
}

function readDatabaseUsage(name: string) {
    return new Promise<IndexedDbDatabaseUsage>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const database = request.result;
            const names = Array.from(database.objectStoreNames);
            if (!names.length) {
                database.close();
                resolve({ name, version: database.version, bytes: 0, stores: [], galleryIndexBytes: 0 });
                return;
            }
            const transaction = database.transaction(names, "readonly");
            Promise.all(names.map((storeName) => readStoreUsage(transaction.objectStore(storeName))))
                .then((stores) => resolve({ name, version: database.version, bytes: stores.reduce((total, store) => total + store.bytes, 0), stores: stores.sort((a, b) => b.bytes - a.bytes), galleryIndexBytes: stores.reduce((total, store) => total + store.galleryIndexBytes, 0) }))
                .catch(reject)
                .finally(() => database.close());
        };
    });
}

function readStoreUsage(store: IDBObjectStore) {
    return new Promise<IndexedDbStoreUsage & { galleryIndexBytes: number }>((resolve, reject) => {
        let records = 0;
        let bytes = 0, galleryIndexBytes = 0;
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ name: store.name, records, bytes, galleryIndexBytes });
                return;
            }
            records += 1;
            const size = valueBytes(cursor.value);
            bytes += size;
            if (store.name === "app_state" && typeof cursor.key === "string" && cursor.key.startsWith("blinkflow:pose-gallery-cache-")) galleryIndexBytes += size;
            cursor.continue();
        };
    });
}

function valueBytes(value: unknown) {
    if (value instanceof Blob) return value.size;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    const storedBlob = value && typeof value === "object" && "blob" in value && value.blob instanceof Blob ? value.blob.size : 0;
    return storedBlob + new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}
