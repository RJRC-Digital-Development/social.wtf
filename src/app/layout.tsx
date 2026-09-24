import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/theme/themeContext';
import { WalletProvider } from '@/lib/wallet/walletContext';
import { ShieldProvider } from '@/lib/shield/shieldContext';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: 'Social.wtf | Decentralized Social Ecosystem & Storefronts on Cookie Chain (SVM)',
  description:
    'Unified decentralized Web3 social ecosystem built on Cookie Chain featuring multi-format feeds, creator storefront mini-apps, automated 0.05% platform treasury fee splits, real-time AI multimodal content shielding, and privacy-first ephemeral age verification.',
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col transition-colors duration-200" style={{fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"}}>
        <ThemeProvider>
          <WalletProvider>
            <ShieldProvider>
              {children}
              <Analytics />
              <SpeedInsights />
            </ShieldProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
