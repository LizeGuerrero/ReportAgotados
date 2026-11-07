# Empalme ITEMS ↔ World Office — primera entrega (archivos NUEVOS; no modifica nada existente)

Copiar las carpetas a la raíz del proyecto `App-modular-v2`:
- core/integraciones/empalme/      motor genérico (sin World Office, sin ITEMS)
- core/integraciones/worldoffice/  conector de servidor (solo lista cerrada de operaciones; sin borrar ni crear catálogos)
- core/integraciones/worldoffice/diccionarios/items/  correspondencias de ITEMS (crear, editar, consultar)
- tests/empalme/                   49 pruebas sin red ni BD:  node tests/empalme/run.mjs
- scripts/sonda-worldoffice.*      sonda de contrato, SOLO LECTURA

## Sonda (cuando tengas el token)
Ejecútala en tu máquina; el token NUNCA se pega en el chat:
  WO_TOKEN='<token>' node scripts/sonda-worldoffice.mjs
  (o WO_TOKEN_FILE=/ruta/token.txt)
Genera sonda-worldoffice-resultado.json (sin token). Revísalo y compártelo: incluye nombres de catálogos y 1-2 ítems de muestra
(usa --muestras=0 para solo estructura).
Confirma: canal (0 vs "WEB"), modo de paginación, tamaño de página, forma de respuestas, escala de tarifa de impuestos,
códigos que no cumplen nuestras reglas o se duplican por mayúsculas.
