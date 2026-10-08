# 47Saikyo

基于原博客设计的完整博客站点。前端沿用 Vue 3 和 Less，文章通过服务端 API 从 D1 数据库读取。

## 发文

打开 `/admin`，使用站点所有者的 ChatGPT 账号登录。可新建文章、导入 Markdown、预览、保存草稿、发布、编辑和删除。保存直接写入数据库，无需重新部署。文章路径在首次保存后保持固定，更新标题不会改变旧链接。

首页、目录、归档、标签和后台列表均使用服务端分页。草稿不会出现在读者页面。并发修改会检测版本冲突，避免覆盖另一窗口的修改。

## 开发

1. 安装项目依赖。
2. `node node_modules/vite/bin/vite.js build --config vite.client.config.ts` 构建 Vue 前端。
3. `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.client.json` 检查前端类型。
4. 使用 Sites 构建和发布流程部署服务端。

数据库结构位于 `db/schema.ts`，生产结构通过 Drizzle 迁移管理。`db/seed.json` 只负责原站 211 篇文章的一次性导入，完成后不会覆盖后台更新或补回已删除的文章。原文章的图片和页面背景随静态资源发布。

`ADMIN_EMAIL` 由托管平台配置，为首次绑定管理员账号使用；验证通过后使用站点内稳定的用户 ID 鉴权。新站默认仅站点所有者可访问；公开访问需另行调整 Sites 分享设置。

页面设计与原始文章来自 [Smileslime47/Smileslime47.github.io](https://github.com/Smileslime47/Smileslime47.github.io)。原文许可保持 CC BY-NC-SA 4.0。
