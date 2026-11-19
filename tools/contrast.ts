/**
 * A port of the contrast check Orca's renderer runs before painting a plugin theme
 * (Orca 1.4.263, renderer chunk `chat-selection-mix`). Orca silently drops any token that
 * fails it and falls back to its own colors, so the build refuses such a theme instead.
 *
 * Fallback rules mirror `out/shared/plugins/artifacts/plugin-theme-css-fallbacks.js` and the
 * derivations in `plugin-theme-artifact.js`. Keep them in sync when Orca changes them.
 */
import { composite, contrastRatio, mix, parseHex, type Rgba } from './color.ts';

export type ThemeBase = 'light' | 'dark';

type FallbackRule =
  | readonly string[]
  | { readonly mixForeground: number; readonly into?: string }
  | { readonly tint: string; readonly percent: number; readonly into?: string };

type PerBaseRule = { readonly light: FallbackRule; readonly dark: FallbackRule };

interface ContrastPair {
  readonly surface: string;
  readonly text: string;
  readonly min: number;
  /** Layers under the surface, top first; the surface is painted over them. */
  readonly over?: readonly string[];
  readonly noWorseThanOver?: boolean;
  /** Tokens Orca drops when the pair fails; the pair is skipped unless the theme sets one. */
  readonly drop?: readonly string[];
}

export interface ContrastViolation {
  readonly surface: string;
  readonly text: string;
  readonly ratio: number;
  readonly min: number;
}

const TEXT_MIN = 4.5;
const DECORATION_MIN = 3;
const RING_MIN = 2;
const CHAT_CANVAS = '--chat-canvas';

const DERIVED: Readonly<Record<string, FallbackRule>> = {
  '--editor-surface': ['--background'],
  '--card': ['--background'],
  '--card-foreground': ['--foreground'],
  '--popover': ['--card', '--background'],
  '--popover-foreground': ['--card-foreground', '--foreground'],
  '--primary': ['--foreground'],
  '--primary-foreground': ['--background'],
  '--muted': ['--secondary'],
  '--secondary': ['--muted'],
  '--muted-foreground': { mixForeground: 70 },
  '--border': { mixForeground: 16 },
  '--accent': { mixForeground: 12 },
  '--accent-foreground': ['--foreground'],
  '--secondary-foreground': ['--foreground'],
  '--input': ['--border'],
  '--ring': ['--primary'],
  '--sidebar': { mixForeground: 8 },
  '--sidebar-foreground': ['--foreground'],
  '--sidebar-primary': ['--primary'],
  '--sidebar-primary-foreground': ['--primary-foreground'],
  '--sidebar-accent': ['--accent'],
  '--sidebar-accent-foreground': ['--accent-foreground'],
  '--sidebar-border': ['--border'],
  '--sidebar-ring': ['--ring'],
  '--worktree-sidebar': ['--sidebar'],
  '--worktree-sidebar-foreground': ['--sidebar-foreground'],
  '--worktree-sidebar-accent': ['--sidebar-accent'],
  '--worktree-sidebar-accent-foreground': ['--sidebar-accent-foreground'],
  '--worktree-sidebar-border': ['--sidebar-border'],
  '--worktree-sidebar-ring': ['--sidebar-ring']
};

const tint = (token: string, light: number, dark: number): PerBaseRule => ({
  light: { tint: token, percent: light },
  dark: { tint: token, percent: dark }
});

const CSS_FALLBACKS: Readonly<Record<string, FallbackRule | PerBaseRule>> = {
  '--tab-bar': ['--card'],
  '--tab-active': { light: ['--tab-bar'], dark: { mixForeground: 6, into: '--tab-bar' } },
  '--tab-active-foreground': ['--foreground'],
  '--tab-active-indicator': ['--tab-active-foreground'],
  '--tab-inactive': { light: { mixForeground: 4, into: '--tab-bar' }, dark: ['--tab-bar'] },
  '--tab-inactive-foreground': ['--muted-foreground'],
  '--worktree-sidebar-active': tint('--worktree-sidebar-foreground', 8, 10),
  '--host-badge': { light: ['--accent'], dark: { tint: '--accent', percent: 80 } },
  '--host-badge-foreground': ['--muted-foreground'],
  '--diff-added': ['--git-decoration-added'],
  '--diff-removed': ['--git-decoration-deleted'],
  '--diff-added-background': tint('--diff-added', 13, 16),
  '--diff-added-emphasis': tint('--diff-added', 15, 20),
  '--diff-removed-background': tint('--diff-removed', 11, 18),
  '--diff-removed-emphasis': tint('--diff-removed', 15, 20),
  '--chat-diff-added': { mixForeground: 30, into: '--diff-added' },
  '--chat-diff-removed': { mixForeground: 30, into: '--diff-removed' },
  '--chat-link': { mixForeground: 30, into: '--text-link' },
  '--chat-canvas': { light: ['--background'], dark: { mixForeground: 5 } },
  '--chat-foreground': { mixForeground: 88, into: CHAT_CANVAS },
  '--chat-foreground-strong': { mixForeground: 98, into: CHAT_CANVAS },
  '--chat-user-message': {
    light: { mixForeground: 4, into: CHAT_CANVAS },
    dark: { mixForeground: 7, into: CHAT_CANVAS }
  },
  '--chat-bold-foreground': ['--chat-foreground'],
  '--chat-muted-foreground': {
    light: ['--muted-foreground'],
    dark: { tint: '--muted-foreground', percent: 83, into: CHAT_CANVAS }
  },
  '--chat-code-foreground': { mixForeground: 85, into: CHAT_CANVAS },
  '--chat-inline-code-foreground': ['--chat-code-foreground'],
  '--chat-inline-code': {
    light: { mixForeground: 4, into: CHAT_CANVAS },
    dark: { tint: '--foreground', percent: 6 }
  },
  '--chat-code-block': {
    light: { mixForeground: 2, into: CHAT_CANVAS },
    dark: { tint: '--foreground', percent: 3.5 }
  },
  '--chat-selection': {
    light: { tint: '--text-link', percent: 30, into: CHAT_CANVAS },
    dark: { tint: '--text-link', percent: 40, into: CHAT_CANVAS }
  },
  '--chat-selection-foreground': ['--foreground'],
  '--editor-selection': { tint: '--ring', percent: 30 }
};

