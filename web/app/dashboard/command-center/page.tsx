// GP Command Center — V0 (P0 estático / read-only)
// Página estática: renderiza o snapshot agregado documentado.
// Sem chamada externa, sem banco, sem auth aqui (proxy.ts já protege /dashboard/*).
// A troca futura por dados dinâmicos preserva a interface (lib/command-center/types.ts).

import { SNAPSHOT } from '@/lib/command-center/snapshot'
import CommandCenterPage from './CommandCenterPage'

export const metadata = {
  title: 'GP Command Center',
}

export default function CommandCenterRoute() {
  return <CommandCenterPage snapshot={SNAPSHOT} />
}
