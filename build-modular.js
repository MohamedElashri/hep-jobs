#!/usr/bin/env node

/**
 * Main Build Script - Entry Point
 * Uses the modular build system in src/ directory
 */

const path = require('path');

// Import the modular build system
const HEPJobsTracker = require('./src/build');

async function main() {
  console.log('🔧 Using modular build system...');
  const tracker = new HEPJobsTracker();
  await tracker.build();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}