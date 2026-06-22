/**
 * RSS Data Fetcher Module
 * Handles fetching jobs from AcademicJobsOnline RSS feed and processing them
 */

class RSSFetcher {
  constructor(config) {
    this.config = config;
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[type];
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  async testApiConnectivity() {
    this.log("Testing AcademicJobsOnline RSS feed connectivity...");

    try {
      const testUrl = this.config.rssUrl;
      this.log(`Testing URL: ${testUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(testUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HEPJobsBot/1.0; +https://github.com/melashri/hep-jobs)'
        }
      });
      clearTimeout(timeout);
      this.log(`RSS test response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`RSS test failed with status ${response.status}`);
      }

      this.log("✅ RSS connectivity test passed", "success");
      return true;
    } catch (error) {
      this.log(`⚠️  RSS connectivity test failed: ${error.message}`, "warning");
      return false;
    }
  }

  async fetchJobs() {
    this.log("Fetching jobs from AcademicJobsOnline RSS feed...");

    try {
      this.log(`RSS URL: ${this.config.rssUrl}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(this.config.rssUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HEPJobsBot/1.0; +https://github.com/melashri/hep-jobs)'
        }
      });
      clearTimeout(timeout);

      this.log(`HTTP Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        this.log(`Response body: ${errorText}`, "error");
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }

      const xmlText = await response.text();
      const jobs = this.parseRSS(xmlText);
      
      this.log(`Fetched ${jobs.length} jobs from RSS feed`, "success");
      return jobs;
    } catch (error) {
      this.log(`Error fetching jobs: ${error.message}`, "error");
      this.log(`Error stack: ${error.stack}`, "error");
      throw error;
    }
  }

  parseRSS(xmlText) {
    this.log("Parsing RSS feed XML...");
    const jobs = [];
    
    // Extract all <item> elements using regex (supports both RSS 2.0 and RDF/RSS 1.0)
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    const items = xmlText.match(itemRegex) || [];
    
    this.log(`Found ${items.length} items in RSS feed`);
    
    items.forEach((item, index) => {
      try {
        const job = this.parseRSSItem(item, index);
        if (job) {
          jobs.push(job);
        }
      } catch (error) {
        this.log(`Error parsing RSS item ${index}: ${error.message}`, "warning");
      }
    });
    
    return jobs;
  }

