'use client'

import { AutoModelingImporter } from '@pascal-app/editor'

export function AutoModelingTab() {
  return (
    <div className="h-full overflow-auto p-4">
      <AutoModelingImporter />
    </div>
  )
}

export default AutoModelingTab