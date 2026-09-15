//! Motor de captura del chat de FiveM, puerteado 1:1 desde
//! `src/fivemChatCapture.js` (versión Electron/Node) a Rust + tokio.
//!
//! Técnica (sin cambios respecto al original):
//!  1. FiveM expone un puerto de debugging de Chromium (CEF) en localhost:13172.
//!  2. GET http://127.0.0.1:13172/json da la lista de "targets" de Chromium.
//!  3. Nos conectamos por WebSocket a ese debugger (protocolo CDP estándar):
//!     Page.getFrameTree, Page.createIsolatedWorld, Runtime.evaluate.
//!  4. Ubicamos el frame del recurso "chat" (cfx-nui-client / cfx-nui-chat) y
//!     leemos el DOM: document.querySelectorAll('.chat__messages > li').
//!  5. Cada 500ms comparamos contra lo último visto y emitimos solo las
//!     líneas nuevas.
//!
//!     La comparación es por CONTENIDO ya visto (contra el snapshot del
//!     poll anterior, ver `DedupState`), no por posición: GTAW re-renderiza el
//!     timestamp `[hh:mm:ss]` de cada línea visible en cada actualización
//!     del DOM, así que ese prefijo no es estable entre polls aunque el
//!     mensaje sea el mismo de siempre. Comparar arrays posición-contra-
//!     posición (el `find_overlap_and_diff` original) se rompe apenas eso
//!     pasa: ninguna línea vieja vuelve a matchear con la nueva lectura y
//!     el motor trata todo el chat visible como "nuevo" en cada sondeo.
//!     Por eso primero se ignora el timestamp (`strip_timestamp_prefix`) y
//!     luego se compara contra lo que ya marcamos como visto.
//!
//!     Ese estado (`DedupState`) vive en `run_capture_loop`, NO dentro de
//!     `connect_and_capture`: la conexión CDP se puede caer y reconectar
//!     varias veces dentro de una misma sesión de captura (Start/Stop), y
//!     si la memoria de deduplicación viviera adentro de cada conexión, se
//!     reiniciaría vacía en cada reconexión — volviendo a duplicar todo lo
//!     que sigue visible en el chat cada vez que eso pasa.
//!
//! No es OCR, no es lectura de memoria del proceso, no es inyección de DLL.

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex};
use tokio_tungstenite::tungstenite::Message;

use crate::config;

const CDP_JSON_URL: &str = "http://127.0.0.1:13172/json";
const ROOT_TARGET_URL: &str = "nui://game/ui/root.html";
const CHAT_FRAME_HINTS: [&str; 2] = ["cfx-nui-client", "cfx-nui-chat"];
const CHAT_SELECTOR: &str = ".chat__messages > li";

const POLL_INTERVAL_MS: u64 = 500;
const DETECT_INTERVAL_MS: u64 = 3000;
const RECONNECT_DELAY_MS: u64 = 2000;
const ATTACH_RETRY_MS: u64 = 1000;
const ATTACH_MAX_ATTEMPTS: u32 = 15;
const CDP_CALL_TIMEOUT_SECS: u64 = 10;

// Muchos chats de FiveM (GTAW incluido) restauran su propio historial local
// justo después de que la NUI termina de cargar — no aparece de una, tarda
// unos pocos cientos de ms a un par de segundos en poblarse. Si la siembra
// inicial (`DedupState::seed`, ver más abajo) se hace apenas se encuentra el
// frame, puede agarrar el chat todavía vacío o a medio poblar: todo lo que
// termina de aparecer después (que ya se había capturado en una corrida
// anterior de ESTA app) se toma como "nunca visto" y se duplica por completo.
// Por eso, antes de sembrar, esperamos a que dos lecturas consecutivas del
// chat den exactamente lo mismo (`wait_for_stable_chat`) — recién ahí se
// asume que terminó de restaurarse y es seguro marcarlo como "ya visto".
const SETTLE_POLL_MS: u64 = 400;
const SETTLE_MAX_POLLS: u32 = 10;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Estado compartido y controlado por comandos de Tauri (capture:start / capture:stop).
pub struct CaptureManager {
    /// Se incrementa en cada start()/stop(); cualquier tarea en vuelo de una
    /// generación anterior deja de operar apenas lo nota (reemplaza a los
    /// `clearTimeout`/`clearInterval` + `_stopped` del original en JS).
    generation: AtomicU64,
    state: Mutex<String>,
    session_started_at: Mutex<Option<i64>>,
}

