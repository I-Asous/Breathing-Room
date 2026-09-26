import { Navigate, useSearchParams } from 'react-router-dom'

/** The neighborhood forums live on the field desk. */
export default function ChatRedirect() {
  const [params] = useSearchParams()
  const id = params.get('n')
  return <Navigate to={id ? `/home?n=${id}` : '/home'} replace />
}
