import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Color, Layers, UnsignedByteType } from 'three'
import { ssgi } from 'three/addons/tsl/display/SSGINode.js'
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js'
import {
  add,
  colorToDirection,
  diffuseColor,
  directionToColor,
  float,
  mix,
  mrt,
  normalView,
  oscSine,
  output,
  pass,
  sample,
  time,
  uniform,
  vec4,
} from 'three/tsl'
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu'
import { PERF_OVERLAY_ENABLED, pushGpuSample } from '../../lib/gpu-perf'
import { GRID_LAYER, OVERLAY_LAYER, SCENE_LAYER, ZONE_LAYER } from '../../lib/layers'
import { mergedOutline } from '../../lib/merged-outline-node'
import useViewer from '../../store/use-viewer'

// SSGI Parameters - adjust these to fine-tune global illumination and ambient occlusion
export const SSGI_PARAMS = {
  enabled: true,
  sliceCount: 1,
  stepCount: 4,
  radius: 1,
  expFactor: 1.5,
  thickness: 0.5,
  backfaceLighting: 0.5,
  aoIntensity: 1.5,
  giIntensity: 0,
  useLinearThickness: false,
  useScreenSpaceSampling: true,
  useTemporalFiltering: false,
}

// ─── Diagnostic toggles ────────────────────────────────────────────────
// Add ?disable=ao,denoise,outline,postFx,shadows to the URL (any subset)
// and reload to skip those passes. Each flag prevents allocation + per-frame
// work for that stage, so comparing perf across combos isolates which pass
// is the actual bottleneck.
//   - ao:       skip SSGI entirely (and denoise)
//   - denoise:  keep SSGI but skip denoise (keep raw noisy AO)
//   - outline:  skip merged-outline node entirely
//   - postFx:   bypass whole RenderPipeline, use renderer.render() directly
//   - shadows:  disable shadow maps
function readPerfDisableFlags() {
  if (typeof window === 'undefined') {
    return { ao: false, denoise: false, outline: false, postFx: false, shadows: false }
  }
  const raw = new URLSearchParams(window.location.search).get('disable') ?? ''
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  return {
    ao: set.has('ao'),
    denoise: set.has('denoise'),
    outline: set.has('outline'),
    postFx: set.has('postFx'),
    shadows: set.has('shadows'),
  }
}

const PERF_POST_FX_DISABLED =
  typeof window !== 'undefined' &&
  new Set(
    (new URLSearchParams(window.location.search).get('disable') ?? '')
      .split(',')
      .map((s) => s.trim()),
  ).has('postFx')

const MAX_PIPELINE_RETRIES = 3
const RETRY_DELAY_MS = 500
const INTERACTION_POST_FX_RESTORE_DELAY_MS = 150

const DARK_BG = '#0C0E14'
const LIGHT_BG = '#ffffff'

