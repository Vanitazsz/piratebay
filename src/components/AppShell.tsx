import { useState, type ReactNode } from 'react'
import { Anchor, ChevronDown, MessageCircle, Moon, Quote, ShoppingBag, Sun, Download } from 'lucide-react'
import type { Profile } from '../types'

export type Screen = 'chat' | 'wall' | 'market'
export type CampusScope = 'LPU-Cavite' | 'All Campuses'

type Props = {
  children: ReactNode
  screen: Screen
  setScreen: (screen: Screen) => void
  profile: Profile
  scope: CampusScope
  setScope: (scope: CampusScope) => void
  lightMode: boolean
  toggleTheme: () => void
  onAccount: () => void
  canInstall: boolean
  onInstall: () => void
}

const navItems: { id: Screen; label: string; icon: typeof MessageCircle }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'wall', label: 'Wall', icon: Quote },
  { id: 'market', label: 'Market', icon: ShoppingBag },
]

export default function AppShell({ children, screen, setScreen, profile, scope, setScope, lightMode, toggleTheme, onAccount, canInstall, onInstall }: Props) {
  const [scopeOpen, setScopeOpen] = useState(false)
  const tierLabel = profile.trust_tier === 'verified_student' ? 'Verified student' : profile.trust_tier === 'registered' ? 'Member' : 'Guest'
  const initials = profile.alias.slice(0, 1).toUpperCase()

  return <div className={`app ${lightMode ? 'light' : ''}`}>
    <header className="topbar shell">
      <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setScreen('chat') }} aria-label="PirateBay home">
        <span className="brand-mark"><Anchor size={19} strokeWidth={2.3} /></span>
        <span><span className="brand-word">piratebay</span><br /><span className="brand-sub">campus after hours</span></span>
      </a>

      <nav className="desktop-nav" aria-label="Main navigation">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}>
          <Icon size={16} /><span>{label}</span>
        </button>)}
      </nav>

      <div className="topbar-mid">
        <div className="scope-wrap">
          <button className="scope-pill" onClick={() => setScopeOpen((open) => !open)} aria-expanded={scopeOpen}>
            <span className="scope-dot" />{scope === 'LPU-Cavite' ? 'LPU-Cavite' : 'All campuses'}<ChevronDown size={14} />
          </button>
          {scopeOpen && <div className="scope-menu">
            {(['LPU-Cavite', 'All Campuses'] as CampusScope[]).map((option) => <button key={option} className={`scope-option ${scope === option ? 'selected' : ''}`} onClick={() => { setScope(option); setScopeOpen(false) }}>
              <span>{option}</span><small>{option === 'LPU-Cavite' ? 'Flagship campus' : 'Inter-school'}</small>
            </button>)}
          </div>}
        </div>
        <button className="icon-button" onClick={toggleTheme} aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'} title="Toggle theme">
          {lightMode ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        {canInstall && <button className="icon-button install" onClick={onInstall} aria-label="Install PirateBay" title="Install app"><Download size={15} /></button>}
        <button className="account-pill" onClick={onAccount} aria-label={`Account: ${profile.alias}, ${tierLabel}`}>
          <span className="avatar">{initials}</span>
          <span className="account-copy"><span className="account-name">{profile.alias}</span><span className={`account-tier ${profile.trust_tier === 'verified_student' ? 'verified-text' : ''}`}>{tierLabel}</span></span>
        </button>
      </div>
    </header>
    <main className="main shell">{children}</main>
    <nav className="bottom-nav" aria-label="Bottom navigation">
      {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)} aria-current={screen === id ? 'page' : undefined}>
        <Icon size={18} strokeWidth={screen === id ? 2.3 : 1.9} /><span className="mobile-label">{label}</span>
      </button>)}
    </nav>
  </div>
}
