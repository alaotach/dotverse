import { 
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query as firestoreQuery,
  where,
  getDocs,
  writeBatch,
  limit,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  deleteDoc
} from "firebase/firestore";
import { fs } from "../firebaseClient"; 

export interface LandFramePixelData {
  [relativeCoord: string]: string;
}

export interface LandFrame {
  id: string;
  frameIndex: number;
  duration: number;
  pixelData: LandFramePixelData;
  createdAt: number;
}

interface LandInfo {
  centerX: number;
  centerY: number;
  ownedSize: number;
  owner?: string
  displayName?: string;
  isEmpty?: boolean;
  isAuctioned?: boolean;
  auctionId?: string;
  shape?: 'rectangle' | 'irregular';
  occupiedCells?: string[];
  hasAnimation?: boolean;
  animationSettings?: {
    fps: number;
    loop: boolean;
  };
}

interface LandTile {
  owner: string;
  claimedAt: number;
}

export interface UserLandInfo {
  id: string;
  centerX: number;
  centerY: number;
  ownedSize: number;
  owner: string;
  displayName?: string;
  createdAt: number;
  isAuctioned?: boolean;
  auctionId?: string;
  shape?: 'rectangle' | 'irregular';
  occupiedCells?: string[];
  hasAnimation?: boolean;
  animationSettings?: {
    fps: number;
    loop: boolean;
  };
}

const DEFAULT_LAND_SIZE = 50;
const MIN_PARCEL_PADDING = 20;
const MAX_RANDOM_PLACEMENT_ATTEMPTS = 100;
const MAX_LAND_DISTANCE = 500; 
const OPTIMAL_DISTANCE = 150; 

const getLandBoundaries = async (): Promise<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  totalLands: number;
  existingLands: {centerX: number, centerY: number, owner: string, ownedSize: number}[];
}> => {
  try {
    console.log("Fetching all land plots from database...");
    const landsCollectionRef = collection(fs, 'lands');
    const q = firestoreQuery(landsCollectionRef, limit(1000)); 
    const querySnapshot = await getDocs(q);
    
    const existingLands: {centerX: number, centerY: number, owner: string, ownedSize: number}[] = [];
    
    if (querySnapshot.empty) {
      console.log("No lands found in lands collection");
      
      const usersRef = collection(fs, 'users');
      const userQuery = firestoreQuery(usersRef);
      const usersSnapshot = await getDocs(userQuery);
      
      usersSnapshot.forEach(userDoc => {
        const userData = userDoc.data();
        
        if (userData?.landInfo?.centerX !== undefined && 
            userData?.landInfo?.centerY !== undefined &&
            userData?.landInfo?.ownedSize) {
          
          existingLands.push({
            centerX: userData.landInfo.centerX,
            centerY: userData.landInfo.centerY,
            owner: userDoc.id,
            ownedSize: userData.landInfo.ownedSize
          });
        }
      });    } else {
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const [xStr, yStr] = doc.id.split(',').map(Number);
        
        if (!isNaN(xStr) && !isNaN(yStr) && data.owner && !data.isBorder && (data.size || data.ownedSize)) {
          existingLands.push({
            centerX: xStr,
            centerY: yStr,
            owner: data.owner,
            ownedSize: data.ownedSize || data.size
          });
        }
      });
      
      const usersRef = collection(fs, 'users');
      const userQuery = firestoreQuery(usersRef);
      const usersSnapshot = await getDocs(userQuery);
      
      const existingCenters = new Set(existingLands.map(land => `${land.centerX},${land.centerY}`));
      
      usersSnapshot.forEach(userDoc => {
        const userData = userDoc.data();
        
        if (userData?.landInfo?.centerX !== undefined && 
            userData?.landInfo?.centerY !== undefined &&
            userData?.landInfo?.ownedSize) {
          
          const centerKey = `${userData.landInfo.centerX},${userData.landInfo.centerY}`;
          
          if (!existingCenters.has(centerKey)) {
            existingLands.push({
              centerX: userData.landInfo.centerX,
              centerY: userData.landInfo.centerY,
              owner: userDoc.id,
              ownedSize: userData.landInfo.ownedSize
            });
          }
        }
      });
    }
    
    console.log(`Found ${existingLands.length} distinct land plots`);
    
    let globalMinX = Infinity, globalMaxX = -Infinity, globalMinY = Infinity, globalMaxY = -Infinity;
    
    existingLands.forEach(({centerX, centerY, ownedSize}) => {
      const halfSize = Math.floor(ownedSize / 2);
      globalMinX = Math.min(globalMinX, centerX - halfSize);
      globalMaxX = Math.max(globalMaxX, centerX + halfSize);
      globalMinY = Math.min(globalMinY, centerY - halfSize);
      globalMaxY = Math.max(globalMaxY, centerY + halfSize);
    });
    
    if (existingLands.length === 0) {
      globalMinX = 0;
      globalMaxX = 0;
      globalMinY = 0;
      globalMaxY = 0;
    }
    
    return {
      minX: globalMinX,
      maxX: globalMaxX,
      minY: globalMinY,
      maxY: globalMaxY,
      totalLands: existingLands.length,
      existingLands
    };
  } catch (error) {
    console.error("Error fetching land boundaries:", error);
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, totalLands: 0, existingLands: [] };
  }
};

