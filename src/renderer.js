'use strict';

// ---- píldora deslizante compartida por .tabs y .subtabs ----
// Crea un <span class="tab-indicator"> dentro del contenedor y lo mueve con
// translateX/width para que cambiar de pestaña sea un deslizamiento en vez
// de un salto. Devuelve una función `update()` para llamar cada vez que
// cambia cuál botón está activo (incluye la posición inicial).
function initSlidingIndicator(container, itemSelector) {
  if (!container) return () => {};
  const indicator = document.createElement('span');
  indicator.className = 'tab-indicator';
  container.insertBefore(indicator, container.firstChild);

  // `instant=true` reposiciona sin animar (carga inicial, resize, o cuando
  // el contenedor estaba oculto con display:none y recién se muestra).
  // Sin argumento anima el deslizamiento — es el caso normal de un click.
  function update(instant) {
    const active = container.querySelector(`${itemSelector}[data-active="true"]`);
    if (instant) indicator.style.transition = 'none';
    if (!active) {
      indicator.style.width = '0';
    } else {
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    }
    if (instant) {
      void indicator.offsetWidth; // fuerza el reflow antes de restaurar la transición
      indicator.style.transition = '';
    }
  }

  update(true);
  window.addEventListener('resize', () => update(true));
  return update;
}

// ---- navegación entre pestañas (Chatlog / Editor de capturas) ----

const viewTabs = document.getElementById('viewTabs');
// Genérico: cualquier <main class="applayout view" data-view-id="…"> se
// activa/desactiva solo con que su data-view-id matchee el data-view del
// tab clickeado — así sumar una pestaña nueva (como "Inventario") no
// requiere tocar esta lógica de nuevo.
const appViews = document.querySelectorAll('.applayout[data-view-id]');
const updateTabIndicator = initSlidingIndicator(viewTabs, '.tab');

viewTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  const target = tab.dataset.view;
  viewTabs.querySelectorAll('.tab').forEach((t) => (t.dataset.active = String(t === tab)));
  updateTabIndicator();
  appViews.forEach((view) => {
    view.dataset.active = String(view.dataset.viewId === target);
  });

  // El panel de Inventario (y sus subpestañas) estaba con display:none
  // mientras no era la vista activa, así que su propia píldora deslizante
  // se midió con ancho 0. Al mostrarlo ahora, la recalculamos al toque
  // (sin animar) para que aparezca ya en su lugar correcto.
  if (target === 'inventory' && window.updateInvSubtabIndicator) {
    window.updateInvSubtabIndicator(true);
  }

  // En el editor de capturas la ventana queda fija en maximizado (no se
  // puede restaurar); en el resto de las pestañas vuelve a ser una ventana
  // normal.
  if (window.signalLog && window.signalLog.setMaximizeLock) {
    window.signalLog.setMaximizeLock(target === 'editor').catch(() => {});
  }
});

