/**
 * Data Manager Module
 * Handles loading, saving, and merging job data
 */

const fs = require('fs');

class DataManager {
  constructor(config) {
    this.config = config;
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[type];
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  loadExistingJobs() {
    try {
      if (fs.existsSync(this.config.jobsFile)) {
        const data = fs.readFileSync(this.config.jobsFile, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      this.log(`Error loading existing jobs: ${error.message}`, "warning");
    }
    return { jobs: [], lastUpdated: null, totalJobs: 0 };
  }

  mergeJobs(newJobs, existingData, options = {}) {
    const existingJobs = existingData.jobs || [];
    const currentTimestamp = new Date().toISOString();
    
    // Filter out old jobs with theory categories (only for InspireHEP jobs)
    let filteredExistingJobs = existingJobs;
    if (options.filterTheoryJobs) {
      const theoryCategories = ['hep-th', 'hep-ph', 'hep-lat', 'nucl-th'];
      filteredExistingJobs = existingJobs.filter((job) => {
        // Remove jobs with null/undefined categories (old data without proper filtering)
        // New jobs from the API will always have categories
        if (!job.arxiv_categories || job.arxiv_categories.length === 0) {
          return false;
        }
        // Remove jobs with any theory categories
        const hasTheoryCategory = job.arxiv_categories.some(cat => theoryCategories.includes(cat));
        return !hasTheoryCategory;
      });
    }
    
    const existingIds = new Set(filteredExistingJobs.map((job) => job.id));

    // Add new jobs that don't exist, marking them with addedAt timestamp
    const uniqueNewJobs = newJobs.filter((job) => !existingIds.has(job.id)).map((job) => ({
      ...job,
      addedAt: currentTimestamp,
      isNew: true
    }));

    // Preserve addedAt for existing jobs, mark them as not new
    const preservedExistingJobs = filteredExistingJobs.map((job) => ({
      ...job,
      addedAt: job.addedAt || currentTimestamp, // Preserve existing timestamp or add one
      isNew: false
    }));

    // Combine all jobs
    let allJobs = [...preservedExistingJobs, ...uniqueNewJobs];
    
    // Deduplicate by ID (safeguard against any duplicate IDs)
    const seenIds = new Set();
    allJobs = allJobs.filter((job) => {
      if (seenIds.has(job.id)) {
        this.log(`Removing duplicate job with ID: ${job.id}`, "warning");
        return false;
      }
      seenIds.add(job.id);
      return true;
    });

    // Filter by age if specified (for AJO to avoid rate limiting)
    if (options.filterByAge) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (options.daysToKeep || 30));
      
      const beforeFilter = allJobs.length;
      allJobs = allJobs.filter((job) => {
        const jobDate = new Date(job.created);
        return jobDate >= cutoffDate;
      });
      
      const removed = beforeFilter - allJobs.length;
      if (removed > 0) {
        this.log(`Filtered out ${removed} jobs older than ${options.daysToKeep || 30} days`);
      }
    }

    // Sort by updated date (newest first) to match API's "mostrecent" sort, and limit
    allJobs = allJobs
      .sort((a, b) => new Date(b.updated) - new Date(a.updated))
      .slice(0, this.config.maxJobs);

    this.log(
      `Added ${uniqueNewJobs.length} new jobs, total: ${allJobs.length}`
    );
    return allJobs;
  }

  saveJobs(jobs) {
    const dataToSave = {
      jobs,
      lastUpdated: new Date().toISOString(),
      totalJobs: jobs.length,
    };

    fs.writeFileSync(this.config.jobsFile, JSON.stringify(dataToSave, null, 2));
    this.log(`Saved ${jobs.length} jobs to database`, "success");
  }
}

module.exports = DataManager;