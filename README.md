# HEP Jobs Tracker

A job aggregator for High Energy Physics positions, pulling from InspireHEP, AcademicJobsOnline, and DESY. The site updates daily via GitHub Actions and displays only jobs posted in the last 30 days, filtering out stale postings even when deadlines remain open.

**Live site:** [melashri.net/hep-jobs](http://melashri.net/hep-jobs/)

## Why This Exists

Job boards in HEP often show positions posted months ago because people don't update deadlines properly. This tracker filters by posting date instead of deadline, so you only see genuinely recent opportunities. It aggregates multiple sources into one place and updates automatically without requiring a backend server, GitHub Actions handles everything. This is just another application of me abusing GitHub actions as a backend.

## How It Works

The build system fetches jobs from three sources: InspireHEP's API for experimental HEP positions, AcademicJobsOnline's RSS feed, and DESY's job board. It intelligently stops fetching from InspireHEP when it encounters old jobs (typically after just one page instead of thousands), respecting their API limits. Jobs are filtered to the last 30 days based on posting date, merged with existing data, and rendered into a static site deployed to GitHub Pages.

Run `node build-modular.js` to build locally. The modular architecture in `src/` separates data fetching, storage, and HTML generation. See [`src/README.md`](src/README.md) for details.
