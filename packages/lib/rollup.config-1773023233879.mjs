import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import dtsPlugin from 'rollup-plugin-dts';

const typescript = typescriptPlugin({
    tsconfig: './tsconfig.json',
    outputToFilesystem: false,
    include: ['src/**/*.ts'],
    exclude: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    noEmit: false,
    declaration: false,
    declarationMap: false,
    incremental: false,
    allowJs: false,
    checkJs: false,
});
const buildLibrary = {
    input: 'src/index.ts',
    external: ['zod', 'tslib'],
    output: [{ dir: 'dist', extend: true, format: 'esm' }],
    plugins: [commonjsPlugin(), jsonPlugin(), nodeResolve(), typescript],
};
const buildTypes = {
    input: 'src/index.ts',
    output: [{ file: 'dist/index.d.ts', format: 'esm' }],
    plugins: [dtsPlugin()],
};
var rollup_config = [buildLibrary, buildTypes];

export { rollup_config as default };
