import { HostWorkbench } from '@/features/host-shell'

export default function Home() {
  return <HostWorkbench apiBaseUrl={process.env.NEXT_PUBLIC_EDITOR_API_BASE_URL} />
}
