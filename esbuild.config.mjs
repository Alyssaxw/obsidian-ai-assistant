import esbuild from 'esbuild';

const isProduction = process.argv.includes('production');

esbuild.build({
  entryPoints: ['main.ts'],
  bundle: true,
  external: ['obsidian'],
  platform: 'browser',
  target: 'es2020',
  format: 'cjs',
  outfile: 'main.js',
  sourcemap: !isProduction,
  minify: isProduction,
}).catch(() => process.exit(1));