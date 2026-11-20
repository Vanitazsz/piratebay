import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowBigDown, ArrowBigUp, BadgeCheck, Flame, Flag, ImagePlus, Landmark, MessageCircle, MoreHorizontal, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import type { Profile, WallPost } from '../types'
import type { CampusScope } from './AppShell'
import { compressAndUpload } from '../lib/uploadImage'
import { friendlyError, supabase } from '../lib/supabase'

const categories = ['#Confession', '#COECSA', '#Shoutout', '#LostAndFound', '#ProfReview', '#Acads']
type Comment = { id: string; author_id: string; alias: string; content: string; created_at: string; parent_id?: string | null }
const now = Date.now()
const starters: WallPost[] = [
  { id: 'seed-wall-1', author_id: 'seed-a', alias: 'HarborGhost_118', school_name: 'LPU-Cavite', trust_tier: 'guest', category_tag: '#Acads', content: 'To the person who left a tiny encouraging note inside the library copy of The Great Gatsby: you have no idea how much that helped today. I hope the universe sends you the same kindness back. 🫶', upvotes: 48, downvotes: 2, comments: 8, created_at: new Date(now - 1000 * 60 * 18).toISOString(), scope: 'campus' },
  { id: 'seed-wall-2', author_id: 'seed-b', alias: 'MikaAfterHours', school_name: 'DLSU-D', trust_tier: 'verified_student', category_tag: '#Confession', content: 'I picked my course because I wanted my parents to stop worrying. Somewhere between the first all-nighter and the first time I actually loved a project, it became mine too. If you’re still figuring it out, you’re allowed to take your time.', upvotes: 91, downvotes: 3, comments: 14, created_at: new Date(now - 1000 * 60 * 48).toISOString(), scope: 'global' },
  { id: 'seed-wall-3', author_id: 'seed-c', alias: 'CaviteComet_33', school_name: 'LPU-Cavite', trust_tier: 'registered', category_tag: '#LostAndFound', content: 'Found a blue umbrella by SOT Lobby after the afternoon rain. It’s safe with the guard at the main gate — come claim it before the next downpour ☔', upvotes: 23, downvotes: 0, comments: 3, created_at: new Date(now - 1000 * 60 * 95).toISOString(), scope: 'campus' },
  { id: 'seed-wall-4', author_id: 'seed-d', alias: 'PaperCrane_617', school_name: 'CavSU', trust_tier: 'guest', category_tag: '#Shoutout', content: 'A shoutout to the friend who sat with me through a panic spiral before the presentation. You didn’t need to fix anything. You just stayed. I won’t forget it.', upvotes: 37, downvotes: 1, comments: 5, created_at: new Date(now - 1000 * 60 * 180).toISOString(), scope: 'global' },
]

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}

type Props = { profile: Profile; scope: CampusScope; onToast: (message: string) => void }

