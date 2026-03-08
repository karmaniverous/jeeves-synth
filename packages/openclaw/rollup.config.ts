import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

const pluginConfig: RollupOptions = {
  input: 'src/index.ts',
  output: { dir: 'dist', format: 'esm' },
  plugins: [
    typescriptPlugin({
      tsconfig: './tsconfig.json',
      outputToFilesystem: false,
      noEmit: false,
      declaration: true,
      declarationDir: 'dist',
      declarationMap: false,
      incremental: false,
    }),
  ],
};

export default [pluginConfig];
