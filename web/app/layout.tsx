import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { THEME_KEY } from '@/lib/tracker';

// same pair as the resume site: Bebas Neue for the big uppercase headings and Space
// Grotesk for everything else. next/font downloads them at build time and serves
// them from our own domain, so there's no google fonts request when the page opens.
//
// Bebas is caps-only and comes in one weight, so it's headings only. using it for UI
// text would be unreadable.
const display = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

// site-wide defaults. each level page sets its own title, description and
// canonical on top of these (see lib/seo.ts).
//
// this used to have robots noindex on it from before the site was public, which
// would have kept it out of google completely no matter what else we did.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: 'Software Engineering Internships',
  description:
    'Software engineering internships, each checked against the company’s own job board so closed roles drop off.',
  // google search console asks you to prove you own the site with a meta tag. the
  // token goes in the host's build settings as an env var, so it's not hardcoded
  // here and nothing gets output until it's set.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

// tells google the site's name, so results can say "SWE Internship Tracker" and
// not just the pages.dev address. it only counts on the home page.
const siteJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: `${SITE_URL}/`,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0c' },
  ],
};

// set the theme before anything paints. without this you get one frame in the
// system theme that then snaps to your saved choice, which looks like a flash
// every single load.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
