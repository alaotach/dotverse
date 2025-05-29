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
  writeBatch
} from "firebase/firestore";
import { fs, app } from "../firebaseClient"; 
import { generateUserLand } from "../services/landService";

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: number | Timestamp; 
  lastLogin: number | Timestamp;
  landInfo: {
    centerX: number;
    centerY: number;
    ownedSize: number;
  };
  passwordHash?: string;
  salt?: string;
}

const insecureHashPassword = async (password: string, salt: string): Promise<string> => {
  return `hashed_${password}_with_${salt}`;
};

const generateSalt = (): string => {
  return Math.random().toString(36).substring(2, 15);
};


export const registerUser = async (email: string, password: string, displayName: string): Promise<UserProfile> => {
  const usersRef = collection(fs, "users");
  const q = query(usersRef, where("email", "==", email));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    throw new Error("auth/email-already-in-use");
  }

  const now = Date.now();
  const salt = generateSalt();
  const hashedPassword = await insecureHashPassword(password, salt); 
  console.log("Generating unique land for new user...");
  const landInfo = await generateUserLand();
  console.log("Generated land info:", landInfo);
  const newUserRef = doc(collection(fs, "users")); 
  const newUserProfile: UserProfile = {
    uid: newUserRef.id,
    email,
    displayName,
    passwordHash: hashedPassword,
    salt,
    photoURL: null,
    createdAt: now,
    lastLogin: now,
    landInfo: {
      centerX: landInfo.centerX,
      centerY: landInfo.centerY,
      ownedSize: landInfo.ownedSize
    },
  };

  await setDoc(newUserRef, newUserProfile);
  console.log(`Created new user profile for ${newUserProfile.uid} with land at (${landInfo.centerX}, ${landInfo.centerY})`);
  
  try {
    const landSizeHalf = Math.floor(landInfo.ownedSize / 2);
    const batch = writeBatch(fs);
      const landCenterRef = doc(fs, `lands/${landInfo.centerX},${landInfo.centerY}`);
    batch.set(landCenterRef, {
      owner: newUserProfile.uid,
      claimedAt: now,
      ownedSize: landInfo.ownedSize
    });
    
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
  }

  const { passwordHash, salt: userSalt, ...returnProfile } = newUserProfile;
  return returnProfile as UserProfile;
};

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

  const hashedPassword = await insecureHashPassword(password, userData.salt); 

  if (hashedPassword !== userData.passwordHash) {
    throw new Error("auth/wrong-password");
  }

  await updateDoc(doc(fs, `users/${userData.uid}`), {
    lastLogin: Date.now(),
  });
  
  const { passwordHash: storedPasswordHash, salt, ...returnProfile } = userData;
  return returnProfile as UserProfile;
};

export const signOutUser = async (): Promise<void> => {
  console.log("Custom sign out: User signed out locally.");
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userRef = doc(fs, `users/${uid}`);
  const docSnap = await getDoc(userRef);
  
  if (docSnap.exists()) {
    const userData = docSnap.data() as UserProfile;
    const { passwordHash, salt, ...profileToReturn } = userData;
    return profileToReturn as UserProfile;
  }
  return null;
};

export const updateUserProfile = async (uid: string, updates: Partial<Omit<UserProfile, 'passwordHash' | 'salt'>>): Promise<void> => {
  const userRef = doc(fs, `users/${uid}`);
  await updateDoc(userRef, { ...updates, lastUpdated: firestoreServerTimestamp() });
};
