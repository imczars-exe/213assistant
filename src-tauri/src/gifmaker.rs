// Pestaña "GIFs": arma un GIF a partir de un video (mp4/mov/webm/mkv), sin
// que el usuario tenga que tocar la terminal.
//
// El flujo es el mismo que hacer a mano:
//   1) ffmpeg recorta (start→end), aplica el crop y extrae la secuencia de
//      PNG:  ffmpeg -i video.mp4 -ss start -to end -vf "crop=w:h:x:y,fps=N,scale=W:-1" frame%04d.png
//   2) gifski arma el GIF final a partir de esa secuencia de PNG — es el
//      mismo binario que usa https://github.com/ImageOptim/gifski/, así que
//      el resultado es idéntico en calidad al programa original.
//
// Ambos binarios van empaquetados como "sidecars" de Tauri (ver
// tauri.conf.json → bundle.externalBin), igual que cualquier otro programa
// externo que la app necesite: no hace falta que el usuario los tenga
// instalados.
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;

/// Rectángulo de recorte en píxeles, en las coordenadas ORIGINALES del
/// video (no las del <video> en pantalla — eso lo escala el frontend antes
/// de mandarlo).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GifCrop {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

// El frontend (gif.js) manda las claves en camelCase (videoPath, startSec,
// etc.) como el resto de los comandos de esta app — `rename_all` acá es lo
// que hace que eso matchee con estos campos en snake_case.
fn default_speed() -> f64 {
    1.0
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GifRequest {
    /// Ruta absoluta del video de entrada (la que devolvió gif_pick_video).
    pub video_path: String,
    /// Segundo de inicio y de fin del recorte temporal.
    pub start_sec: f64,
    pub end_sec: f64,
    /// `None` = sin crop, se usa el video completo.
    pub crop: Option<GifCrop>,
    pub fps: u32,
    /// Multiplicador de velocidad de reproducción (1 = normal, 2 = el doble
    /// de rápido, 0.5 = a la mitad).
    #[serde(default = "default_speed")]
    pub speed: f64,
    /// Tamaño real de salida: el del recorte (o el del video completo si no
    /// hay crop). El frontend lo calcula solo. Se le pasa a gifski como
    /// --width/--height para que NO lo achique: sin eso gifski limita por
    /// defecto las animaciones a ~800x600 y un recorte de 1080x1080 salía
    /// más chico.
    pub width: u32,
    pub height: u32,
    /// 1–100, mapeado al --quality de gifski.
    pub quality: u8,
}

/// Carpeta temporal para los PNG intermedios de una tanda de generación:
/// `<cache_dir>/gifmaker/<pid>-<timestamp>/`. Usamos pid+timestamp en vez
/// de un uuid (no está entre las dependencias del proyecto) — alcanza para
/// que dos generaciones nunca choquen entre sí.
fn make_temp_dir(app: &AppHandle) -> std::io::Result<PathBuf> {
    let base = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("gifmaker");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = base.join(format!("{}-{}", std::process::id(), stamp));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn emit_status(app: &AppHandle, stage: &str, detail: &str) {
    let _ = app.emit("gif:status", json!({ "stage": stage, "detail": detail }));
}

/// Diálogo para elegir el video de entrada. Mismo patrón que `image_open`
/// en commands.rs, pero sin leer el archivo entero a memoria (un mp4 puede
/// pesar mucho más que una captura de pantalla) — solo devolvemos la ruta;
/// la preview la sirve el protocolo `asset://` vía `convertFileSrc` en el
/// frontend.
#[tauri::command]
pub async fn gif_pick_video(app: AppHandle) -> Value {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Abrir video")
        .add_filter("Video", &["mp4", "mov", "mkv", "webm", "avi", "m4v"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });

    match rx.await {
        Ok(Some(file_path)) => {
            let path_buf: PathBuf = file_path.into_path().unwrap_or_default();
            json!({ "ok": true, "filePath": path_buf.to_string_lossy() })
        }
        _ => json!({ "ok": false, "canceled": true }),
    }
}

/// Corre el pipeline completo (ffmpeg → gifski) y devuelve el GIF armado
/// como vista previa; el archivo queda en una carpeta temporal a la espera
/// de gif_save.
#[tauri::command]
pub async fn gif_generate(app: AppHandle, request: GifRequest) -> Value {
    if request.end_sec <= request.start_sec {
        return json!({ "ok": false, "error": "El fin del recorte tiene que ser mayor que el inicio." });
    }
    if request.fps == 0 || request.width == 0 || request.height == 0 {
        return json!({ "ok": false, "error": "fps y ancho tienen que ser mayores que 0." });
    }

    let tmp_dir = match make_temp_dir(&app) {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": format!("No se pudo crear la carpeta temporal: {e}") }),
    };
    let frames_dir = tmp_dir.join("frames");
    if let Err(e) = std::fs::create_dir_all(&frames_dir) {
        return json!({ "ok": false, "error": format!("No se pudo crear la carpeta de cuadros: {e}") });
    }

    // ---------- 1) ffmpeg: recorte + crop + secuencia de PNG ----------
    emit_status(&app, "frames", "Extrayendo los cuadros del video…");

    let mut vf_parts: Vec<String> = Vec::new();
    if let Some(crop) = &request.crop {
        vf_parts.push(format!("crop={}:{}:{}:{}", crop.w, crop.h, crop.x, crop.y));
    }
    // Velocidad: se cambian los timestamps ANTES de muestrear a N fps, así
    // el GIF final dura (recorte / velocidad) y reproduce a esa velocidad.
    // El recorte -ss/-to se mide sobre el video original, no se ve afectado.
    let speed = if request.speed.is_finite() { request.speed.clamp(0.1, 8.0) } else { 1.0 };
    if (speed - 1.0).abs() > f64::EPSILON {
        vf_parts.push(format!("setpts=PTS/{:.4}", speed));
    }
    vf_parts.push(format!("fps={}", request.fps));
    // Sin filtro de escala: el ancho ya no es un valor aparte que elige el
    // usuario, es el tamaño real del recorte (o del video completo si no
    // hay crop) — reescalar a ese mismo tamaño sería un paso de más que
    // solo perdería nitidez sin necesidad.
    let vf = vf_parts.join(",");

    let frame_pattern = frames_dir.join("frame%05d.png");
    let ffmpeg_args = vec![
        "-y".to_string(),
        "-i".to_string(),
        request.video_path.clone(),
        "-ss".to_string(),
        format!("{:.3}", request.start_sec),
        "-to".to_string(),
        format!("{:.3}", request.end_sec),
        "-vf".to_string(),
        vf,
        frame_pattern.to_string_lossy().to_string(),
    ];

    let ffmpeg_cmd = match app.shell().sidecar("ffmpeg") {
        Ok(c) => c,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return json!({ "ok": false, "error": format!("No se encontró el binario de ffmpeg empaquetado: {e}") });
        }
    };
    let ffmpeg_output = match ffmpeg_cmd.args(&ffmpeg_args).output().await {
        Ok(o) => o,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return json!({ "ok": false, "error": format!("Fallo al correr ffmpeg: {e}") });
        }
    };
    if !ffmpeg_output.status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr);
        return json!({ "ok": false, "error": format!("ffmpeg falló:\n{stderr}") });
    }

    // Solo para chequear que ffmpeg realmente generó algo (si no, avisamos
    // en vez de mandarle a gifski un glob que no matchea nada). El patrón
    // real que usa gifski para leer los cuadros se arma más abajo.
    let frame_paths: Vec<PathBuf> = match std::fs::read_dir(&frames_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("png"))
            .collect(),
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return json!({ "ok": false, "error": format!("No se pudo leer la carpeta de cuadros: {e}") });
        }
    };

    if frame_paths.is_empty() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return json!({
            "ok": false,
            "error": "ffmpeg no generó ningún cuadro — revisá el recorte (inicio/fin) y el crop."
        });
    }

    // ---------- 2) gifski: cuadros → GIF ----------
    emit_status(&app, "gif", "Armando el GIF…");

    let output_gif = tmp_dir.join("output.gif");
    // Un solo argumento con el patrón glob ("frame*.png"), NO la lista de
    // cada cuadro por separado: gifski expande el patrón por sí mismo (así
    // lo documenta su propio README, "gifski -o anim.gif frame*.png") sin
    // depender de que una shell lo haga. Pasar cientos/miles de rutas como
    // argumentos individuales rompe en Windows en cuanto la línea de
    // comandos completa supera ~32.000 caracteres (error 206, "The
    // filename or extension is too long") con recortes largos o fps alto —
    // el glob de un solo argumento no tiene ese problema.
    let frame_glob = frames_dir.join("frame*.png").to_string_lossy().to_string();
    let gifski_args: Vec<String> = vec![
        "--fps".to_string(),
        request.fps.to_string(),
        "--width".to_string(),
        request.width.to_string(),
        "--height".to_string(),
        request.height.to_string(),
        "--quality".to_string(),
        request.quality.clamp(1, 100).to_string(),
        "-o".to_string(),
        output_gif.to_string_lossy().to_string(),
        frame_glob,
    ];

    let gifski_cmd = match app.shell().sidecar("gifski") {
        Ok(c) => c,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return json!({ "ok": false, "error": format!("No se encontró el binario de gifski empaquetado: {e}") });
        }
    };
    let gifski_output = match gifski_cmd.args(&gifski_args).output().await {
        Ok(o) => o,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return json!({ "ok": false, "error": format!("Fallo al correr gifski: {e}") });
        }
    };
    if !gifski_output.status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        let stderr = String::from_utf8_lossy(&gifski_output.stderr);
        return json!({ "ok": false, "error": format!("gifski falló:\n{stderr}") });
    }

    let gif_bytes = match std::fs::read(&output_gif) {
        Ok(b) => b,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return json!({ "ok": false, "error": format!("No se pudo leer el GIF generado: {e}") });
        }
    };

    // Los PNG intermedios ya no hacen falta; el GIF terminado se queda en la
    // carpeta temporal hasta que el usuario lo guarde (gif_save) o se
    // descarte (gif_discard), así "Guardar como…" no tiene que volver a
    // armarlo.
    let _ = std::fs::remove_dir_all(&frames_dir);

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&gif_bytes);
    emit_status(&app, "done", "Listo.");
    json!({
        "ok": true,
        "dataUrl": format!("data:image/gif;base64,{b64}"),
        "sizeBytes": gif_bytes.len(),
        "gifPath": output_gif.to_string_lossy(),
    })
}