const logArea = document.getElementById('logArea');
const logEmpty = document.getElementById('logEmpty');
const searchInput = document.getElementById('searchInput');
const filterRow = document.getElementById('filterRow');
const parseBtn = document.getElementById('parseBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const clearAutosaveBtn = document.getElementById('clearAutosaveBtn');
const exportBtn = document.getElementById('exportBtn');
const stripTimestampToggle = document.getElementById('stripTimestampToggle');

let stripChatTimestamps = true;

/** cada entrada: { ts, text, type, marker } */
const entries = [];
let activeFilters = { say: true, ooc: false, rol: true, other: false };
let searchQuery = '';

// El chat de FiveM suele traer su propio timestamp embebido al inicio de
// cada línea, ej. "[07:12:12] Fulano dice: ...". Esto lo retira de la línea
// capturada (no es el reloj de la app, es el que trae el chatlog en sí).
const CHAT_TIMESTAMP_RE = /^\s*\[\d{1,2}:\d{2}(:\d{2})?\]\s*/;

function stripChatTimestamp(text) {
  return text.replace(CHAT_TIMESTAMP_RE, '');
}

function getDisplayText(entry) {
  return stripChatTimestamps ? stripChatTimestamp(entry.text) : entry.text;
}

function classifyLine(text) {
  // Clasificamos sobre el contenido SIN el timestamp de FiveM, sin importar
  // si el usuario tiene activado "Quitar [hh:mm:ss]" para mostrarlo o no —
  // si no, una línea como "[07:12:12] *Fulano se sienta" nunca matcheaba
  // "empieza con *" (empezaba con "[") y terminaba cayendo en "Otro".
  const trimmed = stripChatTimestamp(text).trim();
  if (trimmed.startsWith('*')) return 'rol';
  if (/^\(\(|\)\)$|^\[OOC\]/i.test(trimmed)) return 'ooc';
  if (/dice:|pregunta:|grita:|susurra:/i.test(trimmed)) return 'say';
  return 'other';
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('es-DO', { hour12: false });
}

function passesFilters(entry) {
  if (entry.marker) return true;
  // Si el tipo no tiene checkbox propio, siempre se muestra (hoy say/ooc/rol/other cubren todos los tipos que devuelve classifyLine).
  if (entry.type in activeFilters && !activeFilters[entry.type]) return false;
  if (searchQuery && !entry.text.toLowerCase().includes(searchQuery)) return false;
  return true;
}

function renderLine(entry) {
  const div = document.createElement('div');
  div.className = 'log-line';
  if (entry.marker) {
    div.classList.add('log-line--marker');
    div.textContent = `— ${entry.text} — ${formatTime(entry.ts)} —`;
  } else {
    if (entry.type === 'rol') div.classList.add('log-line--me');
    if (entry.type === 'ooc') div.classList.add('log-line--ooc');
    div.appendChild(document.createTextNode(getDisplayText(entry)));
  }
  if (!passesFilters(entry)) div.classList.add('log-line--hidden');
  entry._el = div;
  return div;
}

function appendEntry(entry) {
  entries.push(entry);
  logEmpty.style.display = 'none';
  const wasAtBottom = logArea.scrollHeight - logArea.scrollTop - logArea.clientHeight < 40;
  logArea.appendChild(renderLine(entry));
  if (wasAtBottom) logArea.scrollTop = logArea.scrollHeight;
}

function reapplyFilters() {
  for (const entry of entries) {
    if (!entry._el) continue;
    entry._el.classList.toggle('log-line--hidden', !passesFilters(entry));
  }
}

function serializeForExport() {
  return entries
    .map((e) => (e.marker ? `\n----- ${e.text} — ${formatTime(e.ts)} -----\n` : getDisplayText(e)))
    .join('\n');
}

function rerenderLog() {
  logArea.innerHTML = '';
  logArea.appendChild(logEmpty);
  if (entries.length === 0) {
    logEmpty.style.display = 'block';
    return;
  }
  logEmpty.style.display = 'none';
  // Un DocumentFragment arma todo fuera de pantalla y se inserta de una
  // sola vez, en vez de forzar un reflow por cada línea con appendChild
  // directo al DOM en vivo — con un chatlog grande (miles de líneas, como
  // puede pasar al usar "Parse") la diferencia es notoria.
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    fragment.appendChild(renderLine(entry));
  }
  logArea.appendChild(fragment);
  logArea.scrollTop = logArea.scrollHeight;
}

// ---- eventos de la API expuesta por preload ----

// El motor sigue buscando y capturando en segundo plano aunque la UI no
// muestre el estado de conexión; solo se usa para diagnóstico en consola.
window.signalLog.onState(({ state }) => console.log('[estado]', state));

window.signalLog.onDebug(({ msg }) => {
  console.log('[debug]', msg);
});

window.signalLog.onLines((newLines) => {
  for (const { text, ts } of newLines) {
    appendEntry({ text, ts, type: classifyLine(text) });
  }
});

// ---- controles de UI ----

filterRow.addEventListener('change', (event) => {
  const input = event.target.closest('input[data-filter]');
  if (!input) return;
  activeFilters[input.dataset.filter] = input.checked;
  reapplyFilters();
  window.signalLog.setFilters({ ...activeFilters, stripChatTimestamps });
});

stripTimestampToggle.addEventListener('change', (event) => {
  stripChatTimestamps = event.target.checked;
  rerenderLog();
  window.signalLog.setFilters({ ...activeFilters, stripChatTimestamps });
});

// ---- inicio con Windows ----

const autostartBtn = document.getElementById('autostartBtn');

function setAutostartBtn(enabled) {
  autostartBtn.dataset.active = enabled ? 'true' : 'false';
  autostartBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  autostartBtn.title = enabled
    ? 'Iniciar con Windows: activado (clic para desactivar)'
    : 'Iniciar con Windows: desactivado (clic para activar)';
}

async function refreshAutostartBtn() {
  try {
    setAutostartBtn(!!(await window.signalLog.getAutostart()));
  } catch (_) {
    /* si falla, dejamos el estado anterior */
  }
}

