import { SCREENS, type Screen } from './screens';

export interface ActorPermissions { tenant: readonly string[]; global: readonly string[] }

// Regra pura: sem permissões confirmadas (`null`), só entram as telas sem exigência. Item restrito exige o código na lista do
// próprio escopo; ser perfil global não concede item do tenant (RF-006, RF-007). Item só de motorista depende apenas do vínculo
// de motorista na empresa ativa (Spec 015), informado à parte porque o papel Motorista não tem permissões.
export function visibleScreens(permissions: ActorPermissions | null, context: { driver?: boolean } = {}): Screen[] {
  return SCREENS.filter((screen) => {
    if (screen.driverOnly) return context.driver === true;
    if (!screen.requires) return true;
    if (permissions === null) return false;
    const granted = permissions[screen.requires.scope];
    return [screen.requires.code, ...(screen.requires.anyOf ?? [])].some((code) => granted.includes(code));
  });
}
