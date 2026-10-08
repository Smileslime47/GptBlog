import { env } from 'cloudflare:workers';
export function database() {
  if (!env.DB) throw new Error('数据库暂时不可用');
  return env.DB;
}
export async function compactLegacyCache() {
  const db = database();
  if (!await db.prepare("SELECT value FROM settings WHERE key = 'import-v1'").first()) return;
  // 一次性压缩旧缓存，保留正文、版本和额外属性；事务成功后移除旧导入标记。
  await db.batch([
    db.prepare("UPDATE posts SET frontmatter=json_remove(frontmatter,'$.title','$.category','$.tags','$.date','$.status','$.publishedAt','$.publishDate','$.createdAt')"),
    db.prepare("DELETE FROM settings WHERE key='import-v1'"),
  ]);
}
export function summary(row: Record<string, unknown>) {
  const id = String(row.id);
  const segments = id.replace(/\.md$/i, '').split('/');
  const publishedAt = row.published_at ? String(row.published_at) : undefined;
  const tags = JSON.parse(String(row.tags));
  return { id, title: row.title, category: row.category, filePath: id, segments, categorySegments: String(row.category).split('/').filter(Boolean), url: '/posts/' + segments.map(encodeURIComponent).join('/'), tags, publishedAt, publishedAtTs: publishedAt ? Date.parse(publishedAt) : null, frontmatter: { ...JSON.parse(String(row.frontmatter)), title: row.title, category: row.category, tags, date: publishedAt || '', status: row.status }, excerpt: row.excerpt, status: row.status, version: row.version };
}
export function detail(row: Record<string, unknown>) { return { ...summary(row), content: row.content }; }