const checkLandOverlap = (
  centerX: number, 
  centerY: number, 
  size: number, 
  existingLands: {centerX: number, centerY: number, ownedSize: number, owner: string}[]
): boolean => {
  const halfSize = Math.floor(size / 2);
  
  for (const land of existingLands) {
    const existingHalfSize = Math.floor(land.ownedSize / 2);
    
    const minDistanceX = halfSize + existingHalfSize + MIN_PARCEL_PADDING;
    const minDistanceY = halfSize + existingHalfSize + MIN_PARCEL_PADDING;
    
    const distanceX = Math.abs(centerX - land.centerX);
    const distanceY = Math.abs(centerY - land.centerY);
    
    if (distanceX < minDistanceX && distanceY < minDistanceY) {
      return true;
    }
  }
  
  return false;
};

const isLandAvailable = async (
  centerX: number, 
  centerY: number, 
  size: number,
  existingLands: {centerX: number, centerY: number, ownedSize: number, owner: string}[]
): Promise<boolean> => {
  try {
    if (checkLandOverlap(centerX, centerY, size, existingLands)) {
      console.log(`Land at (${centerX}, ${centerY}) overlaps with existing land`);
      return false;
    }
    
    const halfSize = Math.floor(size / 2);
    const cornerPoints = [
      [`${centerX - halfSize - MIN_PARCEL_PADDING},${centerY - halfSize - MIN_PARCEL_PADDING}`],
      [`${centerX - halfSize - MIN_PARCEL_PADDING},${centerY + halfSize + MIN_PARCEL_PADDING}`],
      [`${centerX + halfSize + MIN_PARCEL_PADDING},${centerY - halfSize - MIN_PARCEL_PADDING}`],
      [`${centerX + halfSize + MIN_PARCEL_PADDING},${centerY + halfSize + MIN_PARCEL_PADDING}`],
      [`${centerX},${centerY}`]
    ];
    
    for (const pointKey of cornerPoints) {
      const tileRef = doc(fs, `lands/${pointKey}`);
      const tileSnap = await getDoc(tileRef);
      if (tileSnap.exists()) {
        console.log(`Land unavailable: Tile ${pointKey} already claimed`);
        return false;
      }
    }
    
    console.log(`Land at (${centerX}, ${centerY}) is AVAILABLE`);
    return true;
  } catch (error) {
    console.error("Error checking land availability:", error);
    return false;
  }
};

