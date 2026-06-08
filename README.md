# SitLess

Windows desktop sedentary reminder app.

## Development

Install dependencies:

```powershell
npm install
```

Preview the React renderer:

```powershell
npm run dev:renderer
```

Run the Electron desktop app against the built renderer:

```powershell
npm start
```

For Electron dev with Vite, run these in two terminals:

```powershell
npm run dev:renderer
npm run dev:electron
```

## Verification

```powershell
npm test
npm run build
```

## Packaging

```powershell
npm run dist
```
