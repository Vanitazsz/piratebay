import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Profile, TrustTier } from '../types'
import { friendlyError, supabase } from '../lib/supabase'

const aliases = ['CrimsonPirate', 'HarborGhost', 'NightOwl', 'CaviteComet', 'CampusRover']
const randomAlias = () => `${aliases[Math.floor(Math.random() * aliases.length)]}_${Math.floor(1000 + Math.random() * 9000)}`
let guestSessionPromise: Promise<User | null> | null = null

function ensureGuestSession(): Promise<User | null> {
  if (!supabase) return Promise.resolve(null)
  if (!guestSessionPromise) {
    guestSessionPromise = (async () => {
      const { data, error } = await supabase!.auth.getSession()
      if (error) throw error
      if (data.session?.user) return data.session.user
      const { data: guest, error: signInError } = await supabase!.auth.signInAnonymously()
      if (signInError) throw signInError
      return guest.user
    })().catch((cause) => {
      guestSessionPromise = null
      throw cause
    })
  }
  return guestSessionPromise
}

function localProfile(): Profile {
  let alias = 'CrimsonPirate_8402'
  let school = 'LPU-Cavite'
  try {
    alias = localStorage.getItem('piratebay.alias') || randomAlias()
    school = localStorage.getItem('piratebay.school') || school
    localStorage.setItem('piratebay.alias', alias)
  } catch { /* Storage can be unavailable in private browsing. */ }
  return { id: 'demo-guest', alias, selected_school: school, trust_tier: 'guest' }
}

export type AuthState = {
  profile: Profile
  user: User | null
  loading: boolean
  connected: boolean
  error: string | null
  startAccountClaim: (email: string) => Promise<void>
  finishAccountClaim: (email: string, token: string, password: string) => Promise<void>
  linkGoogle: () => Promise<void>
  sendVerification: (email: string) => Promise<void>
  confirmVerification: (email: string, token: string) => Promise<void>
  refreshProfile: () => Promise<void>
  setSelectedSchool: (school: string) => Promise<void>
}

export function useAuthSession(): AuthState {
  const [profile, setProfile] = useState<Profile>(localProfile)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hydrateProfile = useCallback(async (id: string) => {
    if (!supabase) return
    const { data, error: selectError } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (selectError) throw selectError
    if (data) {
      setProfile(data as Profile)
      return
    }
    const profileToCreate = {
      id,
      alias: randomAlias(),
      selected_school: 'LPU-Cavite',
      trust_tier: 'guest',
    }
    const { data: inserted, error: insertError } = await supabase.from('profiles').insert(profileToCreate).select('*').single()
    if (insertError) {
      const { data: racedProfile } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
      if (racedProfile) { setProfile(racedProfile as Profile); return }
      throw insertError
    }
    setProfile(inserted as Profile)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user && supabase) await hydrateProfile(user.id)
  }, [hydrateProfile, user])

  useEffect(() => {
    let alive = true
    if (!supabase) { setLoading(false); return }

    void (async () => {
      try {
        const activeUser = await ensureGuestSession()
        if (activeUser) {
          if (alive) setUser(activeUser)
          await hydrateProfile(activeUser.id)
        }
      } catch (cause) {
        if (alive) setError(friendlyError(cause))
      } finally {
        if (alive) setLoading(false)
      }
    })()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setUser(session?.user ?? null)
      if (session?.user) window.setTimeout(() => { void hydrateProfile(session.user.id) }, 0)
    })
    return () => { alive = false; authListener.subscription.unsubscribe() }
  }, [hydrateProfile])

  const startAccountClaim = useCallback(async (email: string) => {
    if (!supabase || !user) throw new Error('Account upgrades need an active Supabase guest session.')
    const { error: updateError } = await supabase.auth.updateUser({ email })
    if (updateError) throw updateError
    setError(null)
  }, [user])

  const finishAccountClaim = useCallback(async (email: string, token: string, password: string) => {
    if (!supabase || !user) throw new Error('Account upgrades need an active Supabase guest session.')
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' })
    if (verifyError) throw verifyError
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) throw passwordError
    setError(null)
    await hydrateProfile(user.id)
  }, [hydrateProfile, user])

  const linkGoogle = useCallback(async () => {
    if (!supabase || !user) throw new Error('Google linking needs an active Supabase guest session.')
    const { data, error: linkError } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (linkError) throw linkError
    if (data.url) window.location.assign(data.url)
  }, [user])

  const sendVerification = useCallback(async (email: string) => {
    if (!email.toLowerCase().endsWith('.edu.ph')) throw new Error('Use your school email ending in .edu.ph.')
    if (!supabase || !user) throw new Error('Student verification needs an active Supabase guest session.')
    const { error: updateError } = await supabase.auth.updateUser({ email })
    if (updateError) throw updateError
    setError(null)
  }, [user])

  const confirmVerification = useCallback(async (email: string, token: string) => {
    if (!supabase || !user) throw new Error('Student verification needs an active Supabase guest session.')
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' })
    if (verifyError) throw verifyError
    setError(null)
    await hydrateProfile(user.id)
  }, [hydrateProfile, user])

  const setSelectedSchool = useCallback(async (school: string) => {
    const next = { ...profile, selected_school: school }
    setProfile(next)
    if (!supabase || !user) {
      try { localStorage.setItem('piratebay.school', school) } catch { /* ignore */ }
      return
    }
    const { error: updateError } = await supabase.from('profiles').update({ selected_school: school }).eq('id', user.id)
    if (updateError) { setProfile(profile); throw updateError }
  }, [profile, user])

  return {
    profile,
    user,
    loading,
    connected: Boolean(user && supabase),
    error,
    startAccountClaim,
    finishAccountClaim,
    linkGoogle,
    sendVerification,
    confirmVerification,
    refreshProfile,
    setSelectedSchool,
  }
}

export function isMember(tier: TrustTier): boolean { return tier !== 'guest' }
