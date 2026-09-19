// 213 Assistant — versión Tauri (portable y liviana) del logger de chat de rol.
// Puerto 1:1 de la app original en Electron/Node: misma UI, mismos contratos
// de la API interna del bridge (window.signalLog), motor de captura CDP
// reescrito en Rust.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod commands;
mod config;
mod discord;
mod inventory;

use capture::CaptureManager;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

// Tamaño mínimo de la ventana (en píxeles lógicos) — aplica siempre: al
// restaurar desde maximizado, al arrastrar los bordes, y al arrancar. Ajustá
// estos dos números si necesitás otro piso.
const MIN_WINDOW_WIDTH: f64 = 650.0;
const MIN_WINDOW_HEIGHT: f64 = 660.0;

/// Estado compartido: cuando está en `true`, la ventana no puede quedar
/// desmaximizada (el editor de capturas lo activa; el chatlog lo desactiva).
/// Es el mismo `Arc<AtomicBool>` que se registra con `.manage()` y que
/// `commands::set_maximize_lock` y el handler de `Resized` de abajo comparten.
pub type MaximizeLock = Arc<AtomicBool>;

/// Argumento con el que Windows lanza la app al iniciar sesión. Si está
/// presente, la ventana arranca oculta (solo bandeja del sistema) en vez de
/// aparecer maximizada encima de todo apenas se enciende la PC.
const AUTOSTART_ARG: &str = "--minimized";

