use base64::Engine;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::capture::{self, CaptureManager};
use crate::config::{self, AppConfig};
use crate::inventory::{self, CashMovement, Order, Product, StockAdjustment};
use crate::MaximizeLock;

// ---------------- captura ----------------

#[tauri::command]
pub fn capture_start(app: AppHandle, mgr: State<'_, Arc<CaptureManager>>) -> Value {
    capture::start(app, mgr.inner().clone());
    json!({ "ok": true })
}

#[tauri::command]
pub fn capture_stop(app: AppHandle, mgr: State<'_, Arc<CaptureManager>>) -> Value {
    capture::stop(app, mgr.inner().clone());
    json!({ "ok": true })
}

#[tauri::command]
pub async fn capture_get_state(mgr: State<'_, Arc<CaptureManager>>) -> Result<Value, ()> {
    let (state, session_started_at) = mgr.get_state_snapshot().await;
    Ok(json!({ "state": state, "sessionStartedAt": session_started_at }))
}

// ---------------- ventana ----------------

/// El frontend llama a esto al cambiar de pestaña: `locked = true` en el
/// editor de capturas (no se puede restaurar/desmaximizar mientras tanto),
/// `locked = false` de vuelta en el chatlog. El handler de `Resized` en
/// `main.rs` es el que hace cumplir esto de verdad (re-maximiza al toque si
/// detecta que igual quedó desmaximizada); acá solo guardamos el flag y
/// maximizamos de una si ya estaba desmaximizada al activarlo.
#[tauri::command]
pub fn set_maximize_lock(app: AppHandle, lock: State<'_, MaximizeLock>, locked: bool) -> Value {
    lock.store(locked, Ordering::SeqCst);
    if locked {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.maximize();
        }
    }
    json!({ "ok": true })
}

// ---------------- inicio con Windows ----------------

/// ¿Está activado el inicio automático con Windows?
#[tauri::command]
pub fn autostart_get(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Activa o desactiva el inicio automático. Devuelve el estado REAL final
/// (`enabled`) para que la UI se sincronice aunque el registro haya fallado.
#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> Value {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    let now_enabled = manager.is_enabled().unwrap_or(false);

    // Mantener el tilde del menú de la bandeja igual al estado real.
    if let Some(item) = app.try_state::<crate::TrayAutostartItem>() {
        let _ = item.0.set_checked(now_enabled);
    }

    if now_enabled == enabled {
        json!({ "ok": true, "enabled": now_enabled })
    } else {
        let error = match result {
            Err(e) => e.to_string(),
            Ok(()) => "el cambio no se aplicó".to_string(),
        };
        json!({ "ok": false, "enabled": now_enabled, "error": error })
    }
}

// ---------------- portapapeles ----------------

#[tauri::command]
pub fn clipboard_copy(app: AppHandle, text: String) -> Value {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let _ = app.clipboard().write_text(text);
    json!({ "ok": true })
}

// ---------------- exportar chatlog ----------------

