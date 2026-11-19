/**
 * Crops each SVG's viewBox to the square around its drawing, so icons drawn with generous
 * padding (Symbols uses a 24x24 canvas with ~3px margins) fill Orca's small icon slot.
 *
 *   node tools/tighten-icons.ts icons/symbols
 *
 * Bounding boxes come from a headless Chrome (`CHROME` overrides its path), because SVG geometry
 * with curves, arcs and transforms is only measured reliably by a real renderer.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Breathing room around the drawing, as a fraction of its larger side. */
const PADDING_RATIO = 0.01;
const DECIMALS = 2;
/** Kept on the root element so renderers that size by intrinsic dimensions still see a square. */
const INTRINSIC_SIZE = 24;
const OUTPUT_MARKER = /<pre id="out">([\s\S]*?)<\/pre>/;
const SVG_OPEN_TAG = /<svg\b[^>]*>/;

type Box = readonly [name: string, minX: number, minY: number, maxX: number, maxY: number];

const MEASURE_SCRIPT = `
const boxes = [];
for (const holder of document.querySelectorAll('div[data-name]')) {
  const svg = holder.querySelector('svg');
  if (!svg) continue;
  const box = svg.getBBox();
  let stroke = 0;
  for (const element of svg.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    if (style.stroke && style.stroke !== 'none') stroke = Math.max(stroke, parseFloat(style.strokeWidth) || 0);
  }
  const half = stroke / 2;
  boxes.push([holder.dataset.name, box.x - half, box.y - half, box.x + box.width + half, box.y + box.height + half]);
}
document.getElementById('out').textContent = JSON.stringify(boxes);
`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function measure(directory: string, names: readonly string[]): Box[] {
  const holders = names.map((name) => {
    const svg = readFileSync(join(directory, name), 'utf8');
    return `<div data-name="${name}">${svg.slice(svg.indexOf('<svg'))}</div>`;
  });
  const page = `<!doctype html><html><body>${holders.join('')}<pre id="out"></pre><script>${MEASURE_SCRIPT}</script></body></html>`;
  const workDir = mkdtempSync(join(tmpdir(), 'tighten-icons-'));
  try {
    const pagePath = join(workDir, 'measure.html');
    writeFileSync(pagePath, page);
    const dom = execFileSync(
      process.env.CHROME ?? DEFAULT_CHROME,
      ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--dump-dom', pathToFileURL(pagePath).href],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const match = OUTPUT_MARKER.exec(dom);
    if (!match) {
      throw new Error('headless Chrome returned no measurements');
    }
    const json = match[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return JSON.parse(json) as Box[];
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** The square viewBox centered on the box, padded by PADDING_RATIO. */
export function squareViewBox(minX: number, minY: number, maxX: number, maxY: number): string {
  const side = Math.max(maxX - minX, maxY - minY) * (1 + PADDING_RATIO * 2);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const round = (value: number): string => String(Number(value.toFixed(DECIMALS)));
  return [centerX - side / 2, centerY - side / 2, side, side].map(round).join(' ');
}

/** Replaces the root svg's viewBox and sets a square intrinsic size. */
export function withViewBox(svg: string, viewBox: string): string {
  return svg.replace(SVG_OPEN_TAG, (tag) => {
    const stripped = tag.replace(/\s(?:viewBox|width|height)="[^"]*"/g, '');
    return stripped.replace(
      /^<svg\b/,
      `<svg width="${INTRINSIC_SIZE}" height="${INTRINSIC_SIZE}" viewBox="${escapeHtml(viewBox)}"`
    );
  });
}

function main(): void {
  const directory = process.argv[2];
  if (!directory) {
    throw new Error('usage: node tools/tighten-icons.ts <svg directory>');
  }
  const absolute = resolve(directory);
  const names = readdirSync(absolute).filter((name) => name.endsWith('.svg')).sort();
  const boxes = measure(absolute, names);
  let changed = 0;
  for (const [name, minX, minY, maxX, maxY] of boxes) {
    if (!(maxX > minX && maxY > minY)) {
      continue;
    }
    const path = join(absolute, name);
    const svg = readFileSync(path, 'utf8');
    const tightened = withViewBox(svg, squareViewBox(minX, minY, maxX, maxY));
    if (tightened !== svg) {
      writeFileSync(path, tightened);
      changed += 1;
    }
  }
  process.stdout.write(`tightened ${changed} of ${names.length} icons\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
