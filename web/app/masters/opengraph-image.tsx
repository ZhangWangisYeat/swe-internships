import { OG_SIZE, renderOgImage } from '@/lib/og';

export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'SWE Internship Tracker';

export default function Image() {
  return renderOgImage('masters');
}
