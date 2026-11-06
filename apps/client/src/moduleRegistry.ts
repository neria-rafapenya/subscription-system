import SanidadExtension from '../../../modules/sanidad/client/SanidadExtension';
import GestoriaExtension from '../../../modules/gestoria/client/GestoriaExtension';

export type ClientModuleProps = {
  accessToken: string | null;
  ui: Record<string, any>;
};

type ClientModule = (props: ClientModuleProps) => JSX.Element;

const clientModules: Record<string, ClientModule> = {
  sanidad: SanidadExtension,
  gestoria: GestoriaExtension,
};

export function getClientModule(moduleId: string | undefined): ClientModule | null {
  return moduleId ? clientModules[moduleId] ?? null : null;
}
