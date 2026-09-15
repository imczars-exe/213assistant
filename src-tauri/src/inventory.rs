use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

// ---------------- configuración de conexión (fija, compilada en la app) ----------------
//
// ⚠️ COMPLETAR ANTES DE COMPILAR: reemplazar estos dos valores con los del
// proyecto de Supabase (Project Settings → API Keys).
//
// IMPORTANTE — usar la clave "publishable" (empieza con "sb_publishable_"),
// NUNCA la "secret" (empieza con "sb_secret_"). La publishable está pensada
// para viajar dentro de una app de escritorio: por sí sola no puede leer ni
// escribir nada, porque las tablas están cerradas (RLS) y todo pasa por las
// funciones de supabase_seguridad.sql, que exigen la contraseña del
// inventario en cada llamada. La "secret" sí puede saltarse todo eso — si
// se compila dentro de la app, cualquiera que abra el instalador con
// `strings` la puede leer y tiene acceso total a la base.
const SUPABASE_URL: &str = "https://whtkggohcnlgfspcxnxd.supabase.co";
const SUPABASE_ANON_KEY: &str = "sb_publishable_yy1BiSJ3HqPiWKgqwFhDGg_vv8jriQr";

struct SupabaseConfig {
    url: &'static str,
    anon_key: &'static str,
}

impl SupabaseConfig {
    fn is_configured(&self) -> bool {
        !self.url.trim().is_empty()
            && !self.anon_key.trim().is_empty()
            && !self.url.contains("TU-PROYECTO")
            && !self.anon_key.contains("TU-CLAVE-PUBLICA")
    }

    fn rpc_url(&self, fn_name: &str) -> String {
        format!("{}/rest/v1/rpc/{}", self.url.trim_end_matches('/'), fn_name)
    }
}

fn supabase_config() -> SupabaseConfig {
    SupabaseConfig { url: SUPABASE_URL, anon_key: SUPABASE_ANON_KEY }
}

// ---------------- modelos ----------------

/// Un producto del inventario. `image` es un data URL
/// (`data:image/png;base64,...`), igual al que ya devuelve `image_open` en
/// commands.rs.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub purchase_price: f64,
    #[serde(default)]
    pub sale_price: f64,
    #[serde(default)]
    pub quantity: i64,
    #[serde(default)]
    pub product_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OrderItem {
    pub product_id: String,
    #[serde(default)]
    pub product_name: String,
    #[serde(default)]
    pub quantity: i64,
    #[serde(default)]
    pub unit_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub items: Vec<OrderItem>,
    #[serde(default)]
    pub total: f64,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InventoryData {
    #[serde(default)]
    pub products: Vec<Product>,
    #[serde(default)]
    pub orders: Vec<Order>,
    #[serde(default)]
    pub cash_movements: Vec<CashMovement>,
}

/// Un movimiento de caja: ingreso o salida. `kind` es "income" o "expense".
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CashMovement {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub amount: f64,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub order_id: Option<String>,
}

/// Un decremento de stock a aplicar como parte de confirmar un pedido.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAdjustment {
    pub product_id: String,
    pub new_quantity: i64,
}

// ---------------- cliente HTTP a Supabase (PostgREST / RPC) ----------------

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default()
}

fn auth_headers(cfg: &SupabaseConfig) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
    let mut headers = HeaderMap::new();
    if let Ok(v) = HeaderValue::from_str(&cfg.anon_key) {
        headers.insert("apikey", v);
    }
    if let Ok(v) = HeaderValue::from_str(&format!("Bearer {}", cfg.anon_key)) {
        headers.insert(AUTHORIZATION, v);
    }
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers
}

fn not_configured_error() -> Value {
    json!({
        "ok": false,
        "error": "not_configured",
        "message": "Falta completar SUPABASE_URL / SUPABASE_ANON_KEY en inventory.rs antes de compilar."
    })
}

