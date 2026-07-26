/* ══════════════════════════════════════════════════════════════════════
   HDV · Alertas a WhatsApp al recibir una nueva respuesta de Google Forms
   ──────────────────────────────────────────────────────────────────────
   Módulo autónomo: no depende de Code.gs ni del dashboard. Se pega tal
   cual en el proyecto de Apps Script del formulario correspondiente.

   Dos perfiles (propiedad WA_PERFIL):
     · tecnovigilancia → "REPORTE TECNOVIGILANCIA FOREIA001"
                          proyecto "Destinatarios Tecnovigilancia"
     · proa            → formulario de antimicrobianos restringidos

   Se dispara con un trigger instalable "Al enviarse el formulario"
   (onFormSubmit) sobre la hoja de respuestas.

   ⚠ PRIVACIDAD: por defecto el mensaje NO incluye identificación,
   diagnóstico ni edad/sexo del paciente. Un grupo de WhatsApp no es un
   canal controlado (no se sabe quién más está dentro ni dónde queda
   respaldado el chat) y, con pasarelas no oficiales, el texto además pasa
   por un tercero. El detalle se consulta en la hoja de respuestas.
   WA_INCLUDE_PHI=true desactiva esa protección — decisión institucional.

   CONFIGURACIÓN: ninguna credencial en este archivo. Todo va en
   Configuración del proyecto → Propiedades del script.
   Ver docs/WHATSAPP_ALERTS.md y ayudaConfiguracionWhatsApp().
   ══════════════════════════════════════════════════════════════════════ */

/* Hojas de respuestas por defecto (se pueden sobrescribir con WA_SHEET_ID) */
var WA_SHEETS = {
  tecnovigilancia: '1iGua43QTYou2938J-kcfCDhwZtD5m3MtxPtgPt5A9No',
  proa:            '1ZsjuygpRz1wPhCRxmL8LPLTNOo8kujGXplX8JRs6SZY'
};

/* ── Configuración leída de las Propiedades del script ─────────────── */
function waConfig_() {
  var p = PropertiesService.getScriptProperties();
  var perfil = (p.getProperty('WA_PERFIL') || 'tecnovigilancia').toLowerCase().trim();
  return {
    perfil:      perfil,
    sheetId:     p.getProperty('WA_SHEET_ID') || WA_SHEETS[perfil] || '',
    provider:   (p.getProperty('WA_PROVIDER') || '').toLowerCase().trim(),
    to:          p.getProperty('WA_TO')       || '',   // grupo / teléfono / chat_id / URL
    token:       p.getProperty('WA_TOKEN')    || '',
    instance:    p.getProperty('WA_INSTANCE') || '',   // ultramsg / greenapi
    modo:       (p.getProperty('WA_MODO')     || 'instante').toLowerCase(),
    soloAlertas: p.getProperty('WA_SOLO_ALERTAS') === 'true',
    incluirPHI:  p.getProperty('WA_INCLUDE_PHI')  === 'true',
    silencio:    p.getProperty('WA_SILENCIO')     || '',   // ej. "21:00-06:00"
    enlace:      p.getProperty('WA_ENLACE')       || '',   // dashboard u hoja
    avisarA:     p.getProperty('WA_EMAIL_FALLOS') || ''
  };
}

/* ══════════════════════════════════════════════════════════════════════
   1. Búsqueda tolerante de encabezados
   ──────────────────────────────────────────────────────────────────────
   Los encabezados reales del Form traen espacios sobrantes al inicio y
   al final ("  Clasificación  ", "  Sexo  ", "Área a la que pertenece   ")
   y acentos inconsistentes. Buscar por texto literal devolvería '' sin
   error, así que se normaliza: sin acentos, sin espacios repetidos, en
   minúsculas. Primero coincidencia exacta; si no, por contenido.
   ══════════════════════════════════════════════════════════════════════ */
function waNorm_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita acentos
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

/* Convierte {encabezado: valor} en {encabezadoNormalizado: valor} */
function waMapa_(row) {
  var m = {};
  for (var k in row) if (Object.prototype.hasOwnProperty.call(row, k)) {
    var v = row[k];
    m[waNorm_(k)] = String((Array.isArray(v) ? v[0] : v) || '').trim();
  }
  return m;
}

/* Busca el primer encabezado candidato que exista.
   1) coincidencia exacta ya normalizada — devuelve su valor aunque esté vacío,
      para no caer al respaldo y traer el de otra columna parecida
      (p. ej. "Nombre" vs. "Nombre de la institución");
   2) si ninguno existe, el encabezado más corto que empiece por el candidato. */