impl CaptureManager {
    pub fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
            state: Mutex::new("idle".to_string()),
            session_started_at: Mutex::new(None),
        }
    }

    pub async fn get_state_snapshot(&self) -> (String, Option<i64>) {
        (self.state.lock().await.clone(), *self.session_started_at.lock().await)
    }

    fn current_generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    fn is_current(&self, gen: u64) -> bool {
        self.current_generation() == gen
    }
}

pub fn start(app: AppHandle, mgr: Arc<CaptureManager>) {
    let gen = mgr.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let mgr2 = mgr.clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        set_state(&app2, &mgr2, gen, "waiting_for_game", None).await;
        run_capture_loop(app2, mgr2, gen).await;
    });
}

pub fn stop(app: AppHandle, mgr: Arc<CaptureManager>) {
    // Invalida cualquier tarea en vuelo (equivalente a `_stopped = true` +
    // `clearTimeout`/`clearInterval` en el original).
    mgr.generation.fetch_add(1, Ordering::SeqCst);
    tauri::async_runtime::spawn(async move {
        *mgr.session_started_at.lock().await = None;
        *mgr.state.lock().await = "stopped".to_string();
        let _ = app.emit(
            "capture:state",
            json!({ "state": "stopped", "sessionStartedAt": Value::Null }),
        );
    });
}

async fn set_state(app: &AppHandle, mgr: &CaptureManager, gen: u64, state_name: &str, extra: Option<Value>) {
    if !mgr.is_current(gen) {
        return;
    }
    *mgr.state.lock().await = state_name.to_string();

    if state_name == "capturing" {
        let mut started = mgr.session_started_at.lock().await;
        if started.is_none() {
            *started = Some(now_ms());
        }
    }
    if state_name == "stopped" {
        *mgr.session_started_at.lock().await = None;
    }

    let session_started_at = *mgr.session_started_at.lock().await;

    let mut payload = json!({ "state": state_name, "sessionStartedAt": session_started_at });
    if let (Some(extra_obj), Some(payload_obj)) = (extra.as_ref().and_then(|v| v.as_object()), payload.as_object_mut()) {
        for (k, v) in extra_obj {
            payload_obj.insert(k.clone(), v.clone());
        }
    }
    let _ = app.emit("capture:state", payload);
}

async fn emit_debug(app: &AppHandle, mgr: &CaptureManager, gen: u64, msg: &str, extra: Option<Value>) {
    if !mgr.is_current(gen) {
        return;
    }
    let _ = app.emit(
        "capture:debug",
        json!({ "msg": msg, "extra": extra, "ts": now_ms() }),
    );
}

async fn emit_lines(app: &AppHandle, mgr: &CaptureManager, gen: u64, lines: &[String]) {
    if !mgr.is_current(gen) || lines.is_empty() {
        return;
    }
    let ts = now_ms();
    let entries: Vec<Value> = lines.iter().map(|t| json!({ "text": t, "ts": ts })).collect();
    for text in lines {
        config::append_autosave(app, text);
    }
    let _ = app.emit("capture:lines", entries);
}

/// Revisa si el proceso de FiveM está corriendo (usado solo como diagnóstico,
/// igual que en el original: nunca bloquea el intento directo al puerto CDP).
fn is_fivem_running() -> bool {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.processes()
        .values()
        .any(|p| p.name().to_string_lossy().to_lowercase().contains("fivem"))
}

