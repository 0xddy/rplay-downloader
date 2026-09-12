import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { transform } from 'esbuild';

const root = process.cwd();

async function collectJavaScript(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(path));
    else if (entry.isFile() && /\.m?js$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function parseJson(path) {
  try {
    return JSON.parse(await readFile(join(root, path), 'utf8'));
  } catch (error) {
    throw new Error(`${path} 不是有效 JSON：${error.message}`);
  }
}

function sameKeys(left, right) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

const javaScriptFiles = [
  'content.js',
  'popup.js',
  ...await collectJavaScript('src'),
  ...await collectJavaScript('test'),
  ...await collectJavaScript('scripts'),
];

await Promise.all(javaScriptFiles.map(async (path) => {
  const source = await readFile(join(root, path), 'utf8');
  try {
    await transform(source, { loader: 'js', target: 'chrome116' });
  } catch (error) {
    throw new Error(`${path} 语法检查失败：${error.message}`);
  }
}));

const manifest = await parseJson('manifest.json');
const localeEntries = await readdir(join(root, '_locales'), { withFileTypes: true });
const localeNames = localeEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const locales = new Map();
for (const locale of localeNames) {
  locales.set(locale, await parseJson(join('_locales', locale, 'messages.json')));
}

const defaultMessages = locales.get(manifest.default_locale);
if (!defaultMessages) throw new Error(`缺少默认语言目录：${manifest.default_locale}`);
const defaultKeys = Object.keys(defaultMessages).sort();
for (const [locale, messages] of locales) {
  const keys = Object.keys(messages).sort();
  if (!sameKeys(defaultKeys, keys)) {
    const missing = defaultKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !defaultKeys.includes(key));
    throw new Error(`${locale} 国际化键不一致；缺少 [${missing}]，多出 [${extra}]`);
  }
}

const i18nSources = await Promise.all(['content.js', 'popup.js', 'src/options.js'].map((path) => readFile(join(root, path), 'utf8')));
const referencedKeys = new Set();
for (const source of i18nSources) {
  for (const match of source.matchAll(/(?:message|chrome\.i18n\.getMessage)\(\s*['"]([^'"]+)['"]/g)) {
    referencedKeys.add(match[1]);
  }
}
for (const match of JSON.stringify(manifest).matchAll(/__MSG_([^_]+)__/g)) referencedKeys.add(match[1]);
const missingKeys = [...referencedKeys].filter((key) => !defaultMessages[key]).sort();
if (missingKeys.length > 0) throw new Error(`代码引用了未定义的国际化键：[${missingKeys}]`);

for (const path of ['popup.html', 'offscreen.html', 'options.html']) {
  const html = await readFile(join(root, path), 'utf8');
  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    if (/^(?:https?:)?\/\//i.test(match[1])) throw new Error(`${path} 不允许加载远程脚本：${match[1]}`);
  }
}
const manifestScripts = [
  manifest.background?.service_worker,
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
].filter(Boolean);
for (const path of manifestScripts) {
  if (/^(?:https?:)?\/\//i.test(path)) throw new Error(`manifest.json 不允许加载远程脚本：${path}`);
}

for (const path of ['popup.html', 'offscreen.html', 'content.js', 'popup.js']) {
  await access(join(root, path));
}

console.log(`Static checks passed: ${javaScriptFiles.length} JavaScript files, ${localeNames.length} locales.`);
