<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { api, type PostPage, type PostEntry, type PostSummary } from '@/service/posts'

type ManagedPost = PostEntry & { category: string; status: 'draft' | 'published'; version: number }
const MarkdownContent = defineAsyncComponent(() => import('@/component/common/MarkdownContent.vue'))
const session = ref<{ name: string; email: string } | null>(null)
const rows = ref<(PostSummary & { status: string; version: number })[]>([])
const page = ref(1), pages = ref(1), total = ref(0)
const query = ref(''), error = ref(''), notice = ref('')
const pending = ref(false), authenticating = ref(true), editing = ref(false), preview = ref(false)
const originalId = ref(''), snapshot = ref(''), confirmDelete = ref('')
const sync = ref<{configured:boolean; initialized:boolean} | null>(null)
async function loadSync() { sync.value = await api('admin/sync') }
async function synchronize(initialize = false) {
  if (pending.value || !discard()) return
  if (!initialize && !window.confirm('将以 GitHub posts 分支为准更新文章和删除缓存中已移除的文章，确定继续吗？')) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const result = await api<{count:number; remaining:number}>('admin/sync/' + (initialize ? 'initialize':'pull'), {method:'POST'})
    editing.value = false
    notice.value = result.remaining ? `已同步 ${result.count} 篇，还有 ${result.remaining} 篇，请继续点击从仓库同步。` : '文章已与 GitHub posts 分支同步。'
    await loadSync(); await load()
  } catch(e) { error.value = (e as Error).message }
  finally { pending.value = false }
}
const form = reactive({ id: '', title: '', category: '', tagsText: '', content: '', publishedAt: new Date().toISOString().slice(0,10), status: 'draft' as 'draft'|'published', version: 1 })
const dirty = computed(() => editing.value && snapshot.value !== JSON.stringify(form))
const canSave = computed(() => !!form.title.trim() && !!form.content.trim() && !!form.id.trim())
function discard() { return !dirty.value || window.confirm('有尚未保存的修改，确定离开吗？') }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(() => discard())
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  try {
    const result = await api<PostPage & { session: { name: string; email: string } }>('admin/bootstrap')
    session.value = result.session; rows.value = result.items as typeof rows.value
    page.value = result.page; pages.value = result.totalPages; total.value = result.total
    await loadSync()
  } catch(e) { error.value = (e as Error).message }
  finally { authenticating.value = false }
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
async function load() {
  pending.value = true; error.value = ''
  try { const result = await api<PostPage>('admin/posts?' + new URLSearchParams({ page:String(page.value), q:query.value })); rows.value = result.items as typeof rows.value; page.value = result.page; pages.value = result.totalPages; total.value = result.total }
  catch(e) { error.value = (e as Error).message }
  finally { pending.value = false }
}
function create() {
  if (!discard()) return
  Object.assign(form, { id:'', title:'', category:'', tagsText:'', content:'', publishedAt:new Date().toISOString().slice(0,10), status:'draft', version:1 })
  originalId.value = ''; editing.value = true; preview.value = false; snapshot.value = JSON.stringify(form); notice.value = ''; error.value = ''
}
async function edit(id: string) {
  if (!discard()) return
  pending.value = true; error.value = ''
  try { const post = await api<ManagedPost>('admin/post?id=' + encodeURIComponent(id)); Object.assign(form, { id:post.id,title:post.title,category:post.category,tagsText:post.tags.join(', '),content:post.content,publishedAt:post.publishedAt?.slice(0,10) || '',status:post.status,version:post.version }); originalId.value = id; editing.value = true; preview.value = false; snapshot.value = JSON.stringify(form) }
  catch(e) { error.value = (e as Error).message }
  finally { pending.value = false }
}
function suggestPath() {
  if (originalId.value || form.id || !form.title.trim()) return
  const title = form.title.trim().replace(/[\\/?#]/g,'-')
  form.id = [form.category.trim().replace(/^\/+|\/+$/g,''),title+'.md'].filter(Boolean).join('/')
}
async function save(status: 'draft'|'published') {
  suggestPath(); if (!canSave.value || pending.value) return
  pending.value = true; error.value = ''; notice.value = ''
  try {
    const saved = await api<ManagedPost>('admin/post', { method:originalId.value ? 'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ ...form,status,tags:form.tagsText.split(/[,，]/).map(x=>x.trim()).filter(Boolean) }) })
    form.version = saved.version; form.status = saved.status; originalId.value = saved.id; snapshot.value = JSON.stringify(form); notice.value = status==='published' ? '已提交至 GitHub 并发布，读者页面已更新。':'草稿已提交至 GitHub。'; await load()
  } catch(e) { error.value = (e as Error).message }
  finally { pending.value = false }
}
async function remove(id: string, version: number) {
  pending.value = true; error.value = ''
  try { await api('admin/post?' + new URLSearchParams({id,version:String(version)}), {method:'DELETE'}); confirmDelete.value = ''; if (originalId.value===id) { editing.value=false; originalId.value='' } notice.value='文章已删除。'; await load() }
  catch(e) { error.value = (e as Error).message }
  finally { pending.value=false }
}
async function importMarkdown(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return
  if (file.size>1000000) { error.value='文件不能超过 1 MB'; return }
  if (!discard()) return
  const { parseFrontmatter } = await import('@/service/posts/frontmatter-parser')
  const result = parseFrontmatter((await file.text()).replace(/^\uFEFF/,''))
  create(); form.title = typeof result.frontmatter.title==='string' ? result.frontmatter.title:file.name.replace(/\.md$/i,''); form.content=result.content
  const tags=result.frontmatter.tags; form.tagsText=Array.isArray(tags)?tags.join(', '):typeof tags==='string'?tags:''
  for (const key of ['date','publishedAt','publishDate','createdAt']) if (typeof result.frontmatter[key]==='string') { form.publishedAt=String(result.frontmatter[key]).slice(0,10); break }
  form.id=file.name; snapshot.value=''; (event.target as HTMLInputElement).value=''
}
</script>

<template>
  <ContentPageLayout>
    <template #hero><p class="eyebrow">47Saikyo</p><h1>文章管理</h1><p v-if="session" class="subtitle">{{ session.email }} · 共 {{ total }} 篇文章</p></template>
    <template #default>
      <p v-if="authenticating">正在验证身份...</p>
      <div v-else-if="!session" class="login"><p>{{ error }}</p><a href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">使用 ChatGPT 登录</a></div>
      <template v-else>
        <div class="message"><p v-if="!sync?.configured">文章同步尚未启用：请在站点设置配置 GITHUB_POSTS_TOKEN（GptBlog 仓库 Contents 读写权限），再迁移当前文章。现有文章仍可阅读。</p><p v-else>{{ sync.initialized ? '文章由 GitHub posts 分支管理；保存会先提交到仓库。' : '首次使用请迁移当前文章；已有文章仓库可恢复索引。' }}</p><div class="editor-actions"><button v-if="!sync?.initialized" :disabled="pending || !sync?.configured" @click="synchronize(true)">迁移当前文章到仓库</button><button :disabled="pending || !sync?.configured" @click="synchronize()">从仓库同步</button><a href="https://github.com/Smileslime47/GptBlog/tree/posts" target="_blank" rel="noopener noreferrer">查看文章仓库</a></div></div>
        <div class="toolbar"><button :disabled="pending" @click="create">新建文章</button><label class="import">导入 Markdown<input type="file" accept=".md,.markdown" @change="importMarkdown"></label><form @submit.prevent="page=1; load()"><input v-model="query" placeholder="搜索文章" aria-label="搜索文章"><button :disabled="pending">搜索</button></form></div>
        <p v-if="error" class="message error" role="alert">{{ error }}</p><p v-if="notice" class="message" role="status">{{ notice }}</p>
        <div v-if="editing" class="editor">
          <div class="editor-head"><h2>{{ originalId ? '编辑文章':'新建文章' }} <small>{{ dirty ? '未保存':'已保存' }}</small></h2><button :disabled="pending" @click="discard() && (editing=false)">收起</button></div>
          <div class="fields"><label>标题<input v-model="form.title" maxlength="300" @blur="suggestPath"></label><label>分类<input v-model="form.category" placeholder="例如 Java/Spring"></label><label>文章路径<input v-model="form.id" :disabled="!!originalId" placeholder="例如 Java/Spring/hello.md" @focus="suggestPath"></label><label>发布日期<input v-model="form.publishedAt" type="date"></label><label class="wide">标签<input v-model="form.tagsText" placeholder="用逗号分隔，例如 Kotlin, JVM"></label></div>
          <div class="editor-actions"><button :class="{selected:!preview}" @click="preview=false">Markdown</button><button :class="{selected:preview}" @click="preview=true">预览</button><span>当前状态：{{ form.status==='published'?'已发布':'草稿' }}</span></div>
          <MarkdownContent v-if="preview" :content="form.content" :post-id="form.id" :enable-math="true" class="preview"/>
          <textarea v-else v-model="form.content" aria-label="Markdown 正文" placeholder="从这里开始写作..." spellcheck="false"></textarea>
          <div class="editor-actions"><button :disabled="pending || !canSave" @click="save('draft')">保存草稿</button><button class="primary" :disabled="pending || !canSave" @click="save('published')">{{ pending?'正在保存...':'发布文章' }}</button></div>
        </div>
        <div class="article-list" :aria-busy="pending"><article v-for="post in rows" :key="post.id"><div><router-link :to="post.url">{{ post.title }}</router-link><p>{{ post.publishedAt || '未标注日期' }} · {{ post.categorySegments.join(' / ') || '未分类' }} · {{ post.status==='published'?'已发布':'草稿' }}</p></div><div class="row-actions"><button :disabled="pending" @click="edit(post.id)">编辑</button><button :disabled="pending" @click="confirmDelete=post.id">删除</button></div><div v-if="confirmDelete===post.id" class="delete-confirm"><p>确定删除这篇文章？删除后无法恢复。</p><button :disabled="pending" @click="remove(post.id,post.version)">确认删除</button><button @click="confirmDelete=''">取消</button></div></article></div>
        <p v-if="!rows.length && !pending">没有找到文章。</p><div class="pagination"><button :disabled="pending || page===1" @click="page--; load()">上一页</button><span>第 {{ page }} / {{ pages }} 页</span><button :disabled="pending || page===pages" @click="page++; load()">下一页</button></div>
      </template>
    </template>
  </ContentPageLayout>
</template>

<style scoped lang="less">
h1,h2,a{color:var(--surface-title)} h1{font-size:1.6rem} h2{font-size:1.2rem} .eyebrow,.subtitle,small{color:var(--surface-muted)} small{font-size:.875rem;font-weight:400} .toolbar,.editor-head,.editor-actions,.row-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.toolbar{margin-bottom:20px}.toolbar form{display:flex;gap:8px;margin-left:auto}.import{cursor:pointer;border:1px solid var(--tag-border);border-radius:999px;padding:5px 14px}.import input{display:none}.editor{border:1px solid var(--surface-border);border-radius:18px;padding:20px;margin-bottom:20px;background:var(--surface-bg)}.editor-head{justify-content:space-between;margin-bottom:16px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:flex;flex-direction:column;gap:4px;color:var(--surface-text);font-size:.9rem}.wide{grid-column:1/-1}.editor-actions{margin:14px 0}.editor-actions span{margin-left:auto;color:var(--surface-muted);font-size:.875rem}textarea{width:100%;min-height:420px;resize:vertical;line-height:1.7;font-family:var(--font-family-code);font-size:1rem}.preview{padding:20px;min-height:300px}.primary,.selected{background:var(--md-link);color:var(--theme-bg)}.message{padding:10px 14px;border:1px solid var(--surface-border);border-radius:12px;margin-bottom:14px;color:var(--surface-title)}.error{color:#f996a5}.article-list article{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid var(--surface-border)}.article-list article>div:first-child{flex:1;min-width:0}.article-list a{font-weight:600;overflow-wrap:anywhere;text-decoration:none}.article-list p{font-size:.875rem;color:var(--surface-muted)}.delete-confirm{width:100%;padding:14px;background:var(--tag-bg);border-radius:12px}.delete-confirm button{margin-right:8px}.login a{display:inline-block;margin-top:12px}.row-actions{flex-shrink:0}@media(max-width:640px){.fields{grid-template-columns:1fr}.wide{grid-column:auto}.toolbar form{width:100%;margin-left:0}.toolbar form input{min-width:0;flex:1}.editor{padding:14px}.editor-actions span{width:100%;margin-left:0}}
</style>
