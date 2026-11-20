import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, Calculator, Camera, Check, Home, MapPin, MessageCircle, Package, Palette, Plus, Search, Send, Shirt, ShoppingBag, Utensils, X } from 'lucide-react'
import type { Listing, Profile } from '../types'
import type { CampusScope } from './AppShell'
import { compressAndUpload } from '../lib/uploadImage'
import { friendlyError, supabase } from '../lib/supabase'

const categories = ['Textbooks & Manuals', 'Uniforms & PE', 'Electronics & Calculators', 'Dorm & Condo', 'Food & Snacks', 'Services/Commissions']
const meetups: Record<string, string[]> = {
  'LPU-Cavite': ['Main Gate', 'SOT Lobby', 'JPL Hall', 'Phase 2 Canteen'],
  'DLSU-D': ['Main Gate', 'U Mall', 'Aklatang Emilio Aguinaldo'],
  CavSU: ['Main Gate', 'Student Center', 'Library'],
  'General / Other': ['Public campus entrance', 'Nearby cafe'],
}
const tones = ['red', 'blue', 'gold', 'green', 'purple', 'orange']
const seedListings: Listing[] = [
  { id: 'market-1', seller_id: 'seller-1', alias: 'HarborGhost_118', school_name: 'LPU-Cavite', title: 'Calculus: Early Transcendentals', description: '8th edition. Some highlighting, all pages intact.', price_php: 480, category: 'Textbooks & Manuals', condition: 'Used', meetup_spot: 'SOT Lobby', images: [], status: 'available', created_at: new Date().toISOString(), visual: 'blue' },
  { id: 'market-2', seller_id: 'seller-2', alias: 'MikaAfterHours', school_name: 'LPU-Cavite', title: 'LPU PE uniform · Medium', description: 'Worn once, freshly washed. Medium size.', price_php: 350, category: 'Uniforms & PE', condition: 'Like New', meetup_spot: 'Main Gate', images: [], status: 'available', created_at: new Date().toISOString(), visual: 'red' },
  { id: 'market-3', seller_id: 'seller-3', alias: 'CaviteComet_33', school_name: 'DLSU-D', title: 'Casio fx-991EX ClassWiz', description: 'Works perfectly. Includes hard case and manual.', price_php: 950, category: 'Electronics & Calculators', condition: 'Like New', meetup_spot: 'U Mall', images: [], status: 'available', created_at: new Date().toISOString(), visual: 'green' },
  { id: 'market-4', seller_id: 'seller-4', alias: 'PaperCrane_617', school_name: 'LPU-Cavite', title: 'Dorm desk lamp with USB port', description: 'Warm and cool light modes with a small USB charging port.', price_php: 420, category: 'Dorm & Condo', condition: 'Used', meetup_spot: 'Phase 2 Canteen', images: [], status: 'reserved', created_at: new Date().toISOString(), visual: 'gold' },
  { id: 'market-5', seller_id: 'seller-5', alias: 'StudyComet_721', school_name: 'CavSU', title: 'Hand-painted org stickers', description: 'Custom mini sticker set. Can make a batch for your org!', price_php: 80, category: 'Services/Commissions', condition: 'New', meetup_spot: 'Main Gate', images: [], status: 'available', created_at: new Date().toISOString(), visual: 'purple' },
  { id: 'market-6', seller_id: 'seller-6', alias: 'NightOwl_664', school_name: 'LPU-Cavite', title: 'Cookie box · 6 pieces', description: 'Chocolate chip and matcha. Baked fresh each Thursday.', price_php: 160, category: 'Food & Snacks', condition: 'New', meetup_spot: 'JPL Hall', images: [], status: 'available', created_at: new Date().toISOString(), visual: 'orange' },
]

function iconFor(category: string) {
  if (category.includes('Textbook')) return <BookOpen size={34} />
  if (category.includes('Uniform')) return <Shirt size={34} />
  if (category.includes('Electronics')) return <Calculator size={34} />
  if (category.includes('Dorm')) return <Home size={34} />
  if (category.includes('Food')) return <Utensils size={34} />
  if (category.includes('Services')) return <Palette size={34} />
  return <Package size={34} />
}

