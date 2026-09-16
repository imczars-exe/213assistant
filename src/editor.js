'use strict';

/**
 * editor.js — Editor de capturas de pantalla (texto sobre imágenes al
 * estilo del chat del servidor), reemplaza al programa WPF externo.
 * Todo en un <canvas>, sin dependencias externas.
 */

const openImageBtn = document.getElementById('openImageBtn');
const addTextBtn = document.getElementById('addTextBtn');
const textInput = document.getElementById('textInput');
const textColorInput = document.getElementById('textColorInput');
const fontSizeInput = document.getElementById('fontSizeInput');
const fontSizeValueEl = document.getElementById('fontSizeValue');
const sizePresetsEl = document.getElementById('sizePresets');
const addSizePresetBtn = document.getElementById('addSizePresetBtn');
const strokeToggle = document.getElementById('strokeToggle');
const strokeChipEl = document.getElementById('strokeChip');
const bgNoneBtn = document.getElementById('bgNoneBtn');
const bgSolidBtn = document.getElementById('bgSolidBtn');
const bgSemiBtn = document.getElementById('bgSemiBtn');
const textBgFieldEl = document.getElementById('textBgField');
const exportImageBtn = document.getElementById('exportImageBtn');
const canvasEmpty = document.getElementById('canvasEmpty');
const canvasScrollEl = document.getElementById('canvasScroll');
const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');

const canvasZoomControlsEl = document.getElementById('canvasZoomControls');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomValueBtn = document.getElementById('zoomValueBtn');
const zoomFitBtn = document.getElementById('zoomFitBtn');

const colorSwatchesEl = document.getElementById('colorSwatches');
const addSwatchBtn = document.getElementById('addSwatchBtn');

const resWidthInput = document.getElementById('resWidthInput');
const resHeightInput = document.getElementById('resHeightInput');
const lockAspectToggle = document.getElementById('lockAspectToggle');
const applyResolutionBtn = document.getElementById('applyResolutionBtn');
const resPreset1080Btn = document.getElementById('resPreset1080Btn');
const resPreset720Btn = document.getElementById('resPreset720Btn');
const resDropdownBtn = document.getElementById('resDropdownBtn');
const resDropdownWrapper = document.getElementById('resDropdownWrapper');
const resDropdownPanel = document.getElementById('resDropdownPanel');

const addImageBtn = document.getElementById('addImageBtn');
const addRectBtn = document.getElementById('addRectBtn');
const addBlurBtn = document.getElementById('addBlurBtn');
const layerControlsEl = document.getElementById('layerControls');
const layerFrontBtn = document.getElementById('layerFrontBtn');
const layerBackBtn = document.getElementById('layerBackBtn');
const layerOpacityInput = document.getElementById('layerOpacityInput');
const layerOpacityValueEl = document.getElementById('layerOpacityValue');
const layerDeleteBtn = document.getElementById('layerDeleteBtn');
const layerCropBtn = document.getElementById('layerCropBtn');
const layerCropApplyBtn = document.getElementById('layerCropApplyBtn');
const layerCropCancelBtn = document.getElementById('layerCropCancelBtn');

const shapeControlsEl = document.getElementById('shapeControls');
const shapeRectFieldsEl = document.getElementById('shapeRectFields');
const shapeFillToggle = document.getElementById('shapeFillToggle');
const shapeFillColorInput = document.getElementById('shapeFillColorInput');
const shapeStrokeToggle = document.getElementById('shapeStrokeToggle');
const shapeStrokeColorInput = document.getElementById('shapeStrokeColorInput');
const shapeStrokeWidthInput = document.getElementById('shapeStrokeWidthInput');
const shapeStrokeWidthValueEl = document.getElementById('shapeStrokeWidthValue');
const shapeBlurFieldsEl = document.getElementById('shapeBlurFields');
const shapeBlurAmountInput = document.getElementById('shapeBlurAmountInput');
const shapeBlurAmountValueEl = document.getElementById('shapeBlurAmountValue');

const applyCropBtn = document.getElementById('applyCropBtn');
const cropWidthInput = document.getElementById('cropWidthInput');
const cropHeightInput = document.getElementById('cropHeightInput');
const cropPreset800Btn = document.getElementById('cropPreset800Btn');
const cropPreset1600Btn = document.getElementById('cropPreset1600Btn');
const cropSizeDropdownBtn = document.getElementById('cropSizeDropdownBtn');
const cropSizeDropdownWrapper = document.getElementById('cropSizeDropdownWrapper');
const cropSizeDropdownPanel = document.getElementById('cropSizeDropdownPanel');
const cropResetImageBtn = document.getElementById('cropResetImageBtn');

const grainToggle = document.getElementById('grainToggle');
const grainIntensityInput = document.getElementById('grainIntensityInput');
const blurToggle = document.getElementById('blurToggle');
const blurIntensityInput = document.getElementById('blurIntensityInput');
const saturationInput = document.getElementById('saturationInput');
const brightnessInput = document.getElementById('brightnessInput');
const contrastInput = document.getElementById('contrastInput');
const bwToggle = document.getElementById('bwToggle');
const ghostToggle = document.getElementById('ghostToggle');
const ghostOffsetXInput = document.getElementById('ghostOffsetXInput');
const ghostOffsetYInput = document.getElementById('ghostOffsetYInput');
const ghostOpacityInput = document.getElementById('ghostOpacityInput');
const ghostBlurInput = document.getElementById('ghostBlurInput');
const ghostZoomInput = document.getElementById('ghostZoomInput');
const resetEffectsBtn = document.getElementById('resetEffectsBtn');

// ---- medidor numérico junto a cada slider de efectos ----
// Cada entrada es [input, elemento donde se muestra el valor, sufijo].
// `suffix` es "%" para los que representan porcentaje (grano, saturación,
// brillo, contraste, opacidad y zoom del fantasma) y "px" para los que son
// una medida en píxeles (desenfoque, difuminado del fantasma, desplazamientos).
const EFFECT_METERS = [
  [grainIntensityInput, document.getElementById('grainIntensityValue'), '%'],
  [blurIntensityInput, document.getElementById('blurIntensityValue'), 'px'],
  [saturationInput, document.getElementById('saturationValue'), '%'],
  [brightnessInput, document.getElementById('brightnessValue'), '%'],
  [contrastInput, document.getElementById('contrastValue'), '%'],
  [ghostOffsetXInput, document.getElementById('ghostOffsetXValue'), 'px'],
  [ghostOffsetYInput, document.getElementById('ghostOffsetYValue'), 'px'],
  [ghostOpacityInput, document.getElementById('ghostOpacityValue'), '%'],
  [ghostBlurInput, document.getElementById('ghostBlurValue'), 'px'],
  [ghostZoomInput, document.getElementById('ghostZoomValue'), '%'],
];

function refreshEffectMeters() {
  for (const [input, valueEl, suffix] of EFFECT_METERS) {
    if (!input || !valueEl) continue;
    // El slider de zoom del fantasma guarda "zoom extra" (0-200) pero se
    // muestra como el porcentaje real resultante (100%-300%), en línea con
    // cómo se usa en drawGhost().
    const displayValue = input === ghostZoomInput ? 100 + Number(input.value) : input.value;
    valueEl.textContent = `${displayValue}${suffix}`;
  }
}

for (const [input] of EFFECT_METERS) {
  if (input) input.addEventListener('input', refreshEffectMeters);
}
refreshEffectMeters();

// Color de las líneas /me en el chat de un servidor de rol tipo GTAW/FiveM
// (#FFC2A2DA en ARGB → se usa sin el canal alfa, que va siempre opaco).
const ME_COLOR = '#C2A2DA';
// Mismo amarillo que ya está en DEFAULT_SWATCHES (más abajo) — así el
// auto-color de "(Coche)" queda visualmente consistente con la paleta que
// ya usa el usuario, en vez de inventar un amarillo distinto.
const COCHE_COLOR = '#ffff00';
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 300;
const HANDLE_MIN_SIZE = 10;
const MIN_IMAGE_LAYER_SIZE = 12;

let image = null; // HTMLImageElement actual (fondo)
// "capas" puestas encima del fondo, en orden de dibujo (la última es la de
// más arriba). Puede haber dos tipos de capa:
//   texto:  { id, type: 'text', x, y, text, color, stroke, italic, fontSize, opacity }
//   imagen: { id, type: 'image', x, y, width, height, img, opacity }
let layers = [];
let nextId = 1;
let selectedId = null;
let addTextMode = false;
let imageAspectRatio = null;

let dragState = null; // { mode: 'move' | 'resize', id, ... }

// ---- guías de margen (referencia visual fija; nunca se dibujan en el PNG
// exportado). Siempre a 50px de cada borde, con imantado al mover texto
// cerca de ellas. ----
let showMarginGuides = true;
const MARGIN_GUIDE_DISTANCE = 50; // fijo, no editable
const GUIDE_SNAP_THRESHOLD = 8; // px reales del canvas

// ---- historial (deshacer / rehacer) ----
// Guarda "fotos" del estado editable antes de cada acción (agregar/mover/
// redimensionar/borrar/editar texto, recortar, cambiar resolución, cambiar
// estilo). La imagen en sí (image) nunca se muta después de creada — cada
// recorte genera un canvas NUEVO — así que alcanza con guardar la
// referencia, sin copiar los píxeles, y el historial queda liviano.
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 60;

function cloneLayers(list) {
  return list.map((o) =>
    o.type === 'image' || o.type === 'shape'
      ? { ...o }
      : { ...o, lineRuns: o.lineRuns.map((runs) => runs.map((r) => ({ ...r }))) }
  );
}

function captureHistoryState() {
  return {
    image,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    imageAspectRatio,
    layers: cloneLayers(layers),
    selectedId,
  };
}

// Los botones de deshacer/rehacer se sacaron de la UI (se maneja todo con
// Ctrl+Z / Ctrl+Shift+Z), esta función queda vacía a propósito — se sigue
// llamando desde pushHistory/undo/redo por si en algún momento se quiere
// volver a mostrar el estado (habilitado/deshabilitado) en algún lado.
function updateUndoRedoButtons() {}

// Se llama ANTES de cualquier acción que vaya a modificar el estado, para
// guardar cómo estaba justo antes. Cualquier acción nueva invalida el
// "rehacer" pendiente (igual que en cualquier editor).
function pushHistory() {
  if (!image) return;
  undoStack.push(captureHistoryState());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}

// Resolución, Recortar imagen y +Imagen no tienen sentido sin una imagen
// abierta todavía — se ocultan del todo (no solo deshabilitados) hasta que
// haya una.
function updateImageDependentUI() {
  const hasImage = !!image;
  resDropdownWrapper.hidden = !hasImage;
  cropSizeDropdownWrapper.hidden = !hasImage;
  addImageBtn.hidden = !hasImage;
  addRectBtn.hidden = !hasImage;
  addBlurBtn.hidden = !hasImage;
  canvasZoomControlsEl.hidden = !hasImage;
}

// ---- zoom del lienzo ----
// El canvas ya no se "encoge" solo con CSS (max-width/max-height:100%):
// editor.js le pone un width/height explícito en píxeles según
// `zoomLevel`, así se puede acercar más allá de su tamaño real (no solo
// achicarlo para que entre). Cuando el resultado es más grande que
// .canvas-scroll, el overflow:auto de ese contenedor permite recorrerlo
// con scroll/barras, igual que cualquier visor de imágenes.
let zoomLevel = 1; // 1 = 100% = un píxel del canvas por cada píxel CSS
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.1;
// Margen que deja .canvas-scroll (padding: 24px de cada lado) al calcular
// cuánto entra "ajustado" — si no se descuenta, el cálculo de encaje deja
// la imagen pegada a los bordes del panel.
const CANVAS_SCROLL_PADDING = 48;

function applyCanvasZoom() {
  if (!image) return;
  canvas.style.width = `${Math.max(1, Math.round(canvas.width * zoomLevel))}px`;
  canvas.style.height = `${Math.max(1, Math.round(canvas.height * zoomLevel))}px`;
  zoomValueBtn.textContent = `${Math.round(zoomLevel * 100)}%`;
}

// Nivel de zoom que hace que la imagen entre entera en el panel visible,
// sin agrandar imágenes chicas más allá de su tamaño real — es exactamente
// el comportamiento que tenía el canvas por defecto antes de que existiera
// el zoom manual, así que se usa como punto de partida al abrir una imagen
// o cambiar su resolución/recorte.
function computeFitZoom() {
  if (!image) return 1;
  const availW = canvasScrollEl.clientWidth - CANVAS_SCROLL_PADDING;
  const availH = canvasScrollEl.clientHeight - CANVAS_SCROLL_PADDING;
  if (availW <= 0 || availH <= 0) return 1;
  const scale = Math.min(1, availW / canvas.width, availH / canvas.height);
  return Math.max(ZOOM_MIN, scale);
}

function fitZoomToContainer() {
  zoomLevel = computeFitZoom();
  applyCanvasZoom();
}

function setZoom(next) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  applyCanvasZoom();
}

zoomInBtn.addEventListener('click', () => setZoom(zoomLevel + ZOOM_STEP));
zoomOutBtn.addEventListener('click', () => setZoom(zoomLevel - ZOOM_STEP));
zoomValueBtn.addEventListener('click', () => setZoom(1));
zoomFitBtn.addEventListener('click', () => fitZoomToContainer());

