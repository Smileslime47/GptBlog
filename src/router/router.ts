import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'
import PostsPage from '@/pages/PostsPage.vue'
import ArchivePage from '@/pages/ArchivePage.vue'
import TagsPage from '@/pages/TagsPage.vue'
import AboutPage from '@/pages/AboutPage.vue'
import AdminPage from '@/pages/AdminPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { top: 0, left: 0 }
  },
  routes: [
    { path: '/', component: HomePage },
    { path: '/posts', component: PostsPage },
    { path: '/archive', component: ArchivePage },
    { path: '/tags', component: TagsPage },
    { path: '/posts/:pathMatch(.*)*', component: () => import('@/pages/PostDetailPage.vue') },
    { path: '/about', component: AboutPage },
    { path: '/admin', component: AdminPage },
  ],
})

// 发布后旧标签页可能引用已替换的分包，导航失败时获取新版本入口。
router.onError((error, to) => {
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS/.test(error.message)) return
  const key = 'route-recovery-at'
  const last = Number(sessionStorage.getItem(key) || 0)
  if (Date.now() - last < 60000) return
  sessionStorage.setItem(key, String(Date.now()))
  window.location.assign(to.fullPath)
})
