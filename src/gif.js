'use strict';

// Pestaña "GIFs" — arma un GIF a partir de un mp4/mov/mkv/webm sin pasar por
// la terminal. El recorte espacial (crop) sigue el mismo patrón que el
// editor de capturas: al entrar en modo recorte el marco arranca cubriendo
// todo el video, se puede ajustar arrastrando o escribiendo ancho/alto a
// mano, y "Aplicar recorte" confirma — Escape o un clic afuera cancelan.

(() => {
  const openVideoBtn = document.getElementById('gifOpenVideoBtn');
  const fileNameEl = document.getElementById('gifFileName');
  const workspace = document.getElementById('gifWorkspace');
  const emptyState = document.getElementById('gifEmpty');
  const videoStage = document.getElementById('gifVideoStage');
  const video = document.getElementById('gifVideo');

  const cropAppliedLabel = document.getElementById('gifCropAppliedLabel');
  const cropToggleBtn = document.getElementById('gifCropToggleBtn');
  const cropWidthField = document.getElementById('gifCropWidthField');
  const cropHeightField = document.getElementById('gifCropHeightField');
  const cropWidthInput = document.getElementById('gifCropWidthInput');
  const cropHeightInput = document.getElementById('gifCropHeightInput');
  const cropPreset1080Btn = document.getElementById('gifCropPreset1080Btn');
  const cropApplyBtn = document.getElementById('gifCropApplyBtn');
  const cropCancelBtn = document.getElementById('gifCropCancelBtn');
  const cropResetBtn = document.getElementById('gifCropResetBtn');
  const cropBox = document.getElementById('gifCropBox');

  const playBtn = document.getElementById('gifPlayBtn');
  const playhead = document.getElementById('gifPlayhead');
  const currentLabel = document.getElementById('gifCurrentLabel');
  const totalLabel = document.getElementById('gifTotalLabel');
  const muteBtn = document.getElementById('gifMuteBtn');
  const volumeInput = document.getElementById('gifVolumeInput');
  const trimTrack = document.getElementById('gifTrimTrack');
  const trimRange = document.getElementById('gifTrimRange');
  const trimStartHandle = document.getElementById('gifTrimStartHandle');
  const trimEndHandle = document.getElementById('gifTrimEndHandle');
  const startLabel = document.getElementById('gifStartLabel');
  const endLabel = document.getElementById('gifEndLabel');
  const durationLabel = document.getElementById('gifDurationLabel');

  const fpsInput = document.getElementById('gifFpsInput');
  const speedInput = document.getElementById('gifSpeedInput');
  const qualityInput = document.getElementById('gifQualityInput');
  const qualityValue = document.getElementById('gifQualityValue');

  const generateBtn = document.getElementById('gifGenerateBtn');
  const statusEl = document.getElementById('gifStatus');
  const previewBox = document.getElementById('gifPreview');
  const previewImg = document.getElementById('gifPreviewImg');
  const previewMeta = document.getElementById('gifPreviewMeta');
  const saveBtn = document.getElementById('gifSaveBtn');

  if (!openVideoBtn) return; // esta pestaña no está en el DOM (defensivo)

  let videoPath = null;
  let duration = 0;
  let trimStart = 0;
  let trimEnd = 0;

  // Recorte ya CONFIRMADO (el que se manda a generar el GIF) y el recorte
  // en edición (lo que se ve mientras se arrastra/tipea, todavía sin
  // aplicar). Ambos en coordenadas NATURALES del video (px reales).
  let appliedCrop = null;
  let draftCrop = null;
  let cropEditing = false;

  let busy = false;

  // mm:ss.cc — mismo formato que el visor de Windows (ej. 00:11.12).
  function formatTime(sec) {
    const total = Math.max(0, sec || 0);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }

  function setStatus(text, kind) {
    if (!text) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.classList.toggle('gif-status--error', kind === 'error');
  }

  function updateCropAppliedLabel() {
    if (appliedCrop) {
      cropAppliedLabel.hidden = false;
      cropAppliedLabel.textContent = `Recorte aplicado: ${appliedCrop.w}×${appliedCrop.h}`;
    } else {
      cropAppliedLabel.hidden = true;
      cropAppliedLabel.textContent = '';
    }
  }

  // ---- abrir video ----

  openVideoBtn.addEventListener('click', async () => {
    const result = await window.signalLog.pickVideo();
    if (!result || !result.ok || !result.filePath) return;

    videoPath = result.filePath;
    fileNameEl.textContent = videoPath.split(/[\\/]/).pop();
    appliedCrop = null;
    draftCrop = null;
    exitCropEditing();
    previewBox.hidden = true;
    discardCurrentGif();
    setStatus('');

    video.pause();
    video.src = window.signalLog.toAssetUrl(videoPath);
    emptyState.hidden = true;
    workspace.hidden = false;
  });

  video.addEventListener('loadedmetadata', () => {
    duration = video.duration || 0;
    trimStart = 0;
    trimEnd = duration;
    totalLabel.textContent = formatTime(duration);
    updateTrimUi();
    cropToggleBtn.hidden = false;
  });

  // ---- recorte temporal (trim) ----

  function getSpeed() {
    const v = Number(speedInput.value);
    return v > 0 ? Math.min(8, Math.max(0.1, v)) : 1;
  }

  function updateTrimUi() {
    if (!duration) return;
    const startPct = (trimStart / duration) * 100;
    const endPct = (trimEnd / duration) * 100;
    trimStartHandle.style.left = `${startPct}%`;
    trimEndHandle.style.left = `${endPct}%`;
    trimRange.style.left = `${startPct}%`;
    trimRange.style.width = `${Math.max(0, endPct - startPct)}%`;
    startLabel.textContent = formatTime(trimStart);
    endLabel.textContent = formatTime(trimEnd);
    durationLabel.textContent = `${((trimEnd - trimStart) / getSpeed()).toFixed(1)}s`;
  }

  function timeFromClientX(clientX) {
    const rect = trimTrack.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return pct * duration;
  }

  function startTrimDrag(which) {
    return (downEvent) => {
      downEvent.preventDefault();
      video.pause();
      function onMove(moveEvent) {
        const t = timeFromClientX(moveEvent.clientX);
        if (which === 'start') {
          trimStart = Math.min(t, trimEnd - 0.1);
          trimStart = Math.max(0, trimStart);
        } else {
          trimEnd = Math.max(t, trimStart + 0.1);
          trimEnd = Math.min(duration, trimEnd);
        }
        video.currentTime = which === 'start' ? trimStart : trimEnd;
        updateTrimUi();
      }
      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    };
  }

  trimStartHandle.addEventListener('pointerdown', startTrimDrag('start'));
  trimEndHandle.addEventListener('pointerdown', startTrimDrag('end'));

  // ---- línea de tiempo: cabezal + clic/arrastre para moverse ----
  function updatePlayhead() {
    if (!duration) return;
    const t = Math.min(duration, Math.max(0, video.currentTime || 0));
    playhead.style.left = `${(t / duration) * 100}%`;
    currentLabel.textContent = formatTime(t);
  }

  video.addEventListener('timeupdate', updatePlayhead);
  video.addEventListener('seeked', updatePlayhead);
  video.addEventListener('loadedmetadata', updatePlayhead);

  trimTrack.addEventListener('pointerdown', (downEvent) => {
    // Los tiradores de inicio/fin tienen su propio arrastre.
    if (downEvent.target.dataset && downEvent.target.dataset.trim) return;
    if (!duration) return;
    downEvent.preventDefault();
    const seek = (clientX) => {
      video.currentTime = timeFromClientX(clientX);
      updatePlayhead();
    };
    seek(downEvent.clientX);
    const onMove = (e) => seek(e.clientX);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  // ---- volumen ----
  function updateMuteIcon() {
    muteBtn.textContent = video.muted || video.volume === 0 ? '🔇' : '🔊';
  }
  volumeInput.addEventListener('input', () => {
    video.volume = Number(volumeInput.value) / 100;
    video.muted = video.volume === 0;
    updateMuteIcon();
  });
  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.5;
      volumeInput.value = 50;
    }
    updateMuteIcon();
  });

  // ---- reproducción (solo el tramo elegido, en bucle) ----
  let playRaf = null;

  function stopPlayLoop() {
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = null;
  }

  function playLoopTick() {
    if (video.paused) {
      playRaf = null;
      return;
    }
    if (video.currentTime >= trimEnd || video.currentTime < trimStart - 0.05) {
      video.currentTime = trimStart;
    }
    updatePlayhead();
    playRaf = requestAnimationFrame(playLoopTick);
  }

  function togglePlay() {
    if (!videoPath || !duration) return;
    if (video.paused) {
      if (video.currentTime < trimStart || video.currentTime >= trimEnd) {
        video.currentTime = trimStart;
      }
      video.playbackRate = getSpeed();
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  video.addEventListener('play', () => {
    playBtn.textContent = '⏸';
    stopPlayLoop();
    playRaf = requestAnimationFrame(playLoopTick);
  });
  video.addEventListener('pause', () => {
    playBtn.textContent = '▶';
    stopPlayLoop();
  });
  playBtn.addEventListener('click', togglePlay);

  // Clic sobre el video (fuera del modo recorte) también reproduce/pausa.
  video.addEventListener('click', () => {
    if (!cropEditing) togglePlay();
  });

  // ---- recorte espacial (crop) ----
  // El <video> usa object-fit: contain, así que puede haber "barras" a los
  // costados o arriba/abajo — hay que calcular el rectángulo REAL donde se
  // dibuja el video dentro de su caja para mapear correctamente entre
  // píxeles en pantalla y píxeles naturales del video, y para topear el
  // marco de recorte exactamente ahí (nunca fuera del video).
  function getVideoContentRect() {
    const stageRect = videoStage.getBoundingClientRect();
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const stageRatio = stageRect.width / stageRect.height;
    const videoRatio = vw / vh;
    let width, height, left, top;
    if (videoRatio > stageRatio) {
      width = stageRect.width;
      height = width / videoRatio;
      left = 0;
      top = (stageRect.height - height) / 2;
    } else {
      height = stageRect.height;
      width = height * videoRatio;
      top = 0;
      left = (stageRect.width - width) / 2;
    }
    return { left, top, width, height, stageRect };
  }

  function screenRectToCropRect(box) {
    const content = getVideoContentRect();
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const scaleX = vw / content.width;
    const scaleY = vh / content.height;
    let x = Math.round((box.left - content.left) * scaleX);
    let y = Math.round((box.top - content.top) * scaleY);
    let w = Math.round(box.width * scaleX);
    let h = Math.round(box.height * scaleY);
    x = Math.max(0, Math.min(x, vw - 2));
    y = Math.max(0, Math.min(y, vh - 2));
    w = Math.max(2, Math.min(w, vw - x));
    h = Math.max(2, Math.min(h, vh - y));
    return { x, y, w, h };
  }

  function cropRectToScreenStyle(rect) {
    const content = getVideoContentRect();
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const scaleX = content.width / vw;
    const scaleY = content.height / vh;
    return {
      left: content.left + rect.x * scaleX,
      top: content.top + rect.y * scaleY,
      width: rect.w * scaleX,
      height: rect.h * scaleY,
    };
  }

  function paintBox(rect) {
    const s = cropRectToScreenStyle(rect);
    cropBox.style.left = `${s.left}px`;
    cropBox.style.top = `${s.top}px`;
    cropBox.style.width = `${s.width}px`;
    cropBox.style.height = `${s.height}px`;
  }

  // Refleja el tamaño actual del marco en los inputs de ancho/alto — mismo
  // patrón que syncCropSizeInputs() del editor de capturas.
  function syncCropSizeInputs() {
    if (!draftCrop) return;
    cropWidthInput.value = draftCrop.w;
    cropHeightInput.value = draftCrop.h;
  }

  function fullVideoCropRect() {
    // Igual que el editor: el marco arranca cubriendo TODO (acá, todo el
    // video), listo para ajustar desde las esquinas o escribiendo el
    // tamaño exacto.
    return { x: 0, y: 0, w: video.videoWidth || 640, h: video.videoHeight || 360 };
  }

  function enterCropEditing() {
    cropEditing = true;
    draftCrop = appliedCrop ? { ...appliedCrop } : fullVideoCropRect();
    cropBox.hidden = false;
    cropBox.classList.remove('is-locked');
    cropWidthField.hidden = false;
    cropHeightField.hidden = false;
    cropPreset1080Btn.hidden = false;
    cropApplyBtn.hidden = false;
    cropCancelBtn.hidden = false;
    cropToggleBtn.hidden = true;
    cropResetBtn.hidden = true;
    syncCropSizeInputs();
    paintBox(draftCrop);
  }

  // Sale del modo edición. Si hay un recorte aplicado, deja el marco
  // VISIBLE pero bloqueado (sin tiradores) — así queda claro que el
  // recorte quedó puesto, en vez de que el marco simplemente desaparezca.
  function exitCropEditing() {
    cropEditing = false;
    draftCrop = null;
    cropWidthField.hidden = true;
    cropHeightField.hidden = true;
    cropPreset1080Btn.hidden = true;
    cropApplyBtn.hidden = true;
    cropCancelBtn.hidden = true;
    cropToggleBtn.hidden = !videoPath;
    cropToggleBtn.classList.toggle('is-active', !!appliedCrop);
    cropToggleBtn.title = appliedCrop ? 'Editar el recorte' : 'Dibujar recorte sobre el video';
    cropResetBtn.hidden = !appliedCrop;
    updateCropAppliedLabel();
    if (appliedCrop) {
      cropBox.hidden = false;
      cropBox.classList.add('is-locked');
      paintBox(appliedCrop);
    } else {
      cropBox.hidden = true;
      cropBox.classList.remove('is-locked');
    }
  }

  cropToggleBtn.addEventListener('click', () => {
    if (!videoPath) return;
    enterCropEditing();
  });

  cropApplyBtn.addEventListener('click', () => {
    if (draftCrop) appliedCrop = { ...draftCrop };
    exitCropEditing();
  });

  cropCancelBtn.addEventListener('click', () => {
    exitCropEditing();
  });

  cropResetBtn.addEventListener('click', () => {
    appliedCrop = null;
    exitCropEditing();
  });

  // Escape cancela el recorte en edición — igual que en el editor de
  // capturas.
  window.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Escape' || !cropEditing) return;
    exitCropEditing();
  });

  // Un clic afuera del video y de los controles propios del recorte
  // también cancela — mismo comportamiento que el editor de capturas (ya
  // no hace falta apretar Escape a la fuerza).
  document.addEventListener('mousedown', (evt) => {
    if (!cropEditing) return;
    const target = evt.target;
    if (videoStage.contains(target)) return;
    if (cropWidthField.contains(target)) return;
    if (cropHeightField.contains(target)) return;
    if (cropPreset1080Btn.contains(target)) return;
    if (cropApplyBtn.contains(target)) return;
    if (cropCancelBtn.contains(target)) return;
    exitCropEditing();
  });

  window.addEventListener('resize', () => {
    if (cropEditing && draftCrop) paintBox(draftCrop);
    else if (appliedCrop && !cropBox.hidden) paintBox(appliedCrop);
  });

  // Recorta un rectángulo en PANTALLA para que no se salga del contenido
  // real del video (nunca de todo el <video>, que puede tener barras).
  function clampBoxToContent(box, content) {
    box.width = Math.min(box.width, content.width);
    box.height = Math.min(box.height, content.height);
    box.left = Math.max(content.left, Math.min(box.left, content.left + content.width - box.width));
    box.top = Math.max(content.top, Math.min(box.top, content.top + content.height - box.height));
    return box;
  }

  // Arrastrar el cuerpo del recuadro (mover) o sus esquinas (redimensionar).
  cropBox.addEventListener('pointerdown', (downEvent) => {
    if (!cropEditing) return;
    downEvent.preventDefault();
    downEvent.stopPropagation();
    const handle = downEvent.target.dataset ? downEvent.target.dataset.handle : null;
    const content = getVideoContentRect();
    const startBox = {
      left: cropBox.offsetLeft,
      top: cropBox.offsetTop,
      width: cropBox.offsetWidth,
      height: cropBox.offsetHeight,
    };
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;

    function onMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let box = { ...startBox };
      if (!handle) {
        box.left += dx;
        box.top += dy;
      } else {
        if (handle.includes('e')) box.width = Math.max(20, startBox.width + dx);
        if (handle.includes('s')) box.height = Math.max(20, startBox.height + dy);
        if (handle.includes('w')) {
          box.width = Math.max(20, startBox.width - dx);
          box.left = startBox.left + startBox.width - box.width;
        }
        if (handle.includes('n')) {
          box.height = Math.max(20, startBox.height - dy);
          box.top = startBox.top + startBox.height - box.height;
        }
      }
      box = clampBoxToContent(box, content);
      cropBox.style.left = `${box.left}px`;
      cropBox.style.top = `${box.top}px`;
      cropBox.style.width = `${box.width}px`;
      cropBox.style.height = `${box.height}px`;
      draftCrop = screenRectToCropRect(box);
      syncCropSizeInputs();
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });

  // ---- tamaño exacto por teclado + preset ----
  // Mismo patrón que setCropSizeFromInputs() del editor: aplica un tamaño
  // exacto manteniendo el centro actual del marco, topeado al video. Se
  // aplica con cada tecla, sin necesitar un botón aparte.
  function setCropSizeFromInputs() {
    if (!cropEditing || !draftCrop) return;
    const w = Math.round(Number(cropWidthInput.value));
    const h = Math.round(Number(cropHeightInput.value));
    if (!(w > 0) || !(h > 0)) return;

    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;
    const clampedW = Math.min(w, vw);
    const clampedH = Math.min(h, vh);

    const centerX = draftCrop.x + draftCrop.w / 2;
    const centerY = draftCrop.y + draftCrop.h / 2;
    let x = Math.round(centerX - clampedW / 2);
    let y = Math.round(centerY - clampedH / 2);
    x = Math.max(0, Math.min(vw - clampedW, x));
    y = Math.max(0, Math.min(vh - clampedH, y));

    draftCrop = { x, y, w: clampedW, h: clampedH };
    syncCropSizeInputs();
    paintBox(draftCrop);
  }

  for (const input of [cropWidthInput, cropHeightInput]) {
    input.addEventListener('input', setCropSizeFromInputs);
  }

  // Igual que los presets del editor: si el modo recorte todavía no está
  // activo, lo prende primero, y ahí sí fija el tamaño exacto.
  cropPreset1080Btn.addEventListener('click', () => {
    if (!videoPath) return;
    if (!cropEditing) enterCropEditing();
    cropWidthInput.value = 1080;
    cropHeightInput.value = 1080;
    setCropSizeFromInputs();
  });

  // ---- controles de calidad ----

  // La velocidad no toca el video de la vista previa, pero sí la duración
  // final del GIF que se muestra abajo del recorte.
  speedInput.addEventListener('input', () => {
    updateTrimUi();
    video.playbackRate = getSpeed();
  });

  qualityInput.addEventListener('input', () => {
    qualityValue.textContent = qualityInput.value;
  });

  // ---- generar ----

  window.signalLog.onGifStatus(({ stage, detail }) => {
    if (stage === 'done') {
      setStatus('');
      return;
    }
    setStatus(detail || 'Procesando…');
  });

  function buildRequest() {
    // El ancho de salida sale directo del recorte CONFIRMADO (o del tamaño
    // natural del video si no hay uno) — no es un valor que se elija aparte.
    const width = appliedCrop ? appliedCrop.w : (video.videoWidth || 480);
    const height = appliedCrop ? appliedCrop.h : (video.videoHeight || 270);
    return {
      videoPath,
      startSec: trimStart,
      endSec: trimEnd,
      crop: appliedCrop ? { ...appliedCrop } : null,
      speed: getSpeed(),
      fps: Math.max(1, Math.round(Number(fpsInput.value) || 15)),
      width,
      height,
      quality: Math.max(1, Math.min(100, Math.round(Number(qualityInput.value) || 100))),
    };
  }

  // Ruta del GIF ya armado (queda en una carpeta temporal del lado de Rust
  // hasta que se guarda o se reemplaza por uno nuevo).
  let currentGifPath = null;

  function discardCurrentGif() {
    if (!currentGifPath) return;
    const old = currentGifPath;
    currentGifPath = null;
    window.signalLog.discardGif(old).catch(() => {});
  }

  generateBtn.addEventListener('click', async () => {
    if (busy || !videoPath) return;
    busy = true;
    generateBtn.disabled = true;
    saveBtn.disabled = true;
    setStatus('Extrayendo los cuadros del video…');
    try {
      const result = await window.signalLog.generateGif(buildRequest());
      if (!result || !result.ok) {
        setStatus((result && result.error) || 'No se pudo generar el GIF.', 'error');
        previewBox.hidden = true;
        return;
      }
      discardCurrentGif();
      currentGifPath = result.gifPath;
      setStatus('');
      previewImg.src = result.dataUrl;
      previewMeta.textContent = `${Math.round((result.sizeBytes || 0) / 1024)} KB`;
      previewBox.hidden = false;
    } finally {
      busy = false;
      generateBtn.disabled = false;
      saveBtn.disabled = false;
    }
  });

  // Guarda el GIF que ya se ve en la vista previa: solo abre el diálogo y
  // copia el archivo, no vuelve a procesar nada.
  saveBtn.addEventListener('click', async () => {
    if (busy || !currentGifPath) return;
    const result = await window.signalLog.saveGif(currentGifPath);
    if (!result || result.canceled) return;
    if (!result.ok) {
      setStatus(result.error || 'No se pudo guardar el GIF.', 'error');
      return;
    }
    currentGifPath = null;
    setStatus(`Guardado: ${result.filePath}`);
  });
})();