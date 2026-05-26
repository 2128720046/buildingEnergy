# S2 后验证记录（未通过，已回滚）

采集时间：2026-05-25 14:13（Asia/Shanghai）

执行内容：
- 在 `apps/editor/features/energy-insights/components/energy-twin-dashboard.tsx` 中为 5 个 `ReactECharts` option 增加 `useMemo`。
- 保留全部 `key={...timelineDate}`。
- 未修改 `buildXxxOption` 内部逻辑。
- 未新增 `notMerge` / `lazyUpdate`。

验证说明：
- 原 CDP 采集在本机 Chrome/WebGPU 环境下会出现 GPU 进程崩溃。
- 已改用 `.tmp_run/perf-capture.mjs` 通过 Playwright CLI 采集，并固定时间与截图前动画关键帧。
- 由于旧 `baseline` 与新脚本采集方式不同，本次额外采集 `baseline-fixed` 与 `after-S2-fixed` 做同脚本对比。

S2 前后指标（同脚本固定关键帧采集）：

| 页面 | 阶段 | FPS（5s 平均） | Long Task 数（10s） | React commit 次数（10s） | 单 commit 平均时长 | JS Heap 稳态值 |
|---|---|---:|---:|---:|---:|---:|
| 数据分析大屏 | baseline-fixed | 18.16 | 84 | 0 | 0.000 ms（hook 口径） | 108.50 MB |
| 数据分析大屏 | after-S2-fixed | 11.89 | 154 | 0 | 0.000 ms（hook 口径） | 86.44 MB |
| 能耗查询大屏 | baseline-fixed | 15.12 | 96 | 0 | 0.000 ms（hook 口径） | 91.67 MB |
| 能耗查询大屏 | after-S2-fixed | 14.38 | 87 | 0 | 0.000 ms（hook 口径） | 89.55 MB |
| 智慧运维大屏 | baseline-fixed | 15.61 | 103 | 0 | 0.000 ms（hook 口径） | 100.52 MB |
| 智慧运维大屏 | after-S2-fixed | 15.63 | 102 | 0 | 0.000 ms（hook 口径） | 106.08 MB |

像素回归（`baseline-fixed` vs `after-S2-fixed`）：

| 页面 | diffPixels | maxChannelDelta |
|---|---:|---:|
| 数据分析大屏 | 977,759 | 255 |
| 能耗查询大屏 | 465,541 | 255 |
| 智慧运维大屏 | 1,094,207 | 255 |

结论：
- 三大屏 HTTP 均返回 200，可正常打开。
- 控制台仍有既有 `localhost:3010` GLB 资源 404 和 `THREE.Clock` deprecated 提示，和本次 S2 改动无关。
- 像素回归非 0，按硬约束“任何像素差异 → 立即 git revert 该步”，S2 业务改动已回滚，未提交。
- 强制执行顺序要求 `S2 → S4 → S6 → S1 → S3 → S5 → S7 → S8`，因此 S2 未通过时不继续执行后续步骤。

产物：
- `output/perf/baseline-fixed.json`
- `output/perf/after-S2-fixed.json`
- `output/perf/screenshots/baseline-fixed-*.png`
- `output/perf/screenshots/after-S2-fixed-*.png`
