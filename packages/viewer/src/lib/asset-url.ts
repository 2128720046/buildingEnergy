import { loadAssetUrl } from '@pascal-app/core'

export const ASSETS_CDN_URL = process.env.NEXT_PUBLIC_ASSETS_CDN_URL || ''

function resolveBundledItemUrl(url: string): string | null {
  const match = url.match(/\/items\/(?:system\/)?([^/?#]+)\/(model\.glb|thumbnail\.webp)(?:[?#].*)?$/)
  if (!match) return null
  return `/items/${match[1]}/${match[2]}`
}

function isRemoteUserAsset(url: string): boolean {
  return /\/storage\/v1\/object\/public\/items\/users\//.test(url)
}

/**
 * Resolves an asset URL to the appropriate format:
 * - If URL starts with http:// or https://, return as-is (external URL)
 * - If URL starts with asset://, resolve from IndexedDB storage
 * - If URL starts with /, prepend CDN URL (absolute path)
 * - Otherwise, prepend CDN URL (relative path)
 */
export async function resolveAssetUrl(url: string | undefined | null): Promise<string | null> {
  if (!url) return null

  if (url.startsWith('blob:') || url.startsWith('data:')) return url

  const bundledItemUrl = resolveBundledItemUrl(url)
  if (bundledItemUrl) return bundledItemUrl

  // External URL - use as-is, except uploaded item assets that cannot be
  // fetched in the offline energy-query shell.
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (isRemoteUserAsset(url)) return null
    return url
  }

  // IndexedDB asset - resolve from storage
  if (url.startsWith('asset://')) {
    return loadAssetUrl(url)
  }

  // Absolute or relative path - prepend CDN URL
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  return ASSETS_CDN_URL ? `${ASSETS_CDN_URL}${normalizedPath}` : normalizedPath
}

/**
 * Synchronous version for URLs that don't need IndexedDB resolution
 * Only use this if you're sure the URL is not an asset:// URL
 */
export function resolveCdnUrl(url: string | undefined | null): string | null {
  if (!url) return null

  if (url.startsWith('blob:') || url.startsWith('data:')) return url

  const bundledItemUrl = resolveBundledItemUrl(url)
  if (bundledItemUrl) return bundledItemUrl

  // External URL - use as-is, except uploaded item assets that cannot be
  // fetched in the offline energy-query shell.
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (isRemoteUserAsset(url)) return null
    return url
  }

  // Don't use this for asset:// URLs - use resolveAssetUrl instead
  if (url.startsWith('asset://')) {
    console.warn('Use resolveAssetUrl() for asset:// URLs, not resolveCdnUrl()')
    return null
  }

  // Absolute or relative path - prepend CDN URL
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  return ASSETS_CDN_URL ? `${ASSETS_CDN_URL}${normalizedPath}` : normalizedPath
}
