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
      docsDir: "./docs",
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

  truncateText(text, maxLength, suffix = "...") {
    if (!text) return "";
    if (text.length <= maxLength) return this.escapeHtml(text);
    return (
      this.escapeHtml(text.substring(0, maxLength - suffix.length)) + suffix
    );
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

    return `
      <div class="${cardClass}" data-id="${job.id}">
        <div class="job-header">
          <h3 class="job-title">${this.escapeHtml(job.title)}</h3>
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
            ${this.truncateText(job.description, 200)}
          </div>`
            : ""
        }

        <div class="job-actions">
          ${
            job.urls.length > 0
              ? `
            <a href="${job.urls[0]}" target="_blank" class="btn-apply">View Details</a>`
              : ""
          }
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
            <p>Data sourced from <a href="https://inspirehep.net" target="_blank">InspireHEP</a></p>
            <p>Updated automatically daily via GitHub Actions</p>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>`;
  }

  generateCSS() {
    return `:root {
    /* Light theme colors */
    --bg-primary: #f5f7fa;
    --bg-secondary: #ffffff;
    --bg-accent: rgba(255, 255, 255, 0.2);
    --text-primary: #333333;
    --text-secondary: #555555;
    --text-accent: #667eea;
    --border-color: #e1e5e9;
    --shadow-color: rgba(0, 0, 0, 0.1);
    --shadow-hover: rgba(0, 0, 0, 0.15);
    --gradient-start: #667eea;
    --gradient-end: #764ba2;
    --card-border: #667eea;
    --expired-border: #dc3545;
    --expired-text: #dc3545;
    --success-color: #28a745;
}

[data-theme="dark"] {
    /* Dark theme colors */
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --bg-accent: rgba(255, 255, 255, 0.1);
    --text-primary: #e0e0e0;
    --text-secondary: #b0b0b0;
    --text-accent: #7c93ff;
    --border-color: #2d3748;
    --shadow-color: rgba(0, 0, 0, 0.3);
    --shadow-hover: rgba(0, 0, 0, 0.4);
    --gradient-start: #4a5568;
    --gradient-end: #2d3748;
    --card-border: #7c93ff;
    --expired-border: #fc8181;
    --expired-text: #fc8181;
    --success-color: #68d391;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: var(--text-primary);
    background-color: var(--bg-primary);
    transition: background-color 0.3s ease, color 0.3s ease;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.header {
    background: linear-gradient(135deg, var(--gradient-start) 0%, var(--gradient-end) 100%);
    color: white;
    padding: 2rem 0;
    margin-bottom: 2rem;
}

.header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.clickable-title {
    font-size: 2.5rem;
    margin: 0;
    cursor: pointer;
    transition: transform 0.2s ease;
    text-decoration: none;
    color: inherit;
}

.clickable-title:hover {
    transform: scale(1.05);
}

.theme-toggle {
    background: var(--bg-accent);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 1.5rem;
}

.theme-toggle:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
}

.subtitle {
    font-size: 1.2rem;
    opacity: 0.9;
    margin-bottom: 1rem;
}

.stats {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.stat {
    background: var(--bg-accent);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.9rem;
    white-space: nowrap;
}

.filters {
    background: var(--bg-secondary);
    padding: 1.5rem;
    border-radius: 10px;
    box-shadow: 0 2px 10px var(--shadow-color);
    margin-bottom: 2rem;
    transition: background-color 0.3s ease, box-shadow 0.3s ease;
}

.search-input {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    font-size: 16px;
    margin-bottom: 1rem;
    transition: border-color 0.3s ease;
    background-color: var(--bg-secondary);
    color: var(--text-primary);
}

.search-input:focus {
    outline: none;
    border-color: var(--text-accent);
}

.filter-buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.filter-btn {
    padding: 0.5rem 1rem;
    border: 2px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.9rem;
}

.filter-btn:hover,
.filter-btn.active {
    background: var(--text-accent);
    color: white;
    border-color: var(--text-accent);
}

.jobs-container {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
}

.job-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 4px 15px var(--shadow-color);
    transition: transform 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease;
    border-left: 4px solid var(--card-border);
}

.job-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px var(--shadow-hover);
}

.job-card.expired {
    opacity: 0.7;
    border-left-color: var(--expired-border);
}

.job-header {
    margin-bottom: 1rem;
}

.job-title {
    font-size: 1.3rem;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
    line-height: 1.3;
}

.job-institution {
    color: var(--text-accent);
    font-weight: 500;
    font-size: 1.1rem;
}

.job-meta {
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
}

.job-meta > div {
    margin-bottom: 0.3rem;
}

.deadline.expired-text {
    color: var(--expired-text);
    font-weight: bold;
}

.job-description {
    background: var(--bg-primary);
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
}

.job-actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.btn-apply,
.btn-contact {
    padding: 0.6rem 1.2rem;
    border-radius: 6px;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.9rem;
    transition: all 0.3s ease;
    display: inline-block;
}

.btn-apply {
    background: var(--text-accent);
    color: white;
    border: none;
}

.btn-apply:hover {
    background: var(--card-border);
    transform: translateY(-1px);
}

.btn-contact {
    background: transparent;
    color: var(--text-accent);
    border: 1px solid var(--text-accent);
}

.btn-contact:hover {
    background: var(--text-accent);
    color: white;
}

.no-jobs {
    text-align: center;
    padding: 3rem;
    background: var(--bg-secondary);
    border-radius: 12px;
    box-shadow: 0 4px 15px var(--shadow-color);
    color: var(--text-primary);
}

