import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { resolve } from 'node:path'
export default defineConfig({
  base: '/client/', publicDir: false,
  plugins: [vue(), Components({ dirs: ['src/component', 'src/pages'], dts: 'components.d.ts' })],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  css: { preprocessorOptions: { less: { additionalData: `@import "${resolve(import.meta.dirname, 'src/styles/variables.less')}";` } } },
  // 保留标准与 WebKit 两种背景模糊属性，避免压缩时只留下前缀版本。
  build: { outDir: 'public/client', emptyOutDir: true, cssMinify: false },
})