// Ctrl/Cmd + rueda del mouse para acercar/alejar (convención estándar en
// editores de imagen); la rueda sola se deja intacta para hacer scroll
// normal dentro del panel cuando la imagen no entra entera con el zoom
// actual.
canvasScrollEl.addEventListener(
  'wheel',
  (evt) => {
    if (!image || !(evt.ctrlKey || evt.metaKey)) return;
    evt.preventDefault();
    setZoom(zoomLevel + (evt.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  },
  { passive: false }
);

function restoreHistoryState(state) {
  commitInlineEdit();
  if (cropMode) setCropMode(false);
  if (layerCropId != null) cancelLayerCrop();
  image = state.image;
  canvas.width = state.canvasWidth;
  canvas.height = state.canvasHeight;
  imageAspectRatio = state.imageAspectRatio;
  layers = cloneLayers(state.layers);
  selectedId = state.selectedId;
  resWidthInput.value = state.canvasWidth;
  resHeightInput.value = state.canvasHeight;
  canvas.hidden = !image;
  canvasEmpty.style.display = image ? 'none' : '';
  updateImageDependentUI();
  // Deshacer/rehacer no toca el zoom que eligió la persona — solo
  // reaplica ese mismo porcentaje al tamaño (posiblemente distinto) del
  // canvas restaurado.
  applyCanvasZoom();
  draw();
}

function undo() {
  if (!undoStack.length) return;
  const prev = undoStack.pop();
  redoStack.push(captureHistoryState());
  restoreHistoryState(prev);
  updateUndoRedoButtons();
}

function redo() {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(captureHistoryState());
  restoreHistoryState(next);
  updateUndoRedoButtons();
}

window.addEventListener('keydown', (evt) => {
  const key = evt.key.toLowerCase();
  if (!(evt.ctrlKey || evt.metaKey) || key !== 'z') return;
  // No pisar el deshacer nativo del navegador cuando el foco está en un
  // campo de texto normal (el input de líneas, un <input> numérico, o el
  // texto en edición en vivo sobre el canvas).
  const el = document.activeElement;
  const tag = el && el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
  // Mientras se está ajustando el marco de recorte (todavía sin aplicar),
  // Ctrl+Z no tiene una acción de recorte que deshacer — se usa Escape
  // para cancelar ese ajuste en curso.
  if (cropMode || layerCropId != null) return;
  evt.preventDefault();
  if (evt.shiftKey) redo();
  else undo();
});

// ---- recorte de la imagen (estilo Photoshop: arrancás con toda la
// imagen ya "seleccionada" y ajustás el marco arrastrando sus tiradores,
// en vez de tener que dibujar un rectángulo desde cero) ----
let cropMode = false;
let cropDragState = null; // { type: 'move' | 'resize' | 'pan-image', handle?, origin, offsetX?, offsetY? }
let cropRect = null; // { x, y, w, h } en coordenadas reales del canvas, pendiente de aplicar

// ---- recorte de una capa de imagen individual (agregada con "+ Imagen") ----
// Versión simplificada del recorte de fondo de arriba: sin zoom/paneo de la
// imagen dentro del marco, solo 4 tiradores en las esquinas que arrancan
// cubriendo toda la capa y se pueden achicar. Vive completamente aparte del
// recorte de fondo (cropMode/cropRect) para no tener que tocar ese código
// que ya funciona.
let layerCropId = null; // id de la capa de imagen que se está recortando, o null
let layerCropRect = null; // { x, y, w, h } en coordenadas reales del canvas
let layerCropDragState = null; // { handle, origin } mientras se arrastra un tirador
const MIN_CROP_SIZE = 8;

// ---- mover/agrandar/achicar la imagen DENTRO del marco de recorte ----
// El marco (cropRect) vive en coordenadas del canvas y no cambia por esto;
// lo que cambia es dónde y a qué tamaño se dibuja la imagen debajo, para
// poder elegir exactamente qué parte queda dentro del marco (como en
// cualquier recortador de foto de perfil).
let cropImgTransform = { scale: 1, x: 0, y: 0 };
const CROP_IMG_MAX_SCALE = 5;
// Piso absoluto de seguridad; el límite real y más relevante es dinámico
// (ver getCropMinScale) porque depende de qué tan chico sea el marco.
const CROP_IMG_ABS_MIN_SCALE = 0.1;

function resetCropImageTransform() {
  cropImgTransform = { scale: 1, x: 0, y: 0 };
}

// La imagen ya no tiene que cubrir todo el canvas: solo tiene que cubrir
// el marco de recorte actual (que puede ser más chico que el canvas), así
// que el zoom mínimo permitido se recalcula según el tamaño del marco —
// cuanto más chico el marco, más se puede alejar la imagen para encuadrar
// una porción más amplia dentro de él.
function getCropMinScale() {
  if (!cropRect || !canvas.width || !canvas.height) return CROP_IMG_ABS_MIN_SCALE;
  const r = normalizeCropRect(cropRect);
  return Math.max(CROP_IMG_ABS_MIN_SCALE, r.w / canvas.width, r.h / canvas.height);
}

// La imagen nunca puede quedar más chica que el marco de recorte ni
// despegarse de sus bordes, así el marco siempre tiene imagen debajo —
// nunca queda un hueco transparente dentro de él.
function clampCropImageTransform() {
  const drawW = canvas.width * cropImgTransform.scale;
  const drawH = canvas.height * cropImgTransform.scale;
  if (cropRect) {
    const r = normalizeCropRect(cropRect);
    const minX = r.x + r.w - drawW;
    const maxX = r.x;
    const minY = r.y + r.h - drawH;
    const maxY = r.y;
    cropImgTransform.x = Math.max(minX, Math.min(maxX, cropImgTransform.x));
    cropImgTransform.y = Math.max(minY, Math.min(maxY, cropImgTransform.y));
  } else {
    const minX = Math.min(0, canvas.width - drawW);
    const minY = Math.min(0, canvas.height - drawH);
    cropImgTransform.x = Math.max(minX, Math.min(0, cropImgTransform.x));
    cropImgTransform.y = Math.max(minY, Math.min(0, cropImgTransform.y));
  }
}

function getCropImageDrawRect() {
  return {
    x: cropImgTransform.x,
    y: cropImgTransform.y,
    w: canvas.width * cropImgTransform.scale,
    h: canvas.height * cropImgTransform.scale,
  };
}

// Ya no hay slider ni "100%" que mostrar (se sacó el control de Zoom del
// panel de recorte: ahora solo se hace zoom con la rueda del mouse) — se
// deja como no-op en vez de borrar todos los lugares que la llamaban para
// mantener el estado sincronizado, por si en algún momento vuelve a hacer
// falta mostrar el valor en algún lado.
function syncCropZoomInput() {}

// Se llama cada vez que el marco de recorte cambia de tamaño (arrastrando
// tiradores o tipeando en los inputs de ancho/alto): si el marco creció y
// la imagen ya no alcanza a cubrirlo con el zoom actual, la reencuadra al
// mínimo necesario; si no, solo la reacomoda dentro de los límites.
function enforceCropImageBounds() {
  const minScale = getCropMinScale();
  if (cropImgTransform.scale < minScale) {
    const r = normalizeCropRect(cropRect);
    zoomCropImageAt(r.x + r.w / 2, r.y + r.h / 2, minScale);
  } else {
    clampCropImageTransform();
  }
  syncCropZoomInput();
}

// Cambia el zoom manteniendo fijo el punto (px, py) en coordenadas del
// canvas — igual que el zoom "hacia el cursor" de cualquier visor de
// imágenes, para no perder de vista lo que se está por recortar.
function zoomCropImageAt(px, py, newScale) {
  newScale = Math.max(getCropMinScale(), Math.min(CROP_IMG_MAX_SCALE, newScale));
  const old = cropImgTransform;
  const oldDrawW = canvas.width * old.scale;
  const oldDrawH = canvas.height * old.scale;
  const u = oldDrawW > 0 ? (px - old.x) / oldDrawW : 0.5;
  const v = oldDrawH > 0 ? (py - old.y) / oldDrawH : 0.5;
  const newDrawW = canvas.width * newScale;
  const newDrawH = canvas.height * newScale;
  cropImgTransform = { scale: newScale, x: px - u * newDrawW, y: py - v * newDrawH };
  clampCropImageTransform();
  syncCropZoomInput();
}

cropResetImageBtn.addEventListener('click', () => {
  resetCropImageTransform();
  syncCropZoomInput();
  draw();
});

// Rueda del mouse sobre el canvas, en modo recorte: zoom de la imagen
// centrado en el cursor.
canvas.addEventListener(
  'wheel',
  (evt) => {
    if (!cropMode || !image) return;
    evt.preventDefault();
    const point = getCanvasPoint(evt);
    const factor = evt.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomCropImageAt(point.x, point.y, cropImgTransform.scale * factor);
    draw();
  },
  { passive: false }
);
const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CROP_CURSORS = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

function setCropMode(active) {
  cropMode = active;
  canvas.classList.toggle('tool-crop', active);
  if (active) {
    setAddTextMode(false);
    if (layerCropId != null) cancelLayerCrop();
    selectedId = null;
    // Arranca con el marco de recorte cubriendo toda la imagen, como en
    // Photoshop, listo para ajustar desde las esquinas/lados.
    cropRect = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    applyCropBtn.hidden = false;
    applyCropBtn.disabled = false;
    cropWidthInput.disabled = false;
    cropHeightInput.disabled = false;
    syncCropSizeInputs();
    resetCropImageTransform();
    syncCropZoomInput();
    cropResetImageBtn.disabled = false;
  } else {
    cropRect = null;
    cropDragState = null;
    canvas.style.cursor = '';
    applyCropBtn.hidden = true;
    applyCropBtn.disabled = true;
    cropWidthInput.disabled = true;
    cropHeightInput.disabled = true;
    cropResetImageBtn.disabled = true;
  }
  draw();
}

// Refleja el tamaño actual del marco de recorte en los inputs numéricos
// (se llama después de arrastrar un tirador o mover el marco).
function syncCropSizeInputs() {
  if (!cropRect) return;
  const r = normalizeCropRect(cropRect);
  cropWidthInput.value = r.w;
  cropHeightInput.value = r.h;
}

// Aplica un tamaño exacto (tecleado por el usuario) al marco de recorte,
// manteniendo su centro actual y ajustándolo para que no se salga del
// canvas (igual que si lo arrastraras a mano, pero preciso).
function setCropSizeFromInputs() {
  if (!cropMode || !cropRect) return;
  const w = Math.round(Number(cropWidthInput.value));
  const h = Math.round(Number(cropHeightInput.value));
  if (!(w > 0) || !(h > 0)) return;

  const clampedW = Math.min(w, canvas.width);
  const clampedH = Math.min(h, canvas.height);

  const r = normalizeCropRect(cropRect);
  const centerX = r.x + r.w / 2;
  const centerY = r.y + r.h / 2;

  let x = Math.round(centerX - clampedW / 2);
  let y = Math.round(centerY - clampedH / 2);
  x = Math.max(0, Math.min(canvas.width - clampedW, x));
  y = Math.max(0, Math.min(canvas.height - clampedH, y));

  cropRect = { x, y, w: clampedW, h: clampedH };
  syncCropSizeInputs();
  enforceCropImageBounds();
  draw();
}

// Se aplica solo con cada tecla — ya no hace falta un botón "Fijar tamaño".
for (const input of [cropWidthInput, cropHeightInput]) {
  input.addEventListener('input', setCropSizeFromInputs);
}

// Tamaño de recorte predeterminado: si el modo recorte todavía no está
// activo, lo prende primero (el marco arranca cubriendo toda la imagen),
// y ahí sí fija el tamaño exacto.
cropPreset800Btn.addEventListener('click', () => {
  if (!image) return;
  if (!cropMode) setCropMode(true);
  cropWidthInput.value = 800;
  cropHeightInput.value = 800;
  setCropSizeFromInputs();
  closeCropSizeDropdown();
});

cropPreset1080Btn.addEventListener('click', () => {
  if (!image) return;
  if (!cropMode) setCropMode(true);
  cropWidthInput.value = 1080;
  cropHeightInput.value = 1080;
  setCropSizeFromInputs();
  closeCropSizeDropdown();
});

cropPreset1600Btn.addEventListener('click', () => {
  if (!image) return;
  if (!cropMode) setCropMode(true);
  cropWidthInput.value = 1600;
  cropHeightInput.value = 1080;
  setCropSizeFromInputs();
  closeCropSizeDropdown();
});


// El botón "Tamaño recorte" es ahora también el que activa el modo
// recorte (ya no hay un botón "Recortar" aparte): al abrir el panel se
// prende el modo recorte, listo para ajustar el marco arrastrando.
cropSizeDropdownBtn.addEventListener('click', () => {
  commitInlineEdit();
  if (!image) return;
  if (!cropMode) setCropMode(true);
});

// Ajusta el rectángulo a los límites del canvas y a enteros.
function normalizeCropRect(rect) {
  const x = Math.max(0, Math.min(canvas.width, rect.x));
  const y = Math.max(0, Math.min(canvas.height, rect.y));
  const w = Math.max(0, Math.min(canvas.width - x, rect.w));
  const h = Math.max(0, Math.min(canvas.height - y, rect.h));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// Tamaño (en px reales del canvas) del área "agarrable" de cada tirador —
// escala con la imagen para que sea cómodo tanto en capturas chicas como
// grandes.
function getCropHandleHitSize() {
  if (!image) return 16;
  return Math.max(16, Math.min(canvas.width, canvas.height) * 0.018);
}

// Posición de cada uno de los 8 tiradores (4 esquinas + 4 lados) según el
// rectángulo de recorte actual.
function getCropHandlePoints(rect) {
  const r = normalizeCropRect(rect);
  return {
    nw: { x: r.x, y: r.y },
    n: { x: r.x + r.w / 2, y: r.y },
    ne: { x: r.x + r.w, y: r.y },
    e: { x: r.x + r.w, y: r.y + r.h / 2 },
    se: { x: r.x + r.w, y: r.y + r.h },
    s: { x: r.x + r.w / 2, y: r.y + r.h },
    sw: { x: r.x, y: r.y + r.h },
    w: { x: r.x, y: r.y + r.h / 2 },
  };
}

function getCropHandleAt(point) {
  if (!cropRect) return null;
  const points = getCropHandlePoints(cropRect);
  const hit = getCropHandleHitSize();
  for (const handle of CROP_HANDLES) {
    const p = points[handle];
    if (Math.abs(point.x - p.x) <= hit && Math.abs(point.y - p.y) <= hit) return handle;
  }
  return null;
}

function pointInCropBody(point) {
  const r = normalizeCropRect(cropRect);
  return point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h;
}

// Punto fijo (opuesto al tirador arrastrado) sobre el que pivotea el
// redimensionado normal: la esquina/lado contrario no se mueve.
function getCropRectAnchorPoint(origin, handle) {
  const cx = origin.x + origin.w / 2;
  const cy = origin.y + origin.h / 2;
  const map = {
    nw: { x: origin.x + origin.w, y: origin.y + origin.h },
    n: { x: cx, y: origin.y + origin.h },
    ne: { x: origin.x, y: origin.y + origin.h },
    e: { x: origin.x, y: cy },
    se: { x: origin.x, y: origin.y },
    s: { x: cx, y: origin.y },
    sw: { x: origin.x + origin.w, y: origin.y },
    w: { x: origin.x + origin.w, y: cy },
  };
  return map[handle];
}

// Recalcula el rectángulo al arrastrar un tirador: cada tirador mueve solo
// los lados que le corresponden y deja fijo el lado/esquina opuesto (igual
// que al recortar en Photoshop). Con Alt el punto fijo pasa a ser el
// centro del marco (se agranda/achica parejo hacia los dos lados a la
// vez); con Shift el marco mantiene la proporción original mientras se
// arrastra. Ambos se pueden combinar (Alt+Shift).
function resizeCropRect(origin, handle, x, y, modifiers = {}) {
  const { fromCenter = false, keepAspect = false } = modifiers;
  const aspect = origin.h > 0 ? origin.w / origin.h : 1;
  const affectsX = handle.includes('w') || handle.includes('e');
  const affectsY = handle.includes('n') || handle.includes('s');
  const cx = origin.x + origin.w / 2;
  const cy = origin.y + origin.h / 2;

  if (fromCenter) {
    let halfW = affectsX ? Math.max(MIN_CROP_SIZE / 2, Math.abs(x - cx)) : origin.w / 2;
    let halfH = affectsY ? Math.max(MIN_CROP_SIZE / 2, Math.abs(y - cy)) : origin.h / 2;
    if (keepAspect) {
      if (affectsX && affectsY) {
        if (halfW / aspect > halfH) halfH = halfW / aspect;
        else halfW = halfH * aspect;
      } else if (affectsX) {
        halfH = halfW / aspect;
      } else {
        halfW = halfH * aspect;
      }
    }
    return { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2 };
  }

  const anchor = getCropRectAnchorPoint(origin, handle);
  // No dejamos que el cursor cruce el punto fijo (evita que el marco se
  // "invierta" al arrastrar de más).
  let cursorX = x;
  let cursorY = y;
  if (handle.includes('w')) cursorX = Math.min(cursorX, anchor.x - MIN_CROP_SIZE);
  if (handle.includes('e')) cursorX = Math.max(cursorX, anchor.x + MIN_CROP_SIZE);
  if (handle.includes('n')) cursorY = Math.min(cursorY, anchor.y - MIN_CROP_SIZE);
  if (handle.includes('s')) cursorY = Math.max(cursorY, anchor.y + MIN_CROP_SIZE);

  let w = affectsX ? Math.abs(cursorX - anchor.x) : origin.w;
  let h = affectsY ? Math.abs(cursorY - anchor.y) : origin.h;

  if (keepAspect) {
    if (affectsX && affectsY) {
      if (w / aspect > h) h = w / aspect;
      else w = h * aspect;
    } else if (affectsX) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
    w = Math.max(MIN_CROP_SIZE, w);
    h = Math.max(MIN_CROP_SIZE, h);
  }

  let rx;
  if (handle.includes('w')) rx = anchor.x - w;
  else if (handle.includes('e')) rx = anchor.x;
  else rx = cx - w / 2;

  let ry;
  if (handle.includes('n')) ry = anchor.y - h;
  else if (handle.includes('s')) ry = anchor.y;
  else ry = cy - h / 2;

  return { x: rx, y: ry, w, h };
}

applyCropBtn.addEventListener('click', () => {
  if (!image || !cropRect) return;
  commitInlineEdit();
  const rect = normalizeCropRect(cropRect);
  if (rect.w < 1 || rect.h < 1) return;
  pushHistory();

  // Rasteriza la imagen de fondo tal como se ve hoy en el canvas (a su
  // resolución de trabajo actual) para poder recortarla; el texto no se
  // "quema" acá, solo se traslada, así sigue siendo editable después.
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = canvas.width;
  baseCanvas.height = canvas.height;
  const imgRect = getCropImageDrawRect();
  baseCanvas.getContext('2d').drawImage(image, imgRect.x, imgRect.y, imgRect.w, imgRect.h);

  const cropped = document.createElement('canvas');
  cropped.width = rect.w;
  cropped.height = rect.h;
  cropped
    .getContext('2d')
    .drawImage(baseCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  image = cropped;
  imageAspectRatio = rect.w / rect.h;

  for (const obj of layers) {
    obj.x -= rect.x;
    obj.y -= rect.y;
  }

  canvas.width = rect.w;
  canvas.height = rect.h;
  resWidthInput.value = rect.w;
  resHeightInput.value = rect.h;
  // Mismo criterio que deshacer/rehacer: el recorte cambia el tamaño del
  // canvas, pero no el porcentaje de zoom que la persona tenía elegido.
  applyCanvasZoom();

  setCropMode(false);
});

window.addEventListener('keydown', (evt) => {
  if (evt.key !== 'Escape' || !cropMode || editingId != null) return;
  setCropMode(false);
});

// Si estando en modo recorte se hace clic afuera del lienzo y afuera de
// los controles propios del recorte (el desplegable "Tamaño recorte" y su
// botón "Aplicar recorte"), se cancela el recorte — ya no hace falta
// apretar Escape a la fuerza.
document.addEventListener('mousedown', (evt) => {
  if (!cropMode) return;
  const target = evt.target;
  if (canvas.contains(target)) return;
  if (cropSizeDropdownBtn.contains(target)) return;
  if (cropSizeDropdownPanel.contains(target)) return;
  if (applyCropBtn.contains(target)) return;
  setCropMode(false);
});

// ---- recorte de una capa de imagen individual ("+ Imagen") ----
// A diferencia del recorte de fondo, acá no hay paneo/zoom de la imagen
// dentro del marco: el marco arranca cubriendo toda la capa (tal como se
// ve hoy en el lienzo, ya escalada si se agrandó/achicó a mano) y solo se
// puede achicar desde cualquiera de sus 4 esquinas.

function getLayerCropObj() {
  return layerCropId == null ? null : layers.find((o) => o.id === layerCropId) || null;
}

// Recorta el marco para que nunca se salga de los límites de la capa
// (bounds = su x/y/width/height actuales).
function normalizeLayerCropRect(rect, bounds) {
  const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w, rect.x));
  const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h, rect.y));
  const w = Math.max(0, Math.min(bounds.x + bounds.w - x, rect.w));
  const h = Math.max(0, Math.min(bounds.y + bounds.h - y, rect.h));
  return { x, y, w, h };
}

