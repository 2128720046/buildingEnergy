# 宿主前端接入手册

## 1. 这份文档解决什么问题

这份文档只回答 4 个问题：

1. 外部前端到底要拿哪些包。
2. 静态资源现在放在哪里，怎么同步到宿主前端。
3. 最小可运行的宿主前端应该怎么挂建模模块。
4. 以后把项目发给别的前端开发者时，哪些文件必须一起发。

当前已经把编辑器代码和静态资源拆成独立包：

- [packages/core](../packages/core)
- [packages/viewer](../packages/viewer)
- [packages/editor](../packages/editor)
- [packages/editor-assets](../packages/editor-assets)

以后不要再把 [apps/editor](../apps/editor) 当成公共资源源头来依赖。它现在只是示例应用。

## 2. 外部前端必须安装哪些包

如果你要在一个新的前端项目里接入建模模块，最少需要这 4 个包：

1. `@pascal-app/core`
2. `@pascal-app/viewer`
3. `@pascal-app/editor`
4. `@pascal-app/editor-assets`

各自作用如下：

- `@pascal-app/core`：节点 schema、事件总线、场景 store。
- `@pascal-app/viewer`：Three.js / R3F viewer 状态和显示层。
- `@pascal-app/editor`：建模编辑器代码本体。
- `@pascal-app/editor-assets`：图标、模型、音频、字体、演示数据等静态资源。

## 3. 为什么你刚才会看到“模型能显示，但静态资源不显示”

因为这两类东西不是一回事：

1. 模型编辑区本身，很多是代码实时生成的几何体，所以即使没有图标、模型文件，也能看到基础编辑画布。
2. 图标、构件 GLB、缩略图、音频、字体这些都属于静态资源，如果 public 下没有对应文件，就会出现界面图标丢失、构件缩略图丢失、某些物件资源加载失败。

所以“模型还能显示”不代表“资源完整”。

## 4. 静态资源现在放在哪里

现在的静态资源源头已经切换到：

- [packages/editor-assets/public](../packages/editor-assets/public)

这里才是以后真正的公共资源仓库。

两个示例前端：

- [apps/editor](../apps/editor)
- [host-frontend-demo](../host-frontend-demo)

都会在运行前先把资源从 `@pascal-app/editor-assets` 同步到各自的 `public` 目录。

也就是说：

1. `packages/editor-assets/public` 是源码级资源源头。
2. 各个前端应用自己的 `public` 目录只是运行时副本。

## 5. 新宿主前端怎么同步静态资源

### 5.1 推荐做法

在宿主前端的 `package.json` 中增加一个资源同步脚本：

```json
{
  "scripts": {
    "sync-assets": "pascal-editor-assets sync --target ./public --clean"
  }
}
```

如果你是在当前 monorepo 里开发，而不是已经发布到 npm 的独立包环境，示例项目现在使用的是直接调用仓库脚本的写法：

宿主示例：

- [host-frontend-demo/package.json](../host-frontend-demo/package.json)

原示例前端：

- [apps/editor/package.json](../apps/editor/package.json)

## 6. 新宿主前端最小接入步骤

下面按 Next.js 宿主前端说明。

### 第一步：安装依赖

```bash
bun add @pascal-app/core @pascal-app/viewer @pascal-app/editor @pascal-app/editor-assets
```

如果是 React / Next 项目，一般还需要：

```bash
bun add @react-three/fiber @react-three/drei three
```

### 第二步：同步静态资源到宿主 public

```bash
bun run sync-assets
```

同步后，你的宿主 `public` 目录里会出现：

- `icons/`
- `items/`
- `audios/`
- `fonts/`
- `demos/`
- `cursor.svg`
- `pascal-logo-full.svg`

### 第三步：配置 Next

最少参考：

- [host-frontend-demo/next.config.ts](../host-frontend-demo/next.config.ts)

关键点通常有两个：

1. `transpilePackages`
2. `turbopack.resolveAlias`

参考写法：

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@pascal-app/editor', '@pascal-app/core', '@pascal-app/viewer', 'three'],
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
}

export default nextConfig
```

### 第四步：准备环境变量

```env
NEXT_PUBLIC_EDITOR_API_BASE_URL=http://localhost:3010
```

### 第五步：直接挂“编辑核心模块”

现在推荐优先使用：

- `ModelingEditorCoreModule`

因为它不会默认带上导航栏、默认侧栏、默认工具栏，更适合你们做业务宿主页面。

最小示例：

```tsx
'use client'

import { ModelingEditorCoreModule, type SceneGraph } from '@pascal-app/editor/modeling'
import { createEditorApiClient } from '@pascal-app/editor/host'

const apiClient = createEditorApiClient({
  baseUrl: process.env.NEXT_PUBLIC_EDITOR_API_BASE_URL,
  projectId: 'building-001',
})

export default function Page() {
  return (
    <ModelingEditorCoreModule
      onLoad={apiClient.isConfigured ? () => apiClient.loadScene() : undefined}
      onSave={apiClient.isConfigured ? (scene: SceneGraph) => apiClient.saveScene(scene) : undefined}
      onSelectionChange={(snapshot) => {
        console.log(snapshot.selectedIds[0] ?? null)
      }}
      projectId="building-001"
      sidebarTabs={[]}
    />
  )
}
```

## 7. 如果你想带默认壳层怎么办

如果你确实需要顶部导航、默认侧栏标签、默认工具栏，再选这些入口：

- `@pascal-app/editor/chrome`
- `@pascal-app/editor/host`

但当前更推荐的业务接入方式仍然是：

1. 左边只放 `ModelingEditorCoreModule`
2. 右边放你自己的业务面板
3. 用 `onSelectionChange` 拿 `componentId`

## 8. 当前示例项目如何参考

### 8.1 只看“最接近你未来业务系统”的例子

看这里：

- [host-frontend-demo/components/host-demo-shell.tsx](../host-frontend-demo/components/host-demo-shell.tsx)

它现在已经改成：

1. 左边只挂编辑核心模块。
2. 右边只挂能耗面板。
3. 不再依赖临时静态资源透传路由。
4. 资源统一从 `editor-assets` 包同步到本地 `public`。

### 8.2 如果你想看“官方示例前端”

看这里：

- [apps/editor/app/page.tsx](../apps/editor/app/page.tsx)

## 9. 给下一位前端开发者时，必须发哪些文件

如果对方是要继续做“建模模块接入”和“宿主业务开发”，请至少发送这些目录：

1. [packages/core](../packages/core)
2. [packages/viewer](../packages/viewer)
3. [packages/editor](../packages/editor)
4. [packages/editor-assets](../packages/editor-assets)
5. [docs/host-frontend-mounting-guide.zh-CN.md](host-frontend-mounting-guide.zh-CN.md)
6. [docs/frontend-backend-split.zh-CN.md](frontend-backend-split.zh-CN.md)

如果对方还需要参考现成页面和接口样例，再额外发：

1. [host-frontend-demo](../host-frontend-demo)
2. [apps/api](../apps/api)

通常不需要把 [apps/editor](apps/editor) 当成必发业务代码给对方。它主要是官方示例页，不是必须依赖。

## 10. 你以后对外怎么解释这个项目

最简单的说法就是：

1. `core/viewer/editor` 是代码能力包。
2. `editor-assets` 是静态资源包。
3. 新宿主前端只要装包、同步资源、挂 `ModelingEditorCoreModule` 就能跑。
4. 业务查询和能耗展示始终留在宿主前端自己做。
