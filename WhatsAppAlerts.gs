/* ══════════════════════════════════════════════════════════════════════
   HDV · Alertas a WhatsApp (Green-API) al recibir una nueva respuesta del
   formulario "REPORTE TECNOVIGILANCIA FOREIA001"
   ──────────────────────────────────────────────────────────────────────
   Proyecto de Apps Script: "Bot Tecnovigilancia" (antes "Destinatarios
   Tecnovigilancia"), vinculado a la hoja de respuestas del formulario.

   Se dispara con el trigger instalable "Al enviarse el formulario"
   (onFormSubmit) ya existente en ese proyecto, que llama a
   notificarNuevaRespuesta(e). La misma función envía primero la alerta de
   WhatsApp al grupo del comité y luego el correo de siempre — no son dos
   triggers ni dos proyectos distintos.

   Todas las credenciales de Green-API viven en Propiedades del script
   (Configuración del proyecto → Propiedades del script). Nunca se escriben
   aquí, porque este repositorio es público/compartido.

   ⚠ El mensaje SÍ incluye diagnóstico inicial, edad y desenlace del
   paciente (ver notificarNuevaRespuesta). Es una decisión operativa del
   HDV para que el comité pueda triar el caso desde el grupo sin abrir la
   hoja; no hay anonimización por defecto en este módulo. Si en el futuro
   se requiere quitar esos campos del mensaje de WhatsApp, edítese
   notificarNuevaRespuesta() y construirMensajeDesdeEvento() en conjunto.
   ══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   1. Punto de entrada real — trigger onFormSubmit
   ══════════════════════════════════════════════════════════════════════ */
function notificarNuevaRespuesta(e) {
  var destinatarios = "direcciontecnica@hdv.gov.co,farmacoytecnosydvillavo@gmail.com,qfaseguramientodecalidad@gmail.com,qfasistencialvcio@syd.com.co,quimicovillavicencio@syd.com.co,qfliderintersalud@gmail.com,qf.asistencial.ft.syd@gmail.com";

  var asunto = "🚨📋¡NUEVO CASO DE TECNOVIGILANCIA!!🚨🆘";
  var valores = (e && e.namedValues) ? e.namedValues : {};
  function campo(nombre) {
    return (valores[nombre] && valores[nombre][0]) ? valores[nombre][0] : "-";
  }

  var mensaje = "🚨📋 ¡NUEVO CASO DE TECNOVIGILANCIA! 📋🚨\n\n" +
      "👤 *Nombre del Reportante:* " + campo("Nombre") + "\n" +
      "🏥 *Hospitalización:* " + campo("Desenlace del evento /incidente adverso") + "\n" +
      "🎂 *Edad:* " + campo("Edad") + "\n" +
      "🛏️ *Servicio - Cama del Paciente:* " + campo("Servicio - Cama del Paciente") + "\n" +
      "🩺 *Diagnóstico inicial del paciente:* " + campo("Diagnóstico inicial del paciente") + "\n" +
      "🔧 *Dispositivo médico:* " + campo("Nombre genérico y/o comercial del dispositivo médico") + "\n" +
      "🏭 *Fabricante:* " + campo("Nombre o razón social del fabricante") + "\n" +
      "📍 *Área/Servicio del evento:* " + campo("Área/Servicio de funcionamiento del dispositivo médico en el momento del evento/incidente") + "\n" +
      "📝 *Descripción del evento:* " + campo("Descripción del evento o incidente adverso") +
      "\n\n" +
      "🔗 Revisar caso completo aquí:\n" + SpreadsheetApp.getActive().getUrl();

  enviarAlertaWhatsApp(mensaje);

  MailApp.sendEmail(destinatarios, asunto, mensaje);
}

/* ══════════════════════════════════════════════════════════════════════
   2. Envío a Green-API — un único grupo de WhatsApp, nunca a personas
   ══════════════════════════════════════════════════════════════════════ */
