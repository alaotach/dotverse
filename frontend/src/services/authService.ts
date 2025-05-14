import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  serverTimestamp as firestoreServerTimestamp,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  writeBatch // Added writeBatch here
} from "firebase/firestore";
import { fs, app } from "../firebaseClient"; // Firestore and app instance
import { generateUserLand } from "../services/landService";

export interface UserProfile {
  uid: string; // This will now be the Firestore document ID
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: number | Timestamp; // Allow Timestamp for serverTimestamp
  lastLogin: number | Timestamp;
  landInfo: {
    centerX: number;
    centerY: number;
    ownedSize: number;
  };
  passwordHash?: string; // Placeholder for hashed password
  salt?: string;         // Placeholder for salt
}

// Placeholder for password hashing - DO NOT USE IN PRODUCTION
// Replace with a strong hashing library like bcrypt.js or use a backend function
const insecureHashPassword = async (password: string, salt: string): Promise<string> => {
  // This is NOT a secure hash. For demonstration only.
  return `hashed_${password}_with_${salt}`;
};

const generateSalt = (): string => {
  // This is a very basic salt. For demonstration only.
  return Math.random().toString(36).substring(2, 15);
};


// Register a new user with custom logic
export const registerUser = async (email: string, password: string, displayName: string): Promise<UserProfile> => {
  const usersRef = collection(fs, "users");
  const q = query(usersRef, where("email", "==", email));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    throw new Error("auth/email-already-in-use");
  }

  const now = Date.now();
  const salt = generateSalt();
  const hashedPassword = await insecureHashPassword(password, salt); // INSECURE HASHING

  // Generate unique land for this user
  console.log("Generating unique land for new user...");
  const landInfo = await generateUserLand();
  console.log("Generated land info:", landInfo);
  
  // Create a new document - Firestore will auto-generate an ID which we use as UID
  const newUserRef = doc(collection(fs, "users")); 
  const newUserProfile: UserProfile = {
    uid: newUserRef.id, // Use Firestore's auto-generated ID as UID
    email,
    displayName,
    passwordHash: hashedPassword, // Store the INSECURE hash
    salt,                      // Store the salt
    photoURL: null, // Or generate a default
    createdAt: now,
    lastLogin: now,
    landInfo: {
      centerX: landInfo.centerX,
      centerY: landInfo.centerY,
      ownedSize: landInfo.ownedSize
    },
  };

  // First save the user profile
  await setDoc(newUserRef, newUserProfile);
  console.log(`Created new user profile for ${newUserProfile.uid} with land at (${landInfo.centerX}, ${landInfo.centerY})`);
  
  // Then claim the land tiles
  try {
    const landSizeHalf = Math.floor(landInfo.ownedSize / 2);
    const batch = writeBatch(fs);
    
    // Store a dedicated land record in a lands collection for easier lookup
    const landCenterRef = doc(fs, `lands/${landInfo.centerX},${landInfo.centerY}`);
    batch.set(landCenterRef, {
      owner: newUserProfile.uid,
      claimedAt: now,
      size: landInfo.ownedSize
    });
    
    // Claim land border markers to speed up availability checks
    const corners = [
      [`${landInfo.centerX - landSizeHalf},${landInfo.centerY - landSizeHalf}`],
      [`${landInfo.centerX - landSizeHalf},${landInfo.centerY + landSizeHalf}`],
      [`${landInfo.centerX + landSizeHalf},${landInfo.centerY - landSizeHalf}`],
      [`${landInfo.centerX + landSizeHalf},${landInfo.centerY + landSizeHalf}`]
    ];
    
    corners.forEach(corner => {
      const cornerRef = doc(fs, `lands/${corner}`);
      batch.set(cornerRef, {
        owner: newUserProfile.uid,
        claimedAt: now,
        isBorder: true,
        centerX: landInfo.centerX,
        centerY: landInfo.centerY
      });
    });
    
    await batch.commit();
    console.log(`Registered land at (${landInfo.centerX}, ${landInfo.centerY}) for user ${newUserProfile.uid}`);
  } catch (error) {
    console.error("Error claiming land:", error);
    // If land claiming fails, we should still return the user profile
    // The user can try again to claim land later
  }

  // Return profile without password details
  const { passwordHash, salt: userSalt, ...returnProfile } = newUserProfile;
  return returnProfile as UserProfile;
};

// Sign in existing user with custom logic
export const signInUser = async (email: string, password: string): Promise<UserProfile> => {
  const usersRef = collection(fs, "users");
  const q = query(usersRef, where("email", "==", email));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    throw new Error("auth/user-not-found");
  }

  const userDoc = querySnapshot.docs[0];
  const userData = userDoc.data() as UserProfile;

  if (!userData.passwordHash || !userData.salt) {
    console.error("User data is missing password hash or salt:", userData.uid);
    throw new Error("auth/internal-error-credentials-missing");
  }

  const hashedPassword = await insecureHashPassword(password, userData.salt); // INSECURE HASHING

  if (hashedPassword !== userData.passwordHash) {
    throw new Error("auth/wrong-password");
  }

  // Update last login timestamp
  await updateDoc(doc(fs, `users/${userData.uid}`), {
    lastLogin: Date.now(),
  });
  
  // Return profile without password details
  const { passwordHash: storedPasswordHash, salt, ...returnProfile } = userData;
  return returnProfile as UserProfile;
};

// Sign out (becomes a local operation)
export const signOutUser = async (): Promise<void> => {
  // In a real app, you might also call a backend to invalidate a session token
  console.log("Custom sign out: User signed out locally.");
  // Actual state clearing will be handled in AuthContext
};

// Get user profile from Firestore (remains largely the same)
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userRef = doc(fs, `users/${uid}`);
  const docSnap = await getDoc(userRef);
  
  if (docSnap.exists()) {
    const userData = docSnap.data() as UserProfile;
    // Ensure password details are not returned
    const { passwordHash, salt, ...profileToReturn } = userData;
    return profileToReturn as UserProfile;
  }
  return null;
};

// Update user profile in Firestore (remains largely the same)
export const updateUserProfile = async (uid: string, updates: Partial<Omit<UserProfile, 'passwordHash' | 'salt'>>): Promise<void> => {
  const userRef = doc(fs, `users/${uid}`);
  await updateDoc(userRef, { ...updates, lastUpdated: firestoreServerTimestamp() });
};

// getCurrentUser and subscribeToAuthChanges will be handled by AuthContext using local state
// as Firebase Auth's onAuthStateChanged will no longer be used for session management.