function waG_(m, candidatos) {
  var i, c, k;
  for (i = 0; i < candidatos.length; i++) {
    c = waNorm_(candidatos[i]);
    if (Object.prototype.hasOwnProperty.call(m, c)) return m[c];
  }
  for (i = 0; i < candidatos.length; i++) {
    c = waNorm_(candidatos[i]);
    var mejor = null;
    for (k in m) if (k.indexOf(c) === 0 && (mejor === null || k.length < mejor.length)) mejor = k;
    if (mejor !== null) return m[mejor];
  }
  return '';
}

/* ══════════════════════════════════════════════════════════════════════
   2. Handler del trigger
   ══════════════════════════════════════════════════════════════════════ */
function onNuevaRespuestaHDV(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;              // otra ejecución en curso
  try {
    var cfg = waConfig_();
    if (!cfg.provider) { waLog_(cfg, 'CONFIG', 'WA_PROVIDER sin definir'); return; }

    var fila = waFilaDeEvento_(e, cfg);
    if (!fila) { waLog_(cfg, 'ERROR', 'No se pudo leer la fila del evento'); return; }
    if (waYaProcesada_(fila.numero)) return;      // reintento del trigger → no duplicar

    var m       = waMapa_(fila.datos);
    var d       = (cfg.perfil === 'proa') ? waExtraerPROA_(m) : waExtraerTV_(m);
    var alertas = (cfg.perfil === 'proa') ? waAlertasPROA_(d)  : waAlertasTV_(d);

    if (cfg.soloAlertas && !alertas.length) { waMarcarProcesada_(fila.numero); return; }

    var texto = (cfg.perfil === 'proa') ? waMensajePROA_(d, alertas, cfg)
                                        : waMensajeTV_(d, alertas, cfg);

    // En horario de silencio, lo no urgente espera al resumen.
    if (waEnSilencio_(cfg.silencio) && !alertas.length) {
      waEncolar_(texto);
      waLog_(cfg, 'ENCOLADO', 'Fila ' + fila.numero);
    } else {
      var r = waEnviar_(texto, cfg);
      waLog_(cfg, r.ok ? 'ENVIADO' : 'FALLO', 'Fila ' + fila.numero + ' · ' + r.detalle);
      if (!r.ok) waAvisarFallo_(cfg, r.detalle, texto);
    }
    waMarcarProcesada_(fila.numero);
  } catch (err) {
    waLog_(waConfig_(), 'ERROR', String(err && err.message || err));
  } finally {
    lock.releaseLock();
  }
}

/* Datos de la respuesta: del evento si viene, si no releyendo la hoja. */
function waFilaDeEvento_(e, cfg) {
  if (e && e.namedValues) {           // trigger onFormSubmit del Spreadsheet
    return { numero: (e.range ? e.range.getRow() : -1), datos: e.namedValues };
  }
  var sheet = waHoja_(cfg);
  if (!sheet) return null;
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var ancho = sheet.getLastColumn();
  var enc   = sheet.getRange(1, 1, 1, ancho).getValues()[0];
  var vals  = sheet.getRange(last, 1, 1, ancho).getValues()[0];
  var obj   = {};
  for (var i = 0; i < enc.length; i++) {
    obj[String(enc[i])] = (vals[i] instanceof Date)
      ? Utilities.formatDate(vals[i], waTZ_(), 'dd/MM/yyyy HH:mm')
      : String(vals[i] == null ? '' : vals[i]);
  }
  return { numero: last, datos: obj };
}

function waHoja_(cfg) {
  var ss = cfg.sheetId ? SpreadsheetApp.openById(cfg.sheetId)
                       : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  var gid = PropertiesService.getScriptProperties().getProperty('WA_GID');
  if (gid) {
    var hojas = ss.getSheets();
    for (var i = 0; i < hojas.length; i++) {
      if (String(hojas[i].getSheetId()) === String(gid)) return hojas[i];
    }
  }
  return ss.getSheets()[0];
}

/* ══════════════════════════════════════════════════════════════════════
   3. Perfil TECNOVIGILANCIA (FOREIA001)
   ══════════════════════════════════════════════════════════════════════ */
