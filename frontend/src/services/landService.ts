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
import { fs } from "../firebaseClient"; // Import fs (Firestore)

interface LandInfo {
  centerX: number;
  centerY: number;
  ownedSize: number; // Current land size (width/height)
}

interface LandTile {
  owner: string;
  claimedAt: number;
}

const DEFAULT_LAND_SIZE = 50; // 100x100 pixels owned initially
const MIN_PARCEL_PADDING = 20; // Increased padding between land plots
const MAX_RANDOM_PLACEMENT_ATTEMPTS = 100; // Increased number of attempts for random placement
const MAX_LAND_DISTANCE = 500; // Increased maximum distance for land placement
const OPTIMAL_DISTANCE = 150; // Increased ideal distance between land centers

// Get the bounds of all allocated lands from Firestore
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
    // First check the dedicated lands collection
    const landsCollectionRef = collection(fs, 'lands');
    const q = firestoreQuery(landsCollectionRef, limit(1000)); 
    const querySnapshot = await getDocs(q);
    
    // Track all lands with their sizes
    const existingLands: {centerX: number, centerY: number, owner: string, ownedSize: number}[] = [];
    
    if (querySnapshot.empty) {
      console.log("No lands found in lands collection");
      
      // Check user profiles for land info as backup
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
      });
    } else {
      // Process lands from lands collection
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const [xStr, yStr] = doc.id.split(',').map(Number);
        
        // Only add if this appears to be a land center record with proper data
        if (!isNaN(xStr) && !isNaN(yStr) && data.owner && data.size) {
          existingLands.push({
            centerX: xStr,
            centerY: yStr,
            owner: data.owner,
            ownedSize: data.size
          });
        }
      });
      
      // Double check user profiles to make sure we have everything
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
          
          // Only add if we don't already have this center point
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
    
    // Calculate global min/max
    let globalMinX = Infinity, globalMaxX = -Infinity, globalMinY = Infinity, globalMaxY = -Infinity;
    
    existingLands.forEach(({centerX, centerY, ownedSize}) => {
      const halfSize = Math.floor(ownedSize / 2);
      globalMinX = Math.min(globalMinX, centerX - halfSize);
      globalMaxX = Math.max(globalMaxX, centerX + halfSize);
      globalMinY = Math.min(globalMinY, centerY - halfSize);
      globalMaxY = Math.max(globalMaxY, centerY + halfSize);
    });
    
    // If we found no lands, set default values
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
    // Return defaults in case of error
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, totalLands: 0, existingLands: [] };
  }
};

// Improved function to check if land overlaps with any existing land
const checkLandOverlap = (
  centerX: number, 
  centerY: number, 
  size: number, 
  existingLands: {centerX: number, centerY: number, ownedSize: number, owner: string}[]
): boolean => {
  // Calculate half-size for our plot
  const halfSize = Math.floor(size / 2);
  
  // For each existing land, check if our new land would overlap including padding
  for (const land of existingLands) {
    const existingHalfSize = Math.floor(land.ownedSize / 2);
    
    // Calculate the minimum distance needed between centers to avoid overlap with padding
    const minDistanceX = halfSize + existingHalfSize + MIN_PARCEL_PADDING;
    const minDistanceY = halfSize + existingHalfSize + MIN_PARCEL_PADDING;
    
    // Check if the distance between centers is less than minimum required
    const distanceX = Math.abs(centerX - land.centerX);
    const distanceY = Math.abs(centerY - land.centerY);
    
    if (distanceX < minDistanceX && distanceY < minDistanceY) {
      // Overlap detected
      return true;
    }
  }
  
  // No overlap found
  return false;
};

// Check if a land area is available (not owned by anyone) in Firestore
const isLandAvailable = async (
  centerX: number, 
  centerY: number, 
  size: number,
  existingLands: {centerX: number, centerY: number, ownedSize: number, owner: string}[]
): Promise<boolean> => {
  try {
    // First check against all existing lands we already know about
    if (checkLandOverlap(centerX, centerY, size, existingLands)) {
      console.log(`Land at (${centerX}, ${centerY}) overlaps with existing land`);
      return false;
    }
    
    // As a double-check, verify against the lands collection in Firestore
    const halfSize = Math.floor(size / 2);
    const cornerPoints = [
      [`${centerX - halfSize - MIN_PARCEL_PADDING},${centerY - halfSize - MIN_PARCEL_PADDING}`],
      [`${centerX - halfSize - MIN_PARCEL_PADDING},${centerY + halfSize + MIN_PARCEL_PADDING}`],
      [`${centerX + halfSize + MIN_PARCEL_PADDING},${centerY - halfSize - MIN_PARCEL_PADDING}`],
      [`${centerX + halfSize + MIN_PARCEL_PADDING},${centerY + halfSize + MIN_PARCEL_PADDING}`],
      [`${centerX},${centerY}`] // Also check center point
    ];
    
    // Check these corner points in Firestore
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
    return false; // Assume land is unavailable on error
  }
};

