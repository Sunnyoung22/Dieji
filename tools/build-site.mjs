/* Build the static deployment bundle used by GitHub Pages and Cloudflare Pages.
   Run with: node tools/build-site.mjs
*/
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const out = path.join(root, 'dist');

async function requireFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    const info = await stat(fullPath);
    if (!info.isFile()) throw new Error('not a file');
  } catch (error) {
    throw new Error(`缺少部署文件：${relativePath}`);
  }
}

async function main() {
  const required = [
    'index.html',
    'manifest.webmanifest',
    'sw.js',
    '_headers',
    'assets/styles.css',
    'assets/data.js',
    'assets/charts.js',
    'assets/app.js',
    'assets/favicon.svg',
    'assets/icon-192.png',
    'assets/icon-512.png',
    'assets/icon-maskable-512.png',
    'assets/apple-touch-icon.png',
    'screenshots/final-desktop-overview.png',
    'screenshots/final-mobile-overview.png'
  ];
  for (const file of required) await requireFile(file);

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  for (const file of ['index.html', 'manifest.webmanifest', 'sw.js', '_headers']) {
    await cp(path.join(root, file), path.join(out, file));
  }
  await cp(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
  await mkdir(path.join(out, 'screenshots'), { recursive: true });
  await cp(
    path.join(root, 'screenshots/final-desktop-overview.png'),
    path.join(out, 'screenshots/final-desktop-overview.png')
  );
  await cp(
    path.join(root, 'screenshots/final-mobile-overview.png'),
    path.join(out, 'screenshots/final-mobile-overview.png')
  );
  await writeFile(path.join(out, '.nojekyll'), '', 'utf8');

  console.log(`Static site built at ${out}`);
  console.log('Includes index.html, manifest, service worker, security headers, assets and PWA preview images.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
