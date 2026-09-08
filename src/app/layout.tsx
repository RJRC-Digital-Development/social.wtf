import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/lib/wallet/walletContext';
import { ShieldProvider } from '@/lib/shield/shieldContext';

export const metadata: Metadata = {
  title: 'Social.wtf | Decentralized Social Ecosystem & Storefronts on Cookie Chain (SVM)',
  description:
    'Unified decentralized Web3 social ecosystem built on Cookie Chain featuring multi-format feeds, creator storefront mini-apps, automated 5% platform treasury fee splits, real-time AI multimodal content shielding, and privacy-first ephemeral age verification.',
  keywords: [
    'Social.wtf',
    'Cookie Chain',
    'COOK',
    'SVM',
    'Solana Virtual Machine',
    'Nightly Wallet',
    'Web3 Social',
    'Creator Economy',
    'Ephemeral ID Verification',
    'AI Shielding',
  ],
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
        <WalletProvider>
          <ShieldProvider>
            {children}
          </ShieldProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
