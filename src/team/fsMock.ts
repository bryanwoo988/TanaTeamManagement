import { vi } from 'vitest';

/** Test helper: an in-memory stand-in for the bits of firebase/firestore the team UI uses. */
export const listeners = new Map<string, (snap: unknown) => void>();
export const updateDoc = vi.fn().mockResolvedValue(undefined);
export const deleteDoc = vi.fn().mockResolvedValue(undefined);

export const firestoreMock = {
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  collection: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  where: (f: string, _op: string, v: unknown) => ({ f, v }),
  query: (c: { path: string }, w?: { f: string; v: unknown }) => ({ path: w ? `${c.path}?${w.f}=${String(w.v)}` : c.path }),
  onSnapshot: (ref: { path: string }, cb: (s: unknown) => void) => {
    listeners.set(ref.path, cb);
    return () => listeners.delete(ref.path);
  },
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
};

/** Deliver a collection snapshot to whoever listens on `path`. */
export function emit(path: string, docs: Record<string, unknown>) {
  const cb = listeners.get(path);
  if (!cb) throw new Error(`no listener on ${path}; have ${[...listeners.keys()].join(', ')}`);
  cb({ docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => d })) });
}
