/**
 * Data Fetcher Module
 * Handles fetching jobs from InspireHEP API and processing them
 */

class DataFetcher {
  constructor(config) {
    this.config = config;
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[type];
    console.log(`${emoji} [${timestamp}] ${message}`);
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
      return false;
    }
  }

  async fetchJobs() {
    this.log("Fetching jobs from InspireHEP API...");

    try {
      // Build query to filter by specific categories
      // Categories: hep-ex (experimental HEP), nucl-ex (nuclear experiment), cs (computer science)
      const categories = ['hep-ex', 'nucl-ex', 'cs'];
      const categoryQuery = categories.map(cat => `arxiv_categories:${cat}`).join(' OR ');
      
      // Exclude theory categories
      const excludeCategories = ['hep-th', 'hep-ph', 'hep-lat', 'nucl-th'];
      const excludeQuery = excludeCategories.map(cat => `NOT arxiv_categories:${cat}`).join(' AND ');
      
      // Add date filter for last 30 days
      const daysBack = this.config.daysBack || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      const dateQuery = `deadline_date:>${cutoffDate.toISOString().split('T')[0]}`;
      
      // Combine all queries
      const fullQuery = `(${categoryQuery}) AND ${excludeQuery} AND ${dateQuery}`;
      
      this.log(`Filtering by categories: ${categories.join(', ')}`);
      this.log(`Excluding theory categories: ${excludeCategories.join(', ')}`);
      this.log(`Fetching jobs with deadlines after: ${cutoffDate.toISOString().split('T')[0]}`);
      
      // Fetch all pages (returns raw API responses)
      const rawJobs = await this.fetchAllPages(fullQuery);
      
      // Log category statistics from raw jobs before processing
      this.logCategoryStats(rawJobs);
      
      // Process the raw jobs
      const processedJobs = this.processJobs(rawJobs);
      this.log(`Processed ${processedJobs.length} jobs`, "success");
      
      return processedJobs;
    } catch (error) {
      this.log(`Error fetching jobs: ${error.message}`, "error");
      this.log(`Error stack: ${error.stack}`, "error");
      throw error;
    }
  }

  async fetchAllPages(query) {
    const allJobs = [];
    const pageSize = 250; // API max per request
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const params = new URLSearchParams({
        q: query,
        sort: "mostrecent",
        size: pageSize,
        page: page,
      });
      
      const url = `${this.config.apiBase}/jobs?${params}`;
      this.log(`Fetching page ${page}: ${url}`);
      
      const response = await fetch(url);
      this.log(`HTTP Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        this.log(`Response body: ${errorText}`, "error");
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }
      
      const data = await response.json();
      
      if (page === 1) {
        this.log(`Total jobs available: ${data.hits.total}`);
        if (data.hits.hits.length > 0) {
          const firstJob = data.hits.hits[0];
          this.log(`First job keys: ${JSON.stringify(Object.keys(firstJob))}`);
          this.log(
            `First job metadata keys: ${JSON.stringify(
              Object.keys(firstJob.metadata || {})
            )}`
          );
          // Log date fields for debugging
          const metadata = firstJob.metadata || {};
          this.log(`First job date fields:`);
          this.log(`  created: ${firstJob.created}`);
          this.log(`  updated: ${firstJob.updated}`);
          this.log(`  metadata.creation_date: ${metadata.creation_date}`);
          this.log(`  metadata.update_date: ${metadata.update_date}`);
          this.log(`  metadata.deadline_date: ${metadata.deadline_date}`);
        }
      }
      
      if (data.hits && data.hits.hits && data.hits.hits.length > 0) {
        this.log(`Page ${page}: Retrieved ${data.hits.hits.length} jobs`);
        allJobs.push(...data.hits.hits);
        
        // Check if there are more pages
        const totalFetched = page * pageSize;
        hasMore = data.hits.hits.length === pageSize && totalFetched < data.hits.total;
        page++;
        
        // Add a small delay to avoid rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        hasMore = false;
      }
    }
    
    this.log(`Total pages fetched: ${page - 1}`);
    this.log(`Total jobs retrieved: ${allJobs.length}`);
    
    return allJobs;
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
            arxiv_categories: metadata.arxiv_categories || [],
            experiments:
              metadata.accelerator_experiments?.map(
                (exp) => exp.name || exp.value || exp
              ) || [],
            urls: this.extractUrls(metadata),
            contact_email: this.extractContactEmail(metadata),
            created:
              job.created ||
              metadata.creation_date ||
              metadata.created ||
              new Date().toISOString(),
            updated:
              job.updated ||
              metadata.update_date ||
              metadata.updated ||
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

  logCategoryStats(jobs) {
    this.log("📊 Category Statistics:");
    
    const categoryCount = {};
    const targetCategories = ['hep-ex', 'physics', 'nucl-ex', 'cs'];
    
    jobs.forEach(job => {
      const metadata = job.metadata || job;
      const categories = metadata.arxiv_categories || [];
      
      categories.forEach(cat => {
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      });
    });
    
    // Log target categories
    this.log("  Target categories:");
    targetCategories.forEach(cat => {
      const count = categoryCount[cat] || 0;
      this.log(`    ${cat}: ${count} jobs`);
    });
    
    // Log other categories found
    const otherCategories = Object.keys(categoryCount)
      .filter(cat => !targetCategories.includes(cat))
      .sort((a, b) => categoryCount[b] - categoryCount[a]);
    
    if (otherCategories.length > 0) {
      this.log("  Other categories found:");
      otherCategories.slice(0, 10).forEach(cat => {
        this.log(`    ${cat}: ${categoryCount[cat]} jobs`);
      });
      if (otherCategories.length > 10) {
        this.log(`    ... and ${otherCategories.length - 10} more`);
      }
    }
  }

}

module.exports = DataFetcher;