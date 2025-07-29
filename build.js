#!/usr/bin/env node

/**
 * HEP Jobs Tracker - Unified Build Script
 * Fetches jobs from InspireHEP API and generates static website
 * Zero dependencies - uses only Node.js built-ins
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

class HEPJobsTracker {
  constructor() {
    this.config = {
      apiBase: 'https://inspirehep.net/api',
      dataDir: path.resolve('./data'),
      docsDir: path.resolve('./docs'),
      jobsFile: path.resolve('./data/jobs.json'),
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
      if (isNaN(date.getTime())) return 'Invalid date';
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
      const deadline = new Date(deadlineString);
      return !isNaN(deadline.getTime()) && deadline < new Date();
    } catch (error) {
      return false;
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  truncateText(text, maxLength, suffix = '...') {
    if (!text) return '';
    const cleanText = String(text);
    if (cleanText.length <= maxLength) return this.escapeHtml(cleanText);
    return this.escapeHtml(cleanText.substring(0, maxLength - suffix.length)) + suffix;
  }

  // ============================================
  // HTTP CLIENT (FETCH REPLACEMENT)
  // ============================================

  httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'HEP-Jobs-Tracker/1.0',
          'Accept': 'application/json',
          ...options.headers
        }
      };

      const client = parsedUrl.protocol === 'https:' ? https : require('http');
      
      const req = client.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = {
              status: res.statusCode,
              statusText: res.statusMessage,
              ok: res.statusCode >= 200 && res.statusCode < 300,
              json: () => Promise.resolve(JSON.parse(data)),
              text: () => Promise.resolve(data)
            };
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  // ============================================
  // DATA FETCHING
  // ============================================

  async fetchJobs() {
    this.log('Fetching jobs from InspireHEP API...');
    
    try {
      // Build API query with proper parameters
      const params = new URLSearchParams({
        sort: 'mostrecent',
        size: '100',
        q: 'doc_type:job' // Ensure we're getting job documents
      });

      const apiUrl = `${this.config.apiBase}/jobs?${params}`;
      this.log(`API URL: ${apiUrl}`);
      
      const response = await this.httpRequest(apiUrl);
      
      this.log(`HTTP Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        this.log(`Response body: ${errorText}`, 'error');
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      this.log(`Raw API response structure: ${JSON.stringify(Object.keys(data))}`);
      
      if (data.hits && Array.isArray(data.hits.hits)) {
        this.log(`Total jobs available: ${data.hits.total || data.hits.hits.length}`);
        this.log(`Jobs in this response: ${data.hits.hits.length}`);
        
        // Log first job structure for debugging
        if (data.hits.hits.length > 0) {
          const firstJob = data.hits.hits[0];
          this.log(`First job keys: ${JSON.stringify(Object.keys(firstJob))}`);
          if (firstJob.metadata) {
            this.log(`First job metadata keys: ${JSON.stringify(Object.keys(firstJob.metadata))}`);
          }
        }
        
        const processedJobs = this.processJobs(data.hits.hits);
        this.log(`Fetched ${processedJobs.length} jobs from API`, 'success');
        return processedJobs;
        
      } else {
        this.log(`Unexpected response structure: ${JSON.stringify(data, null, 2)}`, 'warning');
        throw new Error('Unexpected API response structure');
      }
      
    } catch (error) {
      this.log(`Error fetching jobs: ${error.message}`, 'error');
      this.log(`Error stack: ${error.stack}`, 'error');
      
      // Use mock data for testing if API fails
      this.log('API failed, using mock data for testing...', 'warning');
      return this.generateMockJobs();
    }
  }

  processJobs(jobs) {
    if (!Array.isArray(jobs)) {
      this.log('Jobs data is not an array', 'warning');
      return [];
    }

    return jobs.map((job, index) => {
      try {
        const metadata = job.metadata || job;
        
        // Log structure of first job for debugging
        if (index === 0) {
          this.log(`Processing first job - available fields: ${JSON.stringify(Object.keys(metadata))}`);
        }
        
        return {
          id: job.id || metadata.control_number || `job-${Date.now()}-${index}`,
          title: this.cleanJobTitle(
            metadata.position || 
            metadata.title?.title || 
            metadata.titles?.[0]?.title || 
            'Untitled Position'
          ),
          institution: this.extractInstitution(metadata.institutions),
          deadline: metadata.deadline_date || metadata.deadline || null,
          description: this.extractDescription(metadata),
          regions: this.ensureArray(metadata.regions),
          ranks: this.ensureArray(metadata.ranks),
          experiments: this.extractExperiments(metadata.accelerator_experiments),
          urls: this.extractUrls(metadata),
          contact_email: this.extractContactEmail(metadata),
          created: metadata.creation_date || metadata.created || job.created || new Date().toISOString(),
          updated: metadata.update_date || metadata.updated || job.updated || new Date().toISOString()
        };
      } catch (error) {
        this.log(`Error processing job ${index}: ${error.message}`, 'warning');
        return null;
      }
    }).filter(job => job !== null);
  }

  ensureArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  extractExperiments(experiments) {
    if (!experiments || !Array.isArray(experiments)) return [];
    return experiments.map(exp => {
      if (typeof exp === 'string') return exp;
      return exp.name || exp.value || exp.legacy_name || String(exp);
    }).filter(Boolean);
  }

  extractDescription(metadata) {
    if (metadata.description?.value) return metadata.description.value;
    if (typeof metadata.description === 'string') return metadata.description;
    if (metadata.abstract?.value) return metadata.abstract.value;
    if (typeof metadata.abstract === 'string') return metadata.abstract;
    return '';
  }

  extractUrls(metadata) {
    const urls = [];
    
    if (metadata.urls && Array.isArray(metadata.urls)) {
      urls.push(...metadata.urls.map(url => {
        if (typeof url === 'string') return url;
        return url.value || url.url || null;
      }).filter(Boolean));
    } else if (typeof metadata.urls === 'string') {
      urls.push(metadata.urls);
    }
    
    if (metadata.reference_urls && Array.isArray(metadata.reference_urls)) {
      urls.push(...metadata.reference_urls.map(url => {
        if (typeof url === 'string') return url;
        return url.value || url.url || null;
      }).filter(Boolean));
    }
    
    return urls.filter(url => url && typeof url === 'string');
  }

  extractContactEmail(metadata) {
    if (metadata.contact_details && Array.isArray(metadata.contact_details)) {
      const contact = metadata.contact_details.find(c => c.email);
      if (contact) return contact.email;
    }
    
    if (metadata.contact_email) return metadata.contact_email;
    if (metadata.email) return metadata.email;
    
    return null;
  }

  extractInstitution(institutions) {
    if (!institutions || !Array.isArray(institutions) || institutions.length === 0) {
      return 'Unknown Institution';
    }
    
    const institution = institutions[0];
    if (typeof institution === 'string') return institution;
    return institution.value || institution.name || 'Unknown Institution';
  }

  cleanJobTitle(title) {
    if (!title) return 'Untitled Position';
    return String(title).replace(/\s+/g, ' ').trim();
  }

  // ============================================
  // DATA MANAGEMENT
  // ============================================

  loadExistingJobs() {
    try {
      if (fs.existsSync(this.config.jobsFile)) {
        const data = fs.readFileSync(this.config.jobsFile, 'utf8');
        const parsed = JSON.parse(data);
        
        // Validate structure
        if (!parsed.jobs || !Array.isArray(parsed.jobs)) {
          this.log('Invalid existing jobs file structure', 'warning');
          return { jobs: [], lastUpdated: null, totalJobs: 0 };
        }
        
        return parsed;
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
      .sort((a, b) => {
        const dateA = new Date(a.created || 0);
        const dateB = new Date(b.created || 0);
        return dateB - dateA;
      })
      .slice(0, this.config.maxJobs);

    this.log(`Added ${uniqueNewJobs.length} new jobs, total: ${allJobs.length}`);
    return allJobs;
  }

  saveJobs(jobs) {
    try {
      const dataToSave = {
        jobs,
        lastUpdated: new Date().toISOString(),
        totalJobs: jobs.length
      };

      fs.writeFileSync(this.config.jobsFile, JSON.stringify(dataToSave, null, 2));
      this.log(`Saved ${jobs.length} jobs to database`, 'success');
    } catch (error) {
      this.log(`Error saving jobs: ${error.message}`, 'error');
      throw error;
    }
  }

  // ============================================
  // HTML GENERATION
  // ============================================

  generateJobCard(job) {
    const deadline = this.formatDate(job.deadline);
    const isExpired = this.isExpired(job.deadline);
    const cardClass = isExpired ? 'job-card expired' : 'job-card';
    
    return `
      <div class="${cardClass}" data-id="${this.escapeHtml(job.id)}">
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
              <strong>Regions:</strong> ${job.regions.map(r => this.escapeHtml(r)).join(', ')}
            </div>` : ''}
          ${job.ranks.length > 0 ? `
            <div class="ranks">
              <strong>Ranks:</strong> ${job.ranks.map(r => this.escapeHtml(r)).join(', ')}
            </div>` : ''}
          ${job.experiments.length > 0 ? `
            <div class="experiments">
              <strong>Experiments:</strong> ${job.experiments.slice(0, 3).map(e => this.escapeHtml(e)).join(', ')}
              ${job.experiments.length > 3 ? ` (+${job.experiments.length - 3} more)` : ''}
            </div>` : ''}
        </div>

        ${job.description ? `
          <div class="job-description">
            ${this.truncateText(job.description, 200)}
          </div>` : ''}

        <div class="job-actions">
          ${job.urls.length > 0 ? `
            <a href="${this.escapeHtml(job.urls[0])}" target="_blank" rel="noopener noreferrer" class="btn-apply">View Details</a>` : ''}
          ${job.contact_email ? `
            <a href="mailto:${this.escapeHtml(job.contact_email)}" class="btn-contact">Contact</a>` : ''}
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
    <meta name="description" content="Latest High Energy Physics job opportunities from InspireHEP">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header class="header">
        <div class="container">
            <div class="header-top">
                <div class="header-content">
                    <h1>🔬 HEP Jobs Tracker</h1>
                    <p class="subtitle">Latest High Energy Physics Job Opportunities</p>
                </div>
                <button id="darkModeToggle" class="dark-mode-toggle" aria-label="Toggle dark mode">
                    <span class="toggle-icon">🌙</span>
                </button>
            </div>
            <div class="stats">
                <span class="stat">Total Jobs: ${totalJobs}</span>
                <span class="stat">Active: ${activeJobs.length}</span>
                <span class="stat">Last Updated: ${this.escapeHtml(updateTime)}</span>
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
            <div class="pagination-controls">
                <div class="results-info">
                    <span id="resultsInfo">Showing 0 of 0 jobs</span>
                </div>
                <div class="page-size-selector">
                    <label for="pageSize">Jobs per page:</label>
                    <select id="pageSize">
                        <option value="12">12</option>
                        <option value="24" selected>24</option>
                        <option value="48">48</option>
                        <option value="96">96</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="jobs-container" id="jobsContainer">
            ${activeJobs.map(job => this.generateJobCard(job)).join('')}
            ${expiredJobs.map(job => this.generateJobCard(job)).join('')}
        </div>

        <div class="pagination" id="pagination">
            <!-- Pagination buttons will be generated by JavaScript -->
        </div>

        ${jobs.length === 0 ? `
          <div class="no-jobs">
            <h2>No jobs found</h2>
            <p>Check back later for new opportunities!</p>
          </div>` : ''}
    </main>

    <footer class="footer">
        <div class="container">
            <p>Data sourced from <a href="https://inspirehep.net" target="_blank" rel="noopener noreferrer">InspireHEP</a></p>
            <p>Updated automatically daily via GitHub Actions</p>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>`;
  }

  generateCSS() {
    return `:root {
    --primary-color: #667eea;
    --primary-dark: #5a6fd8;
    --secondary-color: #764ba2;
    --accent-color: #f093fb;
    --success-color: #28a745;
    --danger-color: #dc3545;
    --warning-color: #ffc107;
    --light-gray: #f8f9fa;
    --medium-gray: #e1e5e9;
    --dark-gray: #6c757d;
    --text-color: #333;
    --bg-color: #f5f7fa;
    --card-bg: #ffffff;
    --border-color: #e1e5e9;
    --shadow-light: 0 2px 10px rgba(0, 0, 0, 0.1);
    --shadow-medium: 0 4px 15px rgba(0, 0, 0, 0.1);
    --shadow-heavy: 0 8px 25px rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] {
    --text-color: #e8e8e8;
    --bg-color: #1a1a1a;
    --card-bg: #2d2d2d;
    --border-color: #404040;
    --light-gray: #2d2d2d;
    --medium-gray: #404040;
    --dark-gray: #666;
    --shadow-light: 0 2px 10px rgba(0, 0, 0, 0.3);
    --shadow-medium: 0 4px 15px rgba(0, 0, 0, 0.3);
    --shadow-heavy: 0 8px 25px rgba(0, 0, 0, 0.4);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: var(--text-color);
    background-color: var(--bg-color);
    transition: background-color 0.3s ease, color 0.3s ease;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.header {
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    color: white;
    padding: 2rem 0;
    margin-bottom: 2rem;
}

.header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
}

.header-content h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
}

.subtitle {
    font-size: 1.2rem;
    opacity: 0.9;
}

.dark-mode-toggle {
    background: rgba(255, 255, 255, 0.2);
    border: none;
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

.dark-mode-toggle:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
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
    background: var(--card-bg);
    padding: 1.5rem;
    border-radius: 10px;
    box-shadow: var(--shadow-medium);
    margin-bottom: 2rem;
    transition: background-color 0.3s ease;
}

.search-input {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    font-size: 16px;
    margin-bottom: 1rem;
    transition: border-color 0.3s;
    background: var(--card-bg);
    color: var(--text-color);
}

.search-input:focus {
    outline: none;
    border-color: var(--primary-color);
}

.filter-buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
}

.filter-btn {
    padding: 0.5rem 1rem;
    border: 2px solid var(--border-color);
    background: var(--card-bg);
    color: var(--text-color);
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s;
}

.filter-btn:hover,
.filter-btn.active {
    background: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
}

.pagination-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
}

.page-size-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.page-size-selector label {
    font-size: 0.9rem;
    color: var(--dark-gray);
}

.page-size-selector select {
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--card-bg);
    color: var(--text-color);
}

.results-info {
    font-size: 0.9rem;
    color: var(--dark-gray);
}

.jobs-container {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    margin-bottom: 2rem;
}

.job-card {
    background: var(--card-bg);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: var(--shadow-medium);
    transition: transform 0.3s, box-shadow 0.3s, background-color 0.3s ease;
    border-left: 4px solid var(--primary-color);
}

.job-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-heavy);
}

.job-card.expired {
    opacity: 0.7;
    border-left-color: var(--danger-color);
}

.job-header {
    margin-bottom: 1rem;
}

.job-title {
    font-size: 1.3rem;
    color: var(--text-color);
    margin-bottom: 0.5rem;
    line-height: 1.3;
}

.job-institution {
    color: var(--primary-color);
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
    color: var(--danger-color);
    font-weight: bold;
}

.job-description {
    background: var(--light-gray);
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: var(--dark-gray);
    transition: background-color 0.3s ease;
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
    background: var(--primary-color);
    color: white;
}

.btn-apply:hover {
    background: var(--primary-dark);
}

.btn-contact {
    background: transparent;
    color: var(--primary-color);
    border: 1px solid var(--primary-color);
}

.btn-contact:hover {
    background: var(--primary-color);
    color: white;
}

.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin: 2rem 0;
    flex-wrap: wrap;
}

.pagination button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    background: var(--card-bg);
    color: var(--text-color);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s;
    min-width: 40px;
}

.pagination button:hover:not(:disabled) {
    background: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
}

.pagination button.active {
    background: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
}

.pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.pagination .page-info {
    margin: 0 1rem;
    font-size: 0.9rem;
    color: var(--dark-gray);
}

.page-ellipsis {
    padding: 0.5rem;
    color: var(--dark-gray);
    font-size: 0.9rem;
}

.no-jobs {
    text-align: center;
    padding: 3rem;
    background: var(--card-bg);
    border-radius: 12px;
    box-shadow: var(--shadow-medium);
    transition: background-color 0.3s ease;
}

.footer {
    background: #2c3e50;
    color: white;
    padding: 2rem 0;
    margin-top: 3rem;
}

.footer a {
    color: var(--primary-color);
    text-decoration: none;
}

.footer a:hover {
    text-decoration: underline;
}

.hidden {
    display: none !important;
}

/* Dark mode specific adjustments */
[data-theme="dark"] .search-input::placeholder {
    color: #999;
}

