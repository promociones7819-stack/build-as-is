# Build As Is

crea esta app tal cual esta

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aabf4838-169f-414c-b301-a6abf7ad0342).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Aplicación para macOS

GitHub Actions genera dos instaladores en formato DMG:

- `Bilbobus-mac-arm64.dmg`: Mac con chip Apple (M1, M2, M3, M4 o posterior).
- `Bilbobus-mac-x64.dmg`: Mac con procesador Intel.

Abre la pestaña **Actions**, entra en **Crear aplicación para Mac** y pulsa
**Run workflow**. Al terminar, descarga el artefacto correspondiente y arrastra
`Bilbobus.app` a la carpeta `Applications` incluida en el DMG.

El instalador se firma localmente durante la compilación, pero no se notariza
con una cuenta Apple Developer. Si macOS bloquea la primera apertura, haz clic
derecho sobre Bilbobus en Aplicaciones y elige **Abrir**. Si muestra que la app
está dañada, ejecuta una sola vez:

```sh
xattr -dr com.apple.quarantine /Applications/Bilbobus.app
```

La aplicación y el generador de informes PDF funcionan sin conexión. Los datos
se guardan localmente en el perfil de la aplicación del Mac.
