import 'dotenv/config';
import { initializeApp, FirebaseApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

let app: FirebaseApp;
let db: Firestore;

const firebaseConfig = {
  apiKey: process.env.RT_FIREBASE_API_KEY || '',
  authDomain: process.env.RT_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.RT_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.RT_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.RT_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.RT_FIREBASE_APP_ID || '',
};

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}
