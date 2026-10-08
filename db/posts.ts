import { env } from 'cloudflare:workers';
export function database() {
  if (!env.DB) throw new Error('数据库暂时不可用');
  return env.DB;
}
export function summary(row: Record<string, unknown>) {
  const id = String(row.id);
  const segments = id.replace(/\.md$/i, '').split('/');
  const publishedAt = row.published_at ? String(row.published_at) : undefined;
  const tags = JSON.parse(String(row.tags));
  return { id, title: row.title, category: row.category, filePath: id, segments, categorySegments: String(row.category).split('/').filter(Boolean), url: '/posts/' + segments.map(encodeURIComponent).join('/'), tags, publishedAt, publishedAtTs: publishedAt ? Date.parse(publishedAt) : null, frontmatter: { ...JSON.parse(String(row.frontmatter)), title: row.title, category: row.category, tags, date: publishedAt || '', status: row.status }, excerpt: row.excerpt, status: row.status, version: row.version };
}
export function detail(row: Record<string, unknown>) { return { ...summary(row), content: row.content }; }
