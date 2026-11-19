/**
 * Generates the Orca theme files from `src/`:
 *   src/palettes/<id>.json  -> themes/<id>.json, terminal/<id>.json
 *   src/icon-mapping.json   -> icons/intellij-<variant>.json
 *
 * Usage: `node tools/build.ts` writes the files; `node tools/build.ts --check` fails when a
 * generated file is missing or out of date (nothing is written).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHexColor } from './color.ts';
import { findContrastViolations, type ThemeBase } from './contrast.ts';
import { SYNTAX_SCOPES, type SyntaxRole } from './syntax-scopes.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE_DIR = join(ROOT, 'src', 'palettes');
const ICON_MAPPING_FILE = join(ROOT, 'src', 'icon-mapping.json');
const CHECK_FLAG = '--check';
const SCHEMA_VERSION = 1;
const MAX_THEME_BYTES = 16 * 1024;
const MAX_ICON_MAPPINGS = 512;
const ICON_VARIANTS = ['light', 'dark'] as const;
const FONT_STYLE = /^(?:(?:italic|bold|underline|strikethrough)(?: (?:italic|bold|underline|strikethrough))*)?$/;

/** Orca 1.4.263 public app theme tokens; any other key makes Orca refuse the theme. */
export const ORCA_THEME_TOKENS: ReadonlySet<string> = new Set([
  '--background', '--editor-surface', '--foreground', '--card', '--card-foreground', '--popover',
  '--popover-foreground', '--primary', '--primary-foreground', '--secondary', '--secondary-foreground',
  '--muted', '--muted-foreground', '--accent', '--accent-foreground', '--border', '--input', '--ring',
  '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--sidebar', '--sidebar-foreground',
  '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
  '--sidebar-border', '--sidebar-ring', '--worktree-sidebar', '--worktree-sidebar-foreground',
  '--worktree-sidebar-accent', '--worktree-sidebar-accent-foreground', '--worktree-sidebar-border',
  '--worktree-sidebar-ring', '--worktree-sidebar-active', '--worktree-sidebar-active-border', '--host-badge',
  '--host-badge-foreground', '--tab-bar', '--tab-active', '--tab-active-foreground', '--tab-active-indicator',
  '--tab-inactive', '--tab-inactive-foreground', '--split-divider', '--split-divider-hover',
  '--chat-user-message', '--chat-bold-foreground', '--chat-muted-foreground', '--chat-inline-code',
  '--chat-inline-code-foreground', '--chat-code-block', '--chat-selection', '--chat-selection-foreground',
  '--text-link', '--editor-selection', '--diff-added', '--diff-added-background', '--diff-added-emphasis',
  '--diff-added-gutter', '--diff-removed', '--diff-removed-background', '--diff-removed-emphasis',
  '--diff-removed-gutter', '--git-decoration-added', '--git-decoration-modified', '--git-decoration-deleted',
  '--git-decoration-renamed', '--git-decoration-untracked', '--git-decoration-copied', '--git-decoration-ignored'
]);

/** Terminal color keys Orca reads, in xterm order. */
export const TERMINAL_KEYS: readonly string[] = [
  'foreground', 'background', 'cursor', 'cursorAccent', 'selectionBackground', 'selectionForeground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed',
  'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
];
const REQUIRED_TERMINAL_KEYS: readonly string[] = TERMINAL_KEYS.filter((key) => !key.startsWith('selection') && key !== 'cursorAccent');

type SyntaxStyle = string | { readonly color?: string; readonly fontStyle?: string };

export interface Palette {
  readonly id: string;
  readonly title: string;
  readonly base: ThemeBase;
  readonly iconVariant: (typeof ICON_VARIANTS)[number];
  readonly tokens: Readonly<Record<string, string>>;
  readonly syntax: Readonly<Partial<Record<SyntaxRole, SyntaxStyle>>>;
  readonly terminal: Readonly<Record<string, string>>;
}

interface IconMapping {
  readonly icons: Readonly<Record<string, string>>;
  readonly fileNames: Readonly<Record<string, string>>;
  readonly fileExtensions: Readonly<Record<string, string>>;
  readonly folderNames: Readonly<Record<string, string>>;
}

interface TokenColorRule {
  readonly scope: readonly string[];
  readonly settings: { foreground?: string; fontStyle?: string };
}

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw new Error(`cannot read ${relative(ROOT, path)}`, { cause: error });
  }
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Loads every palette in `src/palettes`, sorted by file name. */
export function loadPalettes(): Palette[] {
  return readdirSync(PALETTE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson<Palette>(join(PALETTE_DIR, name)));
}

