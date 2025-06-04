const { writeFileSync, readdirSync, statSync } = require('fs');
const { join, extname, basename } = require('path');

const STICKER_PACKS_DIR = './public/assets/stickers/';
const OUTPUT_FILE = './src/data/stickerPacks.json';
const STICKER_MARKETPLACE_ITEMS_OUTPUT_FILE = './src/data/generatedStickerMarketplaceItems.json';
const PACK_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

function generateStickerPacks() {
  const packs = [];
  
  try {
    const packFolders = readdirSync(STICKER_PACKS_DIR);
    
    packFolders.forEach((folderName, index) => {
      const folderPath = join(STICKER_PACKS_DIR, folderName);
      
      if (!statSync(folderPath).isDirectory()) return;
      
      const stickers = [];
      const stickerFiles = readdirSync(folderPath);
      
      const imageFiles = stickerFiles.filter(file => {
        const ext = extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
      });
      
      if (imageFiles.length === 0) return; 
      imageFiles.forEach((fileName, stickerIndex) => {
        const stickerName = basename(fileName, extname(fileName));
        const safeFolderName = folderName.replace(/[^a-zA-Z0-9_]/g, '_');
        const stickerId = `${safeFolderName}_${stickerIndex}`;
        
        stickers.push({
          id: stickerId,
          packId: folderName,
          url: `/assets/stickers/${folderName}/${fileName}`,
          name: stickerName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        });
      });
      
      const thumbnailUrl = stickers[0]?.url || '';
      
      const pack = {
        id: folderName,
        name: folderName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: `${stickers.length} awesome stickers in the ${folderName.replace(/[-_]/g, ' ')} pack`,
        thumbnailUrl,
        stickers,
        baseColor: PACK_COLORS[index % PACK_COLORS.length]
      };
      
      packs.push(pack);
    });
    
    return packs;
    
  } catch (error) {
    console.error('Error generating sticker packs:', error);
    return [];
  }
}

function generateStickerMarketplaceData(packs) {
  const marketplaceItems = packs.map(pack => {
    const itemCount = pack.stickers.length;
    let price = 100; 
    if (pack.id.toLowerCase() === 'kawaii') {
      price = 0;
    }

    return {
      id: `sticker_pack_${pack.id}`,
      name: `${pack.name} Sticker Pack`,
      description: pack.description || `${itemCount} awesome stickers in the ${pack.name} pack.`,
      category: 'stickers',
      price: price,
      icon: '🧩',
      thumbnailUrl: pack.thumbnailUrl || (pack.stickers[0] ? pack.stickers[0].url : ''),
      isActive: true,
      features: [`${itemCount} unique stickers`, 'High quality images'],
      metadata: { packId: pack.id, stickerCount: itemCount },
      rarity: 'common',
    };
  });
  return marketplaceItems;
}

function main() {
  console.log('Generating sticker packs from assets...');
  const packs = generateStickerPacks();
  
  if (packs.length === 0) {
    console.log('No sticker packs found. Make sure you have sticker folders in:', STICKER_PACKS_DIR);
  }
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(packs, null, 2));
  console.log(`Generated ${packs.length} sticker packs. Data written to: ${OUTPUT_FILE}`);
  
  console.log('Generating sticker marketplace items...');
  const stickerMarketplaceItems = generateStickerMarketplaceData(packs);
  writeFileSync(STICKER_MARKETPLACE_ITEMS_OUTPUT_FILE, JSON.stringify(stickerMarketplaceItems, null, 2));
  console.log(`Generated ${stickerMarketplaceItems.length} sticker marketplace items. Data written to: ${STICKER_MARKETPLACE_ITEMS_OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateStickerPacks, generateStickerMarketplaceData };