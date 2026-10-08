import type { PostEntry, PostSummary } from './types'

/**
 * 对外统一导出的类型。
 * 页面层/组件层优先从这里引用，避免跨文件直接耦合内部实现。
 */
export type { PostEntry, PostSummary, CategoryNode, FrontmatterValue, PostMeta } from './types'

/**
 * 后端文章查询服务：列表分页查询，正文按需读取。
 */
export type PostPage = { items: PostSummary[]; page: number; pageSize: number; total: number; totalPages: number }
export type BlogStats = { totalPosts: number; totalCategories: number; totalTags: number; categories: string[] }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/' + path, init)
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || '请求失败'), { status: response.status })
  return data as T
}
export const postsService = {
  async loadPostBySegments(segments: string[]): Promise<PostEntry | undefined> {
    const id = segments.join('/').replace(/\.md$/i, '') + '.md'
    try { return await api<PostEntry>('post?id=' + encodeURIComponent(id)) }
    catch (error) { if ((error as { status?: number }).status === 404) return undefined; throw error }
  },
  page(page = 1, options: Record<string, string> = {}) { return api<PostPage>('posts?' + new URLSearchParams({ page: String(page), ...options })) },
  stats: () => api<BlogStats>('stats'),
}