export const getLandMergeHistory = async (landId: string): Promise<any[]> => {
  try {
    const landRef = doc(fs, 'lands', landId);
    const landDoc = await getDoc(landRef);
    
    if (landDoc.exists()) {
      const data = landDoc.data();
      return data.mergeHistory || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error getting land merge history:', error);
    return [];
  }
};


export const updateLandAfterMerge = async (
  landId: string, 
  newCenterX: number, 
  newCenterY: number, 
  newSize: number,
  mergedFromIds: string[]
): Promise<void> => {
  try {
    const landRef = doc(fs, 'lands', landId);
    await updateDoc(landRef, {
      centerX: newCenterX,
      centerY: newCenterY,
      ownedSize: newSize,
      lastMerged: new Date(),
      mergedFrom: mergedFromIds
    });
  } catch (error) {
    console.error('Error updating land after merge:', error);
    throw error;
  }
};

export const generateUserLand = async (): Promise<LandInfo> => {
  console.log("Generating new user land...");
  const { minX, maxX, minY, maxY, totalLands, existingLands } = await getLandBoundaries();
  
  const landSize = DEFAULT_LAND_SIZE;
  
  if (totalLands === 0) {
    console.log("First land, placing at origin.");
    return {
      centerX: 0,
      centerY: 0,
      ownedSize: landSize
    };
  }
  
  const randomSeed = Date.now() % 997; 
  
  if (existingLands.length > 0) {
    console.log(`Trying to place land with padding ${MIN_PARCEL_PADDING} around ${existingLands.length} existing lands...`);
    
    const randomIndex = (Math.floor(Math.random() * existingLands.length) + randomSeed) % existingLands.length;
    const referenceLand = existingLands[randomIndex];
    
    console.log(`Selected reference land at (${referenceLand.centerX}, ${referenceLand.centerY})`);
    
    const directions = [
      { x: 1, y: 0 },    
      { x: 0, y: 1 },    
      { x: -1, y: 0 },   
      { x: 0, y: -1 },  
      { x: 1, y: 1 },   
      { x: -1, y: 1 },   
      { x: -1, y: -1 }, 
      { x: 1, y: -1 }    
    ];
    
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }
    
    for (let attempt = 0; attempt < 30; attempt++) {
      const directionIndex = (attempt + randomSeed) % directions.length;
      const direction = directions[directionIndex];
      
      const distanceMultiplier = 1.5 + (attempt * 0.1);
      
      const potentialX = Math.round(referenceLand.centerX + direction.x * OPTIMAL_DISTANCE * distanceMultiplier);
      const potentialY = Math.round(referenceLand.centerY + direction.y * OPTIMAL_DISTANCE * distanceMultiplier);
      
      const jitterX = Math.floor((Math.random() * 30) - 15);
      const jitterY = Math.floor((Math.random() * 30) - 15);
      
      const finalX = potentialX + jitterX;
      const finalY = potentialY + jitterY;
      
      console.log(`Trying position: (${finalX}, ${finalY}) [attempt ${attempt+1}/30]`);
      
      if (await isLandAvailable(finalX, finalY, landSize, existingLands)) {
        console.log(`Found available land near existing community at (${finalX}, ${finalY})`);
        return {
          centerX: finalX,
          centerY: finalY,
          ownedSize: landSize
        };
      }
    }
    
    console.log("Optimal distance placement failed, trying wider area...");
    
    const communityCenter = {
      x: existingLands.reduce((sum, land) => sum + land.centerX, 0) / existingLands.length,
      y: existingLands.reduce((sum, land) => sum + land.centerY, 0) / existingLands.length
    };
    
    const searchRadius = Math.min(MAX_LAND_DISTANCE, 
                                Math.max(maxX - minX, maxY - minY) / 2 + landSize + MIN_PARCEL_PADDING);
    
    console.log(`Community center: (${communityCenter.x}, ${communityCenter.y}), Search radius: ${searchRadius}`);
    
    for (let attempt = 0; attempt < MAX_RANDOM_PLACEMENT_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2 + (randomSeed / 997 * Math.PI);
      
      const distance = Math.sqrt(0.5 + Math.random() * 0.5) * searchRadius;
      
      const finalX = Math.round(communityCenter.x + Math.cos(angle) * distance);
      const finalY = Math.round(communityCenter.y + Math.sin(angle) * distance);
      
      console.log(`Trying wider area position: (${finalX}, ${finalY}) [attempt ${attempt+1}/${MAX_RANDOM_PLACEMENT_ATTEMPTS}]`);
      
      if (await isLandAvailable(finalX, finalY, landSize, existingLands)) {
        console.log(`Found available land in wider community area at (${finalX}, ${finalY})`);
        return {
          centerX: finalX,
          centerY: finalY,
          ownedSize: landSize
        };
      }
    }
  }
  
  console.log("Community placement methods failed, falling back to spiral search...");
  
  const communityCenter = existingLands.length > 0 ? {
      x: existingLands.reduce((sum, land) => sum + land.centerX, 0) / existingLands.length,
      y: existingLands.reduce((sum, land) => sum + land.centerY, 0) / existingLands.length
  } : { x: 0, y: 0 };
  
  const startX = communityCenter.x + (randomSeed % 50 - 25);
  const startY = communityCenter.y + ((randomSeed * 3) % 50 - 25);
  
  console.log(`Using spiral search from point (${startX}, ${startY})`);
  
  let currentRadius = 200; 
  let angle = (Math.random() + randomSeed / 997) * Math.PI * 2; 
  const angleStep = Math.PI / 12; 
  const radiusStep = 50; 

  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 24; j++) {
      const potentialX = Math.round(startX + currentRadius * Math.cos(angle));
      const potentialY = Math.round(startY + currentRadius * Math.sin(angle));
      
      const jitterX = Math.floor((Math.random() * 20) - 10);
      const jitterY = Math.floor((Math.random() * 20) - 10);
      const finalX = potentialX + jitterX;
      const finalY = potentialY + jitterY;
      
      console.log(`Trying spiral position: (${finalX}, ${finalY}) [radius=${currentRadius}, angle=${(angle/(Math.PI)*180).toFixed(1)}°]`);
      
      if (await isLandAvailable(finalX, finalY, landSize, existingLands)) {
        console.log(`Found available land via spiral: (${finalX}, ${finalY})`);
        return {
          centerX: finalX,
          centerY: finalY,
          ownedSize: landSize
        };
      }
      angle += angleStep;
    }
    currentRadius += radiusStep; 
  }

  console.log("All standard placement strategies failed. Using far random placement.");
  const randomAngle = Math.random() * Math.PI * 2;
  const farOutRadius = 2000 + (randomSeed % 1000);
  const farX = Math.round(communityCenter.x + Math.cos(randomAngle) * farOutRadius);
  const farY = Math.round(communityCenter.y + Math.sin(randomAngle) * farOutRadius);
  
  console.log(`Placing land far away at: (${farX}, ${farY})`);
  return {
    centerX: farX,
    centerY: farY,
    ownedSize: landSize
  };
};