const GIT_DECORATIONS = ['added', 'modified', 'deleted', 'renamed', 'untracked', 'copied', 'ignored'];
const DIFF_KINDS = ['added', 'removed'];

const solid = (surface: string, text: string): ContrastPair => ({ surface, text, min: TEXT_MIN });
const chat = (
  surface: string,
  text: string,
  drop?: readonly string[],
  under: readonly string[] = []
): ContrastPair => ({
  surface,
  text,
  min: TEXT_MIN,
  over: [...under, CHAT_CANVAS],
  ...(drop ? { drop } : {})
});

const PAIRS: readonly ContrastPair[] = [
  solid('--background', '--foreground'),
  solid('--background', '--muted-foreground'),
  solid('--editor-surface', '--foreground'),
  solid('--editor-surface', '--muted-foreground'),
  solid('--card', '--card-foreground'),
  solid('--popover', '--popover-foreground'),
  solid('--primary', '--primary-foreground'),
  solid('--secondary', '--secondary-foreground'),
  solid('--muted', '--muted-foreground'),
  solid('--accent', '--accent-foreground'),
  solid('--sidebar', '--sidebar-foreground'),
  solid('--sidebar-primary', '--sidebar-primary-foreground'),
  solid('--sidebar-accent', '--sidebar-accent-foreground'),
  solid('--worktree-sidebar', '--worktree-sidebar-foreground'),
  solid('--worktree-sidebar-accent', '--worktree-sidebar-accent-foreground'),
  {
    ...solid('--worktree-sidebar-active', '--worktree-sidebar-foreground'),
    over: ['--worktree-sidebar'],
    drop: ['--worktree-sidebar-active']
  },
  { ...solid('--host-badge', '--host-badge-foreground'), over: ['--worktree-sidebar'] },
  solid('--tab-active', '--tab-active-foreground'),
  solid('--tab-inactive', '--tab-inactive-foreground'),
  solid('--tab-inactive', '--tab-active-foreground'),
  chat('--chat-user-message', '--chat-foreground-strong', ['--chat-user-message']),
  ...DIFF_KINDS.flatMap((kind) => [
    { ...solid(`--diff-${kind}-background`, '--foreground'), over: ['--editor-surface'], drop: [`--diff-${kind}-background`] },
    { ...solid(`--diff-${kind}-emphasis`, '--foreground'), over: ['--editor-surface'], drop: [`--diff-${kind}-emphasis`] },
    { ...solid(`--diff-${kind}-background`, `--chat-diff-${kind}`), over: [CHAT_CANVAS], drop: [`--diff-${kind}-background`] },
    chat(`--diff-${kind}-background`, `--chat-diff-${kind}`, ['--chat-code-block'], ['--chat-code-block'])
  ]),
  solid(CHAT_CANVAS, '--chat-bold-foreground'),
  solid(CHAT_CANVAS, '--chat-muted-foreground'),
  chat('--chat-user-message', '--chat-bold-foreground', ['--chat-bold-foreground']),
  ...[[], ['--chat-user-message']].flatMap((under) => [
    chat('--chat-inline-code', '--chat-inline-code-foreground', undefined, under),
    chat('--chat-inline-code', '--chat-link', ['--chat-inline-code'], under)
  ]),
  chat('--chat-code-block', '--chat-code-foreground', ['--chat-code-block']),
  chat('--chat-code-block', '--chat-foreground', ['--chat-code-block']),
  ...['--chat-code-block', '--chat-muted-foreground'].map((token) => ({
    ...chat('--chat-code-block', '--chat-muted-foreground', [token]),
    noWorseThanOver: true
  })),
  ...[[], ['--chat-user-message'], ['--chat-code-block'], ['--chat-inline-code'], ['--chat-inline-code', '--chat-user-message']].map(
    (under) => chat('--chat-selection', '--chat-selection-foreground', undefined, under)
  ),
  { ...solid('--editor-surface', '--text-link'), drop: ['--text-link'] },
  { ...solid('--editor-selection', '--foreground'), over: ['--editor-surface'], drop: ['--editor-selection'] },
  chat('--chat-user-message', '--chat-link', ['--chat-user-message']),
  ...GIT_DECORATIONS.map((kind) => ({
    surface: '--sidebar',
    text: `--git-decoration-${kind}`,
    min: DECORATION_MIN,
    drop: [`--git-decoration-${kind}`]
  }))
];

