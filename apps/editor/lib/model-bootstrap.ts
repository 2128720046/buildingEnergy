import {
  type AnyNodeDefinition,
  discoverPlugins,
  loadPlugin,
  nodeRegistry,
  registerNode,
} from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'

let builtinsLoaded = false
let externalsKickedOff = false

function isDev(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.NODE_ENV !== 'production'
}

function loadBuiltinsSync(): void {
  if (builtinsLoaded) return
  builtinsLoaded = true

  for (const def of builtinPlugin.nodes ?? []) {
    const nodeDef = def as AnyNodeDefinition
    if (nodeRegistry.has(nodeDef.kind)) continue
    registerNode(nodeDef)
  }

  if (isDev() && typeof console !== 'undefined') {
    const kinds = Array.from(nodeRegistry.entries(), ([kind]) => kind)
    console.info(
      `[pascal:registry] loaded ${builtinPlugin.id} v${builtinPlugin.apiVersion} (${kinds.length} kinds)`,
    )
  }
}

async function loadExternalPlugins(): Promise<void> {
  if (externalsKickedOff) return
  externalsKickedOff = true

  const externals = await discoverPlugins()
  for (const plugin of externals) {
    await loadPlugin(plugin)
  }
}

loadBuiltinsSync()
void loadExternalPlugins()
