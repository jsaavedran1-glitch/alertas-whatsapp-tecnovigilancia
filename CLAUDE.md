# CLAUDE.md

Guia para Claude (o cualquier asistente de IA) al trabajar en este repositorio.

## Que es esto

Bot de alertas a WhatsApp para el formulario **REPORTE TECNOVIGILANCIA
FOREIA001** del Hospital Departamental de Villavicencio E.S.E. (HDV). Un
unico archivo de Google Apps Script (`WhatsAppAlerts.gs`) que vive dentro
del proyecto de Apps Script **"Bot Tecnovigilancia"**, vinculado a la
hoja de respuestas del formulario. Ese mismo proyecto ya tenia un trigger
`onFormSubmit` que enviaba un correo (`notificarNuevaRespuesta`); este
modulo se integro ahi mismo, no como un trigger ni un proyecto aparte.

Sin build, sin gestor de paquetes, sin servidor. El repositorio es la
fuente de verdad, pero **el codigo corre desde el editor de Apps
Script**, editar aqui no cambia nada hasta pegar el archivo en el editor
(o hacer `clasp push` si en algun momento se configura clasp, que hoy no
esta en uso).

## Reglas que no son negociables

Estas reglas vienen de instrucciones explicitas del usuario a lo largo de
varias sesiones de trabajo en este proyecto. No se deben revertir ni
"mejorar" sin pedir confirmacion.

Regla 1: Solo se envia al grupo de WhatsApp configurado en
`GREENAPI_GROUP_CHATID`. Nunca a un numero individual. El chatId de un
grupo termina en `@g.us`; el de un contacto, en `@c.us`. Si una funcion
alguna vez recibe o construye un chatId que no sea el de
`GREENAPI_GROUP_CHATID`, es una senal de alarma.

Regla 2: Nunca enviar un correo (ni mensaje) de "aclaracion" pidiendo mas
informacion al comite o a un tercero. Si un campo del formulario no
tiene una columna exacta, se mapea al campo real mas parecido y se
documenta la decision en `README.md` seccion 5, no se pausa el flujo
para preguntar.

Regla 3: Ninguna credencial en el codigo. Todo va en Propiedades del
script (`PropertiesService.getScriptProperties()`). Este repo puede
terminar en GitHub publico; un token hardcodeado quedaria expuesto para
siempre en el historial de git.

Regla 4: `listarChatsGreenAPI()` es de solo lectura (llama a `getChats`,
no a `sendMessage`) y es la unica forma segura de descubrir el chatId de
un grupo nuevo. `testEnvioWhatsApp()`, `enviarEjemploAlGrupo()` y
`enviarCasosReales()` si envian mensajes reales al grupo configurado en
ese momento, no ejecutarlas para "solo verificar algo" sin haber
confirmado antes con el usuario cual es el grupo activo.

## Incidente documentado, por que la regla 4 existe

