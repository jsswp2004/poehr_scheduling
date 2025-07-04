#!/bin/bash
# Image optimization script for large PNG files

echo "Creating optimized versions of large images..."

# Create optimized directory if it doesn't exist
mkdir -p optimized

# Note: This script requires imagemagick to be installed
# On Windows, you can install it via chocolatey: choco install imagemagick
# Or download from: https://imagemagick.org/script/download.php#windows

# Optimize CEO_CTO.png (reduce to 800px width, 80% quality)
convert CEO_CTO.png -resize 800x -quality 80 optimized/CEO_CTO_optimized.png

# Optimize dashboard_scheduling.png (reduce to 1200px width, 75% quality)
convert dashboard_scheduling.png -resize 1200x -quality 75 optimized/dashboard_scheduling_optimized.png

# Optimize POWER_Logo.png (reduce to 300px width, 85% quality)
convert POWER_Logo.png -resize 300x -quality 85 optimized/POWER_Logo_optimized.png

echo "Optimization complete! Check the 'optimized' folder."
echo "File sizes:"
ls -la optimized/
