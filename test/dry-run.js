/* Prueba en seco de WhatsAppAlerts.gs fuera de Apps Script.
 *
 * No puede ejercitar el envío real (UrlFetchApp no existe aquí) ni el trigger,
 * pero sí lo que más silenciosamente se rompe: la resolución de encabezados.
 * Los títulos del formulario traen espacios sobrantes y acentos inconsistentes,
 * y un encabezado que no coincide no lanza error — devuelve cadena vacía y el
 * mensaje sale con campos en blanco sin que nadie lo note.
 *
 *   node test/dry-run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ── Stubs mínimos de Apps Script ──────────────────────────────────── */
global.PropertiesService = {
  getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} })
};
global.Session   = { getScriptTimeZone: () => 'America/Bogota' };
global.Utilities = { formatDate: () => '26/07/2026 09:14', sleep() {} };
global.Logger    = { log: () => {} };

// eval indirecto: evalúa en ámbito global para que las funciones del módulo
// queden accesibles desde aquí (un eval directo en modo estricto las aislaría).
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'WhatsAppAlerts.gs'), 'utf8'));

/* ── Utilidades de prueba ──────────────────────────────────────────── */
let fallos = 0;
function ok(cond, nombre, detalle) {
  if (cond) { console.log('  ✅ ' + nombre); return; }
  fallos++;
  console.log('  ❌ ' + nombre + (detalle ? '\n       ' + detalle : ''));
}

/* ── Encabezados reales de la hoja de tecnovigilancia ──────────────────
   Copiados literalmente, con los espacios sobrantes tal como están. */
const H_TV = ['Marca temporal', 'Dirección de correo electrónico', 'Nombre de la institución   ',
  'Tipo de identificación   ', '  Sexo  ', '  Edad  ', 'Diagnóstico inicial del paciente   ',
  'Nombre genérico y/o comercial del dispositivo médico   ', 'Nombre comercial del dispositivo médico   ',
  'Registro sanitario o permiso de comercialización ', '  Lote  ', '  Modelo  ', '  Referencia  ',
  '  Serial  ', 'Nombre o razón social del fabricante   ',
  'Nombre o razón social del Importador y/o distribuidor   ',
  'Área/Servicio de funcionamiento del dispositivo médico en el momento del evento/incidente  ',
  'Indique si el dispositivo médico ha sido utilizado más de una vez   ',
  'Fecha del evento/incidente adverso  ', 'Fecha de elaboración del reporte  ',
  'Detección del evento/incidente adverso  ', '  Clasificación  ',
  'Descripción del evento o incidente adverso   ', 'Desenlace del evento /incidente adverso   ',
  'Causa probable del evento/incidente', 'Acciones correctivas y preventivas iniciadas   ',
  'Reportó al Fabricante/Importador/Distribuidor   ',
  '¿Dispositivo médico disponible para evaluación? SI/NO - FECHA ',
  '   ¿Se ha enviado el dispositivo médico al Fabricante/ Importador/Distribuidor?  SI/NO - FECHA ',
  '  Nombre  ', '  Profesión  ', 'Área a la que pertenece   ', '  Dirección  ',
  '  Teléfono de contacto', '  Departamento  ', 'Ciudad o municipio  ',
  'Correo electrónico institucional o personal  ', 'Fecha de notificación   ',
  'Autoriza la divulgación de la información y origen del reporte al fabricante o importador  ',
  'SOPORTE DE EVIDENCIA', 'Número de identificación del paciente', 'Tipo de identificación',
  'Servicio - Cama del Paciente', 'Ced', 'Columna 40'];

const H_PROA = ['Marca temporal', 'Nombres y apellidos del paciente', 'Número de Historia Clínica',
  'Servicio actual', 'Nombre del médico que prescribe', 'Especialidad que prescribe',
  'Diagnóstico CIE10 para la cual se prescribe el antimicrobiano', 'Cuantos antimicrobianos formuló?',
  'Nombre Antimicrobiano 1', 'Dosis en miligramos o UI AB1', 'Frecuencia AM 1 (En Horas)',
  'Días ordenados AM1', 'Vía de adminsitración de  AM1', 'Nombre Antimicrobiano 2',
  'Nombre Antimicrobiano 3', 'Indicación del antibiótico', 'Cultivos tomados:',
  'Microorganismo aislado', 'Infección nosocomial', 'Ajuste Renal',
  '¿Solicitó interconsulta por infectología en Dinámica Gerencial?'];

function centinela(headers) {
  const m = {};
  headers.forEach(h => { m[waNorm_(h)] = '·'; });
  return m;
}

/* ── 1. Todos los campos resuelven contra los encabezados reales ───── */
console.log('\nResolución de encabezados');
[['tecnovigilancia', H_TV, waExtraerTV_], ['proa', H_PROA, waExtraerPROA_]].forEach(([nombre, H, extraer]) => {
  const d = extraer(centinela(H));
  const faltan = Object.keys(d).filter(k => k !== 'marca' && k !== 'abs' && !d[k]);
  ok(faltan.length === 0, nombre + ': los ' + Object.keys(d).length + ' campos resuelven contra ' +
     H.length + ' columnas', 'sin coincidencia: ' + faltan.join(', '));
});

/* Coincidencia exacta antes que por prefijo: "Nombre" (quien reporta) no puede
   resolverse contra "Nombre de la institución" ni "Nombre comercial…". */
const conColisiones = waMapa_({
  'Nombre de la institución   ': 'Hospital Departamental de Villavicencio',
  'Nombre comercial del dispositivo médico   ': 'Buretrol',
  'Nombre o razón social del fabricante   ': 'Global Healthcare',
  '  Nombre  ': 'Mariciel Castillo Ubate'
});
ok(waG_(conColisiones, ['Nombre']) === 'Mariciel Castillo Ubate',
   '"Nombre" resuelve al reportante, no a la institución ni al dispositivo',
   'obtuvo: ' + JSON.stringify(waG_(conColisiones, ['Nombre'])));