function waExtraerTV_(m) {
  return {
    marca:        waG_(m, ['Marca temporal']) ||
                  Utilities.formatDate(new Date(), waTZ_(), 'dd/MM/yyyy HH:mm'),
    clasificacion:waG_(m, ['Clasificación']),
    dispositivo:  waG_(m, ['Nombre genérico y/o comercial del dispositivo médico',
                           'Nombre comercial del dispositivo médico']),
    fabricante:   waG_(m, ['Nombre o razón social del fabricante']),
    distribuidor: waG_(m, ['Nombre o razón social del Importador y/o distribuidor']),
    registro:     waG_(m, ['Registro sanitario o permiso de comercialización']),
    lote:         waG_(m, ['Lote']),
    referencia:   waG_(m, ['Referencia']),
    area:         waG_(m, ['Área/Servicio de funcionamiento del dispositivo médico en el momento del evento/incidente']),
    reutilizado:  waG_(m, ['Indique si el dispositivo médico ha sido utilizado más de una vez']),
    deteccion:    waG_(m, ['Detección del evento/incidente adverso']),
    descripcion:  waG_(m, ['Descripción del evento o incidente adverso']),
    desenlace:    waG_(m, ['Desenlace del evento /incidente adverso']),
    causa:        waG_(m, ['Causa probable del evento/incidente']),
    fechaEvento:  waG_(m, ['Fecha del evento/incidente adverso']),
    fechaReporte: waG_(m, ['Fecha de elaboración del reporte']),
    reportoFab:   waG_(m, ['Reportó al Fabricante/Importador/Distribuidor']),
    evidencia:    waG_(m, ['SOPORTE DE EVIDENCIA']),
    reportante:   waG_(m, ['Nombre']),
    profesion:    waG_(m, ['Profesión']),
    areaReporta:  waG_(m, ['Área a la que pertenece']),
    // PHI — solo se imprime con WA_INCLUDE_PHI
    pacienteId:   waG_(m, ['Número de identificación del paciente']),
    dx:           waG_(m, ['Diagnóstico inicial del paciente']),
    sexo:         waG_(m, ['Sexo']),
    edad:         waG_(m, ['Edad']),
    cama:         waG_(m, ['Servicio - Cama del Paciente'])
  };
}

/* ¿"Evento adverso serio"? Ojo: "no serio" contiene "serio" como subcadena. */
function waEsSerio_(clasificacion) {
  var c = waNorm_(clasificacion);
  return c.indexOf('serio') > -1 && c.indexOf('no serio') < 0;
}

function waAlertasTV_(d) {
  var a = [];
  var desenlace = waNorm_(d.desenlace);
  var registro  = waNorm_(d.registro);

  if (waEsSerio_(d.clasificacion)) {
    a.push(/incidente/.test(waNorm_(d.clasificacion))
      ? 'Incidente adverso SERIO — reportar a INVIMA'
      : 'Evento adverso SERIO — reportar a INVIMA');
  }
  if (desenlace.indexOf('muerte') > -1)                a.push('Desenlace: muerte del paciente');
  if (desenlace.indexOf('intervencion') > -1)          a.push('Requirió intervención médica o quirúrgica');
  if (desenlace.indexOf('hospitalizacion') > -1)       a.push('Hospitalización o prolongación de la estancia');

  // INVIMA exige reportar los serios dentro de las 72 h del hallazgo.
  var dias = waDiasEntre_(d.fechaEvento, d.fechaReporte);
  if (dias !== null && dias > 3 && waEsSerio_(d.clasificacion)) {
    a.push('Reporte tardío: ' + dias + ' días desde el evento (plazo 72 h)');
  }
  if (!registro || /^(n\/?a|no tiene|no se tiene|ninguno|0)$/.test(registro)) {
    a.push('Sin registro sanitario INVIMA consignado');
  }
  if (/^si/.test(waNorm_(d.reutilizado)))              a.push('Dispositivo reutilizado — verificar si es de un solo uso');
  if (/^no/.test(waNorm_(d.reportoFab)))               a.push('Aún no se reporta al fabricante/importador');
  return a;
}