const PostProcessingPasses = () => {
  const { gl: renderer, scene, camera, size } = useThree()
  const renderPipelineRef = useRef<RenderPipeline | null>(null)
  const hasPipelineErrorRef = useRef(false)
  const retryCountRef = useRef(0)
  const rebuildTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skippedZeroSizeRef = useRef(false)

  // Background color uniform — updated every frame via lerp, read by the TSL pipeline.
  const initBg = useViewer.getState().theme === 'dark' ? DARK_BG : LIGHT_BG
  const bgUniform = useRef(uniform(new Color(initBg)))
  const bgCurrent = useRef(new Color(initBg))
  const bgTarget = useRef(new Color())

  // Zone pass renders floor fills + wall borders (layer 2 only)
  const zoneLayers = useMemo(() => {
    const l = new Layers()
    l.enable(ZONE_LAYER)
    l.disable(SCENE_LAYER)
    return l
  }, [])

  // Scene pass renders main geometry + grid, excluding gizmos/handles so they
  // don't get picked up by SSGI MRT or ink-edge detection.
  const sceneOnlyLayers = useMemo(() => {
    const l = new Layers()
    l.set(SCENE_LAYER)
    l.enable(GRID_LAYER)
    return l
  }, [])

  // Editor overlays render in their own pass, composited on top after ink and
  // outlines so they read as crisp UI rather than scene geometry.
  const overlayLayers = useMemo(() => {
    const l = new Layers()
    l.set(OVERLAY_LAYER)
    return l
  }, [])

  const hoverHighlightMode = useViewer((s) => s.hoverHighlightMode)
  const cameraDragging = useViewer((s) => s.cameraDragging)
  const projectId = useViewer((s) => s.projectId)
  const lastProjectIdRef = useRef(projectId)
  const [interactionFastPath, setInteractionFastPath] = useState(false)

  // Bump this to force a pipeline rebuild (used by retry logic)
  const [pipelineVersion, setPipelineVersion] = useState(0)

  const requestPipelineRebuild = useCallback(() => {
    if (rebuildTimeoutRef.current !== null) {
      clearTimeout(rebuildTimeoutRef.current)
      rebuildTimeoutRef.current = null
    }
    setPipelineVersion((v) => v + 1)
  }, [])

  // Reset retry state when project changes
  useEffect(() => {
    if (lastProjectIdRef.current === projectId) return
    lastProjectIdRef.current = projectId
    retryCountRef.current = 0
    if (rebuildTimeoutRef.current !== null) {
      clearTimeout(rebuildTimeoutRef.current)
      rebuildTimeoutRef.current = null
    }
  }, [projectId])

  useEffect(() => {
    return () => {
      if (rebuildTimeoutRef.current !== null) {
        clearTimeout(rebuildTimeoutRef.current)
        rebuildTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (cameraDragging) {
      setInteractionFastPath(true)
      return
    }

    const timeout = setTimeout(() => {
      setInteractionFastPath(false)
    }, INTERACTION_POST_FX_RESTORE_DELAY_MS)

    return () => clearTimeout(timeout)
  }, [cameraDragging])

  // ─── Pipeline build ───────────────────────────────────────────────────
  useEffect(() => {
    const width = Math.floor(size.width)
    const height = Math.floor(size.height)

    if (!(renderer && scene && camera)) {
      return
    }

    // Skip pipeline build when canvas has zero dimensions (tab hidden, etc.)
    if (width < 1 || height < 1) {
      skippedZeroSizeRef.current = true
      hasPipelineErrorRef.current = false
      if (renderPipelineRef.current) {
        renderPipelineRef.current.dispose()
      }
      renderPipelineRef.current = null
      return
    }

    if (skippedZeroSizeRef.current) {
      skippedZeroSizeRef.current = false
    }

    const perfDisable = readPerfDisableFlags()
    const ssgiEnabled = SSGI_PARAMS.enabled && !perfDisable.ao
    const denoiseEnabled = ssgiEnabled && !perfDisable.denoise
    const outlineEnabled = !perfDisable.outline

    hasPipelineErrorRef.current = false

    // WebGPU check: SSGI, denoise, and RenderPipeline are WebGPU-only.
    // If the browser doesn't have WebGPU, skip the TSL pipeline entirely
    // and fall back to direct renderer.render().
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator
    if (!hasWebGPU) {
      hasPipelineErrorRef.current = true
      renderPipelineRef.current = null
      return
    }

    // Clear outliner arrays to prevent stale Object3D refs from previous
    // project leaking into the new pipeline's outline passes.
    const outliner = useViewer.getState().outliner
    outliner.selectedObjects.length = 0
    outliner.hoveredObjects.length = 0

    try {
      const scenePass = pass(scene, camera)
      scenePass.setLayers(sceneOnlyLayers)
      const zonePass = pass(scene, camera)
      zonePass.setLayers(zoneLayers)
      // Editor overlays (gizmos, move handles, tool previews) on their own
      // layer so they never get SSGI/AO'd or outlined.
      const overlayPass = pass(scene, camera)
      overlayPass.setLayers(overlayLayers)
      const overlayColor = overlayPass.getTextureNode('output')

      const scenePassColor = scenePass.getTextureNode('output')

      // Background detection via alpha: renderer clears with alpha=0,
      // so background pixels have scenePassColor.a=0 while geometry pixels
      // have output.a=1.
      const hasGeometry = scenePassColor.a
      const contentAlpha = hasGeometry.max(zonePass.a)

      let sceneColor = scenePassColor as unknown as ReturnType<typeof vec4>

      if (ssgiEnabled) {
        // MRT needed for SSGI (diffuse for GI, normal for SSGI sampling)
        scenePass.setMRT(
          mrt({
            output,
            diffuseColor,
            normal: directionToColor(normalView),
          }),
        )

        const scenePassDiffuse = scenePass.getTextureNode('diffuseColor')
        const scenePassDepth = scenePass.getTextureNode('depth')
        const scenePassNormal = scenePass.getTextureNode('normal')

        // Optimize texture bandwidth
        const diffuseTexture = scenePass.getTexture('diffuseColor')
        diffuseTexture.type = UnsignedByteType
        const normalTexture = scenePass.getTexture('normal')
        normalTexture.type = UnsignedByteType

        // Extract normal from color-encoded texture
        const sceneNormal = sample((uv) => colorToDirection(scenePassNormal.sample(uv)))

        const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera as any)
        giPass.sliceCount.value = SSGI_PARAMS.sliceCount
        giPass.stepCount.value = SSGI_PARAMS.stepCount
        giPass.radius.value = SSGI_PARAMS.radius
        giPass.expFactor.value = SSGI_PARAMS.expFactor
        giPass.thickness.value = SSGI_PARAMS.thickness
        giPass.backfaceLighting.value = SSGI_PARAMS.backfaceLighting
        giPass.aoIntensity.value = SSGI_PARAMS.aoIntensity
        giPass.giIntensity.value = SSGI_PARAMS.giIntensity
        giPass.useLinearThickness.value = SSGI_PARAMS.useLinearThickness
        giPass.useScreenSpaceSampling.value = SSGI_PARAMS.useScreenSpaceSampling
        giPass.useTemporalFiltering = SSGI_PARAMS.useTemporalFiltering

        const giTexture = (giPass as any).getTextureNode()

        const gi = giPass.rgb
        let ao: any
        if (denoiseEnabled) {
          // DenoiseNode only denoises RGB — SSGI packs AO into alpha,
          // so remap it into RGB before denoising.
          const aoAsRgb = vec4(giTexture.a, giTexture.a, giTexture.a, float(1))
          const denoisePass = denoise(aoAsRgb, scenePassDepth, sceneNormal, camera)
          denoisePass.index.value = 0
          denoisePass.radius.value = 4
          ao = (denoisePass as any).r
        } else {
          // Diagnostic path: feed raw noisy SSGI AO through. Grainy output
          // isolates denoise cost — useful for profiling.
          ao = giTexture.a
        }

        // Composite: scene * AO + diffuse * GI
        sceneColor = vec4(
          add(scenePassColor.rgb.mul(ao), add(zonePass.rgb, scenePassDiffuse.rgb.mul(gi))),
          contentAlpha,
        )
      }

      // Single merged outline node: one shared depth pass for both selected
      // and hovered groups.
      let compositeWithOutlines = sceneColor
      if (outlineEnabled) {
        const outlineNode = mergedOutline(scene, camera, {
          primaryObjects: outliner.selectedObjects,
          secondaryObjects: outliner.hoveredObjects,
          primaryEdgeThickness: uniform(1),
          secondaryEdgeThickness: uniform(1.5),
        })

        // Selected: white visible, yellow hidden
        const selectedVisibleColor = uniform(new Color(0xff_ff_ff))
        const selectedHiddenColor = uniform(new Color(0xf3_ff_47))
        const selectedStrength = uniform(3)
        const selectedOutline = outlineNode.primaryVisibleEdge
          .mul(selectedVisibleColor)
          .add(outlineNode.primaryHiddenEdge.mul(selectedHiddenColor))
          .mul(selectedStrength)

        // Hovered: blue visible, yellow hidden, pulsing
        const hoverVisibleColor = uniform(
          new Color(hoverHighlightMode === 'delete' ? 0xef_44_44 : 0x00_aa_ff),
        )
        const hoverHiddenColor = uniform(
          new Color(hoverHighlightMode === 'delete' ? 0x99_1b_1b : 0xf3_ff_47),
        )
        const hoverStrength = uniform(hoverHighlightMode === 'delete' ? 6 : 5)
        const pulsePeriod = uniform(3)
        const osc =
          hoverHighlightMode === 'delete'
            ? float(1)
            : oscSine(time.div(pulsePeriod).mul(2)).mul(0.5).add(0.5)
        const hoverOutline = outlineNode.secondaryVisibleEdge
          .mul(hoverVisibleColor)
          .add(outlineNode.secondaryHiddenEdge.mul(hoverHiddenColor))
          .mul(hoverStrength)
          .mul(osc)

        compositeWithOutlines = vec4(
          add(sceneColor.rgb, selectedOutline.add(hoverOutline)),
          sceneColor.a,
        )
      }

      // Mix background behind scene + outline overlay on top
      const composited = mix(bgUniform.current, compositeWithOutlines.rgb, contentAlpha)
      // Editor overlays painted on top by their own alpha — never inked or AO'd
      const withOverlay = mix(composited, overlayColor.rgb, overlayColor.a)
      const finalOutput = vec4(withOverlay, float(1))

      const renderPipeline = new RenderPipeline(renderer as unknown as WebGPURenderer)
      renderPipeline.outputNode = finalOutput
      renderPipelineRef.current = renderPipeline
      retryCountRef.current = 0
    } catch (error) {
      hasPipelineErrorRef.current = true
      console.error(
        '[viewer] Failed to set up post-processing pipeline. Rendering without post FX.',
        {
          projectId,
          version: pipelineVersion,
        },
        error,
      )
      if (renderPipelineRef.current) {
        renderPipelineRef.current.dispose()
      }
      renderPipelineRef.current = null
    }

    return () => {
      if (renderPipelineRef.current) {
        renderPipelineRef.current.dispose()
      }
      renderPipelineRef.current = null
    }
  }, [
    camera,
    hoverHighlightMode,
    pipelineVersion,
    projectId,
    renderer,
    scene,
    size.height,
    size.width,
    zoneLayers,
    sceneOnlyLayers,
    overlayLayers,
  ])

  // ─── Render loop ──────────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (size.width < 1 || size.height < 1) {
      return
    }

    // Animate background colour toward the current theme target
    bgTarget.current.set(useViewer.getState().theme === 'dark' ? DARK_BG : LIGHT_BG)
    bgCurrent.current.lerp(bgTarget.current, Math.min(delta, 0.1) * 4)
    bgUniform.current.value.copy(bgCurrent.current)

    if (
      interactionFastPath ||
      PERF_POST_FX_DISABLED ||
      hasPipelineErrorRef.current ||
      !renderPipelineRef.current
    ) {
      // Fallback: direct render without any post-processing
      try {
        if ((renderer as any).setClearAlpha) {
          ;(renderer as any).setClearAlpha(1)
        }
        const submittedAt = PERF_OVERLAY_ENABLED ? performance.now() : 0
        ;(renderer as any).render(scene, camera)
        if (PERF_OVERLAY_ENABLED) {
          const queue = (renderer as any).backend?.device?.queue as
            | { onSubmittedWorkDone?: () => Promise<void> }
            | undefined
          queue?.onSubmittedWorkDone?.().then(() => {
            pushGpuSample(performance.now() - submittedAt)
          })
        }
      } catch (fallbackError) {
        console.error('[viewer] Fallback render failed.', fallbackError)
      }
      return
    }

    try {
      ;(renderer as any).setClearAlpha(0)
      const submittedAt = PERF_OVERLAY_ENABLED ? performance.now() : 0
      renderPipelineRef.current.render()
      if (PERF_OVERLAY_ENABLED) {
        const queue = (renderer as any).backend?.device?.queue as
          | { onSubmittedWorkDone?: () => Promise<void> }
          | undefined
        queue?.onSubmittedWorkDone?.().then(() => {
          pushGpuSample(performance.now() - submittedAt)
        })
      }
    } catch (error) {
      hasPipelineErrorRef.current = true
      console.error('[viewer] Post-processing render pass failed.', error)
      if (renderPipelineRef.current) {
        renderPipelineRef.current.dispose()
      }
      renderPipelineRef.current = null

      if (retryCountRef.current < MAX_PIPELINE_RETRIES) {
        retryCountRef.current++
        console.warn(
          `[viewer] Scheduling post-processing rebuild (attempt ${retryCountRef.current}/${MAX_PIPELINE_RETRIES})`,
        )
        if (rebuildTimeoutRef.current !== null) {
          clearTimeout(rebuildTimeoutRef.current)
        }
        rebuildTimeoutRef.current = setTimeout(requestPipelineRebuild, RETRY_DELAY_MS)
      } else {
        console.error(
          '[viewer] Post-processing retries exhausted. Rendering without post FX for this session.',
        )
      }
    }
  }, 1)

  return null
}

export default PostProcessingPasses