// Generate land coordinates for a new user with improved non-overlapping algorithm
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
  
  // Add randomness to avoid duplicate coordinates
  const randomSeed = Date.now() % 997; // Use a prime number for better distribution
  
  // If we have existing lands, try to place new land near them but not overlapping
  if (existingLands.length > 0) {
    console.log(`Trying to place land with padding ${MIN_PARCEL_PADDING} around ${existingLands.length} existing lands...`);
    
    // 1. Pick a random existing land as a reference point
    // Add some true randomness based on current time to prevent duplicate placements
    const randomIndex = (Math.floor(Math.random() * existingLands.length) + randomSeed) % existingLands.length;
    const referenceLand = existingLands[randomIndex];
    
    console.log(`Selected reference land at (${referenceLand.centerX}, ${referenceLand.centerY})`);
    
    // 2. Try positions around this land in increasing distance
    const directions = [
      { x: 1, y: 0 },    // right
      { x: 0, y: 1 },    // down
      { x: -1, y: 0 },   // left
      { x: 0, y: -1 },   // up
      { x: 1, y: 1 },    // down-right
      { x: -1, y: 1 },   // down-left
      { x: -1, y: -1 },  // up-left
      { x: 1, y: -1 }    // up-right
    ];
    
    // Shuffle directions array for randomness
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }
    
    // Try placing at optimal distance with varied attempts
    for (let attempt = 0; attempt < 30; attempt++) {
      const directionIndex = (attempt + randomSeed) % directions.length;
      const direction = directions[directionIndex];
      
      // Calculate distance multiplier (1.5-3.5) based on attempt number
      const distanceMultiplier = 1.5 + (attempt * 0.1);
      
      // Calculate potential position
      const potentialX = Math.round(referenceLand.centerX + direction.x * OPTIMAL_DISTANCE * distanceMultiplier);
      const potentialY = Math.round(referenceLand.centerY + direction.y * OPTIMAL_DISTANCE * distanceMultiplier);
      
      // Add true randomness to avoid fixed grid patterns
      const jitterX = Math.floor((Math.random() * 30) - 15);
      const jitterY = Math.floor((Math.random() * 30) - 15);
      
      const finalX = potentialX + jitterX;
      const finalY = potentialY + jitterY;
      
      console.log(`Trying position: (${finalX}, ${finalY}) [attempt ${attempt+1}/30]`);
      
      // Check if this position is available
      if (await isLandAvailable(finalX, finalY, landSize, existingLands)) {
        console.log(`Found available land near existing community at (${finalX}, ${finalY})`);
        return {
          centerX: finalX,
          centerY: finalY,
          ownedSize: landSize
        };
      }
    }
    
    // If optimal distance placement failed, try wider search
    console.log("Optimal distance placement failed, trying wider area...");
    
    // Define search area around the community center
    const communityCenter = {
      x: existingLands.reduce((sum, land) => sum + land.centerX, 0) / existingLands.length,
      y: existingLands.reduce((sum, land) => sum + land.centerY, 0) / existingLands.length
    };
    
    const searchRadius = Math.min(MAX_LAND_DISTANCE, 
                                Math.max(maxX - minX, maxY - minY) / 2 + landSize + MIN_PARCEL_PADDING);
    
    console.log(`Community center: (${communityCenter.x}, ${communityCenter.y}), Search radius: ${searchRadius}`);
    
    for (let attempt = 0; attempt < MAX_RANDOM_PLACEMENT_ATTEMPTS; attempt++) {
      // Random angle with seed
      const angle = Math.random() * Math.PI * 2 + (randomSeed / 997 * Math.PI);
      
      // Random distance within search radius (higher weight to outer edges for better spread)
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
  
  // Fallback to spiral search method
  console.log("Community placement methods failed, falling back to spiral search...");
  
  const communityCenter = existingLands.length > 0 ? {
      x: existingLands.reduce((sum, land) => sum + land.centerX, 0) / existingLands.length,
      y: existingLands.reduce((sum, land) => sum + land.centerY, 0) / existingLands.length
  } : { x: 0, y: 0 };
  
  // Add randomness to starting point
  const startX = communityCenter.x + (randomSeed % 50 - 25);
  const startY = communityCenter.y + ((randomSeed * 3) % 50 - 25);
  
  console.log(`Using spiral search from point (${startX}, ${startY})`);
  
  // Start a spiral search from a reasonable radius
  let currentRadius = 200; // Start at a reasonable distance
  let angle = (Math.random() + randomSeed / 997) * Math.PI * 2; // Random start angle
  const angleStep = Math.PI / 12; // 24 points around the circle for finer search
  const radiusStep = 50; // Larger steps between rings

  // Try a spiral pattern outward
  for (let i = 0; i < 40; i++) { // More rings
    for (let j = 0; j < 24; j++) { // More points on each ring
      const potentialX = Math.round(startX + currentRadius * Math.cos(angle));
      const potentialY = Math.round(startY + currentRadius * Math.sin(angle));
      
      // Add small jitter
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
    currentRadius += radiusStep; // Increase radius for the next ring
  }

  // Last resort: place very far out in a random direction
  console.log("All standard placement strategies failed. Using far random placement.");
  const randomAngle = Math.random() * Math.PI * 2;
  const farOutRadius = 2000 + (randomSeed % 1000); // At least 2000 units away from center
  const farX = Math.round(communityCenter.x + Math.cos(randomAngle) * farOutRadius);
  const farY = Math.round(communityCenter.y + Math.sin(randomAngle) * farOutRadius);
  
  console.log(`Placing land far away at: (${farX}, ${farY})`);
  return {
    centerX: farX,
    centerY: farY,
    ownedSize: landSize
  };
};

// Get all lands owned by a specific user from Firestore
export const getUserLands = async (userId: string): Promise<{x: number, y: number}[]> => {
  const landsCollectionRef = collection(fs, 'lands');
  const q = firestoreQuery(landsCollectionRef, where('owner', '==', userId));
  
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    return [];
  }
  
  return querySnapshot.docs.map(docSnap => {
    const [xStr, yStr] = docSnap.id.split(',');
    return { x: Number(xStr), y: Number(yStr) };
  });
};