function getLayerCropHandlePoints(rect) {
  return {
    nw: { x: rect.x, y: rect.y },
    ne: { x: rect.x + rect.w, y: rect.y },
    se: { x: rect.x + rect.w, y: rect.y + rect.h },
    sw: { x: rect.x, y: rect.y + rect.h },
  };
}

function getLayerCropHandleAt(point) {
  if (!layerCropRect) return null;
  const points = getLayerCropHandlePoints(layerCropRect);
  const half = getCropHandleHitSize() / 2;
  for (const key of ['nw', 'ne', 'se', 'sw']) {
    const p = points[key];
    if (Math.abs(point.x - p.x) <= half && Math.abs(point.y - p.y) <= half) return key;
  }
  return null;
}

function pointInLayerCropBody(point) {
  if (!layerCropRect) return false;
  return (
    point.x >= layerCropRect.x &&
    point.x <= layerCropRect.x + layerCropRect.w &&
    point.y >= layerCropRect.y &&
    point.y <= layerCropRect.y + layerCropRect.h
  );
}

// Arrastra un tirador: la esquina opuesta a la que se mueve queda fija,
// igual que al redimensionar cualquier capa.
function resizeLayerCropRect(origin, handle, x, y, bounds) {
  const anchor = getLayerCropHandlePoints(origin)[OPPOSITE_HANDLE[handle]];
  const rawX = Math.min(anchor.x, x);
  const rawY = Math.min(anchor.y, y);
  const rawW = Math.abs(x - anchor.x);
  const rawH = Math.abs(y - anchor.y);
  return normalizeLayerCropRect({ x: rawX, y: rawY, w: rawW, h: rawH }, bounds);
}

function setLayerCropMode(obj) {
  if (!obj || obj.type !== 'image') return;
  commitInlineEdit();
  if (cropMode) setCropMode(false);
  setAddTextMode(false);
  layerCropId = obj.id;
  layerCropRect = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
  draw();
}

function cancelLayerCrop() {
  layerCropId = null;
  layerCropRect = null;
  layerCropDragState = null;
  draw();
}

function applyLayerCrop() {
  const obj = getLayerCropObj();
  if (!obj || !layerCropRect) {
    cancelLayerCrop();
    return;
  }
  const bounds = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
  const r = normalizeLayerCropRect(layerCropRect, bounds);
  if (r.w < 1 || r.h < 1) {
    cancelLayerCrop();
    return;
  }
  pushHistory();

  // El marco vive en coordenadas del lienzo (el tamaño MOSTRADO de la
  // capa); acá se traduce a coordenadas de la imagen fuente
  // (0..naturalWidth) para no perder resolución al recortar una capa que
  // ya estaba agrandada o achicada a mano.
  const srcX = ((r.x - obj.x) / obj.width) * obj.img.naturalWidth;
  const srcY = ((r.y - obj.y) / obj.height) * obj.img.naturalHeight;
  const srcW = (r.w / obj.width) * obj.img.naturalWidth;
  const srcH = (r.h / obj.height) * obj.img.naturalHeight;

  const cropped = document.createElement('canvas');
  cropped.width = Math.max(1, Math.round(srcW));
  cropped.height = Math.max(1, Math.round(srcH));
  cropped.getContext('2d').drawImage(obj.img, srcX, srcY, srcW, srcH, 0, 0, cropped.width, cropped.height);

  const newImg = new Image();
  newImg.onload = () => {
    obj.img = newImg;
    obj.x = r.x;
    obj.y = r.y;
    obj.width = r.w;
    obj.height = r.h;
    layerCropId = null;
    layerCropRect = null;
    layerCropDragState = null;
    draw();
  };
  newImg.src = cropped.toDataURL('image/png');
}

layerCropBtn.addEventListener('click', () => setLayerCropMode(getSelectedLayer()));
layerCropApplyBtn.addEventListener('click', applyLayerCrop);
layerCropCancelBtn.addEventListener('click', cancelLayerCrop);

window.addEventListener('keydown', (evt) => {
  if (evt.key !== 'Escape' || layerCropId == null || editingId != null) return;
  cancelLayerCrop();
});

// Recuadro punteado + tiradores del marco de recorte de capa, al estilo del
// recorte de fondo (oscurece todo lo que queda afuera).
function drawLayerCropOverlay() {
  if (layerCropId == null || !layerCropRect) return;
  const obj = getLayerCropObj();
  if (!obj) return;
  const r = normalizeLayerCropRect(layerCropRect, { x: obj.x, y: obj.y, w: obj.width, h: obj.height });
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, r.y);
  ctx.fillRect(0, r.y + r.h, canvas.width, canvas.height - (r.y + r.h));
  ctx.fillRect(0, r.y, r.x, r.h);
  ctx.fillRect(r.x + r.w, r.y, canvas.width - (r.x + r.w), r.h);

  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);

  const points = getLayerCropHandlePoints(r);
  const size = Math.max(10, getCropHandleHitSize() * 0.55);
  for (const key of ['nw', 'ne', 'se', 'sw']) {
    const p = points[key];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  ctx.restore();
}

// ---- edición en vivo del texto ya puesto ----
let editingId = null;
let editOverlay = null;

const DEFAULT_SWATCHES = ['#c2a2da', '#9acd32', '#32cd32', '#ffff00', '#ffa500', '#ffb437'];
let swatches = DEFAULT_SWATCHES.slice();

// ---- grano monocromático (estilo Photoshop) ----
let grainTile = null;
let grainTileKey = null;

grainToggle.addEventListener('change', draw);
grainIntensityInput.addEventListener('input', draw);

// Genera (y cachea) una textura de ruido en escala de grises: cada píxel
// es un mismo valor repetido en R/G/B (monocromático, sin ruido de color),
// con variación alrededor del gris medio — el mismo principio que el
// filtro "Grano" de Photoshop. Se mezcla con blend "overlay" para que
// aclare zonas claras y oscurezca zonas oscuras, en vez de taparlas.
function ensureGrainTile(intensity) {
  const key = String(intensity);
  if (grainTile && grainTileKey === key) return grainTile;
  const size = 200;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  const imgData = tctx.createImageData(size, size);
  const amount = (intensity / 100) * 110; // variación alrededor de 128
  for (let i = 0; i < imgData.data.length; i += 4) {
    const v = Math.min(255, Math.max(0, 128 + (Math.random() - 0.5) * 2 * amount));
    imgData.data[i] = v;
    imgData.data[i + 1] = v;
    imgData.data[i + 2] = v;
    imgData.data[i + 3] = 255;
  }
  tctx.putImageData(imgData, 0, 0);
  grainTile = tile;
  grainTileKey = key;
  return tile;
}

function drawGrain() {
  if (!grainToggle.checked) return;
  const tile = ensureGrainTile(Number(grainIntensityInput.value));
  const pattern = ctx.createPattern(tile, 'repeat');
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// ---- desenfoque / saturación / blanco y negro ----
// Se aplican como filtro nativo del canvas (igual que un filtro CSS) justo
// al dibujar la imagen de fondo, así que salen "gratis" en rendimiento y
// quedan horneados al exportar sin afectar al texto ni al grano, que se
// dibujan después con el filtro ya apagado.
blurToggle.addEventListener('change', draw);
blurIntensityInput.addEventListener('input', draw);
saturationInput.addEventListener('input', draw);
brightnessInput.addEventListener('input', draw);
contrastInput.addEventListener('input', draw);
bwToggle.addEventListener('change', draw);

function getImageFilter() {
  const parts = [];
  if (blurToggle.checked) {
    parts.push(`blur(${Number(blurIntensityInput.value)}px)`);
  }
  const saturation = Number(saturationInput.value);
  if (saturation !== 100) {
    parts.push(`saturate(${saturation}%)`);
  }
  const brightness = Number(brightnessInput.value);
  if (brightness !== 100) {
    parts.push(`brightness(${brightness}%)`);
  }
  const contrast = Number(contrastInput.value);
  if (contrast !== 100) {
    parts.push(`contrast(${contrast}%)`);
  }
  if (bwToggle.checked) {
    parts.push('grayscale(100%)');
  }
  return parts.length ? parts.join(' ') : 'none';
}

// ---- efecto fantasma (ghosting) ----
// Dibuja una segunda copia semi-transparente de la misma imagen, desplazada
// (por defecto hacia la derecha) y con su propio difuminado — el eco/sombra
// del personaje. No hay detección de rostro en este editor, así que la
// copia es de la imagen completa; el desplazamiento y el difuminado son los
// que la hacen leer como "detrás" en vez de como una simple duplicación
// alineada. Se dibuja encima de la imagen base (con opacidad reducida) para
// que el eco se note incluso cuando la imagen ocupa todo el lienzo — si se
// dibujara por detrás, quedaría tapado casi por completo por la imagen
// principal. Respeta los mismos filtros (blanco y negro, saturación, etc.)
// que la imagen base, sumándole su propio difuminado.
ghostToggle.addEventListener('change', draw);
ghostOffsetXInput.addEventListener('input', draw);
ghostOffsetYInput.addEventListener('input', draw);
ghostOpacityInput.addEventListener('input', draw);
ghostBlurInput.addEventListener('input', draw);
ghostZoomInput.addEventListener('input', draw);

function drawGhost() {
  if (!ghostToggle.checked || !image) return;
  const offsetX = Number(ghostOffsetXInput.value);
  const offsetY = Number(ghostOffsetYInput.value);
  const opacity = Number(ghostOpacityInput.value) / 100;
  const ghostBlur = Number(ghostBlurInput.value);
  // El slider va de 0 a 200 pero representa "zoom EXTRA" sobre el tamaño
  // real: 0 = tamaño real de la imagen (100%), 200 = el triple (300%). Antes
  // se usaba el valor del slider directo como escala (0 -> 0%, o sea
  // invisible), por eso en 0 el fantasma no se veía en absoluto.
  const zoom = (100 + Number(ghostZoomInput.value)) / 100;

  const baseFilter = getImageFilter();
  const filter = ghostBlur > 0 ? `${baseFilter === 'none' ? '' : `${baseFilter} `}blur(${ghostBlur}px)` : baseFilter;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = filter;
  // Con zoom se escala alrededor del centro del rectángulo de la imagen y
  // después se aplica el desplazamiento, así el eco crece/encoge en el lugar
  // sin saltar de posición al mover el slider.
  if (cropMode) {
    const r = getCropImageDrawRect();
    const w = r.w * zoom;
    const h = r.h * zoom;
    ctx.drawImage(image, r.x + (r.w - w) / 2 + offsetX, r.y + (r.h - h) / 2 + offsetY, w, h);
  } else {
    const w = canvas.width * zoom;
    const h = canvas.height * zoom;
    ctx.drawImage(image, (canvas.width - w) / 2 + offsetX, (canvas.height - h) / 2 + offsetY, w, h);
  }
  ctx.restore();
}

resetEffectsBtn.addEventListener('click', () => {
  grainToggle.checked = false;
  grainIntensityInput.value = 0;
  blurToggle.checked = false;
  blurIntensityInput.value = 0;
  saturationInput.value = 100;
  brightnessInput.value = 100;
  contrastInput.value = 100;
  bwToggle.checked = false;
  ghostToggle.checked = false;
  ghostOffsetXInput.value = 0;
  ghostOffsetYInput.value = 0;
  ghostOpacityInput.value = 0;
  ghostBlurInput.value = 0;
  ghostZoomInput.value = 0;
  refreshAllRangeProgress();
  refreshEffectMeters();
  draw();
});

function setAddTextMode(active) {
  addTextMode = active;
  addTextBtn.dataset.active = String(active);
  canvas.classList.toggle('tool-add-text', active);
}

addTextBtn.addEventListener('click', () => {
  commitInlineEdit();
  if (layerCropId != null) cancelLayerCrop();
  setAddTextMode(!addTextMode);
});

// Si la línea empieza con "*" (estilo /me de rol) o con "(Coche)", se
// colorea sola como vista previa mientras el usuario escribe. Se puede
// seguir ajustando a mano con el selector de color.
function detectAutoColor(text) {
  const firstLine = text.split('\n')[0].trimStart();
  if (firstLine.startsWith('*')) return ME_COLOR;
  if (/^\(coche\)/i.test(firstLine)) return COCHE_COLOR;
  return null;
}

// Corta automáticamente cada línea a los 60 caracteres (salto de línea
// obligatorio) para que la casilla no se alargue de más y, sobre todo,
// para que el texto resultante en la imagen tampoco se estire de más —
// el canvas no envuelve líneas largas por su cuenta.
const LINE_CHAR_LIMIT = 85;

// Marcador invisible que se antepone a toda línea física creada por un
// corte automático (no por el usuario apretando Enter). Sirve para que,
// al guardar el texto, una oración larga que quedó partida en dos líneas
// por este límite no pierda el color a mitad de camino: la línea marcada
// no se reclasifica sola (no importa si ya no empieza con "*"), hereda el
// color de la línea lógica a la que en realidad pertenece. Se saca del
// texto final antes de guardarlo, así que nunca es visible ni queda
// grabado en ningún lado.
const AUTO_WRAP_MARKER = '\u200B';

function applyHardWrap(text, caretPos) {
  let result = '';
  let newCaret = caretPos;
  let col = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === AUTO_WRAP_MARKER) {
      // Ya es un corte automático puesto en una pasada anterior sobre el
      // mismo texto: es invisible, no cuenta para el ancho de línea.
      result += ch;
      i += 1;
      continue;
    }
    if (ch === '\n') {
      result += ch;
      col = 0;
      i += 1;
      continue;
    }
    if (col === LINE_CHAR_LIMIT) {
      // Buscamos el último espacio de la línea actual para cortar ahí
      // en vez de partir la palabra a la mitad.
      let breakAt = -1;
      for (let j = result.length - 1; j >= 0 && result[j] !== '\n'; j--) {
        if (result[j] === ' ') {
          breakAt = j;
          break;
        }
      }
      if (breakAt !== -1) {
        // Reemplaza ese espacio por un salto de línea + marcador (pasa de
        // 1 carácter a 2, por eso sí hay que correr el caret un lugar si
        // caía después de este punto) y la palabra en curso pasa completa
        // a la siguiente línea.
        const after = result.slice(breakAt + 1);
        result = result.slice(0, breakAt) + '\n' + AUTO_WRAP_MARKER + after;
        if (i < caretPos) newCaret += 1;
        col = after.length;
      } else {
        // No hay ningún espacio en la línea (una sola "palabra" ya
        // ocupa el límite completo): como último recurso, cortamos
        // igual para no romper el layout.
        result += '\n' + AUTO_WRAP_MARKER;
        if (i < caretPos) newCaret += 2;
        col = 0;
      }
      continue;
    }
    result += ch;
    col += 1;
    i += 1;
  }
  return { text: result, caret: newCaret };
}

textInput.addEventListener('input', () => {
  const caret = textInput.selectionStart;
  const { text: wrapped, caret: newCaret } = applyHardWrap(textInput.value, caret);
  if (wrapped !== textInput.value) {
    textInput.value = wrapped;
    textInput.setSelectionRange(newCaret, newCaret);
  }
  const auto = detectAutoColor(textInput.value);
  if (auto) textColorInput.value = auto;
  updateAddTextBtnVisibility();
});

// El botón "+ Añadir texto" solo aparece si hay algo escrito en la casilla
// de texto de la izquierda — si está vacía no hay nada que agregar, así
// que no tiene sentido dejarlo ahí ocupando lugar.
function updateAddTextBtnVisibility() {
  const hasText = textInput.value.trim().length > 0;
  addTextBtn.hidden = !hasText;
  // Si el usuario borra todo el texto mientras el modo "agregar" seguía
  // activo, se apaga solo — no puede quedar un modo activo sin botón
  // visible para desactivarlo.
  if (!hasText && addTextMode) setAddTextMode(false);
}

// ---- paleta de colores predeterminados (persistida) ----

(async () => {
  try {
    const config = await window.signalLog.getConfig();
    if (Array.isArray(config.colorSwatches) && config.colorSwatches.length) {
      swatches = config.colorSwatches;
    }
  } catch {
    // se usa la paleta por defecto si no hay config todavía
  }
  renderSwatches();
})();