export const getUserLands = async (userId: string): Promise<UserLandInfo[]> => {
  try {
    const landsCollectionRef = collection(fs, 'lands');
    const q = firestoreQuery(landsCollectionRef, where('owner', '==', userId));
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return [];
    }
    
    console.log(`🎬 [Service] getUserLands for ${userId} found ${querySnapshot.docs.length} documents.`);
    return querySnapshot.docs
      .filter(docSnap => {
        const data = docSnap.data();
        return !data.isBorder;
      })
      .map(docSnap => {
        const data = docSnap.data();
        const [xStr, yStr] = docSnap.id.split(',');
        const land = {
          id: docSnap.id,
          centerX: Number(xStr),
          centerY: Number(yStr),
          ownedSize: data.ownedSize || data.size || DEFAULT_LAND_SIZE,
          owner: data.owner,
          displayName: data.displayName,
          createdAt: data.claimedAt || Date.now(),
          isAuctioned: data.isAuctioned || false,
          auctionId: data.auctionId,
          hasAnimation: data.hasAnimation || false,
          animationSettings: data.animationSettings
        } as UserLandInfo;
        console.log(`🎬 [Service] getUserLands mapping land ${land.id}. AnimationSettings:`, JSON.stringify(land.animationSettings));
        return land;
      });
  } catch (error) {
    console.error('Error fetching user lands:', error);
    return [];
  }
};

