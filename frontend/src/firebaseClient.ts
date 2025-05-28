import { initializeApp, FirebaseApp } from 'firebase/app';
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
console.log("Firebase Config Loaded:", firebaseConfig);

const requiredKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingKeys = requiredKeys.filter(key => !firebaseConfig[key]);

if (missingKeys.length > 0) {
  const errorMessage = `Firebase configuration is missing required keys: ${missingKeys.join(', ')}. Please check your .env file and Vite setup.`;
  console.error(errorMessage);
  alert(errorMessage); 
  throw new Error(errorMessage);
}

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const db = getDatabase(app); 
export const fs = getFirestore(app); 

const initFirestore = async () => {
  try {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        await enableIndexedDbPersistence(fs, { 
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
          forceOwnership: false 
        });
        console.log("Firestore persistence enabled successfully");
        break;
      } catch (err: any) {
        retryCount++;
        if (err.code === 'failed-precondition') {
          console.warn("Multiple tabs open, persistence only enabled in one tab");
          break;
        } else if (err.code === 'unimplemented') {
          console.warn("Persistence not supported in this browser");
          break;
        } else if (retryCount >= maxRetries) {
          console.error("Firestore persistence error after retries:", err);
          break;
        } else {
          console.warn(`Firestore persistence attempt ${retryCount} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }
  } catch (error) {
    console.error("Error initializing Firestore with persistence:", error);
  }
};

initFirestore();


console.log("Firebase initialized successfully");
