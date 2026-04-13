import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const env = process.env

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isDevelopment =
  env.NODE_ENV === 'development' || env.NEXT_PUBLIC_VERCEL_ENV === 'development'

export const isProduction =
  env.NODE_ENV === 'production' || env.NEXT_PUBLIC_VERCEL_ENV === 'production'

export const isPreview = env.NEXT_PUBLIC_VERCEL_ENV === 'preview'

/**
 * Base URL for the application
 * Uses NEXT_PUBLIC_* variables which are available at build time
 */
export const BASE_URL = (() => {
  // Development: localhost
  if (isDevelopment) {
    return env.NEXT_PUBLIC_APP_URL || `http://localhost:${env.PORT || 3000}`
  }

  // Preview deployments: use Vercel branch URL
  if (isPreview && env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${env.NEXT_PUBLIC_VERCEL_URL}`
  }

  // Production: use custom domain or Vercel production URL
  if (isProduction) {
    return (
      env.NEXT_PUBLIC_APP_URL ||
      (env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
        : 'https://editor.pascal.app')
    )
  }

  // Fallback (should never reach here in normal operation)
  return env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
})()
