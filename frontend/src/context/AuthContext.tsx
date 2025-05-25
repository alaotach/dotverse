import React, { createContext, useContext, useState, useEffect, ReactNode, FC } from 'react';
import { 
  signInUser as appSignInUser, 
  registerUser as appRegisterUser, 
  signOutUser as appSignOutUser,
  getUserProfile,
  UserProfile
} from '../services/authService';
import { analyticsService } from '../services/analyticsService';

export interface AppUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  landInfo?: {
    centerX: number;
    centerY: number;
    ownedSize: number;
  };
  role?: 'user' | 'admin';
  pixelsPlaced?: number;
  totalSessionTime?: number;
  lastActive?: any;
  createdAt?: number;
  lastLogin?: number;
}

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
  const [userProfile, setUserProfile] = useState<AppUserProfile | null>(null); 
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        const storedUserUID = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (storedUserUID) {
          console.log("Found stored user UID:", storedUserUID);
          const profile = await getUserProfile(storedUserUID);
          if (profile) {
            const appProfile: AppUserProfile = {
              uid: profile.uid,
              email: profile.email,
              displayName: profile.displayName,
              photoURL: profile.photoURL,
              landInfo: profile.landInfo,
              role: 'user', 
              pixelsPlaced: 0,
              totalSessionTime: 0,
              createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : profile.createdAt?.seconds * 1000,
              lastLogin: typeof profile.lastLogin === 'number' ? profile.lastLogin : profile.lastLogin?.seconds * 1000
            };
            setCurrentUser(appProfile);
            setUserProfile(appProfile);
            console.log("Restored user session:", appProfile);
            
            analyticsService.startSession(profile.uid);
          } else {
            console.log("No user profile found for stored UID, clearing storage");
            localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
          }
        }
      } catch (error) {
        console.error("Error initializing auth state from local storage:", error);
        localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      } finally {
        setIsLoading(false);
      }
    };
    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const profile = await appSignInUser(email, password);
      const appProfile: AppUserProfile = {
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        landInfo: profile.landInfo,
        role: 'user', 
        pixelsPlaced: 0, 
        totalSessionTime: 0, 
        createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : profile.createdAt?.seconds * 1000,
        lastLogin: typeof profile.lastLogin === 'number' ? profile.lastLogin : profile.lastLogin?.seconds * 1000
      };
      
      setCurrentUser(appProfile);
      setUserProfile(appProfile);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, profile.uid);
      
      await analyticsService.trackUserLogin(
        profile.uid,
        profile.displayName || profile.email || 'Unknown'
      );
      
      analyticsService.startSession(profile.uid);
      
      console.log("Custom login successful:", appProfile);
      console.log("Logged in user landInfo:", appProfile.landInfo);
    } catch (error) {
      console.error("Custom login error:", error);
      setCurrentUser(null);
      setUserProfile(null);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      throw error; 
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string) => {
    setIsLoading(true);
    try {
      const profile = await appRegisterUser(email, password, displayName);
      const appProfile: AppUserProfile = {
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        landInfo: profile.landInfo,
        role: 'user',
        pixelsPlaced: 0, 
        totalSessionTime: 0, 
        createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : profile.createdAt?.seconds * 1000,
        lastLogin: typeof profile.lastLogin === 'number' ? profile.lastLogin : profile.lastLogin?.seconds * 1000
      };
      
      setCurrentUser(appProfile);
      setUserProfile(appProfile);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, profile.uid);
      
      if (profile.landInfo) {
        await analyticsService.trackLandClaim(
          profile.uid,
          profile.displayName || profile.email || 'Unknown',
          profile.landInfo.centerX,
          profile.landInfo.centerY
        );
      }
      
      await analyticsService.trackUserLogin(
        profile.uid,
        profile.displayName || profile.email || 'Unknown'
      );
      
      analyticsService.startSession(profile.uid);
      
      console.log("Custom registration successful:", appProfile);
      console.log("Registered user landInfo:", appProfile.landInfo);
    } catch (error) {
      console.error("Custom registration error:", error);
      setCurrentUser(null);
      setUserProfile(null);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    
    if (currentUser) {
      await analyticsService.endSession(currentUser.uid);
    }
    
    await appSignOutUser();
    setCurrentUser(null);
    setUserProfile(null);
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    console.log("Custom logout: User logged out, local session cleared.");
    setIsLoading(false);
  };

  const value = {
    currentUser,
    userProfile,
    isLoading,
    login,
    register,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};