/**
 * generate-latest-json.js
 *
 * Arma el `latest.json` que necesita el updater de Tauri, a partir de lo
 * que ya dejó generado `tauri build` (instalador + archivo .sig) en
 * src-tauri/target/release/bundle/.
 *
 * `tauri build` (corrido a mano, sin GitHub Actions) NO genera este
 * archivo solo — solo genera los instaladores (.msi / .exe) y sus firmas
 * (.msi.sig / .exe.sig) sueltas. Este script arma el .json a partir de eso.
 *
 * Uso (desde la raíz del proyecto, DESPUÉS de compilar firmado):
 *   node generate-latest-json.js
 *
 * Con notas de la versión personalizadas:
 *   node generate-latest-json.js "Arreglos varios y sistema de capas para imágenes"
 *
 * Requisito: haber corrido antes
 *   set TAURI_SIGNING_PRIVATE_KEY=C:\Users\cesar\.tauri\signal-log.key
 *   npm run build
 * así ya existen los .sig junto a los instaladores.
 */

const fs = require("fs");
const path = require("path");

// ---------- CONFIG ----------
// Repo de GitHub donde se publican los Releases (owner/repo)
const GITHUB_REPO = "imczars-exe/213assistant";

// Cuál instalador de Windows usar para el updater: "msi" o "nsis"
// (el updater de Tauri solo admite UNA url por plataforma "windows-x86_64")
const WINDOWS_TARGET = "msi";
// -----------------------------

const projectRoot = __dirname;
const tauriConfPath = path.join(
  projectRoot,
  "src-tauri",
  "tauri.conf.json"
);
const bundleDir = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "release",
  "bundle"
);

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

// 1) Leer versión desde tauri.conf.json
if (!fs.existsSync(tauriConfPath)) {
  fail(`No encontré ${tauriConfPath}. ¿Estás corriendo esto desde la raíz del proyecto?`);
}
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
const version = tauriConf.version || (tauriConf.package && tauriConf.package.version);
if (!version) {
  fail("No pude encontrar \"version\" en tauri.conf.json.");
}

// 2) Buscar el instalador y su .sig según WINDOWS_TARGET
function findInstaller(target, version) {
  const dir = path.join(bundleDir, target);
  if (!fs.existsSync(dir)) {
    fail(`No existe la carpeta ${dir}. ¿Corriste "npm run build" con la firma puesta?`);
  }
  const ext = target === "msi" ? ".msi" : ".exe";
  const files = fs.readdirSync(dir).filter(
    (f) => f.endsWith(ext) && !f.endsWith(".sig")
  );
  if (files.length === 0) {
    fail(`No encontré ningún ${ext} en ${dir}.`);
  }

  // Tauri no borra los instaladores de builds anteriores: si quedó un .msi
  // de una versión vieja al lado del nuevo, hay que quedarse con el que
  // coincide con la versión actual de tauri.conf.json, no con "el primero
  // que aparezca" (eso fue justo lo que causó el mezclado 1.0.1/1.0.0).
  const matching = files.filter((f) => f.includes(`_${version}_`) || f.includes(`_${version}-`));
  let installerName;
  if (matching.length === 1) {
    installerName = matching[0];
  } else if (matching.length > 1) {
    console.warn(`⚠ Hay más de un ${ext} que coincide con la versión ${version}, uso el primero: ${matching[0]}`);
    installerName = matching[0];
  } else {
    fail(
      `Encontré ${files.length} archivo(s) ${ext} en ${dir}, pero ninguno coincide con la versión ${version} ` +
      `(archivos presentes: ${files.join(", ")}). ` +
      `Seguramente son de un build anterior — borralos de esa carpeta y volvé a compilar.`
    );
  }

  const sigPath = path.join(dir, installerName + ".sig");
  if (!fs.existsSync(sigPath)) {
    fail(
      `No encontré la firma ${sigPath}. ¿Compilaste con TAURI_SIGNING_PRIVATE_KEY puesto?`
    );
  }
  const signature = fs.readFileSync(sigPath, "utf8").trim();
  return { installerName, signature };
}

const { installerName, signature } = findInstaller(WINDOWS_TARGET, version);

// GitHub renombra los assets de un Release que tienen espacios en el
// nombre, reemplazando cada espacio por un punto (además de otros
// caracteres especiales, pero guiones y guiones bajos los deja igual).
// Si no hacemos este mismo reemplazo acá, la URL del latest.json termina
// apuntando a un archivo que no existe en GitHub y la descarga se queda
// trabada en 0% para siempre.
const githubInstallerName = installerName.replace(/ /g, ".");

// 3) Notas de la versión (opcional, por argumento de línea de comandos)
const notes = process.argv[2] || `Actualización a la versión ${version}`;

// 4) Armar el objeto latest.json
const latest = {
  version: version.startsWith("v") ? version : `v${version}`,
  notes: notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: signature,
      url: `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${githubInstallerName}`,
    },
  },
};

// 5) Escribir latest.json al lado de las carpetas msi/ y nsis/
const outPath = path.join(bundleDir, "latest.json");
fs.writeFileSync(outPath, JSON.stringify(latest, null, 2), "utf8");

console.log("✓ latest.json generado en:");
console.log("  " + outPath);
console.log("");
console.log("Para este Release subí a GitHub (tal cual, sin renombrar nada):");
console.log(`  - ${path.join(bundleDir, WINDOWS_TARGET, installerName)}`);
console.log(`  - ${outPath}`);
console.log("");
if (githubInstallerName !== installerName) {
  console.log(
    `Nota: GitHub va a renombrarlo solo a "${githubInstallerName}" al subirlo (reemplaza espacios por puntos). Ya está contemplado en la URL del latest.json, no hace falta que hagas nada por eso.`
  );
  console.log("");
}
console.log(`Recordá crear el Release con el tag: v${version}`);