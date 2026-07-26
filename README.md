# alertas-whatsapp

Bot de alertas a WhatsApp para el formulario **REPORTE TECNOVIGILANCIA
FOREIA001** del **Hospital Departamental de Villavicencio E.S.E. (HDV)**.
Cada vez que alguien envia una respuesta al formulario, el comite recibe
un aviso en un grupo de WhatsApp, ademas del correo que ya se enviaba.

Un solo archivo de Google Apps Script (`WhatsAppAlerts.gs`) que vive dentro
del proyecto de Apps Script **"Bot Tecnovigilancia"** (vinculado a la hoja
de respuestas del formulario). Sin build, sin dependencias, sin servidor:
corre dentro de Apps Script con el trigger `onFormSubmit` que ya existia
para el correo.

```
Google Form (FOREIA001) -> hoja de respuestas -> trigger onFormSubmit
                    |
          notificarNuevaRespuesta(e)
                    |                          |
        enviarAlertaWhatsApp()          MailApp.sendEmail()
                    |
      Green-API -> grupo de WhatsApp del comite
```

## 1. Por que Green-API

WhatsApp no tiene API oficial para publicar en grupos (ni la Cloud API de
Meta ni Twilio lo permiten; solo mensajes 1-a-1). Green-API usa WhatsApp
Web de forma no oficial vinculando un numero por QR, es el unico camino
viable para publicar en un grupo especifico sin migrar de canal. El
riesgo conocido es que un numero usado asi puede ser limitado o baneado
por WhatsApp; se acepto ese riesgo para este caso de uso.

**El mensaje solo se envia a un grupo, nunca a un numero ni a una
persona.** El chatId de destino vive en `GREENAPI_GROUP_CHATID` y termina
siempre en `@g.us` (grupo), nunca en `@c.us` (contacto individual).

## 2. Configuracion (Propiedades del script)

En el editor de Apps Script: **Configuracion del proyecto, Propiedades
del script**. Ninguna credencial va en el codigo, este repositorio es
compartido/publico.

| Propiedad | Obligatoria | Descripcion |
|---|---|---|
| `GREENAPI_ID_INSTANCE` | si | ID de instancia de Green-API |
| `GREENAPI_API_TOKEN` | si | Token de la instancia |
| `GREENAPI_API_URL` | si | Ej. `https://7107.api.greenapi.com` |
| `GREENAPI_GROUP_CHATID` | si | chatId del grupo de destino, termina en `@g.us` |
| `GREENAPI_BOT_LABEL` | no | Firma que antecede el mensaje (por defecto Bot Tecnovigilancia HDV) |

### Como encontrar el chatId de un grupo nuevo, sin riesgo de enviar nada

Ejecutar `listarChatsGreenAPI()` desde el editor. Es de **solo lectura**:
llama al endpoint `getChats` de Green-API y registra en el log unicamente
los chats cuyo id contiene `@g.us`, con su nombre. No llama a
`sendMessage` en ningun punto. Copiar el chatId del grupo correcto y
pegarlo en `GREENAPI_GROUP_CHATID`.

**No usar `testEnvioWhatsApp()`, `enviarEjemploAlGrupo()` ni
`enviarCasosReales()` para verificar el grupo**, las tres SI envian un
mensaje real al chat configurado en ese momento.

## 3. Historial de grupos de destino

| Grupo | chatId | Estado |
|---|---|---|
| PRUEBA BOT | `120363412506101174@g.us` | Descontinuado, solo se uso durante pruebas |
| Nuevo SF-HDV-SyD-InterSalud | `120363426937928040@g.us` | **Activo**, destino de produccion actual |

## 4. Funciones del archivo

| Funcion | Envia algo? | Uso |
|---|---|---|
| `notificarNuevaRespuesta(e)` | Si (WhatsApp + correo) | Entrada real del trigger `onFormSubmit` |
| `enviarAlertaWhatsApp(mensaje)` | Si | POST a Green-API `sendMessage` sobre `GREENAPI_GROUP_CHATID` |
| `listarChatsGreenAPI()` | **No** | Lista grupos (`@g.us`) con su chatId, para configurar `GREENAPI_GROUP_CHATID` |
| `testConstruccionMensaje()` | **No** | Verifica en el log que el mapeo de campos funciona, sin enviar nada |
| `construirMensajeDesdeEvento(fakeEvent)` | **No** | Arma el texto del mensaje a partir de un evento (real o de prueba) |
| `testEnvioWhatsApp()` | Si | Envia un mensaje de prueba fijo al grupo configurado |
| `enviarEjemploAlGrupo()` | Si | Envia un mensaje con datos ficticios (Juan Perez) al grupo configurado |
| `enviarCasosReales()` | Si (x3) | Reenvia los casos 3, 4 y 19 del formulario, ya se ejecuto una vez para validar formato; no repetir sin confirmar el grupo |

## 5. Campos incluidos en el mensaje y su origen en la hoja

El formulario no tiene columnas literales "Nombre del Reportante" ni
"Hospitalizacion"; se mapearon a las columnas reales mas cercanas:

| Campo en el mensaje | Columna real de la hoja |
|---|---|
| Nombre del Reportante | `Nombre` (columna AD, seccion de datos del reportante) |
| Hospitalizacion | `Desenlace del evento /incidente adverso` (columna X) |
| Edad | `Edad` |
| Servicio - Cama del Paciente | `Servicio - Cama del Paciente` |
| Diagnostico inicial del paciente | `Diagnostico inicial del paciente` |
| Dispositivo medico | `Nombre generico y/o comercial del dispositivo medico` |
| Fabricante | `Nombre o razon social del fabricante` |
| Area/Servicio del evento | `Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente` |
| Descripcion del evento | `Descripcion del evento o incidente adverso` |

Si un campo llega vacio, `campo()` devuelve `"-"` en vez de una cadena
vacia, para que nunca se pierda silenciosamente un dato del mensaje.

## 6. Reglas de negocio (no negociables)

**Solo al grupo configurado.** Nunca se envia a un numero individual (`@c.us`). Si algun dia se necesita notificar a una persona, debe ser por otro canal (correo, por ejemplo), no reutilizando `enviarAlertaWhatsApp()`.

**Nunca enviar un correo de "aclaracion".** Si un campo no se puede mapear con certeza, se usa el mas cercano y se documenta aqui, no se le escribe al comite pidiendo aclaraciones por correo.

**Ninguna credencial en el codigo.** Todo vive en Propiedades del script. `clasp push` (si se usa) no debe subir tokens.

**`listarChatsGreenAPI()` es la unica funcion segura para explorar grupos** cuando se sospecha que hay que cambiar `GREENAPI_GROUP_CHATID`. Las funciones de prueba (`testEnvioWhatsApp`, `enviarEjemploAlGrupo`, `enviarCasosReales`) envian mensajes reales y deben ejecutarse solo con autorizacion explicita y confirmando antes cual es el grupo activo.

## 7. Ver tambien

`CLAUDE.md`, contexto operativo e incidentes conocidos para quien trabaje en este codigo con un asistente de IA. `CHANGELOG.md`, historial de cambios de este modulo.
