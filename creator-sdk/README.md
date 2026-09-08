# Social.wtf Creator SDK 🍪

A clean, concise, security-conscious development kit for creators and developers to build, customize, and deploy their own sovereign profile pages, storefronts, and interactive code mini-apps on **Cookie Chain (SVM)**.

---

## Security & Architecture Philosophy

To safeguard platform creators and prevent unauthorized reproduction of proprietary platform-level infrastructure:
- **Retained Proprietary Internals:** The platform's proprietary multimodal AI vision classification weights, real-time client-side biometric RAM zeroing protocols, and Sentinel AI neural guardian pipelines remain protected on the host platform tier.
- **Exposed Creator SDK:** Creators receive clean, standalone interfaces to build custom storefront pages, list digital goods, embed interactive audio/video players, author sandboxed mini-games, and collect tips in $COOK with automated 5% protocol fee splitting.

---

## Quickstart: Creating Your Personal Page

Install or import the Creator SDK into your React / Next.js project:

```tsx
import React from 'react';
import { CreatorPage, Storefront, AudioSpotlightWidget } from '@social-wtf/creator-sdk';

export default function MyCreatorPage() {
  return (
    <CreatorPage
      handle="cryptobaker"
      name="The Cookie Baker 🍪"
      avatar="https://.../avatar.jpg"
      bio="Pioneering SVM culture on Cookie Chain."
      walletAddress="CookBaker77777777777777777777777777777777"
      treasuryCutPct={5} // Automated 5% protocol fee split
      socialLinks={{
        telegram: "https://t.me/TheCookieNetChain",
        docs: "https://docs.cookiechain.wtf",
        explorer: "https://cookiescan.io"
      }}
    >
      {/* 1. Audio Spotlight Widget */}
      <AudioSpotlightWidget
        title="Midnight In Gorbagana (SVM Mix)"
        artist="The Cookie Baker"
        audioUrl="https://.../track.mp3"
      />

      {/* 2. Creator Storefront */}
      <Storefront
        products={[
          {
            id: 'item-1',
            title: '3D Mascot Blender Rig (.blend)',
            priceCook: 10.0,
            category: 'digital_art',
            previewUrl: 'https://.../preview.jpg',
            downloadUrl: 'https://.../download.zip'
          },
          {
            id: 'item-2',
            title: 'Master Audio Stem Pack (WAV 24-bit)',
            priceCook: 5.5,
            category: 'music_stem',
            previewUrl: 'https://.../art.jpg',
            downloadUrl: 'https://.../stems.zip'
          }
        ]}
      />
    </CreatorPage>
  );
}
```

---

## On-Chain Economics: 95% / 5% Protocol Split

Every transaction executed through the Creator SDK automatically routes:
- **95%** directly to the creator's connected SVM wallet address.
- **5%** atomically to the Social.wtf Treasury (`CookTreasury11111111111111111111111111111111`) to fund validator grants, sub-second latency infrastructure, and developer grants on Cookie Chain.

---

## Network Configuration

- **Network:** Cookie Chain (SVM)
- **RPC:** `https://rpc.cookiescan.io`
- **WebSocket:** `wss://wss.cookiescan.io`
- **Block Explorer:** `https://cookiescan.io`
- **Genesis Hash:** `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2`
