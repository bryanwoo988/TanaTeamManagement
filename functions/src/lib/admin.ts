import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp();
export const db = getFirestore();
export { Timestamp, FieldValue };

export const REGION = 'asia-southeast1';
export const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
