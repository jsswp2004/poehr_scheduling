const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function optimizeAllImages() {
  const assetsDir = path.join(__dirname, 'src', 'assets');
  const backupDir = path.join(assetsDir, 'backup');
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Get all PNG files in assets directory (excluding backup folder)
  const pngFiles = fs.readdirSync(assetsDir)
    .filter(file => file.endsWith('.png') && file !== 'backup')
    .map(file => path.join(assetsDir, file));

  console.log('Found PNG files to optimize:', pngFiles.length);

  for (const filePath of pngFiles) {
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;
    
    console.log(`\nProcessing ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    
    // Only optimize files larger than 500KB
    if (fileSize > 500 * 1024) {
      const backupPath = path.join(backupDir, fileName);
      const optimizedPath = path.join(assetsDir, fileName.replace('.png', '_optimized.png'));
      
      try {
        // Backup original if not already backed up
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(filePath, backupPath);
          console.log(`✓ Backed up ${fileName}`);
        }
        
        // Optimize the image
        await sharp(filePath)
          .png({ 
            quality: 80, 
            compressionLevel: 9,
            palette: true // Use palette for smaller file size
          })
          .resize({ width: 800, height: 600, fit: 'inside', withoutEnlargement: true })
          .toFile(optimizedPath);
        
        const optimizedSize = fs.statSync(optimizedPath).size;
        console.log(`✓ Optimized ${fileName}: ${(fileSize / 1024 / 1024).toFixed(2)} MB → ${(optimizedSize / 1024 / 1024).toFixed(2)} MB (${((1 - optimizedSize / fileSize) * 100).toFixed(1)}% reduction)`);
        
        // Replace original with optimized version
        fs.renameSync(optimizedPath, filePath);
        console.log(`✓ Replaced ${fileName} with optimized version`);
        
      } catch (error) {
        console.error(`✗ Error optimizing ${fileName}:`, error.message);
      }
    } else {
      console.log(`✓ ${fileName} is already small enough (${(fileSize / 1024).toFixed(1)} KB)`);
    }
  }
  
  console.log('\n🎉 Image optimization complete!');
}

optimizeAllImages().catch(console.error);
