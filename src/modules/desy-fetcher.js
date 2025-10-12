/**
 * DESY Jobs Fetcher Module
 * Handles fetching jobs from DESY job portal and processing them
 * Zero dependencies - uses only Node.js built-ins
 */

const https = require('https');

class DESYFetcher {
  constructor(config) {
    this.config = config;
    this.baseUrl = 'https://v22.desy.de';
    this.jobsUrl = 'https://v22.desy.de/index_eng.html';
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[type];
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  async testApiConnectivity() {
    this.log("Testing DESY jobs portal connectivity...");

    try {
      this.log(`Testing URL: ${this.jobsUrl}`);
      await this.fetchUrl(this.jobsUrl);
      this.log("✅ DESY connectivity test passed", "success");
      return true;
    } catch (error) {
      this.log(`⚠️  DESY connectivity test failed: ${error.message}`, "warning");
      return false;
    }
  }

  async fetchJobs() {
    this.log("Fetching jobs from DESY job portal...");

    try {
      // Fetch the main jobs page
      const html = await this.fetchUrl(this.jobsUrl);
      
      // Parse the HTML to extract job listings
      const jobLinks = this.extractJobLinks(html);
      this.log(`Found ${jobLinks.length} job listings`);

      // Fetch details for each job
      const jobs = [];
      for (const jobLink of jobLinks) {
        try {
          const jobDetail = await this.fetchJobDetails(jobLink);
          if (jobDetail) {
            jobs.push(jobDetail);
          }
        } catch (error) {
          this.log(`Error fetching job details for ${jobLink.url}: ${error.message}`, "warning");
        }
      }

      this.log(`Successfully fetched ${jobs.length} jobs from DESY`, "success");
      return jobs;
    } catch (error) {
      this.log(`Error fetching DESY jobs: ${error.message}`, "error");
      this.log(`Error stack: ${error.stack}`, "error");
      throw error;
    }
  }

  fetchUrl(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  extractJobLinks(html) {
    const jobLinks = [];
    
    // DESY jobs are in a table with id="desy_joblist"
    // Each row has: onclick with URL, title attribute with description, 
    // <td class="title"> with job title, and <td class="occupational_group"> with group
    
    // Pattern to match table rows with job data
    const rowPattern = /<tr[^>]*onclick="document\.location\.href='([^']+)';"[^>]*title="([^"]*)"[^>]*>(.*?)<\/tr>/gis;
    
    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const url = match[1];
      const fullTitle = match[2];
      const rowContent = match[3];
      
      // Extract job title from <td class="title">
      const titleMatch = rowContent.match(/<td[^>]*class="title"[^>]*>([^<]+)<\/td>/i);
      const title = titleMatch ? this.cleanHTML(titleMatch[1]) : this.cleanHTML(fullTitle.split(':')[0]);
      
      // Extract occupational group
      const groupMatch = rowContent.match(/<td[^>]*class="occupational_group"[^>]*>([^<]+)<\/td>/i);
      const occupationalGroup = groupMatch ? this.cleanHTML(groupMatch[1]) : '';
      
      // Only include science positions
      if (occupationalGroup.toLowerCase().includes('science') || 
          occupationalGroup.toLowerCase().includes('wissenschaft')) {
        
        // Make sure URL is absolute
        const fullUrl = url.startsWith('http') ? url : 
                       url.startsWith('/') ? `https://v22.desy.de${url}` : 
                       `https://v22.desy.de/${url}`;
        
        if (!jobLinks.find(j => j.url === fullUrl)) {
          jobLinks.push({
            url: fullUrl,
            title: title,
            occupationalGroup: occupationalGroup
          });
        }
      }
    }

