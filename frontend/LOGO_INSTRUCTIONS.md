# How to Add Your Company Logo

## Steps to Replace the Lightning Bolt Placeholder with Your Actual Logo:

### 1. Add Your Logo File
- Place your logo file in: `frontend/src/assets/images/`
- Supported formats: PNG, JPG, SVG (SVG recommended for best quality)
- Recommended size: 200x200px or larger (square format works best)
- Name suggestion: `company-logo.png` or `power-it-systems-logo.svg`

### 2. Update the React Component
In `frontend/src/pages/LandingPage.js`, find this section around line 22:

```javascript
<div className="power-logo-2-1">
  {/* Replace the div below with your actual logo */}
  {/* <img src="/src/assets/images/your-logo.png" alt="POWER IT Systems Logo" className="logo-image" /> */}
  <div className="logo-placeholder">⚡</div>
</div>
```

Replace it with:

```javascript
<div className="power-logo-2-1">
  <img src="/src/assets/images/your-logo-filename.png" alt="POWER IT Systems Logo" className="logo-image" />
</div>
```

### 3. Import the Logo (Alternative Method)
For better performance, you can import the logo at the top of the file:

```javascript
import companyLogo from '../assets/images/your-logo-filename.png';
```

Then use it like:

```javascript
<div className="power-logo-2-1">
  <img src={companyLogo} alt="POWER IT Systems Logo" className="logo-image" />
</div>
```

## Current Header Improvements Made:

✅ **Better Layout Spacing**
- Increased header width to 1400px for better content distribution
- Added proper gaps between logo, navigation, and buttons
- Improved responsive breakpoints for mobile devices

✅ **Enhanced Logo Area**
- Reduced logo size from 76px to 50px for better proportion
- Added hover effects with subtle animations
- Professional gold gradient background for placeholder
- Ready-to-use `.logo-image` styling for your actual logo

✅ **Navigation Improvements**
- Better spacing between menu items
- Centered navigation menu
- Enhanced button styling with hover effects
- Improved mobile responsive layout

✅ **Interactive Elements**
- Added click handler for logo to navigate home
- Removed inline styles in favor of CSS classes
- Better hover animations throughout header

## Next Steps:
1. Add your logo file to the assets folder
2. Update the image source in LandingPage.js
3. Test the layout and adjust company name if needed
4. Consider adding dropdown menu functionality for Products, Solutions, etc.
