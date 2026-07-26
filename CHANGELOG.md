# Changelog

## Separación desde `proa-dashboard`

El módulo nació dentro del repositorio del dashboard PROA, pero el formulario de
tecnovigilancia no tiene relación con el programa de antimicrobianos: son
comités, formularios y hojas distintas. Se movió aquí como proyecto propio.

## Alertas a WhatsApp con cada respuesta de un Google Form

Archivo único de Apps Script con un trigger instalable `onFormSubmit`. Notas de
diseño, para no volver a discutirlas:

- **WhatsApp no tiene API oficial de grupos.** Ni la Cloud API de Meta ni Twilio
  pueden publicar en un grupo — solo mensajes 1-a-1. Llegar a un grupo exige
  CallMeBot (gratis, sin SLA) o una pasarela basada en WhatsApp Web no oficial
  (UltraMsg, Whapi, Green API), con riesgo real de baneo del número. El envío se
  abstrae tras una sola propiedad con seis destinos, de modo que cambiar de
  proveedor no toca el resto del código; Telegram y el webhook (Google
  Chat/Slack) son las únicas vías oficiales y sin costo.
- **Los encabezados se buscan normalizados, no por texto literal.** Los del
  formulario de tecnovigilancia traen espacios sobrantes (`"  Clasificación  "`,
  `"  Sexo  "`, `"Área a la que pertenece   "`); una búsqueda exacta devolvería
  `''` **sin error** y el mensaje saldría con campos en blanco sin que nadie lo
  note. `waNorm_()` quita acentos, colapsa espacios y pasa a minúsculas;
  `waG_()` intenta coincidencia exacta normalizada y solo después cae a prefijo
  más corto. Ese orden es necesario: `"  Nombre  "` (quien reporta) convive con
  `"Nombre de la institución"` y `"Nombre o razón social del fabricante"`.
- **`waEsSerio_()` no puede ser un `indexOf('serio')`**: `"Evento adverso no
  serio"` contiene `"serio"` como subcadena. Se exige `serio` presente y
  `no serio` ausente.
- **Sin datos del paciente por defecto.** Un grupo de WhatsApp no es un canal
  controlado y, con pasarela no oficial, el texto pasa por un tercero. El
  mensaje lleva dispositivo, trazabilidad, servicio, desenlace y quién reporta.
  `WA_INCLUDE_PHI=true` lo desactiva, como decisión institucional explícita.
- **Credenciales solo en Propiedades del script**, nunca en el archivo —
  `clasp push` las subiría al repositorio.
- **Control de ruido**: `WA_SOLO_ALERTAS`, `WA_SILENCIO` y `WA_MODO=resumen`. Un
  grupo saturado se silencia, que es lo contrario del objetivo.
- Reintento 3× con backoff, antiduplicados por fila (los triggers pueden
  reintentar), bitácora en la hoja `LogWhatsApp` y aviso por correo (máx. uno
  por hora) ante fallos de la pasarela.

### Pruebas

`test/dry-run.js` corre fuera de Apps Script con stubs mínimos. No puede
ejercitar el envío ni el trigger, pero cubre lo que se rompe en silencio:
resolución de encabezados contra las columnas reales de ambas hojas, colisión
`"Nombre"` vs. `"Nombre de la institución"`, clasificación serio/no serio,
banderas y ausencia de datos del paciente en el mensaje.
