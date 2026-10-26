import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = path.join(root, 'README.md');
const screenshotsDir = path.join(root, 'resources', 'screenshots');

let readme = fs.readFileSync(readmePath, 'utf8');

readme = readme.replace(
  /!\[([^\]]*)\]\(resources\/screenshots\/([^)]+)\)/g,
  (match, alt, file) => {
    const imagePath = path.join(screenshotsDir, file);
    if (!fs.existsSync(imagePath)) {
      console.warn(`Missing screenshot: ${file}`);
      return match;
    }
    const base64 = fs.readFileSync(imagePath).toString('base64');
    return `![${alt}](data:image/png;base64,${base64})`;
  }
);

fs.writeFileSync(readmePath, readme);
console.log('README screenshots embedded as data URIs.');