function waMensajeTV_(d, alertas, cfg) {
  var serio = waEsSerio_(d.clasificacion);
  var L = [];
  L.push(serio ? '🔴 *TECNOVIGILANCIA · reporte SERIO*'
               : (alertas.length ? '🟠 *TECNOVIGILANCIA · reporte con observaciones*'
                                 : '🟢 *TECNOVIGILANCIA · nuevo reporte*'));
  L.push('');
  if (d.clasificacion) L.push('*Clasificación:* ' + d.clasificacion);
  if (d.dispositivo)   L.push('*Dispositivo:* '   + d.dispositivo);

  var trazab = [d.fabricante && ('fabr. ' + d.fabricante),
                d.lote && ('lote ' + d.lote),
                d.referencia && ('ref. ' + d.referencia)].filter(Boolean).join(' · ');
  if (trazab)          L.push('*Trazabilidad:* ' + trazab);
  if (d.area)          L.push('*Servicio:* '     + d.area);
  if (d.deteccion)     L.push('*Detección:* '    + d.deteccion);
  if (d.desenlace)     L.push('*Desenlace:* '    + d.desenlace);
  if (d.causa)         L.push('*Causa probable:* ' + d.causa);
  if (d.descripcion)   L.push('*Descripción:* '  + waRecortar_(d.descripcion, 350));

  var quien = [d.reportante, d.profesion, d.areaReporta].filter(Boolean).join(' — ');
  if (quien)           L.push('*Reporta:* ' + quien);
  if (d.evidencia)     L.push('_Incluye evidencia adjunta._');

  if (cfg.incluirPHI) {                       // desactivado por defecto
    var pac = [d.sexo, d.edad, d.dx, d.cama].filter(Boolean).join(' · ');
    if (pac)           L.push('*Paciente:* ' + pac);
    if (d.pacienteId)  L.push('*Identificación:* ' + d.pacienteId);
  }

  if (alertas.length) {
    L.push('');
    L.push('*Requiere gestión:*');
    for (var i = 0; i < alertas.length; i++) L.push('• ' + alertas[i]);
  }

  L.push('');
  L.push('_' + (d.fechaEvento ? 'Evento ' + d.fechaEvento + ' · reportado ' : '') + d.marca + '_');
  if (cfg.enlace)      L.push(cfg.enlace);
  if (!cfg.incluirPHI) L.push('_Datos del paciente: consultar la hoja de respuestas._');
  return L.join('\n');
}

/* ══════════════════════════════════════════════════════════════════════
   4. Perfil PROA (antimicrobianos restringidos)
   ══════════════════════════════════════════════════════════════════════ */
function waExtraerPROA_(m) {
  var abs = [waG_(m, ['Nombre Antimicrobiano 1']),
             waG_(m, ['Nombre Antimicrobiano 2']),
             waG_(m, ['Nombre Antimicrobiano 3'])];
  return {
    marca:      waG_(m, ['Marca temporal']) ||
                Utilities.formatDate(new Date(), waTZ_(), 'dd/MM/yyyy HH:mm'),
    servicio:   waG_(m, ['Servicio actual']),
    especialid: waG_(m, ['Especialidad que prescribe']),
    abs:        abs.filter(function(x) { return x && x !== '0'; }),
    dosis:      waG_(m, ['Dosis en miligramos o UI AB1']),
    frec:       waG_(m, ['Frecuencia AM 1 (En Horas)']),
    dias:       waG_(m, ['Días ordenados AM1']),
    via:        waG_(m, ['Vía de adminsitración de  AM1']),   // typo real del Form
    indicacion: waG_(m, ['Indicación del antibiótico', 'Indicación']),
    cultivos:   waG_(m, ['Cultivos tomados:']),
    micro:      waG_(m, ['Microorganismo aislado']),
    nosocomial: waG_(m, ['Infección nosocomial']),
    interconsu: waG_(m, ['¿Solicitó interconsulta por infectología en Dinámica Gerencial?']),
    ajusteRenal:waG_(m, ['Ajuste Renal']),
    paciente:   waG_(m, ['Nombres y apellidos del paciente']),
    hc:         waG_(m, ['Número de Historia Clínica']),
    dx:         waG_(m, ['Diagnóstico CIE10 para la cual se prescribe el antimicrobiano'])
  };
}

function waAlertasPROA_(d) {
  var a  = [];
  var si = function(v) { return /^si/.test(waNorm_(v)); };
  var no = function(v) { return /^no/.test(waNorm_(v)); };
  if (no(d.cultivos))                   a.push('Sin cultivos previos');
  if (si(d.nosocomial))                 a.push('Infección nosocomial');
  if (d.interconsu && no(d.interconsu)) a.push('Sin interconsulta a Infectología');
  if (d.abs.length >= 3)                a.push('3 antimicrobianos simultáneos');
  if (si(d.ajusteRenal))                a.push('Requiere ajuste renal');
  if (Number(d.dias) > 10)              a.push('Duración > 10 días');
  return a;
}