#[tauri::command]
pub async fn export_save(app: AppHandle, text: String, suggested_name: Option<String>) -> Value {
    let cfg = config::load_config(&app);
    let default_dir = cfg
        .last_export_dir
        .clone()
        .map(PathBuf::from)
        .or_else(|| app.path().document_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    let file_name = suggested_name.unwrap_or_else(|| "session.txt".to_string());

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Exportar chatlog")
        .set_directory(&default_dir)
        .set_file_name(&file_name)
        .add_filter("Texto plano", &["txt"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    match rx.await {
        Ok(Some(file_path)) => {
            let path_buf: PathBuf = file_path.into_path().unwrap_or_default();
            match std::fs::write(&path_buf, text) {
                Ok(_) => {
                    if let Some(parent) = path_buf.parent() {
                        let mut new_cfg = cfg;
                        new_cfg.last_export_dir = Some(parent.to_string_lossy().to_string());
                        config::save_config(&app, &new_cfg);
                    }
                    json!({ "ok": true, "filePath": path_buf.to_string_lossy() })
                }
                Err(e) => json!({ "ok": false, "error": e.to_string() }),
            }
        }
        _ => json!({ "ok": false, "canceled": true }),
    }
}

// ---------------- configuración ----------------

#[tauri::command]
pub fn config_get(app: AppHandle) -> AppConfig {
    config::load_config(&app)
}

#[tauri::command]
pub fn config_set_filters(app: AppHandle, filters: Value) -> Value {
    let mut cfg = config::load_config(&app);
    cfg.filters = filters;
    config::save_config(&app, &cfg);
    json!({ "ok": true })
}

#[tauri::command]
pub fn config_set_swatches(app: AppHandle, color_swatches: Vec<String>) -> Value {
    let mut cfg = config::load_config(&app);
    cfg.color_swatches = color_swatches;
    config::save_config(&app, &cfg);
    json!({ "ok": true })
}

// ---------------- parsear chatlog guardado ----------------

// Con un chatlog.txt normal (unas pocas miles de líneas) no hace falta
// límite, pero si alguien viene de una sesión larga (o de una versión
// vieja con bugs de duplicados ya arreglados) el archivo puede tener
// cientos de miles de líneas — cargar y, sobre todo, RENDERIZAR todas esas
// de una sola vez congela la app (un elemento de pantalla nuevo por línea,
// sin pausas). Nos quedamos con las últimas, que es lo que en la práctica
// se quiere revisar de todos modos.
const PARSE_LOAD_MAX_LINES: usize = 5000;

#[tauri::command]
pub fn parse_load(app: AppHandle) -> Value {
    let path = config::resolve_chatlog_path(&app);
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            let all_lines: Vec<&str> = content
                .split(['\n', '\r'])
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .collect();
            let total = all_lines.len();
            let start = total.saturating_sub(PARSE_LOAD_MAX_LINES);
            let lines = &all_lines[start..];
            json!({ "ok": true, "lines": lines, "total": total, "truncated": start > 0 })
        }
        Err(e) => {
            let error = if e.kind() == std::io::ErrorKind::NotFound {
                "no_file".to_string()
            } else {
                e.to_string()
            };
            json!({ "ok": false, "lines": [], "error": error })
        }
    }
}

/// Borra todo el chatlog guardado en disco (el `.txt` que lee `parse_load`
/// y al que va escribiendo el capturador). No toca lo que esté cargado en
/// pantalla en ese momento — de eso ya se encarga "Limpiar" del lado del
/// frontend.
#[tauri::command]
pub fn chatlog_clear(app: AppHandle) -> Value {
    match config::clear_chatlog(&app) {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}

// ---------------- actualizaciones ----------------
// Wrapper sobre tauri-plugin-updater: `check_for_updates` guarda la
// actualización encontrada (si hay) en `PendingUpdate`, e `install_update`
// la retoma de ahí para no tener que volver a pedirle al endpoint la misma
// información justo antes de instalar.

/// Actualización detectada por el último `check_for_updates`, pendiente de
/// instalar. `None` si nunca se buscó, no había ninguna, o ya se instaló.
pub type PendingUpdate = std::sync::Mutex<Option<tauri_plugin_updater::Update>>;

#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Value, ()> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return Ok(json!({ "ok": false, "error": e.to_string() })),
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let notes = update.body.clone().unwrap_or_default();
            *pending.lock().unwrap() = Some(update);
            Ok(json!({ "ok": true, "available": true, "version": version, "notes": notes }))
        }
        Ok(None) => {
            *pending.lock().unwrap() = None;
            Ok(json!({ "ok": true, "available": false }))
        }
        Err(e) => Ok(json!({ "ok": false, "error": e.to_string() })),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Value, ()> {
    let update = pending.lock().unwrap().take();
    let Some(update) = update else {
        return Ok(json!({
            "ok": false,
            "error": "No hay ninguna actualización pendiente. Buscá de nuevo antes de instalar."
        }));
    };

    let app_for_progress = app.clone();
    let result = update
        .download_and_install(
            move |chunk_len, total| {
                let _ = app_for_progress.emit(
                    "updater:progress",
                    json!({ "chunk": chunk_len, "total": total }),
                );
            },
            || {},
        )
        .await;

    // En Windows, si esto sale bien, `download_and_install` ya deja el
    // programa cerrándose para que corra el instalador — este código de
    // abajo prácticamente no llega a ejecutarse en ese caso. En macOS/Linux
    // sí se sigue ejecutando y hay que reiniciar la app manualmente después
    // (no aplica hoy: el bundle de este proyecto es solo Windows).
    match result {
        Ok(()) => Ok(json!({ "ok": true })),
        Err(e) => Ok(json!({ "ok": false, "error": e.to_string() })),
    }
}

// ---------------- shell ----------------

#[tauri::command]
pub fn shell_open_external(app: AppHandle, url: String) {
    use tauri_plugin_shell::ShellExt;
    if url.to_lowercase().starts_with("http://") || url.to_lowercase().starts_with("https://") {
        let _ = app.shell().open(url, None);
    }
}

// ---------------- editor de capturas: imágenes ----------------

fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "bmp" => "image/bmp",
        _ => "image/png",
    }
}

#[tauri::command]
pub async fn image_open(app: AppHandle) -> Value {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Abrir captura de pantalla")
        .add_filter("Imágenes", &["png", "jpg", "jpeg", "bmp"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });

    match rx.await {
        Ok(Some(file_path)) => {
            let path_buf: PathBuf = file_path.into_path().unwrap_or_default();
            match std::fs::read(&path_buf) {
                Ok(bytes) => {
                    let ext = path_buf
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("png");
                    let mime = mime_for_ext(ext);
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    json!({
                        "ok": true,
                        "dataUrl": format!("data:{mime};base64,{b64}"),
                        "filePath": path_buf.to_string_lossy(),
                    })
                }
                Err(e) => json!({ "ok": false, "error": e.to_string() }),
            }
        }
        _ => json!({ "ok": false, "canceled": true }),
    }
}

