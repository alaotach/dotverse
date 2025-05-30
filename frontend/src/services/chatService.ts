import { collection, addDoc, query, orderBy, limit,Timestamp,serverTimestamp, onSnapshot} from 'firebase/firestore';
import {fs} from '../firebaseClient';

export interface ChatMessage {
    id: string;
    userId: string;
    username: string,
    msg: string,
    timestamp: Timestamp
}

class ChatService {
    private listeners: Map<string, () => void> = new Map();

    async sendMessage(userId:string, username: string, msg: string): Promise<void> {
        try{
            await addDoc(collection(fs, 'chat'), {
                userId,
                username,
                msg:msg.trim(),
                timestamp: serverTimestamp()
            });
        } catch (err) {
            console.error('error sending message: ', err);
            throw err;
        }
    }

    subscribeToMessages(callback: (msgs: ChatMessage[]) => void, msgsLimit: number =50): () => void {
        const msgsQuery = query(
            collection(fs, 'chat'),
            orderBy('timestamp', 'desc'),
            limit(msgsLimit)
        );
        const unsubscribe = onSnapshot(msgsQuery, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                userId: doc.data().userId,
                username: doc.data().username,
                msg: doc.data().msg,
                timestamp: doc.data().timestamp
            })).reverse();
            callback(msgs);
        });
        return unsubscribe;
    }
    cleanup(): void {
        this.listeners.forEach(unsubscribe => {
            unsubscribe();
        });
        this.listeners.clear();
    }
}

export const chatService = new ChatService();