function renderSwatches() {
  colorSwatchesEl.innerHTML = '';
  for (const color of swatches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.color = color;
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener('click', () => {
      if (getLiveTargetObj()) pushHistory();
      applyColor(color);
    });
    btn.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      swatches = swatches.filter((c) => c !== color);
      persistSwatches();
      renderSwatches();
    });
    colorSwatchesEl.appendChild(btn);
  }
  // El botón "+" vive dentro de la misma píldora que los swatches (al
  // final, a la derecha) en vez de ser un botón aparte con texto — innerHTML
  // = '' de arriba lo desmonta del DOM, así que se vuelve a enganchar acá.
  // Es el mismo nodo (con su listener ya puesto), no uno nuevo.
  colorSwatchesEl.appendChild(addSwatchBtn);
}

function persistSwatches() {
  try {
    window.signalLog.setSwatches(swatches).catch(() => {});
  } catch {
    // sin preload disponible (ej. corriendo la vista fuera de Electron)
  }
}

// Resalta un instante el swatch ya guardado, para que quede claro que el
// botón "+ Color" sí reaccionó cuando el color elegido ya estaba en la
// paleta (si no, el clic no tenía ningún efecto visible y parecía roto).
function flashSwatch(color) {
  const btn = colorSwatchesEl.querySelector(`[data-color="${CSS.escape(color)}"]`);
  if (!btn) return;
  btn.classList.remove('swatch-flash');
  // Fuerza el reflow para poder reiniciar la animación si se hace doble clic.
  void btn.offsetWidth;
  btn.classList.add('swatch-flash');
  window.setTimeout(() => btn.classList.remove('swatch-flash'), 450);
}

addSwatchBtn.addEventListener('click', () => {
  const color = textColorInput.value;
  if (swatches.includes(color)) {
    flashSwatch(color);
    return;
  }
  swatches = [...swatches, color];
  persistSwatches();
  renderSwatches();
});

// ---- runs de color por línea ----
// Cada línea de un texto puede tener varios "runs" (tramos) — cada uno es
// { text, color } — que concatenados dan el texto completo de esa línea.
// Esto es lo que permite pintar un carácter o palabra puntual sin afectar
// el resto de la línea (antes solo existía un color por línea entera).

// El navegador normaliza "#rrggbb" a "rgb(r, g, b)" al leer un color ya
// puesto (por ejemplo span.style.color): todo el resto del código
// (swatches, detectAutoColor, exportación) espera siempre formato hex.
function normalizeColorToHex(value) {
  if (!value) return value;
  if (value.startsWith('#')) return value.toLowerCase();
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return value;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function lineTextFromRuns(runs) {
  return runs.map((r) => r.text).join('');
}

function firstColorOf(runs, fallback) {
  return runs && runs.length ? runs[0].color : fallback;
}

// Junta runs consecutivos del mismo color en uno solo, y descarta los que
// quedaron sin texto — evita ir acumulando <span> de más en el DOM.
function mergeRuns(runs) {
  const merged = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = merged[merged.length - 1];
    if (last && last.color === run.color) {
      last.text += run.text;
    } else {
      merged.push({ text: run.text, color: run.color });
    }
  }
  return merged;
}

// Recorta un array de runs a un sub-rango [start, end) de caracteres,
// partiendo los runs que caigan justo en el borde del recorte.
function sliceRuns(runs, start, end) {
  const result = [];
  let pos = 0;
  for (const run of runs) {
    const runStart = pos;
    const runEnd = pos + run.text.length;
    pos = runEnd;
    const from = Math.max(start, runStart);
    const to = Math.min(end, runEnd);
    if (from < to) result.push({ text: run.text.slice(from - runStart, to - runStart), color: run.color });
  }
  return result;
}

// Aplica un color a un sub-rango de caracteres [start, end) dentro de los
// runs de una línea, conservando el color del resto del texto de esa línea.
function applyColorToLineRange(runs, start, end, color) {
  if (start === end) return runs;
  const before = sliceRuns(runs, 0, start);
  const middle = sliceRuns(runs, start, end).map((r) => ({ text: r.text, color }));
  const after = sliceRuns(runs, end, Infinity);
  return mergeRuns([...before, ...middle, ...after]);
}

// Color del carácter justo antes del offset dado (o el primero, si el
// cursor está al inicio de la línea) — se usa para decidir con qué color
// continúa el texto pegado o el color a mostrar en el selector.
function colorAtOffset(runs, offset, fallbackColor) {
  if (!runs.length) return fallbackColor;
  let pos = 0;
  for (const run of runs) {
    pos += run.text.length;
    if (offset <= pos) return run.color;
  }
  return runs[runs.length - 1].color;
}

// Reconstruye el DOM de una línea (un <span> por cada run, con su color
// inline) a partir de sus runs de color. Una línea vacía queda como un
// <br> solo, igual que antes.
function renderLineRuns(div, runs, fallbackColor) {
  div.innerHTML = '';
  const clean = mergeRuns(runs);
  if (!clean.length) {
    div.appendChild(document.createElement('br'));
    return;
  }
  for (const run of clean) {
    const span = document.createElement('span');
    span.style.color = run.color || fallbackColor;
    span.textContent = run.text;
    div.appendChild(span);
  }
}

// Lee los runs de color que hay realmente en el DOM de una línea. Es la
// fuente de verdad después de que el usuario escribe directamente (sin
// pasar por Enter/Backspace/pegado, que ya arman los runs a mano): el
// navegador decide en qué nodo de texto cae cada tecleo, así que en vez
// de llevar la cuenta aparte, se relee del DOM cada vez. Un nodo de texto
// suelto sin <span> (puede pasar al escribir en una línea vacía) hereda
// el color del run anterior, o el color por defecto de la línea si es
// el primero.
function readLineRunsFromDom(div, fallbackColor) {
  const runs = [];
  for (const node of div.childNodes) {
    if (node.nodeName === 'BR') continue;
    if (node.nodeType === 3) {
      const color = runs.length ? runs[runs.length - 1].color : fallbackColor;
      runs.push({ text: node.textContent, color });
    } else if (node.nodeType === 1) {
      const color = normalizeColorToHex(node.style.color) || fallbackColor;
      runs.push({ text: node.textContent, color });
    }
  }
  return mergeRuns(runs.length ? runs : [{ text: '', color: fallbackColor }]);
}

// Ubica, dentro de una línea ya reconstruida en spans, el nodo de texto y
// el offset dentro de él que corresponden a un offset de carácter de la
// línea completa — lo que Range necesita para poner ahí el cursor o el
// borde de una selección.
function findTextNodeAndOffset(div, charOffset) {
  let pos = 0;
  for (const node of div.childNodes) {
    if (node.nodeName === 'BR') continue;
    const len = node.textContent.length;
    if (charOffset <= pos + len) {
      const textNode = node.nodeType === 3 ? node : node.firstChild;
      return textNode ? { node: textNode, offset: charOffset - pos } : { node: div, offset: 0 };
    }
    pos += len;
  }
  return { node: div, offset: 0 };
}

// Aplica un color: si hay una selección real (no solo el cursor parado),
// colorea exactamente los caracteres seleccionados —aunque sea una sola
// letra— sin tocar el resto de la línea; si solo hay cursor (nada
// resaltado), se mantiene el atajo de antes: colorea la línea completa
// donde está parado.
function applyColorInOverlay(obj, overlay, color) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const divs = lineDivs(overlay);
  const startDiv = closestLineDiv(overlay, range.startContainer);
  const endDiv = closestLineDiv(overlay, range.endContainer);
  if (!startDiv || !endDiv) return;

  if (sel.isCollapsed) {
    const idx = divs.indexOf(startDiv);
    if (idx === -1) return;
    const offset = getCaretOffsetInLine(startDiv);
    obj.lineRuns[idx] = [{ text: lineTextFromRuns(obj.lineRuns[idx]), color }];
    renderLineRuns(startDiv, obj.lineRuns[idx], obj.color);
    setCaretInLine(startDiv, offset);
    return;
  }

  const startOffset = offsetInLine(startDiv, range.startContainer, range.startOffset);
  const endOffset = offsetInLine(endDiv, range.endContainer, range.endOffset);
  const startIdx = divs.indexOf(startDiv);
  const endIdx = divs.indexOf(endDiv);
  // Normaliza para que "from" sea siempre el punto anterior de la
  // selección, sin importar en qué dirección se arrastró.
  const [fromIdx, fromOffset, toIdx, toOffset] =
    startIdx < endIdx || (startIdx === endIdx && startOffset <= endOffset)
      ? [startIdx, startOffset, endIdx, endOffset]
      : [endIdx, endOffset, startIdx, startOffset];

  for (let i = fromIdx; i <= toIdx; i++) {
    const lineLen = lineTextFromRuns(obj.lineRuns[i]).length;
    const rangeStart = i === fromIdx ? fromOffset : 0;
    const rangeEnd = i === toIdx ? toOffset : lineLen;
    obj.lineRuns[i] = applyColorToLineRange(obj.lineRuns[i], rangeStart, rangeEnd, color);
    renderLineRuns(divs[i], obj.lineRuns[i], obj.color);
  }

  restoreSelectionAcrossLines(overlay, fromIdx, fromOffset, toIdx, toOffset);
}

function restoreSelectionAcrossLines(overlay, startIdx, startOffset, endIdx, endOffset) {
  const divs = lineDivs(overlay);
  const startInfo = findTextNodeAndOffset(divs[startIdx], startOffset);
  const endInfo = findTextNodeAndOffset(divs[endIdx], endOffset);
  const range = document.createRange();
  range.setStart(startInfo.node, startInfo.offset);
  range.setEnd(endInfo.node, endInfo.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Aplica un color: si se está editando un texto, se pinta exactamente lo
// seleccionado (o la línea completa si no hay nada resaltado, ver
// applyColorInOverlay); si el texto está solo seleccionado (sin editar),
// se pinta completo; si no hay nada seleccionado, queda como color por
// defecto para el próximo texto.
function applyColor(color) {
  textColorInput.value = color;
  const target = getLiveTargetObj();
  if (!target) return;
  if (editOverlay && target.id === editingId) {
    applyColorInOverlay(target, editOverlay, color);
  } else {
    target.color = color;
    target.lineRuns = target.lineRuns.map((runs) => [{ text: lineTextFromRuns(runs), color }]);
  }
  draw();
}

// Devuelve el objeto de texto que deben afectar en vivo los controles de
// color/tamaño/contorno: el que se está editando, o si no el seleccionado —
// pero nunca mientras se está por colocar un texto nuevo (esos controles
// son entonces el valor por defecto para el próximo texto).
// Solo devuelve el objeto si es de tipo texto: los controles de color,
// tamaño de fuente y fondo son propios del texto y no tienen sentido sobre
// una capa de imagen (que se maneja con el panel "Capa").
function getLiveTargetObj() {
  if (addTextMode) return null;
  const id = editingId != null ? editingId : selectedId;
  if (id == null) return null;
  const obj = layers.find((o) => o.id === id) || null;
  return obj && obj.type === 'text' ? obj : null;
}

// Refleja en el selector de color el color real del carácter donde está
// el cursor dentro del texto en edición (cada tramo ya se ve con su
// propio color mientras se edita, no hace falta "simular" nada más).
function syncColorFromSelection(obj, overlay) {
  const div = getCurrentLineDiv(overlay);
  const divs = lineDivs(overlay);
  const idx = div ? divs.indexOf(div) : 0;
  const runs = obj.lineRuns[idx] || [];
  const offset = div ? getCaretOffsetInLine(div) : 0;
  textColorInput.value = colorAtOffset(runs, offset, obj.color);
}

// Cada gesto de arrastre en el selector de color (o cada apertura del
// selector nativo) cuenta como una única acción para deshacer: se guarda el
// estado una sola vez al principio del gesto, no en cada evento 'input'
// mientras se arrastra dentro del selector.
let colorHistoryPending = true;
textColorInput.addEventListener('focus', () => {
  colorHistoryPending = true;
});
textColorInput.addEventListener('input', () => {
  if (colorHistoryPending && getLiveTargetObj()) pushHistory();
  colorHistoryPending = false;
  applyColor(textColorInput.value);
});
textColorInput.addEventListener('change', () => {
  colorHistoryPending = true;
});

function updateFontSizeLabel() {
  fontSizeValueEl.textContent = `${fontSizeInput.value}px`;
}
updateFontSizeLabel();

function applyFontSize(size) {
  fontSizeInput.value = size;
  refreshAllRangeProgress();
  updateFontSizeLabel();
  const target = getLiveTargetObj();
  if (!target) return;
  target.fontSize = Number(size);
  if (editOverlay && target.id === editingId) {
    applyOverlayStyle(editOverlay, target);
    positionOverlay(editOverlay, target);
  }
  draw();
}

// Mismo criterio que el color: un solo paso de historial por cada
// arrastre del control deslizante de tamaño, no uno por cada píxel.
let fontSizeHistoryPending = true;
fontSizeInput.addEventListener('focus', () => {
  fontSizeHistoryPending = true;
});
fontSizeInput.addEventListener('input', () => {
  if (fontSizeHistoryPending && getLiveTargetObj()) pushHistory();
  fontSizeHistoryPending = false;
  applyFontSize(fontSizeInput.value);
});
fontSizeInput.addEventListener('change', () => {
  fontSizeHistoryPending = true;
});

// ---- tamaños de fuente predeterminados (persistidos), mismo patrón que
// la paleta de colores: clic para usarlo, clic derecho para sacarlo de la
// lista, "+ Tamaño" para guardar el valor actual del control deslizante.
const DEFAULT_SIZE_PRESETS = [16, 18, 24,];
const SIZE_PRESETS_KEY = 'signalLog.fontSizePresets';
let sizePresets = DEFAULT_SIZE_PRESETS.slice();
try {
  const saved = JSON.parse(localStorage.getItem(SIZE_PRESETS_KEY) || 'null');
  if (Array.isArray(saved) && saved.length) sizePresets = saved;
} catch {
  // se usa la lista por defecto si no hay nada guardado todavía
}

function persistSizePresets() {
  try {
    localStorage.setItem(SIZE_PRESETS_KEY, JSON.stringify(sizePresets));
  } catch {
    // si el storage no está disponible, los presets solo duran la sesión
  }
}

function renderSizePresets() {
  sizePresetsEl.innerHTML = '';
  for (const size of sizePresets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch swatch-size';
    btn.dataset.size = String(size);
    btn.textContent = `${size}`;
    btn.title = `${size}px`;
    btn.addEventListener('click', () => {
      if (getLiveTargetObj()) pushHistory();
      applyFontSize(size);
    });
    btn.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      sizePresets = sizePresets.filter((s) => s !== size);
      persistSizePresets();
      renderSizePresets();
    });
    sizePresetsEl.appendChild(btn);
  }
  // Mismo motivo que en renderSwatches(): reengancha el botón "+" (mismo
  // nodo, no uno nuevo) al final de la píldora tras el innerHTML = ''.
  sizePresetsEl.appendChild(addSizePresetBtn);
}
renderSizePresets();

addSizePresetBtn.addEventListener('click', () => {
  const size = Number(fontSizeInput.value);
  if (sizePresets.includes(size)) return;
  sizePresets = [...sizePresets, size].sort((a, b) => a - b);
  persistSizePresets();
  renderSizePresets();
});

strokeToggle.addEventListener('change', () => {
  const target = getLiveTargetObj();
  if (!target) return;
  pushHistory();
  target.stroke = strokeToggle.checked;
  draw();
});

// ---- fondo de texto estilo "SolidChat" (caja sólida o semitransparente
// detrás de cada línea, como en el chat de FiveM/GTAW cuando se usa ese
// resource en vez del chat nativo translúcido) ----
const BG_BUTTONS = { none: bgNoneBtn, solid: bgSolidBtn, semi: bgSemiBtn };
let bgStyleValue = 'none'; // valor activo: se usa tanto para el próximo texto como para el seleccionado

function setBgActiveUI(style) {
  for (const [key, btn] of Object.entries(BG_BUTTONS)) {
    btn.dataset.active = String(key === style);
  }
}

function applyBgStyle(style) {
  bgStyleValue = style;
  setBgActiveUI(style);
  const target = getLiveTargetObj();
  if (!target) return;
  pushHistory();
  target.bg = style;
  draw();
}

bgNoneBtn.addEventListener('click', () => applyBgStyle('none'));
bgSolidBtn.addEventListener('click', () => applyBgStyle('solid'));
bgSemiBtn.addEventListener('click', () => applyBgStyle('semi'));

function syncToolbarToObject(obj) {
  textColorInput.value = firstColorOf(obj.lineRuns[0], obj.color);
  fontSizeInput.value = obj.fontSize;
  refreshAllRangeProgress();
  updateFontSizeLabel();
  strokeToggle.checked = obj.stroke;
  bgStyleValue = obj.bg || 'none';
  setBgActiveUI(bgStyleValue);
}

// ---- panel de capas (opacidad + orden, común a texto e imagen) ----

function getSelectedLayer() {
  return selectedId == null ? null : layers.find((o) => o.id === selectedId) || null;
}

