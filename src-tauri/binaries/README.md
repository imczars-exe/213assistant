# Binarios sidecar (ffmpeg + gifski)

Esta carpeta tiene que tener, antes de compilar, los ejecutables reales de
ffmpeg y gifski con el sufijo del target de Rust en el nombre — es la
convención de Tauri para "sidecars" (`bundle.externalBin` en
`tauri.conf.json` ya apunta acá). No vienen incluidos en este repo: hay que
bajarlos una sola vez y dejarlos con este nombre exacto.

Como el bundle de este proyecto es solo Windows (`nsis`/`msi`), con esto
alcanza:

```
src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
src-tauri/binaries/gifski-x86_64-pc-windows-msvc.exe
```

Para saber el sufijo exacto de tu toolchain, corré `rustc -Vv` y fijate en
la línea `host:` (ej. `x86_64-pc-windows-msvc`).

## Dónde conseguirlos

- **ffmpeg**: build estático de Windows, ej. desde
  https://www.gyan.dev/ffmpeg/builds/ (`ffmpeg-release-essentials.zip`) —
  adentro del zip está `bin/ffmpeg.exe`. Solo hace falta ese archivo, no
  `ffplay.exe` ni `ffprobe.exe`.
- **gifski**: ejecutable de Windows desde los releases oficiales,
  https://github.com/ImageOptim/gifski/releases (el asset `.exe` o el
  `.zip` de Windows).

Renombralos y copialos a esta carpeta con los nombres de arriba. Con eso,
`tauri build` (o `tauri dev`) los empaqueta solos junto con el resto de la
app — no hace falta declarar nada más.

## Tamaño

Entre los dos suman unos 60-100 MB adicionales al instalador — es lo
esperable, gifski y sobre todo ffmpeg no son livianos.
