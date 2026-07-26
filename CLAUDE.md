# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repositorio.

## Qué es esto

Bot de alertas para los formularios de Google del Hospital Departamental de
Villavicencio E.S.E. Un único archivo de Google Apps Script (`WhatsAppAlerts.gs`)
que se pega en el proyecto del formulario: un trigger instalable `onFormSubmit`
arma un mensaje y lo envía al grupo del comité.

Sin build, sin gestor de paquetes, sin servidor. El repositorio es la fuente de
verdad, pero **el código corre desde el editor de Apps Script** — editar aquí no
cambia nada hasta pegar el archivo o hacer `clasp push`.

Dos perfiles, seleccionados con la propiedad `WA_PERFIL`:

| Perfil | Formulario | Proyecto Apps Script |
|---|---|---|
| `tecnovigilancia` (def.) | REPORTE TECNOVIGILANCIA FOREIA001 | Destinatarios Tecnovigilancia |
| `proa` | Antimicrobianos restringidos | Dashboard PROA (repo `proa-dashboard`) |

## Comandos

```bash
# Sintaxis (el .gs es JavaScript; un error solo se vería al pegarlo en el editor)
cp WhatsAppAlerts.gs /tmp/check.js && node --check /tmp/check.js

# Pruebas en seco — lo mismo que corre CI
node test/dry-run.js
```

No hay más. `clasp` es opcional y no está versionado aquí.

## Qué se puede y qué no se puede probar

`UrlFetchApp`, `SpreadsheetApp`, `PropertiesService` y los triggers **no existen
fuera del runtime de Apps Script**, así que nada local ejercita el envío real ni
el disparo del trigger. Eso solo se valida ejecutando `probarAlertaWhatsApp()`
desde el editor.

Lo que sí cubre `test/dry-run.js`, y es donde de verdad se rompe esto: la
resolución de encabezados, la clasificación serio/no serio, las banderas y que
ningún dato del paciente se filtre al mensaje. El arnés usa **`eval` indirecto**
(`(0, eval)(...)`) a propósito: un `eval` directo dentro de un módulo en modo
estricto aísla las declaraciones de función y el test no vería nada del módulo.

## Arquitectura

`onNuevaRespuestaHDV(e)` es el único punto de entrada. Despacha por perfil a tres
funciones —`waExtraerX_()`, `waAlertasX_()`, `waMensajeX_()`— y todo lo demás
(envío, reintentos, cola, bitácora, antiduplicados, triggers) es común.
**Agregar un formulario nuevo es escribir esas tres funciones y una rama en el
despachador**, nada más.

Cosas que no se deducen leyendo una función suelta:

- **WhatsApp no tiene API oficial de grupos.** Ni la Cloud API de Meta ni Twilio
  pueden publicar en un grupo: solo mensajes 1‑a‑1. Por eso el envío se abstrae
  en seis ramas (`callmebot`, `ultramsg`, `whapi`, `greenapi`, `telegram`,
  `webhook`). No "arregles" esto agregando la Cloud API creyendo que falta — se
  evaluó y no sirve para el caso de uso. Telegram y el webhook (Google
  Chat/Slack) son las únicas vías oficiales y sin riesgo de baneo del número.

- **Los encabezados NO se buscan por texto literal**, y es deliberado. Los
  títulos reales del formulario de tecnovigilancia traen espacios sobrantes
  (`"  Clasificación  "`, `"  Sexo  "`, `"Área a la que pertenece   "`). Una
  búsqueda exacta devuelve cadena vacía **sin lanzar error**: el mensaje sale con
  campos en blanco y nadie se entera. `waNorm_()` quita acentos, colapsa espacios
  y pasa a minúsculas.

- **`waG_()` intenta coincidencia exacta antes que por prefijo**, y ese orden no
  es cosmético: `"  Nombre  "` (quien reporta) convive con
  `"Nombre de la institución"`, `"Nombre comercial del dispositivo médico"` y
  `"Nombre o razón social del fabricante"`. Sin la exacta primero, el mensaje
  diría el hospital en vez de la persona. Hay una prueba que lo fija.

- **`waEsSerio_()` no puede ser un `indexOf('serio')`**: `"Evento adverso no
  serio"` contiene `"serio"` como subcadena. Exige `serio` presente y `no serio`
  ausente. La mitad de los reportes se clasificaría mal con la versión ingenua.

- **El mensaje no lleva datos del paciente por defecto.** Ambos formularios
  capturan PHI (identificación, diagnóstico, sexo, edad; en PROA además nombre e
  historia clínica). Un grupo de WhatsApp no es un canal controlado y, con
  pasarela no oficial, el texto pasa por un tercero. `WA_INCLUDE_PHI=true` lo
  desactiva y es una decisión institucional, no técnica — no lo actives por
  conveniencia al depurar. Hay pruebas que verifican que no se filtre.

- **Ninguna credencial en el código.** Todo sale de `PropertiesService`. Meter un
  token en el archivo lo publicaría en este repositorio y en `clasp push`.

- **La detección de reporte tardío usa el plazo INVIMA de 72 h** entre la fecha
  del evento y la del reporte, solo para reportes serios. `waDiasEntre_()` parsea
  `dd/MM/yyyy` a mano porque `new Date()` interpreta ese formato como `MM/dd`.

- **El trigger va en un solo proyecto.** Si queda activo en dos copias (p. ej.
  institucional y espejo personal), cada respuesta genera dos mensajes.
  `eliminarTriggersWhatsApp()` borra únicamente `onNuevaRespuestaHDV` y
  `enviarResumenWhatsApp`, nunca triggers ajenos — el proyecto "Destinatarios
  Tecnovigilancia" ya tiene los suyos para notificar por correo.

- **Antiduplicados por número de fila** en Propiedades del script: los triggers
  de Apps Script pueden reintentar la misma respuesta.

- La bitácora va a una hoja `LogWhatsApp` del mismo libro de respuestas, que se
  crea sola y se poda a las 1000 filas. Nunca escribas PHI ahí.

## Al editar

- Estilo ES5 (`var`, `function`), sin flechas ni `let/const`, para no depender
  del runtime V8 y mantener homogéneo el archivo.
- Toda función interna lleva sufijo `_`; las que se ejecutan a mano desde el
  editor (`instalarTriggerWhatsApp`, `probarAlertaWhatsApp`,
  `verificarConfiguracionWhatsApp`, `verificarEncabezadosWhatsApp`,
  `enviarResumenWhatsApp`) van sin sufijo — Apps Script no lista las privadas.
- Si tocas encabezados o reglas, agrega la prueba correspondiente en
  `test/dry-run.js`. Los encabezados reales de ambas hojas están ahí copiados
  literalmente, con sus espacios sobrantes: sirven de contrato.
- No hace falta publicar versión nueva al desplegar: el trigger corre contra
  HEAD, no contra un despliegue `/exec`. Guardar el archivo en el editor basta.

## Contexto operativo

Las dos hojas de respuestas pertenecen a `controldecalidadgases@hdv.gov.co`. El
trigger corre con la cuenta que lo crea, así que hay que instalarlo autorizando
con esa cuenta institucional, no con una personal.

Volumen actual de tecnovigilancia: ~2 reportes al mes (19 entre oct‑2025 y
jul‑2026). El modo instantáneo no satura nada; `WA_SOLO_ALERTAS`, `WA_SILENCIO` y
`WA_MODO=resumen` existen para PROA o si el reporte se masifica. Un grupo
saturado se silencia, que es lo contrario del objetivo.