/// Carpeta raíz donde viven los GIFs temporales; sirve para validar que las
/// rutas que llegan del frontend a gif_save/gif_discard sean realmente
/// nuestras.
fn gifmaker_base(app: &AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("gifmaker")
}

/// Devuelve la carpeta temporal dueña de `gif_path` si (y solo si) está
/// dentro de la carpeta de trabajo de esta pestaña.
fn owned_temp_dir(app: &AppHandle, gif_path: &str) -> Option<PathBuf> {
    let base = gifmaker_base(app).canonicalize().ok()?;
    let gif = PathBuf::from(gif_path).canonicalize().ok()?;
    if !gif.starts_with(&base) {
        return None;
    }
    gif.parent().map(|p| p.to_path_buf())
}

/// Guarda el GIF que ya se generó (sin volver a correr ffmpeg/gifski):
/// abre el diálogo de guardado y copia el archivo temporal al destino.
#[tauri::command]
pub async fn gif_save(app: AppHandle, gif_path: String) -> Value {
    let tmp_dir = match owned_temp_dir(&app, &gif_path) {
        Some(d) => d,
        None => return json!({ "ok": false, "error": "El GIF temporal ya no existe — generalo de nuevo." }),
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Guardar GIF")
        .set_file_name("animacion.gif")
        .add_filter("GIF", &["gif"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    match rx.await {
        Ok(Some(file_path)) => {
            let dest: PathBuf = file_path.into_path().unwrap_or_default();
            match std::fs::copy(&gif_path, &dest) {
                Ok(size) => {
                    let _ = std::fs::remove_dir_all(&tmp_dir);
                    json!({ "ok": true, "filePath": dest.to_string_lossy(), "sizeBytes": size })
                }
                Err(e) => json!({ "ok": false, "error": e.to_string() }),
            }
        }
        _ => json!({ "ok": false, "canceled": true }),
    }
}

/// Borra el GIF temporal (p. ej. cuando se genera uno nuevo encima).
#[tauri::command]
pub async fn gif_discard(app: AppHandle, gif_path: String) -> Value {
    if let Some(dir) = owned_temp_dir(&app, &gif_path) {
        let _ = std::fs::remove_dir_all(dir);
    }
    json!({ "ok": true })
}