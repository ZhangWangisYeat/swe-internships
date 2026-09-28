import type { MetadataRoute } from 'next';
import { generatedAt } from '@/lib/buildData';
import { LEVELS } from '@/lib/levels';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

// lastModified is when the listings were last rebuilt, so every refresh tells
// google the pages changed and are worth crawling again. using the build time
// instead would say that too after a deploy where the data didn't change at all.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = generatedAt();
  return LEVELS.map((level) => ({
    url: `${SITE_URL}${level.href}`,
    lastModified,
    changeFrequency: 'hourly',
    priority: level.id === 'undergrad' ? 1 : 0.8,
  }));
}
