#!/usr/bin/env node

/**
 * HEP Jobs Tracker - Unified Build Script
 * Fetches jobs from InspireHEP API and generates static website
 * Zero dependencies - uses only Node.js built-ins
 */

const fs = require('fs');
const path = require('path');

class HEPJobsTracker {
  constructor() {
    this.config = {
      apiBase: 'https://inspirehep.net/api',
      dataDir: './data',
      docsDir: './docs',
      jobsFile: './data/jobs.json',
      maxJobs: 200,
      daysBack: 30
    };
    
    this.ensureDirectories();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  ensureDirectories() {
    [this.config.dataDir, this.config.docsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }[type];
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  formatDate(dateString, options = {}) {
    if (!dateString) return 'No deadline';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        ...options
      });
    } catch (error) {
      return 'Invalid date';
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
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  truncateText(text, maxLength, suffix = '...') {
    if (!text) return '';
    if (text.length <= maxLength) return this.escapeHtml(text);
    return this.escapeHtml(text.substring(0, maxLength - suffix.length)) + suffix;
  }

  // ============================================
  // DATA FETCHING
  // ============================================

  async fetchJobs() {
    this.log('Fetching jobs from InspireHEP API...');
    
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - this.config.daysBack);
      
      const params = new URLSearchParams({
        sort: 'mostrecent',
        size: 100,
        q: `deadline:>${startDate.toISOString().split('T')[0]}`
      });

      const response = await fetch(`${this.config.apiBase}/jobs?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const processedJobs = this.processJobs(data.hits.hits);
      
      this.log(`Fetched ${processedJobs.length} jobs from API`, 'success');
      return processedJobs;
      
    } catch (error) {
      this.log(`Error fetching jobs: ${error.message}`, 'error');
      return [];
    }
  }

  processJobs(jobs) {
    return jobs.map(job => {
      const metadata = job.metadata;
      return {
        id: job.id,
        title: this.cleanJobTitle(metadata.position),
        institution: this.extractInstitution(metadata.institutions),
        deadline: metadata.deadline_date,
        description: metadata.description?.value || '',
        regions: metadata.regions || [],
        ranks: metadata.ranks || [],
        experiments: metadata.accelerator_experiments?.map(exp => exp.name) || [],
        urls: metadata.urls?.map(url => url.value) || [],
        contact_email: metadata.contact_details?.[0]?.email,
        created: metadata.creation_date || job.created,
        updated: metadata.update_date || job.updated
      };
    });
  }

  extractInstitution(institutions) {
    if (!institutions || institutions.length === 0) return 'Unknown Institution';
    return institutions[0].value || institutions[0].name || 'Unknown Institution';
  }

  cleanJobTitle(title) {
    if (!title) return 'Untitled Position';
    return title.replace(/\s+/g, ' ').trim();
  }

  // ============================================
  // DATA MANAGEMENT
  // ============================================

  loadExistingJobs() {
    try {
      if (fs.existsSync(this.config.jobsFile)) {
        const data = fs.readFileSync(this.config.jobsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.log(`Error loading existing jobs: ${error.message}`, 'warning');
    }
    return { jobs: [], lastUpdated: null, totalJobs: 0 };
  }

  mergeJobs(newJobs, existingData) {
    const existingJobs = existingData.jobs || [];
    const existingIds = new Set(existingJobs.map(job => job.id));
    
    // Add new jobs that don't exist
    const uniqueNewJobs = newJobs.filter(job => !existingIds.has(job.id));
    
    // Combine and sort by creation date (newest first)
    const allJobs = [...existingJobs, ...uniqueNewJobs]
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(0, this.config.maxJobs);

    this.log(`Added ${uniqueNewJobs.length} new jobs, total: ${allJobs.length}`);
    return allJobs;
  }

  saveJobs(jobs) {
    const dataToSave = {
      jobs,
      lastUpdated: new Date().toISOString(),
      totalJobs: jobs.length
    };

    fs.writeFileSync(this.config.jobsFile, JSON.stringify(dataToSave, null, 2));
    this.log(`Saved ${jobs.length} jobs to database`, 'success');
  }

  // ============================================
  // HTML GENERATION
  // ============================================

  generateJobCard(job) {
    const deadline = this.formatDate(job.deadline);
    const isExpired = this.isExpired(job.deadline);
    const cardClass = isExpired ? 'job-card expired' : 'job-card';
    
    return `
      <div class="${cardClass}" data-id="${job.id}">
        <div class="job-header">
          <h3 class="job-title">${this.escapeHtml(job.title)}</h3>
          <div class="job-institution">${this.escapeHtml(job.institution)}</div>
        </div>
        
        <div class="job-meta">
          <div class="deadline ${isExpired ? 'expired-text' : ''}">
            <strong>Deadline:</strong> ${deadline}
          </div>
          ${job.regions.length > 0 ? `
            <div class="regions">
              <strong>Regions:</strong> ${job.regions.join(', ')}
            </div>` : ''}
          ${job.ranks.length > 0 ? `
            <div class="ranks">
              <strong>Ranks:</strong> ${job.ranks.join(', ')}
            </div>` : ''}
          ${job.experiments.length > 0 ? `
            <div class="experiments">
              <strong>Experiments:</strong> ${job.experiments.slice(0, 3).join(', ')}
              ${job.experiments.length > 3 ? ` (+${job.experiments.length - 3} more)` : ''}
            </div>` : ''}
        </div>

        ${job.description ? `
          <div class="job-description">
            ${this.truncateText(job.description, 200)}
          </div>` : ''}

        <div class="job-actions">
          ${job.urls.length > 0 ? `
            <a href="${job.urls[0]}" target="_blank" class="btn-apply">View Details</a>` : ''}
          ${job.contact_email ? `
            <a href="mailto:${job.contact_email}" class="btn-contact">Contact</a>` : ''}
        </div>
      </div>`;
  }

  generateHTML(jobsData) {
    const { jobs, lastUpdated, totalJobs } = jobsData;
    const updateTime = lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never';
    
    const activeJobs = jobs.filter(job => !this.isExpired(job.deadline));
    const expiredJobs = jobs.filter(job => this.isExpired(job.deadline));
    
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
            <h1>🔬 HEP Jobs Tracker</h1>
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
            ${activeJobs.map(job => this.generateJobCard(job)).join('')}
            ${expiredJobs.map(job => this.generateJobCard(job)).join('')}
        </div>

        ${jobs.length === 0 ? `
          <div class="no-jobs">
            <h2>No jobs found</h2>
            <p>Check back later for new opportunities!</p>
          </div>` : ''}
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
    return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f5f7fa;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem 0;
    margin-bottom: 2rem;
}

.header h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
}

.subtitle {
    font-size: 1.2rem;
    opacity: 0.9;
    margin-bottom: 1rem;
}

.stats {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
}

.stat {
    background: rgba(255, 255, 255, 0.2);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.9rem;
}

.filters {
    background: white;
    padding: 1.5rem;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
}

.search-input {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e1e5e9;
    border-radius: 8px;
    font-size: 16px;
    margin-bottom: 1rem;
    transition: border-color 0.3s;
}

.search-input:focus {
    outline: none;
    border-color: #667eea;
}

.filter-buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.filter-btn {
    padding: 0.5rem 1rem;
    border: 2px solid #e1e5e9;
    background: white;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s;
}

.filter-btn:hover,
.filter-btn.active {
    background: #667eea;
    color: white;
    border-color: #667eea;
}

.jobs-container {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
}

.job-card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s, box-shadow 0.3s;
    border-left: 4px solid #667eea;
}

.job-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.job-card.expired {
    opacity: 0.7;
    border-left-color: #dc3545;
}

.job-header {
    margin-bottom: 1rem;
}

.job-title {
    font-size: 1.3rem;
    color: #2c3e50;
    margin-bottom: 0.5rem;
    line-height: 1.3;
}

.job-institution {
    color: #667eea;
    font-weight: 500;
    font-size: 1.1rem;
}

.job-meta {
    margin-bottom: 1rem;
    font-size: 0.9rem;
}

.job-meta > div {
    margin-bottom: 0.3rem;
}

.deadline.expired-text {
    color: #dc3545;
    font-weight: bold;
}

.job-description {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: #555;
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
    transition: all 0.3s;
}

.btn-apply {
    background: #667eea;
    color: white;
}

.btn-apply:hover {
    background: #5a6fd8;
}

.btn-contact {
    background: transparent;
    color: #667eea;
    border: 1px solid #667eea;
}

.btn-contact:hover {
    background: #667eea;
    color: white;
}

.no-jobs {
    text-align: center;
    padding: 3rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.footer {
    background: #2c3e50;
    color: white;
    padding: 2rem 0;
    margin-top: 3rem;
    text-align: center;
}

.footer a {
    color: #667eea;
    text-decoration: none;
}

.footer a:hover {
    text-decoration: underline;
}

.hidden {
    display: none !important;
}

@media (max-width: 768px) {
    .jobs-container {
        grid-template-columns: 1fr;
    }
    
    .header h1 {
        font-size: 2rem;
    }
    
    .stats {
        gap: 1rem;
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
        
        this.initEventListeners();
    }

    initEventListeners() {
        this.searchInput.addEventListener('input', () => this.filterJobs());
        
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target));
        });
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
  // BUILD PROCESS
  // ============================================

  async build() {
    this.log('🚀 Starting HEP Jobs Tracker build process...');

    try {
      // Step 1: Fetch new jobs
      const newJobs = await this.fetchJobs();
      
      // Step 2: Load existing data and merge
      const existingData = this.loadExistingJobs();
      const mergedJobs = this.mergeJobs(newJobs, existingData);
      
      // Step 3: Save updated data
      this.saveJobs(mergedJobs);
      
      // Step 4: Generate static files
      this.log('Generating static website files...');
      
      const jobsData = {
        jobs: mergedJobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: mergedJobs.length
      };

      // Generate HTML
      const html = this.generateHTML(jobsData);
      fs.writeFileSync(path.join(this.config.docsDir, 'index.html'), html);
      
      // Generate CSS
      const css = this.generateCSS();
      fs.writeFileSync(path.join(this.config.docsDir, 'style.css'), css);
      
      // Generate JavaScript
      const js = this.generateJS();
      fs.writeFileSync(path.join(this.config.docsDir, 'script.js'), js);
      
      this.log(`✨ Build completed successfully! Generated website with ${mergedJobs.length} jobs`, 'success');
      
    } catch (error) {
      this.log(`Build failed: ${error.message}`, 'error');
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
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = HEPJobsTracker;