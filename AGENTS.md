# AGENTS.md

本文件是本仓库对 Codex / AI 代码代理的唯一长期规则入口。

进入仓库后，在开始搜索、修改、重构、生成文件、运行构建、提交代码之前，必须先阅读本文件。

如果本文件与历史会话、旧规则文件、零散注释冲突，以本文件为准。
如果本文件与用户当前消息的明确要求冲突，以用户当前消息为准。

## 1. 代理必须遵守的规则

### 1.1 编码与文件写回

- 默认优先使用 `apply_patch` 修改源码文件
- 在 Windows PowerShell 下，禁止对包含中文或可能包含非 ASCII 的源码文件直接使用 `Set-Content` 或 `Out-File`
- 如果 `apply_patch` 失败，且确实必须用 PowerShell 写文件，只能使用：
  - `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))`
- 任何非 `apply_patch` 的源码写回后，必须立即重新检查：
  - 中文是否正常
  - 是否引入 BOM
  - diff 是否符合预期
- 未完成上述检查前，不得继续下一步

### 1.2 修改策略

- 优先做小范围、可验证、可回退的修改
- 没有明确需求时，不要顺手修改无关代码
- 发现工作区已有未提交改动时，先识别是否与当前任务相关，不得擅自覆盖用户已有修改
- 非必要不要整体重写大文件
- 能抽局部公共函数时，不要上来就做整片大重构

### 1.3 沟通与提交

- 注释一律使用中文
- commit 信息必须使用以下前缀之一：`feat`、`fix`、`perf`、`style`、`chore`、`refactor`
- commit 信息格式固定为：`前缀: 中文说明`
- 不要再提交不带前缀的中文 commit，也不要提交英文说明
- 提交前确认工作区范围干净，避免把无关变更混进同一提交
- 需要重写历史时，必须先说明影响
- 如果只是构建副产物、编辑器缓存或自动生成文件变化，先判断是否应该提交；不应该提交的要回撤

### 1.4 本次会话里最容易犯错的点

- 不要再引入 BOM 问题
- 不要用英文 commit
- 不要在没核对规则前就直接动手
- 不要把无关改动或构建产物混进提交

## 2. 项目整体规范

### 2.1 技术栈

- 使用 `TypeScript`、`Vue 3`、`Less`
- 路径别名 `@` 指向 `src`

### 2.2 Vue 约定

- `script` 默认使用 `<script setup lang="ts">`
- `style` 默认使用 `<style scoped lang="less">`
- 只有在确实需要覆盖全局样式时，才去掉 `scoped`

### 2.3 样式约定

- 优先复用 `src/styles` 下已有的 less 变量、主题和公共样式
- 如果某段样式未来可能复用，优先抽到公共层，而不是散落在页面里
- 只有确认没有复用价值时，才写进组件自己的局部样式

### 2.4 注释与文案

- 代码注释使用中文
- 界面文案优先保持中文语境一致
- 发现乱码时，先确认影响范围，再做修复

## 3. 项目代码组织约定

### 3.1 页面与布局

- 普通内容页优先复用 `src/component/common/ContentPageLayout.vue`
- 首页 `src/pages/HomePage.vue` 是特殊页面，不要轻易套用普通内容页模板
- 新增普通页面时，通常只需要：
  - 在 `src/pages/` 下创建页面
  - 在 `src/router/router.ts` 注册路由
  - 如有需要，再更新 `src/component/layout/Header.vue` 的导航入口

### 3.2 文章系统

文章系统核心位于 `src/service/posts/`：

- `loaders.ts`：文章与文章资源的按需加载入口
- `index-builder.ts`：文章摘要与分类树构建
- `frontmatter-parser.ts`：frontmatter 解析
- `repository.ts`：统一文章查询与缓存
- `types.ts`：文章相关类型定义
- `meta-manifest.generated.ts`：归档、标签、搜索等轻量元数据清单

新增文章相关能力时，优先复用或扩展这一层，不要在页面里重复写一套解析逻辑。

新增、删除、重命名文章，或修改文章 frontmatter 后，必须同步检查 `src/service/posts/meta-manifest.generated.ts`：

