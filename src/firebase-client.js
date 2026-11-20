import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  signInAnonymously,
  connectAuthEmulator,
} from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import savedConfig from "../firebase-config.json" with { type: "json" };
const env = import.meta.env || {};
export const usesEmulators = env.VITE_FIREBASE_EMULATORS === "true";
export function firebaseConfig() {
  const projectId =
    env.VITE_FIREBASE_PROJECT_ID ||
    savedConfig.projectId ||
    (usesEmulators ? "demo-frankenstein" : "");
  return {
    apiKey:
      env.VITE_FIREBASE_API_KEY ||
      savedConfig.apiKey ||
      (usesEmulators ? "demo-key" : ""),
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || savedConfig.authDomain,
    databaseURL:
      env.VITE_FIREBASE_DATABASE_URL ||
      savedConfig.databaseURL ||
      (usesEmulators ? `https://${projectId}-default-rtdb.firebaseio.com` : ""),
    projectId,
    appId: env.VITE_FIREBASE_APP_ID || savedConfig.appId,
  };
}
export function firebaseConfigured() {
  const c = firebaseConfig();
  return !!(c.apiKey && c.projectId && c.databaseURL);
}
let session;
export function connectFirebase() {
  if (session) return session;
  session = (async () => {
    if (!firebaseConfigured())
      throw Error(
        "Firebase ещё не настроен. Нужны firebaseConfig и адрес Realtime Database. Мастерская доступна без подключения.",
      );
    const config = firebaseConfig(),
      app = getApps()[0] || initializeApp(config),
      auth = getAuth(app),
      db = getDatabase(app);
    if (usesEmulators) {
      const host = env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
      connectAuthEmulator(auth, `http://${host}:9099`, {
        disableWarnings: true,
      });
      connectDatabaseEmulator(db, host, 9000);
    }
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      await setPersistence(auth, inMemoryPersistence);
    }
    await auth.authStateReady();
    const user = auth.currentUser || (await signInAnonymously(auth)).user;
    return { app, auth, db, user };
  })().catch((e) => {
    session = undefined;
    throw e;
  });
  return session;
}