function statusLabel(status: Listing['status']) {
  if (status === 'reserved') return <span className="pill crimson">Reserved</span>
  if (status === 'sold') return <span className="pill">Sold</span>
  return <span className="pill online-pill">Available</span>
}

type Props = { profile: Profile; scope: CampusScope; onAccount: () => void; onToast: (message: string) => void }
type ThreadMessage = { id: string; sender_id: string; receiver_id?: string; content: string; created_at: string }

export default function MarketScreen({ profile, scope, onAccount, onToast }: Props) {
  const [listings, setListings] = useState<Listing[]>(seedListings)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [campus, setCampus] = useState(scope === 'All Campuses' ? 'Nearby / All' : profile.selected_school)
  const [maxPrice, setMaxPrice] = useState('')
  const [listingOpen, setListingOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [newCategory, setNewCategory] = useState(categories[0])
  const [condition, setCondition] = useState<'New' | 'Like New' | 'Used'>('Like New')
  const [meetup, setMeetup] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [inquiry, setInquiry] = useState<Listing | null>(null)
  const [threadPeerId, setThreadPeerId] = useState<string | null>(null)
  const [sellerPeers, setSellerPeers] = useState<{ id: string; label: string }[]>([])
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [draft, setDraft] = useState('')
  const [threadLoading, setThreadLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!supabase || profile.id === 'demo-guest') return
    let active = true
    void (async () => {
      const { data, error } = await supabase!.from('market_listings').select('*, profiles(alias)').order('created_at', { ascending: false })
      if (!active || error || !data) return
      setListings(data.map((row: any) => ({ id: row.id, seller_id: row.seller_id, alias: row.profiles?.alias ?? 'Campus Seller', school_name: row.school_name, title: row.title, description: row.description, price_php: Number(row.price_php), category: row.category, condition: row.condition, meetup_spot: row.meetup_spot, images: row.images ?? [], status: row.status, created_at: row.created_at, visual: tones[row.title.length % tones.length] })))
    })()
    return () => { active = false }
  }, [profile.id])

  useEffect(() => { setCampus(scope === 'All Campuses' ? 'Nearby / All' : profile.selected_school) }, [scope, profile.selected_school])

  useEffect(() => {
    if (!listingOpen || !previews.length) return
    return () => previews.forEach((url) => URL.revokeObjectURL(url))
  }, [listingOpen, previews])

  useEffect(() => {
    if (!inquiry || !supabase || profile.id === 'demo-guest' || inquiry.id.startsWith('market-')) {
      if (inquiry) setMessages([])
      return
    }
    let active = true
    setThreadLoading(true)
    const { id: listingId, seller_id: sellerId } = inquiry
    const channel = supabase.channel(`market-thread:${listingId}:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'market_messages', filter: `listing_id=eq.${listingId}` }, (payload) => {
        const row = payload.new as ThreadMessage & { receiver_id: string }
        if (row.sender_id !== profile.id && row.receiver_id !== profile.id) return
        if (sellerId === profile.id && threadPeerId && row.sender_id !== threadPeerId && row.receiver_id !== threadPeerId) return
        setMessages((current) => current.some((item) => item.id === row.id) ? current : [...current, row])
      }).subscribe()
    void supabase.from('market_messages').select('id, sender_id, content, created_at, receiver_id').eq('listing_id', listingId).or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`).order('created_at')
      .then(async ({ data }) => {
        if (active && data) {
          const rows = data as any[]
          if (sellerId === profile.id) {
            const peerIds = [...new Set(rows.map((row) => row.sender_id === profile.id ? row.receiver_id : row.sender_id).filter(Boolean))] as string[]
            const { data: profiles } = peerIds.length ? await supabase!.from('profiles').select('id, alias').in('id', peerIds) : { data: [] }
            if (!active) return
            setSellerPeers(peerIds.map((id) => ({ id, label: profiles?.find((person: any) => person.id === id)?.alias ?? `Buyer ${id.slice(0, 4)}` })))
            if (peerIds[0]) setThreadPeerId((current) => current ?? peerIds[0])
          }
          const activePeer = sellerId === profile.id ? threadPeerId : sellerId
          setMessages(rows.filter((row) => !activePeer || row.sender_id === activePeer || row.receiver_id === activePeer).map((row) => ({ id: row.id, sender_id: row.sender_id, receiver_id: row.receiver_id, content: row.content, created_at: row.created_at })))
        }
        setThreadLoading(false)
      })
    return () => { active = false; void supabase?.removeChannel(channel) }
  }, [inquiry, profile.id, threadPeerId])

  const filtered = useMemo(() => listings.filter((item) => {
    const textMatch = !query.trim() || `${item.title} ${item.description} ${item.alias}`.toLowerCase().includes(query.toLowerCase())
    const categoryMatch = category === 'All categories' || item.category === category
    const campusMatch = campus === 'Nearby / All' || item.school_name === campus
    const priceMatch = !maxPrice || item.price_php <= Number(maxPrice)
    return textMatch && categoryMatch && campusMatch && priceMatch
  }), [listings, query, category, campus, maxPrice])

  function changePhotos(files: FileList | null) {
    if (!files) return
    const selected = Array.from(files).slice(0, 3)
    setPhotos(selected); setPreviews(selected.map((file) => URL.createObjectURL(file)))
  }

  function openListingForm() {
    if (profile.trust_tier === 'guest') { onAccount(); return }
    setMeetup(meetups[profile.selected_school]?.[0] ?? meetups['General / Other'][0])
    setListingOpen(true)
  }

  async function createListing(event: FormEvent) {
    event.preventDefault(); setFormError(null)
    const amount = Number(price)
    if (!title.trim() || !description.trim() || !Number.isFinite(amount) || amount < 0) { setFormError('Add a title, description, and a valid price.'); return }
    if (profile.trust_tier === 'guest') { setFormError('Register your account before listing items.'); return }
    setSaving(true)
    try {
      let imageUrls: string[] = previews
      if (supabase && profile.id !== 'demo-guest') imageUrls = await Promise.all(photos.map((photo) => compressAndUpload(photo, 'market', profile.id)))
      const newItem: Listing = {
        id: crypto.randomUUID(), seller_id: profile.id, alias: profile.alias, school_name: profile.selected_school,
        title: title.trim(), description: description.trim(), price_php: amount, category: newCategory, condition,
        meetup_spot: meetup, images: imageUrls, status: 'available', created_at: new Date().toISOString(), visual: tones[Math.floor(Math.random() * tones.length)],
      }
      if (supabase && profile.id !== 'demo-guest') {
        const { data, error } = await supabase.from('market_listings').insert({ seller_id: profile.id, school_name: profile.selected_school, title: newItem.title, description: newItem.description, price_php: amount, category: newCategory, condition, meetup_spot: meetup, images: imageUrls }).select('id, created_at').single()
        if (error) throw error
        newItem.id = data.id; newItem.created_at = data.created_at
      }
      setListings((current) => [newItem, ...current]); setListingOpen(false); setTitle(''); setDescription(''); setPrice(''); setPhotos([]); setPreviews([])
      onToast('Your item is on the marketplace.')
    } catch (cause) { setFormError(friendlyError(cause)) }
    finally { setSaving(false) }
  }

  async function updateStatus(item: Listing, status: Listing['status']) {
    if (supabase && profile.id !== 'demo-guest' && !item.id.startsWith('market-')) {
      const { error } = await supabase.from('market_listings').update({ status }).eq('id', item.id)
      if (error) { onToast(friendlyError(error)); return }
    }
    setListings((current) => current.map((listing) => listing.id === item.id ? { ...listing, status } : listing))
    onToast(`Listing marked ${status}.`)
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!inquiry || !draft.trim()) return
    setSending(true)
    try {
      const next: ThreadMessage = { id: crypto.randomUUID(), sender_id: profile.id, content: draft.trim(), created_at: new Date().toISOString() }
      if (supabase && profile.id !== 'demo-guest' && !inquiry.id.startsWith('market-')) {
        const receiverId = inquiry.seller_id === profile.id ? threadPeerId : inquiry.seller_id
        if (!receiverId) throw new Error('Choose a buyer conversation before replying.')
        const { data, error } = await supabase.from('market_messages').insert({ listing_id: inquiry.id, sender_id: profile.id, receiver_id: receiverId, content: draft.trim() }).select('id, created_at').single()
        if (error) throw error
        next.id = data.id; next.created_at = data.created_at
      }
      setMessages((current) => [...current, next]); setDraft('')
    } catch (cause) { onToast(friendlyError(cause)) }
    finally { setSending(false) }
  }

  return <>
    <section className="section-intro">
      <div><div className="eyebrow">The student marketplace</div><h1 className="page-title">Good finds, close by.</h1><p className="page-subtitle">Pass textbooks forward, find your next dorm essential, and keep every deal on campus.</p></div>
      <button className="primary-button" onClick={openListingForm}><Plus size={15} />Sell an item</button>
    </section>

    <div className="surface market-toolbar">
      <label className="market-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find textbooks, uniforms, your next calculator…" /></label>
      <label className="market-search" style={{ flex: '0 1 126px', minWidth: 112 }}><span className="mono">₱</span><input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max price" aria-label="Maximum price" /></label>
      <select className="select-control" value={campus} onChange={(event) => setCampus(event.target.value)} aria-label="Filter by campus">
        <option>Nearby / All</option><option>LPU-Cavite</option><option>DLSU-D</option><option>CavSU</option><option>General / Other</option>
      </select>
    </div>
    <div className="category-strip" role="tablist" aria-label="Marketplace categories">
      {['All categories', ...categories].map((item) => <button key={item} role="tab" aria-selected={category === item} className={`category-chip ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}
    </div>

    {filtered.length === 0 ? <div className="surface empty-state"><ShoppingBag size={24} /><h3>No finds yet.</h3><p>Try a wider search or check back after class.</p></div> : <div className="listing-grid">
      {filtered.map((item) => <article className="surface listing-card" key={item.id}>
        <div className={`listing-art ${item.visual}`}>
          {item.images[0] ? <img src={item.images[0]} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} /> : <span className="art-icon">{iconFor(item.category)}</span>}
          <span className="listing-status">{statusLabel(item.status)}</span><span className="art-caption">Campus exchange · {item.school_name}</span>
        </div>
        <div className="listing-info">
          <p className="listing-category">{item.category}</p><h3 className="listing-title" title={item.title}>{item.title}</h3>
          <p className="listing-price">₱{item.price_php.toLocaleString('en-PH')}</p>
          <div className="listing-meta"><span>{item.condition}</span><span><MapPin size={10} style={{ verticalAlign: 'middle' }} /> {item.meetup_spot}</span></div>
          <div className="listing-seller"><span className="avatar">{item.alias[0]}</span><span>by {item.alias}</span></div>
          {item.seller_id === profile.id ? <div className="seller-actions"><select className="status-select" value={item.status} onChange={(event) => void updateStatus(item, event.target.value as Listing['status'])} aria-label="Listing status"><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option></select><button className="secondary-button" onClick={() => { setInquiry(item); setThreadPeerId(null); setSellerPeers([]); setDraft('') }}><MessageCircle size={12} />Inbox</button></div> : <div className="seller-actions"><button className="primary-button" onClick={() => { setInquiry(item); setThreadPeerId(item.seller_id); setSellerPeers([]); setDraft('') }}><MessageCircle size={13} />Ask seller</button></div>}
        </div>
      </article>)}
    </div>}

    {listingOpen && <div className="modal-backdrop" role="presentation" onClick={() => setListingOpen(false)}>
      <form className="modal wide" role="dialog" aria-modal="true" aria-labelledby="listing-title" onSubmit={(event) => void createListing(event)} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><h2 id="listing-title">List something good.</h2><p>Meet in a public campus spot and agree on details before you go.</p></div><button type="button" className="close-button" onClick={() => setListingOpen(false)} aria-label="Close"><X size={15} /></button></div>
        <div className="form-stack">
          <label className="form-label">Listing title<input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Casio scientific calculator" maxLength={90} required /></label>
          <div className="form-grid">
            <label className="form-label">Price in PHP<input className="form-input" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="₱ 0.00" required /></label>
            <label className="form-label">Category<select className="form-select" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="form-grid">
            <label className="form-label">Condition<select className="form-select" value={condition} onChange={(event) => setCondition(event.target.value as typeof condition)}><option>New</option><option>Like New</option><option>Used</option></select></label>
            <label className="form-label">Campus meetup<select className="form-select" value={meetup} onChange={(event) => setMeetup(event.target.value)}>{(meetups[profile.selected_school] ?? meetups['General / Other']).map((spot) => <option key={spot}>{spot}</option>)}</select></label>
          </div>
          <label className="form-label">Description<textarea className="form-textarea" style={{ minHeight: 84 }} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} placeholder="Share condition, size, pickup details…" required /></label>
          <div className="file-row"><Camera size={15} /><input className="file-input" type="file" accept="image/*" multiple onChange={(event) => changePhotos(event.target.files)} /><span className="muted tiny">Up to 3 photos · compressed before upload</span></div>
          {previews.length > 0 && <div className="file-row">{previews.map((preview) => <img className="preview-image" src={preview} key={preview} alt="Listing photo preview" />)}<button type="button" className="quiet-button" onClick={() => { setPhotos([]); setPreviews([]) }}><X size={13} />Clear</button></div>}
          {formError && <div className="error-note">{formError}</div>}
          <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setListingOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Publishing…' : 'Publish listing'}<Check size={14} /></button></div>
        </div>
      </form>
    </div>}

    {inquiry && <div className="modal-backdrop" role="presentation" onClick={() => setInquiry(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="inquiry-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><span className="pill crimson">{inquiry.title}</span><h2 id="inquiry-title" style={{ marginTop: 9 }}>{inquiry.seller_id === profile.id ? 'Seller inbox' : `Ask ${inquiry.alias}`}</h2><p>Keep the conversation in-app and meet somewhere public on campus.</p></div><button className="close-button" onClick={() => setInquiry(null)} aria-label="Close"><X size={15} /></button></div>
        {inquiry.seller_id === profile.id && sellerPeers.length > 1 && <label className="form-label" style={{ marginBottom: 10 }}>Buyer conversation<select className="form-select" value={threadPeerId ?? ''} onChange={(event) => setThreadPeerId(event.target.value)}>{sellerPeers.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select></label>}
        <div className="surface-inset" style={{ maxHeight: 270, minHeight: 130, padding: 11, overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 8 }}>
          {threadLoading && <p className="muted tiny">Loading conversation…</p>}
          {!messages.length && !threadLoading && <div className="empty-chat" style={{ minHeight: 100 }}><div className="empty-chat-inner"><p>{inquiry.seller_id === profile.id ? 'No buyer messages yet. New inquiries for this item will land here.' : 'Start the conversation with a friendly question about the listing.'}</p></div></div>}
          {messages.map((item) => <div key={item.id} className={`message-row ${item.sender_id === profile.id ? 'mine' : ''}`}><div className="message-byline">{item.sender_id === profile.id ? 'You' : inquiry.seller_id === profile.id ? 'Campus buyer' : inquiry.alias}</div><div className="message-bubble">{item.content}</div></div>)}
        </div>
        <form className="inline-form" onSubmit={(event) => void sendMessage(event)}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Hi! Is this still available?" maxLength={2000} disabled={inquiry.seller_id === profile.id && !threadPeerId} /><button className="send-button" aria-label="Send inquiry" disabled={!draft.trim() || sending || (inquiry.seller_id === profile.id && !threadPeerId)}><Send size={15} /></button></form>
        <p className="privacy-note"><LockKeyholeIcon />Messages are kept in your listing conversation.</p>
      </div>
    </div>}
  </>
}

function LockKeyholeIcon() { return <span className="pill"><MessageCircle size={10} />Private thread</span> }
