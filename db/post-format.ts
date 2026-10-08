import { parse, stringify } from 'yaml';

export function encodePost(row: Record<string, unknown>) {
  const metadata = { ...JSON.parse(String(row.frontmatter)), title: row.title, category: row.category, tags: JSON.parse(String(row.tags)), date: row.published_at || '', status: row.status };
  return '---\n' + stringify(metadata) + '---\n' + String(row.content);
}

export function decodePost(id: string, raw: string) {
  if (raw.length > 1000000 || !id.endsWith('.md') || id.startsWith('/') || id.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f\\?#]/.test(id)) throw new Error('仓库文章路径或大小无效');
  const match = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('文章缺少 frontmatter：' + id);
  const fm = parse(match[1], { maxAliasCount: 20 });
  if (!fm || typeof fm !== 'object' || typeof fm.title !== 'string' || !fm.title.trim() || fm.title.length > 300 || !match[2].trim()) throw new Error('文章标题或正文无效：' + id);
  const tags = fm.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 30 || tags.some(x => typeof x !== 'string' || x.length > 80)) throw new Error('文章标签无效：' + id);
  const status = fm.status ?? 'published';
  if (!['draft', 'published'].includes(status)) throw new Error('文章状态无效：' + id);
  const category = fm.category ?? id.split('/').slice(0, -1).join('/');
  if (typeof category !== 'string' || category.length > 500) throw new Error('文章分类无效：' + id);
  const date = fm.date || fm.publishedAt || fm.publishDate || fm.createdAt || '';
  const publishedAt = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).replace(/\//g, '-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/, (_, year, month, day) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).slice(0, 10);
  if (publishedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || Number.isNaN(Date.parse(publishedAt)))) throw new Error('文章日期无效：' + id);
  const content = match[2];
  const excerpt = content.replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[#*>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { id, title: fm.title.trim(), category, tags: JSON.stringify(tags), publishedAt: publishedAt || null, content, excerpt, frontmatter: JSON.stringify(fm), status };
}