export const getLandById = async (landId: string): Promise<UserLandInfo | null> => {
  try {
    console.log(`🎬 [Service] getLandById attempting to fetch land: ${landId}`);
    const landDocRef = doc(fs, 'lands', landId);
    const docSnap = await getDoc(landDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.isBorder) {
        console.log(`🎬 [Service] getLandById found land ${landId}, but it's a border.`);
        return null;
      }
      const [xStr, yStr] = docSnap.id.split(',');
      const land = {
        id: docSnap.id,
        centerX: Number(xStr),
        centerY: Number(yStr),
        ownedSize: data.ownedSize || data.size || DEFAULT_LAND_SIZE,
        owner: data.owner,
        displayName: data.displayName,
        createdAt: data.claimedAt || Date.now(),
        isAuctioned: data.isAuctioned || false,
        auctionId: data.auctionId,
        hasAnimation: data.hasAnimation || false,
        animationSettings: data.animationSettings
      } as UserLandInfo;
      console.log(`🎬 [Service] getLandById successfully fetched land ${landId}. AnimationSettings:`, JSON.stringify(land.animationSettings));
      return land;
    } else {
      console.log(`🎬 [Service] getLandById: No such document for land ${landId}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching land by ID ${landId}:`, error);
    return null;
  }
};

export const updateLandName = async (landId: string, displayName: string): Promise<void> => {
  try {
    const landDocRef = doc(fs, 'lands', landId);
    await updateDoc(landDocRef, { displayName });
  } catch (error) {
    console.error('Error updating land name:', error);
    throw error;
  }
};

export const getAllLandsWithAuctionStatus = async (): Promise<UserLandInfo[]> => {
  try {
    const landsCollectionRef = collection(fs, 'lands');
    const querySnapshot = await getDocs(landsCollectionRef);
    
    return querySnapshot.docs
      .filter(docSnap => {
        const data = docSnap.data();
        return !data.isBorder;
      })
      .map(docSnap => {
        const data = docSnap.data();
        const [xStr, yStr] = docSnap.id.split(',');
        return {
          id: docSnap.id,
          centerX: Number(xStr),
          centerY: Number(yStr),
          ownedSize: data.ownedSize || data.size || DEFAULT_LAND_SIZE,
          owner: data.owner,
          displayName: data.displayName,
          createdAt: data.claimedAt || Date.now(),
          isAuctioned: data.isAuctioned || false,
          auctionId: data.auctionId
        } as UserLandInfo;
      });
  } catch (error) {
    console.error('Error fetching all lands:', error);
    return [];
  }
};

export const markLandAsAuctioned = async (landId: string, auctionId: string): Promise<void> => {
  try {
    const landDocRef = doc(fs, 'lands', landId);
    await updateDoc(landDocRef, { 
      isAuctioned: true,
      auctionId: auctionId
    });
  } catch (error) {
    console.error('Error marking land as auctioned:', error);
    throw error;
  }
};

export const unmarkLandAsAuctioned = async (landId: string): Promise<void> => {
  try {
    const landDocRef = doc(fs, 'lands', landId);
    await updateDoc(landDocRef, { 
      isAuctioned: false,
      auctionId: null
    });
  } catch (error) {
    console.error('Error unmarking land as auctioned:', error);
    throw error;
  }
};


export const updateLandAnimationSettings = async (
  landId: string,
  settings: UserLandInfo['animationSettings'],
  hasAnimation: boolean
): Promise<void> => {
  try {
    const dataToUpdate = {
      hasAnimation,
      animationSettings: {
        fps: settings?.fps || 5,
        loop: settings?.loop !== false,
      },
    };
    console.log(`🎬 [Service] Updating land ${landId} with data:`, JSON.stringify(dataToUpdate));
    const landRef = doc(fs, 'lands', landId);
    await updateDoc(landRef, dataToUpdate);
    console.log('🎬 [Service] Animation settings updated successfully for land:', landId);
  } catch (error) {
    console.error('Error updating animation settings:', error);
    throw error;
  }
};

