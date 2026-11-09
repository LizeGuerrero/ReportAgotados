# AGOTADOS · espacio de trabajo tipo hoja (base reutilizable)

Todo lo de esta carpeta es **exclusivo de AGOTADOS**. Estilos: `styles/agotados-hoja.css` (prefijo `agx-`), cargado solo desde
`app/app/[slug]/agotados/page.tsx`. No se tocó `agotados.css` (CXP y Pedidos usan sus clases `.ag-*`).

## Piezas genéricas (`base/`) — sin nada de «agotados» dentro
| Pieza | Para qué |
|---|---|
| `EspacioTrabajo` | Marco: franja, filtros, cinta, centro, panel lateral, estado, modo enfocado (Ctrl+Mayús+F) |
| `Barra`, `GrupoH`, `BotonH`, `Segmentado`, `SepH` | Barras plegables y botones de cinta |
| `PanelLateral` | Panel acoplado con ancho redimensionable |
| `CentroConfig` | Ventana de configuración por secciones (cada pantalla define las suyas) |
| `MenuPop`, `Controles` | Menú emergente, interruptores, radios, casillas |
| `usePrefsUI` | Preferencias por usuario: navegador + (opcional) base de datos |

## Piezas propias de AGOTADOS
`tipos.ts` (columnas, grupos, constantes) · `columnas.ts` (visibilidad/orden/plegado) · `prefs.ts` (forma y validación de las
preferencias) · `FilaAgotado`, `FiltroLinea`, `ListaColumnas`, `Paginador`, `ConfigAgotados`, `iconos`.
La orquestación (datos, selección, copiado) está en `components/ReporteAgotados.tsx`.

## Para llevar esta experiencia a otro módulo
1. Copiar `base/` y `iconos.tsx` (o moverlos a una carpeta común cuando se decida) y cargar `agotados-hoja.css`.
2. Crear su `tipos.ts`/`columnas.ts`/`prefs.ts` (misma forma que los de AGOTADOS) y su sección de configuración.
3. Componer con `<EspacioTrabajo …>` y `usePrefsUI({ clave: 'mi_modulo', … })`.
4. Si se aprueba `database/PROPUESTA_agotados_preferencias.sql`, añadir su clave al CASE de `_ui_prefs_check`.
