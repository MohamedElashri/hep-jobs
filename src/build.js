#!/usr/bin/env node

/**
 * HEP Jobs Tracker - Modular Build System
 * Main orchestrator that coordinates all modules to build the static website
 * Zero dependencies - uses only Node.js built-ins
 */

const DataFetcher = require('./modules/data-fetcher');
const RSSFetcher = require('./modules/rss-fetcher');
const DESYFetcher = require('./modules/desy-fetcher');
const DataManager = require('./modules/data-manager');
const HTMLGenerator = require('./modules/html-generator');
const FileManager = require('./modules/file-manager');

class HEPJobsTracker {
  constructor() {
    this.config = {
      apiBase: "https://inspirehep.net/api",
      rssUrl: "https://academicjobsonline.org/ajo?joblist-1062-0-0-0----rss--",
      dataDir: "./data",
      docsDir: "./site",
      jobsFile: "./data/jobs.json",
      ajoJobsFile: "./data/ajo-jobs.json",
      desyJobsFile: "./data/desy-jobs.json",
      maxJobs: 200,
      daysBack: 30,
    };

    // Initialize modules for InspireHEP
    this.dataFetcher = new DataFetcher(this.config);
    this.dataManager = new DataManager(this.config);
    
    // Initialize modules for AcademicJobsOnline
    this.rssFetcher = new RSSFetcher(this.config);
    this.ajoDataManager = new DataManager({...this.config, jobsFile: this.config.ajoJobsFile});
    
    // Initialize modules for DESY
    this.desyFetcher = new DESYFetcher(this.config);
    this.desyDataManager = new DataManager({...this.config, jobsFile: this.config.desyJobsFile});
    
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

  async buildInspireHEP() {
    this.log("🔬 Building InspireHEP jobs page...");

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

      // Step 5: Generate InspireHEP page
      const jobsData = {
        jobs: mergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: mergedJobs.length,
      };

      // Generate HTML from template
      const html = this.htmlGenerator.generateHTML(jobsData, 'index.html');
      this.fileManager.writeHTML(html, 'index.html');

      this.log(
        `✅ InspireHEP page built successfully with ${mergedJobs.length} jobs`,
        "success"
      );
      return true;
    } catch (error) {
      this.log(`InspireHEP build failed: ${error.message}`, "error");
      
      // Try to build with existing data as fallback
      try {
        this.log("Attempting InspireHEP fallback build...", "warning");
        const existingData = this.dataManager.loadExistingJobs();

        if (existingData.jobs && existingData.jobs.length > 0) {
          const jobsData = {
            jobs: existingData.jobs,
            lastUpdated: existingData.lastUpdated,
            totalJobs: existingData.totalJobs,
          };

          const html = this.htmlGenerator.generateHTML(jobsData, 'index.html');
          this.fileManager.writeHTML(html, 'index.html');

          this.log(
            `✅ InspireHEP fallback build completed with ${existingData.totalJobs} jobs`,
            "success"
          );
          return true;
        }
      } catch (fallbackError) {
        this.log(`InspireHEP fallback build failed: ${fallbackError.message}`, "error");
      }
      return false;
    }
  }