export const addLandFrame = async (
  landId: string,
  frameData: Omit<LandFrame, 'id' | 'createdAt'>
): Promise<string> => {
  try {
    console.log(`🎬 [LandService] Adding frame to land ${landId}:`, frameData);
    console.log(`🎬 [LandService] Frame pixel data:`, frameData.pixelData);
    console.log(`🎬 [LandService] Pixel count: ${Object.keys(frameData.pixelData || {}).length}`);
    
    const framesCollectionRef = collection(fs, 'lands', landId, 'frames');
    const newFrameDoc = await addDoc(framesCollectionRef, {
      ...frameData,
      createdAt: serverTimestamp(),
    });
    console.log(`🎬 [LandService] Added frame ${newFrameDoc.id} to land ${landId} successfully`);
    return newFrameDoc.id;
  } catch (error) {
    console.error(`[LandService] Error adding frame to land ${landId}:`, error);
    throw error;
  }
};

export const getLandFrames = async (landId: string): Promise<LandFrame[]> => {
  try {
    console.log(`🎬 [LandService] Fetching frames for land ${landId}`);
    const framesCollectionRef = collection(fs, 'lands', landId, 'frames');
    const q = query(framesCollectionRef, orderBy('frameIndex', 'asc'));
    const snapshot = await getDocs(q);
    
    console.log(`🎬 [LandService] Found ${snapshot.docs.length} frame documents for land ${landId}`);
    
    const frames = snapshot.docs.map(docSnap => {
      const docData = docSnap.data();
      console.log(`🎬 [LandService] Processing frame doc ${docSnap.id}:`, docData);
      
      const frame = {
        id: docSnap.id,
        ...docData,
        pixelData: docData.pixelData || {},
      } as LandFrame;
      
      console.log(`🎬 [LandService] Processed frame ${docSnap.id}: ${Object.keys(frame.pixelData).length} pixels`);
      return frame;
    });
    
    console.log(`🎬 [LandService] Returning ${frames.length} frames for land ${landId}`);
    frames.forEach((frame, index) => {
      console.log(`🎬 [LandService] Frame ${index}: ID=${frame.id}, FrameIndex=${frame.frameIndex}, Pixels=${Object.keys(frame.pixelData).length}`);
    });
    
    return frames;
  } catch (error) {
    console.error(`[LandService] Error fetching frames for land ${landId}:`, error);
    return [];
  }
};

export const updateLandFrame = async (
  landId: string,
  frameId: string,
  updates: Partial<Omit<LandFrame, 'id' | 'landId' | 'createdAt' | 'pixelData'>> 
): Promise<void> => {
  try {
    const frameRef = doc(fs, 'lands', landId, 'frames', frameId);
    await updateDoc(frameRef, updates);
    console.log(`[LandService] Updated frame ${frameId} for land ${landId}`);
  } catch (error) {
    console.error(`[LandService] Error updating frame ${frameId} for land ${landId}:`, error);
    throw error;
  }
};

export const updateLandFramePixelData = async (
  landId: string,
  frameId: string,
  pixelData: LandFramePixelData
): Promise<void> => {
   try {
    const frameRef = doc(fs, 'lands', landId, 'frames', frameId);
    await updateDoc(frameRef, { pixelData });
    console.log(`[LandService] Updated pixelData for frame ${frameId} on land ${landId}`);
  } catch (error) {
    console.error(`[LandService] Error updating pixelData for frame ${frameId} on land ${landId}:`, error);
    throw error;
  }
};

export const deleteLandFrame = async (landId: string, frameId: string): Promise<void> => {
  try {
    const frameRef = doc(fs, 'lands', landId, 'frames', frameId);
    await deleteDoc(frameRef);
    console.log(`[LandService] Deleted frame ${frameId} from land ${landId}`);
  } catch (error) {
    console.error(`[LandService] Error deleting frame ${frameId} from land ${landId}:`, error);
    throw error;
  }
};