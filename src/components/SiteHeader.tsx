import { Link, useLocation } from 'react-router-dom'
import '@/alarm.css'

const LINKS = [
  { to: '/', label: 'Atlas', exact: true },
  { to: '/cost', label: 'True cost', exact: false },
  { to: '/listings', label: 'Listings', exact: false },
  { to: '/home', label: 'Forums', exact: false },
  { to: '/predict', label: 'Predictive Modeling', exact: false },
]

export default function SiteHeader() {
  const { pathname } = useLocation()
  return (
    <header className="alarm-bar">
      <div className="alarm-bar-inner">
        <Link to="/" className="alarm-mark">
          Breathing Room
        </Link>
        <nav className="alarm-nav" aria-label="Sections">
          {LINKS.map((item) => {
            const current = item.exact ? pathname === item.to : pathname.startsWith(item.to)
            return current ? (
              <span key={item.to} aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