function waMensajePROA_(d, alertas, cfg) {
  var L = [];
  L.push(alertas.length ? '🔴 *PROA · prescripción con banderas*'
                        : '🟢 *PROA · nueva prescripción*');
  L.push('');
  if (d.servicio)   L.push('*Servicio:* ' + d.servicio);
  if (d.abs.length) L.push('*Antimicrobiano:* ' + d.abs.join(' + '));

  var pauta = [d.dosis && (d.dosis + ' mg/UI'), d.frec && ('c/' + d.frec + ' h'),
               d.dias && (d.dias + ' días'), d.via].filter(Boolean).join(' · ');
  if (pauta)        L.push('*Pauta:* ' + pauta);
  if (d.indicacion) L.push('*Indicación:* ' + d.indicacion);
  if (d.micro && !/^(no|ning|0)/.test(waNorm_(d.micro))) L.push('*Aislamiento:* ' + d.micro);
  if (d.especialid) L.push('*Especialidad:* ' + d.especialid);

  if (cfg.incluirPHI) {
    if (d.paciente) L.push('*Paciente:* ' + d.paciente);
    if (d.hc)       L.push('*HC:* '       + d.hc);
    if (d.dx)       L.push('*Dx:* '       + d.dx);
  }

  if (alertas.length) {
    L.push('');
    L.push('*Revisar:*');
    for (var i = 0; i < alertas.length; i++) L.push('• ' + alertas[i]);
  }

  L.push('');
  L.push('_' + d.marca + '_');
  if (cfg.enlace)      L.push(cfg.enlace);
  if (!cfg.incluirPHI) L.push('_Datos del paciente: consultar en el dashboard._');
  return L.join('\n');
}

/* ══════════════════════════════════════════════════════════════════════
   5. Envío — una rama por pasarela
   ══════════════════════════════════════════════════════════════════════ */
function waEnviar_(texto, cfg) {
  cfg = cfg || waConfig_();
  var intentos = 3, espera = 1000, ultimo = '';
  for (var i = 0; i < intentos; i++) {
    try {
      var r = waEnviarUnaVez_(texto, cfg);
      if (r.ok) return r;
      ultimo = r.detalle;
    } catch (err) {
      ultimo = String(err && err.message || err);
    }
    Utilities.sleep(espera);
    espera *= 2;                                   // 1s → 2s → 4s
  }
  return { ok: false, detalle: ultimo };
}

function waEnviarUnaVez_(texto, cfg) {
  var res, url, opt;
  switch (cfg.provider) {

    // CallMeBot — gratis. WA_TO = teléfono/grupo autorizado, WA_TOKEN = apikey
    // que entrega el bot al darlo de alta. Ver callmebot.com/whatsapp.php
    case 'callmebot':
      url = 'https://api.callmebot.com/whatsapp.php'
          + '?phone='  + encodeURIComponent(cfg.to)
          + '&apikey=' + encodeURIComponent(cfg.token)
          + '&text='   + encodeURIComponent(texto);
      res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      break;

    // UltraMsg — WA_INSTANCE = instanceXXXXX, WA_TO = 1203630XXXX@g.us
    case 'ultramsg':
      url = 'https://api.ultramsg.com/' + cfg.instance + '/messages/chat';
      opt = { method: 'post', muteHttpExceptions: true,
              payload: { token: cfg.token, to: cfg.to, body: texto } };
      res = UrlFetchApp.fetch(url, opt);
      break;

    // Whapi.Cloud — WA_TO = 1203630XXXX@g.us
    case 'whapi':
      opt = { method: 'post', contentType: 'application/json',
              headers: { Authorization: 'Bearer ' + cfg.token },
              payload: JSON.stringify({ to: cfg.to, body: texto }),
              muteHttpExceptions: true };
      res = UrlFetchApp.fetch('https://gate.whapi.cloud/messages/text', opt);
      break;

    // Green API — WA_INSTANCE = idInstance, WA_TOKEN = apiTokenInstance
    case 'greenapi':
      url = 'https://api.green-api.com/waInstance' + cfg.instance
          + '/sendMessage/' + cfg.token;
      opt = { method: 'post', contentType: 'application/json',
              payload: JSON.stringify({ chatId: cfg.to, message: texto }),
              muteHttpExceptions: true };
      res = UrlFetchApp.fetch(url, opt);
      break;

    // Telegram — alternativa oficial y gratuita si el grupo puede migrar.
    case 'telegram':
      url = 'https://api.telegram.org/bot' + cfg.token + '/sendMessage';
      opt = { method: 'post', contentType: 'application/json',
              payload: JSON.stringify({ chat_id: cfg.to, text: texto,
                                        parse_mode: 'Markdown' }),
              muteHttpExceptions: true };
      res = UrlFetchApp.fetch(url, opt);
      break;

    // Webhook genérico (Google Chat, Slack, n8n, Make…) — WA_TO = URL
    case 'webhook':
      opt = { method: 'post', contentType: 'application/json',
              payload: JSON.stringify({ text: texto }),
              muteHttpExceptions: true };
      res = UrlFetchApp.fetch(cfg.to, opt);
      break;

    default:
      return { ok: false, detalle: 'Proveedor no reconocido: ' + cfg.provider };
  }

  var code = res.getResponseCode();
  var body = String(res.getContentText() || '').substring(0, 300);
  // CallMeBot responde 200 con el texto del error en el cuerpo.
  var okBody = !/error|fail|invalid|not\s+found/i.test(body);
  return { ok: code >= 200 && code < 300 && okBody, detalle: code + ' ' + body };
}

