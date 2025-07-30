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
      this.log("Will proceed with mock data fallback...", "warning");
      return false;
    }
  }

  async fetchJobs() {
    this.log("Fetching jobs from InspireHEP API...");

    try {
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
}

module.exports = DataFetcher;