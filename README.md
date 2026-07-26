# alertas-whatsapp

Bot de alertas para los formularios de Google del **Hospital Departamental de
Villavicencio E.S.E.**: cada vez que alguien envía una respuesta, llega un aviso
al grupo del comité — en WhatsApp, Google Chat o Telegram, según cómo se
configure.

Un solo archivo de Google Apps Script (`WhatsAppAlerts.gs`) que se pega en el
proyecto del formulario. Sin build, sin dependencias, sin servidor: corre dentro
de Apps Script con un trigger `onFormSubmit`.

```
Google Form → hoja de respuestas → trigger onFormSubmit
                                        ↓
                        WhatsAppAlerts.gs (reglas + mensaje)
                                        ↓
              CallMeBot · UltraMsg · Whapi · Green API · Telegram · webhook
```

Cubre dos formularios, según la propiedad `WA_PERFIL`:

| `WA_PERFIL` | Formulario | Proyecto Apps Script |
|---|---|---|
| `tecnovigilancia` (def.) | REPORTE TECNOVIGILANCIA FOREIA001 | Destinatarios Tecnovigilancia |
| `proa` | Antimicrobianos restringidos (PROA) | Dashboard PROA |

Agregar un tercer formulario es escribir tres funciones —`waExtraerX_()`,
`waAlertasX_()` y `waMensajeX_()`— y una rama en el despachador; el resto
(envío, reintentos, cola, bitácora, triggers) es común.

---

## 1. Antes de elegir la vía: WhatsApp no tiene API oficial de grupos

Es la restricción que condiciona todo lo demás.

| Vía | ¿Grupos? | Costo | Riesgo |
|---|---|---|---|
| **WhatsApp Cloud API** (Meta) / Twilio | ❌ No | Por conversación | Ninguno, pero **no sirve**: solo mensajes 1‑a‑1 |
| **CallMeBot** | ✅ Sí | Gratis | Servicio de un tercero, sin SLA; límite de frecuencia |
| **UltraMsg / Whapi / Green API / Wassenger** | ✅ Sí | ~10–40 USD/mes | Usan WhatsApp Web no oficial → **el número puede ser baneado**; el texto pasa por el proveedor |
| **whatsapp-web.js / Baileys** autohospedado | ✅ Sí | Servidor 24/7 | Mismo riesgo de baneo, y hay que operarlo |
| **Telegram** | ✅ Sí | Gratis | Ninguno — API oficial de bots y grupos |
| **Google Chat / Slack** (webhook) | ✅ Sí | Gratis | Ninguno; ya viene con el Workspace del hospital |

**Recomendación:** si el comité puede recibir el aviso en Google Chat (ya está en
el Workspace institucional) o en Telegram, esa es la opción sana — oficial,
gratuita y sin riesgo de perder el número. Si tiene que ser WhatsApp, empiece con
CallMeBot para validar el flujo y pase a una pasarela de pago solo si el volumen
lo justifica. Use un número dedicado, **nunca el personal de alguien**.

El módulo soporta las seis vías; cambiar de una a otra es cambiar una propiedad.

## 2. Privacidad — leer antes de configurar

Ambos formularios capturan datos del paciente: el de tecnovigilancia registra
número de identificación, diagnóstico inicial, sexo, edad y servicio‑cama; el de
PROA, nombre completo, historia clínica y diagnóstico.

Un grupo de WhatsApp no es un canal controlado: no se sabe con certeza quién está
dentro, los mensajes quedan en el dispositivo de cada integrante y con pasarela no
oficial además pasan por un tercero.

Por eso el mensaje **por defecto no incluye ningún dato del paciente**. En
tecnovigilancia lleva dispositivo, trazabilidad (fabricante/lote/referencia),
servicio, detección, desenlace, causa y quién reporta — información del
dispositivo y del proceso, no de la persona. Quien necesite el resto abre la hoja
de respuestas.

`WA_INCLUDE_PHI=true` desactiva esa protección. Es una decisión institucional, no
técnica — coordínela con el área responsable de datos antes de activarla.

---

## 3. Configuración

### 3.1 Copiar el archivo

Cree un archivo nuevo llamado `WhatsAppAlerts` en el proyecto de Apps Script del
formulario correspondiente y pegue el contenido de `WhatsAppAlerts.gs`.

Para tecnovigilancia es el proyecto **"Destinatarios Tecnovigilancia"**, que ya
existe y probablemente ya tiene su propio trigger `onFormSubmit` para notificar
por correo. No hay conflicto: las funciones de este módulo llevan nombres propios
(`onNuevaRespuestaHDV`, `enviarResumenWhatsApp`) y `eliminarTriggersWhatsApp()`
solo borra esas dos, nunca las existentes. Aun así, **revise Activadores** después
de instalar para confirmar que quedaron los dos flujos y no uno duplicado.

### 3.2 Credenciales del proveedor