/* ── 2. Serio vs. no serio ─────────────────────────────────────────── */
console.log('\nClasificación serio / no serio');
[['Evento adverso serio', true], ['Evento adverso no serio', false],
 ['Incidente adverso serio', true], ['Incidente adverso no serio', false],
 ['INCIDENTE ADVERSO NO SERIO', false]].forEach(([c, esperado]) => {
  ok(waEsSerio_(c) === esperado, c + ' → ' + (esperado ? 'SERIO' : 'no serio'));
});

/* ── 3. Banderas de tecnovigilancia ────────────────────────────────── */
console.log('\nBanderas');
const serio = waExtraerTV_(waMapa_({
  '  Clasificación  ': 'Evento adverso serio',
  'Desenlace del evento /incidente adverso   ': 'Requiere intervención médica o quirúrgica',
  'Registro sanitario o permiso de comercialización ': 'NO SE TIENE',
  'Fecha del evento/incidente adverso  ': '1/7/2026',
  'Fecha de elaboración del reporte  ': '3/7/2026'
}));
const aSerio = waAlertasTV_(serio);
ok(aSerio.some(x => /SERIO/.test(x)), 'reporte serio se marca para INVIMA');
ok(aSerio.some(x => /intervencion|intervención/i.test(x)), 'desenlace con intervención se marca');
ok(aSerio.some(x => /registro sanitario/i.test(x)), 'registro sanitario ausente se marca');
ok(!aSerio.some(x => /tardio|tardío/i.test(x)), '2 días desde el evento no es reporte tardío');

const tardio = waExtraerTV_(waMapa_({
  '  Clasificación  ': 'Incidente adverso serio',
  'Fecha del evento/incidente adverso  ': '20/3/2026',
  'Fecha de elaboración del reporte  ': '4/4/2026',
  'Registro sanitario o permiso de comercialización ': '20250630'
}));
ok(waAlertasTV_(tardio).some(x => /tardío/.test(x)), '15 días sí supera el plazo INVIMA de 72 h');

const rutina = waExtraerTV_(waMapa_({
  '  Clasificación  ': 'Incidente adverso no serio',
  'Desenlace del evento /incidente adverso   ': 'No hubo daño',
  'Registro sanitario o permiso de comercialización ': 'INVIMA 2017DM-0016577',
  'Indique si el dispositivo médico ha sido utilizado más de una vez   ': 'NO',
  'Reportó al Fabricante/Importador/Distribuidor   ': 'SI'
}));
ok(waAlertasTV_(rutina).length === 0, 'reporte de rutina no genera banderas',
   'generó: ' + JSON.stringify(waAlertasTV_(rutina)));

/* ── 4. El mensaje no filtra datos del paciente ────────────────────── */
console.log('\nPrivacidad');
const conPHI = waExtraerTV_(waMapa_({
  '  Clasificación  ': 'Evento adverso serio',
  'Nombre genérico y/o comercial del dispositivo médico   ': 'Sutura PDS',
  'Número de identificación del paciente': '21230050',
  'Diagnóstico inicial del paciente   ': 'Peritonitis',
  '  Sexo  ': 'Femenino', '  Edad  ': '74 años', 'Servicio - Cama del Paciente': '101c'
}));
const sinPHI = waMensajeTV_(conPHI, waAlertasTV_(conPHI), { perfil: 'tecnovigilancia', incluirPHI: false });
['21230050', 'Peritonitis', '74 años', '101c'].forEach(dato => {
  ok(sinPHI.indexOf(dato) === -1, 'no aparece "' + dato + '" con WA_INCLUDE_PHI=false');
});
const cnPHI = waMensajeTV_(conPHI, waAlertasTV_(conPHI), { perfil: 'tecnovigilancia', incluirPHI: true });
ok(cnPHI.indexOf('21230050') > -1, 'sí aparece con WA_INCLUDE_PHI=true (opt-in explícito)');

/* PROA: el nombre del paciente y la historia clínica tampoco salen por defecto */
const proaPHI = waExtraerPROA_(waMapa_({
  'Nombres y apellidos del paciente': 'JUAN PEREZ', 'Número de Historia Clínica': '123456',
  'Nombre Antimicrobiano 1': 'Meropenem', 'Servicio actual': 'UCI'
}));
const proaMsg = waMensajePROA_(proaPHI, waAlertasPROA_(proaPHI), { perfil: 'proa', incluirPHI: false });
ok(proaMsg.indexOf('JUAN PEREZ') === -1 && proaMsg.indexOf('123456') === -1,
   'PROA: paciente e historia clínica fuera del mensaje por defecto');

/* ── 5. Horario de silencio ────────────────────────────────────────── */
console.log('\nHorario de silencio');
ok(waEnSilencio_('') === false, 'sin rango configurado, nunca silencia');
ok(typeof waEnSilencio_('21:00-06:00') === 'boolean', 'rango que cruza medianoche no rompe');
ok(waDiasEntre_('1/7/2026', '3/7/2026') === 2, 'waDiasEntre_ interpreta dd/MM/yyyy');
ok(waDiasEntre_('', '3/7/2026') === null, 'fecha vacía devuelve null, no NaN');

/* ── Resultado ─────────────────────────────────────────────────────── */
console.log('\n' + (fallos ? '❌ ' + fallos + ' prueba(s) fallida(s)' : '✅ Todas las pruebas pasaron'));
process.exit(fallos ? 1 : 0);
