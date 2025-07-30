# HEP Jobs Tracker

A modern, responsive web application that tracks High Energy Physics job opportunities from InspireHEP.

## 🚀 Features

- **Responsive Design**: Mobile-first design that works on all devices
- **Dark/Light Mode**: Toggle between themes with preference persistence
- **Interactive Search**: Real-time job filtering and search functionality
- **Clickable Header**: Easy page refresh by clicking the main title
- **Automatic Updates**: Daily updates via GitHub Actions

## 🏗️ Architecture

The project uses a **modular architecture** with clean separation of concerns:

- **Modular Build System**: Located in `src/` directory with separate modules for data fetching, HTML generation, and file management
- **Template-Based**: HTML generation uses templates instead of string concatenation
- **Source-Controlled Assets**: CSS and JavaScript are maintained as source files, not generated strings

### Build Options

```bash
# New modular build system (recommended)
node build-modular.js

# Legacy build system (still available)
node build.js
```

## 📁 Project Structure

```
├── src/                    # Modular source code
│   ├── modules/           # Core functionality modules
│   ├── templates/         # HTML templates
│   ├── styles/           # CSS source files
│   └── scripts/          # JavaScript source files
├── docs/                  # Generated static site (GitHub Pages)
├── data/                  # Job data storage
└── build.js              # Legacy monolithic build script
```

For detailed architecture documentation, see [`src/README.md`](src/README.md).

## 🌐 Live Site

The tracker is automatically deployed to GitHub Pages: [View Live Site](https://mohammedelashri.github.io/hep-jobs/)

Data sourced from [InspireHEP](https://inspirehep.net)