function updateLayerControlsUI() {
  const obj = getSelectedLayer();
  // "Contorno" y "Fondo" solo tienen sentido sobre un texto seleccionado
  // (no aplican a imágenes ni formas), así que se ocultan el resto del
  // tiempo en vez de quedar ahí sin hacer nada.
  const isTextSelected = !!obj && obj.type === 'text';
  strokeChipEl.hidden = !isTextSelected;
  textBgFieldEl.hidden = !isTextSelected;

  if (!obj) {
    layerControlsEl.hidden = true;
    shapeControlsEl.hidden = true;
    return;
  }
  layerControlsEl.hidden = false;
  const opacityPct = Math.round((obj.opacity != null ? obj.opacity : 1) * 100);
  layerOpacityInput.value = opacityPct;
  layerOpacityValueEl.textContent = `${opacityPct}%`;
  refreshAllRangeProgress();

  // Botones de recorte de capa: "Recortar" solo tiene sentido para una
  // imagen superpuesta (no el fondo, que tiene su propio recorte aparte, ni
  // texto/formas). Mientras se está recortando ESTA capa, se ocultan y se
  // muestran en su lugar "Aplicar"/"Cancelar", y el resto de los controles
  // de la capa se deshabilita para no reordenar/borrar a mitad de camino.
  const isCroppingThis = layerCropId === obj.id;
  layerCropBtn.hidden = obj.type !== 'image' || isCroppingThis;
  layerCropApplyBtn.hidden = !isCroppingThis;
  layerCropCancelBtn.hidden = !isCroppingThis;
  layerFrontBtn.disabled = isCroppingThis;
  layerBackBtn.disabled = isCroppingThis;
  layerOpacityInput.disabled = isCroppingThis;
  layerDeleteBtn.disabled = isCroppingThis;

  shapeControlsEl.hidden = obj.type !== 'shape';
}

layerOpacityInput.addEventListener('input', () => {
  const obj = getSelectedLayer();
  if (!obj) return;
  obj.opacity = Number(layerOpacityInput.value) / 100;
  layerOpacityValueEl.textContent = `${layerOpacityInput.value}%`;
  draw();
});
// Un único paso de "deshacer" por arrastre del control: se guarda el
// estado apenas se empieza a arrastrar, no en cada pequeño cambio de valor.
layerOpacityInput.addEventListener('pointerdown', () => {
  const obj = getSelectedLayer();
  if (obj) pushHistory();
});

layerFrontBtn.addEventListener('click', () => {
  const obj = getSelectedLayer();
  if (!obj) return;
  const idx = layers.indexOf(obj);
  if (idx === layers.length - 1) return; // ya está arriba de todo
  pushHistory();
  layers.splice(idx, 1);
  layers.push(obj);
  draw();
});

layerBackBtn.addEventListener('click', () => {
  const obj = getSelectedLayer();
  if (!obj) return;
  const idx = layers.indexOf(obj);
  if (idx === 0) return; // ya está abajo de todo
  pushHistory();
  layers.splice(idx, 1);
  layers.unshift(obj);
  draw();
});

layerDeleteBtn.addEventListener('click', () => {
  deleteSelectedLayer();
});

// ---- abrir imagen ----

openImageBtn.addEventListener('click', async () => {
  commitInlineEdit();
  const result = await window.signalLog.openImage();
  if (!result.ok) return;

  const img = new Image();
  img.onload = () => {
    image = img;
    layers = [];
    selectedId = null;
    setCropMode(false);
    imageAspectRatio = img.naturalWidth / img.naturalHeight;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    resWidthInput.value = img.naturalWidth;
    resHeightInput.value = img.naturalHeight;
    canvas.hidden = false;
    canvasEmpty.style.display = 'none';
    updateImageDependentUI();
    // Imagen nueva: arranca "ajustada" al panel (mismo comportamiento que
    // tenía el canvas por defecto antes de que hubiera zoom manual), no
    // conservando el porcentaje que hubiera quedado de la imagen anterior.
    fitZoomToContainer();
    // Una imagen nueva arranca su propia historia; la de la imagen
    // anterior ya no tiene sentido (referencia a otro canvas/tamaño).
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    draw();
  };
  img.src = result.dataUrl;
});

// ---- superponer otra imagen como capa (foto, sticker, logo, etc.) ----

addImageBtn.addEventListener('click', async () => {
  if (!image) return;
  commitInlineEdit();
  if (cropMode) setCropMode(false);
  if (layerCropId != null) cancelLayerCrop();
  const result = await window.signalLog.openImage();
  if (!result.ok) return;

  const img = new Image();
  img.onload = () => {
    pushHistory();
    // Arranca centrada, ocupando como mucho la mitad del lienzo (sin
    // agrandarla si ya es más chica), para no tapar toda la escena de una.
    const maxW = canvas.width * 0.5;
    const maxH = canvas.height * 0.5;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const width = Math.max(MIN_IMAGE_LAYER_SIZE, img.naturalWidth * scale);
    const height = Math.max(MIN_IMAGE_LAYER_SIZE, img.naturalHeight * scale);
    const obj = {
      id: nextId++,
      type: 'image',
      x: (canvas.width - width) / 2,
      y: (canvas.height - height) / 2,
      width,
      height,
      opacity: 1,
      img,
    };
    layers.push(obj);
    selectedId = obj.id;
    draw();
  };
  img.src = result.dataUrl;
});

// ---- agregar un rectángulo (forma geométrica) ----

addRectBtn.addEventListener('click', () => {
  if (!image) return;
  commitInlineEdit();
  if (cropMode) setCropMode(false);
  if (layerCropId != null) cancelLayerCrop();
  setAddTextMode(false);
  pushHistory();
  // Arranca centrado, con un tamaño cómodo relativo al lienzo — el usuario
  // lo redimensiona libremente después desde cualquiera de sus 4 esquinas.
  const width = Math.max(MIN_IMAGE_LAYER_SIZE, Math.min(canvas.width * 0.4, 260));
  const height = Math.max(MIN_IMAGE_LAYER_SIZE, Math.min(canvas.height * 0.3, 160));
  const obj = {
    id: nextId++,
    type: 'shape',
    shapeType: 'rect',
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
    fillEnabled: shapeFillToggle.checked,
    fillColor: shapeFillColorInput.value,
    strokeEnabled: shapeStrokeToggle.checked,
    strokeColor: shapeStrokeColorInput.value,
    strokeWidth: Number(shapeStrokeWidthInput.value),
    opacity: 1,
  };
  layers.push(obj);
  selectedId = obj.id;
  draw();
});

// ---- agregar un área de desenfoque (para tapar caras, placas, etc.) ----
// Es una "forma" más (mismo x/y/width/height, mismo sistema de arrastre y
// tiradores, mismo botón de traer al frente/enviar atrás), pero en vez de
// rellenar el área con un color, difumina lo que haya debajo de ella.

addBlurBtn.addEventListener('click', () => {
  if (!image) return;
  commitInlineEdit();
  if (cropMode) setCropMode(false);
  if (layerCropId != null) cancelLayerCrop();
  setAddTextMode(false);
  pushHistory();
  const width = Math.max(MIN_IMAGE_LAYER_SIZE, Math.min(canvas.width * 0.4, 260));
  const height = Math.max(MIN_IMAGE_LAYER_SIZE, Math.min(canvas.height * 0.3, 160));
  const obj = {
    id: nextId++,
    type: 'shape',
    shapeType: 'blur',
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
    blurAmount: Number(shapeBlurAmountInput.value),
    opacity: 1,
  };
  layers.push(obj);
  selectedId = obj.id;
  draw();
});

// ---- panel de la forma seleccionada (relleno / borde) ----

function getSelectedShape() {
  const obj = getSelectedLayer();
  return obj && obj.type === 'shape' ? obj : null;
}

function syncShapeToolbarToObject(obj) {
  const isBlur = obj.shapeType === 'blur';
  shapeRectFieldsEl.hidden = isBlur;
  shapeBlurFieldsEl.hidden = !isBlur;
  if (isBlur) {
    shapeBlurAmountInput.value = obj.blurAmount;
    shapeBlurAmountValueEl.textContent = `${obj.blurAmount}px`;
  } else {
    shapeFillToggle.checked = obj.fillEnabled;
    shapeFillColorInput.value = obj.fillColor;
    shapeStrokeToggle.checked = obj.strokeEnabled;
    shapeStrokeColorInput.value = obj.strokeColor;
    shapeStrokeWidthInput.value = obj.strokeWidth;
    shapeStrokeWidthValueEl.textContent = `${obj.strokeWidth}px`;
  }
  refreshAllRangeProgress();
}

// Mismo criterio que el color/tamaño de texto: un único paso de historial
// por cada gesto de arrastre (o cada apertura del selector de color), no
// uno por cada evento 'input' mientras se arrastra.
let shapeHistoryPending = true;
function armShapeHistoryPending() {
  shapeHistoryPending = true;
}
[shapeFillColorInput, shapeStrokeColorInput, shapeStrokeWidthInput, shapeBlurAmountInput].forEach((el) => {
  el.addEventListener('focus', armShapeHistoryPending);
  el.addEventListener('change', armShapeHistoryPending);
});
shapeStrokeWidthInput.addEventListener('pointerdown', armShapeHistoryPending);
shapeBlurAmountInput.addEventListener('pointerdown', armShapeHistoryPending);

shapeFillToggle.addEventListener('change', () => {
  const target = getSelectedShape();
  if (!target) return;
  pushHistory();
  target.fillEnabled = shapeFillToggle.checked;
  draw();
});

shapeFillColorInput.addEventListener('input', () => {
  const target = getSelectedShape();
  if (!target) return;
  if (shapeHistoryPending) pushHistory();
  shapeHistoryPending = false;
  target.fillColor = shapeFillColorInput.value;
  draw();
});

shapeStrokeToggle.addEventListener('change', () => {
  const target = getSelectedShape();
  if (!target) return;
  pushHistory();
  target.strokeEnabled = shapeStrokeToggle.checked;
  draw();
});

shapeStrokeColorInput.addEventListener('input', () => {
  const target = getSelectedShape();
  if (!target) return;
  if (shapeHistoryPending) pushHistory();
  shapeHistoryPending = false;
  target.strokeColor = shapeStrokeColorInput.value;
  draw();
});

shapeStrokeWidthInput.addEventListener('input', () => {
  shapeStrokeWidthValueEl.textContent = `${shapeStrokeWidthInput.value}px`;
  const target = getSelectedShape();
  if (!target) return;
  if (shapeHistoryPending) pushHistory();
  shapeHistoryPending = false;
  target.strokeWidth = Number(shapeStrokeWidthInput.value);
  draw();
});

shapeBlurAmountInput.addEventListener('input', () => {
  shapeBlurAmountValueEl.textContent = `${shapeBlurAmountInput.value}px`;
  const target = getSelectedShape();
  if (!target) return;
  if (shapeHistoryPending) pushHistory();
  shapeHistoryPending = false;
  target.blurAmount = Number(shapeBlurAmountInput.value);
  draw();
});

// ---- resolución de salida ----

// Dropdown genérico: un botón que abre/cierra un panel flotante debajo
// suyo, y se cierra solo al hacer clic afuera (o al abrir otro dropdown).
function setupDropdown(toggleBtn, panelEl) {
  // El panel es `position: fixed` (ver el comentario en .dropdown-panel en
  // styles.css: la barra de herramientas recorta con overflow, así que un
  // panel `absolute` quedaba cortado). Al ser fixed, sus coordenadas son
  // respecto a la ventana y hay que calcularlas acá a partir de dónde está
  // realmente el botón en ese momento.
  function positionPanel() {
    const rect = toggleBtn.getBoundingClientRect();
    panelEl.style.top = `${rect.bottom + 8}px`;
    panelEl.style.left = `${rect.left}px`;
    // Si el panel se sale por la derecha de la ventana (botones que quedan
    // al final de la barra), se corre hacia la izquierda lo justo para que
    // entre, sin pasarse del borde izquierdo.
    const panelRect = panelEl.getBoundingClientRect();
    const overflowRight = panelRect.right - window.innerWidth + 8;
    if (overflowRight > 0) {
      panelEl.style.left = `${Math.max(8, rect.left - overflowRight)}px`;
    }
  }
  function close() {
    panelEl.classList.remove('open');
    document.removeEventListener('mousedown', onOutsideClick);
    // `true` = fase de captura: así también se entera del scroll de la
    // propia barra de herramientas, que no burbujea hasta window.
    window.removeEventListener('scroll', positionPanel, true);
    window.removeEventListener('resize', positionPanel);
  }
  function onOutsideClick(evt) {
    if (!panelEl.contains(evt.target) && evt.target !== toggleBtn) close();
  }
  toggleBtn.addEventListener('click', (evt) => {
    evt.stopPropagation();
    const wasOpen = panelEl.classList.contains('open');
    document.querySelectorAll('.dropdown-panel.open').forEach((p) => {
      if (p !== panelEl) p.classList.remove('open');
    });
    if (wasOpen) {
      close();
    } else {
      // Primero `open` (para que deje de ser display:none y se pueda
      // medir), recién después posicionar.
      panelEl.classList.add('open');
      positionPanel();
      document.addEventListener('mousedown', onOutsideClick);
      window.addEventListener('scroll', positionPanel, true);
      window.addEventListener('resize', positionPanel);
    }
  });
  return close;
}

const closeResDropdown = setupDropdown(resDropdownBtn, resDropdownPanel);
const closeCropSizeDropdown = setupDropdown(cropSizeDropdownBtn, cropSizeDropdownPanel);

resWidthInput.addEventListener('input', () => {
  if (!lockAspectToggle.checked || !imageAspectRatio) return;
  const w = Number(resWidthInput.value);
  if (w > 0) resHeightInput.value = Math.round(w / imageAspectRatio);
});

resHeightInput.addEventListener('input', () => {
  if (!lockAspectToggle.checked || !imageAspectRatio) return;
  const h = Number(resHeightInput.value);
  if (h > 0) resWidthInput.value = Math.round(h * imageAspectRatio);
});

applyResolutionBtn.addEventListener('click', () => {
  applyResolution(Number(resWidthInput.value), Number(resHeightInput.value));
  closeResDropdown();
});

// Aplica una resolución de salida exacta: reescala el lienzo y reacomoda
// los textos ya puestos (posición y tamaño de letra) para que mantengan
// las mismas proporciones relativas a la imagen.
function applyResolution(newWidth, newHeight) {
  if (!image) return;
  commitInlineEdit();
  if (cropMode) setCropMode(false);
  if (layerCropId != null) cancelLayerCrop();
  newWidth = Math.round(newWidth);
  newHeight = Math.round(newHeight);
  if (!(newWidth > 0 && newHeight > 0)) return;
  if (newWidth === canvas.width && newHeight === canvas.height) return;
  pushHistory();

  const oldWidth = canvas.width;
  const oldHeight = canvas.height;
  const scaleX = newWidth / oldWidth;
  const scaleY = newHeight / oldHeight;
  const scaleAvg = (scaleX + scaleY) / 2;

  for (const obj of layers) {
    obj.x *= scaleX;
    obj.y *= scaleY;
    if (obj.type === 'image' || obj.type === 'shape') {
      obj.width *= scaleX;
      obj.height *= scaleY;
      if (obj.type === 'shape') obj.strokeWidth = Math.max(1, obj.strokeWidth * scaleAvg);
    } else {
      obj.fontSize = Math.max(MIN_FONT_SIZE, Math.round(obj.fontSize * scaleAvg));
    }
  }

  canvas.width = newWidth;
  canvas.height = newHeight;
  resWidthInput.value = newWidth;
  resHeightInput.value = newHeight;
  // Mismo criterio que el recorte: cambia el tamaño del canvas, no el
  // porcentaje de zoom elegido.
  applyCanvasZoom();
  draw();
}

// Resoluciones predeterminadas: aplican directo, sin tener que tipear.
resPreset1080Btn.addEventListener('click', () => {
  applyResolution(1920, 1080);
  closeResDropdown();
});
resPreset720Btn.addEventListener('click', () => {
  applyResolution(1280, 720);
  closeResDropdown();
});

// ---- dibujo ----

function fontString(obj) {
  return `${obj.italic ? 'italic ' : ''}500 ${obj.fontSize}px Inter, sans-serif`;
}

// Soporta texto multilínea: devuelve el ancho máximo entre líneas y el
// alto total, además de las líneas ya separadas, su interlineado y el
// ancho individual de cada línea (usado para las cajas de fondo, que se
// ajustan al ancho real de cada línea en vez de al bloque completo).
function measureText(obj) {
  ctx.font = fontString(obj);
  const lines = obj.text.split('\n');
  const lineHeight = obj.fontSize * 1.25;
  const lineWidths = lines.map((line) => ctx.measureText(line).width);
  const maxWidth = Math.max(0, ...lineWidths);
  return { width: maxWidth, height: lineHeight * lines.length, lineHeight, lines, lineWidths };
}