autostartBtn.addEventListener('click', async () => {
  const wanted = autostartBtn.dataset.active !== 'true';
  autostartBtn.disabled = true;
  try {
    const result = await window.signalLog.setAutostart(wanted);
    setAutostartBtn(!!(result && result.enabled));
    if (result && !result.ok) {
      await window.signalLogAlert(
        `No se pudo ${wanted ? 'activar' : 'desactivar'} el inicio con Windows: ${result.error || 'error desconocido'}`,
        { title: '213 Assistant', kind: 'error' }
      );
    }
  } catch (err) {
    console.error('[autostart] excepción:', err);
  } finally {
    autostartBtn.disabled = false;
  }
});

// Si se cambió desde el menú de la bandeja mientras la ventana estaba
// oculta, al volver a enfocarla se resincroniza.
window.addEventListener('focus', refreshAutostartBtn);
refreshAutostartBtn();

searchInput.addEventListener('input', (event) => {
  searchQuery = event.target.value.trim().toLowerCase();
  reapplyFilters();
});

parseBtn.addEventListener('click', async () => {
  const result = await window.signalLog.parseAutosave();
  if (!result.ok) {
    flashButton(parseBtn, result.error === 'no_file' ? 'Nada guardado aún' : 'Error al leer');
    return;
  }
  entries.length = 0;
  for (const text of result.lines) {
    entries.push({ text, ts: Date.now(), type: classifyLine(text) });
  }
  rerenderLog();
  const label = result.truncated
    ? `Cargado (últimas ${result.lines.length} de ${result.total}) ✓`
    : `Cargado (${result.lines.length}) ✓`;
  flashButton(parseBtn, label);
});

clearBtn.addEventListener('click', () => {
  entries.length = 0;
  logArea.innerHTML = '';
  logArea.appendChild(logEmpty);
  logEmpty.style.display = 'block';
});

clearAutosaveBtn.addEventListener('click', async () => {
  const confirmed = await window.signalLogConfirm(
    'Esto borra el chatlog.txt guardado en disco (todo lo capturado hasta ahora). No se puede deshacer. ¿Continuar?',
    { title: '213 Assistant', kind: 'warning' }
  );
  if (!confirmed) return;

  const result = await window.signalLog.clearAutosave();
  if (!result.ok) {
    flashButton(clearAutosaveBtn, 'Error al borrar');
    return;
  }

  // También limpiamos lo que está en pantalla, para que no quede mostrando
  // líneas que ya no existen en el archivo que se acaba de vaciar.
  entries.length = 0;
  logArea.innerHTML = '';
  logArea.appendChild(logEmpty);
  logEmpty.style.display = 'block';

  flashButton(clearAutosaveBtn, 'Chatlog borrado ✓');
});

copyBtn.addEventListener('click', async () => {
  await window.signalLog.copyToClipboard(serializeForExport());
  flashButton(copyBtn, 'Copiado ✓');
});

