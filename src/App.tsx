import { useEffect, useState } from 'react'
import AppShell, { type CampusScope, type Screen } from './components/AppShell'
import ChatScreen from './components/ChatScreen'
import WallScreen from './components/WallScreen'
import MarketScreen from './components/MarketScreen'
import AccountModal from './components/AccountModal'
import { useAuthSession } from './hooks/useAuthSession'
import { useRandomChat } from './hooks/useRandomChat'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function App() {
  const auth = useAuthSession()
  const [screen, setScreen] = useState<Screen>('chat')
  const [scope, setScope] = useState<CampusScope>(() => {
    try { return localStorage.getItem('piratebay.scope') === 'All Campuses' ? 'All Campuses' : 'LPU-Cavite' } catch { return 'LPU-Cavite' }
  })
  const [lightMode, setLightMode] = useState(() => {
    try { return localStorage.getItem('piratebay.theme') === 'light' } catch { return false }
  })
  const [accountOpen, setAccountOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const chat = useRandomChat(auth.profile.id, auth.profile.alias, auth.profile.selected_school, auth.profile.trust_tier)

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handleInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleInstall)
  }, [])

  function changeScope(next: CampusScope) {
    setScope(next)
    try { localStorage.setItem('piratebay.scope', next) } catch { /* ignore */ }
  }

  function toggleTheme() {
    setLightMode((current) => {
      const next = !current
      try { localStorage.setItem('piratebay.theme', next ? 'light' : 'dark') } catch { /* ignore */ }
      return next
    })
  }

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3500)
  }

  return <AppShell screen={screen} setScreen={setScreen} profile={auth.profile} scope={scope} setScope={changeScope} lightMode={lightMode} toggleTheme={toggleTheme} onAccount={() => setAccountOpen(true)} canInstall={Boolean(installPrompt)} onInstall={() => void installApp()}>
    <section hidden={screen !== 'chat'}><ChatScreen profile={auth.profile} chat={chat} onAccount={() => setAccountOpen(true)} /></section>
    <section hidden={screen !== 'wall'}><WallScreen profile={auth.profile} scope={scope} onToast={showToast} /></section>
    <section hidden={screen !== 'market'}><MarketScreen profile={auth.profile} scope={scope} onAccount={() => setAccountOpen(true)} onToast={showToast} /></section>
    {accountOpen && <AccountModal auth={auth} onClose={() => setAccountOpen(false)} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </AppShell>
}
