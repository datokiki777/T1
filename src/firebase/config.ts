import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

/**
 * Firebase web config for T1 — DELIBERATELY left unset for now.
 *
 * T1 is a separate clone of Client Totals/React-totals, for a different
 * company's data. It must NEVER share a Firebase project with the
 * original app (that would let the two companies' cloud data collide in
 * the same Firestore document). Rather than risk copying the original
 * app's config here by mistake, this ships with cloud sync safely
 * disabled (see isFirebaseConfigured below, checked by
 * cloudSyncController.ts before it ever touches the network) until a
 * real, T1-only Firebase project's config is pasted in here.
 *
 * This is NOT a secret once filled in: Firebase's own docs are explicit
 * that this client config is meant to be public (it identifies the
 * project, it doesn't authorize anything by itself) — the actual
 * security boundary is Firestore Security Rules plus Firebase Auth, not
 * hiding this object. https://firebase.google.com/docs/projects/api-keys
 */
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "";

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  return app;
}
