/*
 * andamio-dev · kit de validación remota del prototipo
 * https://github.com/vickman2006/andamio-dev (carpeta kit/, mismo tag que la plantilla)
 *
 * No se modifica: se copia tal cual junto a validacion.css. Lo propio del proyecto va en tareas.js.
 *
 * Contrato con el prototipo:
 *   1. Carga, en este orden y al final del <body>:
 *        <link rel="stylesheet" href="kit/validacion.css">   (en el <head>)
 *        <script src="tareas.js"></script>
 *        <script src="kit/validacion.js"></script>
 *      En un hosting, agrega ?v=<n> a esas tres rutas y súbelo al cambiar tareas.js o el kit: el navegador guarda
 *      la versión anterior unos minutos y quien prueba vería tareas o textos viejos.
 *   2. tareas.js define window.TAREAS (un .js y no un .json: así funciona también con doble clic, sin servidor):
 *        window.TAREAS = {
 *          prototipo: "Nombre del producto",                    // opcional
 *          fichas: { "Rol": "Quién eres, qué sabes, qué quieres lograr" },
 *          tareas: [ { id: 1, rol: "Rol", hu: "HU-001", texto: "Inscríbete en un curso" } ]
 *        };
 *      Una tarea sin "rol" aplica a todos los roles.
 *   3. Cada pantalla visible lleva data-pantalla="nombre" (una hoja o un modal abierto también pueden llevarlo).
 *   4. Opcionales:
 *        - data-estado="vacio" en la pantalla o en <body>: el kit lo guarda con cada anotación.
 *        - data-solo-autor en los controles del autor (selector de rol, de estado…): se ocultan durante la prueba.
 *        - document.addEventListener("validacion:rol", e => …): el prototipo se pone en el rol e.detail.rol;
 *          e.detail.nueva es true al empezar la prueba (buen momento para reiniciar los datos de ejemplo)
 *          y false al recargar la página a mitad de la prueba.
 *   La URL con ?rol=<rol> o #rol-<rol> fija el rol (un enlace por persona; el rol se compara sin acentos
 *   ni mayúsculas: #rol-amigo-ana elige «Amigo (Ana)»); con ?autor o #autor el kit no se muestra.
 *   5. Envío opcional de resultados (sin él, nada sale del navegador):
 *        window.TAREAS = { …, prueba: "librero-ronda-3",            // separa pruebas en el mismo receptor
 *          enviar: "https://…",                                       // receptor que acepta POST (ver receptor-google.gs)
 *          enviarA: "una hoja de cálculo del equipo" };               // lo que lee quien prueba en la bienvenida
 *      Cada evento (inicio, tarea, nota, cierre) se envía al ocurrir, con reintentos; «Copiar resultados» sigue
 *      como respaldo. Una página de claude.ai no puede enviar (bloquea otros dominios): usa un hosting estático.
 *
 * Qué registra: el rol elegido y las respuestas (resultado, facilidad 1–7, tiempo y notas por tarea;
 * anotaciones con tarea, pantalla y estado; un comentario final) y un id de sesión aleatorio. Sin capturas
 * ni datos personales. Sin «enviar», todo queda en el navegador (localStorage) hasta que la persona copia o
 * descarga resultados-<rol>-<fecha>.md.
 */
