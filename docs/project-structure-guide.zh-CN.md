# 项目目录分类说明书

## 1. 顶层目录怎么理解

当前仓库建议按“示例应用、可复用包、文档与工具”三层理解。

### 示例应用

- [apps/api](../apps/api)：最小后端接口样例。
- [apps/editor](../apps/editor)：官方示例前端。
- [host-frontend-demo](../host-frontend-demo)：更接近真实业务系统的宿主示例。

### 可复用包

- [packages/core](../packages/core)：场景 schema、事件总线、空间查询、store。
- [packages/viewer](../packages/viewer)：R3F/Three 显示层与 viewer store。
- [packages/editor](../packages/editor)：建模编辑器代码本体。
- [packages/editor-assets](../packages/editor-assets)：图标、GLB、缩略图、音频、字体、演示数据等公共静态资源。
- [packages/ui](../packages/ui)：通用 UI 组件。

### 工程支持

- [docs](.)：中文接入文档、后端开发文档、结构说明。
- [tooling](../tooling)：发布与工程脚本。

## 2. 现在真正的公共资源在哪里

静态资源源头已经切换到：

- [packages/editor-assets/public](../packages/editor-assets/public)

两个示例前端自己的 `public` 目录只是运行时同步副本，不再是资源源头。

## 3. 如果你只想接入建模模块，先看哪里

按这个顺序看最省时间：

1. [docs/host-frontend-mounting-guide.zh-CN.md](host-frontend-mounting-guide.zh-CN.md)
2. [host-frontend-demo/components/host-demo-shell.tsx](../host-frontend-demo/components/host-demo-shell.tsx)
3. [packages/editor/src/public/modeling.ts](../packages/editor/src/public/modeling.ts)
4. [packages/editor-assets](../packages/editor-assets)
5. [apps/api/server.mjs](../apps/api/server.mjs)

## 4. 如果你只想继续做后端，先看哪里

按这个顺序看：

1. [docs/frontend-backend-split.zh-CN.md](frontend-backend-split.zh-CN.md)
2. [apps/api/server.mjs](../apps/api/server.mjs)
3. [packages/editor/src/lib/editor-api-client.ts](../packages/editor/src/lib/editor-api-client.ts)
4. [host-frontend-demo/components/energy-panel.tsx](../host-frontend-demo/components/energy-panel.tsx)

## 5. 哪些目录是必须发给下一位开发者的

如果对方负责继续开发前后端，建议最少发：

1. [packages/core](../packages/core)
2. [packages/viewer](../packages/viewer)
3. [packages/editor](../packages/editor)
4. [packages/editor-assets](../packages/editor-assets)
5. [apps/api](../apps/api)
6. [docs](.)

如果只是给前端集成人员，不一定要把 [apps/editor](../apps/editor) 发过去。
