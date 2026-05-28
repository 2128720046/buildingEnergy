'use client'

// ─── GPU frame-time measurement ─────────────────────────────────────────
// Uses queue.onSubmittedWorkDone() (not timestamp queries) to measure the
// wall-clock time between render submission and GPU completion. Compatible
// with WebGPU backends that may not expose timestamp-query support.
//
// Usage:
//   1. In the render loop, call pushGpuSample() after renderer.render() or
//      renderPipeline.render(). Pass the elapsed ms since submission.
//   2. Read samples from the exported global array (reset each cycle).

const MAX_SAMPLES = 60
const gpuSamples: number[] = []

let avgCache = 0
let maxCache = 0
let sampleCountSinceRead = 0

/**
 * Push a GPU frame-time sample (in milliseconds). Call after
 * queue.onSubmittedWorkDone() resolves.
 */
export function pushGpuSample(elapsedMs: number) {
  sampleCountSinceRead++
  gpuSamples.push(elapsedMs)
  if (gpuSamples.length > MAX_SAMPLES) {
    gpuSamples.shift()
  }
}

/**
 * Read the latest GPU stats. Call this from the UI thread every ~0.5s.
 * Returns avg and max of the samples collected since last read.
 */
export function readGpuStats(): { avg: number; max: number } {
  if (gpuSamples.length === 0) return { avg: 0, max: 0 }
  let sum = 0
  let max = 0
  for (const s of gpuSamples) {
    sum += s
    if (s > max) max = s
  }
  avgCache = sum / gpuSamples.length
  maxCache = max
  sampleCountSinceRead = 0
  return { avg: avgCache, max: maxCache }
}

/**
 * Set to true by importing module to globally enable the perf overlay.
 * Can also be toggled at runtime.
 */
export let PERF_OVERLAY_ENABLED = false
export function setPerfOverlayEnabled(enabled: boolean) {
  PERF_OVERLAY_ENABLED = enabled
}
