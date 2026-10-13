/**
 * Firebase Auth is only imported lazily (dynamic import), so it's never
 * part of the main bundle and never touched by anything that doesn't
 * actually need it (including every existing test).
 */

export interface AuthUser {
  email: string | null;
}

export async function subscribeToAuthState(
  callback: (user: AuthUser | null) => void
): Promise<() => void> {
  const { getAuth, onAuthStateChanged } = await import("firebase/auth");
  const { getFirebaseApp } = await import("./config");
  const auth = getAuth(getFirebaseApp());
  return onAuthStateChanged(auth, (user) => {
    callback(user ? { email: user.email } : null);
  });
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
  const { getFirebaseApp } = await import("./config");
  const auth = getAuth(getFirebaseApp());
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutOfCloud(): Promise<void> {
  const { getAuth, signOut } = await import("firebase/auth");
  const { getFirebaseApp } = await import("./config");
  const auth = getAuth(getFirebaseApp());
  await signOut(auth);
}
