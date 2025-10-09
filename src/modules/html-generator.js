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

  truncateHTML(htmlText, maxLength, suffix = "...") {
    if (!htmlText) return "";
    if (htmlText.length <= maxLength) return htmlText;
    return htmlText.substring(0, maxLength - suffix.length) + suffix;
  }

  generateJobCard(job) {
    const deadline = this.formatDate(job.deadline);
    const isExpired = this.isExpired(job.deadline);
    const hasPostdoc = job.ranks.some(rank => rank.toUpperCase() === 'POSTDOC');
    const cardClass = isExpired ? "job-card expired" : "job-card";
    const postdocClass = hasPostdoc ? " postdoc" : "";
    const inspireHepUrl = `https://inspirehep.net/jobs/${job.id}`;
    const ranksData = job.ranks.map(rank => rank.toUpperCase()).join(',');
    
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
      <div class="${cardClass}${postdocClass}" data-id="${job.id}" data-ranks="${ranksData}" data-job='${JSON.stringify(jobData).replace(/'/g, "&#39;")}'>
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

  loadTemplate() {
    const templatePath = path.join(__dirname, '../templates/index.html');
    try {
      return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      this.log(`Error loading template: ${error.message}`, "error");
      throw error;
    }
  }

  generateHTML(jobsData) {
    const { jobs, lastUpdated, totalJobs } = jobsData;
    const updateTime = lastUpdated
      ? new Date(lastUpdated).toLocaleString()
      : "Never";

    const activeJobs = jobs.filter((job) => !this.isExpired(job.deadline));
    const expiredJobs = jobs.filter((job) => this.isExpired(job.deadline));

    // Generate job cards
    const jobCards = [
      ...activeJobs.map((job) => this.generateJobCard(job)),
      ...expiredJobs.map((job) => this.generateJobCard(job))
    ].join("");

    // Generate no jobs message if needed
    const noJobsMessage = jobs.length === 0 ? `
      <div class="no-jobs">
        <h2>No jobs found</h2>
        <p>Check back later for new opportunities!</p>
      </div>` : "";

    // Load and process template
    const template = this.loadTemplate();
    
    return template
      .replace(/\{\{totalJobs\}\}/g, totalJobs)
      .replace(/\{\{activeJobs\}\}/g, activeJobs.length)
      .replace(/\{\{lastUpdated\}\}/g, updateTime)
      .replace(/\{\{jobCards\}\}/g, jobCards)
      .replace(/\{\{noJobsMessage\}\}/g, noJobsMessage);
  }
}

module.exports = HTMLGenerator;