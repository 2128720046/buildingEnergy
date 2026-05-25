# 性能基线（改前）

采集时间：2026-05-25 11:27（Asia/Shanghai）

采集环境：
- 应用：`apps/editor`，`next dev --port 3002`
- 视口：1920 x 1080，deviceScaleFactor = 1
- 采集工具：临时 CDP 脚本 `.tmp_run/cdp-perf-capture.mjs`
- 截图输出：`output/perf/screenshots/`

> 说明：当前环境中 Playwright CLI 通过 `npx @playwright/cli` 自动采集存在 npm/cache 权限与 WebGPU headless GPU 崩溃问题，因此基线改用 Chrome DevTools Protocol 采集。React commit 次数通过预注入 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 记录；“Profiler 单 commit 平均时长”在无 DevTools Profiler UI/trace 的环境下无法取得等价火焰图数据，表中记录为 hook 回调平均耗时，不能等同 Chrome DevTools Profiler commit duration。

| 页面 | FPS（5s 平均） | Long Task 数（10s） | React commit 次数（10s） | 单 commit 平均时长 | JS Heap 稳态值 |
|---|---:|---:|---:|---:|---:|
| 数据分析大屏 | 0.00 | 29 | 47 | 0.000 ms（hook 口径） | 88.62 MB |
| 能耗查询大屏 | 7.50 | 25 | 345 | 0.000 ms（hook 口径） | 287.63 MB |
| 智慧运维大屏 | 0.00 | 26 | 392 | 0.000 ms（hook 口径） | 139.46 MB |

截图：
- 数据分析大屏：`output/perf/screenshots/baseline-data-analysis.png`
- 能耗查询大屏：`output/perf/screenshots/baseline-energy-insights.png`
- 智慧运维大屏：`output/perf/screenshots/baseline-smart-operations.png`

环境噪声：
- 本地 API `localhost:3010` 已监听，但页面请求 `projects/building/assets/1779616295563-4bda6117.glb` 返回 404，R3F Viewer 进入错误边界；后续每步按同一环境对比。
- Chrome headless 模式下 WebGPU/GPU 进程崩溃，未用于最终基线。
