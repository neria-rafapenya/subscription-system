// Vite discovers backoffice panels inside modules without hard-coding their UI
// into the common backoffice shell.
const modulePanels = import.meta.glob('../../../modules/*/backoffice/index.jsx', {
  eager: true,
  import: 'default',
});

export function getModuleBackoffice(moduleId) {
  return modulePanels[`../../../modules/${moduleId}/backoffice/index.jsx`] || null;
}
