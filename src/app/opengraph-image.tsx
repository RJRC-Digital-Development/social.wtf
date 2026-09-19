import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Social.wtf - Web3 Social Ecosystem on Cookie Chain';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #070b14 0%, #0f172a 50%, #1e1b4b 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          color: 'white',
          padding: '40px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              background: 'linear-gradient(to right, #38bdf8, #818cf8, #c084fc)',
              backgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '-0.05em',
            }}
          >
            social.wtf
          </div>
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '800px',
            lineHeight: 1.4,
          }}
        >
          Decentralized Social & Creator Storefront Ecosystem on Cookie Chain (SVM)
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