(function () {
  'use strict';
  if (window.__validacionKit) return;
  window.__validacionKit = true;

  var params = new URLSearchParams(location.search);
  var hash = '';
  try { hash = decodeURIComponent((location.hash || '').slice(1)); } catch (e) { hash = ''; }
  if (params.has('autor') || hash === 'autor') return;
  var rolUrl = params.get('rol') || (hash.indexOf('rol-') === 0 ? hash.slice(4) : null);
  var ignorarRolUrl = false; // tras «Probar con otro rol», la persona elige en la bienvenida

  var CLAVE = 'validacion:' + location.pathname.replace(/[^\/]*$/, '');
  var RESULTADOS = { si: 'Sí', dificultad: 'Con dificultad', no: 'No' };
  var TIPOS = { problema: 'Problema', comentario: 'Comentario', duda: 'Duda' };
  var datos = window.TAREAS;
  var ENVIAR = datos && typeof datos.enviar === 'string' && /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:\/])/.test(datos.enviar) ? datos.enviar : '';
  var raiz, st, nota = null, aviso = '', confirmarReinicio = false, enviando = false, falloEnvio = false;

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function leer() {
    try { var j = localStorage.getItem(CLAVE); return j ? JSON.parse(j) : null; } catch (e) { return null; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(st)); } catch (e) { /* sin almacenamiento: queda en memoria */ }
  }
  function nuevo() {
    return { v: 1, fase: 'bienvenida', rol: null, i: 0, res: {}, notas: [], cierre: '', min: false, inicio: null, fin: null,
      sesion: null, pend: [], enviados: 0, n: 0 };
  }
  function idSesion() {
    try {
      var b = new Uint8Array(8); crypto.getRandomValues(b);
      return Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    } catch (e) { return String(Date.now()) + Math.random().toString(16).slice(2, 8); }
  }

  // ---------- envío opcional ----------
  // Cada evento lleva un id único (sesión + número) para que el receptor descarte duplicados de un reintento.
  function encolar(tipo, campos) {
    if (!ENVIAR) return;
    st.n = (st.n || 0) + 1;
    var ev = { id: st.sesion + '-' + st.n, prueba: datos.prueba || datos.prototipo || '', sesion: st.sesion, rol: st.rol,
      tipo: tipo, t: new Date().toISOString() };
    for (var k in campos) if (Object.prototype.hasOwnProperty.call(campos, k)) ev[k] = campos[k];
    st.pend.push(ev);
  }
  function vaciar() {
    if (!ENVIAR || enviando || !st.pend || !st.pend.length) return;
    enviando = true;
    var lote = st.pend.slice(0, 20);
    // text/plain y no-cors: sin preflight de CORS (Apps Script no lo responde). La respuesta es opaca:
    // «enviado» significa que salió sin error de red.
    fetch(ENVIAR, { method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ eventos: lote }) })
      .then(function () {
        st.pend = st.pend.slice(lote.length); st.enviados = (st.enviados || 0) + lote.length;
        enviando = false; falloEnvio = false; guardar(); mostrarEnvio();
        if (st.pend.length) vaciar();
      }, function () { enviando = false; falloEnvio = true; mostrarEnvio(); });
  }
  function textoEnvio() {
    if (!ENVIAR || !st || !st.sesion) return '';
    if (st.pend && st.pend.length) return falloEnvio ? 'Sin conexión: se reintentará' : 'Enviando…';
    return st.enviados ? 'Respuestas enviadas' : '';
  }
  function mostrarEnvio() {
    var els = raiz ? raiz.querySelectorAll('.vk-envio') : [];
    for (var k = 0; k < els.length; k++) els[k].textContent = textoEnvio();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fecha(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hora(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function duracion(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60);
    return m ? m + ' min ' + (s % 60) + ' s' : s + ' s';
  }
  // Compara roles sin acentos ni mayúsculas, y acepta «ni» por «ñ» (#rol-duenio = «Dueño»).
  function clave(s) { return slug(s).replace(/ni/g, 'n'); }
  function rolPedido() {
    if (!rolUrl || ignorarRolUrl) return null;
    var f = null;
    roles().forEach(function (x) { if (x === rolUrl || clave(x) === clave(rolUrl)) f = x; });
    return f;
  }
  function slug(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rol';
  }
  function celda(s) {
    var t = String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();
    return t || '—';
  }

  // ---------- datos ----------
  function roles() {
    var r = Object.keys(datos.fichas || {});
    datos.tareas.forEach(function (t) { if (t.rol && r.indexOf(t.rol) < 0) r.push(t.rol); });
    return r;
  }
  function tareasRol() {
    return datos.tareas.filter(function (t) { return !t.rol || t.rol === st.rol; });
  }
  function tareaActual() { return tareasRol()[st.i] || null; }
  function ficha(rol) { return (datos.fichas || {})[rol] || ''; }

  // Pantalla y estado se leen del prototipo al anotar: data-pantalla visibles y data-estado más cercano.
  function contexto() {
    var vis = Array.prototype.filter.call(document.querySelectorAll('[data-pantalla]'), function (el) {
      return !raiz.contains(el) && el.getClientRects().length > 0;
    });
    var nombres = [];
    vis.forEach(function (el) { var n = el.getAttribute('data-pantalla'); if (n && nombres.indexOf(n) < 0) nombres.push(n); });
    var conEstado = null;
    for (var k = vis.length - 1; k >= 0 && !conEstado; k--) conEstado = vis[k].closest('[data-estado]');
    if (!conEstado) conEstado = document.body.closest('[data-estado]') || document.documentElement.closest('[data-estado]');
    var t = tareaActual();
    return {
      pantalla: nombres.join(' › ') || '(sin data-pantalla)',
      estado: conEstado ? conEstado.getAttribute('data-estado') : '',
      tarea: st.fase === 'tarea' || st.fase === 'evaluar' ? (t ? t.id : '') : (st.fase === 'cierre' || st.fase === 'fin' ? 'cierre' : '')
    };
  }

  // nueva: true al empezar la prueba (el prototipo puede reiniciar sus datos); false al recargar a mitad.
  function avisarRol(nueva) {
    if (!st.rol) return;
    try { document.dispatchEvent(new CustomEvent('validacion:rol', { detail: { rol: st.rol, nueva: !!nueva } })); } catch (e) { /* navegador antiguo */ }
  }

  // ---------- resultados ----------
  function markdown() {
    var ts = tareasRol(), L = [], c = { si: 0, dificultad: 0, no: 0, sin: 0 }, suma = 0, nf = 0;
    ts.forEach(function (t) {
      var r = st.res[t.id];
      if (r && r.resultado) c[r.resultado]++; else c.sin++;
      if (r && r.facilidad) { suma += r.facilidad; nf++; }
    });
    L.push('# Resultados de la prueba' + (datos.prototipo ? ' · ' + datos.prototipo : ''), '');
    L.push('- **Rol:** ' + st.rol);
    L.push('- **Fecha:** ' + fecha(st.inicio) + ' ' + hora(st.inicio) + (st.fin ? ' (duración ' + duracion(st.fin - st.inicio) + ')' : ''));
    L.push('- **Página:** ' + (location.pathname.split('/').pop() || 'index.html'));
    L.push('- **Tareas:** ' + ts.length + ' · logradas ' + c.si + ' · con dificultad ' + c.dificultad + ' · no logradas ' + c.no +
      (c.sin ? ' · sin responder ' + c.sin : '') + (nf ? ' · facilidad promedio ' + (suma / nf).toFixed(1) + ' de 7' : ''));
    L.push('', '## Tareas', '', '| # | HU | Tarea | ¿La logró? | Facilidad (1–7) | Tiempo | Nota |', '|---|---|---|---|---|---|---|');
    ts.forEach(function (t) {
      var r = st.res[t.id] || {};
      L.push('| ' + [celda(t.id), celda(t.hu), celda(t.texto), celda(RESULTADOS[r.resultado] || 'Sin responder'),
        celda(r.facilidad), celda(r.ms != null ? duracion(r.ms) : ''), celda(r.nota)].join(' | ') + ' |');
    });
    L.push('', '## Anotaciones', '');
    if (!st.notas.length) L.push('(ninguna)');
    else {
      L.push('| Hora | Tipo | Tarea | Pantalla | Estado | Texto |', '|---|---|---|---|---|---|');
      st.notas.forEach(function (n) {
        L.push('| ' + [celda(hora(n.t)), celda(TIPOS[n.tipo]), celda(n.tarea), celda(n.pantalla), celda(n.estado), celda(n.texto)].join(' | ') + ' |');
      });
    }
    L.push('', '## Comentario final', '', st.cierre.trim() || '(sin comentario)', '');
    L.push('_Generado por el kit de validación de andamio-dev. Solo contiene el rol y las respuestas._', '');
    return L.join('\n');
  }
  function nombreArchivo() { return 'resultados-' + slug(st.rol) + '-' + fecha(st.fin || Date.now()) + '.md'; }
  function descargar() {
    try {
      var url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url; a.download = nombreArchivo();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      aviso = 'Si no se descargó, usa «Copiar resultados» y pégalos en un correo o mensaje.';
    } catch (e) {
      aviso = 'Este navegador no permitió descargar: usa «Copiar resultados».';
    }
    pintar();
  }
  function copiar() {
    var texto = markdown();
    var listo = function () { aviso = 'Copiado. Pégalo en un correo o mensaje para quien te invitó.'; pintar(); };
    var manual = function () {
      aviso = 'Selecciona el texto de «Ver resultados» y cópialo.'; pintar(true);
      var ta = raiz.querySelector('.vk-salida');
      if (ta) { ta.closest('details').open = true; ta.focus(); ta.select(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, manual);
    else manual();
  }

  // ---------- vistas ----------
  function vistaBienvenida() {
    var rs = roles(), fijo = rolPedido();
    if (fijo) st.rol = fijo;
    else if (rs.length === 1) st.rol = rs[0];
    var elegir = !fijo && rs.length > 1;
    var n = st.rol ? tareasRol().length : 0;
    return '<div class="vk-fondo"><div class="vk-dialogo" role="dialog" aria-modal="true" aria-labelledby="vk-titulo">' +
      '<h2 id="vk-titulo">Prueba del prototipo</h2>' +
      (datos.prototipo ? '<p class="vk-sub">' + esc(datos.prototipo) + '</p>' : '') +
      '<p>Vas a hacer algunas tareas en un prototipo: las pantallas y los datos son de ejemplo y nada se guarda de verdad. ' +
      'No hay respuestas incorrectas: si algo no se entiende, es un problema del diseño, no tuyo.</p>' +
      '<p>Mientras pruebas, usa <b>Anotar</b> cuando dudes, algo falle o quieras comentar algo.</p>' +
      (ENVIAR
        ? '<p class="vk-priv">Solo se piden el rol y tus respuestas, sin capturas. Mientras pruebas, tus respuestas se envían a ' +
          esc(datos.enviarA || 'quien te invitó') + '. No escribas datos personales en las notas. Si el envío falla, al final puedes copiar los resultados.</p>'
        : '<p class="vk-priv">Solo se registran el rol y tus respuestas: sin capturas y sin enviar nada por internet. ' +
          'No escribas datos personales en las notas. Al final copias o descargas los resultados y se los envías a quien te invitó.</p>') +
      (elegir ? '<fieldset class="vk-grupo"><legend>¿Qué rol vas a representar?</legend>' + rs.map(function (r) {
        return '<label class="vk-opcion"><input type="radio" name="vk-rol" value="' + esc(r) + '"' + (st.rol === r ? ' checked' : '') + '> ' + esc(r) + '</label>';
      }).join('') + '</fieldset>' : '') +
      (st.rol ? '<div class="vk-ficha"><p class="vk-etq">Tu rol: ' + esc(st.rol) + '</p><p>' + esc(ficha(st.rol)) + '</p>' +
        '<p class="vk-sub">' + n + ' tarea' + (n === 1 ? '' : 's') + '</p></div>' : '') +
      '<div class="vk-acciones"><button type="button" class="vk-btn vk-pri" data-vk="empezar"' + (st.rol && n ? '' : ' disabled') + '>Empezar</button></div>' +
      '</div></div>';
  }

  function cabecera(titulo) {
    return '<header class="vk-cab"><span class="vk-cab-t">' + titulo + '</span>' +
      '<button type="button" class="vk-icono" data-vk="min" aria-label="' + (st.min ? 'Mostrar el panel' : 'Minimizar el panel') + '">' + (st.min ? '▴' : '▾') + '</button></header>';
  }

  function vistaPanel() {
    var ts = tareasRol(), t = tareaActual(), cuerpo = '', titulo = 'Prueba · ' + esc(st.rol);
    if (st.fase === 'tarea' && t) {
      titulo = 'Tarea ' + (st.i + 1) + ' de ' + ts.length;
      var otro = rolPedido();
      cuerpo = (otro && otro !== st.rol ? '<p class="vk-aviso">Estás probando como ' + esc(st.rol) + '. Para cambiar a ' + esc(otro) + ', termina esta prueba.</p>' : '') +
        (t.hu ? '<p class="vk-etq">' + esc(t.hu) + '</p>' : '') + '<p class="vk-texto">' + esc(t.texto) + '</p>' +
        '<div class="vk-acciones"><button type="button" class="vk-btn vk-pri" data-vk="termine">Terminé</button>' +
        '<button type="button" class="vk-btn" data-vk="nopude">No pude</button></div>' +
        '<details class="vk-mas"><summary>Tu rol: ' + esc(st.rol) + '</summary><p>' + esc(ficha(st.rol)) + '</p></details>';
    } else if (st.fase === 'evaluar' && t) {
      var r = st.res[t.id] || {};
      titulo = 'Tarea ' + (st.i + 1) + ' de ' + ts.length;
      cuerpo = '<p class="vk-texto vk-tenue">' + esc(t.texto) + '</p>' +
        '<fieldset class="vk-grupo"><legend>¿Lograste hacerla?</legend>' + Object.keys(RESULTADOS).map(function (k) {
          return '<label class="vk-opcion"><input type="radio" name="vk-res" value="' + k + '"' + (r.resultado === k ? ' checked' : '') + '> ' + RESULTADOS[k] + '</label>';
        }).join('') + '</fieldset>' +
        '<fieldset class="vk-grupo"><legend>¿Qué tan fácil fue?</legend><div class="vk-escala">' + [1, 2, 3, 4, 5, 6, 7].map(function (k) {
          return '<label><input type="radio" name="vk-fac" value="' + k + '"' + (r.facilidad === k ? ' checked' : '') + '><span>' + k + '</span></label>';
        }).join('') + '</div><div class="vk-escala-ext"><span>Muy difícil</span><span>Muy fácil</span></div></fieldset>' +
        '<label class="vk-campo">Nota (opcional)<textarea name="vk-nota" rows="2" placeholder="¿Dónde dudaste? ¿Qué esperabas encontrar?">' + esc(r.nota || '') + '</textarea></label>' +
        (aviso ? '<p class="vk-aviso" role="alert">' + esc(aviso) + '</p>' : '') +
        '<div class="vk-acciones"><button type="button" class="vk-btn vk-pri" data-vk="siguiente">' + (st.i + 1 < ts.length ? 'Siguiente tarea' : 'Continuar') + '</button>' +
        '<button type="button" class="vk-btn" data-vk="volver">Volver a la tarea</button></div>';
    } else if (st.fase === 'cierre') {
      titulo = 'Última pregunta';
      cuerpo = '<label class="vk-campo">¿Algo más que quieras decir sobre la app?<textarea name="vk-cierre" rows="4">' + esc(st.cierre) + '</textarea></label>' +
        '<div class="vk-acciones"><button type="button" class="vk-btn vk-pri" data-vk="terminar">Terminar</button></div>';
    } else if (st.fase === 'fin') {
      titulo = '¡Gracias!';
      cuerpo = (ENVIAR
          ? '<p>Tus respuestas ya se enviaron a ' + esc(datos.enviarA || 'quien te invitó') + '. Si quien te invitó no las recibe, copia los resultados y mándaselos.</p>'
          : '<p>Copia o descarga tus resultados y envíaselos a quien te invitó.</p>') +
        (ENVIAR ? '<p class="vk-envio vk-ok" role="status">' + esc(textoEnvio()) + '</p>' : '') +
        '<div class="vk-acciones vk-col"><button type="button" class="vk-btn vk-pri" data-vk="descargar">Descargar resultados</button>' +
        '<button type="button" class="vk-btn" data-vk="copiar">Copiar resultados</button></div>' +
        (aviso ? '<p class="vk-aviso" role="status">' + esc(aviso) + '</p>' : '') +
        '<details class="vk-mas"><summary>Ver resultados</summary><textarea class="vk-salida" rows="8" readonly>' + esc(markdown()) + '</textarea></details>' +
        (rolPedido() && rolPedido() !== st.rol ? '<p class="vk-aviso">Para probar como ' + esc(rolPedido()) + ', copia antes tus resultados si no se enviaron y pulsa «Probar con otro rol».</p>' : '') +
        '<p class="vk-reinicio"><button type="button" class="vk-btn" data-vk="reiniciar">' +
        (confirmarReinicio
          ? (ENVIAR && st.enviados && !st.pend.length ? 'Tus respuestas ya se enviaron. Confirmar' : '¿Copiaste tus resultados? Se borran de este navegador. Confirmar')
          : 'Probar con otro rol') + '</button></p>';
    }
    return '<aside class="vk-panel' + (st.min ? ' vk-min' : '') + '" aria-label="Prueba del prototipo">' + cabecera(titulo) +
      (st.min ? '' : '<div class="vk-cuerpo">' + cuerpo + '</div>') +
      '<footer class="vk-pie"><button type="button" class="vk-btn vk-anotar" data-vk="anotar">✎ Anotar</button>' +
      (ENVIAR && st.fase !== 'fin' ? '<span class="vk-envio vk-sub" role="status">' + esc(textoEnvio()) + '</span>' : '') +
      (aviso && st.fase !== 'evaluar' && st.fase !== 'fin' ? '<span class="vk-ok" role="status">' + esc(aviso) + '</span>' : '') + '</footer></aside>';
  }

  function vistaNota() {
    return '<div class="vk-fondo vk-ligero"><div class="vk-dialogo" role="dialog" aria-modal="true" aria-labelledby="vk-nota-t">' +
      '<h2 id="vk-nota-t">Anotar</h2>' +
      '<fieldset class="vk-grupo vk-fila"><legend>Tipo</legend>' + Object.keys(TIPOS).map(function (k) {
        return '<label class="vk-opcion"><input type="radio" name="vk-tipo" value="' + k + '"' + (nota.tipo === k ? ' checked' : '') + '> ' + TIPOS[k] + '</label>';
      }).join('') + '</fieldset>' +
      '<label class="vk-campo">¿Qué pasó o qué piensas?<textarea name="vk-texto" rows="4">' + esc(nota.texto) + '</textarea></label>' +
      '<p class="vk-sub">Se guarda con: ' + (nota.tarea ? 'tarea ' + esc(nota.tarea) + ' · ' : '') + 'pantalla «' + esc(nota.pantalla) + '»' +
      (nota.estado ? ' · estado «' + esc(nota.estado) + '»' : '') + '.</p>' +
      (nota.error ? '<p class="vk-aviso" role="alert">' + esc(nota.error) + '</p>' : '') +
      '<div class="vk-acciones"><button type="button" class="vk-btn vk-pri" data-vk="guardar-nota">Guardar</button>' +
      '<button type="button" class="vk-btn" data-vk="cancelar-nota">Cancelar</button></div></div></div>';
  }

  function vistaError(msg) {
    return '<aside class="vk-panel" aria-label="Kit de validación"><header class="vk-cab"><span class="vk-cab-t">Kit de validación</span></header>' +
      '<div class="vk-cuerpo"><p class="vk-aviso">' + esc(msg) + '</p></div></aside>';
  }

  function ladoActivo() { return st.fase !== 'bienvenida' && !st.min && window.innerWidth >= 900; }

  // sinFoco: no mover el foco (al cargar la página, para no quitárselo al prototipo).
  function pintar(sinFoco) {
    var activo = document.activeElement;
    var nombre = activo && raiz.contains(activo) ? activo.name || activo.getAttribute('data-vk') : null;
    var html = st.fase === 'bienvenida' ? vistaBienvenida() : vistaPanel();
    if (nota) html += vistaNota();
    raiz.innerHTML = html;
    document.documentElement.classList.toggle('vk-lado', ladoActivo());
    if (sinFoco) return;
    var foco = null;
    if (nota) foco = raiz.querySelector('[name="vk-texto"]');
    else if (nombre) foco = raiz.querySelector('[name="' + nombre + '"]:checked') || raiz.querySelector('[name="' + nombre + '"]') || raiz.querySelector('[data-vk="' + nombre + '"]');
    if (!foco && st.fase === 'bienvenida') foco = raiz.querySelector('[data-vk="empezar"]:not([disabled])') || raiz.querySelector('[name="vk-rol"]');
    if (!foco) foco = raiz.querySelector('.vk-cuerpo input, .vk-cuerpo textarea, .vk-cuerpo button') || raiz.querySelector('[data-vk="anotar"]');
    if (foco) foco.focus();
  }

  // ---------- acciones ----------
  function leerEvaluacion(t) {
    var r = st.res[t.id] || {};
    var res = raiz.querySelector('[name="vk-res"]:checked'), fac = raiz.querySelector('[name="vk-fac"]:checked'), nt = raiz.querySelector('[name="vk-nota"]');
    if (res) r.resultado = res.value;
    if (fac) r.facilidad = Number(fac.value);
    if (nt) r.nota = nt.value;
    st.res[t.id] = r;
    return r;
  }

  function accion(a) {
    var t = tareaActual();
    // Lo que la persona ya marcó o escribió no se pierde al cambiar de vista.
    if (st.fase === 'evaluar' && t && !nota) leerEvaluacion(t);
    if (st.fase === 'cierre') { var cc = raiz.querySelector('[name="vk-cierre"]'); if (cc) st.cierre = cc.value; }
    if (a !== 'descargar' && a !== 'copiar') aviso = '';
    if (a !== 'reiniciar') confirmarReinicio = false;
    switch (a) {
      case 'empezar':
        if (!st.rol) return;
        st.fase = 'tarea'; st.i = 0; st.inicio = Date.now(); st.sesion = idSesion();
        encolar('inicio', { tareas: tareasRol().length });
        avisarRol(true); marcarInicio(); break;
      case 'min': st.min = !st.min; break;
      case 'termine':
      case 'nopude':
        if (!t) return;
        var r = st.res[t.id] || (st.res[t.id] = {});
        r.ms = Date.now() - (r.t0 || Date.now());
        if (a === 'nopude') r.resultado = 'no';
        st.fase = 'evaluar'; break;
      case 'volver': st.fase = 'tarea'; break;
      case 'siguiente':
        var ev = st.res[t.id] || {};
        if (!ev.resultado || !ev.facilidad) { aviso = 'Elige si la lograste y qué tan fácil fue.'; break; }
        encolar('tarea', { tarea: t.id, hu: t.hu || '', resultado: ev.resultado, facilidad: ev.facilidad,
          segundos: ev.ms != null ? Math.round(ev.ms / 1000) : '', texto: ev.nota || '' });
        if (st.i + 1 < tareasRol().length) { st.i++; st.fase = 'tarea'; marcarInicio(); } else st.fase = 'cierre';
        break;
      case 'terminar':
        st.fase = 'fin'; st.fin = Date.now();
        encolar('cierre', { texto: st.cierre || '', segundos: Math.round((st.fin - st.inicio) / 1000) }); break;
      case 'descargar': descargar(); return;
      case 'copiar': copiar(); return;
      case 'reiniciar':
        if (!confirmarReinicio) { confirmarReinicio = true; break; }
        confirmarReinicio = false; st = nuevo(); ignorarRolUrl = true;
        try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
        pintar(); return;
      case 'anotar':
        var ctx = contexto();
        nota = { tipo: 'problema', texto: '', tarea: ctx.tarea, pantalla: ctx.pantalla, estado: ctx.estado };
        break;
      case 'cancelar-nota': nota = null; break;
      case 'guardar-nota':
        var tipo = raiz.querySelector('[name="vk-tipo"]:checked'), tx = raiz.querySelector('[name="vk-texto"]');
        nota.tipo = tipo ? tipo.value : 'problema'; nota.texto = tx ? tx.value : '';
        if (!nota.texto.trim()) { nota.error = 'Escribe qué pasó o qué piensas.'; break; }
        st.notas.push({ t: Date.now(), tipo: nota.tipo, texto: nota.texto.trim(), tarea: nota.tarea, pantalla: nota.pantalla, estado: nota.estado });
        encolar('nota', { tarea: nota.tarea, pantalla: nota.pantalla, estado: nota.estado, tipo_nota: nota.tipo, texto: nota.texto.trim() });
        nota = null; aviso = 'Anotado ✓'; break;
      default: return;
    }
    guardar(); pintar(); vaciar();
  }

  function marcarInicio() {
    var t = tareaActual();
    if (t) { var r = st.res[t.id] || (st.res[t.id] = {}); if (!r.t0) r.t0 = Date.now(); }
  }

  // ---------- arranque ----------
  function iniciar() {
    raiz = document.createElement('div');
    raiz.className = 'vk';
    raiz.id = 'vk-raiz';
    document.body.appendChild(raiz);
    document.documentElement.classList.add('vk-activa');

    var valido = datos && Array.isArray(datos.tareas) && datos.tareas.length &&
      datos.tareas.every(function (t) { return t && t.id != null && t.texto; });
    if (!valido) {
      console.error('[validación] Falta window.TAREAS válido: { fichas: {rol: texto}, tareas: [{id, rol, hu, texto}] }. ¿Se cargó tareas.js antes del kit?');
      st = nuevo();
      raiz.innerHTML = vistaError('No se encontraron las tareas de la prueba (tareas.js). Avísale a quien te invitó.');
      return;
    }

    st = leer() || nuevo();
    if (st.v !== 1) st = nuevo();
    if (!Array.isArray(st.pend)) st.pend = [];
    if (st.fase !== 'bienvenida' && !st.sesion) st.sesion = idSesion();
    // Un enlace con otro rol abre una prueba nueva si la anterior terminó y sus respuestas ya se enviaron.
    var pedido = rolPedido();
    if (pedido && st.rol && pedido !== st.rol && st.fase === 'fin' && ENVIAR && st.enviados && !st.pend.length) { st = nuevo(); guardar(); }

    raiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vk]');
      if (b && raiz.contains(b) && !b.disabled) accion(b.getAttribute('data-vk'));
    });
    raiz.addEventListener('change', function (e) {
      if (e.target.name === 'vk-rol') { st.rol = e.target.value; guardar(); pintar(); }
    });
    raiz.addEventListener('input', function (e) {
      // Conserva lo escrito si la persona recarga o cambia de página a media respuesta.
      if (e.target.name === 'vk-cierre') { st.cierre = e.target.value; guardar(); }
      if (e.target.name === 'vk-nota' && tareaActual()) { (st.res[tareaActual().id] = st.res[tareaActual().id] || {}).nota = e.target.value; guardar(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nota) { nota = null; pintar(); }
    });
    var tm;
    window.addEventListener('resize', function () { clearTimeout(tm); tm = setTimeout(function () {
      document.documentElement.classList.toggle('vk-lado', ladoActivo());
    }, 150); });

    if (st.fase !== 'bienvenida') { avisarRol(false); marcarInicio(); guardar(); }
    pintar(st.fase !== 'bienvenida');
    vaciar();
    window.addEventListener('online', vaciar);
    // Cambiar solo el #rol-… no recarga la página: se recarga para aplicarlo.
    window.addEventListener('hashchange', function () {
      var h = ''; try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { h = ''; }
      if (h === 'autor' || h.indexOf('rol-') === 0) location.reload();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
