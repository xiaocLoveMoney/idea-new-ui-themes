/**
 * Imports a subset of Miguel Solorio's "Symbols" file icons (MIT) as an Orca icon theme source.
 *
 *   git clone --depth 1 https://github.com/miguelsolorio/vscode-symbols.git <checkout>
 *   node tools/import-symbols.ts <checkout>
 *
 * Writes src/symbols-mapping.json and copies the referenced SVGs into icons/symbols/. Then run
 * `node tools/tighten-icons.ts icons/symbols` (crops Symbols' padding so icons fill Orca's slot)
 * and `node tools/build.ts` to produce icons/symbols.json.
 *
 * Why a subset: Orca accepts at most 512 name mappings per icon theme, and Symbols ships over
 * 1,400. The priority lists below keep the names people meet most often.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './build.ts';

const MAX_MAPPINGS = 512;
const MAX_SVG_BYTES = 64 * 1024;
const FOLDER_BUDGET = 100;
const FILE_NAME_BUDGET = 110;
const OUTPUT_DIR = join(ROOT, 'icons', 'symbols');
const MAPPING_FILE = join(ROOT, 'src', 'symbols-mapping.json');
/** Orca draws icons as sanitized images; external references and embedded rasters do not survive. */
const UNSUPPORTED_SVG = /<!DOCTYPE|<!ENTITY|<script|<foreignObject|<image|href=/i;

const FOLDER_PRIORITY = `src source lib libs app apps packages components component pages views view layouts
  public static assets images img icons fonts styles css scss sass themes theme scripts script bin
  test tests __tests__ spec specs e2e cypress playwright mocks __mocks__ fixtures coverage docs doc
  config configs configuration settings env .vscode .idea .github .gitlab .husky .devcontainer .circleci
  build dist out output target node_modules vendor .next .nuxt .svelte-kit .turbo .cache tmp temp logs log
  api apis server client services service middleware middlewares models model controllers controller
  routes router routers hooks utils util helpers helper shared common core types typings interfaces
  store stores state redux context contexts providers provider plugins plugin modules module i18n locales
  lang database db migrations seeds prisma sql data content posts blog functions lambda workflows
  docker k8s kubernetes helm terraform infra deploy deployment ci tools`.split(/\s+/);

const FILE_NAME_PRIORITY = `package.json package-lock.json yarn.lock pnpm-lock.yaml pnpm-workspace.yaml bun.lockb bun.lock
  tsconfig.json jsconfig.json .npmrc .nvmrc .node-version .yarnrc.yml .editorconfig .gitignore .gitattributes
  .gitmodules .gitkeep .dockerignore dockerfile docker-compose.yml docker-compose.yaml compose.yml compose.yaml
  makefile cmakelists.txt readme.md license license.md changelog.md contributing.md code_of_conduct.md
  security.md codeowners .env .env.local .env.example .env.development .env.production .prettierrc
  .prettierrc.json .prettierignore prettier.config.js .eslintrc .eslintrc.js .eslintrc.json eslint.config.js
  eslint.config.mjs .eslintignore biome.json biome.jsonc .stylelintrc vite.config.ts vite.config.js
  vitest.config.ts vitest.config.js webpack.config.js rollup.config.js rollup.config.mjs next.config.js
  next.config.mjs next.config.ts nuxt.config.ts svelte.config.js astro.config.mjs tailwind.config.js
  tailwind.config.ts postcss.config.js postcss.config.cjs babel.config.js .babelrc jest.config.js
  jest.config.ts playwright.config.ts cypress.config.ts turbo.json nx.json lerna.json vercel.json
  netlify.toml wrangler.toml wrangler.json firebase.json angular.json nest-cli.json go.mod go.sum go.work
  cargo.toml cargo.lock rust-toolchain.toml pyproject.toml requirements.txt pipfile pipfile.lock poetry.lock
  uv.lock setup.py setup.cfg tox.ini .python-version manage.py gemfile gemfile.lock rakefile composer.json
  composer.lock build.gradle build.gradle.kts settings.gradle settings.gradle.kts gradle.properties gradlew
  pom.xml mvnw build.sbt deno.json deno.jsonc .browserslistrc .travis.yml jenkinsfile procfile
  .htaccess robots.txt favicon.ico manifest.json claude.md agents.md .mcp.json`.split(/\s+/);

const EXTENSION_PRIORITY = `ts tsx mts cts d.ts js jsx mjs cjs vue svelte astro html htm css scss sass less styl
  json jsonc json5 yaml yml toml xml md mdx markdown rst txt csv tsv log ini cfg conf properties env
  py pyi ipynb rb erb go mod rs java kt kts groovy gradle scala sc clj cljs edn c h cpp cc cxx hpp hh
  cs fs vb swift m mm dart lua php pl pm r rmd jl ex exs erl hrl hs elm ml mli nim zig v sol
  sh bash zsh fish ps1 psm1 bat cmd sql prisma graphql gql proto tf tfvars hcl nix dockerfile
  png jpg jpeg gif webp avif svg ico icns bmp tiff mp4 mov webm avi mkv mp3 wav ogg flac
  ttf otf woff woff2 eot zip tar gz tgz bz2 xz 7z rar jar war pdf doc docx xls xlsx ppt pptx
  lock patch diff wasm bin exe dll so dylib db sqlite sqlite3 pem key crt cer pub asc gpg
  liquid hbs handlebars mustache ejs pug njk twig jinja j2 tpl http rest map snap test.ts spec.ts
  test.js spec.js test.tsx spec.tsx stories.tsx stories.ts d.mts d.cts vtt srt po pot mo
  cue astro.config wgsl glsl frag vert hlsl shader`.split(/\s+/);