exportBtn.addEventListener('click', async () => {
  const name = `session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  const result = await window.signalLog.exportLog(serializeForExport(), name);
  if (result.ok) flashButton(exportBtn, 'Guardado ✓');
});

function flashButton(btn, tempLabel) {
  const original = btn.textContent;
  btn.textContent = tempLabel;
  setTimeout(() => {
    btn.textContent = original;
  }, 1400);
}

// ---- actualizaciones ----

const updateBtn = document.getElementById('updateBtn');
let pendingUpdateVersion = null;

function setUpdateBtn(state, label) {
  updateBtn.dataset.state = state;
  updateBtn.textContent = label;
  updateBtn.style.display = state === 'hidden' ? 'none' : '';
}

async function runUpdateCheck({ silent } = { silent: false }) {
  if (!silent) setUpdateBtn('checking', 'Buscando actualización…');
  let result;
  try {
    result = await window.signalLog.checkForUpdates();
  } catch (err) {
    if (!silent) setUpdateBtn('hidden', '');
    return;
  }
  if (!result || !result.ok) {
    if (!silent) setUpdateBtn('hidden', '');
    return;
  }
  if (result.available) {
    pendingUpdateVersion = result.version;
    setUpdateBtn('available', `Actualización v${result.version} disponible ↻`);
  } else if (!silent) {
    setUpdateBtn('idle', 'Ya estás al día ✓');
    setTimeout(() => setUpdateBtn('hidden', ''), 2000);
  } else {
    setUpdateBtn('hidden', '');
  }
}

updateBtn.addEventListener('click', async () => {
  // Bloquea reentradas en CUALQUIER estado ocupado, incluyendo mientras el
  // cartel de confirmación sigue abierto (el estado no pasa a 'downloading'
  // hasta después del await de abajo, así que sin esto un doble clic —o un
  // clic que llega mientras el diálogo nativo todavía está apareciendo—
  // dispara el handler dos veces en paralelo: la primera instalación
  // consume la actualización pendiente y la segunda encuentra el estado ya
  // vacío, mostrando "No hay ninguna actualización pendiente").
  if (updateBtn.dataset.state === 'checking' || updateBtn.dataset.state === 'confirming' || updateBtn.dataset.state === 'downloading') {
    return;
  }

  // Si no hay ninguna actualización detectada todavía, el botón funciona
  // como "buscar ahora" (por si alguien no quiere esperar al chequeo
  // automático de fondo).
  if (updateBtn.dataset.state !== 'available') {
    await runUpdateCheck({ silent: false });
    return;
  }

  const previousLabel = updateBtn.textContent;
  setUpdateBtn('confirming', previousLabel);

  const confirmed = await window.signalLogConfirm(
    `Hay una versión nueva (v${pendingUpdateVersion}) disponible. Se va a descargar e instalar, y el programa se va a reiniciar solo. ¿Continuar?`,
    { title: '213 Assistant', kind: 'info' }
  );
  if (!confirmed) {
    setUpdateBtn('available', previousLabel);
    return;
  }

  setUpdateBtn('downloading', 'Descargando actualización… 0%');
  let totalBytes = 0;
  let downloadedBytes = 0;
  let unlisten = () => {};

  try {
    unlisten = await window.signalLog.onUpdateProgress(({ chunk, total }) => {
      if (total) totalBytes = total;
      downloadedBytes += chunk;
      if (totalBytes > 0) {
        const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
        setUpdateBtn('downloading', `Descargando actualización… ${pct}%`);
      }
    });

    const result = await window.signalLog.installUpdate();
    console.log('[updater] resultado de installUpdate:', result);

    // Si todo salió bien, en Windows el programa se cierra solo acá para
    // dejar que el instalador corra — este código después de `installUpdate()`
    // ni llega a ejecutarse en ese caso. Si vemos esto, es porque algo falló.
    if (!result || !result.ok) {
      setUpdateBtn('available', `Actualización v${pendingUpdateVersion} disponible ↻`);
      await window.signalLogAlert(`No se pudo instalar la actualización: ${(result && result.error) || 'error desconocido'}`, {
        title: '213 Assistant',
        kind: 'error',
      });
    }
  } catch (err) {
    console.error('[updater] excepción durante la actualización:', err);
    setUpdateBtn('available', `Actualización v${pendingUpdateVersion} disponible ↻`);
    await window.signalLogAlert(
      `No se pudo instalar la actualización (excepción): ${err && err.message ? err.message : String(err)}`,
      { title: '213 Assistant', kind: 'error' }
    );
  } finally {
    unlisten();
  }
});

// Botón fijo junto a los de la ventana (minimizar/maximizar/cerrar): a
// diferencia de updateBtn (que arranca oculto y solo aparece si hay algo
// para mostrar), este siempre está visible para forzar una búsqueda manual
// en cualquier momento, sin esperar al chequeo automático de los 4s.
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
checkUpdateBtn.addEventListener('click', () => {
  if (updateBtn.dataset.state === 'checking' || updateBtn.dataset.state === 'confirming' || updateBtn.dataset.state === 'downloading') return;
  runUpdateCheck({ silent: false });
});

// Chequeo silencioso de fondo poco después de abrir el programa — no
// interrumpe nada si no hay actualización, solo aparece el botón si
// encuentra una versión nueva.
setTimeout(() => runUpdateCheck({ silent: true }), 4000);

// ---- inicialización ----

(async () => {
  const config = await window.signalLog.getConfig();
  if (config.filters && Object.keys(config.filters).length) {
    activeFilters = { ...activeFilters, ...config.filters };
    filterRow.querySelectorAll('input[data-filter]').forEach((input) => {
      input.checked = activeFilters[input.dataset.filter];
    });
    if (typeof config.filters.stripChatTimestamps === 'boolean') {
      stripChatTimestamps = config.filters.stripChatTimestamps;
      stripTimestampToggle.checked = stripChatTimestamps;
    }
  }
})();