/// Llama a una función RPC de Postgres (definida en supabase_seguridad.sql).
/// Todas exigen `p_password` en el body — si la app_settings no tiene esa
/// contraseña o no coincide, Postgres devuelve un error "unauthorized" que
/// mapeamos a un mensaje entendible para el frontend.
async fn rpc_call(cfg: &SupabaseConfig, fn_name: &str, body: Value) -> Result<Value, Value> {
    let c = client();
    let result = c
        .post(cfg.rpc_url(fn_name))
        .headers(auth_headers(cfg))
        .json(&body)
        .send()
        .await;

    match result {
        Ok(resp) if resp.status().is_success() => {
            Ok(resp.json().await.unwrap_or(Value::Null))
        }
        Ok(resp) => {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if text.contains("unauthorized") {
                Err(json!({
                    "ok": false,
                    "error": "unauthorized",
                    "message": "Contraseña incorrecta o sesión vencida — volvé a iniciar sesión."
                }))
            } else {
                Err(json!({ "ok": false, "error": "http", "message": format!("Supabase respondió {status}: {text}") }))
            }
        }
        Err(e) => Err(json!({ "ok": false, "error": "network", "message": e.to_string() })),
    }
}

// ---------------- login ----------------

/// Valida la contraseña compartida llamando a `inventory_login` (que la
/// compara con el hash guardado en `app_settings`, del lado del servidor).
pub async fn check_password(password: &str) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    match rpc_call(&cfg, "inventory_login", json!({ "p_password": password })).await {
        Ok(v) => {
            let authorized = v.as_bool().unwrap_or(false);
            json!({ "ok": true, "authorized": authorized })
        }
        Err(e) => e,
    }
}

// ---------------- lectura ----------------

fn product_from_row(v: &Value) -> Product {
    Product {
        id: v.get("id").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        name: v.get("name").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        image: v.get("image").and_then(|x| x.as_str()).map(|s| s.to_string()),
        purchase_price: v.get("purchase_price").and_then(|x| x.as_f64()).unwrap_or(0.0),
        sale_price: v.get("sale_price").and_then(|x| x.as_f64()).unwrap_or(0.0),
        quantity: v.get("quantity").and_then(|x| x.as_i64()).unwrap_or(0),
        product_type: v.get("product_type").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
    }
}

fn order_from_row(v: &Value) -> Order {
    let items = v
        .get("items")
        .cloned()
        .and_then(|it| serde_json::from_value::<Vec<OrderItem>>(it).ok())
        .unwrap_or_default();
    Order {
        id: v.get("id").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        created_at: v.get("created_at").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        items,
        total: v.get("total").and_then(|x| x.as_f64()).unwrap_or(0.0),
        note: v.get("note").and_then(|x| x.as_str()).map(|s| s.to_string()),
    }
}

fn cash_movement_from_row(v: &Value) -> CashMovement {
    CashMovement {
        id: v.get("id").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        created_at: v.get("created_at").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        kind: v.get("kind").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        amount: v.get("amount").and_then(|x| x.as_f64()).unwrap_or(0.0),
        description: v.get("description").and_then(|x| x.as_str()).unwrap_or_default().to_string(),
        order_id: v.get("order_id").and_then(|x| x.as_str()).map(|s| s.to_string()),
    }
}

/// Trae productos + pedidos + caja actuales desde Supabase, vía la función
/// `inventory_get` (exige la contraseña de la sesión).
pub async fn fetch_inventory(password: &str) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    match rpc_call(&cfg, "inventory_get", json!({ "p_password": password })).await {
        Ok(data) => {
            let products_raw: Vec<Value> = data.get("products").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let orders_raw: Vec<Value> = data.get("orders").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let cash_raw: Vec<Value> = data.get("cashMovements").and_then(|v| v.as_array()).cloned().unwrap_or_default();

            let products: Vec<Product> = products_raw.iter().map(product_from_row).collect();
            let orders: Vec<Order> = orders_raw.iter().map(order_from_row).collect();
            let cash_movements: Vec<CashMovement> = cash_raw.iter().map(cash_movement_from_row).collect();

            json!({ "ok": true, "products": products, "orders": orders, "cashMovements": cash_movements })
        }
        Err(e) => e,
    }
}

