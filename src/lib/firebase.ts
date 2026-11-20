// Firebase ulanishi. Hamma narsa "dangasa" (lazy) — server tomonda (build vaqtida) ishga tushmaydi.
import { FirebaseApp, FirebaseOptions, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  Firestore, connectFirestoreEmulator, initializeFirestore,
  memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';

// Next.js faqat to'g'ridan-to'g'ri `process.env.NEXT_PUBLIC_*` yozuvlarini bundle'ga joylaydi
const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === '1';
const AUTH_EMULATOR = process.env.NEXT_PUBLIC_AUTH_EMULATOR || 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080);

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let staffApp: FirebaseApp | undefined;
let staffAuth: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error('FIREBASE_NOT_CONFIGURED');
  if (!app) app = getApps().find(a => a.name === '[DEFAULT]') ?? initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
    if (useEmulator) connectAuthEmulator(auth, AUTH_EMULATOR, { disableWarnings: true });
  }
  return auth;
}

export function getDb(): Firestore {
  if (!db) {
    const canPersist = typeof indexedDB !== 'undefined';
    db = initializeFirestore(getFirebaseApp(), {
      ignoreUndefinedProperties: true,
      // Brauzerda: qayta ochilganda tez yuklanadi va qisqa uzilishlarga bardoshli (bir necha tab bilan ishlaydi)
      localCache: canPersist && !useEmulator ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
    });
    if (useEmulator) connectFirestoreEmulator(db, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }
  return db;
}

/**
 * Admin yangi xodim hisobini ochayotganda o'zi tizimdan chiqib ketmasligi uchun ikkinchi (alohida) Firebase ilovasi.
 */
export function getStaffCreatorAuth(): Auth {
  if (!staffAuth) {
    staffApp = getApps().find(a => a.name === 'staff-creator') ?? initializeApp(config, 'staff-creator');
    staffAuth = getAuth(staffApp);
    if (useEmulator) connectAuthEmulator(staffAuth, AUTH_EMULATOR, { disableWarnings: true });
  }
  return staffAuth;
}

/** Login (foydalanuvchi nomi) → Firebase uchun ichki email. Hech qachon xat yuborilmaydi. */
export const AUTH_EMAIL_DOMAIN = 'sunduk.uz';
export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
export const isValidUsername = (username: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(username.trim().toLowerCase());
