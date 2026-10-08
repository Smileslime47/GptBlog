import type { CategoryNode, PostSummary } from './types'
/**
 * 由摘要列表构建树形分类结构。
 * 目录作为节点，文章挂到对应叶子（或中间）节点的 posts 字段。
 */
export function buildCategoryTree(posts: PostSummary[]): CategoryNode[] {
  const root: CategoryNode = {
    name: '',
    pathSegments: [],
    children: [],
    posts: [],
  }

  for (const post of posts) {
    // 没有分类段时，直接挂在根节点
    if (post.categorySegments.length === 0) {
      root.posts.push(post)
      continue
    }

    // 逐段下钻，若不存在则创建子节点
    let current = root
    for (const segment of post.categorySegments) {
      current = ensureChild(current, segment)
    }
    current.posts.push(post)
  }

  // 对节点和文章都做稳定排序，保证 UI 展示一致
  sortTree(root)
  return root.children
}

/**
 * 读取或创建指定名称的子节点。
 */
function ensureChild(parent: CategoryNode, name: string): CategoryNode {
  let child = parent.children.find((node) => node.name === name)
  if (!child) {
    child = {
      name,
      pathSegments: [...parent.pathSegments, name],
      children: [],
      posts: [],
    }
    parent.children.push(child)
  }
  return child
}

/**
 * 递归排序整棵树：
 * - 子分类按名称排序
 * - 分类下文章按标题排序
 */
function sortTree(node: CategoryNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  node.posts.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  node.children.forEach(sortTree)
}