// ---------------- escritura ----------------

/// Crea o actualiza un producto, vía `inventory_product_save`.
pub async fn upsert_product(password: &str, product: &Product) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    let p_product = json!({
        "id": product.id,
        "name": product.name,
        "image": product.image,
        "purchase_price": product.purchase_price,
        "sale_price": product.sale_price,
        "quantity": product.quantity,
        "product_type": product.product_type,
    });
    match rpc_call(&cfg, "inventory_product_save", json!({ "p_password": password, "p_product": p_product })).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => e,
    }
}

pub async fn delete_product(password: &str, id: &str) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    match rpc_call(&cfg, "inventory_product_delete", json!({ "p_password": password, "p_id": id })).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => e,
    }
}

/// Alta manual de un movimiento de caja, vía `inventory_cash_add`.
pub async fn add_manual_cash_movement(password: &str, movement: &CashMovement) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    let p_movement = json!({
        "id": movement.id,
        "created_at": movement.created_at,
        "kind": movement.kind,
        "amount": movement.amount,
        "description": movement.description,
        "order_id": movement.order_id,
    });
    match rpc_call(&cfg, "inventory_cash_add", json!({ "p_password": password, "p_movement": p_movement })).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => e,
    }
}

pub async fn delete_cash_movement(password: &str, id: &str) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    match rpc_call(&cfg, "inventory_cash_delete", json!({ "p_password": password, "p_id": id })).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => e,
    }
}

/// Confirma un pedido: descuenta stock + guarda el pedido + registra el
/// ingreso en caja, todo en una sola llamada atómica a `inventory_order_confirm`
/// (si algo falla del lado de la base, no queda nada a medias).
pub async fn confirm_order(password: &str, order: &Order, adjustments: &[StockAdjustment]) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    let p_order = json!({
        "id": order.id,
        "created_at": order.created_at,
        "items": order.items,
        "total": order.total,
        "note": order.note,
    });
    let p_adjustments: Vec<Value> = adjustments
        .iter()
        .map(|a| json!({ "product_id": a.product_id, "new_quantity": a.new_quantity }))
        .collect();

    match rpc_call(
        &cfg,
        "inventory_order_confirm",
        json!({ "p_password": password, "p_order": p_order, "p_adjustments": p_adjustments }),
    )
    .await
    {
        Ok(data) => {
            let cash_movement: Option<CashMovement> = data
                .get("cashMovement")
                .cloned()
                .and_then(|v| serde_json::from_value(v).ok());
            json!({ "ok": true, "cashMovement": cash_movement })
        }
        Err(e) => e,
    }
}

/// Borra un pedido del historial (y el movimiento de caja que generó, si
/// existe), vía `inventory_order_delete`.
pub async fn delete_order(password: &str, id: &str) -> Value {
    let cfg = supabase_config();
    if !cfg.is_configured() {
        return not_configured_error();
    }
    match rpc_call(&cfg, "inventory_order_delete", json!({ "p_password": password, "p_id": id })).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => e,
    }
}

// ---------------- keepalive ----------------

/// Ping liviano contra Supabase, solo para que el proyecto no se pause por
/// inactividad en el plan gratuito. Llama a `inventory_login` con una
/// contraseña vacía (siempre da `false`, no importa el resultado) — cuenta
/// como actividad igual y no necesita acceso a ninguna tabla.
async fn ping_once(cfg: &SupabaseConfig) {
    if !cfg.is_configured() {
        return;
    }
    let _ = rpc_call(cfg, "inventory_login", json!({ "p_password": "" })).await;
}

/// Cada cuánto se manda el ping de actividad.
const PING_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

/// Arranca el hilo de fondo que pinguea Supabase periódicamente.
pub fn spawn_keepalive() {
    tauri::async_runtime::spawn(async move {
        let cfg = supabase_config();
        loop {
            ping_once(&cfg).await;
            tokio::time::sleep(PING_INTERVAL).await;
        }
    });
}