function assertPalette(palette: Palette): void {
  const problems: string[] = [];
  for (const [token, value] of Object.entries(palette.tokens)) {
    if (!ORCA_THEME_TOKENS.has(token)) {
      problems.push(`${token} is not an Orca theme token`);
    }
    if (!isHexColor(value)) {
      problems.push(`${token} must be a hex color, got ${value}`);
    }
  }
  for (const [role, style] of Object.entries(palette.syntax)) {
    if (!(role in SYNTAX_SCOPES)) {
      problems.push(`syntax role ${role} has no scope mapping`);
    }
    const color = typeof style === 'string' ? style : style?.color;
    const fontStyle = typeof style === 'string' ? undefined : style?.fontStyle;
    if (color !== undefined && !/^#(?:[0-9a-f]{6})$/i.test(color)) {
      problems.push(`syntax ${role} must be a 6-digit hex color, got ${color}`);
    }
    if (fontStyle !== undefined && !FONT_STYLE.test(fontStyle)) {
      problems.push(`syntax ${role} has an invalid fontStyle ${fontStyle}`);
    }
  }
  for (const key of REQUIRED_TERMINAL_KEYS) {
    if (!palette.terminal[key]) {
      problems.push(`terminal.${key} is missing`);
    }
  }
  for (const [key, value] of Object.entries(palette.terminal)) {
    if (!TERMINAL_KEYS.includes(key) || !/^#[0-9a-f]{6}$/i.test(value)) {
      problems.push(`terminal.${key}=${value} is not a known key with a 6-digit hex color`);
    }
  }
  for (const violation of findContrastViolations(palette.base, palette.tokens)) {
    problems.push(
      `contrast ${violation.text} on ${violation.surface} is ${violation.ratio.toFixed(2)}, needs ${violation.min}`
    );
  }
  if (problems.length > 0) {
    throw new Error(`palette ${palette.id}:\n  ${problems.join('\n  ')}`);
  }
}

/** Expands the palette's syntax roles into VS Code `tokenColors`, in the mapping's order. */
export function buildTokenColors(palette: Palette): TokenColorRule[] {
  const rules: TokenColorRule[] = [];
  for (const [role, scopes] of Object.entries(SYNTAX_SCOPES) as [SyntaxRole, readonly string[]][]) {
    const style = palette.syntax[role];
    if (style === undefined) {
      continue;
    }
    const settings =
      typeof style === 'string'
        ? { foreground: style }
        : {
            ...(style.color ? { foreground: style.color } : {}),
            ...(style.fontStyle !== undefined ? { fontStyle: style.fontStyle } : {})
          };
    rules.push({ scope: scopes, settings });
  }
  return rules;
}

function buildAppTheme(palette: Palette): GeneratedFile {
  const content = serialize({
    schemaVersion: SCHEMA_VERSION,
    base: palette.base,
    tokens: palette.tokens,
    tokenColors: buildTokenColors(palette)
  });
  const bytes = Buffer.byteLength(content);
  if (bytes > MAX_THEME_BYTES) {
    throw new Error(`themes/${palette.id}.json is ${bytes} bytes, Orca accepts at most ${MAX_THEME_BYTES}`);
  }
  return { path: `themes/${palette.id}.json`, content };
}

function buildTerminalTheme(palette: Palette): GeneratedFile {
  const terminal = Object.fromEntries(TERMINAL_KEYS.filter((key) => palette.terminal[key]).map((key) => [key, palette.terminal[key]]));
  return {
    path: `terminal/${palette.id}.json`,
    content: serialize({ schemaVersion: SCHEMA_VERSION, mode: palette.base, terminal })
  };
}

function buildIconThemes(mapping: IconMapping): GeneratedFile[] {
  const mappingCount = [mapping.icons, mapping.fileNames, mapping.fileExtensions, mapping.folderNames].reduce(
    (total, map) => total + Object.keys(map).length,
    0
  );
  if (mappingCount > MAX_ICON_MAPPINGS) {
    throw new Error(`icon mapping has ${mappingCount} entries, Orca accepts at most ${MAX_ICON_MAPPINGS}`);
  }
  return ICON_VARIANTS.map((variant) => {
    const toPath = (icon: string): string => {
      const path = `icons/${variant}/${icon}.svg`;
      if (!existsSync(join(ROOT, path))) {
        throw new Error(`icon mapping points at missing ${path}`);
      }
      return path;
    };
    const mapValues = (map: Readonly<Record<string, string>>): Record<string, string> =>
      Object.fromEntries(Object.entries(map).map(([name, icon]) => [name, toPath(icon)]));
    const icons = mapValues(mapping.icons);
    const folderNames = mapValues(mapping.folderNames);
    return {
      path: `icons/intellij-${variant}.json`,
      content: serialize({
        schemaVersion: SCHEMA_VERSION,
        icons,
        fileNames: mapValues(mapping.fileNames),
        fileExtensions: mapValues(mapping.fileExtensions),
        // Why: the New UI draws open and closed folders with the same icon.
        folderNames,
        folderNamesExpanded: folderNames
      })
    };
  });
}

/** Builds every generated file in memory, validating palettes first. */
export function generateAll(): GeneratedFile[] {
  const palettes = loadPalettes();
  palettes.forEach(assertPalette);
  return [
    ...palettes.flatMap((palette) => [buildAppTheme(palette), buildTerminalTheme(palette)]),
    ...buildIconThemes(readJson<IconMapping>(ICON_MAPPING_FILE))
  ];
}

/** Paths whose content on disk differs from what the build would write. */
export function staleFiles(files: readonly GeneratedFile[]): string[] {
  return files
    .filter((file) => {
      const target = join(ROOT, file.path);
      return !existsSync(target) || readFileSync(target, 'utf8') !== file.content;
    })
    .map((file) => file.path);
}

function main(): void {
  const files = generateAll();
  if (process.argv.includes(CHECK_FLAG)) {
    const stale = staleFiles(files);
    if (stale.length > 0) {
      throw new Error(`out of date, run \`node tools/build.ts\`: ${stale.join(', ')}`);
    }
    process.stdout.write(`${files.length} generated files are up to date\n`);
    return;
  }
  for (const file of files) {
    const target = join(ROOT, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  process.stdout.write(`wrote ${files.length} files\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
