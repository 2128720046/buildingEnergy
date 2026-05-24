import { HostWorkbench } from '@/features/host-shell'
import type { HostWorkspace } from '@/features/host-shell/lib/host-workspaces'

const WORKSPACES = new Set<HostWorkspace>(['energy-query', 'data-analysis', 'smart-operations'])

interface HomeProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home({ searchParams }: HomeProps) {
  const params = (await searchParams) ?? {}
  const rawWorkspace = Array.isArray(params.workspace) ? params.workspace[0] : params.workspace
  const initialWorkspace = WORKSPACES.has(rawWorkspace as HostWorkspace)
    ? (rawWorkspace as HostWorkspace)
    : 'energy-query'

  return (
    <HostWorkbench
      apiBaseUrl={process.env.NEXT_PUBLIC_EDITOR_API_BASE_URL}
      initialWorkspace={initialWorkspace}
    />
  )
}
