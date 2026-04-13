# 后端开发与数据库接入手册

## 1. 这份文档是给谁看的

这份文档是给“第一次接这个项目的人”看的，目标很明确：

1. 看懂当前后端到底负责什么。
2. 学会把现在的文件存储后端改成数据库后端。
3. 学会后面怎么继续加“组件绑定”和“能耗查询”。

如果你把自己当成小白，就按这份文档的顺序做，不要跳步。

## 2. 当前后端在哪里

当前最小后端在这里：

- [apps/api/server.mjs](../apps/api/server.mjs)

它现在提供 3 个接口：

1. `GET /health`
2. `GET /projects/:projectId/scene`
3. `PUT /projects/:projectId/scene`

目前它做的是“文件存储版后端”，也就是把场景保存成 json 文件。

## 3. 你要先理解：后端分 3 层，不要混

后端后面一定要分成这 3 层：

1. 场景存储层
2. 组件绑定层
3. 能耗查询层

分别负责：

- 场景存储层：保存和读取 SceneGraph。
- 组件绑定层：把 `componentId` 映射到真实设备、测点、电表。
- 能耗查询层：根据绑定关系查时间序列能耗数据。

前端永远只认：

- `projectId`
- `componentId`

不要让前端直接知道 `meterId`、`pointId`、`sensorId`。

## 4. 推荐你先用 PostgreSQL

如果你还没有明确数据库方案，推荐直接用 PostgreSQL。

原因：

1. 好学。
2. 资料多。
3. 支持 json/jsonb，适合先存 SceneGraph。
4. 后面加关系表和能耗明细表也顺手。

## 5. 第一步：先跑通当前后端

先不要一上来改数据库，先把当前文件版服务跑起来。

### 环境变量

看这里：

- [apps/api/.env.example](../apps/api/.env.example)

最小配置：

```env
PORT=3010
EDITOR_API_ALLOW_ORIGIN=http://localhost:3004
EDITOR_API_DATA_DIR=./data/projects
```

### 启动命令

```bash
cd apps/api
node server.mjs
```

### 验证健康检查

打开：

```text
http://localhost:3010/health
```

如果返回类似：

```json
{
  "status": "ok",
  "app": "editor-api"
}
```

说明当前后端能跑。

## 6. 第二步：先理解当前场景读写流程

当前流程是：

1. 前端传 `projectId`
2. 后端读取 `apps/api/data/projects/{projectId}.json`
3. 返回 `scene`
4. 前端修改后，再 PUT 回来
5. 后端把新的 `scene` 写回 json 文件

这一层以后替换成数据库读写就行。

也就是说，你以后第一步不是改前端，而是只改 [apps/api/server.mjs](../apps/api/server.mjs) 里这两段能力：

1. `loadProjectScene`
2. `saveProjectScene`

## 7. 第三步：把文件存储替换成数据库存储

推荐按下面顺序做。

### 7.1 先建数据库

假设你用 PostgreSQL，新建一个数据库，例如：

```sql
CREATE DATABASE pascal_editor;
```

### 7.2 先建第一张表：项目场景表

