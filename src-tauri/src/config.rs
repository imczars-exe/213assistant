use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Espejo de DEFAULT_CONFIG en el main.js original de Electron.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBounds {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_window_bounds")]
    pub window_bounds: WindowBounds,
    #[serde(default)]
    pub last_export_dir: Option<String>,
    #[serde(default)]
    pub last_image_export_dir: Option<String>,
    #[serde(default)]
    pub filters: serde_json::Value,
    #[serde(default = "default_swatches")]
    pub color_swatches: Vec<String>,
}

fn default_window_bounds() -> WindowBounds {
    WindowBounds { width: 460, height: 720 }
}

fn default_swatches() -> Vec<String> {
    vec![
        "#c2a2da".into(),
        "#9a9aa1".into(),
        "#ffd966".into(),
        "#ff6b6b".into(),
        "#7cc576".into(),
    ]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            window_bounds: default_window_bounds(),
            last_export_dir: None,
            last_image_export_dir: None,
            filters: serde_json::json!({}),
            color_swatches: default_swatches(),
        }
    }
}

fn config_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("no se pudo resolver el directorio de datos de la app");
    dir.join("config.json")
}

pub fn load_config(app: &AppHandle) -> AppConfig {
    let path = config_path(app);
    let cfg = match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<serde_json::Value>(&raw)
            .ok()
            .and_then(|mut val| {
                // merge suave: cualquier campo ausente cae al default vía #[serde(default)]
                let default_val = serde_json::to_value(AppConfig::default()).ok()?;
                if let (Some(obj), Some(default_obj)) = (val.as_object_mut(), default_val.as_object()) {
                    for (k, v) in default_obj {
                        obj.entry(k.clone()).or_insert_with(|| v.clone());
                    }
                }
                serde_json::from_value(val).ok()
            })
            .unwrap_or_default(),
        Err(_) => AppConfig::default(),
    };

    cfg
}

pub fn save_config(app: &AppHandle, config: &AppConfig) {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = fs::write(&path, json);
    }
}

/// Ruta del chatlog en disco. En Windows replica exactamente la ubicación que
/// usaba la versión de Electron (%LOCALAPPDATA%\FiveM\FiveM.app\chatlog.txt),
/// que es donde FiveM también deja sus propios logs de sesión. En otras
/// plataformas (solo relevante en desarrollo) cae a la carpeta de datos de la app.
pub fn resolve_chatlog_path(app: &AppHandle) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local_appdata)
                .join("FiveM")
                .join("FiveM.app")
                .join("chatlog.txt");
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("chatlog.txt")
}

pub fn append_autosave(app: &AppHandle, text: &str) {
    let path = resolve_chatlog_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    use std::io::Write;
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{}", text);
    }
}

/// Borra todo lo guardado en el chatlog de disco (el mismo archivo que lee
/// `parse_load` / escribe `append_autosave`). Usa `File::create`, que trunca
/// el archivo a 0 bytes si ya existe o lo crea vacío si no — así el botón
/// funciona igual sin importar si ya se había capturado algo antes.
pub fn clear_chatlog(app: &AppHandle) -> std::io::Result<()> {
    let path = resolve_chatlog_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::File::create(&path)?;
    Ok(())
}