async fn fetch_cdp_targets() -> Result<Vec<Value>, String> {
    let resp = reqwest::get(CDP_JSON_URL)
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("CDP endpoint respondió {}", resp.status()));
    }
    resp.json::<Vec<Value>>().await.map_err(|e| e.to_string())
}

/// Sesión CDP sobre un WebSocket: envío de comandos con resolución de
/// promesas por id (equivalente a la clase CdpSession del original).
struct CdpSession {
    write: Mutex<futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        Message,
    >>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: AtomicU64,
    closed: Arc<AtomicBool>,
}

impl CdpSession {
    async fn connect(url: &str) -> Result<Self, String> {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url)
            .await
            .map_err(|e| e.to_string())?;
        let (write, mut read) = ws_stream.split();
        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let closed = Arc::new(AtomicBool::new(false));

        let pending_reader = pending.clone();
        let closed_reader = closed.clone();
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(txt)) => {
                        if let Ok(parsed) = serde_json::from_str::<Value>(&txt) {
                            if let Some(id) = parsed.get("id").and_then(|v| v.as_u64()) {
                                if let Some(sender) = pending_reader.lock().await.remove(&id) {
                                    if let Some(err) = parsed.get("error") {
                                        let message = err
                                            .get("message")
                                            .and_then(|m| m.as_str())
                                            .unwrap_or("CDP error")
                                            .to_string();
                                        let _ = sender.send(Err(message));
                                    } else {
                                        let result = parsed.get("result").cloned().unwrap_or(Value::Null);
                                        let _ = sender.send(Ok(result));
                                    }
                                }
                            }
                            // Los eventos de protocolo (mensajes sin "id") no se
                            // usan en esta app, igual que en el original.
                        }
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }
            closed_reader.store(true, Ordering::SeqCst);
            // Cualquier llamada pendiente que quedó colgada se resuelve como error.
            let mut map = pending_reader.lock().await;
            for (_, sender) in map.drain() {
                let _ = sender.send(Err("conexión cerrada".to_string()));
            }
        });

        Ok(Self {
            write: Mutex::new(write),
            pending,
            next_id: AtomicU64::new(1),
            closed,
        })
    }

    fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }

    async fn send(&self, method: &str, params: Value) -> Result<Value, String> {
        if self.is_closed() {
            return Err("conexión cerrada".to_string());
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        let payload = json!({ "id": id, "method": method, "params": params });
        let text = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
        if let Err(e) = self.write.lock().await.send(Message::Text(text)).await {
            self.pending.lock().await.remove(&id);
            return Err(e.to_string());
        }

        match tokio::time::timeout(Duration::from_secs(CDP_CALL_TIMEOUT_SECS), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("canal de respuesta CDP cerrado".to_string()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err("timeout esperando respuesta CDP".to_string())
            }
        }
    }

    async fn close(&self) {
        let _ = self.write.lock().await.close().await;
    }
}

/// Recorre recursivamente el frame tree (Page.getFrameTree) buscando el
/// primer frame cuya URL contenga `hint`. Trabaja directamente sobre el
/// `serde_json::Value` para no tener que declarar structs para todo el árbol.
fn find_frame_by_url_hint<'a>(frame_tree: &'a Value, hint: &str) -> Option<&'a Value> {
    let frame = frame_tree.get("frame")?;
    if let Some(url) = frame.get("url").and_then(|u| u.as_str()) {
        if url.contains(hint) {
            return Some(frame);
        }
    }
    if let Some(children) = frame_tree.get("childFrames").and_then(|c| c.as_array()) {
        for child in children {
            if let Some(found) = find_frame_by_url_hint(child, hint) {
                return Some(found);
            }
        }
    }
    None
}

fn find_frame_by_any_hint<'a>(frame_tree: &'a Value, hints: &[&str]) -> Option<&'a Value> {
    hints.iter().find_map(|hint| find_frame_by_url_hint(frame_tree, hint))
}