// Ancho/alto del "bloque" de la capa, sea texto (medido con el canvas 2D)
// o imagen (su tamaño puesto ahí nomás) — el resto del código de
// selección/arrastre/redimensionado usa esto sin preguntar de qué tipo es.
function getBounds(obj) {
  if (obj.type === 'image' || obj.type === 'shape') return { width: obj.width, height: obj.height };
  return measureText(obj);
}

function getHandleSize(obj) {
  if (obj.type === 'image' || obj.type === 'shape') {
    const { width, height } = getBounds(obj);
    return Math.min(24, Math.max(HANDLE_MIN_SIZE, Math.min(width, height) * 0.06));
  }
  return Math.max(HANDLE_MIN_SIZE, obj.fontSize * 0.5);
}

// Las 4 esquinas del bloque (texto o imagen), cada una con su propio
// tirador para poder agrandar/achicar desde cualquiera de ellas (no solo
// la inferior derecha) — la esquina opuesta a la que se arrastra queda fija.
function getHandlePoints(obj) {
  const { width, height } = getBounds(obj);
  return {
    nw: { x: obj.x, y: obj.y },
    ne: { x: obj.x + width, y: obj.y },
    se: { x: obj.x + width, y: obj.y + height },
    sw: { x: obj.x, y: obj.y + height },
  };
}

const OPPOSITE_HANDLE = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

// Dibuja, si corresponde, una única caja detrás de todo el bloque de
// texto — al estilo del resource "SolidChat" de FiveM/GTAW, que reemplaza
// el fondo translúcido del chat nativo por una barra sólida (o
// semitransparente) para que se lea mejor sobre cualquier escena. Es una
// sola caja para todo el bloque (no una por línea), del ancho de la línea
// más larga, como una "casilla" de chat completa.
function drawTextBackground(obj, width, height) {
  if (!obj.bg || obj.bg === 'none') return;
  const padX = Math.max(4, obj.fontSize * 0.22);
  const padY = Math.max(3, obj.fontSize * 0.14);
  ctx.save();
  ctx.fillStyle = obj.bg === 'solid' ? '#000000' : 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(obj.x - padX, obj.y - padY, width + padX * 2, height + padY * 2);
  ctx.restore();
}

// Lienzo auxiliar (invisible) donde se arma el fondo + las imágenes
// superpuestas ANTES de aplicarles el filtro nativo — así los efectos
// (desenfoque, saturación, brillo, contraste, blanco y negro, grano) se
// calculan sobre toda la composición y no solo sobre la foto inicial.
let compositeCanvasEl = null;
function ensureCompositeCanvas() {
  if (!compositeCanvasEl) compositeCanvasEl = document.createElement('canvas');
  if (compositeCanvasEl.width !== canvas.width || compositeCanvasEl.height !== canvas.height) {
    compositeCanvasEl.width = canvas.width;
    compositeCanvasEl.height = canvas.height;
  }
  return compositeCanvasEl;
}

