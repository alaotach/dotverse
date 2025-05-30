import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { chatService, ChatMessage } from '../services/chatService';
import { set } from 'firebase/database';

interface ChatContextType {
    msgs: ChatMessage[];
    unreadCount: number;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    sendMessage: (msg: string) => Promise<void>;
    markAllAsRead: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context){
        throw new Error('useChat must be within a ChatProvider.')
    }
    return context;
};

export const ChatProvider: React.FC<{ children: ReactNode}> = ({ children }) => {
    const { currentUser, userProfile} = useAuth();
    const [msgs, setMsgs] = useState<ChatMessage[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(Date.now());

    useEffect(() => {
        if(!currentUser){
            setMsgs([]);
            setUnreadCount(0);
            return;
        }
        const unsubscribe = chatService.subscribeToMessages((newMsgs) => {
            setMsgs(newMsgs);

            if (!isOpen) {
                const newCount = newMsgs.filter(
                    msg => msg.userId !== currentUser.uid &&
                    msg.timestamp.toMillis() > lastReadTimestamp
                ).length;
                setUnreadCount(newCount);
            } else {
                setUnreadCount(0);
                setLastReadTimestamp(Date.now());
            }
        });
        return () => {
            unsubscribe();
        };
    }, [currentUser, isOpen]);

    useEffect(() => {
        if (isOpen) {
            setUnreadCount(0);
            setLastReadTimestamp(Date.now());
        }
    }, [isOpen]);

    const sendMessage = async (message: string) => {
        if (!currentUser || !message.trim()) return;

        try {
        await chatService.sendMessage(
            currentUser.uid,
            userProfile?.displayName || 'Anonymous', 
            message
        );
        } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
        }
    };

    const markAllAsRead = () => {
        setUnreadCount(0);
        setLastReadTimestamp(Date.now());
    };

    const value = {
        msgs,
        unreadCount,
        isOpen,
        setIsOpen,
        sendMessage,
        markAllAsRead
    };

    return (
        <ChatContext.Provider value={value}>
        {children}
        </ChatContext.Provider>
    );
}