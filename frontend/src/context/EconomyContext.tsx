import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { economyService } from '../services/economyService';
import type { EconomyTransaction, UserEconomyData } from '../services/economyService';

interface EconomyContextType {
  userEconomy: Partial<UserEconomyData> | null;
  recentTransactions: EconomyTransaction[];
  isLoading: boolean;
  refreshEconomy: () => Promise<void>;
}

const EconomyContext = createContext<EconomyContextType | undefined>(undefined);

export const useEconomy = () => {
  const context = useContext(EconomyContext);
  if (!context) {
    throw new Error('useEconomy must be used within an EconomyProvider');
  }
  return context;
};

export const EconomyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [userEconomy, setUserEconomy] = useState<Partial<UserEconomyData> | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<EconomyTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshEconomy = async () => {
    if (!currentUser) return;
    
    setIsLoading(true);
    try {
      await economyService.initializeUserEconomy(currentUser.uid);
      
      const economy = await economyService.getUserEconomy(currentUser.uid);
      const transactions = await economyService.getRecentTransactions(currentUser.uid);
      
      setUserEconomy(economy);
      setRecentTransactions(transactions);
    } catch (error) {
      console.error('Error refreshing economy:', error);
      setUserEconomy({
        userId: currentUser.uid,
        balance: 0,
        totalEarned: 0,
        lifetimeStats: {
          likesReceived: 0,
          commentsReceived: 0,
          postsShared: 0
        }
      });
      setRecentTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setUserEconomy(null);
      setRecentTransactions([]);
      return;
    }

    const setupEconomy = async () => {
      try {
        await economyService.initializeUserEconomy(currentUser.uid);
        
        const unsubscribe = economyService.subscribeToUserEconomy(currentUser.uid, (data) => {
          setUserEconomy(data);
        });

        await refreshEconomy();
        
        return unsubscribe;
      } catch (error) {
        console.error('Error setting up economy:', error);
        return () => {};
      }
    };

    let unsubscribe: (() => void) | null = null;
    
    setupEconomy().then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      economyService.cleanup(currentUser.uid);
    };
  }, [currentUser]);

  const value = {
    userEconomy,
    recentTransactions,
    isLoading,
    refreshEconomy
  };

  return (
    <EconomyContext.Provider value={value}>
      {children}
    </EconomyContext.Provider>
  );
};