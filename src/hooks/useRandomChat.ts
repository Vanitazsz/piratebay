import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { TrustTier } from '../types'

export type ChatPeer = { userId: string; alias: string; school: string; tier: TrustTier }
export type ChatMessage = { id: string; senderId: string; alias: string; text: string; sentAt: string }
type PresenceEntry = { userId: string; alias: string; school: string; tier: TrustTier; searching: boolean; scope: 'campus' | 'any'; interests: string[]; joinedAt: number }

function canMatch(a: PresenceEntry, b: PresenceEntry) {
  const campusOkay = a.scope === 'any' || b.scope === 'any' || a.school === b.school
  const interestsOkay = !a.interests.length || !b.interests.length || a.interests.some((tag) => b.interests.includes(tag))
  return campusOkay && interestsOkay
}

function pickPair(entries: PresenceEntry[], selfId: string): PresenceEntry | undefined {
  const sorted = [...entries].sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))
  const used = new Set<string>()
  for (const person of sorted) {
    if (used.has(person.userId) || !person.searching) continue
    const partner = sorted.find((candidate) => candidate.userId !== person.userId && !used.has(candidate.userId) && candidate.searching && canMatch(person, candidate))
    if (partner) {
      used.add(person.userId); used.add(partner.userId)
      if (person.userId === selfId) return partner
      if (partner.userId === selfId) return person
    }
    used.add(person.userId)
  }
  return undefined
}

export function useRandomChat(userId: string, alias: string, school: string, tier: TrustTier) {
  const [phase, setPhase] = useState<'idle' | 'searching' | 'matched'>('idle')
  const [peer, setPeer] = useState<ChatPeer | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [selfSaved, setSelfSaved] = useState(false)
  const [partnerSaved, setPartnerSaved] = useState(false)
  const [chatSaved, setChatSaved] = useState(false)
  const phaseRef = useRef(phase)
  const lobbyRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const lobbyReadyRef = useRef(false)
  const roomRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const demoTimer = useRef<number | null>(null)
  const typingTimer = useRef<number | null>(null)
  const typingRef = useRef(false)
  const selfRef = useRef<PresenceEntry>({ userId, alias, school, tier, searching: false, scope: 'campus', interests: [], joinedAt: Date.now() })

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => {
    selfRef.current = { ...selfRef.current, userId, alias, school, tier }
  }, [userId, alias, school, tier])

  const closeRoom = useCallback(() => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingRef.current = false
    if (roomRef.current && supabase) void supabase.removeChannel(roomRef.current)
    roomRef.current = null
  }, [])

  const establishRoom = useCallback((candidate: PresenceEntry) => {
    if (!supabase || !lobbyRef.current || roomRef.current || candidate.userId === userId) return
    const room = `room:${[userId, candidate.userId].sort().join(':')}`
    const channel = supabase.channel(room, { config: { private: true, broadcast: { ack: true, self: false } } })
    roomRef.current = channel
    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => setMessages((items) => [...items, payload as ChatMessage]))
      .on('broadcast', { event: 'typing' }, ({ payload }) => setPartnerTyping(Boolean((payload as { typing?: boolean }).typing)))
      .on('broadcast', { event: 'leave' }, () => {
        setPeer(null); setMessages([]); setSelfSaved(false); setPartnerSaved(false); setChatSaved(false)
        setPhase('searching'); selfRef.current.searching = true; void lobbyRef.current?.track(selfRef.current)
      })
      .on('broadcast', { event: 'reveal' }, ({ payload }) => {
        const data = payload as { userId?: string; mutualSaved?: boolean }
        if (data.userId !== userId) {
          setPartnerSaved(true)
          if (data.mutualSaved) setChatSaved(true)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          selfRef.current.searching = false
          await lobbyRef.current?.track(selfRef.current)
          setPeer({ userId: candidate.userId, alias: candidate.alias, school: candidate.school, tier: candidate.tier })
          setMessages([]); setSelfSaved(false); setPartnerSaved(false); setChatSaved(false)
          setPhase('matched')
        }
      })
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId || userId === 'demo-guest') return
    let active = true
    const lobby = supabase.channel('roulette-lobby', { config: { presence: { key: userId } } })
    lobbyRef.current = lobby
    lobbyReadyRef.current = false
    lobby.on('presence', { event: 'sync' }, () => {
      if (!active) return
      const state = lobby.presenceState<PresenceEntry>()
      const entries = Object.values(state).flat()
      setOnlineCount(Math.max(1, entries.length))
      if (phaseRef.current === 'searching') {
        const partner = pickPair(entries, userId)
        if (partner) establishRoom(partner)
      }
    })
    lobby.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        lobbyReadyRef.current = true
        await lobby.track(selfRef.current)
      }
    })
    return () => { active = false; lobbyReadyRef.current = false; void supabase?.removeChannel(lobby); closeRoom() }
  }, [userId, closeRoom, establishRoom])

  const startSearch = useCallback(async (scope: 'campus' | 'any', interests: string[]) => {
    if (!supabase || userId === 'demo-guest') {
      setPhase('searching')
      const selected = scope === 'campus' ? school : 'CavSU'
      if (demoTimer.current) window.clearTimeout(demoTimer.current)
      demoTimer.current = window.setTimeout(() => {
        setPeer({ userId: 'demo-pal', alias: scope === 'campus' ? 'HarborGhost_118' : 'StudyComet_721', school: selected, tier: 'registered' })
        setPhase('matched')
        setMessages([{ id: crypto.randomUUID(), senderId: 'demo-pal', alias: scope === 'campus' ? 'HarborGhost_118' : 'StudyComet_721', text: 'Hey! Glad we matched. What’s keeping you up tonight?', sentAt: new Date().toISOString() }])
      }, 1500)
      return
    }
    selfRef.current = { userId, alias, school, tier, searching: true, scope, interests, joinedAt: Date.now() }
    setPhase('searching')
    if (lobbyReadyRef.current) await lobbyRef.current?.track(selfRef.current)
  }, [alias, school, tier, userId])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const message: ChatMessage = { id: crypto.randomUUID(), senderId: userId, alias, text: trimmed, sentAt: new Date().toISOString() }
    setMessages((items) => [...items, message])
    if (roomRef.current) await roomRef.current.send({ type: 'broadcast', event: 'message', payload: message })
    else if (userId === 'demo-guest' && peer) {
      if (demoTimer.current) window.clearTimeout(demoTimer.current)
      demoTimer.current = window.setTimeout(() => setMessages((items) => [...items, {
        id: crypto.randomUUID(), senderId: peer.userId, alias: peer.alias,
        text: 'That makes sense. Campus has a way of making even the small stuff feel like a whole story.', sentAt: new Date().toISOString(),
      }]), 900)
    }
  }, [alias, peer, userId])

  const setTyping = useCallback((typing: boolean) => {
    if (!roomRef.current) return
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    if (typingRef.current !== typing) {
      typingRef.current = typing
      void roomRef.current.send({ type: 'broadcast', event: 'typing', payload: { typing } })
    }
    if (typing) typingTimer.current = window.setTimeout(() => {
      typingRef.current = false
      void roomRef.current?.send({ type: 'broadcast', event: 'typing', payload: { typing: false } })
    }, 1800)
  }, [])

  const skip = useCallback(async () => {
    if (roomRef.current) await roomRef.current.send({ type: 'broadcast', event: 'leave', payload: { userId } })
    closeRoom(); setPeer(null); setMessages([]); setPartnerTyping(false); setSelfSaved(false); setPartnerSaved(false); setChatSaved(false)
    selfRef.current.searching = true
    setPhase('searching')
    if (lobbyReadyRef.current && lobbyRef.current) await lobbyRef.current.track(selfRef.current)
    else if (userId === 'demo-guest') {
      if (demoTimer.current) window.clearTimeout(demoTimer.current)
      demoTimer.current = window.setTimeout(() => {
        setPeer({ userId: 'demo-pal-2', alias: 'NightOwl_664', school, tier: 'guest' })
        setMessages([{ id: crypto.randomUUID(), senderId: 'demo-pal-2', alias: 'NightOwl_664', text: 'Hey, how’s your night going?', sentAt: new Date().toISOString() }])
        setPhase('matched')
      }, 1200)
    }
  }, [closeRoom, school, userId])

  const stop = useCallback(async () => {
    if (demoTimer.current) window.clearTimeout(demoTimer.current)
    if (roomRef.current) await roomRef.current.send({ type: 'broadcast', event: 'leave', payload: { userId } })
    closeRoom(); setPeer(null); setMessages([]); setPartnerTyping(false); setSelfSaved(false); setPartnerSaved(false); setChatSaved(false); setPhase('idle')
    selfRef.current.searching = false
    if (lobbyReadyRef.current && lobbyRef.current) await lobbyRef.current.track(selfRef.current)
  }, [closeRoom, userId])

  const reportAndDisconnect = useCallback(async (reason = 'Inappropriate behavior') => {
    let reportError: unknown = null
    if (supabase && userId !== 'demo-guest' && peer) {
      const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: 'chat_user', target_id: peer.userId, reason })
      reportError = error
    }
    await stop()
    if (reportError) throw reportError
  }, [peer, stop, userId])

  const reveal = useCallback(async () => {
    if (roomRef.current) await roomRef.current.send({ type: 'broadcast', event: 'reveal', payload: { userId } })
  }, [userId])

  const saveChat = useCallback(async () => {
    if (!peer || !supabase || userId === 'demo-guest') return false
    const { data, error } = await supabase.rpc('save_chat', {
      p_other: peer.userId,
      p_messages: messages.map((message) => ({ id: message.id, senderId: message.senderId, alias: message.alias, text: message.text, sentAt: message.sentAt })),
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : data
    const mutual = Boolean((result as { mutual_saved?: boolean } | null)?.mutual_saved)
    setSelfSaved(true)
    if (mutual) setChatSaved(true)
    if (roomRef.current) await roomRef.current.send({ type: 'broadcast', event: 'reveal', payload: { userId, mutualSaved: mutual } })
    return mutual
  }, [messages, peer, userId])

  return { phase, peer, messages, onlineCount, partnerTyping, selfSaved, partnerSaved, chatSaved, startSearch, sendMessage, setTyping, skip, stop, reportAndDisconnect, reveal, saveChat }
}