fn collect_frame_urls(frame_tree: &Value, acc: &mut Vec<String>) {
    if let Some(url) = frame_tree.get("frame").and_then(|f| f.get("url")).and_then(|u| u.as_str()) {
        acc.push(url.to_string());
    }
    if let Some(children) = frame_tree.get("childFrames").and_then(|c| c.as_array()) {
        for child in children {
            collect_frame_urls(child, acc);
        }
    }
}

/// Si la línea empieza con un prefijo `[algo]` que parece un timestamp
/// (solo dígitos y `:`, ej. `[14:32:07]`), lo quita y devuelve el resto
/// ya recortado. GTAW re-renderiza ese prefijo en cada actualización del
/// DOM — no es estable entre polls aunque el mensaje sea el mismo — así
/// que hay que ignorarlo al comparar contenido para detectar duplicados.
/// Si no hay un prefijo con esa forma, devuelve la línea tal cual.
fn strip_timestamp_prefix(line: &str) -> &str {
    if !line.starts_with('[') {
        return line;
    }
    if let Some(close) = line.find(']') {
        let inner = &line[1..close];
        let looks_like_timestamp =
            !inner.is_empty() && inner.len() <= 12 && inner.chars().all(|c| c.is_ascii_digit() || c == ':');
        if looks_like_timestamp {
            return line[close + 1..].trim_start();
        }
    }
    line
}

fn normalize_line(line: &str) -> String {
    strip_timestamp_prefix(line).to_string()
}

/// Memoria de líneas ya vistas, por contenido normalizado (sin timestamp),
/// como un conteo por clave — no un simple set — para no romperse con
/// mensajes legítimamente repetidos (dos jugadores escribiendo lo mismo,
/// alguien mandando el mismo `/ooc test` dos veces).
///
/// A propósito esto NO es una ventana de tamaño fijo tipo FIFO (como en una
/// versión anterior, que evictaba entradas una vez acumuladas `DEDUP_WINDOW`
/// inserciones en total). Ese diseño se rompía apenas el chat visible tenía,
/// en un momento dado, más líneas que el tamaño de esa ventana — algo nada
/// raro en sesiones de rol largas, donde `.chat__messages` puede acumular
/// bastante más que las ~50-100 líneas "típicas" — porque entonces la
/// ventana empezaba a olvidar líneas que SEGUÍAN visibles en pantalla, y el
/// motor las volvía a tratar como nuevas en el siguiente poll.
///
/// Tampoco es (ya no) "reemplazar todo por el snapshot exacto del poll
/// anterior": muchos chats de FiveM (GTAW incluido) vacían su DOM y
/// repueblan su propio historial local a mitad de sesión — cambio de
/// personaje, respawn, entrar/salir de un interior, reconectar al mismo
/// frame sin que se corte la sesión CDP — no solo al arrancar el programa.
/// Si la memoria fuera nada más "lo que había en el poll anterior", ese
/// vaciado momentáneo la hace caer a casi nada, y cada línea que reaparece
/// mientras se repuebla el historial (que ya habíamos capturado antes)
/// vuelve a parecer "nueva" — eso es lo que generaba bloques enteros
/// repitiéndose en trozos cada vez más grandes.
///
/// Por eso una clave que deja de verse no se olvida de inmediato: se le da
/// un margen (`FORGET_AFTER_MISSING_POLLS` polls seguidos ausente, varios
/// segundos) antes de darla por "olvidada de verdad". Eso alcanza de sobra
/// para cubrir cualquier vaciado/repoblado (se estabilizan en unos pocos
/// segundos, ver `SETTLE_MAX_POLLS`), sin perder la capacidad de recapturar
/// un mensaje genuinamente repetido mucho más tarde, una vez que de verdad
/// se fue de pantalla por un buen rato.
const FORGET_AFTER_MISSING_POLLS: u32 = 20; // ~10s a POLL_INTERVAL_MS=500

