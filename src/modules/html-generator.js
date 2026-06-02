/**
 * HTML Generator Module
 * Handles HTML template processing and job card generation
 */

const fs = require('fs');
const path = require('path');

class HTMLGenerator {
  constructor(config) {
    this.config = config;
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[type];
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
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  escapeJsonForAttribute(obj) {
    // Convert object to JSON string
    // For HTML attributes, we need to escape the attribute delimiter (single quote)
    // and HTML special characters, but keep the JSON structure intact
    const jsonString = JSON.stringify(obj);
    // Only escape single quotes and ampersands to avoid breaking the HTML attribute
    // The JSON itself already has properly escaped double quotes
    return jsonString
      .replace(/&/g, "&amp;")
      .replace(/'/g, "&#x27;");
  }

  truncateText(text, maxLength, suffix = "...") {
    if (!text) return "";
    if (text.length <= maxLength) return this.escapeHtml(text);
    return (
      this.escapeHtml(text.substring(0, maxLength - suffix.length)) + suffix
    );
  }

  stripHTML(htmlText) {
    if (!htmlText) return "";
    // Remove HTML tags and decode entities for plain text display
    return htmlText
      .replace(/<[^>]*>/g, ' ')  // Remove all HTML tags
      .replace(/\s+/g, ' ')       // Collapse multiple spaces
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  truncateHTML(htmlText, maxLength, suffix = "...") {
    if (!htmlText) return "";
    // Strip HTML tags first to prevent broken tag issues
    const plainText = this.stripHTML(htmlText);
    if (plainText.length <= maxLength) return this.escapeHtml(plainText);
    return this.escapeHtml(plainText.substring(0, maxLength - suffix.length)) + suffix;
  }

  generateJobCard(job) {
    const ranks = Array.isArray(job.ranks) ? job.ranks : [];
    const regions = Array.isArray(job.regions) ? job.regions : [];
    const experiments = Array.isArray(job.experiments) ? job.experiments : [];
    const urls = Array.isArray(job.urls) ? job.urls : [];
    const deadline = this.formatDate(job.deadline);
    const isExpired = this.isExpired(job.deadline);
    const hasPostdoc = ranks.some(rank => rank.toUpperCase() === 'POSTDOC');
    const isNew = job.isNew === true; // Check if this job was just added
    
    let cardClass = isExpired ? "job-card expired" : "job-card";
    const postdocClass = hasPostdoc ? " postdoc" : "";
    const newJobClass = isNew ? " new-job" : "";
    
    // Determine job URL based on source
    const isAJO = job.source === 'AcademicJobsOnline';
    const isDESY = job.source === 'DESY';
    const jobUrl = isAJO || isDESY
      ? (urls[0] ? urls[0] : '#')
      : `https://inspirehep.net/jobs/${job.id}`;
    const jobLinkText = isAJO ? 'View on AJO' : (isDESY ? 'View on DESY' : 'View on InspireHEP');
    const sourceName = job.source || 'InspireHEP';
    const sourceKey = isAJO ? 'ajo' : (isDESY ? 'desy' : 'inspirehep');
    
    const ranksData = ranks.map(rank => rank.toUpperCase()).join(',');
    
    // Store full job data as JSON in data attribute
    const jobData = {
      id: job.id,
      title: job.title,
      institution: job.institution,
      deadline: deadline,
      deadlineRaw: job.deadline || '',
      isExpired: isExpired,
      regions: regions,
      ranks: ranks,
      experiments: experiments,
      description: job.description || '',
      urls: urls,
      contact_email: job.contact_email,
      jobUrl: jobUrl,
      source: sourceName,
      sourceKey: sourceKey,
      created: job.created || '',
      updated: job.updated || '',
      isNew: isNew
    };

    return `
      <div class="${cardClass}${postdocClass}${newJobClass}" data-id="${this.escapeHtml(job.id)}" data-source="${sourceKey}" data-deadline="${this.escapeHtml(job.deadline || '')}" data-updated="${this.escapeHtml(job.updated || '')}" data-created="${this.escapeHtml(job.created || '')}" data-institution="${this.escapeHtml(job.institution || '')}" data-ranks="${this.escapeHtml(ranksData)}" data-job='${this.escapeJsonForAttribute(jobData)}'>
        ${isNew ? '<div class="new-job-badge">NEW</div>' : ''}
        <div class="job-header">
          <h3 class="job-title">
            <a href="${jobUrl}" target="_blank" class="job-title-link">${this.escapeHtml(job.title)}</a>
          </h3>
          <div class="job-institution">${this.escapeHtml(job.institution)}</div>
        </div>
        
        <div class="job-meta">
          <div class="deadline ${isExpired ? "expired-text" : ""}">
            <strong>Deadline:</strong> ${deadline}
          </div>
          ${
            !isDESY && regions.length > 0
              ? `
            <div class="regions">
              <strong>Regions:</strong> ${regions.join(", ")}
            </div>`
              : ""
          }
          ${
            !isDESY && ranks.length > 0
              ? `
            <div class="ranks">
              <strong>Ranks:</strong> ${ranks.join(", ")}
            </div>`
              : ""
          }
          ${
            experiments.length > 0
              ? `
            <div class="experiments">
              <strong>Experiments:</strong> ${experiments
                .slice(0, 3)
                .join(", ")}
              ${
                experiments.length > 3
                  ? ` (+${experiments.length - 3} more)`
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
            ${this.truncateHTML(job.description, 200)}
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
          <a href="${jobUrl}" target="_blank" class="btn-apply">${jobLinkText}</a>
          ${
            job.contact_email && !isAJO && !isDESY
              ? `
            <a href="mailto:${job.contact_email}" class="btn-contact">Contact</a>`
              : ""
          }
        </div>
      </div>`;
  }

  loadTemplate(templateName = 'index.html') {
    const templatePath = path.join(__dirname, '../templates', templateName);
    try {
      return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      this.log(`Error loading template ${templateName}: ${error.message}`, "error");
      throw error;
    }
  }

  generateHTML(inspirehepData, ajoData, desyData = null) {
    // Process InspireHEP jobs
    const inspirehepJobs = inspirehepData.jobs || [];
    // Sort by updated date (newest first) and separate active/expired
    const inspirehepActiveJobs = inspirehepJobs
      .filter((job) => !this.isExpired(job.deadline))
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const inspirehepExpiredJobs = inspirehepJobs
      .filter((job) => this.isExpired(job.deadline))
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const inspirehepJobCards = [
      ...inspirehepActiveJobs.map((job) => this.generateJobCard(job)),
      ...inspirehepExpiredJobs.map((job) => this.generateJobCard(job))
    ].join("");
    const inspirehepNoJobsMessage = inspirehepJobs.length === 0 ? `
      <div class="no-jobs">
        <h2>No jobs found</h2>
        <p>Check back later for new opportunities!</p>
      </div>` : "";
    
    // Process AJO jobs
    const ajoJobs = ajoData.jobs || [];
    const ajoActiveJobs = ajoJobs
      .filter((job) => !this.isExpired(job.deadline))
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const ajoExpiredJobs = ajoJobs
      .filter((job) => this.isExpired(job.deadline))
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const ajoJobCards = [
      ...ajoActiveJobs.map((job) => this.generateJobCard(job)),
      ...ajoExpiredJobs.map((job) => this.generateJobCard(job))
    ].join("");
    const ajoNoJobsMessage = ajoJobs.length === 0 ? `
      <div class="no-jobs">
        <h2>No jobs found</h2>
        <p>Check back later for new opportunities!</p>
      </div>` : "";

    // Process DESY jobs
    const desyJobs = desyData ? (desyData.jobs || []) : [];
    const desyActiveJobs = desyJobs
      .filter((job) => !this.isExpired(job.deadline))
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const desyExpiredJobs = desyJobs
      .filter((job) => this.isExpired(job.deadline))
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    const desyJobCards = [
      ...desyActiveJobs.map((job) => this.generateJobCard(job)),
      ...desyExpiredJobs.map((job) => this.generateJobCard(job))
    ].join("");
    const desyNoJobsMessage = desyJobs.length === 0 ? `
      <div class="no-jobs">
        <h2>No jobs found</h2>
        <p>Check back later for new opportunities!</p>
      </div>` : "";

    const totalJobs = inspirehepJobs.length + ajoJobs.length + desyJobs.length;
    const activeJobs = inspirehepActiveJobs.length + ajoActiveJobs.length + desyActiveJobs.length;

    // Load and process template
    const template = this.loadTemplate('index.html');
    
    const updateTime = inspirehepData.lastUpdated
      ? new Date(inspirehepData.lastUpdated).toLocaleString('en-US', {
          timeZone: 'Europe/Zurich',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      : "Never";
    
    return template
      .replace(/\{\{totalJobs\}\}/g, totalJobs)
      .replace(/\{\{activeJobs\}\}/g, activeJobs)
      .replace(/\{\{lastUpdated\}\}/g, updateTime)
      .replace(/\{\{daysBack\}\}/g, this.config.daysBack || 30)
      .replace(/\{\{inspirehepJobCards\}\}/g, inspirehepJobCards)
      .replace(/\{\{inspirehepNoJobsMessage\}\}/g, inspirehepNoJobsMessage)
      .replace(/\{\{ajoJobCards\}\}/g, ajoJobCards)
      .replace(/\{\{ajoNoJobsMessage\}\}/g, ajoNoJobsMessage)
      .replace(/\{\{desyJobCards\}\}/g, desyJobCards)
      .replace(/\{\{desyNoJobsMessage\}\}/g, desyNoJobsMessage)
      .replace(/<%=\s*new Date\(\)\.getFullYear\(\)\s*%>/g, new Date().getFullYear());
  }
}

module.exports = HTMLGenerator;
