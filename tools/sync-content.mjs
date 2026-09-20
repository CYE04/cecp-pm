import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const weeklyDir = join(root, 'weekly');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const latest = await readJson(join(weeklyDir, 'latest.json'));
const files = (await readdir(weeklyDir)).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
const weeks = Object.fromEntries(await Promise.all(files.map(async file => [file.slice(0, -5), await readJson(join(weeklyDir, file))])));
if (!weeks[latest.date]) throw new Error('latest.json 指向的日期没有对应内容文件');
for (const [date, content] of Object.entries(weeks)) {
  if (content.date !== date) throw new Error(`${date}.json 的日期不一致`);
}
const encode = value => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
await writeFile(join(root, 'content.js'), 'window.PMWeeklyData = ' + encode({ latest, weeks }) + ';\n');
const preview = await readJson(join(root, 'examples/full.json'));
await writeFile(join(root, 'preview-data.js'), 'window.PMPreviewData = ' + encode(preview) + ';\n');
let songCount = 0;
try {
  const songDir = join(root, '..', 'songs');
  const songFiles = (await readdir(songDir)).filter(file => file.endsWith('.json'));
  const songs = await Promise.all(songFiles.map(file => readJson(join(songDir, file))));
  const catalog = songs.filter(song => song.id && song.title).map(song => ({ id: song.id, title: song.title }));
  await writeFile(join(root, 'song-catalog.js'), 'window.PMSongCatalog = ' + encode(catalog) + ';\n');
  songCount = catalog.length;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // 独立仓库中没有相邻的 songs 文件夹时，沿用已生成的曲库目录。
}
console.log(`已同步 ${files.length} 周内容和功能预览${songCount ? `、${songCount} 首曲库目录` : ''}`);
