export interface WorkspaceRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const DB_NAME = 'ubair_os_db';
const DB_VERSION = 1;
const WORKSPACES_STORE = 'workspaces';
const MESSAGES_STORE = 'messages';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACES_STORE)) {
        db.createObjectStore(WORKSPACES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const msgStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        msgStore.createIndex('workspaceId', 'workspaceId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Workspaces Operations
export async function getAllWorkspaces(): Promise<WorkspaceRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACES_STORE, 'readonly');
    const store = tx.objectStore(WORKSPACES_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function createWorkspace(title: string): Promise<WorkspaceRecord> {
  const db = await openDB();
  const newWorkspace: WorkspaceRecord = {
    id: 'ws_' + Math.random().toString(36).substring(2, 9),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKSPACES_STORE, 'readwrite');
    const store = tx.objectStore(WORKSPACES_STORE);
    const request = store.add(newWorkspace);

    request.onsuccess = () => resolve(newWorkspace);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([WORKSPACES_STORE, MESSAGES_STORE], 'readwrite');
    const wsStore = tx.objectStore(WORKSPACES_STORE);
    wsStore.delete(id);

    // Delete associated messages
    const msgStore = tx.objectStore(MESSAGES_STORE);
    const index = msgStore.index('workspaceId');
    const msgRequest = index.openCursor(IDBKeyRange.only(id));

    msgRequest.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Messages Operations
export async function getWorkspaceMessages(workspaceId: string): Promise<MessageRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const index = store.index('workspaceId');
    const request = index.getAll(IDBKeyRange.only(workspaceId));

    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => a.timestamp - b.timestamp);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveMessageToWorkspace(
  workspaceId: string,
  message: MessageRecord
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    store.put({ ...message, workspaceId });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}