# HEP Jobs Tracker

A modern, responsive web application that tracks High Energy Physics job opportunities from multiple sources: InspireHEP and AcademicJobsOnline.

## 🚀 Features

- **Multiple Job Sources**: Tracks jobs from InspireHEP API and AcademicJobsOnline RSS feed
- **Responsive Design**: Mobile-first design that works on all devices
- **Dark/Light Mode**: Toggle between themes with preference persistence
- **Interactive Search**: Real-time job filtering and search functionality
- **Smart Caching**: Efficient RSS fetching to avoid rate limiting
- **Automatic Updates**: Daily updates via GitHub Actions

## 🏗️ Architecture

The project uses a **modular architecture** with clean separation of concerns:

- **Modular Build System**: Located in `src/` directory with separate modules for data fetching, HTML generation, and file management
- **Template-Based**: HTML generation uses templates instead of string concatenation
- **Source-Controlled Assets**: CSS and JavaScript are maintained as source files, not generated strings

### How to Build

```bash
# Run the modular build system
node build-modular.js
```

This will:
- Fetch jobs from InspireHEP API (always)
- Fetch jobs from AcademicJobsOnline RSS (once per 24 hours, with smart caching)
- Generate separate pages for each source
- Keep jobs from the last 30 days in the AJO database

## 📁 Project Structure

```
├── src/                    # Modular source code
│   ├── modules/           # Core functionality modules
│   │   ├── data-fetcher.js    # InspireHEP API client
│   │   ├── rss-fetcher.js     # AcademicJobsOnline RSS parser
│   │   ├── data-manager.js    # Data storage & merging
│   │   ├── html-generator.js  # HTML template processing
│   │   └── file-manager.js    # File operations
│   ├── templates/         # HTML templates (index.html, ajo.html)
│   ├── styles/           # CSS source files
│   ├── scripts/          # JavaScript source files
│   └── build.js          # Main build orchestrator
├── site/                  # Generated static site (GitHub Pages)
├── data/                  # Job data storage
│   ├── ip-jobs.json      # InspireHEP jobs
│   ├── ajo-jobs.json     # AcademicJobsOnline jobs
│   └── desy-jobs.json    # DESY jobs
└── build-modular.js      # Build entry point
```

For detailed architecture documentation, see [`src/README.md`](src/README.md).

## 🌐 Live Site

The tracker is automatically deployed to GitHub Pages: [View Live Site](http://melashri.net/hep-jobs/)

## 📊 Data Sources

- **InspireHEP**: [inspirehep.net](https://inspirehep.net) - Comprehensive HEP jobs database
- **AcademicJobsOnline**: [Particle Physics RSS](https://academicjobsonline.org/ajo?joblist-1062-0-0-0----rss--) - Academic positions in particle physics
