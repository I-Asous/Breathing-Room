import { Link, useLocation } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Atlas', exact: true },
  { to: '/predict', label: 'Predictive Modeling', exact: false },
  { to: '/home', label: 'Forums', exact: false },
]

export default function SiteHeader() {
  const { pathname } = useLocation()
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <h1 className="display text-lg leading-none">
          <Link to="/">Breathing Room</Link>
        </h1>
        <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Sections">
          {LINKS.map((item) => {
            const current = item.exact ? pathname === item.to : pathname.startsWith(item.to)
            return current ? (
              <span key={item.to} aria-current="page" className="text-sm">
                {item.label}
              </span>
            ) : (
              <Link key={item.to} to={item.to} className="text-sm underline underline-offset-4">
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
