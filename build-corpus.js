#!/usr/bin/env node
/**
 * build-corpus.js
 * ----------------
 * Reads every .md / .txt file in ./corpus/ and compiles them into corpus.json,
 * the file thealvearium.xyz actually fetches in the browser.
 *
 * Usage:  node build-corpus.js
 * Run this any time you add, edit, or remove a file in corpus/, then commit
 * both the source file and the regenerated corpus.json, and push.
 *
 * FRONTMATTER (optional, at the top of a .md file, between --- lines):
 *   ---
 *   tag: Acoustics
 *   title: Perceived Pleasantness of Pure Tones
 *   authors: Placeholder, C.
 *   journal: Journal of the Acoustical Society
 *   year: 2016
 *   sourceUrl: https://example.com/paper
 *   sourceLabel: Read the original ↗
 *   ---
 *   The rest of the file is the summary text.
 *
 * If a file has no frontmatter (plain .txt, or a .md you dropped in quickly),
 * the script falls back sensibly: filename becomes the title, whole file
 * becomes the summary, everything else is left blank.
 */

const fs = require('fs');
const path = require('path');

const CORPUS_DIR = path.join(__dirname, 'corpus');
const OUTPUT_FILE = path.join(__dirname, 'corpus.json');
const VALID_EXT = ['.md', '.txt'];

function titleFromFilename(filename) {
  const base = filename.replace(/\.(md|txt)$/i, '');
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Recursively walk corpus/ (and any subfolders, e.g. Interests/ Paper/ Resources/),
// following symlinks — this is what lets `corpus` be a symlink into your Obsidian vault.
function walk(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    // stat() follows symlinks (unlike lstat), so a symlinked subfolder is walked too
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (VALID_EXT.includes(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: raw };

  const [, fmBlock, body] = match;
  const fields = {};
  fmBlock.split('\n').forEach(line => {
    const lineMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!lineMatch) return;
    let [, key, value] = lineMatch;
    value = value.trim().replace(/^["']|["']$/g, ''); // strip surrounding quotes if present
    fields[key.trim()] = value;
  });
  return { fields, body };
}

function buildEntry(fullPath, raw) {
  const filename = path.basename(fullPath);
  const { fields, body } = parseFrontmatter(raw);
  const summary = (fields.summary || body || '').trim();

  // if frontmatter doesn't set a tag, fall back to the immediate parent folder name
  // (e.g. a file inside corpus/Paper/ with no `tag:` gets tagged "Paper")
  const parentFolder = path.basename(path.dirname(fullPath));
  const inferredTag = parentFolder === 'corpus' ? 'Uncategorized' : parentFolder;

  return {
    tag: fields.tag || inferredTag,
    title: fields.title || titleFromFilename(filename),
    authors: fields.authors || '',
    journal: fields.journal || '',
    year: fields.year || '',
    summary: summary,
    sourceUrl: fields.sourceUrl || '#',
    sourceLabel: fields.sourceLabel || 'Read the original ↗',
    slug: filename.replace(/\.(md|txt)$/i, '')
  };
}

function main() {
  if (!fs.existsSync(CORPUS_DIR)) {
    console.error(`No corpus/ folder found at ${CORPUS_DIR}. Create it (or symlink it) first.`);
    process.exit(1);
  }

  const files = walk(CORPUS_DIR).sort();

  if (files.length === 0) {
    console.warn('No .md or .txt files found under corpus/ — writing an empty corpus.json.');
  }

  const entries = files.map(fullPath => {
    const raw = fs.readFileSync(fullPath, 'utf8');
    try {
      return buildEntry(fullPath, raw);
    } catch (err) {
      console.error(`Skipping ${fullPath}: ${err.message}`);
      return null;
    }
  }).filter(Boolean);

  // newest year first, undated entries last
  entries.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(entries, null, 2));
  console.log(`Wrote ${entries.length} entries to corpus.json`);
  entries.forEach(e => console.log(`  - [${e.tag}] ${e.title}`));
}

main();
