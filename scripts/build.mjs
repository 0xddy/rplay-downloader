import { build, transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

await build({
  entryPoints: {
    background: 'src/background.js',
    offscreen: 'src/offscreen.js',
    popup: 'popup.js',
    content: 'content.js',
    options: 'src/options.js',
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
  plugins: [{
    name: 'compact-xml-parser-comments',
    setup(builder) {
      // Keep generated bundles free of whitespace errors in upstream JSDoc,
      // while retaining license comments and readable application code.
      builder.onLoad({ filter: /[\\/]fast-xml-parser[\\/].*\.js$/ }, async ({ path }) => {
        const { code } = await transform(await readFile(path, 'utf8'), {
          loader: 'js', minifyWhitespace: true, legalComments: 'inline',
        });
        return { contents: code, loader: 'js', resolveDir: dirname(path) };
      });
    },
  }],
});

const offscreenBundle = await readFile('dist/offscreen.js', 'utf8');
for (const forbidden of ['new VideoEncoder(', 'new AudioEncoder(', 'new VideoDecoder(', 'new AudioDecoder(']) {
  if (offscreenBundle.includes(forbidden)) {
    throw new Error(`无转码构建校验失败：发现 ${forbidden}`);
  }
}
