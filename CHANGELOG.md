# Changelog

Todos los cambios notables de este modulo se documentan aqui.

## [2026-10-20]

### Documentación (2026-10-21)
- README reescrito con el flujo completo del bot: diagrama, paso a paso, datos del mensaje con su pregunta de origen, ejemplo con datos ficticios, configuración, funciones (cuáles envían), cómo actualizar el bot desde el repo y el cupo de chats compartido de Green-API entre los 4 bots.

### Agregado
- Pie de firma en todos los mensajes de WhatsApp, en cursiva y debajo del cuerpo (mismo estilo que el bot de Alertas INVIMA): `_Bot diseñado por el QF Juan Pablo Saavedra · Servicio Farmacéutico HDV_`. Se agrega en `enviarAlertaWhatsApp()`, así que aplica a toda alerta que envíe el bot. El texto va con escapes `\u` para que las tildes no se corrompan al pegar en el editor de Apps Script. El correo electrónico no cambia.
- `test/pie-firma.js`: prueba en seco que carga el `.gs` real con Green-API simulado y verifica que el mensaje termine con el pie. No envía nada.

## [Fix campos vacíos y rediseño de mensaje] - 2026-08-02

Se detectó que las alertas llegaban con casi todos los campos en "—". Causa raíz: los títulos de las preguntas del Google Form tienen espacios al inicio/final que no coincidían con los literales usados en `campo()` dentro de `namedValues`.

### Corregido

`campo(nombre)`: ahora intenta match exacto primero (para evitar colisiones cuando hay dos columnas con el mismo nombre trimeado, ej. "Tipo de identificación") y si no lo encuentra, hace fallback comparando `.trim()` sobre todas las claves de `e.namedValues`.

### Cambiado

`notificarNuevaRespuesta(e)`: mensaje de WhatsApp/correo rediseñado con los siguientes campos y emojis: Nombre del Reportante, Profesión, Área a la que pertenece, Tipo/Número de identificación del paciente, Servicio - Cama del Paciente, Sexo/Edad, Diagnóstico inicial del paciente, Dispositivo médico/Fabricante, Clasificación, Descripción del evento, Desenlace del evento y Fecha del evento (columna "Marca temporal"). Se retiró la línea "🔗 Revisar caso completo aquí" y se reemplazó por la fecha del evento.

Verificado contra el último caso real en producción antes de sincronizar este repositorio. No se realizaron envíos de prueba adicionales al grupo de WhatsApp; solo el trigger automático `onFormSubmit` dispara alertas en producción.

## [Reemplazo completo] - 2026-07-26

Se reemplazo la implementacion anterior (arquitectura multi-proveedor
`WA_*` con proteccion PHI por defecto) por la version realmente
desplegada y en produccion en el proyecto de Apps Script "Bot
Tecnovigilancia" (Green-API unicamente, propiedades `GREENAPI_*`).

### Anadido

`notificarNuevaRespuesta(e)`: mensaje de WhatsApp con 9 campos del
formulario (nombre del reportante, hospitalizacion, edad, servicio-cama,
diagnostico, dispositivo medico, fabricante, area/servicio, descripcion
del evento), con emojis por campo, ademas del correo ya existente.
`enviarAlertaWhatsApp(mensaje)`: envio via Green-API (`sendMessage`) al
grupo configurado en `GREENAPI_GROUP_CHATID`. `listarChatsGreenAPI()`:
utilidad de solo lectura (`getChats`) para descubrir el chatId de un
grupo sin riesgo de enviar nada. `construirMensajeDesdeEvento(fakeEvent)`,
`testConstruccionMensaje()`, `enviarEjemploAlGrupo()`,
`testEnvioWhatsApp()`, `enviarCasosReales()`: utilidades de configuracion
y prueba. Mapeo documentado de "Nombre del Reportante" a la columna
`Nombre` y "Hospitalizacion" a la columna `Desenlace del evento
/incidente adverso` (ver README.md seccion 5), al no existir columnas
literales con esos nombres en el formulario.

### Cambiado

Grupo de destino de produccion: de PRUEBA BOT
(`120363412506101174@g.us`, usado solo durante pruebas) a Nuevo
SF-HDV-SyD-InterSalud (`120363426937928040@g.us`). Mensaje de WhatsApp:
se agregaron emojis por campo para hacerlo mas legible al triar desde el
grupo.

### Validado con datos reales

Se enviaron y confirmaron 3 mensajes de ejemplo usando datos reales de
los casos 3, 4 y 19 del formulario (filas 4, 5 y 20 de la hoja de
respuestas), antes de pasar el grupo de destino a produccion.

### Incidente y correccion

Durante el cambio de grupo, una condicion de carrera en el selector de
funcion del editor de Apps Script provoco que, en un primer intento, se
ejecutara `enviarCasosReales()` en lugar de `listarChatsGreenAPI()`,
reenviando 3 mensajes ya enviados antes al grupo PRUEBA BOT. Se detecto
por el formato de la respuesta en el log y se corrigio recargando el
editor en una pestana nueva, verificando el selector de funcion con una
captura de pantalla antes de cada ejecucion posterior. Ver CLAUDE.md
para el detalle y la recomendacion operativa derivada.

### Quitado

Arquitectura multi-proveedor anterior (`WA_PROVIDER`: callmebot /
ultramsg / whapi / greenapi / telegram / webhook), el perfil `proa`
compartido en este mismo archivo, la proteccion PHI por defecto
(`WA_INCLUDE_PHI`), la cola/resumen por horario de silencio y las
pruebas de `test/dry-run.js` asociadas a esa arquitectura. Esa version
nunca llego a pegarse en el editor de Apps Script en produccion; el
codigo que si esta corriendo es el de este reemplazo.