/// Trae la ventana principal al frente (la restaura si estaba minimizada u
/// oculta en la bandeja).
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Ícono en la bandeja del sistema: clic izquierdo abre la ventana; clic
/// derecho muestra el menú (Abrir / Iniciar con Windows / Salir).
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);

    let open_item = MenuItem::with_id(app, "open", "Abrir 213 Assistant", true, None::<&str>)?;
    let autostart_item = CheckMenuItem::with_id(
        app,
        "autostart",
        "Iniciar con Windows",
        true,
        autostart_on,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &autostart_item, &separator, &quit_item])?;

    let autostart_for_menu = autostart_item.clone();
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("213 Assistant")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "autostart" => {
                let manager = app.autolaunch();
                if manager.is_enabled().unwrap_or(false) {
                    let _ = manager.disable();
                } else {
                    let _ = manager.enable();
                }
                // Reflejar el estado real (por si el registro falló).
                let _ = autostart_for_menu.set_checked(manager.is_enabled().unwrap_or(false));
            }
            // Única forma de cerrar la app de verdad (la X solo la oculta).
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        // Tiene que ir primero, antes que cualquier otro `.plugin(...)`: si
        // ya hay una instancia corriendo, esta llamada intercepta el
        // arranque del segundo proceso y termina acá (con el proceso nuevo
        // saliendo enseguida) — el resto del builder ni se ejecuta en ese
        // caso. Sin esto, dos instancias corren en paralelo, cada una con
        // su propio motor de captura sin saber de la otra, y las dos
        // terminan escribiendo el mismo arranque de sesión al mismo
        // chatlog.txt por separado (duplicados limpios, no relacionados con
        // el dedup del motor de captura en sí).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // Inicio con Windows: escribe la entrada en el registro del usuario
        // (HKCU\...\Run). Lanza la app con `--minimized` para que arranque
        // directo a la bandeja.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Arc::new(CaptureManager::new()))
        .manage(MaximizeLock::new(AtomicBool::new(false)))
        .manage(commands::PendingUpdate::default())
        .manage(commands::InventorySession::default())
        .invoke_handler(tauri::generate_handler![
            commands::capture_start,
            commands::capture_stop,
            commands::capture_get_state,
            commands::clipboard_copy,
            commands::export_save,
            commands::config_get,
            commands::config_set_filters,
            commands::config_set_swatches,
            commands::parse_load,
            commands::chatlog_clear,
            commands::shell_open_external,
            commands::image_open,
            commands::image_save,
            commands::inventory_login,
            commands::inventory_get,
            commands::inventory_product_save,
            commands::inventory_product_delete,
            commands::inventory_order_confirm,
            commands::inventory_order_delete,
            commands::inventory_cash_add,
            commands::inventory_cash_delete,
            commands::set_maximize_lock,
            commands::check_for_updates,
            commands::install_update,
            frontend_ready,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let mut cfg = config::load_config(&handle);

            // Primer arranque: activar el inicio con Windows por defecto. Si
            // después lo desactivás desde la bandeja, no se vuelve a activar.
            if !cfg.autostart_initialized {
                let _ = app.autolaunch().enable();
                cfg.autostart_initialized = true;
                config::save_config(&handle, &cfg);
            }

            setup_tray(app)?;

            // Actividad fija en Discord ("Haciendo relatos") mientras la
            // app esté abierta — ver discord.rs.
            discord::spawn();

            // Ping periódico a Supabase para que el proyecto del inventario
            // compartido no se pause por inactividad en el plan gratuito —
            // ver inventory::spawn_keepalive. Conexión fija (SUPABASE_URL /
            // SUPABASE_ANON_KEY en inventory.rs), no depende de ninguna
            // configuración por máquina.
            inventory::spawn_keepalive();

            if let Some(window) = app.get_webview_window("main") {
                // Piso duro de tamaño: Windows no va a dejar bajar de esto ni
                // al restaurar desde maximizado ni arrastrando los bordes.
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(
                    MIN_WINDOW_WIDTH,
                    MIN_WINDOW_HEIGHT,
                )));

                // El tamaño guardado ya no se usa para arrancar la ventana
                // (siempre arranca maximizada) — queda solo como el tamaño al
                // que vuelve si el usuario la desmaximiza más adelante.
                let _ = window.set_size(tauri::LogicalSize::new(
                    (cfg.window_bounds.width as f64).max(MIN_WINDOW_WIDTH),
                    (cfg.window_bounds.height as f64).max(MIN_WINDOW_HEIGHT),
                ));
                let _ = window.maximize();

                // Si Windows nos lanzó al iniciar sesión, nos quedamos en la
                // bandeja; si el usuario abrió la app a mano, mostramos la
                // ventana como siempre.
                let started_by_autostart = std::env::args().any(|a| a == AUTOSTART_ARG);
                if !started_by_autostart {
                    let _ = window.show();
                }

                let handle_for_resize = handle.clone();
                let maximize_lock: MaximizeLock = app.state::<MaximizeLock>().inner().clone();
                window.on_window_event(move |event| {
                    // La X (o Alt+F4) no cierra la app: oculta la ventana y
                    // deja todo corriendo en segundo plano (captura, autosave
                    // del chatlog, etc.). Para salir de verdad: menú de la
                    // bandeja → Salir.
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(win) = handle_for_resize.get_webview_window("main") {
                            let _ = win.hide();
                        }
                        return;
                    }

                    if let WindowEvent::Resized(_) = event {
                        if let Some(win) = handle_for_resize.get_webview_window("main") {
                            let is_maxed = win.is_maximized().unwrap_or(false);

                            // Si el editor de capturas activó el lock y el
                            // usuario logró desmaximizar igual (doble click
                            // en la barra, arrastrarla hacia abajo, atajo de
                            // teclado, etc.), la volvemos a maximizar al toque.
                            if !is_maxed && maximize_lock.load(Ordering::SeqCst) {
                                let _ = win.maximize();
                                return;
                            }

                            // Mientras está maximizada, el tamaño reportado es
                            // el de toda la pantalla — no lo guardamos como
                            // "tamaño restaurado", si no la próxima apertura
                            // desmaximizada quedaría del tamaño del monitor.
                            if is_maxed {
                                return;
                            }
                            if let Ok(size) = win.inner_size() {
                                if let Ok(scale) = win.scale_factor() {
                                    let logical = size.to_logical::<u32>(scale);
                                    let mut cfg = config::load_config(&handle_for_resize);
                                    cfg.window_bounds = config::WindowBounds {
                                        width: logical.width,
                                        height: logical.height,
                                    };
                                    config::save_config(&handle_for_resize, &cfg);
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error corriendo 213 Assistant");
}

/// El frontend llama a esto una sola vez, apenas registró sus listeners de
/// capture:state / capture:debug / capture:lines — recién ahí arrancamos el
/// motor de captura, para no perder los primeros eventos (igual que el
/// `did-finish-load` del main.js original).
#[tauri::command]
fn frontend_ready(app: tauri::AppHandle, mgr: tauri::State<'_, Arc<CaptureManager>>) {
    capture::start(app, mgr.inner().clone());
}