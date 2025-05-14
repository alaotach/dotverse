import { initializeApp, FirebaseApp } from 'firebase/app'; // Import FirebaseApp type
import { getDatabase } from 'firebase/database';
import { getFirestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from 'firebase/firestore'; 
import { enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Log the configuration to check if Vite is loading .env Variables correctly
// This is useful for debugging but should be removed in production
console.log("Firebase Config Loaded:", firebaseConfig);

// Check for missing essential configuration keys
const requiredKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingKeys = requiredKeys.filter(key => !firebaseConfig[key]);

if (missingKeys.length > 0) {
  const errorMessage = `Firebase configuration is missing required keys: ${missingKeys.join(', ')}. Please check your .env file and Vite setup.`;
  console.error(errorMessage);
  alert(errorMessage); // Also alert to make it very visible during development
  throw new Error(errorMessage);
}

export const app: FirebaseApp = initializeApp(firebaseConfig); // Export app and add type
export const db = getDatabase(app); // Realtime Database
export const fs = getFirestore(app); // Firestore Database

// Initialize Firestore with optimized settings
const initFirestore = async () => {
  try {
    // Enable offline persistence with unlimited cache size
    await enableIndexedDbPersistence(fs, { cacheSizeBytes: CACHE_SIZE_UNLIMITED })
      .then(() => {
        console.log("Firestore persistence enabled successfully");
      })
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          // Multiple tabs open, persistence can only be enabled in one tab at a time
          console.warn("Multiple tabs open, persistence only enabled in one tab");
        } else if (err.code === 'unimplemented') {
          // The current browser does not support all of the features required for persistence
          console.warn("Persistence not supported in this browser");
        } else {
          console.error("Firestore persistence error:", err);
        }
      });
  } catch (error) {
    console.error("Error initializing Firestore with persistence:", error);
  }
};

initFirestore();

console.log("Firebase initialized successfully");
