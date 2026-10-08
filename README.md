# 47Saikyo

基于原博客设计的完整博客站点。前端沿用 Vue 3 和 Less，文章由 GitHub `posts` 分支管理，服务端 API 从 D1 阅读缓存查询；首次迁移前保留现有数据库文章。

## 发文

打开 `/admin`，使用站点所有者的 ChatGPT 账号登录。可新建文章、导入 Markdown、预览、保存草稿、发布、编辑和删除。文章保存先提交至 `Smileslime47/GptBlog` 的 `posts` 分支，成功后更新 D1 阅读缓存，无需重新部署。文章路径在首次保存后保持固定，更新标题不会改变旧链接。

## 文章同步

- 代码归档在 `main`，文章和配图在 `posts` 分支的 `posts/` 目录；不使用 GitHub Pages。
- 在 Sites 运行时设置中添加秘密变量 `GITHUB_POSTS_TOKEN`：使用只允许 `GptBlog` 仓库的 fine-grained token，授予 Contents 读写权限；不要把凭据写入仓库。
- 首次迁移已完成，后台仅保留“从仓库同步”；需要恢复索引时，以已有文章仓库为准，不再重复迁移数据库文章。
- 本地编辑 `posts/分类/文章.md` 并推送后，后台点击“从仓库同步”；每次最多处理 10 篇变更，提示有剩余时继续点击。全部同步完成后才删除仓库已移除的缓存文章。当前采用手动拉取，不依赖 webhook。
- Markdown 使用 YAML frontmatter：`title`、`category`、`tags`、`date`、`status`（draft/published），其余元数据保留。数据库正文是可重建缓存。
- 草稿也存入文章分支：公开仓库中的草稿可以被直接读取，网站只隐藏它在读者页面的展示。
- 保存遇到远端版本冲突会拒绝覆盖；先同步再重新打开文章。GitHub 写入结果不确定或写入后数据库失败时，先从仓库同步核对结果，再决定是否重试。
- 原有图片归档到文章分支并继续随站点发布；新增 PNG/JPEG/GIF/WebP/AVIF 配图可放到文章分支 `posts/` 下，正文使用相对路径，网站通过同源接口按需读取（单张最多 5 MB）。后台暂不支持图片上传。
- 未配置凭据或未初始化时，后台不会继续产生只存数据库的新修改；编辑器保留输入并显示原因。

首页、目录、归档、标签和后台列表均使用服务端分页。草稿不会出现在读者页面。并发修改会检测版本冲突，避免覆盖另一窗口的修改。

## 开发

1. 安装项目依赖。
2. `node node_modules/vite/bin/vite.js build --config vite.client.config.ts` 构建 Vue 前端。
3. `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.client.json` 检查前端类型。
4. 使用 Sites 构建和发布流程部署服务端。

数据库结构位于 `db/schema.ts`，生产结构通过 Drizzle 迁移管理。`db/seed.json` 只负责原站 211 篇文章的一次性导入，完成后不会覆盖后台更新或补回已删除的文章。原文章的图片和页面背景随静态资源发布。

`ADMIN_EMAIL` 由托管平台配置，为首次绑定管理员账号使用；验证通过后使用站点内稳定的用户 ID 鉴权。新站默认仅站点所有者可访问；公开访问需另行调整 Sites 分享设置。

页面设计与原始文章来自 [Smileslime47/Smileslime47.github.io](https://github.com/Smileslime47/Smileslime47.github.io)。原文许可保持 CC BY-NC-SA 4.0。
