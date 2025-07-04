const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'src', 'assets');
const backupDir = path.join(assetsDir, 'backup');

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

const optimizeImage = async (inputPath, outputPath, options) => {
  try {
    await sharp(inputPath)
      .resize(options.width, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ 
        quality: options.quality,
        progressive: true
      })
      .toFile(outputPath);
    
    const inputStats = fs.statSync(inputPath);
    const outputStats = fs.statSync(outputPath);
    
    console.log(`Optimized ${path.basename(inputPath)}:`);
    console.log(`  Original: ${(inputStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Optimized: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Reduction: ${((1 - outputStats.size / inputStats.size) * 100).toFixed(1)}%`);
    console.log('');
  } catch (error) {
    console.error(`Error optimizing ${inputPath}:`, error);
  }
};

const optimizeImages = async () => {
  console.log('Starting image optimization...\n');
  
  // Backup and optimize CEO_CTO.png
  const ceoCtoPath = path.join(assetsDir, 'CEO_CTO.png');
  const ceoCtoBackup = path.join(backupDir, 'CEO_CTO.png');
  const ceoCtoOptimized = path.join(assetsDir, 'CEO_CTO.jpg');
  
  if (fs.existsSync(ceoCtoPath)) {
    fs.copyFileSync(ceoCtoPath, ceoCtoBackup);
    await optimizeImage(ceoCtoPath, ceoCtoOptimized, { width: 800, quality: 80 });
    fs.unlinkSync(ceoCtoPath); // Remove original PNG
  }
  
  // Backup and optimize dashboard_scheduling.png
  const dashboardPath = path.join(assetsDir, 'dashboard_scheduling.png');
  const dashboardBackup = path.join(backupDir, 'dashboard_scheduling.png');
  const dashboardOptimized = path.join(assetsDir, 'dashboard_scheduling.jpg');
  
  if (fs.existsSync(dashboardPath)) {
    fs.copyFileSync(dashboardPath, dashboardBackup);
    await optimizeImage(dashboardPath, dashboardOptimized, { width: 1200, quality: 75 });
    fs.unlinkSync(dashboardPath); // Remove original PNG
  }
  
  // Backup and optimize POWER_Logo.png (keep as PNG for transparency, but optimize)
  const logoPath = path.join(assetsDir, 'POWER_Logo.png');
  const logoBackup = path.join(backupDir, 'POWER_Logo.png');
  const logoOptimized = path.join(assetsDir, 'POWER_Logo_optimized.png');
  
  if (fs.existsSync(logoPath)) {
    fs.copyFileSync(logoPath, logoBackup);
    await sharp(logoPath)
      .resize(400, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .png({ 
        quality: 80,
        compressionLevel: 9
      })
      .toFile(logoOptimized);
    
    // Replace original with optimized
    fs.unlinkSync(logoPath);
    fs.renameSync(logoOptimized, logoPath);
    
    const originalStats = fs.statSync(logoBackup);
    const optimizedStats = fs.statSync(logoPath);
    
    console.log(`Optimized POWER_Logo.png:`);
    console.log(`  Original: ${(originalStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Optimized: ${(optimizedStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Reduction: ${((1 - optimizedStats.size / originalStats.size) * 100).toFixed(1)}%`);
    console.log('');
  }
  
  console.log('Image optimization complete!');
  console.log('Original images backed up to src/assets/backup/');
  console.log('Don\'t forget to update the import statements from .png to .jpg where applicable.');
};

optimizeImages().catch(console.error);
