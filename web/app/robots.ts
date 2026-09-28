import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// static export can only write these files at build time, it has no server to
// generate them per request
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
