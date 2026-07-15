import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

await build({
  entryPoints: {
    background: 'src/background.js',
    offscreen: 'src/offscreen.js',
    popup: 'popup.js',
    content: 'content.js',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome116',
  sourcemap: false,
  minify: false,
  legalComments: 'eof',
  logLevel: 'info',
});

const offscreenBundle = await readFile('dist/offscreen.js', 'utf8');
for (const forbidden of ['new VideoEncoder(', 'new AudioEncoder(', 'new VideoDecoder(', 'new AudioDecoder(']) {
  if (offscreenBundle.includes(forbidden)) {
    throw new Error(`无转码构建校验失败：发现 ${forbidden}`);
  }
}
