const { writeFileSync, readdirSync, statSync } = require('fs');
const { join, extname, basename } = require('path');

const STICKER_PACKS_DIR = '../public/assets/stickers/';
const OUTPUT_FILE = './src/data/stickerPacks.json';
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
        const stickerId = `${folderName}_${stickerIndex}`;
        
        stickers.push({
          id: stickerId,
          packId: folderName,
          url: `/src/assets/stickers/${folderName}/${fileName}`,
          name: stickerName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        });
      });
      
      const thumbnailUrl = stickers[0]?.url || '';
      
      const pack = {
        id: folderName,
        name: folderName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: `${stickers.length} awesome stickers in the ${folderName} pack`,
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

function main() {
  console.log('Generating sticker packs from assets...');
  
  const packs = generateStickerPacks();
  
  if (packs.length === 0) {
    console.log('No sticker packs found. Make sure you have sticker folders in:', STICKER_PACKS_DIR);
    return;
  }
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(packs, null, 2));
  
  console.log(`Generated ${packs.length} sticker packs:`);
  packs.forEach(pack => {
    console.log(`- ${pack.name}: ${pack.stickers.length} stickers`);
  });
  
  console.log(`Sticker data written to: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateStickerPacks };