import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BadgeCheck, Compass, Globe2, LockKeyhole, MapPin, MessageCircle, Radio, Send, ShieldAlert, SkipForward, Sparkles, Users, X } from 'lucide-react'
import type { Profile } from '../types'
import { useRandomChat } from '../hooks/useRandomChat'
import { isSupabaseConfigured } from '../lib/supabase'

const interests = ['#AcadsRant', '#ThesisSurviving', '#Gaming', '#StudyBuddy', '#NightOwl']
type Props = { profile: Profile; chat: ReturnType<typeof useRandomChat>; onAccount: () => void }

function trustBadge(tier: string) {
  if (tier === 'verified_student') return <span className="pill gold"><BadgeCheck size={11} /> Verified</span>
  if (tier === 'registered') return <span className="pill crimson">Member</span>
  return <span className="pill">Guest</span>
}

export default function ChatScreen({ profile, chat, onAccount }: Props) {
  const [scope, setScope] = useState<'campus' | 'any'>('campus')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [skipConfirm, setSkipConfirm] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }) }, [chat.messages, chat.partnerTyping])

  function handleSend(event: FormEvent) {
    event.preventDefault()
    if (!message.trim()) return
    void chat.sendMessage(message)
    setMessage('')
    chat.setTyping(false)
  }

  function toggleInterest(tag: string) {
    setSelectedInterests((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])
  }

  async function saveChat() {
    if (profile.trust_tier === 'guest') { onAccount(); return }
    try {
      const mutual = await chat.saveChat()
      setFeedback(mutual ? 'You both saved this chat. It is now in your private history.' : 'Saved your side. If your match saves too, this chat will be kept.')
      window.setTimeout(() => setFeedback(null), 3500)
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Could not save this chat yet.')
      window.setTimeout(() => setFeedback(null), 3500)
    }
  }

  async function report() {
    try {
      await chat.reportAndDisconnect()
      setFeedback(isSupabaseConfigured ? 'Report sent. You have been disconnected.' : 'Preview mode: report action was not sent. You have been disconnected.')
    } catch (cause) {
      setFeedback(cause instanceof Error && cause.message.includes('duplicate') ? 'You already reported this match. You have been disconnected.' : 'Report could not be sent. You have been disconnected.')
    }
    window.setTimeout(() => setFeedback(null), 3200)
  }

  const searching = chat.phase === 'searching'
  const matched = chat.phase === 'matched' && chat.peer

  return <>
    <section className="section-intro">
      <div>
        <div className="eyebrow">The late-night line</div>
        <h1 className="page-title">Say hi to a stranger.</h1>
        <p className="page-subtitle">Little conversations make a big campus feel closer. No profile needed to start.</p>
      </div>
      {isSupabaseConfigured ? <span className="pill online-pill"><span className="live-dot" />{chat.onlineCount} students around</span> : <span className="pill">Preview lobby</span>}
    </section>

    <section className="chat-layout">
      <div className="surface chat-control">
        <div className="control-top">
          <span className="eyebrow">Roulette chat</span>
          <span className="stat-line"><Radio size={14} /> {isSupabaseConfigured ? <><strong>{chat.onlineCount}</strong><span>online</span></> : <span>Preview mode</span>}</span>
        </div>
        <h2 className="chat-heading">Same campus.<br />Different stories.</h2>
        <p className="chat-copy">A random, one-on-one conversation with a fellow student. Messages disappear when the chat ends, unless you both choose to save.</p>

        <div className="choice-label">Who do you want to meet?</div>
        <div className="scope-choices">
          <button className={`scope-choice ${scope === 'campus' ? 'selected' : ''}`} onClick={() => setScope('campus')}>
            <MapPin size={16} /><span><span className="choice-title">My campus</span><span className="choice-hint">{profile.selected_school}</span></span>
          </button>
          <button className={`scope-choice ${scope === 'any' ? 'selected' : ''}`} onClick={() => setScope('any')}>
            <Globe2 size={16} /><span><span className="choice-title">Any campus</span><span className="choice-hint">Meet across schools</span></span>
          </button>
        </div>

        <div className="choice-label">Pick a shared vibe <span className="muted">· optional</span></div>
        <div className="tag-row">
          {interests.map((tag) => <button key={tag} className={`interest-chip ${selectedInterests.includes(tag) ? 'active' : ''}`} onClick={() => toggleInterest(tag)}>{tag}</button>)}
        </div>

        <button className={`primary-button search-cta ${searching ? 'secondary-button' : ''}`} onClick={() => searching ? void chat.stop() : matched ? setSkipConfirm(true) : void chat.startSearch(scope, selectedInterests)}>
          {searching ? <><span className="searching-pulse" />Finding your person… <X size={14} /></> : matched ? <><Compass size={16} />Find another person</> : <><Sparkles size={15} />Find my person</>}
        </button>
        <p className="privacy-note"><LockKeyhole size={12} />Your conversation is private and ephemeral. Report anyone who makes you uncomfortable.</p>
      </div>

      <div className="surface chat-window">
        <div className="chat-window-head">
          {matched ? <div className="chat-peer">
            <span className="peer-avatar"><MessageCircle size={18} /></span>
            <span><span className="peer-name">{chat.peer!.alias}</span><span className="peer-info"><MapPin size={10} />{chat.peer!.school}<span>·</span>{trustBadge(chat.peer!.tier)}</span></span>
          </div> : <div className="chat-peer">
            <span className="peer-avatar"><MessageCircle size={18} /></span>
            <span><span className="peer-name">Your next campus pal</span><span className="peer-info">{searching ? 'Checking who’s around…' : 'Waiting at the other end of the line'}</span></span>
          </div>}
          {matched && <div className="chat-actions">
            <button className="chat-action" title="Skip this chat" aria-label="Skip chat" onClick={() => setSkipConfirm(true)}><SkipForward size={15} /></button>
            <button className="chat-action danger" title="Report and disconnect" aria-label="Report and disconnect" onClick={() => void report()}><ShieldAlert size={15} /></button>
          </div>}
        </div>

        <div className="chat-body" ref={bodyRef}>
          {!matched ? <div className="empty-chat"><div className="empty-chat-inner">
            <div className="empty-emblem"><Users size={25} /></div>
            <h3>{searching ? 'Scanning the campus…' : 'The next story starts here.'}</h3>
            <p>{searching ? 'We’ll connect you as soon as someone with your vibe is around.' : 'Choose your campus and a shared interest, then step into a fresh conversation.'}</p>
          </div></div> : <>
            <div className="system-note">You’re connected · messages aren’t stored by default</div>
            {chat.messages.map((item) => <div key={item.id} className={`message-row ${item.senderId === profile.id ? 'mine' : ''}`}>
              <div className="message-byline">{item.senderId === profile.id ? 'You' : item.alias}</div>
              <div className="message-bubble">{item.text}</div>
              <div className="message-time">{new Date(item.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
            </div>)}
            {chat.partnerTyping && <span className="typing">{chat.peer!.alias} is typing…</span>}
          </>}
        </div>

        <form className="chat-composer" onSubmit={handleSend}>
          <div className="chat-input-wrap"><input className="chat-input" value={message} onChange={(event) => { setMessage(event.target.value); chat.setTyping(Boolean(event.target.value)) }} placeholder={matched ? 'Write something kind…' : 'Your message will be ready after a match'} disabled={!matched} maxLength={1000} /></div>
          <button className="send-button" aria-label="Send message" disabled={!matched || !message.trim()}><Send size={16} /></button>
        </form>
        <div className="chat-footer">
          <span>{matched ? 'Be kind · Be curious' : 'No login needed to chat'}</span>
          {matched && <button className="save-chat-button" onClick={() => void saveChat()}>
            {chat.chatSaved ? '✓ Saved privately' : chat.selfSaved ? 'Waiting for mutual save…' : profile.trust_tier === 'guest' ? 'Register to save this chat' : 'Reveal & save chat'}
          </button>}
        </div>
      </div>
    </section>

    {skipConfirm && matched && <div className="modal-backdrop" role="presentation" onClick={() => setSkipConfirm(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="skip-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><h2 id="skip-title">Leave this conversation?</h2><p>You’ll disconnect and can be matched with someone new.</p></div><button className="close-button" onClick={() => setSkipConfirm(false)} aria-label="Close"><X size={15} /></button></div>
        <div className="form-actions"><button className="secondary-button" onClick={() => setSkipConfirm(false)}>Keep chatting</button><button className="primary-button" onClick={() => { setSkipConfirm(false); void chat.skip() }}>Skip to next <SkipForward size={14} /></button></div>
      </div>
    </div>}
    {feedback && <div className="toast" role="status">{feedback}</div>}
  </>
}
