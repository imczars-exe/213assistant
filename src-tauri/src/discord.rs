//! Integración opcional con Discord Rich Presence: mientras la app está
//! abierta, le muestra a Discord la actividad fija "Haciendo relatos" (con
//! un contador de "hace X" desde que se abrió la app), al lado del nombre
//! de usuario.
//!
//! Si Discord no está instalado o no está corriendo en ese momento, esto
//! simplemente no hace nada: la conexión se reintenta cada cierto tiempo en
//! segundo plano, sin bloquear ni afectar al resto de la app.

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Application ID sacado del Developer Portal de Discord
/// (https://discord.com/developers/applications → tu app → General
/// Information → "Application ID"). Si en algún momento creás otra
/// aplicación de Discord para esto, solo hay que cambiar este número.
const DISCORD_CLIENT_ID: &str = "1547717846551761057";

/// Texto fijo que se muestra siempre como actividad.
const ACTIVITY_TEXT: &str = "Haciendo altos relatos";

/// Cada cuánto se (re)intenta poner/mantener la actividad — también hace de
/// reintento de conexión si Discord todavía no estaba abierto.
const RETRY_DELAY: Duration = Duration::from_secs(15);

fn build_activity(started_at_secs: i64) -> activity::Activity<'static> {
    activity::Activity::new()
        .details(ACTIVITY_TEXT)
        .assets(
            activity::Assets::new()
                .large_image("logo")
                .large_text("213 Assistant"),
        )
        .timestamps(activity::Timestamps::new().start(started_at_secs))
}

/// Arranca el hilo de fondo que mantiene la actividad puesta en Discord
/// mientras la app esté abierta. No bloquea ni devuelve nada para usar: si
/// Discord no está corriendo, la app sigue funcionando igual, sin ningún
/// error visible para el usuario. Llamar una sola vez, al arrancar.
pub fn spawn() {
    std::thread::spawn(move || {
        let started_at_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let mut client: Option<DiscordIpcClient> = None;

        loop {
            if client.is_none() {
                let mut c = DiscordIpcClient::new(DISCORD_CLIENT_ID);
                match c.connect() {
                    Ok(()) => match c.set_activity(build_activity(started_at_secs)) {
                        Ok(()) => {
                            eprintln!("[discord] actividad puesta OK");
                            client = Some(c);
                        }
                        Err(err) => {
                            eprintln!("[discord] connect() OK pero set_activity() falló: {err}");
                        }
                    },
                    Err(err) => {
                        eprintln!("[discord] connect() falló (¿Discord no está corriendo o el pipe no está disponible?): {err}");
                    }
                }
            } else if let Some(c) = client.as_mut() {
                // Ya conectado: re-mandar la misma actividad de vez en
                // cuando. Si falla es casi siempre porque Discord se cerró
                // en el medio — soltamos el cliente para reconectar de cero
                // en la próxima vuelta, en vez de quedar mandando a un pipe
                // muerto para siempre.
                if let Err(err) = c.set_activity(build_activity(started_at_secs)) {
                    eprintln!("[discord] se perdió la conexión, reintentando: {err}");
                    client = None;
                }
            }

            std::thread::sleep(RETRY_DELAY);
        }
    });
}