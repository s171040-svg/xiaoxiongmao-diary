import { CompanionChat } from '@/components/CompanionChat';
import { useCompanion } from '@/hooks/use-companion';
import { isDesktop } from '@/lib/desktop';

export default function App() {
  const companion = useCompanion();
  return <CompanionChat companion={companion} roomOnly={!isDesktop()} />;
}
