export type TrustTier = 'guest' | 'registered' | 'verified_student'

export type Profile = {
  id: string
  alias: string
  selected_school: string
  trust_tier: TrustTier
  verified_domain?: string | null
}

export type WallPost = {
  id: string
  author_id: string
  alias: string
  school_name: string
  trust_tier: TrustTier
  category_tag: string
  content: string
  image_url?: string | null
  upvotes: number
  downvotes: number
  comments: number
  created_at: string
  scope?: 'campus' | 'global'
}

export type Listing = {
  id: string
  seller_id: string
  alias: string
  school_name: string
  title: string
  description: string
  price_php: number
  category: string
  condition: 'New' | 'Like New' | 'Used'
  meetup_spot: string
  images: string[]
  status: 'available' | 'reserved' | 'sold'
  created_at: string
  visual: string
}
