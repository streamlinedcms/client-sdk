import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';
import { readFileSync, existsSync } from 'fs';

// Load environment variables from .env file based on mode
// Usage: rollup -c --environment MODE:staging
function loadEnv(mode) {
  const envFile = mode ? `.env.${mode}` : '.env';
  const env = {};

  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  }

  return env;
}

const mode = process.env.MODE;
const env = loadEnv(mode);

// Get URLs from env or use defaults
const SDK_API_URL = env.SDK_API_URL || 'https://api.streamlinedcms.com';
const SDK_APP_URL = env.SDK_APP_URL || 'https://app.streamlinedcms.com';

// Replace plugin config - substitutes build-time constants
const replacePlugin = replace({
  preventAssignment: true,
  values: {
    __SDK_API_URL__: JSON.stringify(SDK_API_URL),
    __SDK_APP_URL__: JSON.stringify(SDK_APP_URL),
  },
});

// Terser plugin config - minification with preserved class names
const terserPlugin = terser({
  keep_classnames: true,
  keep_fnames: true,
});

// PostCSS plugin config - processes Tailwind CSS and injects as string
// Note: shadowDomFix plugin is configured in postcss.config.cjs to run after Tailwind
const postcssPlugin = postcss({
  inject: false,  // Don't inject into DOM, we handle it manually
  minimize: true, // Minify the output
});

export default [
  // Sync loader - unminified
  {
    input: 'src/loader.ts',
    output: {
      file: 'dist/streamlined-cms.js',
      format: 'iife',
      sourcemap: true,
    },
    plugins: [
      replacePlugin,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
    ],
  },
  // Sync loader - minified
  {
    input: 'src/loader.ts',
    output: {
      file: 'dist/streamlined-cms.min.js',
      format: 'iife',
      sourcemap: true,
    },
    plugins: [
      replacePlugin,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      terserPlugin,
    ],
  },
  // ESM bundle - unminified
  {
    input: 'src/lazy/index.ts',
    output: {
      file: 'dist/streamlined-cms.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      replacePlugin,
      nodeResolve(),
      postcssPlugin,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
      }),
    ],
  },
  // ESM bundle - minified
  {
    input: 'src/lazy/index.ts',
    output: {
      file: 'dist/streamlined-cms.esm.min.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      replacePlugin,
      nodeResolve(),
      postcssPlugin,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
      terserPlugin,
    ],
  },
];
