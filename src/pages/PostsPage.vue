<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { postsService } from '@/service/posts'
import { buildCategoryTree } from '@/service/posts/index-builder'
import type { PostSummary } from '@/service/posts'

const posts = ref<PostSummary[]>([])
const totalPosts = ref(0)
const page = ref(1)
const totalPages = ref(1)
const category = ref('')
const categories = ref<string[]>([])
const loading = ref(false)
const error = ref('')
const categoryTree = computed(() => buildCategoryTree(posts.value))
async function load() {
  loading.value = true; error.value = ''
  try {
    const result = await postsService.page(page.value, category.value ? { category: category.value } : {})
    posts.value = result.items; page.value = result.page; totalPosts.value = result.total; totalPages.value = result.totalPages
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
}
onMounted(async () => { try { categories.value = (await postsService.stats()).categories; await load() } catch (e) { error.value = String(e) } })
watch(category, () => { page.value = 1; void load() })
</script>

<template>
  <ContentPageLayout>
    <template #hero>
      <p class="eyebrow">Posts</p>
      <h1>文章目录</h1>
      <p class="subtitle">按分类查找文章。</p>
      <div class="meta">
        <span>总文章数 {{ totalPosts }}</span>
      </div>
    </template>

    <template #default>
      <label class="category-filter">分类 <select v-model="category"><option value="">全部分类</option><option v-for="item in categories" :key="item" :value="item">{{ item || '未分类' }}</option></select></label>
      <p v-if="error">{{ error }} <button @click="load">重试</button></p>
      <p v-else-if="loading">正在加载文章...</p>
      <div v-else class="tree-wrap">
        <PostFolderTree
          v-for="node in categoryTree"
          :key="node.pathSegments.join('/')"
          :node="node"
        />
      </div>
      <div class="pagination"><button :disabled="loading || page === 1" @click="page--; load()">上一页</button><span>第 {{ page }} / {{ totalPages }} 页</span><button :disabled="loading || page === totalPages" @click="page++; load()">下一页</button></div>
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

.tree-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