#[derive(Default)]
struct DedupState {
    counts: HashMap<String, usize>,
    missing_polls: HashMap<String, u32>,
}

impl DedupState {
    fn count_map(lines: &[String]) -> HashMap<String, usize> {
        let mut counts = HashMap::with_capacity(lines.len());
        for line in lines {
            *counts.entry(normalize_line(line)).or_insert(0) += 1;
        }
        counts
    }

    /// Primera lectura de toda la sesión de captura: registra lo que ya
    /// está visible sin tratarlo como "nuevo" (ver el flag `seeded` en
    /// `connect_and_capture`).
    pub fn seed(&mut self, current: &[String]) {
        self.counts = Self::count_map(current);
        self.missing_polls = self.counts.keys().map(|k| (k.clone(), 0)).collect();
    }

    /// Compara el chat visible de este poll contra la memoria acumulada.
    /// Dentro de este mismo poll, cada aparición de un mismo contenido
    /// normalizado se numera (1ra, 2da, ...); es "nueva" toda aparición
    /// cuyo número supere cuántas veces ese mismo contenido ya estaba
    /// contado. Así una línea que sigue en pantalla no se duplica, pero dos
    /// mensajes reales con el mismo texto se siguen distinguiendo bien.
    pub fn diff(&mut self, current: &[String]) -> Vec<String> {
        let mut new_lines = Vec::new();
        let mut seen_this_poll: HashMap<String, usize> = HashMap::with_capacity(current.len());

        for line in current {
            let key = normalize_line(line);
            let occurrence = seen_this_poll.entry(key.clone()).or_insert(0);
            *occurrence += 1;
            let previously_seen = self.counts.get(&key).copied().unwrap_or(0);
            if *occurrence > previously_seen {
                new_lines.push(line.clone());
            }
        }

        // Las claves vistas este poll quedan con su cuenta actual y su
        // contador de ausencia en cero. Las que ya estaban en memoria pero
        // no aparecieron ahora conservan su cuenta (para no perder el
        // "ya visto" ante un vaciado momentáneo) mientras no superen el
        // margen de polls ausente; pasado ese margen, se olvidan de verdad.
        let mut next_counts = HashMap::with_capacity(seen_this_poll.len().max(self.counts.len()));
        let mut next_missing = HashMap::with_capacity(next_counts.capacity());

        for (key, count) in &seen_this_poll {
            next_counts.insert(key.clone(), *count);
            next_missing.insert(key.clone(), 0);
        }
        for (key, count) in &self.counts {
            if seen_this_poll.contains_key(key) {
                continue;
            }
            let missing = self.missing_polls.get(key).copied().unwrap_or(0) + 1;
            if missing < FORGET_AFTER_MISSING_POLLS {
                next_counts.insert(key.clone(), *count);
                next_missing.insert(key.clone(), missing);
            }
        }

        self.counts = next_counts;
        self.missing_polls = next_missing;
        new_lines
    }
}

/// Espera a que el chat visible deje de cambiar entre lecturas consecutivas
/// (mismo contenido dos veces seguidas) antes de devolverlo, para no sembrar
/// `DedupState` con un chat que todavía está restaurando su historial local.
/// Si nunca se estabiliza, después de `SETTLE_MAX_POLLS` intentos se rinde y
/// devuelve la última lectura que consiguió — mejor sembrar con algo un poco
/// desactualizado que quedarse esperando para siempre si el chat de verdad
/// sigue cambiando (alguien escribiendo justo en ese momento).
async fn wait_for_stable_chat(
    app: &AppHandle,
    mgr: &Arc<CaptureManager>,
    gen: u64,
    session: &CdpSession,
    context_id: &Value,
) -> Result<Vec<String>, String> {
    let mut previous: Option<Vec<String>> = None;
    for _ in 0..SETTLE_MAX_POLLS {
        if !mgr.is_current(gen) {
            return Err("cancelado".to_string());
        }
        tokio::time::sleep(Duration::from_millis(SETTLE_POLL_MS)).await;
        if !mgr.is_current(gen) {
            return Err("cancelado".to_string());
        }
        let current = match read_chat_lines(session, context_id).await {
            Ok(Ok(lines)) => lines,
            Ok(Err(_)) => continue, // excepción transitoria del runtime, reintenta
            Err(e) => return Err(e),
        };
        if previous.as_ref() == Some(&current) {
            return Ok(current);
        }
        previous = Some(current);
    }
    emit_debug(
        app,
        mgr,
        gen,
        "El chat no terminó de estabilizarse, se siembra con la última lectura de todos modos",
        None,
    )
    .await;
    Ok(previous.unwrap_or_default())
}