export default function WallScreen({ profile, scope, onToast }: Props) {
  const [posts, setPosts] = useState<WallPost[]>(starters)
  const [selectedCategory, setSelectedCategory] = useState('All stories')
  const [sort, setSort] = useState<'trending' | 'latest'>('trending')
  const [composeOpen, setComposeOpen] = useState(false)
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('#Confession')
  const [audience, setAudience] = useState<'campus' | 'global'>(scope === 'All Campuses' ? 'global' : 'campus')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voteState, setVoteState] = useState<Record<string, -1 | 1>>({})
  const [openPost, setOpenPost] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [commentInput, setCommentInput] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busyComment, setBusyComment] = useState(false)

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  useEffect(() => {
    if (!supabase || profile.id === 'demo-guest') return
    let active = true
    void (async () => {
      let query = supabase!.from('wall_posts').select('*, profiles(alias, trust_tier), wall_comments(count)').eq('status', 'active').order('created_at', { ascending: false })
      if (scope === 'LPU-Cavite') query = query.or(`scope.eq.global,school_name.eq.${profile.selected_school}`)
      const { data, error: queryError } = await query
      if (!active || queryError || !data) return
      const mapped: WallPost[] = data.map((row: any) => ({
        id: row.id, author_id: row.author_id, alias: row.profiles?.alias ?? 'Campus Pal', school_name: row.school_name,
        trust_tier: row.profiles?.trust_tier ?? 'guest', category_tag: row.category_tag, content: row.content,
        image_url: row.image_url, upvotes: row.upvotes ?? 0, downvotes: row.downvotes ?? 0,
        comments: row.wall_comments?.[0]?.count ?? 0, created_at: row.created_at, scope: row.scope,
      }))
      setPosts(mapped)
      const { data: votes } = await supabase!.from('wall_votes').select('post_id, vote').eq('voter_id', profile.id)
      if (active && votes) setVoteState(Object.fromEntries(votes.map((vote: any) => [vote.post_id, vote.vote])))
    })()
    return () => { active = false }
  }, [profile.id, profile.selected_school, scope])

  const visiblePosts = useMemo(() => posts
    .filter((post) => scope === 'All Campuses' || post.school_name === profile.selected_school || post.scope === 'global')
    .filter((post) => selectedCategory === 'All stories' || post.category_tag === selectedCategory)
    .sort((a, b) => sort === 'trending' ? ((b.upvotes - b.downvotes) - (a.upvotes - a.downvotes)) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  [posts, profile.selected_school, scope, selectedCategory, sort])

  function chooseImage(file?: File) {
    setImage(file ?? null)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  async function publishPost(event: FormEvent) {
    event.preventDefault()
    if (!content.trim() || content.trim().length > 500) { setError('Keep your story between 1 and 500 characters.'); return }
    setPublishing(true); setError(null)
    try {
      let imageUrl = preview
      if (image && supabase && profile.id !== 'demo-guest') imageUrl = await compressAndUpload(image, 'wall', profile.id)
      const nextPost = {
        id: crypto.randomUUID(), author_id: profile.id, alias: profile.alias, school_name: profile.selected_school,
        trust_tier: profile.trust_tier, category_tag: category, content: content.trim(), image_url: imageUrl,
        upvotes: 0, downvotes: 0, comments: 0, created_at: new Date().toISOString(), scope: audience,
      } satisfies WallPost
      if (supabase && profile.id !== 'demo-guest') {
        const { data, error: insertError } = await supabase.from('wall_posts').insert({
          author_id: profile.id, school_name: profile.selected_school, scope: audience, category_tag: category,
          content: content.trim(), image_url: imageUrl,
        }).select('id, created_at').single()
        if (insertError) throw insertError
        nextPost.id = data.id; nextPost.created_at = data.created_at
      }
      setPosts((current) => [nextPost, ...current]); setContent(''); chooseImage(undefined); setComposeOpen(false)
      onToast('Your story is on the wall.')
    } catch (cause) { setError(friendlyError(cause)) }
    finally { setPublishing(false) }
  }

  async function vote(post: WallPost, value: -1 | 1) {
    const previous = voteState[post.id]
    const next = previous === value ? undefined : value
    setVoteState((current) => { const updated = { ...current }; if (next) updated[post.id] = next; else delete updated[post.id]; return updated })
    if (supabase && profile.id !== 'demo-guest' && !post.id.startsWith('seed-')) {
      const request = next
        ? supabase.from('wall_votes').upsert({ post_id: post.id, voter_id: profile.id, vote: next })
        : supabase.from('wall_votes').delete().eq('post_id', post.id).eq('voter_id', profile.id)
      const { error: voteError } = await request
      if (voteError) { onToast(friendlyError(voteError)); return }
      const { data } = await supabase.from('wall_posts').select('upvotes, downvotes').eq('id', post.id).single()
      if (data) setPosts((current) => current.map((item) => item.id === post.id ? { ...item, upvotes: data.upvotes, downvotes: data.downvotes } : item))
      return
    }
    setPosts((current) => current.map((item) => item.id === post.id ? {
      ...item,
      upvotes: item.upvotes + (next === 1 ? 1 : 0) - (previous === 1 ? 1 : 0),
      downvotes: item.downvotes + (next === -1 ? 1 : 0) - (previous === -1 ? 1 : 0),
    } : item))
  }

  async function toggleComments(post: WallPost) {
    if (openPost === post.id) { setOpenPost(null); setReplyTo(null); setCommentInput(''); return }
    setReplyTo(null); setCommentInput('')
    setOpenPost(post.id)
    if (comments[post.id] || !supabase || profile.id === 'demo-guest' || post.id.startsWith('seed-')) return
    const { data } = await supabase.from('wall_comments').select('*, profiles(alias)').eq('post_id', post.id).order('created_at')
    if (data) setComments((current) => ({ ...current, [post.id]: data.map((row: any) => ({ id: row.id, parent_id: row.parent_id, author_id: row.author_id, alias: row.profiles?.alias ?? 'Campus Pal', content: row.content, created_at: row.created_at })) }))
  }

  async function addComment(event: FormEvent, post: WallPost) {
    event.preventDefault()
    if (!commentInput.trim()) return
    setBusyComment(true)
    try {
      let comment: Comment = { id: crypto.randomUUID(), parent_id: replyTo, author_id: profile.id, alias: profile.alias, content: commentInput.trim(), created_at: new Date().toISOString() }
      if (supabase && profile.id !== 'demo-guest' && !post.id.startsWith('seed-')) {
        const { data, error: insertError } = await supabase.from('wall_comments').insert({ post_id: post.id, parent_id: replyTo, author_id: profile.id, content: commentInput.trim() }).select('id, created_at').single()
        if (insertError) throw insertError
        comment = { ...comment, id: data.id, created_at: data.created_at }
      }
      setComments((current) => ({ ...current, [post.id]: [...(current[post.id] ?? []), comment] }))
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comments: item.comments + 1 } : item))
      setCommentInput(''); setReplyTo(null)
    } catch (cause) { onToast(friendlyError(cause)) }
    finally { setBusyComment(false) }
  }

  async function report(post: WallPost) {
    if (supabase && profile.id !== 'demo-guest' && !post.id.startsWith('seed-')) {
      const { error: reportError } = await supabase.from('reports').insert({ reporter_id: profile.id, target_type: 'wall_post', target_id: post.id, reason: 'Reported from Freedom Wall' })
      if (reportError) { onToast(reportError.code === '23505' ? 'You already reported this story.' : friendlyError(reportError)); return }
      onToast('Thanks. This story was sent to the moderation queue.')
    } else onToast('Demo mode: report previewed. Connect Supabase to send live reports.')
  }

  async function remove(post: WallPost) {
    if (supabase && profile.id !== 'demo-guest' && !post.id.startsWith('seed-')) {
      const { error: deleteError } = await supabase.from('wall_posts').delete().eq('id', post.id)
      if (deleteError) { onToast(friendlyError(deleteError)); return }
    }
    setPosts((current) => current.filter((item) => item.id !== post.id))
    onToast('Your story was removed.')
  }

  function openComposer() {
    setAudience(scope === 'All Campuses' ? 'global' : 'campus')
    setComposeOpen(true)
  }

  return <>
    <section className="section-intro">
      <div><div className="eyebrow">The Freedom Wall</div><h1 className="page-title">Leave a little story.</h1><p className="page-subtitle">Big feelings, tiny wins, lost umbrellas. This wall belongs to the whole campus.</p></div>
      <button className="primary-button" onClick={openComposer}><Plus size={15} />Write a post</button>
    </section>

    <div className="wall-layout">
      <div>
        <div className="surface feed-toolbar">
          <span className="filter-label">SHOW</span>
          <select className="select-control" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} aria-label="Filter stories by category">
            <option>All stories</option>{categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="select-control" value={sort} onChange={(event) => setSort(event.target.value as 'trending' | 'latest')} aria-label="Sort stories">
            <option value="trending">Trending / Hot</option><option value="latest">Latest first</option>
          </select>
          <span className="pill"><Landmark size={10} />{scope === 'All Campuses' ? 'All campuses' : profile.selected_school}</span>
        </div>

        <div className="surface compose-card">
          <div className="compose-row"><span className="avatar">{profile.alias[0]}</span><button className="compose-trigger" onClick={openComposer}>What’s on your mind, {profile.alias.split('_')[0]}?</button></div>
          <div className="composer-tools"><span className="muted tiny">Anonymous by default · Keep it kind</span><button className="quiet-button" onClick={openComposer}><ImagePlus size={14} /> Add a photo</button></div>
        </div>

        {visiblePosts.length === 0 ? <div className="surface empty-state"><MessageCircle size={23} /><h3>It’s quiet over here.</h3><p>Be the first to leave a note in this corner of the wall.</p></div> : visiblePosts.map((post) => {
          const own = post.author_id === profile.id
          const selectedVote = voteState[post.id]
          const thread = comments[post.id] ?? []
          return <article className="surface post-card" key={post.id}>
            <div className="post-head">
              <div className="post-author"><span className="avatar">{post.alias[0]}</span><div><p className="author-name">{post.alias}{post.trust_tier === 'verified_student' ? <span className="pill gold"><BadgeCheck size={10} /> Verified student</span> : post.trust_tier === 'registered' ? <span className="pill crimson">Member</span> : <span className="pill">Guest</span>}</p><p className="post-meta"><span>{post.school_name}</span><span>·</span><span>{timeAgo(post.created_at)}</span></p></div></div>
              <button className="chat-action" title={own ? 'Delete your post' : 'Post options'} aria-label={own ? 'Delete your post' : 'Post options'} onClick={() => own ? void remove(post) : void report(post)}>{own ? <Trash2 size={15} /> : <MoreHorizontal size={16} />}</button>
            </div>
            <div className="post-meta" style={{ marginTop: 11 }}><span className="pill crimson">{post.category_tag}</span>{post.scope === 'global' && <span className="pill"><Landmark size={10} />Inter-school</span>}</div>
            <p className="post-content">{post.content}</p>
            {post.image_url && <img className="post-image" src={post.image_url} alt="Attached to campus wall post" />}
            <div className="post-bottom">
              <button className={`post-action ${selectedVote === 1 ? 'active' : ''}`} onClick={() => void vote(post, 1)} aria-label="Upvote"><ArrowBigUp size={17} fill={selectedVote === 1 ? 'currentColor' : 'none'} />{post.upvotes}</button>
              <button className={`post-action ${selectedVote === -1 ? 'active' : ''}`} onClick={() => void vote(post, -1)} aria-label="Downvote"><ArrowBigDown size={17} fill={selectedVote === -1 ? 'currentColor' : 'none'} />{post.downvotes}</button>
              <button className="post-action" onClick={() => void toggleComments(post)}><MessageCircle size={15} />{post.comments} replies</button>
              <button className="post-action" onClick={() => void report(post)}><Flag size={14} />Report</button>
            </div>
            {openPost === post.id && <div className="comment-area">
              {thread.map((comment) => <div key={comment.id} className="comment-line" style={{ marginLeft: comment.parent_id ? 20 : 0 }}><span className="comment-alias">{comment.alias}{comment.author_id === post.author_id && <span className="op-badge"> OP</span>}</span><span style={{ flex: 1 }}>{comment.content}<br /><button type="button" className="post-action" style={{ marginTop: 3, fontSize: 9 }} onClick={() => { setReplyTo(comment.id); setCommentInput(`@${comment.alias} `) }}>Reply</button></span></div>)}
              {!thread.length && <p className="muted tiny">Start the thread with a kind reply.</p>}
              {replyTo && <button className="quiet-button" type="button" onClick={() => { setReplyTo(null); setCommentInput('') }}><X size={12} />Cancel thread reply</button>}
              <form className="inline-form" onSubmit={(event) => void addComment(event, post)}><input value={commentInput} onChange={(event) => setCommentInput(event.target.value)} placeholder={replyTo ? 'Reply in this thread…' : 'Write a reply…'} maxLength={500} /><button className="secondary-button" disabled={busyComment || !commentInput.trim()}>Reply</button></form>
            </div>}
          </article>
        })}
      </div>

      <aside className="post-side">
        <div className="surface side-card">
          <div className="side-campus"><span className="campus-crest"><Landmark size={17} /></span><div><p className="campus-name">LPU-Cavite community</p><p className="campus-blurb">Made by students, open to everyone.</p></div></div>
          <div className="divider" style={{ margin: '14px 0 5px' }} />
          <div className="side-stat"><span>Visible stories</span><strong>{visiblePosts.length}</strong></div>
          <div className="side-stat"><span>Auto-hide threshold</span><strong>3 reports</strong></div>
          <div className="side-stat" style={{ borderBottom: 0 }}><span>Feed order</span><strong>{sort === 'trending' ? 'Trending' : 'Latest'}</strong></div>
        </div>
        <div className="surface side-card"><h3 className="side-heading"><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: '#d17a83' }} />A little wall etiquette</h3><ul className="community-rules"><li>Keep people safe and names private.</li><li>Critique ideas, never someone’s identity.</li><li>Posts reported by 3 people are hidden.</li></ul></div>
        <div className="surface side-card"><span className="eyebrow">Good energy</span><p style={{ margin: '10px 0 0', font: '500 13px/1.5 Space Grotesk, sans-serif' }}>You never know who needed to read your words tonight.</p><div className="pill crimson" style={{ marginTop: 11 }}><Flame size={11} />Write something kind</div></div>
      </aside>
    </div>

    {composeOpen && <div className="modal-backdrop" role="presentation" onClick={() => setComposeOpen(false)}>
      <form className="modal wide" role="dialog" aria-modal="true" aria-labelledby="post-modal-title" onSubmit={(event) => void publishPost(event)} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><h2 id="post-modal-title">Put it on the wall.</h2><p>Your post goes out under {profile.alias}. You can remove it whenever you like.</p></div><button type="button" className="close-button" onClick={() => setComposeOpen(false)} aria-label="Close"><X size={15} /></button></div>
        <div className="form-stack">
          <label className="form-label">Your story <span>{content.length}/500</span><textarea className="form-textarea" autoFocus maxLength={500} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Say what you came here to say…" required /></label>
          <div className="form-grid">
            <label className="form-label">Category<select className="form-select" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="form-label">Post to<select className="form-select" value={audience} onChange={(event) => setAudience(event.target.value as 'campus' | 'global')}><option value="campus">{profile.selected_school}</option><option value="global">All campuses</option></select></label>
          </div>
          <div className="file-row"><input className="file-input" type="file" accept="image/*" onChange={(event) => chooseImage(event.target.files?.[0])} /><span className="muted tiny">Optional photo · compressed on upload</span></div>
          {preview && <div className="file-row"><img className="preview-image" src={preview} alt="Post attachment preview" /><button type="button" className="quiet-button" onClick={() => chooseImage(undefined)}><X size={13} />Remove image</button></div>}
          {error && <div className="error-note">{error}</div>}
          <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setComposeOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={publishing || !content.trim()}>{publishing ? 'Posting…' : 'Publish to the wall'}</button></div>
        </div>
      </form>
    </div>}
  </>
}
