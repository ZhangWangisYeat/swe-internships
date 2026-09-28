import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { levelCounts, season } from './buildData';
import { levelConfig } from './levels';
import { REFRESH_HOURS } from './site';
import type { DegreeLevel } from './types';

// the preview card that shows up when someone pastes the link into discord,
// imessage, linkedin etc. it's built once per page at build time.
//
// the fonts are ttf copies checked into web/assets/fonts. the image renderer can't
// read the woff2 files next/font uses, and fetching them from google during the
// build would mean a google fonts hiccup could fail a deploy. both are OFL licensed
// so shipping them is fine.
export const OG_SIZE = { width: 1200, height: 630 };

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');

export function renderOgImage(level: DegreeLevel): ImageResponse {
  const config = levelConfig(level);
  const count = levelCounts()[level];
  const s = season();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0c0c0c',
          color: '#f2f2f2',
          fontFamily: 'Space Grotesk',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 24, letterSpacing: '0.28em', color: '#8c8c8c', textTransform: 'uppercase' }}>
            {s ? `${config.eyebrow} · ${s}` : config.eyebrow}
          </div>
          <div
            style={{
              fontFamily: 'Bebas Neue',
              fontSize: 168,
              lineHeight: 0.9,
              marginTop: 28,
              textTransform: 'uppercase',
            }}
          >
            {config.heading}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* UCLA blue, lightened for the dark background the same way the site does */}
          <div style={{ width: 12, height: 88, background: '#4f9ad6' }} />
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 30 }}>
            <div>{count > 0 ? `${count.toLocaleString('en-US')} open roles, checked against employer job boards` : 'Checked against employer job boards'}</div>
            <div style={{ color: '#8c8c8c', marginTop: 6 }}>{`Closed roles removed · updated every ${REFRESH_HOURS} hours`}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Bebas Neue', data: fs.readFileSync(path.join(FONT_DIR, 'BebasNeue-Regular.ttf')), weight: 400 },
        { name: 'Space Grotesk', data: fs.readFileSync(path.join(FONT_DIR, 'SpaceGrotesk-Medium.ttf')), weight: 500 },
      ],
    },
  );
}
