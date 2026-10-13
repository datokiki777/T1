import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

/**
 * Firebase web config for T1 — its own, separate Firebase project
 * (t1-sync-602bc), entirely independent of the original app's project.
 * This is NOT a secret: Firebase's own docs are explicit that this
 * client config is meant to be public (it identifies the project, it
 * doesn't authorize anything by itself) — the actual security boundary
 * is Firestore Security Rules plus Firebase Auth, not hiding this
 * object. https://firebase.google.com/docs/projects/api-keys
 */
const firebaseConfig = {
  apiKey: "AIzaSyC1pa24LZqHOUhfn0wnZ0RRhXI8FMUcJj8",
  authDomain: "t1-sync-602bc.firebaseapp.com",
  projectId: "t1-sync-602bc",
  storageBucket: "t1-sync-602bc.firebasestorage.app",
  messagingSenderId: "695626890014",
  appId: "1:695626890014:web:39c836ee7f39c5e9c3670f",
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "";

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  return app;
}
