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
  limit
} from "firebase/firestore";
import { fs } from "../firebaseClient"; 

interface LandInfo {
  centerX: number;
  centerY: number;
  ownedSize: number;
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
        
        // Skip border lands and only include center lands
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
    
    // Filter out border/corner lands and only return center lands
    return querySnapshot.docs
      .filter(docSnap => {
        const data = docSnap.data();
        // Only include lands that are NOT border lands (i.e., the main center lands)
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
    console.error('Error fetching user lands:', error);
    return [];
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
    
    // Filter out border/corner lands and only return center lands
    return querySnapshot.docs
      .filter(docSnap => {
        const data = docSnap.data();
        // Only include lands that are NOT border lands (i.e., the main center lands)
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