/* ══════════════════════════════════════════════════════════════════════
   6. Horario de silencio, cola y resumen
   ══════════════════════════════════════════════════════════════════════ */
function waTZ_() { return Session.getScriptTimeZone() || 'America/Bogota'; }

function waRecortar_(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.substring(0, n - 1) + '…' : s;
}

/* "dd/MM/yyyy" o Date → días entre ambas (null si no se pueden leer). */
function waDiasEntre_(desde, hasta) {
  var a = waFecha_(desde), b = waFecha_(hasta);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
function waFecha_(v) {
  if (!v) return null;
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* rango "21:00-06:00" (puede cruzar medianoche) */
function waEnSilencio_(rango) {
  if (!rango || rango.indexOf('-') < 0) return false;
  var p = rango.split('-');
  var mm = function(s) { var x = s.trim().split(':'); return Number(x[0]) * 60 + Number(x[1] || 0); };
  var ini = mm(p[0]), fin = mm(p[1]);
  var now = new Date();
  var act = Number(Utilities.formatDate(now, waTZ_(), 'H')) * 60 +
            Number(Utilities.formatDate(now, waTZ_(), 'm'));
  return ini <= fin ? (act >= ini && act < fin) : (act >= ini || act < fin);
}

function waEncolar_(texto) {
  var p = PropertiesService.getScriptProperties();
  var q = [];
  try { q = JSON.parse(p.getProperty('WA_COLA') || '[]'); } catch (e) { q = []; }
  q.push(texto);
  while (q.length > 25) q.shift();                 // tope: propiedades ~9 KB
  p.setProperty('WA_COLA', JSON.stringify(q));
}

/* Vacía la cola. Programar con trigger horario (ej. 7 a.m.). */
function enviarResumenWhatsApp() {
  var p = PropertiesService.getScriptProperties();
  var q = [];
  try { q = JSON.parse(p.getProperty('WA_COLA') || '[]'); } catch (e) { q = []; }
  if (!q.length) return;
  p.deleteProperty('WA_COLA');

  var cfg   = waConfig_();
  var titulo = cfg.perfil === 'proa' ? '📋 *PROA · resumen de prescripciones*'
                                     : '📋 *Tecnovigilancia · resumen de reportes*';
  var texto = titulo + '\n'
            + '_' + Utilities.formatDate(new Date(), waTZ_(), 'dd/MM/yyyy HH:mm') + '_\n'
            + '(' + q.length + ' registro' + (q.length === 1 ? '' : 's') + ')\n\n'
            + q.join('\n\n───────\n\n');

  var r = waEnviar_(texto, cfg);
  waLog_(cfg, r.ok ? 'RESUMEN' : 'FALLO', q.length + ' mensajes · ' + r.detalle);
  if (!r.ok) { q.forEach(waEncolar_); waAvisarFallo_(cfg, r.detalle, texto); }
}

/* ══════════════════════════════════════════════════════════════════════
   7. Antiduplicados, bitácora y avisos de fallo
   ══════════════════════════════════════════════════════════════════════ */
function waYaProcesada_(fila) {
  if (fila < 0) return false;
  return PropertiesService.getScriptProperties().getProperty('WA_ULT_FILA') === String(fila);
}
function waMarcarProcesada_(fila) {
  if (fila > 0) PropertiesService.getScriptProperties().setProperty('WA_ULT_FILA', String(fila));
}

/* Bitácora en la hoja "LogWhatsApp" (se crea sola). Nunca guarda datos del paciente. */
function waLog_(cfg, estado, detalle) {
  try {
    var ss  = cfg && cfg.sheetId ? SpreadsheetApp.openById(cfg.sheetId)
                                 : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) { Logger.log(estado + ': ' + detalle); return; }
    var log = ss.getSheetByName('LogWhatsApp');
    if (!log) {
      log = ss.insertSheet('LogWhatsApp');
      log.appendRow(['Fecha', 'Estado', 'Detalle']);
      log.setFrozenRows(1);
    }
    log.appendRow([Utilities.formatDate(new Date(), waTZ_(), 'dd/MM/yyyy HH:mm:ss'),
                   estado, String(detalle).substring(0, 400)]);
    if (log.getLastRow() > 1000) log.deleteRows(2, 200);      // poda
  } catch (err) {
    Logger.log('waLog_ falló: ' + err);
  }
}

/* Máximo un correo por hora, para no inundar la bandeja. */
function waAvisarFallo_(cfg, detalle, texto) {
  if (!cfg.avisarA) return;
  var p   = PropertiesService.getScriptProperties();
  var ult = Number(p.getProperty('WA_ULT_AVISO') || 0);
  if (Date.now() - ult < 3600000) return;
  p.setProperty('WA_ULT_AVISO', String(Date.now()));
  try {
    MailApp.sendEmail(cfg.avisarA, 'HDV · falló la alerta de WhatsApp',
      'No se pudo enviar la alerta al grupo.\n\nRespuesta de la pasarela:\n' + detalle +
      '\n\nMensaje pendiente:\n' + texto);
  } catch (err) {
    Logger.log('waAvisarFallo_ falló: ' + err);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   8. Instalación y pruebas — ejecutar a mano desde el editor
   ══════════════════════════════════════════════════════════════════════ */
function instalarTriggerWhatsApp() {
  var cfg = waConfig_();
  eliminarTriggersWhatsApp();
  var ss = cfg.sheetId ? SpreadsheetApp.openById(cfg.sheetId)
                       : SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onNuevaRespuestaHDV').forSpreadsheet(ss).onFormSubmit().create();
  if (cfg.modo === 'resumen' || cfg.silencio) {
    ScriptApp.newTrigger('enviarResumenWhatsApp').timeBased().atHour(7).everyDays(1).create();
  }
  Logger.log('Triggers instalados sobre: ' + ss.getName());
}

function eliminarTriggersWhatsApp() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) {
    var f = t[i].getHandlerFunction();
    if (f === 'onNuevaRespuestaHDV' || f === 'enviarResumenWhatsApp') ScriptApp.deleteTrigger(t[i]);
  }
}

/* Envía un mensaje de prueba con datos ficticios (no toca la hoja). */
function probarAlertaWhatsApp() {
  var cfg = waConfig_();
  var d, alertas, texto;
  if (cfg.perfil === 'proa') {
    d = waExtraerPROA_(waMapa_({
      'Servicio actual': 'UCI Adultos', 'Nombre Antimicrobiano 1': 'Meropenem',
      'Dosis en miligramos o UI AB1': '1000', 'Frecuencia AM 1 (En Horas)': '8',
      'Días ordenados AM1': '7', 'Vía de adminsitración de  AM1': 'Intravenosa',
      'Indicación del antibiótico': 'Empírica', 'Cultivos tomados:': 'No',
      'Infección nosocomial': 'Sí', 'Ajuste Renal': 'No'
    }));
    alertas = waAlertasPROA_(d);
    texto   = waMensajePROA_(d, alertas, cfg);
  } else {
    d = waExtraerTV_(waMapa_({
      '  Clasificación  ': 'Evento adverso serio',
      'Nombre genérico y/o comercial del dispositivo médico   ': 'PRUEBA — sutura de polipropileno',
      'Nombre o razón social del fabricante   ': 'FABRICANTE DE PRUEBA',
      '  Lote  ': 'LOTE-TEST', '  Referencia  ': 'REF-TEST',
      'Área/Servicio de funcionamiento del dispositivo médico en el momento del evento/incidente  ': 'Salas de Cirugía',
      'Detección del evento/incidente adverso  ': 'Durante el uso del DM',
      'Descripción del evento o incidente adverso   ': 'Mensaje de prueba del bot de alertas. No corresponde a un reporte real.',
      'Desenlace del evento /incidente adverso   ': 'Requiere intervención médica o quirúrgica',
      'Causa probable del evento/incidente': 'Fabricación',
      'Registro sanitario o permiso de comercialización ': 'N/A',
      'Fecha del evento/incidente adverso  ': Utilities.formatDate(new Date(), waTZ_(), 'dd/MM/yyyy'),
      'Fecha de elaboración del reporte  ': Utilities.formatDate(new Date(), waTZ_(), 'dd/MM/yyyy'),
      '  Nombre  ': 'PRUEBA', '  Profesión  ': 'Bot de alertas',
      'Área a la que pertenece   ': 'Calidad'
    }));
    alertas = waAlertasTV_(d);
    texto   = waMensajeTV_(d, alertas, cfg);
  }
  var r = waEnviar_(texto, cfg);
  Logger.log(r.ok ? '✅ Enviado' : '❌ Falló: ' + r.detalle);
  Logger.log('--- Mensaje ---\n' + texto);
  return r;
}

/* Lee la hoja real y comprueba que cada encabezado esperado se resuelva.
   Útil si alguien edita el formulario y cambia los títulos de pregunta. */
function verificarEncabezadosWhatsApp() {
  var cfg   = waConfig_();
  var sheet = waHoja_(cfg);
  if (!sheet) { Logger.log('❌ No se pudo abrir la hoja de respuestas.'); return; }

  var enc = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var m   = {};
  for (var i = 0; i < enc.length; i++) m[waNorm_(enc[i])] = '·';   // valor centinela

  var d = (cfg.perfil === 'proa') ? waExtraerPROA_(m) : waExtraerTV_(m);
  var faltan = [];
  for (var k in d) {
    if (k === 'marca' || k === 'abs') continue;
    if (!d[k]) faltan.push(k);
  }
  Logger.log('Hoja: ' + sheet.getName() + ' (' + enc.length + ' columnas)');
  Logger.log(faltan.length ? '⚠ Campos sin encabezado coincidente: ' + faltan.join(', ')
                           : '✅ Todos los encabezados esperados existen');
  return { hoja: sheet.getName(), faltan: faltan };
}

/* Verifica la configuración sin enviar nada. */
function verificarConfiguracionWhatsApp() {
  var cfg = waConfig_(), faltan = [];
  if (!cfg.provider) faltan.push('WA_PROVIDER');
  if (!cfg.to)       faltan.push('WA_TO');
  if (!cfg.token && cfg.provider !== 'webhook') faltan.push('WA_TOKEN');
  if ((cfg.provider === 'ultramsg' || cfg.provider === 'greenapi') && !cfg.instance) faltan.push('WA_INSTANCE');

  var triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'onNuevaRespuestaHDV' ||
           t.getHandlerFunction() === 'enviarResumenWhatsApp';
  }).length;

  Logger.log('Perfil:    ' + cfg.perfil);
  Logger.log('Hoja:      ' + (cfg.sheetId || '(la del proyecto)'));
  Logger.log('Proveedor: ' + (cfg.provider || '(sin definir)'));
  Logger.log('Destino:   ' + (cfg.to ? cfg.to.substring(0, 6) + '…' : '(sin definir)'));
  Logger.log('Modo:      ' + cfg.modo + (cfg.silencio ? ' · silencio ' + cfg.silencio : ''));
  Logger.log('Incluye datos del paciente: ' + (cfg.incluirPHI ? 'SÍ ⚠' : 'no'));
  Logger.log('Triggers propios instalados: ' + triggers);
  Logger.log(faltan.length ? '❌ Falta configurar: ' + faltan.join(', ')
                           : '✅ Configuración completa');
  return { ok: !faltan.length, faltan: faltan, triggers: triggers };
}

