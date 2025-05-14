import React, { createContext, useContext, useState, useEffect, FC, ReactNode } from 'react';
// Removed Firebase Auth imports like onAuthStateChanged, User as FirebaseUser
import { fs } from '../firebaseClient'; // Keep fs for direct Firestore ops if needed
import { doc, getDoc } from 'firebase/firestore';
import { 
    UserProfile as AppUserProfile, 
    registerUser as appRegisterUser, 
    signInUser as appSignInUser, 
    signOutUser as appSignOutUser,
    getUserProfile as appGetUserProfile
} from '../services/authService'; // authService now uses custom logic

// The User type from firebase/auth is no longer directly applicable for currentUser.
// We'll use our AppUserProfile.

export interface AuthContextType {
  currentUser: AppUserProfile | null; 
  userProfile: AppUserProfile | null; 
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

const LOCAL_STORAGE_USER_KEY = 'dotverse_user_uid';

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  // userProfile state might be merged with currentUser if currentUser holds the full AppUserProfile
  const [userProfile, setUserProfile] = useState<AppUserProfile | null>(null); 
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check local storage for a saved user session on initial load
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        const storedUserUID = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (storedUserUID) {
          console.log("Found stored UID:", storedUserUID);
          // Fetch the full user profile from Firestore
          const profile = await appGetUserProfile(storedUserUID);
          if (profile) {
            setCurrentUser(profile);
            setUserProfile(profile); // Keep both in sync for now
            console.log("User restored from local session:", profile);
            console.log("Restored user landInfo:", profile.landInfo); // Log landInfo
          } else {
            console.warn("Stored UID found, but profile not found in Firestore. Clearing session.");
            localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
          }
        }
      } catch (error) {
        console.error("Error initializing auth state from local storage:", error);
        localStorage.removeItem(LOCAL_STORAGE_USER_KEY); // Clear potentially corrupt session
      } finally {
        setIsLoading(false);
      }
    };
    initializeAuth();
  }, []);


  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const profile = await appSignInUser(email, password); // Uses custom signInUser
      setCurrentUser(profile);
      setUserProfile(profile);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, profile.uid);
      console.log("Custom login successful:", profile);
      console.log("Logged in user landInfo:", profile.landInfo); // Log landInfo
    } catch (error) {
      console.error("Custom login error:", error);
      setCurrentUser(null);
      setUserProfile(null);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      throw error; // Re-throw for the UI to handle
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string) => {
    setIsLoading(true);
    try {
      const profile = await appRegisterUser(email, password, displayName); // Uses custom registerUser
      setCurrentUser(profile);
      setUserProfile(profile);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, profile.uid);
      console.log("Custom registration successful:", profile);
      console.log("Registered user landInfo:", profile.landInfo); // Log landInfo
    } catch (error) {
      console.error("Custom registration error:", error);
      setCurrentUser(null);
      setUserProfile(null);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      throw error; // Re-throw for the UI to handle
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    await appSignOutUser(); // Custom signOutUser (currently just logs)
    setCurrentUser(null);
    setUserProfile(null);
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    console.log("Custom logout: User logged out, local session cleared.");
    setIsLoading(false);
  };

  const value = {
    currentUser,
    userProfile, // Keep this for now, can be refactored if currentUser holds all needed info
    isLoading,
    login,
    register,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
