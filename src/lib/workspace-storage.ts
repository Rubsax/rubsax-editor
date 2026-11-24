import type {
  FloatingTextBox,
  ScoreHeadersState,
  ScoreLayoutViewMode,
} from '@/lib/music/mscz-engine';

export interface SavedWorkspaceSession {
  fileName: string;
  fileFormat?: 'mscz' | 'mscx' | 'xml' | 'mxl';
  originalBase64: string;
  originalMscx: string;
  fileHash: string;
  semitoneShift: number;
  octaveShift: number;
  octaveShiftsByPart?: Record<string, number>;
  targetInstrumentId: string;
  selectedStaffIds: string[];
  viewMode: ScoreLayoutViewMode;
  convertBbEbChordsToWritten: boolean;
  showChords: boolean;
  showLyrics: boolean;
  headers: ScoreHeadersState;
  chordOverrides: Record<string, string>;
  floatingTexts: FloatingTextBox[];
  lineBreakMeasures: number[];
  pageBreakMeasures?: number[];
  systemBreakMode: 'initial' | 'auto' | 'every-x' | 'custom';
  measuresPerLineInput: number;
  staffScalePercent: number;
  canvasTheme: 'parchment' | 'white';
  savedAt: number;
}

const DB_NAME = 'rubsax_workspace_db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const LEGACY_SESSION_KEY = 'current';
const RECENT_PROJECTS_KEY = 'recent_projects_v1';
const MAX_RECENT_PROJECTS = 5;
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_TAB_HASH_KEY = 'rubsax_active_session_hash';

function openWorkspaceDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function isValidSavedSession(item: unknown): item is SavedWorkspaceSession {
  if (!item || typeof item !== 'object') return false;
  const s = item as SavedWorkspaceSession;
  if (
    typeof s.fileName !== 'string' ||
    typeof s.originalBase64 !== 'string' ||
    typeof s.originalMscx !== 'string' ||
    !s.originalBase64 ||
    !s.originalMscx
  ) {
    return false;
  }
  if (typeof s.savedAt === 'number' && Date.now() - s.savedAt > MAX_SESSION_AGE_MS) {
    return false;
  }
  return true;
}

function normalizeProjectKey(session: Pick<SavedWorkspaceSession, 'fileHash' | 'fileName'>): string {
  return (session.fileHash && session.fileHash.trim()) || `name:${session.fileName}`;
}

export function getActiveTabProjectHash(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = window.sessionStorage.getItem(ACTIVE_TAB_HASH_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function setActiveTabProjectHash(fileHash: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (fileHash && fileHash.trim()) {
      window.sessionStorage.setItem(ACTIVE_TAB_HASH_KEY, fileHash.trim());
    } else {
      window.sessionStorage.removeItem(ACTIVE_TAB_HASH_KEY);
    }
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export async function loadRecentProjects(): Promise<SavedWorkspaceSession[]> {
  const db = await openWorkspaceDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const recentReq = store.get(RECENT_PROJECTS_KEY);
      const legacyReq = store.get(LEGACY_SESSION_KEY);

      let recentDone = false;
      let legacyDone = false;
      let recentRaw: unknown = undefined;
      let legacyRaw: unknown = undefined;

      const finishIfReady = () => {
        if (!recentDone || !legacyDone) return;

        const list: SavedWorkspaceSession[] = Array.isArray(recentRaw)
          ? recentRaw.filter(isValidSavedSession)
          : [];

        let migrated = false;
        if (isValidSavedSession(legacyRaw)) {
          const legKey = normalizeProjectKey(legacyRaw);
          if (!list.some((item) => normalizeProjectKey(item) === legKey)) {
            list.push(legacyRaw);
          }
          store.delete(LEGACY_SESSION_KEY);
          migrated = true;
        }

        const dedupedMap = new Map<string, SavedWorkspaceSession>();
        for (const item of list) {
          const k = normalizeProjectKey(item);
          const existing = dedupedMap.get(k);
          if (!existing || (item.savedAt || 0) > (existing.savedAt || 0)) {
            dedupedMap.set(k, item);
          }
        }

        const sorted = Array.from(dedupedMap.values())
          .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
          .slice(0, MAX_RECENT_PROJECTS);

        if (migrated) {
          store.put(sorted, RECENT_PROJECTS_KEY);
        }

        tx.oncomplete = () => {
          db.close();
          resolve(sorted);
        };
        tx.onerror = () => {
          db.close();
          resolve(sorted);
        };
      };

      recentReq.onsuccess = () => {
        recentRaw = recentReq.result;
        recentDone = true;
        finishIfReady();
      };
      recentReq.onerror = () => {
        recentDone = true;
        finishIfReady();
      };
      legacyReq.onsuccess = () => {
        legacyRaw = legacyReq.result;
        legacyDone = true;
        finishIfReady();
      };
      legacyReq.onerror = () => {
        legacyDone = true;
        finishIfReady();
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}

export async function saveWorkspaceSession(
  session: SavedWorkspaceSession
): Promise<SavedWorkspaceSession[]> {
  const existing = await loadRecentProjects();
  const targetKey = normalizeProjectKey(session);
  const filtered = existing.filter((item) => normalizeProjectKey(item) !== targetKey);
  const nextList = [session, ...filtered]
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    .slice(0, MAX_RECENT_PROJECTS);

  const db = await openWorkspaceDb();
  if (!db) return nextList;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(nextList, RECENT_PROJECTS_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });

  return nextList;
}

export async function deleteRecentProject(
  fileHashOrKey: string
): Promise<SavedWorkspaceSession[]> {
  const existing = await loadRecentProjects();
  const nextList = existing.filter(
    (item) => normalizeProjectKey(item) !== fileHashOrKey && item.fileHash !== fileHashOrKey
  );

  const db = await openWorkspaceDb();
  if (!db) return nextList;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(nextList, RECENT_PROJECTS_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });

  return nextList;
}

export async function loadWorkspaceSession(
  fileHash?: string
): Promise<SavedWorkspaceSession | null> {
  const list = await loadRecentProjects();
  if (list.length === 0) return null;
  if (!fileHash) return list[0] || null;
  return (
    list.find(
      (item) => item.fileHash === fileHash || normalizeProjectKey(item) === fileHash
    ) || null
  );
}

export async function clearWorkspaceSession(): Promise<void> {
  const db = await openWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(LEGACY_SESSION_KEY);
      store.delete(RECENT_PROJECTS_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