function enviarAlertaWhatsApp(mensaje) {
  var props = PropertiesService.getScriptProperties();
  var idInstance = props.getProperty('GREENAPI_ID_INSTANCE');
  var apiToken = props.getProperty('GREENAPI_API_TOKEN');
  var chatId = props.getProperty('GREENAPI_GROUP_CHATID');

  if (!idInstance || !apiToken || !chatId) {
    Logger.log('Faltan credenciales de Green-API en Propiedades del script.');
    return;
  }

  var firmaBot = props.getProperty('GREENAPI_BOT_LABEL') || '🤖Bot Tecnovigilancia HDV🤖';
  var mensajeFirmado = '*' + firmaBot + '*' + String.fromCharCode(10) + String.fromCharCode(10) + mensaje;

  var url = props.getProperty('GREENAPI_API_URL') + '/waInstance' + idInstance + '/sendMessage/' + apiToken;
  var payload = {
    chatId: chatId,
    message: mensajeFirmado
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  Logger.log(response.getContentText());
}

/* ══════════════════════════════════════════════════════════════════════
   3. Utilidad de solo lectura — nunca envía nada
   ──────────────────────────────────────────────────────────────────────
   Lista los chats de Green-API cuyo id termina en "@g.us" (grupos), con
   su nombre. Es la forma segura de encontrar el chatId de un grupo nuevo
   sin arriesgarse a enviar un mensaje de prueba por error: solo llama a
   getChats, nunca a sendMessage.
   ══════════════════════════════════════════════════════════════════════ */
function listarChatsGreenAPI() {
  var props = PropertiesService.getScriptProperties();
  var idInstance = props.getProperty('GREENAPI_ID_INSTANCE');
  var apiToken = props.getProperty('GREENAPI_API_TOKEN');
  var url = props.getProperty('GREENAPI_API_URL') + '/waInstance' + idInstance + '/getChats/' + apiToken;
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var chats = JSON.parse(response.getContentText());
  chats.forEach(function(c) {
    if (String(c.id).indexOf('@g.us') > -1) Logger.log((c.name || '(sin nombre)') + ' -> ' + c.id);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   4. Pruebas manuales — ejecutar a mano desde el editor
   ──────────────────────────────────────────────────────────────────────
   testEnvioWhatsApp() y enviarEjemploAlGrupo() SÍ envían un mensaje real
   al grupo configurado en GREENAPI_GROUP_CHATID. No ejecutarlas sin
   confirmar antes cuál es el grupo de destino (ver README.md §4).
   testConstruccionMensaje() no envía nada, solo registra en el log.
   ══════════════════════════════════════════════════════════════════════ */
function testEnvioWhatsApp() {
  enviarAlertaWhatsApp('Mensaje de prueba desde Apps Script (Destinatarios Tecnovigilancia). Si ves esto, la integracion con el grupo PRUEBA BOT quedo funcionando.');
}

function testConstruccionMensaje() {
  var fakeEvent = { namedValues: {
    "Nombre": ["Juan Perez"],
    "Desenlace del evento /incidente adverso": ["Hospitalizacion o prolongacion de la misma"],
    "Edad": ["45"],
    "Servicio - Cama del Paciente": ["UCI - Cama 3"],
    "Diagnostico inicial del paciente": ["Sepsis"],
    "Nombre generico y/o comercial del dispositivo medico": ["Bomba de infusion"],
    "Nombre o razon social del fabricante": ["Fabricante XYZ"],
    "Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente": ["UCI"],
    "Descripcion del evento o incidente adverso": ["Fallo en la alarma del dispositivo"]
  } };
  var valores = fakeEvent.namedValues;
  function campo(nombre) {
    return (valores[nombre] && valores[nombre][0]) ? valores[nombre][0] : "-";
  }
  var mensajePrueba = "Prueba" + campo("Nombre") + campo("Edad");
  Logger.log(mensajePrueba);
}

function enviarEjemploAlGrupo() {
  var fakeEvent = { namedValues: {
    "Nombre": ["Juan Perez"],
    "Desenlace del evento /incidente adverso": ["Hospitalizacion o prolongacion de la misma"],
    "Edad": ["45"],
    "Servicio - Cama del Paciente": ["UCI - Cama 3"],
    "Diagnostico inicial del paciente": ["Sepsis"],
    "Nombre generico y/o comercial del dispositivo medico": ["Bomba de infusion"],
    "Nombre o razon social del fabricante": ["Fabricante XYZ"],
    "Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente": ["UCI"],
    "Descripcion del evento o incidente adverso": ["Fallo en la alarma del dispositivo"]
  } };
  var valores = fakeEvent.namedValues;
  function campo(nombre) {
    return (valores[nombre] && valores[nombre][0]) ? valores[nombre][0] : "-";
  }
  var mensaje = "🚨📋 ¡NUEVO CASO DE TECNOVIGILANCIA! 📋🚨" + String.fromCharCode(10) + String.fromCharCode(10) +
    "👤 Nombre del Reportante: " + campo("Nombre") + String.fromCharCode(10) +
    "🏥 Hospitalizacion: " + campo("Desenlace del evento /incidente adverso") + String.fromCharCode(10) +
    "🎂 Edad: " + campo("Edad") + String.fromCharCode(10) +
    "🛏️ Servicio - Cama del Paciente: " + campo("Servicio - Cama del Paciente") + String.fromCharCode(10) +
    "🩺 Diagnostico inicial del paciente: " + campo("Diagnostico inicial del paciente") + String.fromCharCode(10) +
    "🔧 Dispositivo medico: " + campo("Nombre generico y/o comercial del dispositivo medico") + String.fromCharCode(10) +
    "🏭 Fabricante: " + campo("Nombre o razon social del fabricante") + String.fromCharCode(10) +
    "📍 Area/Servicio del evento: " + campo("Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente") + String.fromCharCode(10) +
    "📝 Descripcion del evento: " + campo("Descripcion del evento o incidente adverso");
  enviarAlertaWhatsApp(mensaje);
}

/* Construye el texto del mensaje a partir de un evento (real o de
   prueba) sin enviarlo. La usan enviarCasosReales() y, en general,
   cualquier función que necesite el mensaje ya armado. */
function construirMensajeDesdeEvento(fakeEvent) {
  var valores = fakeEvent.namedValues;
  function campo(nombre) {
    return (valores[nombre] && valores[nombre][0]) ? valores[nombre][0] : "-";
  }
  return "🚨📋 ¡NUEVO CASO DE TECNOVIGILANCIA! 📋🚨" + String.fromCharCode(10) + String.fromCharCode(10) +
    "👤 Nombre del Reportante: " + campo("Nombre") + String.fromCharCode(10) +
    "🏥 Hospitalizacion: " + campo("Desenlace del evento /incidente adverso") + String.fromCharCode(10) +
    "🎂 Edad: " + campo("Edad") + String.fromCharCode(10) +
    "🛏️ Servicio - Cama del Paciente: " + campo("Servicio - Cama del Paciente") + String.fromCharCode(10) +
    "🩺 Diagnostico inicial del paciente: " + campo("Diagnostico inicial del paciente") + String.fromCharCode(10) +
    "🔧 Dispositivo medico: " + campo("Nombre generico y/o comercial del dispositivo medico") + String.fromCharCode(10) +
    "🏭 Fabricante: " + campo("Nombre o razon social del fabricante") + String.fromCharCode(10) +
    "📍 Area/Servicio del evento: " + campo("Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente") + String.fromCharCode(10) +
    "📝 Descripcion del evento: " + campo("Descripcion del evento o incidente adverso");
}

/* Envía 3 mensajes reales (casos 3, 4 y 19 del formulario, filas 4/5/20
   de la hoja) al grupo configurado, con 2 s de espera entre cada uno.
   Se usó una sola vez para validar el formato con datos reales; queda
   documentada por trazabilidad pero no debe ejecutarse de nuevo sin
   confirmar antes el grupo de destino: SÍ envía mensajes reales. */
function enviarCasosReales() {
  var caso3 = { namedValues: {
    "Nombre": ["LAURA CRUZ"],
    "Desenlace del evento /incidente adverso": ["Dano de una funcion o estructura corporal, Requiere intervencion medica o quirurgica, Hospitalizacion o prolongacion de la misma"],
    "Edad": ["32"],
    "Servicio - Cama del Paciente": ["-"],
    "Diagnostico inicial del paciente": ["Craneotomia"],
    "Nombre generico y/o comercial del dispositivo medico": ["Sutura Polipropileno"],
    "Nombre o razon social del fabricante": ["BIOLINE S.A"],
    "Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente": ["Reporto por este medio Suturas Quirurgicas marca BIOLINE que no cumple como un adecuado insumo medico quirurgico en salas de cirugia. Varias instrumentadoras manifestaron que son de mala calidad."],
    "Descripcion del evento o incidente adverso": ["Poca resistencia a la traccion, la aguja se desembolsa. Poca fuerza tensil. No brinda seguridad en el anudado. Agujas sin filo, el polipropileno 2.0 no corta lo suficiente. Se solicita cambio de las suturas."]
  } };

  var caso4 = { namedValues: {
    "Nombre": ["KATHERINE PARDO"],
    "Desenlace del evento /incidente adverso": ["No hubo dano"],
    "Edad": ["0.1"],
    "Servicio - Cama del Paciente": ["-"],
    "Diagnostico inicial del paciente": ["SINDROME PILORICO"],
    "Nombre generico y/o comercial del dispositivo medico": ["AMBU"],
    "Nombre o razon social del fabricante": ["AMBU"],
    "Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente": ["AMBU"],
    "Descripcion del evento o incidente adverso": ["AMBU NEONATAL BOLSA NO ENCAJA"]
  } };

  var caso19 = { namedValues: {
    "Nombre": ["Maricel Castillo Ubate"],
    "Desenlace del evento /incidente adverso": ["No hubo dano"],
    "Edad": ["10 anos"],
    "Servicio - Cama del Paciente": ["101c"],
    "Diagnostico inicial del paciente": ["Osteomielitis pie"],
    "Nombre generico y/o comercial del dispositivo medico": ["Buretrol"],
    "Nombre o razon social del fabricante": ["Global Healthcare"],
    "Area/Servicio de funcionamiento del dispositivo medico en el momento del evento/incidente": ["Pediatria"],
    "Descripcion del evento o incidente adverso": ["El liquido de la bolsa se sale por la manguera que lo une al buretrol"]
  } };

  var casos = [caso3, caso4, caso19];
  for (var i = 0; i < casos.length; i++) {
    var mensaje = construirMensajeDesdeEvento(casos[i]);
    enviarAlertaWhatsApp(mensaje);
    if (i < casos.length - 1) Utilities.sleep(2000);
  }
}
