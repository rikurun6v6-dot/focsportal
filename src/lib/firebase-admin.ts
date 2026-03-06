import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  });
}

export const adminDb = getApps().length ? getFirestore() : null as unknown as ReturnType<typeof getFirestore>;
