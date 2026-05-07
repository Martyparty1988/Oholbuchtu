# Pubic AR Studio

Soukromá mobilní AR aplikace pro rychlé porovnání různých šablon ochlupení pomocí kamery, TensorFlow.js a detekce pózy. Aplikace běží v prohlížeči, je optimalizovaná pro telefon a data z kamery nikam neodesílá.

## ✨ Vlastnosti

- 🎯 Real-time detekce pózy pomocí MoveNet
- 🎨 Šablony: Full, Brazilian, Landing Strip, Triangle, Heart, Lightning a Star
- 📱 Mobilní rozhraní s podporou iPhone safe-area a PWA režimu
- 🔒 Kamera se spouští ručně až po klepnutí uživatele
- 🔁 Přepnutí přední/zadní kamery
- 🪞 Volitelné zrcadlení selfie náhledu
- 🌙 Automatický dark mode podle systému
- 📦 GitHub Pages deployment přes GitHub Actions
- ⚡ Service Worker pro rychlejší opakované načtení

## 🚀 Technologie

- **Vite** – moderní build tool
- **TensorFlow.js** – ML přímo v prohlížeči
- **@tensorflow-models/pose-detection** – detekce pózy přes MoveNet
- **Service Worker** – PWA cache a offline fallback
- **ES Modules** – čistý moderní JavaScript bez frameworku

## 💻 Lokální vývoj

```bash
npm install
npm run dev
npm run build
npm run preview
```

## 🌐 Deployment

Repo je připravené pro GitHub Pages. Build se spustí automaticky po pushnutí do větve `main` přes GitHub Actions.

Workflow umí použít `npm ci`, když existuje `package-lock.json`. Pokud lockfile v repozitáři není, použije bezpečný fallback přes `npm install --no-audit --no-fund`, aby deployment nespadl jen kvůli chybějícímu lockfile.

## 📋 Požadavky

- Node.js 18+
- Moderní mobilní nebo desktopový prohlížeč s podporou:
  - kamery přes WebRTC
  - WebGL pro TensorFlow.js
  - Service Worker pro PWA

## 🔒 Soukromí

Aplikace:

- nespouští kameru automaticky
- neukládá fotky ani video
- neodesílá obraz na žádný server
- zpracovává detekci pózy lokálně v zařízení
- zastaví kameru při zavření nebo skrytí stránky

## 🛠️ Struktura projektu

```text
Oholbuchtu/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── public/
│   ├── icon.svg
│   ├── manifest.json
│   └── sw.js
├── src/
│   ├── main.js
│   └── styles.css
├── index.html
├── vite.config.js
└── package.json
```

## 📝 Licence

MIT
