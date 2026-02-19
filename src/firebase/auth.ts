import { getAuth, signInWithEmailAndPassword, Auth } from 'firebase/auth';
import { getFirebaseApp } from './client.js';

let auth: Auth;

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export async function signIn(email: string, password: string): Promise<string> {
  const firebaseAuth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return credential.user.uid;
}

export function getCurrentUserId(): string {
  const firebaseAuth = getFirebaseAuth();
  return firebaseAuth.currentUser?.uid ?? 'anonymous';
}
