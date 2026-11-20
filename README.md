# PirateBay

A mobile-first campus social PWA for LPU-Cavite and neighboring schools. The app runs in a local demo state with no secrets; adding Supabase credentials enables anonymous auth, wall persistence, image uploads, marketplace conversations, and realtime chat.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and add the Supabase project URL and anon key.
3. Run `npm install`, then `npm run dev`.

Without Supabase environment variables, PirateBay uses a local guest profile and sample content so the screens can be explored immediately. Data created in demo mode stays in browser memory.

## Supabase setup

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. In **Authentication → Providers**, enable Anonymous and Email auth. Turn on manual identity linking; enable Google if you want guest account linking through Google. For the email-change template, include Supabase’s `{{ .Token }}` value so people receive the one-time code entered in the account and verification dialogs. Supabase’s Secure Email Change setting can require confirmation at both the old and new addresses; the single-code UI expects it disabled. Configure allowed redirect URLs for your deployed app. Add your Project URL and publishable key to `.env.local` / Vercel environment variables. The client still accepts the legacy anon-key variable for existing projects.

The auth trigger creates a guest profile automatically, promotes confirmed email accounts to `registered`, and grants `verified_student` only to confirmed `.edu.ph` addresses. Client-side RLS protects listing creation and user-owned content. Chat roulette uses private Realtime Broadcast rooms and Presence; ephemeral chat messages are not written to Postgres.

## Project tree

```text
.
├── index.html
├── package.json
├── vite.config.ts
├── vercel.json
├── public/
│   ├── favicon.svg
│   └── pwa.svg
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── types.ts
│   ├── components/
│   │   ├── AccountModal.tsx
│   │   ├── AppShell.tsx
│   │   ├── ChatScreen.tsx
│   │   ├── MarketScreen.tsx
│   │   └── WallScreen.tsx
│   ├── hooks/
│   │   ├── useAuthSession.ts
│   │   └── useRandomChat.ts
│   └── lib/
│       ├── supabase.ts
│       └── uploadImage.ts
└── supabase/
    └── schema.sql
```

The PWA manifest and Workbox configuration live in `vite.config.ts`. Vercel can deploy the project as a standard Vite static build.