Durante el cambio de grupo de destino (de "PRUEBA BOT" a "Nuevo
SF-HDV-SyD-InterSalud"), un primer intento de ejecutar
`listarChatsGreenAPI()` desde el editor de Apps Script termino, por una
condicion de carrera en el selector de funcion del editor web, ejecutando
`enviarCasosReales()` en su lugar, reenviando 3 mensajes reales al grupo
PRUEBA BOT que ya se habian enviado antes. Se detecto por el formato de
la respuesta en el log (`{"idMessage": "..."}`, que es la firma de
`sendMessage`, no de `getChats`) y se corrigio recargando el editor en
una pestana nueva y verificando el selector de funcion con una captura de
pantalla inmediatamente antes de cada ejecucion.

Moraleja para quien automatice esto de nuevo (incluida una IA con acceso
al editor web de Apps Script): despues de seleccionar una funcion y
antes de ejecutarla, confirmar visualmente que el selector muestra el
nombre correcto, y despues de ejecutar, leer el registro de ejecucion de
inmediato para confirmar que el formato de la respuesta corresponde a la
funcion esperada (por ejemplo, `getChats` devuelve una lista de chats, no
un `idMessage`). Si algo no cuadra, detener la ejecucion (boton
"Detener") de inmediato y avisar al usuario antes de continuar.

## Arquitectura

Un solo punto de entrada real: `notificarNuevaRespuesta(e)`, llamado por
el trigger `onFormSubmit` del formulario. Arma el mensaje leyendo
`e.namedValues` con el helper `campo()` (devuelve `"-"` si el campo no
existe o esta vacio, nunca cadena vacia silenciosa) y llama a:
`enviarAlertaWhatsApp(mensaje)` (POST a Green-API `sendMessage`) y
`MailApp.sendEmail(...)` (el correo que ya existia antes de este
modulo, sin cambios).

El resto de funciones (`testConstruccionMensaje`, `enviarEjemploAlGrupo`,
`construirMensajeDesdeEvento`, `enviarCasosReales`, `testEnvioWhatsApp`,
`listarChatsGreenAPI`) son herramientas de configuracion y prueba, no
parte del flujo de produccion.

Cosas que no se deducen leyendo una funcion suelta:

Los nombres de columna del formulario tienen tildes y son largos (por
ejemplo "Area/Servicio de funcionamiento del dispositivo medico en el
momento del evento/incidente"). `campo()` busca coincidencia exacta
contra `e.namedValues`, si alguien edita el texto de una pregunta del
formulario, ese campo empezara a salir como `"-"` sin lanzar error. No
hay una funcion de verificacion de encabezados en este modulo (a
diferencia de otros proyectos del hospital que si la tienen); si se
agrega, debe listarse aqui.

"Nombre del Reportante" y "Hospitalizacion" no son columnas literales
del formulario. Se mapearon a `Nombre` (columna AD) y a `Desenlace del
evento /incidente adverso` (columna X) respectivamente, por ser las mas
cercanas semanticamente. Ver `README.md` seccion 5 para el mapeo
completo y no reabrir esa decision sin razon nueva.

`enviarCasosReales()` contiene datos reales de pacientes (casos 3, 4 y 19
del formulario, filas 4/5/20 de la hoja) usados una sola vez para validar
el formato del mensaje con datos reales antes de pasar a produccion. Se
deja en el archivo por trazabilidad de lo que se probo, no para volver a
ejecutarse rutinariamente.

El mensaje incluye diagnostico, edad y desenlace del paciente, a
diferencia de otros bots de alertas de HDV que anonimizan por defecto.
Es una decision operativa explicita para este proyecto (el comite
necesita triar desde el grupo sin abrir la hoja), no "corregir" esto
agregando anonimizacion sin que el usuario lo pida.

## Al editar

Estilo ES5 (`var`, `function`), consistente con el resto del codigo de
Apps Script del hospital. Si se agrega un campo nuevo al mensaje,
actualizar en conjunto: `notificarNuevaRespuesta()`,
`construirMensajeDesdeEvento()` (usada por `enviarCasosReales`) y la
tabla de mapeo de `README.md` seccion 5. Las tres versiones del mensaje
(produccion, ejemplo, casos reales) deben mantenerse alineadas en el
mismo orden de campos y mismos emojis. No hace falta publicar una
version nueva del proyecto: el trigger corre contra el HEAD del editor,
no contra un despliegue `/exec`. Guardar el archivo en el editor basta.

## Contexto operativo

La hoja de respuestas pertenece al formulario "REPORTE TECNOVIGILANCIA
FOREIA001" del HDV; el proyecto de Apps Script es "Bot Tecnovigilancia".
Grupo de WhatsApp de destino actual: Nuevo SF-HDV-SyD-InterSalud
(`120363426937928040@g.us`). El grupo "PRUEBA BOT"
(`120363412506101174@g.us`) quedo descontinuado tras la fase de pruebas,
no reactivarlo como destino sin instruccion explicita.

El usuario (Juan Pablo Saavedra) es Quimico Farmaceutico, referente de
Tecnovigilancia y secretario del comite del HDV. Los mensajes de este
bot llegan al mismo comite que el coordina.