/// Lee el estado actual del chat (`.chat__messages > li`) por CDP.
/// - `Err(_)`: el `send` falló (desconexión real, no un error transitorio).
/// - `Ok(Err(texto))`: `Runtime.evaluate` devolvió una excepción de JS;
///   se interpreta como "reintentar en el próximo poll".
/// - `Ok(Ok(lines))`: lectura exitosa.
/// Se usa tanto para la lectura de "siembra" inicial como para cada poll
/// normal, para no repetir la expresión JS ni el parseo del resultado.
async fn read_chat_lines(session: &CdpSession, context_id: &Value) -> Result<Result<Vec<String>, String>, String> {
    let expression = format!(
        "Array.from(document.querySelectorAll({selector}))\
           .map(el => el.innerText.trim())\
           .filter(Boolean)",
        selector = serde_json::to_string(CHAT_SELECTOR).unwrap()
    );

    let result = session
        .send(
            "Runtime.evaluate",
            json!({
                "expression": expression,
                "contextId": context_id,
                "returnByValue": true,
                "awaitPromise": false
            }),
        )
        .await?;

    if let Some(exception) = result.get("exceptionDetails") {
        let text = exception
            .get("text")
            .and_then(|t| t.as_str())
            .unwrap_or("Runtime.evaluate exception")
            .to_string();
        return Ok(Err(text));
    }

    let lines: Vec<String> = result
        .get("result")
        .and_then(|r| r.get("value"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(Ok(collapse_duplicated_read(lines)))
}

/// A veces una sola lectura del DOM trae el contenido completo repetido
/// dos veces seguidas de punta a punta — como si hubiera, por un instante,
/// dos contenedores `.chat__messages` superpuestos con las mismas líneas
/// (puede pasar durante alguna transición interna del chat de FiveM/GTAW,
/// tipo resize o reconstrucción del NUI). `DedupState` cuenta apariciones
/// DENTRO de cada lectura a propósito, para distinguir "dos jugadores
/// escribieron lo mismo a la vez" de "esto ya lo vi" — así que si una sola
/// lectura ya trae cada línea duplicada de entrada, la segunda copia le
/// parece un mensaje nuevo y termina duplicando el bloque entero una vez
/// en el chatlog. Acá se detecta ESE caso puntual (el arreglo entero
/// partido en dos mitades idénticas) y se colapsa a una sola copia antes
/// de que llegue a `DedupState` — sin tocar el caso legítimo de dos
/// mensajes iguales apareciendo en distintas posiciones reales del chat
/// (eso no forma dos mitades idénticas, así que no se toca).
fn collapse_duplicated_read(lines: Vec<String>) -> Vec<String> {
    let n = lines.len();
    if n >= 2 && n % 2 == 0 {
        let (first_half, second_half) = lines.split_at(n / 2);
        if first_half == second_half {
            return first_half.to_vec();
        }
    }
    lines
}

/// Bucle principal: detectar juego -> conectar -> capturar -> (si se corta)
/// volver a detectar. Reemplaza a `_detectLoop`/`_connectToGame`/`_handleDisconnect`.
async fn run_capture_loop(app: AppHandle, mgr: Arc<CaptureManager>, gen: u64) {
    // `dedup` y `seeded` viven ACÁ, no dentro de `connect_and_capture`, para
    // que sobrevivan a las reconexiones de CDP dentro de la misma sesión de
    // captura (Start/Stop). Si vivieran dentro de `connect_and_capture`,
    // cada reconexión creaba una `DedupState` nueva y vacía, y todo lo que
    // seguía visible en el chat se volvía a tratar como "nunca visto" —
    // duplicando por completo el chat cada vez que la conexión se cae y
    // se restablece (que puede ser cada pocos segundos si el juego cierra
    // o abre la NUI del chat seguido). Con el estado acá arriba, una
    // reconexión no reinicia la memoria de lo que ya se emitió.
    let mut dedup = DedupState::default();
    let mut seeded = false;

    loop {
        if !mgr.is_current(gen) {
            return;
        }

        let targets = fetch_cdp_targets().await.ok().filter(|t| !t.is_empty());
        match targets {
            None => {
                let running = is_fivem_running();
                emit_debug(
                    &app,
                    &mgr,
                    gen,
                    if running {
                        "FiveM detectado, esperando puerto CDP…"
                    } else {
                        "FiveM no detectado todavía"
                    },
                    None,
                )
                .await;
                tokio::time::sleep(Duration::from_millis(DETECT_INTERVAL_MS)).await;
                continue;
            }
            Some(targets) => {
                set_state(&app, &mgr, gen, "connecting", None).await;
                match connect_and_capture(&app, &mgr, gen, &targets, &mut dedup, &mut seeded).await {
                    Ok(()) => {
                        // Sesión CDP cerrada (juego cerrado o cambió de escena).
                        if !mgr.is_current(gen) {
                            return;
                        }
                        set_state(&app, &mgr, gen, "waiting_for_game", None).await;
                        emit_debug(
                            &app,
                            &mgr,
                            gen,
                            "Sesión CDP cerrada (juego cerrado o cambió de escena), reintentando…",
                            None,
                        )
                        .await;
                        tokio::time::sleep(Duration::from_millis(RECONNECT_DELAY_MS)).await;
                    }
                    Err(e) => {
                        emit_debug(&app, &mgr, gen, "Fallo conectando al juego", Some(json!({ "error": e }))).await;
                        set_state(&app, &mgr, gen, "error", Some(json!({ "error": e }))).await;
                        tokio::time::sleep(Duration::from_millis(RECONNECT_DELAY_MS)).await;
                    }
                }
            }
        }
    }
}

/// Conecta al target raíz, ubica el frame de chat y hace polling hasta que
/// la conexión se corte. `Ok(())` significa "se desconectó, reintentar desde
/// cero"; `Err(_)` significa "no se pudo establecer la conexión inicial".
async fn connect_and_capture(
    app: &AppHandle,
    mgr: &Arc<CaptureManager>,
    gen: u64,
    targets: &[Value],
    dedup: &mut DedupState,
    seeded: &mut bool,
) -> Result<(), String> {
    let root_target = targets
        .iter()
        .find(|t| t.get("url").and_then(|u| u.as_str()) == Some(ROOT_TARGET_URL))
        .or_else(|| targets.first())
        .ok_or("No se encontró ningún target CDP")?;

    let ws_url = root_target
        .get("webSocketDebuggerUrl")
        .and_then(|u| u.as_str())
        .ok_or("No se encontró target raíz con webSocketDebuggerUrl")?;

    let session = CdpSession::connect(ws_url).await?;
    session.send("Page.enable", json!({})).await?;

    set_state(app, mgr, gen, "connected_no_chat", None).await;

    let mut chat_frame: Option<Value> = None;
    let mut last_frame_urls: Vec<String> = vec![];

    for attempt in 1..=ATTACH_MAX_ATTEMPTS {
        if !mgr.is_current(gen) {
            session.close().await;
            return Ok(());
        }
        let frame_tree_result = session.send("Page.getFrameTree", json!({})).await?;
        let frame_tree = frame_tree_result.get("frameTree").cloned().unwrap_or(Value::Null);

        if let Some(found) = find_frame_by_any_hint(&frame_tree, &CHAT_FRAME_HINTS) {
            chat_frame = Some(found.clone());
            break;
        }

        last_frame_urls.clear();
        collect_frame_urls(&frame_tree, &mut last_frame_urls);
        emit_debug(
            app,
            mgr,
            gen,
            &format!("Frame de chat no encontrado todavía (intento {attempt}/{ATTACH_MAX_ATTEMPTS})"),
            Some(json!({ "buscando": CHAT_FRAME_HINTS, "framesDisponibles": last_frame_urls })),
        )
        .await;
        tokio::time::sleep(Duration::from_millis(ATTACH_RETRY_MS)).await;
    }

    let chat_frame = match chat_frame {
        Some(f) => f,
        None => {
            session.close().await;
            return Err(format!(
                "No se encontró el frame del chat tras {ATTACH_MAX_ATTEMPTS} intentos. Frames disponibles: {}",
                if last_frame_urls.is_empty() { "(ninguno)".to_string() } else { last_frame_urls.join(", ") }
            ));
        }
    };

    let frame_id = chat_frame
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Frame de chat sin id")?;

    let isolated = session
        .send(
            "Page.createIsolatedWorld",
            json!({ "frameId": frame_id, "worldName": "fivem-chat-capture", "grantUniveralAccess": true }),
        )
        .await?;
    let context_id = isolated
        .get("executionContextId")
        .cloned()
        .ok_or("No se pudo crear el mundo aislado")?;

    emit_debug(
        app,
        mgr,
        gen,
        "Frame de chat localizado, iniciando polling",
        Some(json!({ "frameUrl": chat_frame.get("url") })),
    )
    .await;

    // Solo pasa una vez por cada Start/Stop (ver `seeded` en `run_capture_loop`).
    // Se espera a que el chat se estabilice ANTES de sembrar, para no marcar
    // como "ya visto" un chat que todavía está restaurando su historial local
    // (ver comentario de `SETTLE_POLL_MS` más arriba) — esa es la causa más
    // probable de que el chatlog apareciera duplicado cada vez que se
    // reabría el programa.
    if !*seeded {
        if !mgr.is_current(gen) {
            session.close().await;
            return Ok(());
        }
        match wait_for_stable_chat(app, mgr, gen, &session, &context_id).await {
            Ok(lines) => {
                dedup.seed(&lines);
                *seeded = true;
            }
            Err(_) => {
                session.close().await;
                return Ok(());
            }
        }
    }

    set_state(app, mgr, gen, "capturing", None).await;

    loop {
        if !mgr.is_current(gen) {
            session.close().await;
            return Ok(());
        }
        if session.is_closed() {
            return Ok(());
        }

        tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        if !mgr.is_current(gen) {
            session.close().await;
            return Ok(());
        }

        let current_lines = match read_chat_lines(&session, &context_id).await {
            Ok(Ok(lines)) => lines,
            Ok(Err(text)) => {
                emit_debug(app, mgr, gen, "Error en poll, se reintenta", Some(json!({ "error": text }))).await;
                continue;
            }
            Err(_) => {
                // El send falla cuando la conexión se cerró: es una
                // desconexión real, no un error transitorio del runtime.
                return Ok(());
            }
        };

        // `seeded` ya es `true` acá siempre (se sembró más arriba, antes de
        // entrar a este loop, con el chat ya estabilizado). En reconexiones
        // posteriores dentro de la misma sesión de captura, `dedup` sigue
        // teniendo la memoria de la conexión anterior (vive en
        // `run_capture_loop`, no acá), así que se sigue directo a
        // `dedup.diff` sin volver a sembrar — eso es lo que evita el
        // re-dump al reconectar.
        let new_lines = dedup.diff(&current_lines);

        if !new_lines.is_empty() {
            emit_lines(app, mgr, gen, &new_lines).await;
        }
    }
}