const RING_PAIRS: readonly (readonly [string, string])[] = [
  ['--ring', '--background'],
  ['--sidebar-ring', '--sidebar'],
  ['--worktree-sidebar-ring', '--worktree-sidebar'],
  ['--tab-active-indicator', '--tab-active'],
  ['--tab-active-indicator', '--sidebar']
];

function isPerBase(rule: FallbackRule | PerBaseRule): rule is PerBaseRule {
  return 'light' in rule;
}

/** Resolves a token the way Orca paints it: explicit value, else its derivation or CSS fallback. */
function createResolver(base: ThemeBase, tokens: Readonly<Record<string, string>>): (token: string) => Rgba | null {
  const cache = new Map<string, Rgba | null>();
  const applyRule = (rule: FallbackRule): Rgba | null => {
    if ('tint' in rule) {
      const color = resolve(rule.tint);
      if (!color) {
        return null;
      }
      if (!rule.into) {
        return [color[0], color[1], color[2], (color[3] * rule.percent) / 100];
      }
      const into = resolve(rule.into);
      return into ? mix(color, into, rule.percent) : null;
    }
    if ('mixForeground' in rule) {
      const foreground = resolve('--foreground');
      const into = resolve(rule.into ?? '--background');
      return foreground && into ? mix(foreground, into, rule.mixForeground) : null;
    }
    return rule.map(resolve).find((color) => color !== null) ?? null;
  };
  function resolve(token: string): Rgba | null {
    if (cache.has(token)) {
      return cache.get(token) ?? null;
    }
    cache.set(token, null);
    const explicit = tokens[token];
    const fallback = CSS_FALLBACKS[token] ?? DERIVED[token];
    let color: Rgba | null = null;
    if (explicit) {
      color = parseHex(explicit);
    } else if (fallback) {
      color = applyRule(isPerBase(fallback) ? fallback[base] : fallback);
    }
    cache.set(token, color);
    return color;
  }
  return resolve;
}

function layered(layers: readonly string[] | undefined, resolve: (token: string) => Rgba | null): Rgba | null {
  return (layers ?? []).reduceRight<Rgba | null>((below, token) => {
    const color = resolve(token);
    return color && below?.[3] === 1 ? composite(color, below) : color;
  }, null);
}

/**
 * Lists every surface/text pair whose contrast Orca would reject. An empty list means Orca
 * paints the theme as written.
 */
export function findContrastViolations(base: ThemeBase, tokens: Readonly<Record<string, string>>): ContrastViolation[] {
  const resolve = createResolver(base, tokens);
  const violations: ContrastViolation[] = [];
  for (const pair of PAIRS) {
    const dropped = pair.drop ?? [pair.surface, pair.text];
    if (!dropped.some((token) => tokens[token])) {
      continue;
    }
    const text = resolve(pair.text);
    const surface = resolve(pair.surface);
    if (!text || !surface) {
      continue;
    }
    const below = layered(pair.over, resolve);
    const painted = below?.[3] === 1 ? composite(surface, below) : surface;
    const isOpaque = painted[3] === 1 && text[3] === 1;
    const min =
      pair.noWorseThanOver && below?.[3] === 1 && text[3] === 1 ? Math.min(pair.min, contrastRatio(below, text)) : pair.min;
    const ratio = isOpaque ? contrastRatio(painted, text) : 0;
    if (ratio < min) {
      violations.push({ surface: pair.surface, text: pair.text, ratio, min });
    }
  }
  for (const [ringToken, surfaceToken] of RING_PAIRS) {
    if (!tokens[ringToken]) {
      continue;
    }
    const ring = resolve(ringToken);
    const surface = resolve(surfaceToken);
    if (!ring || !surface) {
      continue;
    }
    const ratio = contrastRatio(composite(ring, surface), surface);
    if (ratio < RING_MIN) {
      violations.push({ surface: surfaceToken, text: ringToken, ratio, min: RING_MIN });
    }
  }
  return violations;
}