  parseRSSItem(itemXML, index) {
    // Helper function to extract text from XML tag
    const extractTag = (xml, tagName) => {
      const regex = new RegExp(`<${tagName}[^>]*>(.*?)<\/${tagName}>`, 's');
      const match = xml.match(regex);
      return match ? this.decodeHTML(match[1].trim()) : null;
    };

    // Helper function to extract CDATA content
    const extractCDATA = (xml, tagName) => {
      const regex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[(.*?)\\]\\]><\/${tagName}>`, 's');
      const match = xml.match(regex);
      if (match) {
        return this.decodeHTML(match[1].trim());
      }
      // Fallback to regular tag extraction
      return extractTag(xml, tagName);
    };

    const title = extractCDATA(itemXML, 'title') || extractTag(itemXML, 'title') || 'Untitled Position';
    const link = extractTag(itemXML, 'link') || extractTag(itemXML, 'guid');
    const description = extractCDATA(itemXML, 'description') || extractTag(itemXML, 'description') || '';
    
    // Try to get date from various sources
    const pubDate = extractTag(itemXML, 'ads:PostDate') || 
                    extractTag(itemXML, 'dc:date') || 
                    extractTag(itemXML, 'pubDate');
    
    // Try to get deadline from ads:Deadline tag first
    const adsDeadline = extractTag(itemXML, 'ads:Deadline');
    let deadline = null;
    if (adsDeadline) {
      try {
        deadline = new Date(adsDeadline).toISOString().split('T')[0];
      } catch (e) {
        deadline = this.extractDeadline(description);
      }
    } else {
      deadline = this.extractDeadline(description);
    }
    
    // Extract institution from ads:Univ tag or fallback to extraction
    const institution = extractTag(itemXML, 'ads:Univ') || 
                        extractTag(itemXML, 'dc:creator') ||
                        this.extractInstitution(title, description);
    
    // Generate a unique ID from the link or index
    const id = link ? this.generateIdFromUrl(link) : `ajo-${Date.now()}-${index}`;
    
    // Extract location information
    const city = extractTag(itemXML, 'ads:City');
    const state = extractTag(itemXML, 'ads:State');
    const country = extractTag(itemXML, 'ads:Country');
    const regions = this.extractRegionsFromLocation(city, state, country, description);
    
    return {
      id: id,
      title: this.cleanJobTitle(title),
      institution: institution,
      deadline: deadline,
      description: description,
      regions: regions,
      ranks: this.extractRanks(title, description),
      experiments: [],
      urls: link ? [link] : [],
      contact_email: this.extractEmail(description),
      created: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      updated: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      source: 'AcademicJobsOnline'
    };
  }

  extractInstitution(title, description) {
    // Try to extract institution from title (often in format: "Position at Institution")
    const patterns = [
      /at\s+([^,\-\(\)]+)/i,
      /,\s*([^,\-\(\)]+?)(?:\s*\(|$)/,
      /\-\s*([^,\-\(\)]+?)(?:\s*\(|$)/
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match && match[1].trim().length > 3) {
        return match[1].trim();
      }
    }
    
    // Try to extract from description
    const descMatch = description.match(/Institution[:\s]+([^\n\r<]+)/i);
    if (descMatch) {
      return descMatch[1].trim();
    }
    
    return "Unknown Institution";
  }

  extractDeadline(description) {
    // Common deadline patterns in job descriptions
    const patterns = [
      /deadline[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /apply\s+by[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /applications?\s+due[:\s]+([^\n\r<]+?)(?:\.|<|$)/i,
      /closing\s+date[:\s]+([^\n\r<]+?)(?:\.|<|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        const dateStr = match[1].trim();
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch (e) {
          // Invalid date, continue
        }
      }
    }
    
    return null;
  }

  extractEmail(text) {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const match = text.match(emailRegex);
    return match ? match[1] : null;
  }

  extractRegions(description) {
    const regions = [];
    const regionPatterns = {
      'North America': /USA|United States|Canada|America/i,
      'Europe': /Europe|UK|United Kingdom|Germany|France|Switzerland|Italy|Spain|Netherlands/i,
      'Asia': /Asia|China|Japan|Korea|India|Singapore/i,
      'Australia': /Australia|New Zealand/i,
      'Latin America': /Brazil|Mexico|Argentina|Chile/i,
      'Middle East': /Israel|UAE|Saudi Arabia/i,
      'Africa': /Africa|South Africa/i
    };
    
    for (const [region, pattern] of Object.entries(regionPatterns)) {
      if (pattern.test(description)) {
        regions.push(region);
      }
    }
    
    return regions;
  }

  extractRegionsFromLocation(city, state, country, description) {
    const regions = [];
    
    // Map country codes to regions
    const countryMap = {
      'US': 'North America',
      'CA': 'North America',
      'MX': 'Latin America',
      'UK': 'Europe',
      'GB': 'Europe',
      'DE': 'Europe',
      'FR': 'Europe',
      'IT': 'Europe',
      'ES': 'Europe',
      'CH': 'Europe',
      'NL': 'Europe',
      'CN': 'Asia',
      'JP': 'Asia',
      'KR': 'Asia',
      'IN': 'Asia',
      'SG': 'Asia',
      'AU': 'Australia',
      'NZ': 'Australia',
      'BR': 'Latin America',
      'AR': 'Latin America',
      'CL': 'Latin America',
      'IL': 'Middle East',
      'AE': 'Middle East',
      'SA': 'Middle East',
      'ZA': 'Africa'
    };
    
    // Try to map country code first
    if (country && countryMap[country]) {
      regions.push(countryMap[country]);
    } else if (country) {
      // Try to match country name
      const countryText = country.toLowerCase();
      if (countryText.includes('united states') || countryText.includes('usa') || countryText.includes('canada')) {
        regions.push('North America');
      } else if (countryText.includes('united kingdom') || countryText.includes('uk') || 
                 countryText.includes('germany') || countryText.includes('france') || 
                 countryText.includes('italy') || countryText.includes('spain') ||
                 countryText.includes('switzerland') || countryText.includes('netherlands')) {
        regions.push('Europe');
      }
    }
    
    // Fallback to description-based extraction if no region found
    if (regions.length === 0) {
      return this.extractRegions(description);
    }
    
    return regions;
  }

  extractRanks(title, description) {
    const ranks = [];
    const text = (title + ' ' + description).toUpperCase();
    
    if (/POSTDOC|POST-DOC|POST DOC/i.test(text)) ranks.push('POSTDOC');
    if (/PHD|PH\.D\.|DOCTORAL/i.test(text)) ranks.push('PHD');
    if (/PROFESSOR|FACULTY|TENURE/i.test(text)) ranks.push('SENIOR');
    if (/RESEARCH\s+SCIENTIST|RESEARCHER/i.test(text) && !/SENIOR/i.test(text)) ranks.push('JUNIOR');
    
    return ranks.length > 0 ? ranks : ['OTHER'];
  }

  generateIdFromUrl(url) {
    // Extract the job ID from the end of the URL (before query params)
    // AJO URLs format: https://academicjobsonline.org/ajo/.../JOBID?rss
    const match = url.match(/\/(\d+)(?:\?|$)/);
    return match ? `ajo-${match[1]}` : `ajo-${Date.now()}`;
  }

  cleanJobTitle(title) {
    if (!title) return "Untitled Position";
    return title.replace(/\s+/g, " ").trim();
  }

  decodeHTML(text) {
    // Decode common HTML entities
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&nbsp;': ' '
    };
    
    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }
    
    return decoded;
  }
}

module.exports = RSSFetcher;