**CallMeBot (gratis)**
1. Entre a <https://www.callmebot.com/blog/free-api-whatsapp-messages/> y siga el
   paso vigente para grupos (agregar el número del bot al grupo y enviar el
   mensaje de autorización que allí se indica). El bot responde con la API key.
2. `WA_TO` = el identificador que le devuelva; `WA_TOKEN` = la API key.

**UltraMsg / Green API**
1. Cree la instancia y vincule el número escaneando el QR.
2. Obtenga el ID del grupo (`1203630XXXXXXXX@g.us`) desde el panel o el endpoint
   de chats del proveedor.
3. `WA_INSTANCE` = id de instancia, `WA_TOKEN` = token, `WA_TO` = el `@g.us`.

**Telegram**
1. Cree el bot con [@BotFather](https://t.me/BotFather) → `WA_TOKEN`.
2. Agregue el bot al grupo, escriba algo y abra
   `https://api.telegram.org/bot<TOKEN>/getUpdates` para leer el `chat.id`
   (negativo, ej. `-1001234567890`) → `WA_TO`.

**Google Chat / Slack**
`WA_PROVIDER=webhook` y `WA_TO` = la URL del webhook entrante del espacio.

### 3.3 Propiedades del script

En el editor: **Configuración del proyecto → Propiedades del script**.
Nunca escriba las credenciales dentro del código — `clasp push` las subiría al
repositorio.

| Propiedad | Obligatoria | Ejemplo |
|---|---|---|
| `WA_PERFIL` | no | `tecnovigilancia` (def.) · `proa` |
| `WA_PROVIDER` | sí | `callmebot` · `ultramsg` · `whapi` · `greenapi` · `telegram` · `webhook` |
| `WA_TO` | sí | `120363XXXXXXXX@g.us` |
| `WA_TOKEN` | sí (salvo `webhook`) | `abc123…` |
| `WA_INSTANCE` | solo ultramsg/greenapi | `instance98765` |
| `WA_SHEET_ID` | no | hoja de respuestas; por defecto la del perfil |
| `WA_GID` | no | gid de la pestaña, si el libro tiene varias |
| `WA_MODO` | no | `instante` (def.) · `resumen` |
| `WA_SOLO_ALERTAS` | no | `true` → solo avisa lo que trae banderas |
| `WA_INCLUDE_PHI` | no | `false` (def.) — ver §2 |
| `WA_SILENCIO` | no | `21:00-06:00` |
| `WA_ENLACE` | no | URL de la hoja de respuestas o del dashboard |
| `WA_EMAIL_FALLOS` | no | correo que recibe aviso si la pasarela falla |

### 3.4 Activar

Ejecute desde el editor, en este orden:

```
verificarConfiguracionWhatsApp()   // revisa que no falte nada, no envía
verificarEncabezadosWhatsApp()     // lee la hoja real y comprueba las columnas
probarAlertaWhatsApp()             // envía un mensaje de prueba ficticio
instalarTriggerWhatsApp()          // crea el trigger onFormSubmit
```

La primera ejecución pide autorizar `UrlFetchApp`, `SpreadsheetApp`, `MailApp` y
`ScriptApp`. Autorice con la cuenta **institucional**
(`controldecalidadgases@hdv.gov.co`), que es la dueña del formulario y de la hoja
— el trigger corre con la cuenta que lo crea.

Para desactivar: `eliminarTriggersWhatsApp()`.

---

## 4. Cómo se ve el mensaje (tecnovigilancia)

Salida real del módulo sobre el reporte del 03/07/2026:

```
🔴 TECNOVIGILANCIA · reporte SERIO

Clasificación: Evento adverso serio
Dispositivo: polidioxanona (PDS)
Trazabilidad: fabr. BIOLINE · lote NO SE TIENE
Servicio: CIRUGIA
Detección: Después del uso del DM
Desenlace: Requiere intervención médica o quirúrgica
Causa probable: Fabricación
Descripción: DURANTE EL PROCEDIMIENTO QUIRÚRGICO DEL 01/07/2026 SE VISUALIZA
EVISCERACIÓN ABDOMINAL…
Reporta: LAURA CATHERIN CRUZ GONZALEZ — INSTRUMENTADORA QUIRURGICA — CIRUGIA
Incluye evidencia adjunta.

Requiere gestión:
• Evento adverso SERIO — reportar a INVIMA
• Requirió intervención médica o quirúrgica
• Sin registro sanitario INVIMA consignado
• Dispositivo reutilizado — verificar si es de un solo uso

Evento 1/7/2026 · reportado 03/07/2026 12:36
https://docs.google.com/spreadsheets/d/1iGua…/edit
Datos del paciente: consultar la hoja de respuestas.
```

Encabezado 🔴 si la clasificación es seria, 🟠 si no lo es pero hay banderas, 🟢 si
es un reporte de rutina.

### Banderas — `waAlertasTV_()`

| Bandera | Se dispara cuando |
|---|---|
| Evento/Incidente adverso SERIO | `Clasificación` contiene "serio" y **no** "no serio" |
| Desenlace: muerte del paciente | desenlace menciona muerte |
| Requirió intervención médica o quirúrgica | desenlace menciona intervención |
| Hospitalización o prolongación | desenlace lo menciona |
| Reporte tardío | serio y pasaron > 3 días entre evento y reporte (plazo INVIMA: 72 h) |
| Sin registro sanitario | el campo está vacío o dice N/A, "no tiene", "no se tiene" |
| Dispositivo reutilizado | "utilizado más de una vez" = SÍ |
| Aún no se reporta al fabricante | ese campo = NO |

Para PROA (`waAlertasPROA_()`): sin cultivos, infección nosocomial, sin
interconsulta a Infectología, tres antimicrobianos simultáneos, ajuste renal y
duración mayor a 10 días.

---

## 5. Los encabezados se buscan de forma tolerante

No por texto literal. Los encabezados reales del formulario de tecnovigilancia
traen espacios sobrantes (`"  Clasificación  "`, `"  Sexo  "`,
`"Área a la que pertenece   "`), y una búsqueda exacta devolvería cadena vacía
**sin error** — el mensaje saldría con campos en blanco y nadie se enteraría.

`waNorm_()` normaliza quitando acentos, colapsando espacios y pasando a
minúsculas; `waG_()` busca primero coincidencia exacta normalizada y solo si no
existe cae a coincidencia por prefijo, tomando el encabezado más corto. Ese orden
importa: `"  Nombre  "` (quien reporta) convive con `"Nombre de la institución"`,
`"Nombre comercial del dispositivo médico"` y `"Nombre o razón social del
fabricante"` — sin la coincidencia exacta primero, el mensaje diría el hospital en
vez de la persona.

Verificado contra las 44 columnas reales de la hoja: los 25 campos resuelven.
Si alguien edita los títulos de pregunta del formulario, `verificarEncabezadosWhatsApp()`
lo detecta antes de que se pierda un aviso.

---

## 6. Control de ruido

Si el formulario recibe muchas respuestas, el grupo se satura y la gente silencia
el chat — que es justo lo contrario de lo que se busca. Tres palancas:

- `WA_SOLO_ALERTAS=true` — solo llega lo que trae banderas (en tecnovigilancia,
  esencialmente los reportes serios).
- `WA_SILENCIO=21:00-06:00` — de noche, lo no urgente se acumula y sale en el
  resumen de las 7 a.m. Lo que trae banderas pasa igual, a cualquier hora.
- `WA_MODO=resumen` — nada en tiempo real, un solo mensaje diario consolidado.
  Requiere el trigger horario que `instalarTriggerWhatsApp()` crea cuando esta
  propiedad o `WA_SILENCIO` están puestas.

Con el histórico actual de tecnovigilancia (19 reportes en 9 meses, ~2 al mes) el
modo instantáneo no satura nada; las palancas son para PROA o si el reporte se
masifica.

---

## 7. Diagnóstico de problemas

Cada intento queda registrado en la hoja **`LogWhatsApp`** del mismo libro de
respuestas (fecha, estado, respuesta de la pasarela — sin datos de paciente). Se
crea sola y se poda al llegar a 1000 filas.

| Síntoma | Causa habitual |
|---|---|
| No llega nada y no hay filas en `LogWhatsApp` | El trigger no existe o falló al autorizar → Activadores en el editor, columna de errores |
| `FALLO 401/403` | Token vencido o instancia desvinculada (hay que reescanear el QR) |
| `FALLO … not found` en CallMeBot | La autorización del grupo caducó; repita el alta |
| Llegan mensajes duplicados | Dos triggers `onNuevaRespuestaHDV`; ejecute `eliminarTriggersWhatsApp()` y reinstale |
| El mensaje sale con campos vacíos | Cambiaron los títulos de pregunta → `verificarEncabezadosWhatsApp()` |
| Acentos rotos | El proveedor no envía UTF‑8; verifique que la pasarela acepte `charset=utf-8` |

Si la pasarela falla, se reintenta 3 veces (1 s → 2 s → 4 s) y, con
`WA_EMAIL_FALLOS` configurado, se envía un correo — máximo uno por hora.

---

## 8. Relación con el repositorio del dashboard PROA

Este módulo vivió inicialmente en `proa-dashboard`, pero no es parte del
dashboard: el formulario de tecnovigilancia no tiene relación con el programa de
antimicrobianos. Se separó aquí.

Igual que allá, el código **corre desde el editor de Apps Script**: editar este
repositorio no cambia nada hasta pegar el archivo o hacer `clasp push`. Dos
particularidades:

- **No requiere publicar una versión nueva.** El trigger corre contra HEAD, no
  contra un despliegue `/exec`. Guardar el archivo basta.
- **Instale el trigger en un solo proyecto.** Si queda activo en dos copias (por
  ejemplo el proyecto institucional y un espejo personal), cada respuesta genera
  dos mensajes.
