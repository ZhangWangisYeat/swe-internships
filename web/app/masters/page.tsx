import { LevelPage } from '@/components/LevelPage';
import { levelMetadata } from '@/lib/seo';

export const metadata = levelMetadata('masters');

export default function MastersPage() {
  return <LevelPage level="masters" />;
}
