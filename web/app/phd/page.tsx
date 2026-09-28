import { LevelPage } from '@/components/LevelPage';
import { levelMetadata } from '@/lib/seo';

export const metadata = levelMetadata('phd');

export default function PhdPage() {
  return <LevelPage level="phd" />;
}