interface SymbolsTheme {
  readonly iconDefinitions: Record<string, { readonly iconPath: string }>;
  readonly fileExtensions: Record<string, string>;
  readonly fileNames: Record<string, string>;
  readonly folderNames: Record<string, string>;
  readonly file: string;
  readonly folder: string;
}

function readTheme(checkout: string): SymbolsTheme {
  const path = join(checkout, 'src', 'symbol-icon-theme.json');
  if (!existsSync(path)) {
    throw new Error(`${path} not found; pass a vscode-symbols checkout`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SymbolsTheme;
}

/** Icon ids whose SVG Orca can draw: small enough and free of references it strips. */
function usableIcons(checkout: string, theme: SymbolsTheme): Map<string, string> {
  const usable = new Map<string, string>();
  for (const [id, definition] of Object.entries(theme.iconDefinitions)) {
    const svgPath = join(checkout, 'src', definition.iconPath);
    if (!existsSync(svgPath) || statSync(svgPath).size > MAX_SVG_BYTES) {
      continue;
    }
    if (UNSUPPORTED_SVG.test(readFileSync(svgPath, 'utf8'))) {
      continue;
    }
    usable.set(id, svgPath);
  }
  return usable;
}

function pick(
  priority: readonly string[],
  source: Readonly<Record<string, string>>,
  usable: ReadonlyMap<string, string>,
  budget: number
): Record<string, string> {
  const lowered = new Map(Object.entries(source).map(([name, icon]) => [name.toLowerCase(), icon]));
  const picked: Record<string, string> = {};
  for (const name of priority) {
    if (Object.keys(picked).length >= budget) {
      break;
    }
    const icon = lowered.get(name.toLowerCase());
    if (icon && usable.has(icon) && !(name in picked)) {
      picked[name] = icon;
    }
  }
  return picked;
}

/** Adds the source's remaining usable names, in its own order, until the budget is spent. */
function fill(
  picked: Record<string, string>,
  source: Readonly<Record<string, string>>,
  usable: ReadonlyMap<string, string>,
  budget: number
): void {
  const taken = new Set(Object.keys(picked).map((name) => name.toLowerCase()));
  for (const [name, icon] of Object.entries(source)) {
    if (Object.keys(picked).length >= budget) {
      return;
    }
    if (usable.has(icon) && !taken.has(name.toLowerCase())) {
      picked[name.toLowerCase()] = icon;
      taken.add(name.toLowerCase());
    }
  }
}

function main(): void {
  const checkout = process.argv[2];
  if (!checkout) {
    throw new Error('usage: node tools/import-symbols.ts <vscode-symbols checkout>');
  }
  const theme = readTheme(checkout);
  const usable = usableIcons(checkout, theme);
  const icons = { file: theme.file, folder: theme.folder };
  const folderNames = pick(FOLDER_PRIORITY, theme.folderNames, usable, FOLDER_BUDGET);
  const fileNames = pick(FILE_NAME_PRIORITY, theme.fileNames, usable, FILE_NAME_BUDGET);
  const extensionBudget = MAX_MAPPINGS - Object.keys(icons).length - Object.keys(folderNames).length - Object.keys(fileNames).length;
  const fileExtensions = pick(EXTENSION_PRIORITY, theme.fileExtensions, usable, extensionBudget);
  // Spend what the priority lists left over: more extensions first, then more file names.
  fill(fileExtensions, theme.fileExtensions, usable, extensionBudget);
  const fileNameBudget = MAX_MAPPINGS - Object.keys(icons).length - Object.keys(folderNames).length - Object.keys(fileExtensions).length;
  fill(fileNames, theme.fileNames, usable, fileNameBudget);

  const used = new Set([...Object.values(icons), ...Object.values(folderNames), ...Object.values(fileNames), ...Object.values(fileExtensions)]);
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const id of used) {
    const source = usable.get(id);
    if (!source) {
      throw new Error(`icon ${id} is referenced but not usable`);
    }
    copyFileSync(source, join(OUTPUT_DIR, `${id}.svg`));
  }
  writeFileSync(MAPPING_FILE, `${JSON.stringify({ icons, fileNames, fileExtensions, folderNames }, null, 2)}\n`);
  const counts = [Object.keys(folderNames).length, Object.keys(fileNames).length, Object.keys(fileExtensions).length];
  process.stdout.write(
    `folders ${counts[0]}, file names ${counts[1]}, extensions ${counts[2]}, ${readdirSync(OUTPUT_DIR).length} SVGs\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
