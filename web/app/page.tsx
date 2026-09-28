import { LevelPage } from '@/components/LevelPage';
import { levelMetadata } from '@/lib/seo';

// undergrad lives at the root because it's the page i actually use day to day, and
// it's the one most people will be searching for. masters and phd are /masters/ and
// /phd/.
export const metadata = levelMetadata('undergrad');

export default function Page() {
  return <LevelPage level="undergrad" />;
}
