// Script to inspect Material-UI class styles
// Run this in the browser console to check styles for MuiBox-root css-93uv8w

function inspectMUIClass(className) {
    // Find elements with the specific class
    const elements = document.querySelectorAll(`.${className}`);
    
    if (elements.length === 0) {
        console.log(`No elements found with class: ${className}`);
        return;
    }
    
    console.log(`Found ${elements.length} element(s) with class: ${className}`);
    
    elements.forEach((element, index) => {
        console.log(`\n--- Element ${index + 1} ---`);
        const computedStyles = window.getComputedStyle(element);
        
        // Log key CSS properties
        const importantProps = [
            'display', 'flexDirection', 'justifyContent', 'alignItems', 
            'gap', 'padding', 'margin', 'width', 'height', 'backgroundColor',
            'border', 'borderRadius', 'boxShadow', 'position', 'overflow'
        ];
        
        importantProps.forEach(prop => {
            const value = computedStyles.getPropertyValue(prop);
            if (value && value !== 'initial' && value !== 'normal') {
                console.log(`${prop}: ${value}`);
            }
        });
        
        // Log all custom properties that might be set
        console.log('\nAll non-default styles:');
        for (let i = 0; i < computedStyles.length; i++) {
            const prop = computedStyles[i];
            const value = computedStyles.getPropertyValue(prop);
            
            // Only show properties that seem to be explicitly set
            if (value && !value.includes('initial') && !value.includes('auto') && value !== '0px') {
                console.log(`${prop}: ${value}`);
            }
        }
    });
}

// Usage examples:
console.log('To inspect the specific class, run:');
console.log('inspectMUIClass("css-93uv8w")');
console.log('or');
console.log('inspectMUIClass("MuiBox-root")');

// You can also check specific elements
function inspectElementStyles(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.log(`Element not found: ${selector}`);
        return;
    }
    
    console.log(`Inspecting element: ${selector}`);
    console.log('Classes:', element.className);
    
    const computedStyles = window.getComputedStyle(element);
    console.log('Computed styles:', computedStyles);
    
    return computedStyles;
}

// Make functions globally available
window.inspectMUIClass = inspectMUIClass;
window.inspectElementStyles = inspectElementStyles;

console.log('Material-UI Style Inspector loaded!');
console.log('Use inspectMUIClass("css-93uv8w") to check the specific class styles.');
