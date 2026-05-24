import { get, set } from 'idb-keyval'

export const ASSET_PREFIX = 'asset_data:'

// Cache for active object URLs to prevent leaks and flickering
const urlCache = new Map<string, string>()

/**
 * Save a file to IndexedDB and return a custom protocol URL
 */
export async function saveAsset(file: File): Promise<string> {
  const id = crypto.randomUUID()
  await set(`${ASSET_PREFIX}${id}`, file)
  return `asset://${id}`
}

/**
 * Load a file from IndexedDB and return an object URL
 * If the URL is not a custom protocol URL, return it as is
 */
export async function loadAssetUrl(url: string): Promise<string | null> {
  if (!url) return null

  // If it's already a blob or http URL, return as is
  if (url.startsWith('blob:') || url.startsWith('http')) {
    return url
  }

  // Handle our custom asset protocol
  if (url.startsWith('asset://')) {
    const id = url.replace('asset://', '')

    // Check cache first
    if (urlCache.has(id)) {
      return urlCache.get(id)!
    }

    try {
      const file = await get<File | Blob>(`${ASSET_PREFIX}${id}`)
      if (!file) {
        console.warn(`Asset not found: ${id}`)
        return null
      }
      const objectUrl = URL.createObjectURL(file)
      urlCache.set(id, objectUrl)
      return objectUrl
    } catch (error) {
      console.error('Failed to load asset:', error)
      return null
    }
  }

  // Legacy data URLs are returned as is
  return url
}

/**
 * Retrieve a raw file/blob from IndexedDB by asset URL or ID.
 * Returns null if not found.
 */
export async function getAssetFile(assetUrlOrId: string): Promise<File | Blob | null> {
  const id = assetUrlOrId.startsWith('asset://')
    ? assetUrlOrId.replace('asset://', '')
    : assetUrlOrId

  try {
    const file = await get<File | Blob>(`${ASSET_PREFIX}${id}`)
    return file ?? null
  } catch {
    return null
  }
}

/**
 * Collect all unique asset:// IDs referenced in a scene nodes record.
 */
export function collectAssetIds(nodes: Record<string, unknown>): string[] {
  const ids = new Set<string>()

  for (const node of Object.values(nodes)) {
    if (!node || typeof node !== 'object') continue
    const url = (node as Record<string, unknown>).url
    if (typeof url === 'string' && url.startsWith('asset://')) {
      ids.add(url.replace('asset://', ''))
    }
  }

  return Array.from(ids)
}
