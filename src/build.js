#!/usr/bin/env node

/**
 * HEP Jobs Tracker - Modular Build System
 * Main orchestrator that coordinates all modules to build the static website
 * Zero dependencies - uses only Node.js built-ins
 */

const DataFetcher = require('./modules/data-fetcher');
const DataManager = require('./modules/data-manager');
const HTMLGenerator = require('./modules/html-generator');
const FileManager = require('./modules/file-manager');

class HEPJobsTracker {
  constructor() {
    this.config = {
      apiBase: "https://inspirehep.net/api",
      dataDir: "./data",
      docsDir: "./docs",
      jobsFile: "./data/jobs.json",
      maxJobs: 200,
      daysBack: 30,
    };

    // Initialize modules
    this.dataFetcher = new DataFetcher(this.config);
    this.dataManager = new DataManager(this.config);
    this.htmlGenerator = new HTMLGenerator(this.config);
    this.fileManager = new FileManager(this.config);

    this.fileManager.ensureDirectories();
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[
      type
    ];
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  async build() {
    this.log("🚀 Starting HEP Jobs Tracker modular build process...");

    try {
      // Step 1: Test API connectivity first
      await this.dataFetcher.testApiConnectivity();

      // Step 2: Fetch new jobs
      const newJobs = await this.dataFetcher.fetchJobs();

      // Step 3: Load existing data and merge
      const existingData = this.dataManager.loadExistingJobs();
      const mergedJobs = this.dataManager.mergeJobs(newJobs, existingData);

      // Step 4: Save updated data
      this.dataManager.saveJobs(mergedJobs);

      // Step 5: Generate static files
      this.log("Generating static website files...");

      const jobsData = {
        jobs: mergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: mergedJobs.length,
      };

      // Generate HTML from template
      const html = this.htmlGenerator.generateHTML(jobsData);
      this.fileManager.writeHTML(html);

      // Copy CSS and JavaScript assets
      this.fileManager.copyAssets();

      this.log(
        `✨ Modular build completed successfully! Generated website with ${mergedJobs.length} jobs`,
        "success"
      );
    } catch (error) {
      this.log(`Build failed: ${error.message}`, "error");

      // Try to build with existing data as fallback
      try {
        this.log(
          "Attempting to build with existing data as fallback...",
          "warning"
        );
        const existingData = this.dataManager.loadExistingJobs();

        if (existingData.jobs && existingData.jobs.length > 0) {
          const jobsData = {
            jobs: existingData.jobs,
            lastUpdated: existingData.lastUpdated,
            totalJobs: existingData.totalJobs,
          };

          // Generate HTML from template
          const html = this.htmlGenerator.generateHTML(jobsData);
          this.fileManager.writeHTML(html);

          // Copy CSS and JavaScript assets
          this.fileManager.copyAssets();

          this.log(
            `✅ Fallback build completed with ${existingData.totalJobs} existing jobs`,
            "success"
          );
        } else {
          this.log("No existing data available for fallback build", "error");
          process.exit(1);
        }
      } catch (fallbackError) {
        this.log(
          `Fallback build also failed: ${fallbackError.message}`,
          "error"
        );
        process.exit(1);
      }
    }
  }
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
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

module.exports = HEPJobsTracker;