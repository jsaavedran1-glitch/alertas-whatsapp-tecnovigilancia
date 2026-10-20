// test/pie-firma.js
//
// Prueba en seco del pie de firma de los mensajes de WhatsApp. Carga el
// archivo real WhatsAppAlerts.gs con stubs de PropertiesService/UrlFetchApp, llama a
// enviarAlertaWhatsApp() y revisa el payload que se habria enviado a
// Green-API. No sale ninguna peticion de red.
//
// Uso: node test/pie-firma.js

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var src = fs.readFileSync(path.join(__dirname, '..', 'WhatsAppAlerts.gs'), 'utf8');

var PROPS = {
  GREENAPI_ID_INSTANCE: '0000000000',
  GREENAPI_API_TOKEN: 'token-de-prueba',
  GREENAPI_GROUP_CHATID: '000000000000000000@g.us',
  GREENAPI_API_URL: 'https://api.ejemplo.invalid'
};
var enviados = [];
global.PropertiesService = {
  getScriptProperties: function () {
    return { getProperty: function (k) { return PROPS.hasOwnProperty(k) ? PROPS[k] : null; } };
  }
};
global.UrlFetchApp = {
  fetch: function (url, options) {
    enviados.push(JSON.parse(options.payload));
    return {
      getResponseCode: function () { return 200; },
      getContentText: function () { return '{"idMessage":"prueba"}'; }
    };
  }
};
global.Logger = { log: function () {} };
global.MailApp = { sendEmail: function () { throw new Error('MailApp no debe llamarse en esta prueba'); } };
global.SpreadsheetApp = { openById: function () { throw new Error('sin hoja en la prueba en seco'); } };

(0, eval)(src);

var PIE = '_Bot diseñado por el QF Juan Pablo Saavedra · Servicio Farmacéutico HDV_';

enviarAlertaWhatsApp('Cuerpo de prueba');
assert.strictEqual(enviados.length, 1, 'debe intentar exactamente un envio');
var texto = enviados[0].message;
assert.ok(texto.indexOf('Cuerpo de prueba') > -1, 'el cuerpo del mensaje debe conservarse');
assert.ok(texto.slice(-PIE.length) === PIE, 'el mensaje debe terminar con el pie de firma');
assert.ok(texto.indexOf('Cuerpo de prueba\n\n' + PIE) > -1, 'el pie va separado del cuerpo por una linea en blanco');
assert.ok(/@g\.us$/.test(enviados[0].chatId), 'solo se envia a grupos (@g.us)');
console.log('OK - el mensaje termina con: ' + PIE);