// ---------------- inventario (productos + pedidos, vía Supabase) ----------------
// El inventario no se guarda en un archivo local ni tiene pantalla de
// configuración: cada acción pega contra funciones de Postgres (ver
// supabase_seguridad.sql) que exigen la contraseña compartida en cada
// llamada. Esa contraseña se guarda en memoria (nunca en disco) apenas el
// login es correcto, en `InventorySession`, y se reusa automáticamente en
// el resto de los comandos — así el frontend no tiene que mandarla de
// nuevo en cada acción. Se pierde al cerrar la app (hay que loguearse de
// nuevo), igual que antes.
pub type InventorySession = std::sync::Mutex<Option<String>>;

fn require_password(session: &State<'_, InventorySession>) -> Result<String, Value> {
    session.lock().unwrap().clone().ok_or_else(|| {
        json!({
            "ok": false,
            "error": "not_authenticated",
            "message": "Hay que iniciar sesión de nuevo antes de continuar."
        })
    })
}

#[tauri::command]
pub async fn inventory_login(session: State<'_, InventorySession>, password: String) -> Result<Value, ()> {
    let result = inventory::check_password(&password).await;
    let ok_and_authorized = result.get("ok").and_then(|v| v.as_bool()) == Some(true)
        && result.get("authorized").and_then(|v| v.as_bool()) == Some(true);
    if ok_and_authorized {
        *session.lock().unwrap() = Some(password);
    }
    Ok(result)
}

#[tauri::command]
pub async fn inventory_get(session: State<'_, InventorySession>) -> Result<Value, ()> {
    match require_password(&session) {
        Ok(pw) => Ok(inventory::fetch_inventory(&pw).await),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn inventory_product_save(session: State<'_, InventorySession>, product: Product) -> Result<Value, ()> {
    match require_password(&session) {
        Ok(pw) => Ok(inventory::upsert_product(&pw, &product).await),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn inventory_product_delete(session: State<'_, InventorySession>, id: String) -> Result<Value, ()> {
    match require_password(&session) {
        Ok(pw) => Ok(inventory::delete_product(&pw, &id).await),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn inventory_order_confirm(
    session: State<'_, InventorySession>,
    order: Order,
    adjustments: Vec<StockAdjustment>,
) -> Result<Value, ()> {
    match require_password(&session) {
        Ok(pw) => Ok(inventory::confirm_order(&pw, &order, &adjustments).await),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn inventory_order_delete(session: State<'_, InventorySession>, id: String) -> Result<Value, ()> {
    match require_password(&session) {
        Ok(pw) => Ok(inventory::delete_order(&pw, &id).await),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn inventory_cash_add(session: State<'_, InventorySession>, movement: CashMovement) -> Result<Value, ()> {
    match require_password(&session) {
        Ok(pw) => Ok(inventory::add_manual_cash_movement(&pw, &movement).await),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn inventory_cash_delete(session: State<'_, InventorySession>, id: String) -> Result<Value, ()> {
    match require_password(&session) {
        Ok(pw) => Ok(inventory::delete_cash_movement(&pw, &id).await),
        Err(e) => Ok(e),
    }
}


#[tauri::command]
pub async fn image_save(app: AppHandle, data_url: String, suggested_name: Option<String>) -> Value {
    let cfg = config::load_config(&app);
    let default_dir = cfg
        .last_image_export_dir
        .clone()
        .map(PathBuf::from)
        .or_else(|| app.path().picture_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    let file_name = suggested_name.unwrap_or_else(|| "captura.png".to_string());

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Exportar captura editada")
        .set_directory(&default_dir)
        .set_file_name(&file_name)
        .add_filter("PNG", &["png"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    match rx.await {
        Ok(Some(file_path)) => {
            let path_buf: PathBuf = file_path.into_path().unwrap_or_default();
            let b64 = data_url
                .splitn(2, "base64,")
                .nth(1)
                .unwrap_or(&data_url)
                .to_string();
            match base64::engine::general_purpose::STANDARD.decode(b64) {
                Ok(bytes) => match std::fs::write(&path_buf, bytes) {
                    Ok(_) => {
                        if let Some(parent) = path_buf.parent() {
                            let mut new_cfg = cfg;
                            new_cfg.last_image_export_dir = Some(parent.to_string_lossy().to_string());
                            config::save_config(&app, &new_cfg);
                        }
                        json!({ "ok": true, "filePath": path_buf.to_string_lossy() })
                    }
                    Err(e) => json!({ "ok": false, "error": e.to_string() }),
                },
                Err(e) => json!({ "ok": false, "error": e.to_string() }),
            }
        }
        _ => json!({ "ok": false, "canceled": true }),
    }
}