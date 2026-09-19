'use strict';

// Reemplaza al preload.js de la versión Electron. Expone exactamente la misma
// superficie `window.signalLog` que ya consumen renderer.js y editor.js sin
// tocarles una línea — solo cambia el transporte (Tauri invoke/emit en vez de
// ipcRenderer).

(() => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const { getCurrentWindow } = window.__TAURI__.window;
  const { confirm, message } = window.__TAURI__.dialog;
  const appWindow = getCurrentWindow();

  // En Tauri v2 el plugin de diálogo NO pisa window.confirm/window.alert
  // (eso era de Tauri v1) — hay que llamar a la API real del plugin. La
  // exponemos acá para que renderer.js/editor.js no tengan que tocar
  // window.__TAURI__ directamente.
  window.signalLogConfirm = (msg, opts) => confirm(msg, opts);
  window.signalLogAlert = (msg, opts) => message(msg, opts);

  function toCamelCase(entries) {
    return entries;
  }

  // Solo arrancamos el motor de captura una vez que las TRES suscripciones
  // (state/debug/lines) que hace renderer.js al cargar quedaron confirmadas
  // del lado de Tauri — evita perder los primeros eventos, igual que el
  // `did-finish-load` del main.js de Electron original.
  const readyListens = [];
  let started = false;
  function trackListen(promise) {
    readyListens.push(promise);
    if (readyListens.length >= 3 && !started) {
      started = true;
      Promise.all(readyListens)
        .then(() => invoke('frontend_ready'))
        .catch(() => {});
    }
    return promise;
  }

  window.signalLog = {
    startCapture: () => invoke('capture_start'),
    stopCapture: () => invoke('capture_stop'),
    getState: () => invoke('capture_get_state'),

    copyToClipboard: (text) => invoke('clipboard_copy', { text: text || '' }),
    exportLog: (text, suggestedName) => invoke('export_save', { text, suggestedName }),

    getConfig: () => invoke('config_get'),
    setFilters: (filters) => invoke('config_set_filters', { filters }),
    setSwatches: (colorSwatches) => invoke('config_set_swatches', { colorSwatches }),
    parseAutosave: () => invoke('parse_load'),
    clearAutosave: () => invoke('chatlog_clear'),

    getAutostart: () => invoke('autostart_get'),
    setAutostart: (enabled) => invoke('autostart_set', { enabled }),

    checkForUpdates: () => invoke('check_for_updates'),
    installUpdate: () => invoke('install_update'),
    onUpdateProgress: (callback) => {
      // No pasa por trackListen a propósito: no tiene nada que ver con el
      // motor de captura, y sumarlo ahí correría el riesgo de disparar
      // frontend_ready antes de tiempo si algún día se registra este
      // listener antes que los otros tres.
      const unlistenPromise = listen('updater:progress', (event) => callback(event.payload));
      return () => unlistenPromise.then((unlisten) => unlisten());
    },

    openImage: () => invoke('image_open'),
    saveImage: (dataUrl, suggestedName) => invoke('image_save', { dataUrl, suggestedName }),
    openExternal: (url) => invoke('shell_open_external', { url }),

    inventoryLogin: (password) => invoke('inventory_login', { password }),
    getInventory: () => invoke('inventory_get'),
    saveProduct: (product) => invoke('inventory_product_save', { product }),
    deleteProduct: (id) => invoke('inventory_product_delete', { id }),
    confirmOrder: (order, adjustments) => invoke('inventory_order_confirm', { order, adjustments }),
    deleteOrder: (id) => invoke('inventory_order_delete', { id }),
    addCashMovement: (movement) => invoke('inventory_cash_add', { movement }),
    deleteCashMovement: (id) => invoke('inventory_cash_delete', { id }),

    onState: (callback) => {
      const unlistenPromise = trackListen(listen('capture:state', (event) => callback(event.payload)));
      return () => unlistenPromise.then((unlisten) => unlisten());
    },
    onDebug: (callback) => {
      const unlistenPromise = trackListen(listen('capture:debug', (event) => callback(event.payload)));
      return () => unlistenPromise.then((unlisten) => unlisten());
    },
    onLines: (callback) => {
      const unlistenPromise = trackListen(
        listen('capture:lines', (event) => callback(toCamelCase(event.payload)))
      );
      return () => unlistenPromise.then((unlisten) => unlisten());
    },

    minimizeWindow: () => appWindow.minimize(),
    toggleMaximizeWindow: () => appWindow.toggleMaximize(),
    closeWindow: () => appWindow.close(),
    isWindowMaximized: () => appWindow.isMaximized(),
    startWindowResize: (direction) => appWindow.startResizeDragging(direction),
    onWindowMaximizeChange: (callback) => {
      appWindow.isMaximized().then(callback).catch(() => {});
      const unlistenPromise = appWindow.onResized(() => {
        appWindow.isMaximized().then(callback).catch(() => {});
      });
      return () => unlistenPromise.then((unlisten) => unlisten());
    },
    setMaximizeLock: (locked) => {
      maximizeLocked = !!locked;
      applyMaximizeLockUi();
      return invoke('set_maximize_lock', { locked: maximizeLocked });
    },
  };

  // ---- controles de ventana propios (reemplazan a la barra de título nativa) ----
  const minimizeBtn = document.getElementById('winMinimizeBtn');
  const maximizeBtn = document.getElementById('winMaximizeBtn');
  const closeBtn = document.getElementById('winCloseBtn');

  const restoreIconPath =
    '<svg viewBox="0 0 10 10" width="10" height="10">' +
    '<rect x="1" y="2.5" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1" />' +
    '<path d="M2.5 2.5 V1 H9 V7.5 H7.5" fill="none" stroke="currentColor" stroke-width="1" />' +
    '</svg>';
  const maximizeIconPath =
    '<svg viewBox="0 0 10 10" width="10" height="10">' +
    '<rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" />' +
    '</svg>';

  // Cuando el editor de capturas activa el lock (ver renderer.js), no se
  // puede ni restaurar ni redimensionar la ventana hacia abajo: se deshabilita
  // el botón de maximizar/restaurar y se esconden los bordes de resize.
  let maximizeLocked = false;
  function applyMaximizeLockUi() {
    document.body.classList.toggle('maximize-locked', maximizeLocked);
    if (maximizeBtn) {
      maximizeBtn.disabled = maximizeLocked;
      maximizeBtn.title = maximizeLocked ? 'Maximizado (no se puede restaurar acá)' : maximizeBtn.title;
    }
  }

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => window.signalLog.minimizeWindow());
  }
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
      if (maximizeLocked) return;
      window.signalLog.toggleMaximizeWindow();
    });
    window.signalLog.onWindowMaximizeChange((isMaximized) => {
      maximizeBtn.innerHTML = isMaximized ? restoreIconPath : maximizeIconPath;
      if (!maximizeLocked) {
        maximizeBtn.title = isMaximized ? 'Restaurar' : 'Maximizar';
      }
      document.body.classList.toggle('is-maximized', isMaximized);
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => window.signalLog.closeWindow());
  }

  // Doble click en la barra restaura/maximiza por defecto (comportamiento
  // nativo de Tauri en [data-tauri-drag-region]) — lo bloqueamos acá mismo
  // mientras el lock está activo, en fase de captura para adelantarnos al
  // listener interno de Tauri.
  document.addEventListener(
    'dblclick',
    (evt) => {
      if (maximizeLocked && evt.target.closest('[data-tauri-drag-region]')) {
        evt.stopImmediatePropagation();
        evt.preventDefault();
      }
    },
    true
  );

  // En el editor de capturas la ventana no se puede mover: cualquier
  // intento de arrastre sobre la barra (mousedown en la zona con
  // data-tauri-drag-region) se corta acá, en fase de captura, antes de que
  // el listener interno de Tauri arranque el drag nativo. Minimizar sigue
  // funcionando siempre porque el botón de minimizar no depende del lock.
  document.addEventListener(
    'mousedown',
    (evt) => {
      if (maximizeLocked && evt.target.closest('[data-tauri-drag-region]')) {
        evt.stopImmediatePropagation();
        evt.preventDefault();
      }
    },
    true
  );

  // ---- bordes invisibles para redimensionar (la ventana no tiene marco nativo) ----
  document.querySelectorAll('.resize-handle').forEach((handle) => {
    handle.addEventListener('mousedown', (evt) => {
      if (maximizeLocked) return;
      if (evt.buttons !== 1) return;
      evt.preventDefault();
      window.signalLog.startWindowResize(handle.dataset.resizeDir);
    });
  });
})();