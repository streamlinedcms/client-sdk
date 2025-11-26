import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/streamlined-cms.js',
      format: 'umd',
      name: 'StreamlinedCMS',
      sourcemap: true,
    },
    {
      file: 'dist/streamlined-cms.esm.js',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist',
    }),
  ],
};