    return jobLinks;
  }

  async fetchJobDetails(jobLink) {
    try {
      const html = await this.fetchUrl(jobLink.url);
      
      // Extract job details from the detail page
      const title = jobLink.title || this.extractText(html, /<h1[^>]*>(.*?)<\/h1>/i);
      const description = this.extractJobDescription(html);
      const deadline = this.extractDeadline(html);
      const location = this.extractLocation(html);
      const occupationalGroup = jobLink.occupationalGroup || this.extractOccupationalGroup(html);
      const employmentType = this.extractEmploymentType(html);
      
      // Generate ID from URL (extract record number)
      const idMatch = jobLink.url.match(/records(\d+)/);
      const id = idMatch ? `desy-${idMatch[1]}` : `desy-${Date.now()}`;

      return {
        id: id,
        title: this.cleanJobTitle(title),
        institution: 'DESY (Deutsches Elektronen-Synchrotron)',
        deadline: deadline,
        description: description,
        regions: this.getRegionsFromLocation(location),
        ranks: this.extractRanks(title, description),
        experiments: this.extractExperiments(description),
        urls: [jobLink.url],
        contact_email: this.extractEmail(html),
        location: location,
        occupationalGroup: occupationalGroup,
        employmentType: employmentType,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        source: 'DESY'
      };
    } catch (error) {
      this.log(`Error parsing job details: ${error.message}`, "warning");
      return null;
    }
  }

  extractJobDescription(html) {
    let content = html;
    
    // Remove breadcrumb container that appears at the beginning
    content = content.replace(/<div[^>]*class=["']container["'][^>]*>\s*<ol[^>]*class=["']breadcrumb["'][^>]*>.*?<\/ol>\s*<\/div>/gis, '');
    
    // Remove section titles
    content = content.replace(/<section[^>]*class=["']titles["'][^>]*>.*?<\/section>/gis, '');
    
    // Extract the article/joboffer content
    const articleMatch = content.match(/<article[^>]*class=["']joboffer["'][^>]*>(.*?)<\/article>/is);
    
    if (articleMatch) {
      let articleContent = articleMatch[1];
      
      // Remove image headers
      articleContent = articleContent.replace(/<div[^>]*class=["']image_header[^"']*["'][^>]*>.*?<\/div>/gis, '');
      
      // Remove redundant location paragraph (e.g., "For our location in Hamburg we are seeking:")
      articleContent = articleContent.replace(/<p[^>]*class=["']location["'][^>]*>.*?<\/p>/gis, '');
      
      // Remove redundant job title h1 (already shown in the card title)
      articleContent = articleContent.replace(/<h1[^>]*class=["']job_title["'][^>]*>.*?<\/h1>/gis, '');
      
      // Remove title_additional (contains metadata already shown)
      articleContent = articleContent.replace(/<p[^>]*class=["']title_additional["'][^>]*>.*?<\/p>/gis, '');
      
      // Remove only the standard DESY intro span (but keep the job-specific desygroup span)
      articleContent = articleContent.replace(/<span[^>]*class=["']desy description["'][^>]*data-lang_key=["']LgJobOffer\.desy\.intro["'][^>]*>.*?<\/span>\s*<br\s*\/?>\s*<br\s*\/?>/gis, '');
      
      // Also remove the standalone DESY boilerplate text if it appears
      articleContent = articleContent.replace(/<span[^>]*class=["']desy description["'][^>]*>DESY, with more than.*?young scientists\.<\/span>\s*<br\s*\/?>\s*<br\s*\/?>/gis, '');
      
      return articleContent.trim();
    }
    
    // Fallback: Try to extract from core section
    const coreMatch = content.match(/<section[^>]*class=["']core["'][^>]*>(.*?)<\/section>/is);
    if (coreMatch) {
      return coreMatch[1].trim();
    }

    return '';
  }

  extractDeadline(html) {
    // First try to find deadline in the title_additional section (DESY specific)
    const titleAdditionalMatch = html.match(/<p[^>]*class="title_additional"[^>]*>([^<]+)<\/p>/i);
    if (titleAdditionalMatch) {
      const text = titleAdditionalMatch[1];
      const deadlineMatch = text.match(/deadline[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i);
      if (deadlineMatch) {
        const euMatch = deadlineMatch[1].match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (euMatch) {
          const [, day, month, year] = euMatch;
          const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        }
      }
    }

    // Alternative patterns in the page body
    const patterns = [
      /deadline[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
      /bewerbungsschluss[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
      /deadline for applications[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i,
      /closing date[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const dateStr = match[1];
        // Parse European date format (DD.MM.YYYY)
        const euMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (euMatch) {
          const [, day, month, year] = euMatch;
          const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        }
      }
    }

    return null;
  }

  extractLocation(html) {
    const patterns = [
      /location[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /standort[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /<dt[^>]*>location<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/is,
      /<dt[^>]*>standort<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/is
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return this.cleanHTML(match[1]).trim();
      }
    }

    // Check for Hamburg or Zeuthen (main DESY locations)
    if (html.toLowerCase().includes('hamburg')) return 'Hamburg, Germany';
    if (html.toLowerCase().includes('zeuthen')) return 'Zeuthen, Germany';

    return 'Germany';
  }

  extractOccupationalGroup(html) {
    const patterns = [
      /occupational\s+group[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /berufsgruppe[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /<dt[^>]*>occupational\s+group<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/is,
      /<dt[^>]*>berufsgruppe<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/is
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return this.cleanHTML(match[1]).trim();
      }
    }

    return null;
  }

  extractEmploymentType(html) {
    const patterns = [
      /employment\s+type[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /beschäftigungsart[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /<dt[^>]*>employment\s+type<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/is
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return this.cleanHTML(match[1]).trim();
      }
    }

    return null;
  }

  extractEmail(html) {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const match = html.match(emailRegex);
    return match ? match[1] : null;
  }

  extractExperiments(description) {
    const experiments = [];
    const experimentPatterns = [
      'PETRA', 'FLASH', 'XFEL', 'European XFEL',
      'HERA', 'DORIS', 'DESY-III', 'ALPS',
      'Belle II', 'ILC', 'ATLAS', 'CMS'
    ];

    const text = description.toUpperCase();
    for (const exp of experimentPatterns) {
      if (text.includes(exp.toUpperCase())) {
        experiments.push(exp);
      }
    }

    return experiments;
  }

  getRegionsFromLocation(location) {
    if (!location) return ['Europe'];
    
    const locationLower = location.toLowerCase();
    if (locationLower.includes('germany') || locationLower.includes('hamburg') || 
        locationLower.includes('zeuthen') || locationLower.includes('deutschland')) {
      return ['Europe'];
    }
    
    return ['Europe'];
  }

  extractRanks(title, description) {
    const ranks = [];
    const text = (title + ' ' + description).toUpperCase();
    
    if (/POSTDOC|POST-DOC|POST DOC/i.test(text)) ranks.push('POSTDOC');
    if (/PHD|PH\.D\.|DOCTORAL|DOKTORAND/i.test(text)) ranks.push('PHD');
    if (/PROFESSOR|SENIOR\s+SCIENTIST|GROUP\s+LEADER|LEADING\s+SCIENTIST/i.test(text)) ranks.push('SENIOR');
    if (/SCIENTIST|RESEARCHER|WISSENSCHAFTLER/i.test(text) && !/SENIOR/i.test(text)) ranks.push('JUNIOR');
    
    return ranks.length > 0 ? ranks : ['OTHER'];
  }

  extractText(html, pattern) {
    const match = html.match(pattern);
    return match ? this.cleanHTML(match[1]) : null;
  }

  cleanHTML(text) {
    if (!text) return '';
    
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>/g, ' ');
    
    // Decode HTML entities
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&nbsp;': ' ',
      '&uuml;': 'ü',
      '&auml;': 'ä',
      '&ouml;': 'ö',
      '&Uuml;': 'Ü',
      '&Auml;': 'Ä',
      '&Ouml;': 'Ö',
      '&szlig;': 'ß'
    };
    
    for (const [entity, char] of Object.entries(entities)) {
      cleaned = cleaned.replace(new RegExp(entity, 'g'), char);
    }
    
    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  cleanJobTitle(title) {
    if (!title) return "Untitled Position";
    return title.replace(/\s+/g, " ").trim();
  }
}

module.exports = DESYFetcher;
