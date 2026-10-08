import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { database, ensureImported, summary, detail } from '../../../db/posts';
import { syncStatus, initializePosts, pullPosts, withSyncLock, writePost, postAsset, SyncError } from '../../../db/github-posts';

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function admin() {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, '请先使用 ChatGPT 登录');
  const db = database();
  const owner = await db.prepare("SELECT value FROM settings WHERE key='admin-user-id'").first<{ value: string }>();
  if (owner) {
    if (owner.value !== user.userId) throw new HttpError(403, '只有博客管理员可以维护文章');
  } else {
    const email = (env as unknown as { ADMIN_EMAIL?: string }).ADMIN_EMAIL;
    if (!email || user.email.toLowerCase() !== email.toLowerCase()) throw new HttpError(403, '只有博客管理员可以维护文章');
    await db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('admin-user-id',?)").bind(user.userId).run();
    const bound = await db.prepare("SELECT value FROM settings WHERE key='admin-user-id'").first<{ value: string }>();
    if (bound?.value !== user.userId) throw new HttpError(403, '管理员身份不匹配');
  }
  return user;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, '请求来源无效');
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && !['same-origin', 'none'].includes(site)) throw new HttpError(403, '请求来源无效');
}
function positive(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new HttpError(400, '分页参数无效');
  return n;
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.slice(5);
    const isAdmin = path.startsWith('admin/');
    const actor = isAdmin ? await admin() : null;
    if (request.method !== 'GET') sameOrigin(request);
    if (path === 'post-asset' && request.method === 'GET') return await postAsset(url.searchParams.get('path') ?? '');
    await ensureImported();
    const db = database();
    if (path === 'admin/sync' && request.method === 'GET') return json(await syncStatus());
    if (path === 'admin/sync/initialize' && request.method === 'POST') return json(await initializePosts());
    if (path === 'admin/sync/pull' && request.method === 'POST') return json(await pullPosts());
    if (path === 'admin/session') {
      return json({ email: actor!.email, name: actor!.displayName });
    }
    if (path === 'stats') {
      const [counts, categories, tags] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS count FROM posts WHERE status='published'").first<{ count: number }>(),
        db.prepare("SELECT DISTINCT category FROM posts WHERE status='published'").all<{ category: string }>(),
        db.prepare("SELECT DISTINCT j.value AS tag FROM posts,json_each(posts.tags) j WHERE status='published'").all(),
      ]);
      const nodes = new Set<string>();
      for (const { category } of categories.results) { const parts = category.split('/'); for (let i=1; i<=parts.length; i++) if (category) nodes.add(parts.slice(0,i).join('/')); }
      return json({ totalPosts: counts?.count ?? 0, totalCategories: nodes.size, totalTags: tags.results.length, categories: categories.results.map(x=>x.category) });
    }
    if (path === 'tags' && request.method === 'GET') {
      const rows = await db.prepare("SELECT j.value AS name, COUNT(*) AS count FROM posts,json_each(posts.tags) j WHERE status='published' GROUP BY j.value ORDER BY count DESC,j.value ASC").all();
      return json(rows.results);
    }
    if ((path === 'posts' || path === 'admin/posts' || path === 'admin/bootstrap') && request.method === 'GET') {
      const pageSize = positive(url.searchParams.get('pageSize'), 10, 50);
      const requestedPage = positive(url.searchParams.get('page'), 1, 1000000);
      const clauses: string[] = isAdmin ? [] : ["status='published'"];
      const args: string[] = [];
      const q = (url.searchParams.get('q') ?? '').trim();
      if (q.length > 200) throw new HttpError(400, '搜索关键词过长');
      if (q) { clauses.push("(title LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\')"); const escaped = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'; args.push(escaped,escaped,escaped); }
      const category = url.searchParams.get('category');
      if (category) { clauses.push('category=?'); args.push(category); }
      const tag = url.searchParams.get('tag');
      if (tag) { clauses.push('EXISTS (SELECT 1 FROM json_each(posts.tags) WHERE value=?)'); args.push(tag); }
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      const count = await db.prepare('SELECT COUNT(*) AS total FROM posts' + where).bind(...args).first<{ total: number }>();
      const total = count?.total ?? 0;
      const totalPages = Math.max(1,Math.ceil(total/pageSize));
      const page = Math.min(requestedPage,totalPages);
      const rows = await db.prepare('SELECT id,title,category,tags,published_at,excerpt,frontmatter,status,version,updated_at FROM posts' + where + ' ORDER BY published_at DESC,id ASC LIMIT ? OFFSET ?').bind(...args,pageSize,(page-1)*pageSize).all();
      return json({ items: rows.results.map(summary), page, pageSize, total, totalPages, ...(path === 'admin/bootstrap' ? { session: { email: actor!.email, name: actor!.displayName } } : {}) });
    }
    if ((path === 'post' || path === 'admin/post') && request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id) throw new HttpError(400, '缺少文章标识');
      const row = await db.prepare('SELECT * FROM posts WHERE id=?' + (isAdmin ? '' : " AND status='published'")).bind(id).first();
      return row ? json(detail(row)) : json({ error: '文章不存在' },404);
    }
    if (path === 'admin/post' && ['POST','PUT'].includes(request.method)) {
      if (!request.headers.get('Content-Type')?.includes('application/json')) throw new HttpError(415, '请发送 JSON 数据');
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 1000000) throw new HttpError(413, '文章内容不能超过 1 MB');
      let body;
      try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'JSON 格式无效'); }
      const { id, title, category, tags, content, publishedAt, status, version } = body;
      if (typeof id !== 'string' || id.length > 1000 || !id.endsWith('.md') || id.startsWith('/') || id.split('/').some((x:string)=>!x || x==='.' || x==='..') || /[\x00-\x1f\\?#]/.test(id)) throw new HttpError(400, '文章路径无效');
      if (typeof title !== 'string' || !title.trim() || title.length>300 || typeof category !== 'string' || category.length>500 || typeof content !== 'string' || !content.trim() || !Array.isArray(tags) || tags.length>30 || tags.some((x:unknown)=>typeof x!=='string' || x.length>80)) throw new HttpError(400, '请检查标题、分类、标签和正文');
      if (!['draft','published'].includes(status)) throw new HttpError(400, '文章状态无效');
      if (publishedAt && (typeof publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || Number.isNaN(Date.parse(publishedAt)))) throw new HttpError(400, '发布日期无效');
      return await withSyncLock(async () => {
      const existing = await db.prepare('SELECT * FROM posts WHERE id=?').bind(id).first();
      if (request.method==='POST' && existing) throw new HttpError(409, '文章路径已存在');
      if (request.method==='PUT' && !existing) throw new HttpError(404, '文章不存在');
      if (request.method==='PUT' && (!Number.isSafeInteger(version) || version !== existing!.version)) throw new HttpError(409, '文章已在其他窗口修改，请重新加载后再保存');
      const normalizedTags = [...new Set<string>(tags.map((x:string)=>x.trim()).filter(Boolean))];
      const fm = { ...(existing ? JSON.parse(String(existing.frontmatter)) : {}), title: title.trim(), tags: normalizedTags, date: publishedAt || '' };
      const excerpt = content.replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/[#*>`]/g,'').replace(/\s+/g,' ').trim().slice(0,120);
      const values = [title.trim(), category.trim(), JSON.stringify(normalizedTags), publishedAt || null, content, excerpt, JSON.stringify(fm),status,new Date().toISOString()];
      let mutation: D1PreparedStatement;
      if (request.method === 'POST') {
        mutation = db.prepare('INSERT INTO posts (title,category,tags,published_at,content,excerpt,frontmatter,status,updated_at,id) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(...values,id);
      } else {
        mutation = db.prepare('UPDATE posts SET title=?,category=?,tags=?,published_at=?,content=?,excerpt=?,frontmatter=?,status=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(...values,id,version);
      }
      await writePost({ id, title:title.trim(), category:category.trim(), tags:JSON.stringify(normalizedTags), published_at:publishedAt || null, content, frontmatter:JSON.stringify(fm), status }, false, mutation);
      const saved = await db.prepare('SELECT * FROM posts WHERE id=?').bind(id).first();
      return json(detail(saved!), request.method==='POST' ? 201 : 200);
      });
    }
    if (path === 'admin/post' && request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      const version = positive(url.searchParams.get('version'),0,1000000000);
      if (!id || !version) throw new HttpError(400, '缺少文章标识或版本');
      return await withSyncLock(async () => {
        const row = await db.prepare('SELECT * FROM posts WHERE id=?').bind(id).first();
        if (!row || row.version !== version) throw new HttpError(409,'文章已变更，请刷新列表');
        await writePost(row, true, db.prepare('DELETE FROM posts WHERE id=? AND version=?').bind(id,version));
        return json({ deleted:true });
      });
    }
    return json({ error: '接口不存在' },404);
  } catch (error) {
    if (error instanceof HttpError || error instanceof SyncError) return json({ error: error.message },error.status);
    console.error('博客接口异常', error);
    return json({ error: '服务暂时不可用，请稍后重试' },503);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
