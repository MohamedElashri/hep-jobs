/**
 * File Manager Module
 * Handles file operations and directory management
 */

const fs = require('fs');
const path = require('path');

class FileManager {
  constructor(config) {
    this.config = config;
  }

  log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const emoji = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" }[type];
    console.log(`${emoji} [${timestamp}] ${message}`);
  }

  ensureDirectories() {
    [this.config.dataDir, this.config.docsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  copyAssets() {
    this.log("Copying CSS and JavaScript assets...");
    
    try {
      // Copy CSS
      const cssSource = path.join(__dirname, '../styles/main.css');
      const cssTarget = path.join(this.config.docsDir, 'style.css');
      fs.copyFileSync(cssSource, cssTarget);
      
      // Copy JavaScript
      const jsSource = path.join(__dirname, '../scripts/main.js');
      const jsTarget = path.join(this.config.docsDir, 'script.js');
      fs.copyFileSync(jsSource, jsTarget);
      
      this.log("Assets copied successfully", "success");
    } catch (error) {
      this.log(`Error copying assets: ${error.message}`, "error");
      throw error;
    }
  }

  writeHTML(html) {
    try {
      const targetPath = path.join(this.config.docsDir, 'index.html');
      fs.writeFileSync(targetPath, html);
      this.log("HTML file written successfully", "success");
    } catch (error) {
      this.log(`Error writing HTML file: ${error.message}`, "error");
      throw error;
    }
  }
}

module.exports = FileManager;