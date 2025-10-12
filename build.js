#!/usr/bin/env node

/**
 * HEP Jobs Tracker - Unified Build Script
 * Fetches jobs from InspireHEP API and generates static website
 * Zero dependencies - uses only Node.js built-ins
 */

const fs = require("fs");
const path = require("path");

class HEPJobsTracker {
  constructor() {
    this.config = {
      apiBase: "https://inspirehep.net/api",
      dataDir: "./data",
      docsDir: "./site",
      jobsFile: "./data/jobs.json",
      maxJobs: 200,
      daysBack: 30,
    };

    this.ensureDirectories();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  ensureDirectories() {
    [this.config.dataDir, this.config.docsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[
      type
    ];
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  formatDate(dateString, options = {}) {
    if (!dateString) return "No deadline";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...options,
      });
    } catch (error) {
      return "Invalid date";
    }
  }

  isExpired(deadlineString) {
    if (!deadlineString) return false;
    try {
      return new Date(deadlineString) < new Date();
    } catch (error) {
      return false;
    }
  }

  escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  // Sanitize HTML while preserving safe formatting tags
  sanitizeHtml(text) {
    if (!text) return "";
    
    // List of allowed tags for job descriptions
    const allowedTags = ['div', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const allowedAttributes = ['href', 'target'];
    
    // Simple HTML sanitizer that preserves allowed tags
    let sanitized = text;
    
    // Remove script and style tags completely
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove any tag not in the allowed list
    sanitized = sanitized.replace(/<(\/?)([\w]+)([^>]*)>/gi, (match, closing, tagName, attributes) => {
      if (!allowedTags.includes(tagName.toLowerCase())) {
        return ''; // Remove disallowed tags
      }
      
      // For allowed tags, clean up attributes
      if (attributes && tagName.toLowerCase() === 'a') {
        // For anchor tags, preserve href and target attributes
        const hrefMatch = attributes.match(/href\s*=\s*["']([^"']*)["']/i);
        const targetMatch = attributes.match(/target\s*=\s*["']([^"']*)["']/i);
        
        let cleanAttributes = '';
        if (hrefMatch) {
          // Basic URL validation
          const url = hrefMatch[1];
          if (url.match(/^https?:\/\//) || url.match(/^mailto:/)) {
            cleanAttributes += ` href="${url}"`;
          }
        }
        if (targetMatch && targetMatch[1] === '_blank') {
          cleanAttributes += ' target="_blank"';
        }
        
        return `<${closing}${tagName}${cleanAttributes}>`;
      }
      
      // For other allowed tags, remove all attributes for simplicity
      return `<${closing}${tagName}>`;
    });
    
    return sanitized;
  }

  truncateText(text, maxLength, suffix = "...") {
    if (!text) return "";
    if (text.length <= maxLength) return this.escapeHtml(text);
    return (
      this.escapeHtml(text.substring(0, maxLength - suffix.length)) + suffix
    );
  }

  // New function for truncating HTML content while preserving tags
  truncateHtml(html, maxLength, suffix = "...") {
    if (!html) return "";
    
    // First sanitize the HTML
    const sanitized = this.sanitizeHtml(html);
    
    // If the sanitized HTML is short enough, return as-is
    if (sanitized.length <= maxLength) return sanitized;
    
    // For longer content, strip HTML for length calculation but preserve structure for display
    const textOnly = sanitized.replace(/<[^>]*>/g, '');
    if (textOnly.length <= maxLength) return sanitized;
    
    // If still too long, create a truncated version that preserves HTML structure
    // Extract text content while keeping track of HTML tags
    let result = '';
    let textLength = 0;
    let inTag = false;
    let i = 0;
    
    while (i < sanitized.length && textLength < maxLength - suffix.length) {
      const char = sanitized[i];
      
      if (char === '<') {
        inTag = true;
        result += char;
      } else if (char === '>') {
        inTag = false;
        result += char;
      } else if (inTag) {
        result += char;
      } else {
        result += char;
        textLength++;
      }
      i++;
    }
    
    // Close any unclosed tags (basic implementation)
    const openTags = [];
    const tagRegex = /<(\/?)([\w]+)[^>]*>/g;
    let match;
    
    while ((match = tagRegex.exec(result)) !== null) {
      const [, closing, tagName] = match;
      if (closing) {
        // Closing tag
        const index = openTags.lastIndexOf(tagName.toLowerCase());
        if (index !== -1) {
          openTags.splice(index, 1);
        }
      } else {
        // Opening tag (skip self-closing tags like br)
        const selfClosing = ['br', 'hr', 'img', 'input'];
        if (!selfClosing.includes(tagName.toLowerCase())) {
          openTags.push(tagName.toLowerCase());
        }
      }
    }
    
    // Close any remaining open tags
    for (let i = openTags.length - 1; i >= 0; i--) {
      result += `</${openTags[i]}>`;
    }
    
    return result + suffix;
  }

  // ============================================
  // DATA FETCHING
  // ============================================

  async fetchJobs() {
    this.log("Fetching jobs from InspireHEP API...");

    try {
      // First, try without date filter to see if API works
      const params = new URLSearchParams({
        sort: "mostrecent",
        size: 100,
      });

      this.log(`API URL: ${this.config.apiBase}/jobs?${params}`);
      const response = await fetch(`${this.config.apiBase}/jobs?${params}`);

      this.log(`HTTP Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        this.log(`Response body: ${errorText}`, "error");
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();
      this.log(
        `Raw API response structure: ${JSON.stringify(Object.keys(data))}`
      );

      if (data.hits && data.hits.hits) {
        this.log(`Total jobs available: ${data.hits.total}`);
        this.log(`Jobs in this response: ${data.hits.hits.length}`);

        // Log first job structure for debugging
        if (data.hits.hits.length > 0) {
          const firstJob = data.hits.hits[0];
          this.log(`First job keys: ${JSON.stringify(Object.keys(firstJob))}`);
          this.log(
            `First job metadata keys: ${JSON.stringify(
              Object.keys(firstJob.metadata || {})
            )}`
          );
        }

        const processedJobs = this.processJobs(data.hits.hits);
        this.log(`Fetched ${processedJobs.length} jobs from API`, "success");
        return processedJobs;
      } else {
        this.log(
          `Unexpected response structure: ${JSON.stringify(data)}`,
          "warning"
        );
        throw new Error("Unexpected API response structure");
      }
    } catch (error) {
      this.log(`Error fetching jobs: ${error.message}`, "error");
      this.log(`Error stack: ${error.stack}`, "error");

      // Use mock data for testing if API fails
      this.log("API failed, using mock data for testing...", "warning");
      return this.generateMockJobs();
    }
  }

  processJobs(jobs) {
    if (!Array.isArray(jobs)) {
      this.log("Jobs data is not an array", "warning");
      return [];
    }

    return jobs
      .map((job, index) => {
        try {
          const metadata = job.metadata || job;

          // Log structure of first job for debugging
          if (index === 0) {
            this.log(
              `Processing first job - available fields: ${JSON.stringify(
                Object.keys(metadata)
              )}`
            );
          }

          return {
            id:
              job.id || metadata.control_number || `job-${Date.now()}-${index}`,
            title: this.cleanJobTitle(
              metadata.position ||
                metadata.title?.title ||
                metadata.titles?.[0]?.title ||
                "Untitled Position"
            ),
            institution: this.extractInstitution(metadata.institutions),
            deadline: metadata.deadline_date || metadata.deadline || null,
            description: this.extractDescription(metadata),
            regions: metadata.regions || [],
            ranks: metadata.ranks || [],
            experiments:
              metadata.accelerator_experiments?.map(
                (exp) => exp.name || exp.value || exp
              ) || [],
            urls: this.extractUrls(metadata),
            contact_email: this.extractContactEmail(metadata),
            created:
              metadata.creation_date ||
              metadata.created ||
              job.created ||
              new Date().toISOString(),
            updated:
              metadata.update_date ||
              metadata.updated ||
              job.updated ||
              new Date().toISOString(),
          };
        } catch (error) {
          this.log(
            `Error processing job ${index}: ${error.message}`,
            "warning"
          );
          return null;
        }
      })
      .filter((job) => job !== null);
  }

  extractDescription(metadata) {
    if (metadata.description?.value) return metadata.description.value;
    if (metadata.description) return metadata.description;
    if (metadata.abstract?.value) return metadata.abstract.value;
    if (metadata.abstract) return metadata.abstract;
    return "";
  }

  extractUrls(metadata) {
    const urls = [];

    if (metadata.urls && Array.isArray(metadata.urls)) {
      urls.push(...metadata.urls.map((url) => url.value || url.url || url));
    } else if (metadata.urls) {
      urls.push(metadata.urls);
    }

    if (metadata.reference_urls && Array.isArray(metadata.reference_urls)) {
      urls.push(
        ...metadata.reference_urls.map((url) => url.value || url.url || url)
      );
    }

    return urls.filter((url) => url && typeof url === "string");
  }

  extractContactEmail(metadata) {
    if (metadata.contact_details && Array.isArray(metadata.contact_details)) {
      const contact = metadata.contact_details.find((c) => c.email);
      if (contact) return contact.email;
    }

    if (metadata.contact_email) return metadata.contact_email;
    if (metadata.email) return metadata.email;

    return null;
  }

  extractInstitution(institutions) {
    if (!institutions || institutions.length === 0)
      return "Unknown Institution";
    return (
      institutions[0].value || institutions[0].name || "Unknown Institution"
    );
  }

  cleanJobTitle(title) {
    if (!title) return "Untitled Position";
    return title.replace(/\s+/g, " ").trim();
  }

  // ============================================
  // DATA MANAGEMENT
  // ============================================

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

  mergeJobs(newJobs, existingData) {
    const existingJobs = existingData.jobs || [];
    const existingIds = new Set(existingJobs.map((job) => job.id));

    // Add new jobs that don't exist
    const uniqueNewJobs = newJobs.filter((job) => !existingIds.has(job.id));

    // Combine and sort by creation date (newest first)
    const allJobs = [...existingJobs, ...uniqueNewJobs]
      .sort((a, b) => new Date(b.created) - new Date(a.created))
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

  // ============================================
  // HTML GENERATION
  // ============================================

  generateJobCard(job) {
    const deadline = this.formatDate(job.deadline);
    const isExpired = this.isExpired(job.deadline);
    const cardClass = isExpired ? "job-card expired" : "job-card";
    const ranksData = job.ranks.map(rank => rank.toUpperCase()).join(',');
    
    // Create InspireHEP URL for the job
    const inspireHepUrl = `https://inspirehep.net/jobs/${job.id}`;
    
    // Store full job data as JSON in data attribute
    const jobData = {
      id: job.id,
      title: job.title,
      institution: job.institution,
      deadline: deadline,
      isExpired: isExpired,
      regions: job.regions,
      ranks: job.ranks,
      experiments: job.experiments,
      description: job.description || '',
      urls: job.urls,
      contact_email: job.contact_email,
      inspireHepUrl: inspireHepUrl
    };

    return `
      <div class="${cardClass}" data-id="${job.id}" data-ranks="${ranksData}" data-job='${JSON.stringify(jobData).replace(/'/g, "&#39;")}'>
        <div class="job-header">
          <h3 class="job-title">
            <a href="${inspireHepUrl}" target="_blank" class="job-title-link">${this.escapeHtml(job.title)}</a>
          </h3>
          <div class="job-institution">${this.escapeHtml(job.institution)}</div>
        </div>
        
        <div class="job-meta">
          <div class="deadline ${isExpired ? "expired-text" : ""}">
            <strong>Deadline:</strong> ${deadline}
          </div>
          ${
            job.regions.length > 0
              ? `
            <div class="regions">
              <strong>Regions:</strong> ${job.regions.join(", ")}
            </div>`
              : ""
          }
          ${
            job.ranks.length > 0
              ? `
            <div class="ranks">
              <strong>Ranks:</strong> ${job.ranks.join(", ")}
            </div>`
              : ""
          }
          ${
            job.experiments.length > 0
              ? `
            <div class="experiments">
              <strong>Experiments:</strong> ${job.experiments
                .slice(0, 3)
                .join(", ")}
              ${
                job.experiments.length > 3
                  ? ` (+${job.experiments.length - 3} more)`
                  : ""
              }
            </div>`
              : ""
          }
        </div>

        ${
          job.description
            ? `
          <div class="job-description">
            ${this.truncateHtml(job.description, 200)}
          </div>`
            : ""
        }

        <div class="job-actions">
          ${
            job.description
              ? `
            <button class="btn-view-full" data-job-id="${job.id}">View Full Description</button>`
              : ""
          }
          <a href="${inspireHepUrl}" target="_blank" class="btn-apply">View on InspireHEP</a>
          ${
            job.contact_email
              ? `
            <a href="mailto:${job.contact_email}" class="btn-contact">Contact</a>`
              : ""
          }
        </div>
      </div>`;
  }

  generateHTML(jobsData) {
    const { jobs, lastUpdated, totalJobs } = jobsData;
    const updateTime = lastUpdated
      ? new Date(lastUpdated).toLocaleString()
      : "Never";

    const activeJobs = jobs.filter((job) => !this.isExpired(job.deadline));
    const expiredJobs = jobs.filter((job) => this.isExpired(job.deadline));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>High Energy Physics Jobs Tracker</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header class="header">
        <div class="container">
            <div class="header-top">
                <h1 class="clickable-title" onclick="window.location.reload()">🔬 HEP Jobs Tracker</h1>
                <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark/light mode">
                    <span class="theme-icon">🌙</span>
                </button>
            </div>
            <p class="subtitle">Latest High Energy Physics Job Opportunities</p>
            <div class="stats">
                <span class="stat">Total Jobs: ${totalJobs}</span>
                <span class="stat">Active: ${activeJobs.length}</span>
                <span class="stat">Last Updated: ${updateTime}</span>
            </div>
        </div>
    </header>

    <main class="container">
        <div class="filters">
            <input type="text" id="searchInput" placeholder="Search jobs..." class="search-input">
            <div class="filter-buttons">
                <button class="filter-btn active" data-filter="all">All Jobs</button>
                <button class="filter-btn" data-filter="active">Active Only</button>
                <button class="filter-btn" data-filter="expired">Expired</button>
            </div>
            <div class="rank-filters">
                <h4>Filter by Rank:</h4>
                <div class="rank-filter-buttons">
                    <label class="rank-filter">
                        <input type="checkbox" value="POSTDOC" checked> Postdoc
                    </label>
                    <label class="rank-filter">
                        <input type="checkbox" value="PHD" checked> PhD
                    </label>
                    <label class="rank-filter">
                        <input type="checkbox" value="JUNIOR" checked> Junior
                    </label>
                    <label class="rank-filter">
                        <input type="checkbox" value="SENIOR" checked> Senior
                    </label>
                    <label class="rank-filter">
                        <input type="checkbox" value="OTHER" checked> Other
                    </label>
                </div>
            </div>
        </div>

        <div class="jobs-container" id="jobsContainer">
            ${activeJobs.map((job) => this.generateJobCard(job)).join("")}
            ${expiredJobs.map((job) => this.generateJobCard(job)).join("")}
        </div>

        ${
          jobs.length === 0
            ? `
          <div class="no-jobs">
            <h2>No jobs found</h2>
            <p>Check back later for new opportunities!</p>
          </div>`
            : ""
        }
    </main>

    <footer class="footer">
        <div class="container">
            <p>Data sourced from <a href="https://inspirehep.net" target="_blank">InspireHEP</a> • Updated daily</p>
            <p>&copy; 2025 <a href="https://melashri.net" target="_blank">Mohamed Elashri</a></p>
        </div>
    </footer>

    <!-- Job Details Modal -->
    <div id="jobModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalTitle"></h2>
                <button class="modal-close" id="modalClose">&times;</button>
            </div>
            <div class="modal-body">
                <div id="modalInstitution" class="modal-institution"></div>
                <div id="modalMeta" class="modal-meta"></div>
                <div id="modalDescription" class="modal-description"></div>
                <div id="modalActions" class="modal-actions"></div>
            </div>
        </div>
    </div>

    <!-- Description Preview Popup -->
    <div id="previewPopup" class="preview-popup">
        <div class="preview-popup-content">
            <button class="preview-close" id="previewClose">&times;</button>
            <div id="previewText" class="preview-text"></div>
            <button class="preview-view-full" id="previewViewFull">View Full Description</button>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>`;
  }

  // ============================================
  // MOCK DATA (FOR TESTING)
  // ============================================

  generateMockJobs() {
    this.log("Generating mock jobs for testing...", "warning");

    return [
      {
        id: "mock-1",
        title: "Postdoctoral Research Associate in High Energy Physics",
        institution: "CERN",
        deadline: "2024-12-31",
        description:
          "We are seeking a talented postdoctoral researcher to join our team working on LHC experiments. The successful candidate will contribute to data analysis and detector development.",
        regions: ["Europe"],
        ranks: ["Postdoc"],
        experiments: ["ATLAS", "CMS"],
        urls: ["https://jobs.cern.ch/job/12345"],
        contact_email: "jobs@cern.ch",
        created: "2024-07-01T10:00:00Z",
        updated: "2024-07-15T14:30:00Z",
      },
      {
        id: "mock-2",
        title: "Assistant Professor of Theoretical Physics",
        institution: "University of California, Berkeley",
        deadline: "2024-11-30",
        description:
          "The Department of Physics seeks an assistant professor specializing in theoretical high energy physics. Research areas of interest include string theory, quantum field theory, and cosmology.",
        regions: ["North America"],
        ranks: ["Faculty"],
        experiments: [],
        urls: ["https://aprecruit.berkeley.edu/12345"],
        contact_email: "physics-search@berkeley.edu",
        created: "2024-06-15T09:00:00Z",
        updated: "2024-07-01T16:20:00Z",
      },
      {
        id: "mock-3",
        title: "PhD Fellowship in Particle Physics",
        institution: "Max Planck Institute for Physics",
        deadline: "2024-10-15",
        description:
          "We offer a PhD position in experimental particle physics. The project involves analysis of data from the Belle II experiment at KEK.",
        regions: ["Europe"],
        ranks: ["PhD"],
        experiments: ["Belle II"],
        urls: ["https://www.mpp.mpg.de/jobs/phd-123"],
        contact_email: "phd-applications@mpp.mpg.de",
        created: "2024-05-20T11:30:00Z",
        updated: "2024-06-10T13:45:00Z",
      },
    ];
  }

  async build() {
    this.log("🚀 Starting HEP Jobs Tracker build process...");

    try {
      // Step 1: Test API connectivity first
      await this.testApiConnectivity();

      // Step 2: Fetch new jobs
      const newJobs = await this.fetchJobs();

      // Step 3: Load existing data and merge
      const existingData = this.loadExistingJobs();
      const mergedJobs = this.mergeJobs(newJobs, existingData);

      // Step 4: Save updated data
      this.saveJobs(mergedJobs);

      // Step 5: Generate static files
      this.log("Generating static website files...");

      const jobsData = {
        jobs: mergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: mergedJobs.length,
      };

      // Generate HTML
      const html = this.generateHTML(jobsData);
      fs.writeFileSync(path.join(this.config.docsDir, "index.html"), html);

      // Copy CSS from source
      const cssSource = path.join(__dirname, 'src/styles/main.css');
      const cssTarget = path.join(this.config.docsDir, 'style.css');
      fs.copyFileSync(cssSource, cssTarget);
      this.log("CSS copied from src/styles/main.css", "success");

      // Copy JavaScript from source
      const jsSource = path.join(__dirname, 'src/scripts/main.js');
      const jsTarget = path.join(this.config.docsDir, 'script.js');
      fs.copyFileSync(jsSource, jsTarget);
      this.log("JavaScript copied from src/scripts/main.js", "success");

      this.log(
        `✨ Build completed successfully! Generated website with ${mergedJobs.length} jobs`,
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
        const existingData = this.loadExistingJobs();

        if (existingData.jobs && existingData.jobs.length > 0) {
          const jobsData = {
            jobs: existingData.jobs,
            lastUpdated: existingData.lastUpdated,
            totalJobs: existingData.totalJobs,
          };

          // Generate HTML
          const html = this.generateHTML(jobsData);
          fs.writeFileSync(path.join(this.config.docsDir, "index.html"), html);

          // Copy CSS from source
          const cssSource = path.join(__dirname, 'src/styles/main.css');
          const cssTarget = path.join(this.config.docsDir, 'style.css');
          fs.copyFileSync(cssSource, cssTarget);
          this.log("CSS copied from src/styles/main.css", "success");

          // Copy JavaScript from source
          const jsSource = path.join(__dirname, 'src/scripts/main.js');
          const jsTarget = path.join(this.config.docsDir, 'script.js');
          fs.copyFileSync(jsSource, jsTarget);
          this.log("JavaScript copied from src/scripts/main.js", "success");

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

  async testApiConnectivity() {
    this.log("Testing InspireHEP API connectivity...");

    try {
      const testUrl = `${this.config.apiBase}/jobs?size=1`;
      this.log(`Testing URL: ${testUrl}`);

      const response = await fetch(testUrl);
      this.log(`API test response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`API test failed with status ${response.status}`);
      }

      const data = await response.json();
      this.log("✅ API connectivity test passed", "success");

      return true;
    } catch (error) {
      this.log(`⚠️  API connectivity test failed: ${error.message}`, "warning");
      this.log("Will proceed with mock data fallback...", "warning");
      return false;
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
