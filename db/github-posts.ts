import { env } from 'cloudflare:workers';
import { database } from './posts';
import { encodePost, decodePost } from './post-format';

const repository = 'Smileslime47/GptBlog';
const branch = 'posts';
const baselineKey = 'github-posts-baseline';
export class SyncError extends Error { constructor(public status: number, message: string) { super(message); } }
type TreeEntry = { path: string; sha: string; type: string; mode: string };
type Snapshot = { head: string; treeSha: string; entries: TreeEntry[] };
function token() { return (env as unknown as { GITHUB_POSTS_TOKEN?: string }).GITHUB_POSTS_TOKEN; }
async function github<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!token()) throw new SyncError(503, '文章同步尚未启用：请在站点设置中配置 GITHUB_POSTS_TOKEN');
  let response: Response;
  try { response = await fetch('https://api.github.com/repos/' + repository + path, { method, headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'User-Agent': '47Saikyo', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) }); }
  catch { throw new SyncError(503, 'GitHub 请求未确认完成，请先从仓库同步再重试，正文仍保留在编辑器中'); }
  if (!response.ok) throw new SyncError(response.status === 409 || response.status === 422 ? 409 : 503, response.status === 409 || response.status === 422 ? '仓库已变更，请先从仓库同步后重试' : 'GitHub 同步失败，请检查凭据、权限或稍后重试');
  return await response.json() as T;
}
async function snapshot(): Promise<Snapshot> {
  const ref = await github<{ object: { sha: string } }>('/git/ref/heads/' + branch);
  const commit = await github<{ tree: { sha: string } }>('/git/commits/' + ref.object.sha);
  const tree = await github<{ tree: TreeEntry[]; truncated: boolean }>('/git/trees/' + commit.tree.sha + '?recursive=1');
  if (tree.truncated || tree.tree.length > 5000) throw new SyncError(503, '文章仓库过大，无法安全同步');
  return { head: ref.object.sha, treeSha: commit.tree.sha, entries: tree.tree };
}
async function baseline(): Promise<Record<string, string> | null> {
  const row = await database().prepare('SELECT value FROM settings WHERE key=?').bind(baselineKey).first<{ value: string }>();
  return row ? JSON.parse(row.value) : null;
}
function marker(map: Record<string, string>) { return database().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(baselineKey, JSON.stringify(map)); }
export async function syncStatus() { return { configured: !!token(), initialized: !!await baseline(), repository, branch }; }
export async function postAsset(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif' };
  if (!extension || !types[extension] || path.startsWith('/') || path.length > 1000 || path.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f\\?#]/.test(path)) throw new SyncError(400, '图片路径无效');
  if (!token()) throw new SyncError(503, '图片仓库尚未配置');
  const response = await fetch('https://api.github.com/repos/' + repository + '/contents/posts/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + branch, { headers: { Authorization:'Bearer ' + token(), Accept:'application/vnd.github.raw+json', 'User-Agent':'47Saikyo' }, signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new SyncError(response.status === 404 ? 404 : 503, '图片暂时不可用');
  // 限量流式转发，兼容已归档的大图，不在 Worker 中缓冲整个文件。
  const limit = 20 * 1024 * 1024;
  if (Number(response.headers.get('Content-Length')) > limit) { await response.body?.cancel(); throw new SyncError(413, '图片不能超过 20 MB'); }
  if (!response.body) throw new SyncError(503, '图片暂时不可用');
  let size = 0;
  const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { size += chunk.byteLength; if (size > limit) { controller.error(new Error('图片超过 20 MB')); return; } controller.enqueue(chunk); },
  }));
  return new Response(stream, { headers: { 'Content-Type':types[extension], 'Cache-Control':'public, max-age=60', 'X-Content-Type-Options':'nosniff' } });
}
export async function withSyncLock<T>(action: () => Promise<T>): Promise<T> {
  const db = database(), value = JSON.stringify({ owner: crypto.randomUUID(), expires: Date.now() + 300000 });
  const acquired = await db.prepare("INSERT INTO settings (key,value) VALUES ('github-posts-lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(settings.value,'$.expires') < ?").bind(value, Date.now()).run();
  if (!acquired.meta.changes) throw new SyncError(409, '另一项文章同步正在进行，请稍后重试');
  try { return await action(); } finally { await db.prepare("DELETE FROM settings WHERE key='github-posts-lock' AND value=?").bind(value).run(); }
}
async function commitChanges(state: Snapshot, entries: unknown[], message: string) {
  const tree = await github<{ sha: string }>('/git/trees', 'POST', { base_tree: state.treeSha, tree: entries });
  const commit = await github<{ sha: string }>('/git/commits', 'POST', { message, tree: tree.sha, parents: [state.head] });
  // 不强推：并发提交发生时，GitHub 会拒绝非快进更新。
  await github('/git/refs/heads/' + branch, 'PATCH', { sha: commit.sha, force: false });
  return commit.sha;
}
async function blob(content: string) { return (await github<{ sha: string }>('/git/blobs', 'POST', { content, encoding: 'utf-8' })).sha; }
export async function writePost(row: Record<string, unknown>, remove: boolean, apply: D1PreparedStatement) {
  const map = await baseline();
  if (!map) throw new SyncError(503, '请先从仓库同步恢复文章索引');
  const state = await snapshot(), id = String(row.id);
  const current = state.entries.find(x => x.path === 'posts/' + id)?.sha;
  if (current !== map[id]) throw new SyncError(409, '这篇文章已在 GitHub 修改，请先从仓库同步再编辑');
  const sha = remove ? null : await blob(encodePost(row));
  const head = await commitChanges(state, [{ path: 'posts/' + id, mode: '100644', type: 'blob', sha }], (remove ? 'chore: 删除文章 ' : 'feat: 保存文章 ') + String(row.title));
  if (sha) map[id] = sha; else delete map[id];
  // GitHub 提交成功后才更新读者缓存；数据库失败时可以从仓库恢复。
  await database().batch([apply, marker(map)]);
  return head;
}
export async function pullPosts() {
  return withSyncLock(async () => {
    const state = await snapshot(), map = await baseline() ?? {};
    const remote = state.entries.filter(x => x.type === 'blob' && x.path.startsWith('posts/') && x.path.endsWith('.md'));
    if (!remote.length && !await baseline()) throw new SyncError(409, '仓库尚无文章，不能从空仓库恢复');
    const changed = remote.filter(x => map[x.path.slice(6)] !== x.sha), selected = changed.slice(0, 10);
    const statements: D1PreparedStatement[] = [];
    for (const entry of selected) {
      const raw = await github<{ content: string; encoding: string }>('/git/blobs/' + entry.sha);
      if (raw.encoding !== 'base64') throw new SyncError(503, '仓库文章编码无效');
      const bytes = Uint8Array.from(atob(raw.content.replace(/\s/g, '')), c => c.charCodeAt(0));
      const post = decodePost(entry.path.slice(6), new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      statements.push(database().prepare('INSERT INTO posts (id,title,category,tags,published_at,content,excerpt,frontmatter,status,version) VALUES (?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,tags=excluded.tags,published_at=excluded.published_at,content=excluded.content,excerpt=excluded.excerpt,frontmatter=excluded.frontmatter,status=excluded.status,version=posts.version+1').bind(post.id, post.title, post.category, post.tags, post.publishedAt, post.content, post.excerpt, post.frontmatter, post.status));
      map[post.id] = entry.sha;
    }
    const remaining = changed.length - selected.length;
    if (!remaining) {
      const ids = new Set(remote.map(x => x.path.slice(6)));
      const local = await database().prepare('SELECT id FROM posts').all<{ id: string }>();
      for (const { id } of local.results) if (!ids.has(id)) { statements.push(database().prepare('DELETE FROM posts WHERE id=?').bind(id)); delete map[id]; }
    }
    const ref = await github<{ object: { sha: string } }>('/git/ref/heads/' + branch);
    if (ref.object.sha !== state.head) throw new SyncError(409, '仓库在读取期间发生变化，请重新同步');
    await database().batch([...statements, marker(map)]);
    return { count: selected.length, remaining, commit: state.head };
  });
}
