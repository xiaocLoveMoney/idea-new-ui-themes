import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  backgroundForChatCanvas,
  generateAll,
  loadPalettes,
  ORCA_THEME_TOKENS,
  ROOT,
  staleFiles,
  themeTokens
} from './build.ts';
import { contrastRatio, mix, parseHex } from './color.ts';
import { findContrastViolations } from './contrast.ts';
import { squareViewBox, withViewBox } from './tighten-icons.ts';

const EXPECTED_VARIANTS = ['islands-dark', 'islands-light', 'new-ui-dark', 'new-ui-light'];
const AA_TEXT = 4.5;

test('parseHex reads short, long and alpha forms', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(parseHex('#1E1F22'), [30, 31, 34, 1]);
  assert.deepEqual(parseHex('#00000080'), [0, 0, 0, 128 / 255]);
  assert.throws(() => parseHex('rgb(0,0,0)'));
});

test('contrastRatio matches WCAG reference values', () => {
  assert.equal(contrastRatio(parseHex('#000000'), parseHex('#FFFFFF')).toFixed(2), '21.00');
  assert.equal(contrastRatio(parseHex('#777777'), parseHex('#FFFFFF')).toFixed(2), '4.48');
});

test('mix follows color-mix(in srgb) weighting', () => {
  assert.deepEqual(mix(parseHex('#FFFFFF'), parseHex('#000000'), 50), [127.5, 127.5, 127.5, 1]);
});

test('contrast check flags what Orca would drop', () => {
  const violations = findContrastViolations('dark', {
    '--background': '#1E1F22',
    '--foreground': '#DFE1E5',
    '--primary': '#3574F0',
    '--primary-foreground': '#FFFFFF'
  });
  assert.ok(violations.some((violation) => violation.surface === '--primary'));
});

test('contrast check ignores pairs the theme does not set', () => {
  assert.deepEqual(findContrastViolations('dark', { '--background': '#1E1F22', '--foreground': '#DFE1E5' }), []);
});

test('dark chat canvas is reproduced from the derived background', () => {
  const background = backgroundForChatCanvas('dark', '#1E1F22', '#DFE1E5');
  const painted = mix(parseHex('#DFE1E5'), parseHex(background), 5);
  [30, 31, 34].forEach((channel, index) => assert.ok(Math.abs(painted[index] - channel) <= 1));
  assert.equal(backgroundForChatCanvas('light', '#FFFFFF', '#000000'), '#FFFFFF');
  assert.throws(() => backgroundForChatCanvas('dark', '#000000', '#FFFFFF'));
});

test('there is one palette per variant', () => {
  assert.deepEqual(
    loadPalettes().map((palette) => palette.id),
    EXPECTED_VARIANTS
  );
});

test('palettes use public tokens and pass the core text contrast pairs', () => {
  for (const palette of loadPalettes()) {
    const tokens = themeTokens(palette);
    for (const token of Object.keys(tokens)) {
      assert.ok(ORCA_THEME_TOKENS.has(token), `${palette.id}: ${token}`);
    }
    const ratio = contrastRatio(parseHex(tokens['--background']), parseHex(tokens['--foreground']));
    assert.ok(ratio >= AA_TEXT, `${palette.id}: body text contrast ${ratio}`);
  }
});

test('generated files are committed and up to date', () => {
  assert.deepEqual(staleFiles(generateAll()), []);
});

test('manifest lists every generated theme file', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'orca-plugin.json'), 'utf8'));
  const listed = new Set(
    ['themes', 'terminalThemes', 'iconThemes'].flatMap((kind) =>
      manifest.contributes[kind].map((entry: { path: string }) => entry.path)
    )
  );
  for (const file of generateAll()) {
    assert.ok(listed.has(file.path), `${file.path} is not in orca-plugin.json`);
  }
});

test('tighten-icons squares the drawing box and rewrites only the root viewBox', () => {
  assert.equal(squareViewBox(3, 7, 21, 17), '2.28 2.28 19.44 19.44');
  const svg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><svg viewBox="0 0 1 1"></svg></svg>';
  assert.equal(
    withViewBox(svg, '1 1 22 22'),
    '<svg width="24" height="24" viewBox="1 1 22 22" fill="none"><svg viewBox="0 0 1 1"></svg></svg>'
  );
});
