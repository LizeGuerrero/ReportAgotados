'use client';

import { IcChevDer, IcChevIzq } from './iconos';
import { formatoNumero } from './tipos';

/** Paginación. `mini` es la versión de bolsillo (‹ 3/42 ›) para la franja superior y el modo enfocado. */
export default function Paginador({
  pagina,
  paginas,
  total,
  onPagina,
  mini,
}: {
  pagina: number;
  paginas: number;
  total: number;
  onPagina: (p: number) => void;
  mini?: boolean;
}) {
  const antes = (
    <button type="button" className="agx-ico-btn" disabled={pagina === 0} onClick={() => onPagina(pagina - 1)} aria-label="Página anterior" title="Página anterior">
      <IcChevIzq />
    </button>
  );
  const despues = (
    <button type="button" className="agx-ico-btn" disabled={pagina + 1 >= paginas} onClick={() => onPagina(pagina + 1)} aria-label="Página siguiente" title="Página siguiente">
      <IcChevDer />
    </button>
  );
  if (mini) {
    return (
      <div className="agx-pager agx-pager--mini" role="group" aria-label="Paginación">
        {antes}
        <span className="agx-pager__n" aria-live="polite">
          {pagina + 1}/{paginas}
        </span>
        {despues}
      </div>
    );
  }
  return (
    <div className="agx-pager" role="group" aria-label="Paginación">
      {antes}
      <span className="agx-pager__n" aria-live="polite">
        Página <strong>{pagina + 1}</strong> de {paginas} <span className="agx-pager__total">({formatoNumero(total)} ítems)</span>
      </span>
      {despues}
    </div>
  );
}