function ayudaConfiguracionWhatsApp() {
  Logger.log([
    'Propiedades del script (Configuración del proyecto → Propiedades del script):',
    '  WA_PERFIL         tecnovigilancia (def.) | proa',
    '  WA_PROVIDER       callmebot | ultramsg | whapi | greenapi | telegram | webhook',
    '  WA_TO             grupo/teléfono/chat_id/URL del webhook, según proveedor',
    '  WA_TOKEN          apikey o token de la pasarela',
    '  WA_INSTANCE       solo ultramsg (instanceXXXXX) y greenapi (idInstance)',
    '  WA_SHEET_ID       hoja de respuestas (por defecto la del perfil)',
    '  WA_GID            gid de la pestaña, si el libro tiene varias',
    '  WA_MODO           instante (def.) | resumen',
    '  WA_SOLO_ALERTAS   true → avisar solo lo que trae banderas',
    '  WA_INCLUDE_PHI    true → incluir datos del paciente (⚠ ver cabecera)',
    '  WA_SILENCIO       ej. 21:00-06:00 → lo no urgente espera al resumen',
    '  WA_ENLACE         URL a la hoja o al dashboard',
    '  WA_EMAIL_FALLOS   correo para avisos si la pasarela falla',
    '',
    'Orden sugerido:',
    '  verificarConfiguracionWhatsApp() → verificarEncabezadosWhatsApp()',
    '  → probarAlertaWhatsApp() → instalarTriggerWhatsApp()'
  ].join('\n'));
}