.footer {
    background: var(--bg-secondary);
    color: var(--text-primary);
    padding: 2rem 0;
    margin-top: 3rem;
    text-align: center;
    border-top: 1px solid var(--border-color);
}

.footer a {
    color: var(--text-accent);
    text-decoration: none;
    transition: color 0.3s ease;
}

.footer a:hover {
    text-decoration: underline;
}

.hidden {
    display: none !important;
}

/* ============================================ */
/* RESPONSIVE DESIGN */
/* ============================================ */

/* Large screens (desktops) */
@media (min-width: 1200px) {
    .container {
        max-width: 1400px;
    }
    
    .jobs-container {
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    }
}

/* Medium screens (tablets) */
@media (max-width: 1024px) {
    .container {
        padding: 0 15px;
    }
    
    .jobs-container {
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1rem;
    }
    
    .clickable-title {
        font-size: 2rem;
    }
    
    .header {
        padding: 1.5rem 0;
    }
    
    .stats {
        gap: 0.5rem;
    }
    
    .stat {
        font-size: 0.8rem;
        padding: 0.4rem 0.8rem;
    }
}

/* Small tablets */
@media (max-width: 768px) {
    .header-top {
        flex-direction: column;
        gap: 1rem;
        align-items: center;
    }
    
    .clickable-title {
        font-size: 1.8rem;
        text-align: center;
    }
    
    .theme-toggle {
        width: 45px;
        height: 45px;
        font-size: 1.3rem;
    }
    
    .jobs-container {
        grid-template-columns: 1fr;
    }
    
    .subtitle {
        font-size: 1rem;
        text-align: center;
    }
    
    .stats {
        justify-content: center;
        gap: 0.5rem;
    }
    
    .filters {
        padding: 1rem;
    }
    
    .filter-buttons {
        justify-content: center;
        gap: 0.5rem;
    }
    
    .filter-btn {
        font-size: 0.8rem;
        padding: 0.4rem 0.8rem;
    }
}

/* Mobile phones */
@media (max-width: 480px) {
    .container {
        padding: 0 10px;
    }
    
    .header {
        padding: 1rem 0;
        margin-bottom: 1rem;
    }
    
    .clickable-title {
        font-size: 1.5rem;
    }
    
    .theme-toggle {
        width: 40px;
        height: 40px;
        font-size: 1.2rem;
    }
    
    .subtitle {
        font-size: 0.9rem;
    }
    
    .stats {
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
    }
    
    .stat {
        font-size: 0.7rem;
        padding: 0.3rem 0.6rem;
    }
    
    .search-input {
        font-size: 14px;
        padding: 10px 12px;
    }
    
    .filter-buttons {
        flex-direction: column;
        align-items: center;
    }
    
    .filter-btn {
        width: 100%;
        max-width: 200px;
        text-align: center;
    }
    
    .job-card {
        padding: 1rem;
    }
    
    .job-title {
        font-size: 1.1rem;
    }
    
    .job-institution {
        font-size: 1rem;
    }
    
    .job-actions {
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .btn-apply,
    .btn-contact {
        width: 100%;
        text-align: center;
        padding: 0.8rem;
    }
    
    .footer {
        padding: 1.5rem 0;
        font-size: 0.9rem;
    }
}

/* Extra small screens */
@media (max-width: 360px) {
    .clickable-title {
        font-size: 1.3rem;
    }
    
    .job-meta {
        font-size: 0.8rem;
    }
    
    .job-description {
        font-size: 0.8rem;
        padding: 0.8rem;
    }
}`;
  }

  generateJS() {
    return `class JobsApp {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.filterButtons = document.querySelectorAll('.filter-btn');
        this.jobsContainer = document.getElementById('jobsContainer');
        this.allJobs = Array.from(document.querySelectorAll('.job-card'));
        this.themeToggle = document.getElementById('themeToggle');
        
        this.initEventListeners();
        this.initTheme();
    }

    initEventListeners() {
        this.searchInput.addEventListener('input', () => this.filterJobs());
        
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target));
        });

        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    initTheme() {
        // Check for saved theme preference or default to light mode
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Update theme toggle icon
        const themeIcon = this.themeToggle.querySelector('.theme-icon');
        themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
        
        // Update toggle button aria-label
        this.themeToggle.setAttribute('aria-label', 
            theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
        );
    }

    setFilter(button) {
        this.filterButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.filterJobs();
    }

    filterJobs() {
        const searchTerm = this.searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
        
        this.allJobs.forEach(job => {
            const matchesSearch = this.matchesSearchTerm(job, searchTerm);
            const matchesFilter = this.matchesFilter(job, activeFilter);
            
            if (matchesSearch && matchesFilter) {
                job.classList.remove('hidden');
            } else {
                job.classList.add('hidden');
            }
        });
    }

    matchesSearchTerm(job, searchTerm) {
        if (!searchTerm) return true;
        return job.textContent.toLowerCase().includes(searchTerm);
    }

    matchesFilter(job, filter) {
        switch (filter) {
            case 'active':
                return !job.classList.contains('expired');
            case 'expired':
                return job.classList.contains('expired');
            case 'all':
            default:
                return true;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new JobsApp();
});`;
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

      // Generate CSS
      const css = this.generateCSS();
      fs.writeFileSync(path.join(this.config.docsDir, "style.css"), css);

      // Generate JavaScript
      const js = this.generateJS();
      fs.writeFileSync(path.join(this.config.docsDir, "script.js"), js);

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

          // Generate CSS
          const css = this.generateCSS();
          fs.writeFileSync(path.join(this.config.docsDir, "style.css"), css);

          // Generate JavaScript
          const js = this.generateJS();
          fs.writeFileSync(path.join(this.config.docsDir, "script.js"), js);

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