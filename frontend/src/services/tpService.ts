import { doc, setDoc, updateDoc, collection, query, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { fs } from '../firebaseClient';

export interface SavedLocations {
    id: string;
    userId: string;
    name: string;
    x: number;
    y: number;
    createdAt: number;
    landId?: string;
    landOwner?: string;
    notes?: string; 
}

class TpService {
    async saveLocation(userId: string, location: Omit<SavedLocations, 'id' | 'userId' | 'createdAt'>): Promise<string> {
        try {
            const locationsCollection = collection(fs, 'users', userId, 'savedLocations');
            const newLocation = {
                ...location,
                userId,
                createdAt: Date.now(),
            };
            const docRef = await setDoc(doc(locationsCollection), newLocation);
            return docRef.id;
        } catch (error) {
            console.error("Error saving location:", error);
            throw new Error("Failed to save location");
        }
    }

    async getLocations(userId: string): Promise<SavedLocations[]> {
        try {
            const locationsCollection = collection(fs, 'users', userId, 'savedLocations');
            const q = query(locationsCollection, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedLocations));
        } catch (error) {
            console.error("Error fetching locations:", error);
            throw new Error("Failed to fetch locations");
        }
    }

    async updateLocation(userId: string, locationId: string, updates: Partial<Omit<SavedLocations, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
        try {
            const locationRef = doc(fs, 'users', userId, 'savedLocations', locationId);
            await updateDoc(locationRef, updates);
        } catch (error) {
            console.error("Error updating location:", error);
            throw new Error("Failed to update location");
        }
    }

    async deleteLocation(userId: string, locationId: string): Promise<void> {
        try {
            const locationRef = doc(fs, 'users', userId, 'savedLocations', locationId);
            await deleteDoc(locationRef);
        } catch (error) {
            console.error("Error deleting location:", error);
            throw new Error("Failed to delete location");
        }
    }
}

export const tpService = new TpService();