  async buildAcademicJobsOnline() {
    this.log("🎓 Building AcademicJobsOnline jobs page...");

    try {
      // Step 1: Load existing data first
      const existingData = this.ajoDataManager.loadExistingJobs();
      
      // Step 2: Check if we should fetch new data (to avoid rate limiting)
      const shouldFetch = this.shouldFetchAJO(existingData);
      
      let mergedJobs;
      
      if (shouldFetch) {
        this.log("Fetching new AcademicJobsOnline jobs...");
        
        // Step 3: Test RSS connectivity
        await this.rssFetcher.testApiConnectivity();

        // Step 4: Fetch jobs from RSS
        const newJobs = await this.rssFetcher.fetchJobs();

        // Step 5: Merge with existing data and filter by age (keep last 30 days)
        mergedJobs = this.ajoDataManager.mergeJobs(newJobs, existingData, {
          filterByAge: true,
          daysToKeep: 30
        });

        // Step 6: Save updated data
        this.ajoDataManager.saveJobs(mergedJobs);
      } else {
        this.log("Using cached AcademicJobsOnline data (last fetch was recent)");
        
        // Still filter by age to remove old jobs
        mergedJobs = this.ajoDataManager.mergeJobs([], existingData, {
          filterByAge: true,
          daysToKeep: 30
        });
        
        // Save filtered data
        this.ajoDataManager.saveJobs(mergedJobs);
      }

      // Step 7: Generate AcademicJobsOnline page
      const jobsData = {
        jobs: mergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: mergedJobs.length,
      };

      // Generate HTML from AJO template
      const html = this.htmlGenerator.generateHTML(jobsData, 'ajo.html');
      this.fileManager.writeHTML(html, 'ajo.html');

      this.log(
        `✅ AcademicJobsOnline page built successfully with ${mergedJobs.length} jobs`,
        "success"
      );
      return true;
    } catch (error) {
      this.log(`AcademicJobsOnline build failed: ${error.message}`, "error");
      
      // Try to build with existing data as fallback
      try {
        this.log("Attempting AcademicJobsOnline fallback build...", "warning");
        const existingData = this.ajoDataManager.loadExistingJobs();

        if (existingData.jobs && existingData.jobs.length > 0) {
          // Filter old jobs even in fallback
          const filteredJobs = existingData.jobs.filter((job) => {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);
            return new Date(job.created) >= cutoffDate;
          });

          const jobsData = {
            jobs: filteredJobs,
            lastUpdated: existingData.lastUpdated,
            totalJobs: filteredJobs.length,
          };

          const html = this.htmlGenerator.generateHTML(jobsData, 'ajo.html');
          this.fileManager.writeHTML(html, 'ajo.html');

          this.log(
            `✅ AcademicJobsOnline fallback build completed with ${filteredJobs.length} jobs`,
            "success"
          );
          return true;
        }
      } catch (fallbackError) {
        this.log(`AcademicJobsOnline fallback build failed: ${fallbackError.message}`, "error");
      }
      return false;
    }
  }

  shouldFetchAJO(existingData) {
    // Don't fetch if we have no last update (first run)
    if (!existingData.lastUpdated) {
      return true;
    }

    // Fetch if last update was more than 24 hours ago
    const lastUpdate = new Date(existingData.lastUpdated);
    const hoursSinceUpdate = (new Date() - lastUpdate) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate >= 24) {
      this.log(`Last AJO fetch was ${hoursSinceUpdate.toFixed(1)} hours ago, fetching new data`);
      return true;
    }
    
    this.log(`Last AJO fetch was ${hoursSinceUpdate.toFixed(1)} hours ago, using cached data`);
    return false;
  }

  shouldFetchDESY(existingData) {
    // Don't fetch if we have no last update (first run)
    if (!existingData.lastUpdated) {
      return true;
    }

    // Fetch if last update was more than 24 hours ago
    const lastUpdate = new Date(existingData.lastUpdated);
    const hoursSinceUpdate = (new Date() - lastUpdate) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate >= 24) {
      this.log(`Last DESY fetch was ${hoursSinceUpdate.toFixed(1)} hours ago, fetching new data`);
      return true;
    }
    
    this.log(`Last DESY fetch was ${hoursSinceUpdate.toFixed(1)} hours ago, using cached data`);
    return false;
  }

  async build() {
    this.log("🚀 Starting HEP Jobs Tracker single-page build process...");

    try {
      // Fetch InspireHEP data
      this.log("🔬 Fetching InspireHEP jobs...");
      await this.dataFetcher.testApiConnectivity();
      const inspireNewJobs = await this.dataFetcher.fetchJobs();
      const inspireExistingData = this.dataManager.loadExistingJobs();
      const inspireMergedJobs = this.dataManager.mergeJobs(inspireNewJobs, inspireExistingData);
      this.dataManager.saveJobs(inspireMergedJobs);
      
      const inspirehepData = {
        jobs: inspireMergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: inspireMergedJobs.length,
      };
      
      // Fetch AJO data
      this.log("🎓 Fetching AcademicJobsOnline jobs...");
      const ajoExistingData = this.ajoDataManager.loadExistingJobs();
      const shouldFetchAJO = this.shouldFetchAJO(ajoExistingData);
      
      let ajoMergedJobs;
      if (shouldFetchAJO) {
        await this.rssFetcher.testApiConnectivity();
        const ajoNewJobs = await this.rssFetcher.fetchJobs();
        ajoMergedJobs = this.ajoDataManager.mergeJobs(ajoNewJobs, ajoExistingData, {
          filterByAge: true,
          daysToKeep: 30
        });
        this.ajoDataManager.saveJobs(ajoMergedJobs);
      } else {
        this.log("Using cached AcademicJobsOnline data");
        ajoMergedJobs = this.ajoDataManager.mergeJobs([], ajoExistingData, {
          filterByAge: true,
          daysToKeep: 30
        });
        this.ajoDataManager.saveJobs(ajoMergedJobs);
      }
      
      const ajoData = {
        jobs: ajoMergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: ajoMergedJobs.length,
      };
      
      // Fetch DESY data
      this.log("🔬 Fetching DESY jobs...");
      const desyExistingData = this.desyDataManager.loadExistingJobs();
      const shouldFetchDESY = this.shouldFetchDESY(desyExistingData);
      
      let desyMergedJobs;
      if (shouldFetchDESY) {
        await this.desyFetcher.testApiConnectivity();
        const desyNewJobs = await this.desyFetcher.fetchJobs();
        desyMergedJobs = this.desyDataManager.mergeJobs(desyNewJobs, desyExistingData, {
          filterByAge: true,
          daysToKeep: 60
        });
        this.desyDataManager.saveJobs(desyMergedJobs);
      } else {
        this.log("Using cached DESY data");
        desyMergedJobs = this.desyDataManager.mergeJobs([], desyExistingData, {
          filterByAge: true,
          daysToKeep: 60
        });
        this.desyDataManager.saveJobs(desyMergedJobs);
      }
      
      const desyData = {
        jobs: desyMergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: desyMergedJobs.length,
      };
      
      // Generate single HTML with all three sources
      this.log("Generating single-page website with all sources...");
      const html = this.htmlGenerator.generateHTML(inspirehepData, ajoData, desyData);
      this.fileManager.writeHTML(html, 'index.html');
      
      // Copy assets
      this.fileManager.copyAssets();
      
      this.log(`✨ Single-page build completed! InspireHEP: ${inspireMergedJobs.length} jobs, AJO: ${ajoMergedJobs.length} jobs, DESY: ${desyMergedJobs.length} jobs`, "success");
      
    } catch (error) {
      this.log(`Build failed: ${error.message}`, "error");
      this.log(`Stack: ${error.stack}`, "error");
      process.exit(1);
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