```sql
CREATE TABLE project_scenes (
  project_id TEXT PRIMARY KEY,
  scene_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

这张表只干一件事：保存整个 SceneGraph。

### 7.3 在后端新增数据库连接文件

你后面可以自己新增：

- `apps/api/db.mjs`

职责只有一个：创建数据库连接。

如果你以后用 `pg`，最小思路就是：

```js
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})
```

### 7.4 把读写文件改成读写数据库

你要把当前：

- `loadProjectScene(projectId)`
- `saveProjectScene(projectId, scene)`

替换成：

- `loadProjectSceneFromDb(projectId)`
- `saveProjectSceneToDb(projectId, scene)`

数据库写入逻辑大致就是：

1. `GET /projects/:projectId/scene`：按 `project_id` 查 `scene_json`
2. `PUT /projects/:projectId/scene`：按 `project_id` 做 upsert

### 7.5 一定先只做这一步

你先不要碰能耗查询。先确认一件事：

前端保存一次模型，然后刷新页面，模型还能从数据库正确读回来。

这一步稳定了，后面再继续。

## 8. 第四步：增加组件绑定表

为什么要加这张表？

因为前端点中的是场景里的 `componentId`，但真实能耗表通常不是按 `componentId` 存的，而是按：

- 电表 id
- 测点 id
- 传感器 id

所以你必须有一张映射表。

### 建表示例

```sql
CREATE TABLE component_bindings (
  project_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  binding_type TEXT NOT NULL,
  binding_target_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, component_id)
);
```

含义：

- `component_id`：建模模块里的节点 id
- `binding_type`：比如 `meter`、`sensor`、`point`
- `binding_target_id`：真实外部系统里的 id

## 9. 第五步：增加能耗明细表

### 建表示例

```sql
CREATE TABLE energy_readings (
  project_id TEXT NOT NULL,
  binding_target_id TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL
);
```

这张表存的是原始能耗点位数据。

## 10. 第六步：增加按组件查询能耗的接口

接口一定要长这样：

```text
GET /projects/:projectId/energy/components/:componentId
```

不要把接口写成前端直接传 `meterId`。

后端内部查询流程应该固定为：

1. 收到 `projectId`
2. 收到 `componentId`
3. 去 `component_bindings` 查它绑定到哪个 `binding_target_id`
4. 再去 `energy_readings` 查时间范围内的数据
5. 返回给前端

## 11. 第七步：前端和后端如何联动

前端宿主页面会通过 `onSelectionChange` 拿到当前选中的组件：

```ts
const componentId = snapshot.selectedIds[0] ?? null
```

然后前端请求：

```text
GET /projects/building-001/energy/components/{componentId}
```

后端负责做映射和查询。

这条规则不要变：

1. 前端只认 `componentId`
2. 后端负责映射
3. 建模模块不碰数据库

## 12. 推荐你的后端目录结构

如果你后面要把 `apps/api` 继续做大，推荐拆成：

```text
apps/api/
  server.mjs
  db/
    pool.mjs
  repositories/
    project-scene-repository.mjs
    component-binding-repository.mjs
    energy-reading-repository.mjs
  services/
    project-scene-service.mjs
    energy-query-service.mjs
```

这样每层职责清楚：

- repository：只碰数据库
- service：只做业务流程组合
- server.mjs：只做 HTTP 路由

## 13. 真正的开发顺序，按这个来

如果你是小白，不要乱跳，按这个顺序做：

1. 跑通当前文件版后端。
2. 建 PostgreSQL 数据库。
3. 增加 `project_scenes` 表。
4. 把场景保存和读取改成数据库版。
5. 确认前端仍然能保存和读取模型。
6. 增加 `component_bindings` 表。
7. 先手工插入几条绑定关系。
8. 增加 `energy_readings` 表。
9. 新增按 `componentId` 查能耗的接口。
10. 再把右侧宿主面板从 mock 数据改成真实数据。

## 14. 你要发给后端开发者哪些文件

如果对方是负责继续做数据库后端，请至少发这些：

1. [apps/api](../apps/api)
2. [packages/core](../packages/core)
3. [packages/viewer](../packages/viewer)
4. [packages/editor](../packages/editor)
5. [docs/frontend-backend-split.zh-CN.md](frontend-backend-split.zh-CN.md)
6. [docs/host-frontend-mounting-guide.zh-CN.md](host-frontend-mounting-guide.zh-CN.md)

其中：

- `apps/api`：给他当前最小后端样例。
- `core/viewer/editor`：让他看懂前端给后端传什么数据。
- 两份 docs：让他知道宿主前端怎么接、后端该承担什么边界。

## 15. 结论

把这个项目看简单一点，就是下面 3 句话：

1. 建模编辑器负责产生和编辑 SceneGraph。
2. 宿主前端负责拿 `componentId` 发业务查询。
3. 后端负责把 `componentId` 映射到真实设备并返回能耗数据。

只要始终守住这条边界，后面接数据库、接报表、接能耗分析都会很顺。
