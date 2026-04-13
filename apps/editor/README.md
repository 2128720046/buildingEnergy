# 前端应用说明

apps/editor 是当前仓库中的宿主前端，负责把建模核心模块、业务面板和后端接口编排到统一页面中。该应用不应该继续演变成“所有业务逻辑都堆在 components 下”的形态，而应以 feature 为中心组织代码。

## 当前目录结构

```text
apps/editor/
├── app/                            # 页面入口
├── features/
│   ├── host-shell/                 # 宿主工作台装配层
│   └── energy-insights/            # 能耗查询业务模块
├── lib/                            # 跨 feature 共用工具
├── public/                         # 静态资源
└── README.md
```

## 模块职责

### host-shell

1. 负责页面级状态装配。
2. 管理建模核心模块的 onLoad、onSave、onSelectionChange 等宿主桥接能力。
3. 统一挂载业务面板，不直接实现具体业务细节。

### energy-insights

1. 负责右侧能耗业务栏。
2. 负责筛选栏、查询模型、能耗接口调用。
3. 未来如果替换为真实能耗接口，应优先在该模块内部扩展，不影响 host-shell。

## 开发约束

1. 新增业务必须在 features 下创建独立目录。
2. 页面入口只做模块组合，不做大段业务实现。
3. 共享工具才能放到 lib，业务私有逻辑必须放回各自 feature。
4. 不允许把业务 API 封装、业务状态和业务面板重新塞回 components 根目录。

## 运行方式

安装依赖：

```bash
bun install
```

启动开发环境：

```bash
cd apps/editor
bun run dev
```

类型检查：

```bash
cd apps/editor
bun run check-types
```

## 环境变量

推荐在 .env.local 中配置：

```env
NEXT_PUBLIC_EDITOR_API_BASE_URL=http://localhost:3010
```

## 新业务接入建议

如果你要新增设备详情、资产盘点、巡检工单等业务，建议按下面方式扩展：

1. 在 features 下新建独立目录，例如 features/device-assets。
2. 在该 feature 内拆分 components、lib、types、services。
3. 在 host-shell 中通过一个新的业务面板或入口进行挂载。
4. 如需后端支持，在 apps/api 中新增接口，再由当前 feature 自己封装访问函数。

## 文档索引

1. 前端接口说明见 [前端接口说明.md](%E5%89%8D%E7%AB%AF%E6%8E%A5%E5%8F%A3%E8%AF%B4%E6%98%8E.md)
2. 仓库总览见 [../../README.md](../../README.md)
