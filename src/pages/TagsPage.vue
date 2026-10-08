<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { postsService, api } from '@/service/posts'
import type { PostMeta } from '@/service/posts'
import { normalizeTags } from '@/service/posts/meta-utils'

type TagGroup = {
  name: string
  posts: PostMeta[]
}

const loading = ref(true)
const groups = ref<TagGroup[]>([])
const tags = ref<{name:string;count:number}[]>([])
const selected = ref(''), page = ref(1), pages = ref(1), total = ref(0), error = ref('')
let requestVersion = 0
async function load() {
  const version = ++requestVersion
  loading.value = true; error.value = ''
  try { const result = await postsService.page(page.value,{tag:selected.value}); if(version!==requestVersion) return; groups.value=[{name:selected.value,posts:result.items as PostMeta[]}]; page.value=result.page; pages.value=result.totalPages; total.value=result.total }
  catch(e) { if(version===requestVersion) error.value=(e as Error).message }
  finally { if(version===requestVersion) loading.value=false }
}
onMounted(async () => { try { tags.value=await api('tags'); if(tags.value.length) selected.value=tags.value[0]!.name; else loading.value=false } catch(e) { error.value=(e as Error).message; loading.value=false } })
watch(selected, () => { page.value=1; void load() })
const totalGroups = computed(() => tags.value.length)

</script>

<template>
  <ContentPageLayout>
    <template #hero>
      <p class="eyebrow">标签</p>
      <h1>标签播放列表</h1>
      <p class="subtitle">每个标签像一个主题播放列表。</p>
      <div class="meta">
        <span>标签组数 {{ totalGroups }}</span>
      </div>
    </template>

    <template #default>
      <div class="category-filter"><button v-for="tag in tags" :key="tag.name" :aria-pressed="selected===tag.name" @click="selected=tag.name">{{ tag.name }} · {{ tag.count }}</button></div>
      <div v-if="error" class="state">{{ error }} <button @click="load">重试</button></div>
      <div v-else-if="loading" class="state">正在加载标签...</div>
      <div v-else-if="groups.length > 0" class="group-list">
        <section v-for="group in groups" :key="group.name" class="group">
          <div class="group-header">
            <h2>{{ group.name }}</h2>
            <span>{{ total }}</span>
          </div>
          <div class="group-posts">
            <router-link
              v-for="post in group.posts"
              :key="post.id"
              :to="post.url"
              class="post-link"
            >
              {{ post.title }}
            </router-link>
          </div>
        </section>
      </div>
      <div v-else class="state">当前还没有标签。</div>
      <div v-if="selected" class="pagination"><button :disabled="loading || page===1" @click="page--; load()">上一页</button><span>第 {{ page }} / {{ pages }} 页</span><button :disabled="loading || page===pages" @click="page++; load()">下一页</button></div>
    </template>
  </ContentPageLayout>
</template>

<style scoped lang="less">
.eyebrow {
  margin: 0 0 4px;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--surface-muted);
}

h1 {
  margin: 0;
  color: var(--surface-title);
  font-size: clamp(1.2rem, 2.6vw, 1.6rem);
  line-height: 1.15;
}

.subtitle {
  margin: 4px 0 0;
  color: var(--surface-text);
  font-size: 0.9rem;
}

.meta {
  margin-top: 8px;
}

.meta span {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--tag-border);
  color: var(--tag-text);
  font-size: 0.74rem;
  background: var(--tag-bg);
}

.state {
  color: var(--surface-text);
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group {
  border: 1px solid var(--glass-border-soft);
  border-radius: 14px;
  padding: 12px 12px 10px;
  background: color-mix(in oklab, var(--surface-bg) 92%, transparent);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.group-header h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--surface-title);
}

.group-header span {
  font-size: 0.75rem;
  color: var(--surface-muted);
  border: 1px solid var(--tag-border);
  border-radius: 999px;
  padding: 1px 8px;
}

.group-posts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.post-link {
  color: var(--surface-text);
  text-decoration: none;
  font-size: 0.86rem;
  border: 1px solid var(--tag-border);
  border-radius: 999px;
  padding: 3px 10px;
  background: var(--tag-bg);
}

.post-link:hover {
  color: var(--surface-title);
}
</style>
