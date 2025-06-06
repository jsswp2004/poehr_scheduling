#!/usr/bin/env node

/**
 * Script to test React Toastify toast notifications
 * This script opens a browser to the toast test page
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Define colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

console.log(`${colors.bright}${colors.cyan}React Toastify Test Script${colors.reset}`);
console.log(`${colors.bright}=========================${colors.reset}`);

// Check if the dev server is running on port 3000
const checkServerRunning = () => {
  return new Promise((resolve) => {
    const testConnection = require('http').get('http://localhost:3000', (res) => {
      resolve(true);
    }).on('error', () => {
      resolve(false);
    });
    testConnection.setTimeout(1000, () => {
      testConnection.abort();
      resolve(false);
    });
  });
};

// Open the test page in the default browser
const openTestPage = () => {
  const url = 'http://localhost:3000/toast-test';
  
  // Detect platform and open browser accordingly
  const platform = process.platform;
  let command;
  
  if (platform === 'win32') {
    command = `start ${url}`;
  } else if (platform === 'darwin') {
    command = `open ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }
  
  console.log(`${colors.yellow}Opening test page in browser: ${url}${colors.reset}`);
  exec(command);
};

// Main function
const main = async () => {
  console.log(`${colors.cyan}Checking if development server is running...${colors.reset}`);
  
  const isServerRunning = await checkServerRunning();
  
  if (!isServerRunning) {
    console.log(`${colors.red}Error: Development server is not running.${colors.reset}`);
    console.log(`${colors.yellow}Please start the development server with:${colors.reset}`);
    console.log(`${colors.bright}cd frontend && npm start${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`${colors.green}Development server is running!${colors.reset}`);
  openTestPage();
  
  console.log(`\n${colors.bright}Test Instructions:${colors.reset}`);
  console.log(`1. ${colors.cyan}Click each toast button on the test page${colors.reset}`);
  console.log(`2. ${colors.cyan}Verify that each toast remains visible for 5 seconds${colors.reset}`);
  console.log(`3. ${colors.cyan}Check that the toast progress bar completes correctly${colors.reset}`);
  
  console.log(`\n${colors.yellow}If toasts still disappear too quickly:${colors.reset}`);
  console.log(`- Check browser console for errors`);
  console.log(`- Try different browser`);
  console.log(`- Verify CSS is loading properly`);
  console.log(`- Check if any browser extensions might be interfering\n`);
};

// Run the main function
main().catch(err => {
  console.error(`${colors.red}Error:${colors.reset}`, err);
  process.exit(1);
});