// Cuando el navegador aplica blur(...) a un dibujo, trata todo lo que está
// "fuera" de la imagen como transparente — eso hace que el desenfoque
// mezcle los bordes de la foto con transparencia y se vea como un borde
// claro/blanco alrededor de toda la imagen (más notorio todavía si el
// grano se dibuja encima). Para evitarlo: se arma un lienzo más grande que
// repite el borde más cercano hacia afuera (igual que el modo "clamp" de
// cualquier editor de imágenes), se desenfoca ESE lienzo (ahora sin
// transparencia con la que mezclarse), y se recorta de vuelta al tamaño
// real — así el desenfoque nunca "ve" un borde transparente.
function drawFilteredComposite(source, targetCtx) {
  const filter = getImageFilter();
  const blurPx = blurToggle.checked ? Number(blurIntensityInput.value) : 0;

  if (blurPx <= 0) {
    targetCtx.save();
    targetCtx.filter = filter;
    targetCtx.drawImage(source, 0, 0);
    targetCtx.restore();
    return;
  }

  const w = source.width;
  const h = source.height;
  const pad = Math.ceil(blurPx * 3) + 4;

  const padded = document.createElement('canvas');
  padded.width = w + pad * 2;
  padded.height = h + pad * 2;
  const pctx = padded.getContext('2d');

  // Franjas de 1px de cada borde, estiradas para rellenar el margen.
  pctx.drawImage(source, 0, 0, w, 1, pad, 0, w, pad); // arriba
  pctx.drawImage(source, 0, h - 1, w, 1, pad, pad + h, w, pad); // abajo
  pctx.drawImage(source, 0, 0, 1, h, 0, pad, pad, h); // izquierda
  pctx.drawImage(source, w - 1, 0, 1, h, pad + w, pad, pad, h); // derecha
  // Esquinas (repiten el píxel de la esquina más cercana).
  pctx.drawImage(source, 0, 0, 1, 1, 0, 0, pad, pad);
  pctx.drawImage(source, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
  pctx.drawImage(source, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
  pctx.drawImage(source, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);
  // La composición real, sin filtro, en el medio.
  pctx.drawImage(source, pad, pad);

  // Recién acá se aplica el filtro (con desenfoque incluido): al dibujar
  // este lienzo ya extendido sobre uno nuevo, el blur mezcla con "imagen
  // real" en todos los bordes, nunca con transparencia.
  const filtered = document.createElement('canvas');
  filtered.width = padded.width;
  filtered.height = padded.height;
  const fctx = filtered.getContext('2d');
  fctx.filter = filter;
  fctx.drawImage(padded, 0, 0);

  // Recorta de vuelta al tamaño real del lienzo.
  targetCtx.drawImage(filtered, pad, pad, w, h, 0, 0, w, h);
}

function draw() {
  if (!image) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1) Compone el fondo + todas las imágenes superpuestas en un canvas
  //    aparte, TODAVÍA sin filtro — así el desenfoque/grano/blanco y negro,
  //    etc. se calculan sobre el resultado completo (no solo sobre la foto
  //    inicial) y no quedan "tapados" por una imagen puesta encima.
  const composite = ensureCompositeCanvas();
  const cctx = composite.getContext('2d');
  cctx.clearRect(0, 0, canvas.width, canvas.height);
  if (cropMode) {
    const r = getCropImageDrawRect();
    cctx.drawImage(image, r.x, r.y, r.w, r.h);
  } else {
    cctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  for (const obj of layers) {
    if (obj.type !== 'image') continue;
    cctx.save();
    cctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;
    cctx.drawImage(obj.img, obj.x, obj.y, obj.width, obj.height);
    cctx.restore();
  }

  // 2) Vuelca esa composición en el lienzo real con los filtros nativos
  //    (desenfoque, saturación, brillo, contraste, blanco y negro) puestos —
  //    de esta forma afectan a TODA la composición, imágenes superpuestas
  //    incluidas, no solo al fondo, y sin el borde claro del desenfoque.
  drawFilteredComposite(composite, ctx);

  // 3) El fantasma sigue siendo un eco de la foto de fondo sola, dibujado
  //    encima de la composición ya filtrada.
  drawGhost();

  // 4) El grano de película va encima de todo lo anterior (fondo +
  //    imágenes superpuestas), para que se note incluso si hay una imagen
  //    puesta arriba de la foto original.
  drawGrain();

  // 4.5) Formas geométricas y texto, sin los filtros de foto — nítidos
  //    encima de la composición ya filtrada. Antes eran dos pasadas fijas
  //    (primero todas las formas, después todo el texto), así que un
  //    rectángulo jamás podía quedar por encima de un texto aunque se usara
  //    "Traer al frente". Ahora es una sola pasada que respeta el orden
  //    real del array `layers`, así que el orden de apilado (y los botones
  //    de traer al frente / enviar atrás) funciona igual entre formas y
  //    texto, en cualquier combinación.
  for (const obj of layers) {
    if (obj.type === 'shape') {
      ctx.save();
      ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;
      if (obj.shapeType === 'rect') {
        if (obj.fillEnabled) {
          ctx.fillStyle = obj.fillColor;
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        }
        if (obj.strokeEnabled && obj.strokeWidth > 0) {
          ctx.lineWidth = obj.strokeWidth;
          ctx.strokeStyle = obj.strokeColor;
          // El trazo queda centrado en el borde por defecto en canvas; se
          // mete medio ancho hacia adentro para que no se recorte si el
          // rectángulo está pegado al borde del lienzo.
          const inset = obj.strokeWidth / 2;
          ctx.strokeRect(
            obj.x + inset,
            obj.y + inset,
            Math.max(0, obj.width - obj.strokeWidth),
            Math.max(0, obj.height - obj.strokeWidth)
          );
        }
      } else if (obj.shapeType === 'blur') {
        // Difumina lo que ya está dibujado debajo de esta capa (fondo,
        // imágenes superpuestas, o formas/texto puestos antes en el orden
        // de capas) dentro de su rectángulo — no agrega color, tapa datos
        // sensibles (una cara, una patente) dejando el resto intacto.
        // Trampa estándar de canvas: se recorta al rectángulo y se vuelve a
        // dibujar el lienzo ENTERO sobre sí mismo con un filtro de blur; el
        // recorte deja ver solo el área de la forma, pero el filtro igual
        // puede tomar de muestra los píxeles de alrededor (que están fuera
        // del recorte) así el desenfoque no tiene un borde artificial feo.
        ctx.beginPath();
        ctx.rect(obj.x, obj.y, obj.width, obj.height);
        ctx.clip();
        ctx.filter = `blur(${obj.blurAmount}px)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
      }
      ctx.restore();
    } else if (obj.type === 'text') {
      if (obj.id === editingId) continue; // lo muestra el textarea de edición en vivo, no se pisa acá

      ctx.font = fontString(obj);
      ctx.textBaseline = 'top';
      const { lines, lineHeight, width, height } = measureText(obj);

      ctx.save();
      ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;
      drawTextBackground(obj, width, height);

      lines.forEach((line, i) => {
        const ly = obj.y + i * lineHeight;
        if (obj.stroke) {
          ctx.lineWidth = Math.max(2, obj.fontSize / 8);
          ctx.strokeStyle = '#000000';
          ctx.lineJoin = 'round';
          ctx.strokeText(line, obj.x, ly);
        }
        // Cada tramo de color de la línea se dibuja por separado, uno al
        // lado del otro, para que un carácter o palabra puntual pueda tener
        // su propio color sin afectar al resto de la línea.
        const runs = obj.lineRuns[i] || [{ text: line, color: obj.color }];
        let lx = obj.x;
        for (const run of runs) {
          ctx.fillStyle = run.color || obj.color;
          ctx.fillText(run.text, lx, ly);
          lx += ctx.measureText(run.text).width;
        }
      });
      ctx.restore();
    }
  }

  // 6) Recuadro punteado + tiradores de la capa activa (texto, imagen o
  //    forma), siempre nítidos, encima de todo — salvo mientras esa misma
  //    capa está en modo recorte, que en su lugar muestra el marco de
  //    recorte (drawLayerCropOverlay, más abajo).
  const selectedObj =
    selectedId == null || selectedId === layerCropId
      ? null
      : layers.find((o) => o.id === selectedId);
  if (selectedObj) {
    const { width, height } = getBounds(selectedObj);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeRect(selectedObj.x - 4, selectedObj.y - 4, width + 8, height + 8);
    ctx.restore();

    const size = getHandleSize(selectedObj);
    const points = getHandlePoints(selectedObj);
    ctx.save();
    ctx.setLineDash([]);
    for (const key of ['nw', 'ne', 'se', 'sw']) {
      const p = points[key];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.restore();
  }

  drawMarginGuides();
  drawCropOverlay();
  drawLayerCropOverlay();
  updateLayerControlsUI();
}

// Guías de margen fijas a 50px de cada borde, solo como ayuda para alinear
// texto a ojo (con imán al mover, ver snapToGuides). Se saltea durante el
// recorte (el overlay de recorte ya trae sus propias guías de tercios) y
// nunca se incluye en el PNG final porque getCleanCanvasDataUrl las apaga
// antes de capturar.
function drawMarginGuides() {
  if (!image || cropMode || !showMarginGuides) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,80,80,0.85)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  const d = MARGIN_GUIDE_DISTANCE;
  [d, canvas.width - d].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
    ctx.stroke();
  });
  [d, canvas.height - d].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  });
  ctx.restore();
}

// Ajusta obj.x/obj.y para que, si algún borde del texto quedó a
// GUIDE_SNAP_THRESHOLD px o menos de una guía, quede pegado exactamente
// sobre esa guía (imán). Solo actúa si las guías están visibles.
function snapToGuides(obj, width, height) {
  if (!showMarginGuides) return;
  const d = MARGIN_GUIDE_DISTANCE;
  const xs = [d, canvas.width - d];
  const ys = [d, canvas.height - d];

  for (const gx of xs) {
    if (Math.abs(obj.x - gx) <= GUIDE_SNAP_THRESHOLD) {
      obj.x = gx;
      break;
    }
    if (Math.abs(obj.x + width - gx) <= GUIDE_SNAP_THRESHOLD) {
      obj.x = gx - width;
      break;
    }
  }
  for (const gy of ys) {
    if (Math.abs(obj.y - gy) <= GUIDE_SNAP_THRESHOLD) {
      obj.y = gy;
      break;
    }
    if (Math.abs(obj.y + height - gy) <= GUIDE_SNAP_THRESHOLD) {
      obj.y = gy - height;
      break;
    }
  }
}

// Recorte pendiente: oscurece todo menos el rectángulo elegido, le dibuja
// guías estilo "regla de los tercios" y tiradores en las esquinas y en la
// mitad de cada lado — para ajustarlo arrastrando, como en Photoshop.
function drawCropOverlay() {
  if (!cropMode || !cropRect) return;
  const r = normalizeCropRect(cropRect);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, r.y);
  ctx.fillRect(0, r.y + r.h, canvas.width, canvas.height - (r.y + r.h));
  ctx.fillRect(0, r.y, r.x, r.h);
  ctx.fillRect(r.x + r.w, r.y, canvas.width - (r.x + r.w), r.h);

  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);

  // Guías de la regla de los tercios, solo de referencia visual.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) {
    const gx = r.x + (r.w * i) / 3;
    ctx.beginPath();
    ctx.moveTo(gx, r.y);
    ctx.lineTo(gx, r.y + r.h);
    ctx.stroke();
    const gy = r.y + (r.h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(r.x, gy);
    ctx.lineTo(r.x + r.w, gy);
    ctx.stroke();
  }

  const points = getCropHandlePoints(cropRect);
  const size = Math.max(10, getCropHandleHitSize() * 0.55);
  for (const handle of CROP_HANDLES) {
    const p = points[handle];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  ctx.restore();
}

// ---- edición en vivo del texto (textarea flotando sobre el canvas) ----

// Convierte la posición/tamaño del texto (en coordenadas reales del canvas)
// a coordenadas de pantalla dentro de .canvas-scroll, que es donde flota
// el textarea de edición.
function canvasToScreenRect(obj) {
  const canvasRect = canvas.getBoundingClientRect();
  const scrollRect = canvasScrollEl.getBoundingClientRect();
  const displayScale = canvasRect.width / canvas.width;
  const { width, height } = measureText(obj);
  return {
    left: canvasRect.left - scrollRect.left + canvasScrollEl.scrollLeft + obj.x * displayScale,
    top: canvasRect.top - scrollRect.top + canvasScrollEl.scrollTop + obj.y * displayScale,
    width: width * displayScale,
    height: height * displayScale,
    fontSize: obj.fontSize * displayScale,
    scale: displayScale,
  };
}

function applyOverlayStyle(overlay, obj) {
  overlay.style.fontStyle = obj.italic ? 'italic' : 'normal';
  overlay.style.fontWeight = '500';
}

function positionOverlay(overlay, obj) {
  const r = canvasToScreenRect(obj);
  overlay.style.left = `${r.left - 2}px`;
  overlay.style.top = `${r.top - 2}px`;
  overlay.style.width = `${Math.max(r.width, 24) + 4}px`;
  overlay.style.height = `${Math.max(r.height, r.fontSize * 1.25) + 4}px`;
  overlay.style.fontSize = `${r.fontSize}px`;
}

function isLiveStyleControl(el) {
  if (!el) return false;
  return (
    el === textColorInput ||
    el === fontSizeInput ||
    el === strokeToggle ||
    el === bgNoneBtn ||
    el === bgSolidBtn ||
    el === bgSemiBtn ||
    el === addSwatchBtn ||
    el === addSizePresetBtn ||
    el === resDropdownBtn ||
    el === cropSizeDropdownBtn ||
    resDropdownPanel.contains(el) ||
    cropSizeDropdownPanel.contains(el) ||
    colorSwatchesEl.contains(el) ||
    sizePresetsEl.contains(el)
  );
}

// ---- helpers de línea por línea ----
// El overlay ahora es un <div contenteditable> con un <div class="edit-line">
// hijo por cada línea, cada uno con su propio color inline — así el preview
// en vivo ya muestra los colores reales por línea (antes, al ser un único
// <textarea>, solo podía pintar todo el contenido de un color a la vez).
// El canvas no envuelve líneas largas, así que cada .edit-line usa
// white-space:pre para no envolver tampoco y no desalinearse con el canvas.

function lineDivs(overlay) {
  return Array.from(overlay.children);
}

function closestLineDiv(overlay, node) {
  while (node && node !== overlay) {
    if (node.nodeType === 1 && node.classList && node.classList.contains('edit-line')) return node;
    node = node.parentNode;
  }
  return null;
}

function getCurrentLineDiv(overlay) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  return closestLineDiv(overlay, sel.getRangeAt(0).endContainer);
}

// Longitud de texto entre el inicio de una línea y un punto (container,
// offset) dado — sirve tanto para el cursor como para los extremos de una
// selección activa.
// Mismo límite de 85 caracteres por línea que aplica el cuadro de texto
// inicial (applyHardWrap más arriba), pero acá partiendo lineRuns (con
// color por tramo) en vez de un string plano — la edición en vivo sobre
// el lienzo usa un <div> por línea desde que se reescribió para poder
// pintar cada línea de un color distinto mientras se escribe, y ese
// límite nunca se trasladó a este otro camino: sin esto, escribir directo
// sobre un texto ya puesto en la imagen se estira sin fin.
function wrapLineRuns(runs, caretOffset) {
  const out = [];
  let remaining = runs;
  let consumed = 0;
  let restoreIdx = -1;
  let restoreOffset = 0;
  while (lineTextFromRuns(remaining).length > LINE_CHAR_LIMIT) {
    const t = lineTextFromRuns(remaining);
    let breakAt = t.lastIndexOf(' ', LINE_CHAR_LIMIT);
    if (breakAt <= 0) breakAt = LINE_CHAR_LIMIT; // sin espacio: corte duro, último recurso
    const head = sliceRuns(remaining, 0, breakAt);
    const skipSpace = t[breakAt] === ' ' ? 1 : 0;
    const restStart = breakAt + skipSpace;
    out.push(head);
    if (caretOffset !== -1 && restoreIdx === -1 && caretOffset <= consumed + breakAt) {
      restoreIdx = out.length - 1;
      restoreOffset = caretOffset - consumed;
    }
    remaining = sliceRuns(remaining, restStart, t.length);
    consumed += restStart;
  }
  out.push(remaining);
  if (caretOffset !== -1 && restoreIdx === -1) {
    restoreIdx = out.length - 1;
    restoreOffset = caretOffset - consumed;
  }
  return { out, restoreIdx, restoreOffset };
}

function enforceLineWrap(obj, overlay) {
  const divs = lineDivs(overlay);
  const current = getCurrentLineDiv(overlay);
  const caretIdx = current ? divs.indexOf(current) : -1;
  const caretOffset = caretIdx !== -1 ? getCaretOffsetInLine(current) : -1;

  let changed = false;
  const newLineRuns = [];
  let restoreDivIdx = -1;
  let restoreOffset = 0;

  obj.lineRuns.forEach((runs, i) => {
    if (lineTextFromRuns(runs).length <= LINE_CHAR_LIMIT) {
      newLineRuns.push(runs);
      if (i === caretIdx) {
        restoreDivIdx = newLineRuns.length - 1;
        restoreOffset = caretOffset;
      }
      return;
    }
    changed = true;
    const { out, restoreIdx, restoreOffset: off } = wrapLineRuns(runs, i === caretIdx ? caretOffset : -1);
    const baseIdx = newLineRuns.length;
    newLineRuns.push(...out);
    if (i === caretIdx) {
      restoreDivIdx = baseIdx + restoreIdx;
      restoreOffset = off;
    }
  });

  if (!changed) return;

  obj.lineRuns = newLineRuns;
  overlay.innerHTML = '';
  newLineRuns.forEach((runs) => {
    const div = document.createElement('div');
    div.className = 'edit-line';
    renderLineRuns(div, runs, obj.color);
    overlay.appendChild(div);
  });
  obj.text = lineDivs(overlay).map((d) => d.textContent).join('\n');
  if (restoreDivIdx !== -1) {
    setCaretInLine(lineDivs(overlay)[restoreDivIdx], Math.max(0, restoreOffset));
  }
}

function offsetInLine(lineDiv, container, offsetInContainer) {
  const range = document.createRange();
  range.selectNodeContents(lineDiv);
  range.setEnd(container, offsetInContainer);
  return range.toString().length;
}

function getCaretOffsetInLine(lineDiv) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  return offsetInLine(lineDiv, r.endContainer, r.endOffset);
}

function setCaretInLine(lineDiv, offset) {
  const { node, offset: nodeOffset } = findTextNodeAndOffset(lineDiv, offset);
  const range = document.createRange();
  if (node.nodeType === 3) {
    range.setStart(node, Math.max(0, Math.min(nodeOffset, node.length)));
  } else {
    range.selectNodeContents(lineDiv);
  }
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function selectAllInOverlay(overlay) {
  const range = document.createRange();
  range.selectNodeContents(overlay);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Relee el DOM del overlay como fuente de verdad: para cada línea separa
// sus runs de color reales (los <span> ya puestos a mano, o texto suelto
// que el navegador haya insertado directo al escribir en una línea vacía)
// y normaliza esa línea de vuelta a spans prolijos — así lo que se ve en
// pantalla siempre coincide con obj.lineRuns. También reubica el cursor
// donde estaba antes de normalizar, ya que reconstruir el DOM lo pierde.
function syncTextFromOverlay(obj, overlay) {
  const divs = lineDivs(overlay);
  const current = getCurrentLineDiv(overlay);
  const caretIdx = current ? divs.indexOf(current) : -1;
  const caretOffset = caretIdx !== -1 ? getCaretOffsetInLine(current) : 0;

  obj.lineRuns = divs.map((d, i) => readLineRunsFromDom(d, firstColorOf(obj.lineRuns[i], obj.color)));
  divs.forEach((d, i) => renderLineRuns(d, obj.lineRuns[i], obj.color));
  if (caretIdx !== -1) setCaretInLine(divs[caretIdx], caretOffset);

  obj.text = divs.map((d) => d.textContent).join('\n');
}

function handleEnter(obj, overlay) {
  const lineDiv = getCurrentLineDiv(overlay);
  if (!lineDiv) return;
  const offset = getCaretOffsetInLine(lineDiv);
  const idx = lineDivs(overlay).indexOf(lineDiv);
  const runs = obj.lineRuns[idx];
  const lineLen = lineTextFromRuns(runs).length;
  const color = firstColorOf(runs, obj.color);
  const beforeRuns = sliceRuns(runs, 0, offset);
  const afterRuns = sliceRuns(runs, offset, lineLen);

  renderLineRuns(lineDiv, beforeRuns.length ? beforeRuns : [{ text: '', color }], obj.color);
  const newDiv = document.createElement('div');
  newDiv.className = 'edit-line';
  renderLineRuns(newDiv, afterRuns.length ? afterRuns : [{ text: '', color }], obj.color);
  lineDiv.after(newDiv);
  obj.lineRuns.splice(
    idx,
    1,
    beforeRuns.length ? beforeRuns : [{ text: '', color }],
    afterRuns.length ? afterRuns : [{ text: '', color }]
  );

  setCaretInLine(newDiv, 0);
  syncTextFromOverlay(obj, overlay);
  positionOverlay(overlay, obj);
  syncColorFromSelection(obj, overlay);
  draw();
}

// Junta la línea actual con la anterior (Backspace al principio de línea).
function handleBackspaceMerge(obj, overlay, lineDiv) {
  const idx = lineDivs(overlay).indexOf(lineDiv);
  const prevDiv = lineDiv.previousElementSibling;
  const prevIdx = idx - 1;
  const joinOffset = lineTextFromRuns(obj.lineRuns[prevIdx]).length;
  const mergedRaw = mergeRuns([...obj.lineRuns[prevIdx], ...obj.lineRuns[idx]]);
  const merged = mergedRaw.length ? mergedRaw : [{ text: '', color: firstColorOf(obj.lineRuns[prevIdx], obj.color) }];
  renderLineRuns(prevDiv, merged, obj.color);
  lineDiv.remove();
  obj.lineRuns.splice(prevIdx, 2, merged);

  setCaretInLine(prevDiv, joinOffset);
  syncTextFromOverlay(obj, overlay);
  positionOverlay(overlay, obj);
  syncColorFromSelection(obj, overlay);
  draw();
}

// Junta la línea siguiente con la actual (Delete al final de línea).
function handleDeleteMerge(obj, overlay, lineDiv) {
  const idx = lineDivs(overlay).indexOf(lineDiv);
  const nextDiv = lineDiv.nextElementSibling;
  const joinOffset = lineTextFromRuns(obj.lineRuns[idx]).length;
  const mergedRaw = mergeRuns([...obj.lineRuns[idx], ...obj.lineRuns[idx + 1]]);
  const merged = mergedRaw.length ? mergedRaw : [{ text: '', color: firstColorOf(obj.lineRuns[idx], obj.color) }];
  renderLineRuns(lineDiv, merged, obj.color);
  nextDiv.remove();
  obj.lineRuns.splice(idx, 2, merged);

  setCaretInLine(lineDiv, joinOffset);
  syncTextFromOverlay(obj, overlay);
  positionOverlay(overlay, obj);
  syncColorFromSelection(obj, overlay);
  draw();
}

// Borra una selección que abarca más de una línea, uniendo el resto de la
// primera con el resto de la última en una sola línea.
function deleteRangeAcrossLines(obj, overlay, startDiv, startOffset, endDiv, endOffset) {
  const divs = lineDivs(overlay);
  const startIdx = divs.indexOf(startDiv);
  const endIdx = divs.indexOf(endDiv);
  const endLen = lineTextFromRuns(obj.lineRuns[endIdx]).length;
  const merged = mergeRuns([
    ...sliceRuns(obj.lineRuns[startIdx], 0, startOffset),
    ...sliceRuns(obj.lineRuns[endIdx], endOffset, endLen),
  ]);
  const finalRuns = merged.length ? merged : [{ text: '', color: obj.color }];
  renderLineRuns(startDiv, finalRuns, obj.color);
  for (let i = endIdx; i > startIdx; i--) {
    divs[i].remove();
  }
  obj.lineRuns.splice(startIdx, endIdx - startIdx + 1, finalRuns);

  setCaretInLine(startDiv, startOffset);
  syncTextFromOverlay(obj, overlay);
  positionOverlay(overlay, obj);
  syncColorFromSelection(obj, overlay);
  draw();
}

// Pega texto plano (puede traer varios saltos de línea) reemplazando la
// selección actual, sin dejarle al navegador crear su propio HTML/markup.
// El texto pegado hereda el color del carácter justo antes del punto de
// inserción, igual que antes (pero ahora sin pisar el resto de la línea).
function insertPlainText(obj, overlay, text) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const startDiv = closestLineDiv(overlay, range.startContainer);
  const endDiv = closestLineDiv(overlay, range.endContainer);
  if (!startDiv || !endDiv) return;

  const startOffset = offsetInLine(startDiv, range.startContainer, range.startOffset);
  const endOffset = offsetInLine(endDiv, range.endContainer, range.endOffset);

  if (startDiv !== endDiv) {
    deleteRangeAcrossLines(obj, overlay, startDiv, startOffset, endDiv, endOffset);
  } else if (startOffset !== endOffset) {
    const idx = lineDivs(overlay).indexOf(startDiv);
    const lineLen = lineTextFromRuns(obj.lineRuns[idx]).length;
    const trimmed = mergeRuns([
      ...sliceRuns(obj.lineRuns[idx], 0, startOffset),
      ...sliceRuns(obj.lineRuns[idx], endOffset, lineLen),
    ]);
    obj.lineRuns[idx] = trimmed.length ? trimmed : [{ text: '', color: obj.color }];
    renderLineRuns(startDiv, obj.lineRuns[idx], obj.color);
  }

  const idx = lineDivs(overlay).indexOf(startDiv);
  const lineRuns = obj.lineRuns[idx];
  const lineText = lineTextFromRuns(lineRuns);
  const before = lineText.slice(0, startOffset);
  const after = lineText.slice(startOffset);
  const pastedLines = text.split('\n');
  const color = colorAtOffset(lineRuns, startOffset, obj.color);

  if (pastedLines.length === 1) {
    const newRuns = mergeRuns([
      ...sliceRuns(lineRuns, 0, before.length),
      { text: pastedLines[0], color },
      ...sliceRuns(lineRuns, before.length, lineText.length),
    ]);
    obj.lineRuns[idx] = newRuns;
    renderLineRuns(startDiv, newRuns, obj.color);
    setCaretInLine(startDiv, before.length + pastedLines[0].length);
  } else {
    const firstRuns = mergeRuns([...sliceRuns(lineRuns, 0, before.length), { text: pastedLines[0], color }]);
    obj.lineRuns[idx] = firstRuns;
    renderLineRuns(startDiv, firstRuns, obj.color);

    let anchor = startDiv;
    const newLineRuns = [];
    for (let i = 1; i < pastedLines.length; i++) {
      const div = document.createElement('div');
      div.className = 'edit-line';
      const isLast = i === pastedLines.length - 1;
      const runs = isLast
        ? mergeRuns([{ text: pastedLines[i], color }, ...sliceRuns(lineRuns, before.length, lineText.length)])
        : [{ text: pastedLines[i], color }];
      renderLineRuns(div, runs, obj.color);
      anchor.after(div);
      newLineRuns.push(runs);
      anchor = div;
    }
    obj.lineRuns.splice(idx + 1, 0, ...newLineRuns);
    setCaretInLine(anchor, pastedLines[pastedLines.length - 1].length);
  }

  syncTextFromOverlay(obj, overlay);
  positionOverlay(overlay, obj);
  syncColorFromSelection(obj, overlay);
  draw();
}

function startInlineEdit(obj) {
  commitInlineEdit();
  pushHistory();
  editingId = obj.id;
  selectedId = obj.id;
  syncToolbarToObject(obj);

  const overlay = document.createElement('div');
  overlay.className = 'inline-text-edit';
  overlay.contentEditable = 'true';
  overlay.spellcheck = false;
  applyOverlayStyle(overlay, obj);

  const lines = obj.text.split('\n');
  while (obj.lineRuns.length < lines.length) obj.lineRuns.push([{ text: '', color: obj.color }]);
  while (obj.lineRuns.length > lines.length) obj.lineRuns.pop();
  obj.lineRuns.forEach((runs) => {
    const div = document.createElement('div');
    div.className = 'edit-line';
    renderLineRuns(div, runs, obj.color);
    overlay.appendChild(div);
  });

  positionOverlay(overlay, obj);
  canvasScrollEl.appendChild(overlay);
  editOverlay = overlay;
  draw();

  overlay.focus();
  selectAllInOverlay(overlay);

  overlay.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      handleEnter(obj, overlay);
      return;
    }
    if (evt.key === 'Escape') {
      evt.preventDefault();
      commitInlineEdit();
      return;
    }
    if (evt.key !== 'Backspace' && evt.key !== 'Delete') return;

    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const startDiv = closestLineDiv(overlay, range.startContainer);
    const endDiv = closestLineDiv(overlay, range.endContainer);
    if (!startDiv || !endDiv) return;

    if (!sel.isCollapsed && startDiv !== endDiv) {
      evt.preventDefault();
      const startOffset = offsetInLine(startDiv, range.startContainer, range.startOffset);
      const endOffset = offsetInLine(endDiv, range.endContainer, range.endOffset);
      deleteRangeAcrossLines(obj, overlay, startDiv, startOffset, endDiv, endOffset);
      return;
    }

    if (sel.isCollapsed) {
      const offset = offsetInLine(startDiv, range.startContainer, range.startOffset);
      if (evt.key === 'Backspace' && offset === 0 && startDiv.previousElementSibling) {
        evt.preventDefault();
        handleBackspaceMerge(obj, overlay, startDiv);
      } else if (evt.key === 'Delete' && offset === startDiv.textContent.length && startDiv.nextElementSibling) {
        evt.preventDefault();
        handleDeleteMerge(obj, overlay, startDiv);
      }
    }
  });

  overlay.addEventListener('paste', (evt) => {
    evt.preventDefault();
    const text = (evt.clipboardData || window.clipboardData).getData('text/plain');
    if (text) {
      insertPlainText(obj, overlay, text);
      enforceLineWrap(obj, overlay);
      positionOverlay(overlay, obj);
      draw();
    }
  });

  overlay.addEventListener('input', () => {
    syncTextFromOverlay(obj, overlay);
    enforceLineWrap(obj, overlay);
    positionOverlay(overlay, obj);
    syncColorFromSelection(obj, overlay);
    draw();
  });

  // Si el foco se va hacia los controles de color/tamaño/contorno (por
  // ejemplo al abrir el selector de color o tocar un swatch), NO se cierra
  // la edición — si no, el cambio de color llegaría tarde y afectaría el
  // objeto entero en vez de la línea subrayada. Cualquier otro clic (fuera
  // de esos controles) sí confirma la edición como antes.
  overlay.addEventListener('blur', (evt) => {
    if (isLiveStyleControl(evt.relatedTarget)) return;
    commitInlineEdit();
  });
  const syncColor = () => syncColorFromSelection(obj, overlay);
  overlay.addEventListener('click', syncColor);
  overlay.addEventListener('keyup', syncColor);
}

function commitInlineEdit() {
  if (editingId == null) return;
  const id = editingId;
  const obj = layers.find((o) => o.id === id);
  editingId = null;
  if (editOverlay) {
    editOverlay.remove();
    editOverlay = null;
  }
  if (obj) {
    // Quita líneas finales vacías (y sus colores) que hayan quedado del
    // Enter final al escribir.
    while (obj.text.endsWith('\n')) {
      obj.text = obj.text.slice(0, -1);
      obj.lineRuns.pop();
    }
    if (!obj.text.trim()) {
      layers = layers.filter((o) => o.id !== id);
      if (selectedId === id) selectedId = null;
    }
  }
  draw();
}

// ---- coordenadas del mouse -> coordenadas reales del canvas ----

function getCanvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

function hitTest(point) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const obj = layers[i];
    const { width, height } = getBounds(obj);
    if (point.x >= obj.x && point.x <= obj.x + width && point.y >= obj.y && point.y <= obj.y + height) {
      return obj;
    }
  }
  return null;
}

function getTextHandleAt(point, obj) {
  const points = getHandlePoints(obj);
  const half = getHandleSize(obj) / 2;
  for (const key of ['nw', 'ne', 'se', 'sw']) {
    const p = points[key];
    if (Math.abs(point.x - p.x) <= half && Math.abs(point.y - p.y) <= half) return key;
  }
  return null;
}

function distanceBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---- interacción ----

canvas.addEventListener('mousedown', (evt) => {
  if (!image) return;
  if (editingId != null) commitInlineEdit();
  const point = getCanvasPoint(evt);

  if (cropMode) {
    const handle = getCropHandleAt(point);
    if (handle) {
      cropDragState = { type: 'resize', handle, origin: normalizeCropRect(cropRect) };
    } else if (pointInCropBody(point)) {
      // Arrastrar DENTRO del marco mueve el marco.
      const r = normalizeCropRect(cropRect);
      cropDragState = { type: 'move', origin: r, offsetX: point.x - r.x, offsetY: point.y - r.y };
    } else {
      // Arrastrar AFUERA del marco mueve la imagen debajo de él.
      cropDragState = {
        type: 'pan-image',
        startPoint: point,
        originX: cropImgTransform.x,
        originY: cropImgTransform.y,
      };
      canvas.style.cursor = 'grabbing';
    }
    draw();
    return;
  }

  if (layerCropId != null) {
    const obj = getLayerCropObj();
    const bounds = obj ? { x: obj.x, y: obj.y, w: obj.width, h: obj.height } : null;
    const handle = getLayerCropHandleAt(point);
    if (handle) {
      layerCropDragState = { type: 'resize', handle, origin: normalizeLayerCropRect(layerCropRect, bounds) };
    } else if (pointInLayerCropBody(point)) {
      // Arrastrar dentro del marco lo mueve (siempre dentro de los límites
      // de la capa, que acá no se puede mover ni agrandar, solo recortar).
      const r = normalizeLayerCropRect(layerCropRect, bounds);
      layerCropDragState = { type: 'move', origin: r, offsetX: point.x - r.x, offsetY: point.y - r.y };
    } else {
      layerCropDragState = null;
    }
    draw();
    return;
  }

  // Si ya hay un texto seleccionado, el tirador de cualquier esquina tiene
  // prioridad para poder redimensionarlo desde ahí.
  if (selectedId != null) {
    const selectedObj = layers.find((o) => o.id === selectedId);
    if (selectedObj) {
      const handle = getTextHandleAt(point, selectedObj);
      if (handle) {
        pushHistory();
        const anchor = getHandlePoints(selectedObj)[OPPOSITE_HANDLE[handle]];
        dragState = {
          mode: 'resize',
          id: selectedObj.id,
          handle,
          anchor,
          startFontSize: selectedObj.fontSize,
          startWidth: selectedObj.width,
          startHeight: selectedObj.height,
          startDist: distanceBetween(anchor, point) || 1,
        };
        return;
      }
    }
  }

  if (addTextMode) {
    const text = textInput.value.replace(/\n+$/, '');
    if (!text.trim()) {
      textInput.focus();
      return;
    }
    // Auto-color por línea: cada línea LÓGICA que empiece con "*" (estilo
    // /me de rol) va siempre en el morado de siempre, y cada una que
    // empiece con "(Coche)" va siempre en el amarillo de la paleta; si
    // además hay alguna línea así, el resto de las líneas lógicas que NO
    // matcheen ningún patrón pasan a blanco automáticamente (sin esto,
    // habría que recolorear a mano cada línea de diálogo normal después de
    // pegar un bloque mixto). Si ninguna línea usa un patrón automático, se
    // respeta el color elegido a mano en el selector.
    //
    // "Línea lógica" no es lo mismo que línea física: si el límite de 85
    // caracteres (applyHardWrap) partió una oración larga en dos líneas
    // físicas, la segunda arranca con AUTO_WRAP_MARKER y NO se reclasifica
    // sola — hereda el color de la línea lógica a la que en realidad
    // pertenece, para que una oración larga no se corte de color a la
    // mitad solo porque no entraba en una sola línea.
    const manualColor = textColorInput.value;
    const linesText = text.split('\n');
    const isMeLine = (l) => l.trimStart().startsWith('*');
    const isCocheLine = (l) => /^\(coche\)/i.test(l.trimStart());
    const hasAutoLine = linesText.some(
      (l) => !l.startsWith(AUTO_WRAP_MARKER) && (isMeLine(l) || isCocheLine(l))
    );
    let currentColor = manualColor;
    const lineRuns = linesText.map((l) => {
      const isContinuation = l.startsWith(AUTO_WRAP_MARKER);
      const cleanText = isContinuation ? l.slice(AUTO_WRAP_MARKER.length) : l;
      if (!isContinuation) {
        currentColor = isMeLine(cleanText)
          ? ME_COLOR
          : isCocheLine(cleanText)
            ? COCHE_COLOR
            : hasAutoLine
              ? '#ffffff'
              : manualColor;
      }
      return [{ text: cleanText, color: currentColor }];
    });
    const baseColor = lineRuns[0][0].color;
    pushHistory();
    const obj = {
      id: nextId++,
      type: 'text',
      x: point.x,
      y: point.y,
      text,
      color: baseColor,
      lineRuns,
      stroke: strokeToggle.checked,
      bg: bgStyleValue,
      italic: false,
      fontSize: Number(fontSizeInput.value),
      opacity: 1,
    };
    layers.push(obj);
    selectedId = obj.id;
    textInput.value = '';
    updateAddTextBtnVisibility();
    // Se apaga el modo "agregar" para que el siguiente clic seleccione o
    // arrastre el texto recién puesto, en vez de crear uno nuevo.
    setAddTextMode(false);
    draw();
    return;
  }

  const hit = hitTest(point);
  selectedId = hit ? hit.id : null;
  if (hit) {
    pushHistory();
    dragState = { mode: 'move', id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y };
    if (hit.type === 'text') syncToolbarToObject(hit);
    else if (hit.type === 'shape') syncShapeToolbarToObject(hit);
  }
  draw();
});

canvas.addEventListener('mousemove', (evt) => {
  const point = getCanvasPoint(evt);

  if (cropMode) {
    if (cropDragState) {
      const clampedX = Math.max(0, Math.min(canvas.width, point.x));
      const clampedY = Math.max(0, Math.min(canvas.height, point.y));
      if (cropDragState.type === 'resize') {
        cropRect = resizeCropRect(cropDragState.origin, cropDragState.handle, clampedX, clampedY, {
          fromCenter: evt.altKey,
          keepAspect: evt.shiftKey,
        });
        syncCropSizeInputs();
        enforceCropImageBounds();
      } else if (cropDragState.type === 'pan-image') {
        const dx = point.x - cropDragState.startPoint.x;
        const dy = point.y - cropDragState.startPoint.y;
        cropImgTransform.x = cropDragState.originX + dx;
        cropImgTransform.y = cropDragState.originY + dy;
        clampCropImageTransform();
      } else {
        const o = cropDragState.origin;
        const x = Math.max(0, Math.min(canvas.width - o.w, point.x - cropDragState.offsetX));
        const y = Math.max(0, Math.min(canvas.height - o.h, point.y - cropDragState.offsetY));
        cropRect = { x, y, w: o.w, h: o.h };
        syncCropSizeInputs();
        clampCropImageTransform();
      }
      draw();
    } else {
      const handle = getCropHandleAt(point);
      canvas.style.cursor = handle ? CROP_CURSORS[handle] : pointInCropBody(point) ? 'move' : 'grab';
    }
    return;
  }

  if (layerCropId != null) {
    const obj = getLayerCropObj();
    if (!obj) return;
    const bounds = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
    if (layerCropDragState) {
      if (layerCropDragState.type === 'resize') {
        layerCropRect = resizeLayerCropRect(
          layerCropDragState.origin,
          layerCropDragState.handle,
          point.x,
          point.y,
          bounds
        );
      } else if (layerCropDragState.type === 'move') {
        const o = layerCropDragState.origin;
        const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - o.w, point.x - layerCropDragState.offsetX));
        const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - o.h, point.y - layerCropDragState.offsetY));
        layerCropRect = { x, y, w: o.w, h: o.h };
      }
      draw();
    } else {
      const handle = getLayerCropHandleAt(point);
      canvas.style.cursor = handle ? CROP_CURSORS[handle] : pointInLayerCropBody(point) ? 'move' : '';
    }
    return;
  }

  if (!dragState) return;
  const obj = layers.find((o) => o.id === dragState.id);
  if (!obj) return;

  if (dragState.mode === 'resize') {
    if (obj.type === 'shape') {
      // Redimensionado libre (no proporcional): la esquina arrastrada
      // sigue al mouse tal cual, la opuesta queda fija — así ancho y alto
      // se pueden ajustar de forma totalmente independiente.
      const anchor = dragState.anchor;
      obj.width = Math.max(MIN_IMAGE_LAYER_SIZE, Math.abs(point.x - anchor.x));
      obj.height = Math.max(MIN_IMAGE_LAYER_SIZE, Math.abs(point.y - anchor.y));
      obj.x = Math.min(point.x, anchor.x);
      obj.y = Math.min(point.y, anchor.y);
      draw();
      return;
    }
    const currentDist = distanceBetween(dragState.anchor, point);
    const scale = currentDist / dragState.startDist;
    if (obj.type === 'image') {
      // Un único factor de escala para ancho y alto: la imagen mantiene su
      // proporción original sin importar de qué esquina se arrastre.
      obj.width = Math.max(MIN_IMAGE_LAYER_SIZE, dragState.startWidth * scale);
      obj.height = Math.max(MIN_IMAGE_LAYER_SIZE, dragState.startHeight * scale);
    } else {
      obj.fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(dragState.startFontSize * scale)));
    }
    // Reacomoda el origen de la capa para que la esquina opuesta a la que
    // se arrastra quede fija en su lugar (igual que redimensionar una capa
    // en cualquier editor de imágenes).
    const { width, height } = getBounds(obj);
    const anchor = dragState.anchor;
    if (dragState.handle === 'se') {
      obj.x = anchor.x;
      obj.y = anchor.y;
    } else if (dragState.handle === 'nw') {
      obj.x = anchor.x - width;
      obj.y = anchor.y - height;
    } else if (dragState.handle === 'ne') {
      obj.x = anchor.x;
      obj.y = anchor.y - height;
    } else if (dragState.handle === 'sw') {
      obj.x = anchor.x - width;
      obj.y = anchor.y;
    }
  } else {
    obj.x = point.x - dragState.offsetX;
    obj.y = point.y - dragState.offsetY;
    const { width, height } = getBounds(obj);
    snapToGuides(obj, width, height);
  }
  draw();
});

window.addEventListener('mouseup', () => {
  dragState = null;
  if (cropDragState && cropDragState.type === 'pan-image') {
    canvas.style.cursor = 'grab';
  }
  cropDragState = null;
  layerCropDragState = null;
});

window.addEventListener('resize', () => {
  if (editingId == null || !editOverlay) return;
  const obj = layers.find((o) => o.id === editingId);
  if (obj) positionOverlay(editOverlay, obj);
});

canvas.addEventListener('dblclick', (evt) => {
  if (!image || cropMode) return;
  const point = getCanvasPoint(evt);
  const hit = hitTest(point);
  if (!hit || hit.type !== 'text') return; // las capas de imagen no tienen edición de texto
  startInlineEdit(hit);
});

// ---- controles ----

function deleteSelectedLayer() {
  commitInlineEdit();
  if (selectedId == null) return;
  pushHistory();
  layers = layers.filter((o) => o.id !== selectedId);
  selectedId = null;
  draw();
}

// Borra la capa seleccionada (texto o imagen) con Delete o Supr — pero no
// si el foco está en un campo de texto (como la casilla de "Escribí la
// línea..."), para no interferir con el borrado normal de caracteres ahí.
window.addEventListener('keydown', (evt) => {
  if (evt.key !== 'Delete') return;
  if (selectedId == null || editingId != null || layerCropId != null) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
  evt.preventDefault();
  deleteSelectedLayer();
});

exportImageBtn.addEventListener('click', async () => {
  if (!image) return;
  commitInlineEdit();
  if (cropMode) setCropMode(false); // no exportar con el recorte pendiente de aplicar oscureciendo la imagen
  if (layerCropId != null) cancelLayerCrop();
  const dataUrl = getCleanCanvasDataUrl();
  const name = `captura-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
  const result = await window.signalLog.saveImage(dataUrl, name);
  if (result.ok) flashExportButton();
});

function flashExportButton() {
  const original = exportImageBtn.textContent;
  exportImageBtn.textContent = 'Guardado ✓';
  setTimeout(() => {
    exportImageBtn.textContent = original;
  }, 1400);
}

// Genera el PNG final sin que se "queme" el recuadro punteado ni los
// tiradores de selección del texto activo — se deselecciona un instante,
// se captura, y se restaura la selección para no alterar lo que se ve en
// pantalla.
function getCleanCanvasDataUrl(format = 'image/png', quality) {
  const previousSelectedId = selectedId;
  const previousShowMarginGuides = showMarginGuides;
  const needsRedraw = previousSelectedId != null || previousShowMarginGuides;

  if (needsRedraw) {
    selectedId = null;
    showMarginGuides = false;
    draw();
  }
  const dataUrl = canvas.toDataURL(format, quality);
  if (needsRedraw) {
    selectedId = previousSelectedId;
    showMarginGuides = previousShowMarginGuides;
    draw();
  }
  return dataUrl;
}

// ---- botón de guías de margen ----
// Se crea por JS (en vez de agregarlo al HTML) para no depender de tocar
// el markup. Se inserta justo debajo de la casilla de texto ("Escribí la
// línea..."), que está a la izquierda del canvas. Si tu layout usa flex
// en fila para ese contenedor, puede hacer falta un pequeño ajuste de CSS
// (ej. flex-basis: 100% en .guide-toggle-btn) para que caiga en su propia
// línea — el orden en el DOM ya queda inmediatamente después del textarea.
function buildGuideControls() {
  if (!textInput || !textInput.parentElement) return;

  const guideBtn = document.createElement('button');
  guideBtn.type = 'button';
  guideBtn.className = 'btn btn-ghost guide-toggle-btn';
  guideBtn.classList.toggle('active', showMarginGuides);
  guideBtn.textContent = 'Guías';
  guideBtn.title = 'Mostrar/ocultar guías de margen (50px de cada borde, con imán)';
  guideBtn.style.display = 'block';
  guideBtn.style.width = '100%';
  guideBtn.style.marginTop = '6px';
  guideBtn.addEventListener('click', () => {
    showMarginGuides = !showMarginGuides;
    guideBtn.classList.toggle('active', showMarginGuides);
    draw();
  });

  textInput.insertAdjacentElement('afterend', guideBtn);
}

buildGuideControls();

// Sliders con relleno propio (ver .dropdown-panel/input[type=range] en
// styles.css): el CSS no puede leer solo el valor de un <input
// type="range">, así que acá se calcula el % y se pone en la variable
// --range-progress que el CSS usa para el gradiente de relleno.
function updateRangeProgress(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const val = Number(input.value);
  const pct = max > min ? Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100)) : 0;
  input.style.setProperty('--range-progress', `${pct}%`);
}
function refreshAllRangeProgress() {
  document.querySelectorAll('input[type="range"]').forEach(updateRangeProgress);
}
// Arrastrar el slider dispara 'input' normal — con esto alcanza para ese
// caso. Cuando el valor se pone por código (deshacer, restablecer
// efectos, seleccionar otra capa, etc.) no se dispara 'input' solo, así
// que esos lugares llaman a refreshAllRangeProgress() a mano.
document.addEventListener('input', (evt) => {
  if (evt.target && evt.target.tagName === 'INPUT' && evt.target.type === 'range') {
    updateRangeProgress(evt.target);
  }
});
refreshAllRangeProgress();