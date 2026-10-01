import { SCREENS, type Screen } from './screens';

export interface ActorPermissions { tenant: readonly string[]; global: readonly string[] }

// Regra pura: sem permissões confirmadas (`null`), só entram as telas sem exigência. Item restrito exige o código na lista do
// próprio escopo; ser perfil global não concede item do tenant (RF-006, RF-007).
export function visibleScreens(permissions: ActorPermissions | null): Screen[] {
  return SCREENS.filter((screen) => !screen.requires || (permissions !== null && permissions[screen.requires.scope].includes(screen.requires.code)));
}
