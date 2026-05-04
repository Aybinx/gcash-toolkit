import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Prepare configuration from environment variables
// These should be prefixed with VITE_ to be accessible in the client
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)'
};

// Validate config
if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined') {
  console.error("Firebase API Key is missing. Please check your environment variables (.env or GitHub Secrets).");
  // We throw a descriptive error to help the user identify the issue
  throw new Error("FIREBASE_API_KEY_MISSING: Ensure VITE_FIREBASE_API_KEY is set.");
}

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific settings for browser environment
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);
