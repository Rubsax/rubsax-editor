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
  systemBreakMode: 'initial' | 'auto' | 'every-x' | 'custom';
  measuresPerLineInput: number;
  staffScalePercent: number;
  canvasTheme: 'parchment' | 'white';
  savedAt: number;
}

const DB_NAME = 'rubsax_workspace_db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SESSION_KEY = 'current';
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function saveWorkspaceSession(
  session: SavedWorkspaceSession
): Promise<void> {
  const db = await openWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(session, SESSION_KEY);
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

export async function loadWorkspaceSession(): Promise<SavedWorkspaceSession | null> {
  const db = await openWorkspaceDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);
      req.onsuccess = () => {
        db.close();
        const result = req.result as SavedWorkspaceSession | undefined;
        if (
          !result ||
          typeof result.fileName !== 'string' ||
          typeof result.originalBase64 !== 'string' ||
          typeof result.originalMscx !== 'string' ||
          !result.originalBase64 ||
          !result.originalMscx
        ) {
          resolve(null);
          return;
        }
        if (
          typeof result.savedAt === 'number' &&
          Date.now() - result.savedAt > MAX_SESSION_AGE_MS
        ) {
          resolve(null);
          return;
        }
        resolve(result);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function clearWorkspaceSession(): Promise<void> {
  const db = await openWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(SESSION_KEY);
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
