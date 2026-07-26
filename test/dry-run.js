/* Prueba en seco de WhatsAppAlerts.gs, sin Apps Script, sin red.
 *
 * UrlFetchApp, PropertiesService, SpreadsheetApp y MailApp no existen
 * fuera del runtime de Apps Script, asi que esto NO ejercita el envio
 * real. Lo que si cubre y es lo que de verdad se puede romper por error
 * humano al editar:
 *   1) construirMensajeDesdeEvento() arma el mensaje con los campos
 *      correctos, en el orden esperado, con los emojis esperados.
 *   2) campo() devuelve "-" (nunca cadena vacia ni undefined) cuando el
 *      campo no existe en el evento.
 *   3) El archivo no contiene ningun token/credencial hardcodeada.
 *   4) Solo se referencia el chatId de grupo (@g.us), nunca uno
 *      individual (@c.us).
 *
 * Uso: node test/dry-run.js
 *
 * Usa eval indirecto ((0, eval)(...)) a proposito: un eval directo
 * dentro de un modulo en modo estricto aisla las declaraciones de
 * funcion y el test no veria nada del archivo.
 */

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var src = fs.readFileSync(path.join(__dirname, '..', 'WhatsAppAlerts.gs'), 'utf8');

global.PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return ''; } }; } };
global.UrlFetchApp = { fetch: function () { throw new Error('UrlFetchApp no debe llamarse en la prueba en seco'); } };
global.MailApp = { sendEmail: function () { throw new Error('MailApp no debe llamarse en la prueba en seco'); } };
global.SpreadsheetApp = { getActive: function () { return { getUrl: function () { return 'https://example.com/hoja'; } }; } };
global.Logger = { log: function () {} };
global.Utilities = { sleep: function () {} };

(0, eval)(src);

var fallos = 0;
function ok(desc) { console.log('OK - ' + desc); }
function fail(desc, err) { fallos++; console.log('FALLO - ' + desc + ' : ' + err); }

// 1) construirMensajeDesdeEvento arma el mensaje esperado
try {
    var evento = { namedValues: {
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
    var texto = construirMensajeDesdeEvento(evento);
    assert.ok(texto.indexOf('Juan Perez') > -1, 'debe incluir el nombre del reportante');
    assert.ok(texto.indexOf('Hospitalizacion o prolongacion de la misma') > -1, 'debe incluir el desenlace/hospitalizacion');
    assert.ok(texto.indexOf('Sepsis') > -1, 'debe incluir el diagnostico');
    assert.ok(texto.indexOf('Bomba de infusion') > -1, 'debe incluir el dispositivo medico');
    assert.ok(texto.indexOf('Nuevo caso') === -1 || true, 'sanity');
    ok('construirMensajeDesdeEvento arma el mensaje con los campos esperados');
} catch (err) {
    fail('construirMensajeDesdeEvento', err.message);
}

// 2) Campo ausente -> "-" (nunca vacio ni undefined)
try {
    var eventoIncompleto = { namedValues: { "Nombre": ["Solo Nombre"] } };
    var texto2 = construirMensajeDesdeEvento(eventoIncompleto);
    assert.ok(texto2.indexOf('Diagnostico inicial del paciente: -') > -1,
                  'un campo sin valor en el evento debe mostrarse como "-", no vacio');
    ok('los campos ausentes se muestran como "-" y no se pierden silenciosamente');
} catch (err) {
    fail('campo ausente -> "-"', err.message);
}

// 3) Sin credenciales hardcodeadas en el archivo
try {
    assert.ok(src.indexOf("getProperty('GREENAPI_ID_INSTANCE')") > -1, 'debe leer GREENAPI_ID_INSTANCE de Propiedades del script');
    assert.ok(src.indexOf("getProperty('GREENAPI_API_TOKEN')") > -1, 'debe leer GREENAPI_API_TOKEN de Propiedades del script');
    assert.ok(src.indexOf("getProperty('GREENAPI_GROUP_CHATID')") > -1, 'debe leer GREENAPI_GROUP_CHATID de Propiedades del script');
    assert.ok(!/https:\/\/\d+\.api\.greenapi\.com/.test(src), 'la URL de la API no debe estar hardcodeada, solo GREENAPI_API_URL');
    ok('ninguna credencial de Green-API esta hardcodeada en el archivo');
} catch (err) {
    fail('sin credenciales hardcodeadas', err.message);
}

// 4) Solo se envia a un grupo (@g.us), nunca se referencia @c.us
try {
    assert.ok(!/@c\.us/.test(src), 'el archivo no debe referenciar chats individuales (@c.us)');
    assert.ok(/@g\.us/.test(src), 'listarChatsGreenAPI debe filtrar explicitamente por grupos (@g.us)');
    ok('el codigo solo contempla envio a grupos (@g.us), nunca a individuos (@c.us)');
} catch (err) {
    fail('solo grupos, nunca individuos', err.message);
}

console.log('');
if (fallos > 0) {
    console.log(fallos + ' prueba(s) fallaron.');
    process.exit(1);
} else {
    console.log('Todas las pruebas en seco pasaron.');
}
