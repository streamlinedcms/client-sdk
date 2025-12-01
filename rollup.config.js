import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import postcss from 'rollup-plugin-postcss';

// PostCSS plugin config - processes Tailwind CSS and injects as string
const postcssPlugin = postcss({
  inject: false,  // Don't inject into DOM, we handle it manually
  minimize: true, // Minify the output
});

export default [
  // Sync loader - tiny script that injects styles, fetches content, then loads ESM
  {
    input: 'src/loader.ts',
    output: {
      file: 'dist/streamlined-cms.js',
      format: 'iife',
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
      }),
    ],
  },
  // ESM bundle - lazy features (auth, editing)
  {
    input: 'src/lazy/index.ts',
    output: {
      file: 'dist/streamlined-cms.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve(),
      postcssPlugin,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
      }),
    ],
  },
];