- 优先运行 `node scripts/generate-post-meta-manifest.mjs` 更新清单
- 提交前核对 diff，确认清单只包含本次文章相关的元数据变化
- 如果生成脚本带出大量历史字段或排序变化，先收窄到本次必要条目，不要把无关清单刷新混进提交
- 新文章必须确认清单中存在对应 `title` 与日期字段，否则 `/archive`、`/tags`、搜索等依赖元数据的页面可能不会按预期显示

### 3.3 frontmatter 约定

当前主要使用这些字段：

- `title`
- `date`
- `publishedAt`
- `publishDate`
- `createdAt`
- `tags`

说明：

- 分类主要由 `src/posts` 下的目录结构承担
- `tags` 用于标签聚合
- 日期字段用于归档和排序
- 文章日期变更后，要同步核对 `meta-manifest.generated.ts` 中的 `publishedAt`

### 3.4 组件自动注册

项目启用了 `unplugin-vue-components`，会扫描：

- `src/component`
- `src/pages`

因此很多组件可以直接在模板中使用，不需要手动 `import`。
阅读和修改代码时，要先判断组件是否属于自动注册，不要误删看似“未使用”的引用方式。

## 4. 整理代码时的偏好

### 4.1 哪些情况优先抽象复用

- 标签归一化、日期格式化、摘要提取这类纯函数逻辑重复出现
- 主题读写、滚动调度、空闲执行这类跨页面逻辑重复出现
- 多个页面共享相近的 hero、meta、tags 展示结构

### 4.2 哪些情况优先精简冗余

- 页面里为了展示而重复查询同一份数据
- 页面中存在已经不用的计算属性、样式、注释、字段
- 服务层已经提供能力，但页面仍然自行重复解析

## 5. 文档规则

- `AGENTS.md` 负责约束代理行为与项目协作规范
- `README.md` 主要面向项目使用者与协作者，不写过多实现细节
- 长期规则统一维护在本文件，不再把规则拆散到多个低可见位置

### 5.1 GitHub 归档同步（每次修改必须执行）

- 文章权威来源为同仓库 `posts` 分支的 `posts/` 目录，`main` 归档网站源码；文章运行时变更必须先提交 GitHub，再更新 D1 缓存。
- 不得用静态 seed 覆盖生产数据库中的后续编辑；首次迁移从生产数据库读取，恢复时以文章分支为准。
- 所有后台文章写操作和索引同步必须共用数据库同步锁，拒绝远端版本冲突，禁止自动强推。
- `GITHUB_POSTS_TOKEN` 仅作为 Sites 运行时秘密配置，禁止写入源码、日志或浏览器。

- 本项目的 GitHub 归档仓库固定为 `https://github.com/Smileslime47/GptBlog`，归档分支为 `main`。
- 每次修改代码、文章、资源、配置或文档（包括本文件）后，都必须把本次完整源码状态同步到上述归档仓库；不得只更新 Sites 而遗漏 GitHub。
- GitHub 仅用于源码备份，不启用 GitHub Pages，不添加 Pages 部署工作流。站点发布继续遵循用户明确指定的托管方式。
- 同步前先读取归档分支最新状态，保留已有提交历史；禁止未经用户授权强制推送或覆盖他人新增修改。
- 提交前检查 diff 和相关验证结果；同步源码、锁文件、必要资源和数据库结构文件，不上传密钥、运行时凭据、依赖目录、缓存或构建产物。
- 优先使用名为 `github-archive` 的 Git remote，地址为 `https://github.com/Smileslime47/GptBlog.git`；临时 checkout 缺少此 remote 时，应先重新配置。GitHub 连接器也可用于同步。
- 推送后必须读取 GitHub 远端分支确认归档提交及源码树与本次修改一致；完成说明中提供归档提交链接。
- 若因权限、网络、分支保护或冲突未能同步，必须明确说明“GitHub 归档尚未完成”及阻塞原因，保留修改并继续处理，不得声称任务已全部完成。

## 6. 已废弃的旧规则入口

以下旧文件已经废弃，不再作为主要规则入口：

- `.assistant/rules.md`
- `.aiassistant/rules/rule.md`

后续只维护本文件。
