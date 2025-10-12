# HEP Jobs Tracker - Modular Architecture

This document describes the new modular architecture of the HEP Jobs Tracker, which replaces the previous monolithic `build.js` file.

## 📁 Project Structure

```
src/
├── build.js                 # Main build orchestrator
├── modules/                 # Core functionality modules
│   ├── data-fetcher.js     # API fetching and data processing
│   ├── data-manager.js     # Data storage and merging logic
│   ├── html-generator.js   # HTML template processing
│   └── file-manager.js     # File operations and asset copying
├── templates/              # HTML templates
│   └── index.html          # Main page template
├── styles/                 # CSS source files
│   └── main.css            # Main stylesheet
└── scripts/                # JavaScript source files
    └── main.js             # Frontend application logic
```

## 🔧 Module Overview

### DataFetcher (`src/modules/data-fetcher.js`)
- Handles API connectivity testing
- Fetches jobs from InspireHEP API
- Processes raw job data into structured format
- Extracts job metadata (titles, institutions, deadlines, etc.)

### DataManager (`src/modules/data-manager.js`)
- Loads existing job data from JSON file
- Merges new jobs with existing data
- Saves updated job data to storage
- Handles deduplication and sorting

### HTMLGenerator (`src/modules/html-generator.js`)
- Loads HTML templates
- Generates individual job cards
- Processes template variables (total jobs, active jobs, etc.)
- Handles date formatting and HTML escaping
- Creates the final HTML output

### FileManager (`src/modules/file-manager.js`)
- Ensures required directories exist
- Copies CSS and JavaScript assets from source to output
- Writes generated HTML to the docs/ directory
- Manages file operations

### Main Build Orchestrator (`src/build.js`)
- Coordinates all modules
- Implements the main build workflow
- Handles error cases and fallback scenarios
- Provides logging and status updates

## 🚀 How to Build

### Using the New Modular System
```bash
node build-modular.js
```

### Using the Legacy System (still available)
```bash
node build.js
```

Both commands generate the same output in the `docs/` directory.

## 🔄 Build Process Flow

1. **Initialize**: Create required directories and initialize modules
2. **Test API**: Check InspireHEP API connectivity
3. **Fetch Data**: Get new jobs from InspireHEP API
4. **Merge Data**: Combine new jobs with existing data
5. **Save Data**: Store updated job data to JSON file
6. **Generate HTML**: Process templates and create final HTML
7. **Copy Assets**: Copy CSS and JavaScript files to output directory

## 📝 Template System

The HTML generation now uses a template-based approach:

- **Template**: `src/templates/index.html` contains the HTML structure with placeholders
- **Variables**: `{{totalJobs}}`, `{{activeJobs}}`, `{{lastUpdated}}`, etc.
- **Dynamic Content**: Job cards and conditional messages are generated and inserted

## 🎨 Asset Management

### CSS
- Source: `src/styles/main.css`
- Output: `docs/style.css`
- No longer generated as a string in JavaScript

### JavaScript
- Source: `src/scripts/main.js`
- Output: `docs/script.js`
- Contains the frontend application logic

## 🧪 Testing the Modular System

To verify that the modular system produces the same output as the original:

```bash
# Test the modular build
node build-modular.js

# Compare with legacy build (if needed)
node build.js
```

Both should generate identical files in the `docs/` directory.

## ✨ Benefits of the Modular Architecture

1. **Separation of Concerns**: Each module has a single responsibility
2. **Maintainability**: Easier to update individual components
3. **Readability**: Smaller, focused files are easier to understand
4. **Testability**: Modules can be tested independently
5. **Reusability**: Modules can be reused or replaced easily
6. **Source Control**: Better tracking of changes to specific functionality

## 🔧 Configuration

The build system uses the same configuration as before:

```javascript
this.config = {
  apiBase: "https://inspirehep.net/api",
  rssUrl: "https://academicjobsonline.org/ajo?joblist-1062-0-0-0----rss--",
  dataDir: "./data",
  docsDir: "./site",
  jobsFile: "./data/ip-jobs.json",
  ajoJobsFile: "./data/ajo-jobs.json",
  desyJobsFile: "./data/desy-jobs.json",
  maxJobs: 200,
  daysBack: 30,
};
```

## 🚀 Future Enhancements

The modular structure makes it easier to add new features:

- **Template Engine**: Could easily add a more sophisticated templating system
- **Multiple Templates**: Support for different page layouts
- **Plugin System**: Add new data sources or output formats
- **Testing Framework**: Add unit tests for each module
- **Build Pipeline**: Add linting, minification, or other build steps