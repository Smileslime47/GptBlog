import { env } from 'cloudflare:workers';
import seed from './seed.json';
export function database() {
  if (!env.DB) throw new Error('数据库暂时不可用');
  return env.DB;
}
export async function ensureImported() {
  const db = database();
  if (await db.prepare("SELECT value FROM settings WHERE key = 'import-v1'").first()) return;
  // 数据导入可重试，已存在的文章不会被覆盖；标记完成后不再补回已删除文章。
  for (let offset = 0; offset < seed.length; offset += 20) {
    await db.batch(seed.slice(offset, offset + 20).map(post => db.prepare(
      'INSERT OR IGNORE INTO posts (id,title,category,tags,published_at,content,excerpt,frontmatter,status,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)'
    ).bind(post.id, post.title, post.category, JSON.stringify(post.tags), post.publishedAt, post.content, post.excerpt, JSON.stringify(post.frontmatter), 'published', '2026-10-08T00:00:00.000Z')));
  }
  await db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('import-v1',?)").bind(String(seed.length)).run();
}
export function summary(row: Record<string, unknown>) {
  const id = String(row.id);
  const segments = id.replace(/\.md$/i, '').split('/');
  const publishedAt = row.published_at ? String(row.published_at) : undefined;
  const tags = JSON.parse(String(row.tags));
  return { id, title: row.title, category: row.category, filePath: id, segments, categorySegments: String(row.category).split('/').filter(Boolean), url: '/posts/' + segments.map(encodeURIComponent).join('/'), tags, publishedAt, publishedAtTs: publishedAt ? Date.parse(publishedAt) : null, frontmatter: { ...JSON.parse(String(row.frontmatter)), tags }, excerpt: row.excerpt, status: row.status, version: row.version, updatedAt: row.updated_at };
}
export function detail(row: Record<string, unknown>) { return { ...summary(row), content: row.content, raw: row.content }; }
