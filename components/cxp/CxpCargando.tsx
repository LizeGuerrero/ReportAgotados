/** Pantalla de espera de CXP: aparece al instante al cambiar de pestaña, mientras llega la pantalla nueva. */
export function CxpCargando({ texto }: { texto: string }) {
  return (
    <main className="ag-page cxp-page" aria-busy="true">
      <div className="cxp-cargando" role="status">
        <span className="cxp-spinner" aria-hidden="true" />
        {texto}
      </div>
      <div aria-hidden="true">
        <div className="cxp-esqueleto" />
        <div className="cxp-esqueleto" />
        <div className="cxp-esqueleto" />
        <div className="cxp-esqueleto" />
      </div>
    </main>
  );
}