[data-theme="dark"] .job-description {
    color: #ccc;
}

[data-theme="dark"] .dark-mode-toggle .toggle-icon {
    filter: grayscale(1) brightness(1.2);
}

@media (max-width: 768px) {
    .jobs-container {
        grid-template-columns: 1fr;
    }
    
    .header-content h1 {
        font-size: 2rem;
    }
    
    .header-top {
        flex-direction: column;
        gap: 1rem;
        align-items: center;
    }
    
    .stats {
        gap: 1rem;
        justify-content: center;
    }
    
    .pagination-controls {
        flex-direction: column;
        align-items: stretch;
        text-align: center;
    }
    
    .pagination {
        gap: 0.3rem;
    }
    
    .pagination button {
        padding: 0.4rem 0.8rem;
        min-width: 35px;
    }
}`;
  }

  generateJS() {
    return `class JobsApp {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.filterButtons = document.querySelectorAll('.filter-btn');
        this.jobsContainer = document.getElementById('jobsContainer');
        this.paginationContainer = document.getElementById('pagination');
        this.resultsInfo = document.getElementById('resultsInfo');
        this.pageSizeSelect = document.getElementById('pageSize');
        this.darkModeToggle = document.getElementById('darkModeToggle');
        
        this.allJobs = Array.from(document.querySelectorAll('.job-card'));
        this.filteredJobs = [...this.allJobs];
        this.currentPage = 1;
        this.pageSize = 24;
        
        this.initEventListeners();
        this.initDarkMode();
        this.updateDisplay();
    }

    initEventListeners() {
        // Search and filter events
        this.searchInput.addEventListener('input', () => this.handleFilterChange());
        
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target));
        });

        // Pagination events
        this.pageSizeSelect.addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.updateDisplay();
        });

        // Dark mode toggle
        this.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
    }

    // ============================================
    // DARK MODE FUNCTIONALITY
    // ============================================

    initDarkMode() {
        // Check for saved theme preference or default to light mode
        const savedTheme = this.getStoredTheme() || 'light';
        this.setTheme(savedTheme);
    }

    getStoredTheme() {
        try {
            return localStorage.getItem('theme');
        } catch (e) {
            // localStorage might not be available
            return null;
        }
    }

    storeTheme(theme) {
        try {
            localStorage.setItem('theme', theme);
        } catch (e) {
            // localStorage might not be available
            console.warn('Could not save theme preference');
        }
    }

    toggleDarkMode() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.storeTheme(theme);
        
        // Update toggle button icon
        const toggleIcon = this.darkModeToggle.querySelector('.toggle-icon');
        if (toggleIcon) {
            toggleIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
        
        // Update toggle button title
        this.darkModeToggle.setAttribute('aria-label', 
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        );
    }

    // ============================================
    // FILTERING FUNCTIONALITY
    // ============================================

    setFilter(button) {
        this.filterButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.handleFilterChange();
    }

    handleFilterChange() {
        this.currentPage = 1;
        this.filterJobs();
        this.updateDisplay();
    }

    filterJobs() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        
        this.filteredJobs = this.allJobs.filter(job => {
            const matchesSearch = this.matchesSearchTerm(job, searchTerm);
            const matchesFilter = this.matchesFilter(job, activeFilter);
            return matchesSearch && matchesFilter;
        });
    }

    matchesSearchTerm(job, searchTerm) {
        if (!searchTerm) return true;
        const jobText = job.textContent.toLowerCase();
        return jobText.includes(searchTerm);
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

    // ============================================
    // PAGINATION FUNCTIONALITY
    // ============================================

    updateDisplay() {
        this.hideAllJobs();
        this.showCurrentPageJobs();
        this.updateResultsInfo();
        this.updatePagination();
    }

    hideAllJobs() {
        this.allJobs.forEach(job => job.classList.add('hidden'));
    }

    showCurrentPageJobs() {
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        
        this.filteredJobs
            .slice(startIndex, endIndex)
            .forEach(job => job.classList.remove('hidden'));
    }

    updateResultsInfo() {
        const totalFiltered = this.filteredJobs.length;
        const startIndex = totalFiltered === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(this.currentPage * this.pageSize, totalFiltered);
        
        this.resultsInfo.textContent = 
            \`Showing \${startIndex}-\${endIndex} of \${totalFiltered} jobs\`;
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredJobs.length / this.pageSize);
        
        if (totalPages <= 1) {
            this.paginationContainer.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        // Previous button
        paginationHTML += \`<button onclick="jobsApp.goToPage(\${this.currentPage - 1})" \${
            this.currentPage <= 1 ? 'disabled' : ''
        }>← Previous</button>\`;

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        if (startPage > 1) {
            paginationHTML += '<button onclick="jobsApp.goToPage(1)">1</button>';
            if (startPage > 2) {
                paginationHTML += '<span class="page-ellipsis">...</span>';
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === this.currentPage ? 'active' : '';
            paginationHTML += \`<button class="\${isActive}" onclick="jobsApp.goToPage(\${i})">\${i}</button>\`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += '<span class="page-ellipsis">...</span>';
            }
            paginationHTML += \`<button onclick="jobsApp.goToPage(\${totalPages})">\${totalPages}</button>\`;
        }

        // Next button
        paginationHTML += \`<button onclick="jobsApp.goToPage(\${this.currentPage + 1})" \${
            this.currentPage >= totalPages ? 'disabled' : ''
        }>Next →</button>\`;

        // Page info
        paginationHTML += \`<div class="page-info">Page \${this.currentPage} of \${totalPages}</div>\`;

        this.paginationContainer.innerHTML = paginationHTML;
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredJobs.length / this.pageSize);
        
        if (page < 1 || page > totalPages || page === this.currentPage) {
            return;
        }
        
        this.currentPage = page;
        this.updateDisplay();
        
        // Smooth scroll to top of jobs container
        this.jobsContainer.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    // ============================================
    // KEYBOARD SHORTCUTS
    // ============================================

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when not typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.goToPage(this.currentPage - 1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.goToPage(this.currentPage + 1);
                    break;
                case '/':
                    e.preventDefault();
                    this.searchInput.focus();
                    break;
                case 'Escape':
                    this.searchInput.blur();
                    break;
                case 'd':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.toggleDarkMode();
                    }
                    break;
            }
        });
    }
}

// Global variable for pagination button onclick events
let jobsApp;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    jobsApp = new JobsApp();
    jobsApp.initKeyboardShortcuts();
    
    // Add keyboard shortcuts info (optional)
    console.log('Keyboard shortcuts:');
    console.log('← → : Navigate pages');
    console.log('/ : Focus search');
    console.log('Ctrl/Cmd + D : Toggle dark mode');
});`;
  }

  // ============================================
  // MOCK DATA (FOR TESTING)
  // ============================================

  generateMockJobs() {
    this.log('Generating mock jobs for testing...', 'warning');
    
    const institutions = [
      'CERN', 'Fermilab', 'DESY', 'SLAC', 'KEK', 'University of California, Berkeley',
      'MIT', 'Stanford University', 'University of Oxford', 'ETH Zurich',
      'Max Planck Institute for Physics', 'CERN Theory Division', 'Harvard University',
      'University of Cambridge', 'Imperial College London', 'University of Chicago'
    ];

    const positions = [
      'Postdoctoral Research Associate in High Energy Physics',
      'Assistant Professor of Theoretical Physics', 
      'PhD Fellowship in Particle Physics',
      'Senior Research Scientist - Experimental Physics',
      'Lecturer in Quantum Field Theory',
      'Research Associate in Cosmology',
      'Postdoc in String Theory',
      'Faculty Position in Astroparticle Physics',
      'Graduate Research Assistant',
      'Principal Investigator - Dark Matter Research',
      'Visiting Scholar in Phenomenology',
      'Research Fellow in Lattice QCD',
      'Assistant Professor - Neutrino Physics',
      'Postdoctoral Researcher - LHC Experiments',
      'Research Scientist - Detector Development'
    ];

    const experiments = [
      ['ATLAS', 'CMS'], ['Belle II'], ['DUNE'], ['LHCb'], ['ALICE'],
      ['IceCube'], ['Super-Kamiokande'], ['T2K'], ['NOvA'], ['MiniBooNE'],
      ['Mu2e'], ['g-2'], ['XENON'], ['LUX-ZEPLIN'], ['Euclid']
    ];

    const regions = [
      ['Europe'], ['North America'], ['Asia'], ['Europe', 'North America'],
      ['Asia', 'Europe'], ['Global'], ['North America', 'Asia']
    ];

    const ranks = [
      ['Postdoc'], ['Faculty'], ['PhD'], ['Senior Researcher'], 
      ['Faculty', 'Senior Researcher'], ['Postdoc', 'PhD']
    ];

    const jobs = [];
    
    for (let i = 0; i < 50; i++) {
      const isExpired = Math.random() < 0.2; // 20% expired jobs
      const createdDate = new Date();
      createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 90));
      
      const deadlineDate = new Date();
      if (isExpired) {
        deadlineDate.setDate(deadlineDate.getDate() - Math.floor(Math.random() * 30));
      } else {
        deadlineDate.setDate(deadlineDate.getDate() + Math.floor(Math.random() * 120 + 30));
      }

      jobs.push({
        id: 'mock-' + (i + 1),
        title: positions[Math.floor(Math.random() * positions.length)],
        institution: institutions[Math.floor(Math.random() * institutions.length)],
        deadline: deadlineDate.toISOString().split('T')[0],
        description: this.generateMockDescription(),
        regions: regions[Math.floor(Math.random() * regions.length)],
        ranks: ranks[Math.floor(Math.random() * ranks.length)],
        experiments: Math.random() < 0.7 ? experiments[Math.floor(Math.random() * experiments.length)] : [],
        urls: ['https://jobs.example.com/job/' + (i + 1000)],
        contact_email: 'jobs' + i + '@example.edu',
        created: createdDate.toISOString(),
        updated: createdDate.toISOString()
      });
    }
    
    return jobs;
  }

  generateMockDescription() {
    const descriptions = [
      'We are seeking a talented researcher to join our team working on cutting-edge experiments. The successful candidate will contribute to data analysis and detector development.',
      'The Department seeks an outstanding candidate specializing in theoretical physics. Research areas of interest include quantum field theory and particle phenomenology.',
      'This position involves analysis of data from major physics experiments. The candidate will work with international collaborations on breakthrough research.',
      'We offer an exciting opportunity to work on next-generation detector technologies. The role includes both hardware development and software analysis.',
      'Join our world-class research group focused on understanding the fundamental nature of matter and energy. Excellent computational and analytical skills required.',
      'The successful applicant will contribute to ongoing research in cosmology and astroparticle physics, with opportunities for international collaboration.',
      'This position offers the chance to work on groundbreaking research in quantum mechanics and its applications to particle physics.',
      'We are looking for a motivated researcher to join our efforts in exploring physics beyond the Standard Model through precision measurements.'
    ];
    
    return descriptions[Math.floor(Math.random() * descriptions.length)];
  }

  async testApiConnectivity() {
    this.log('Testing InspireHEP API connectivity...');
    
    try {
      const testUrl = `${this.config.apiBase}/jobs?size=1`;
      this.log(`Testing URL: ${testUrl}`);
      
      const response = await this.httpRequest(testUrl);
      this.log(`API test response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        throw new Error(`API test failed with status ${response.status}`);
      }
      
      const data = await response.json();
      this.log('✅ API connectivity test passed', 'success');
      
      return true;
    } catch (error) {
      this.log(`⚠️  API connectivity test failed: ${error.message}`, 'warning');
      this.log('Will proceed with mock data fallback...', 'warning');
      return false;
    }
  }

  async build() {
    this.log('🚀 Starting HEP Jobs Tracker build process...');

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
      
      // Try to build with existing data as fallback
      try {
        this.log('Attempting to build with existing data as fallback...', 'warning');
        const existingData = this.loadExistingJobs();
        
        if (existingData.jobs && existingData.jobs.length > 0) {
          const jobsData = {
            jobs: existingData.jobs,
            lastUpdated: existingData.lastUpdated,
            totalJobs: existingData.totalJobs
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
          
          this.log(`✅ Fallback build completed with ${existingData.totalJobs} existing jobs`, 'success');
        } else {
          this.log('No existing data available for fallback build', 'error');
          process.exit(1);
        }
      } catch (fallbackError) {
        this.log(`Fallback build also failed: ${fallbackError.message}`, 'error');
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
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = HEPJobsTracker;