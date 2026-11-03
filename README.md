# SAMU BET v1.1 — Analisi Quantitativa Pronostici e Composizione Schedina

**SAMU BET** è una Progressive Web App (PWA) mobile-first in italiano che analizza quote di mercato, statistiche e notizie sportive (tramite feed RSS) per **Calcio, Formula 1 e Tennis**, consigliando singole selezioni e componendo la **miglior schedina** da giocare manualmente sull'app SNAI in base a:
1. **Quota totale desiderata** (`Q`, min `1.10`, fino a `3000.00`),
2. **Livello di rischio** (`R`, slider da `1` a `10`, più modalità speciale `11` ULTRA 100% IA),
3. **Numero di eventi** (`N`, calcolato automaticamente o impostabile),
4. **Finestra temporale** (*Oggi*, *48 ore*, *7 giorni*, *14 giorni*),
5. **Filtro Competizioni & Coppe** (Campionati, Coppe e Altro, con contatore partite live),
6. **Varietà Mercati** (*Auto decisa dall'AI*, *Alta*, *Normale*, *Nessun limite*).

> **Importante (Gioco Responsabile — 18+)**: SAMU BET **non** piazza scommesse, **non** si collega all'account SNAI e **non** gestisce denaro. È esclusivamente uno strumento di analisi quantitativa. Solo per maggiorenni (18+). Telefono Verde Nazionale per le problematiche legate al Gioco d'Azzardo: **800 558 822**.

---

## Indice
1. [Avvio Rapido in Locale](#1-avvio-rapido-in-locale)
2. [Novità Versione 1.1](#2-novità-versione-11)
3. [Guida Passo-Passo alle Chiavi API Gratuite (Da Zero)](#3-guida-passo-passo-alle-chiavi-api-gratuite-da-zero)
4. [Guida all'AI: Google Gemini Cloud + Local AI Bridge](#4-guida-allai-google-gemini-cloud--local-ai-bridge)
5. [Deploy Online Gratuito su Vercel](#5-deploy-online-gratuito-su-vercel)
6. [Anteprima Icone Generate](#6-anteprima-icone-generate)
7. [Riepilogo Fonti Dati Verificate e Limiti Noti](#7-riepilogo-fonti-dati-verificate-e-limiti-noti)

---

## 1. Avvio Rapido in Locale

### Prerequisiti
- **Node.js 20+** installato su Windows.
- *(Nota per PowerShell su Windows)*: se PowerShell blocca `npm.ps1`, esegui:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```
  oppure usa `npm.cmd` al posto di `npm`.

### Passaggi
1. Clona o apri la cartella del progetto e copia il file delle variabili d'ambiente:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Installa le dipendenze:
   ```powershell
   npm.cmd run install:all
   ```
3. Avvia il backend (porta `3001`) e il frontend (porta `5173`) in due terminali:
   ```powershell
   # Terminale 1 — Backend
   npm.cmd run dev:backend

   # Terminale 2 — Frontend PWA
   npm.cmd run dev:frontend
   ```
4. Apri `http://localhost:5173` nel browser.
5. Per eseguire la suite completa di 21 test di accettazione (Vitest):
   ```powershell
   npm.cmd test
   ```

---

## 2. Novità Versione 1.1

1. **Pipeline AI a Due Stadi (Google Gemini)**:
   - **Stadio A**: stima quantitativa probabilità per singolo evento (`p_ai`, confidenza, fattori chiave, alert e dati mancanti) con reasoning rapido (`low`).
   - **Stadio B**: revisione qualitativa d'insieme della schedina ("Parere AI") con reasoning approfondito (`high`). Non modifica le probabilità matematiche.
2. **Catena di Fallback Modelli Dinamica**:
   - Primario: `gemini-3.8-flash` (configurabile da `GEMINI_MODEL`).
   - Fallback automatico su `gemini-2.5-flash` e `gemini-2.5-flash-lite` in caso di quota 429 o temporaneo 503.
   - Fallback elegante a "Solo Mercato" depurato da overround se l'AI è disattivata o offline.
3. **Filtro Competizioni & Coppe**:
   - Modal full-screen per mobile con 3 tab (*Campionati*, *Coppe*, *Altro*), ricerca testuale, raggruppamento per nazione e contatore partite in tempo reale.
   - Salvataggio delle preferenze in `localStorage`.
4. **Calendario Multi-Fonte e Finestra a 14 Giorni**:
   - Finestra estesa a 14 giorni (`days14`) con avviso di volatilità di mercato per gli eventi oltre i 7 giorni.
   - Calendario orari in fuso di Roma (`Europe/Rome`) e deduplica automatica entro $\pm 3\text{h}$ da The Odds API e Football-Data.org.
   - OneFootball: non implementato per rispetto dei Termini d'Uso (proibisce scraper non autorizzati).
5. **Diversificazione Mercati e Quote Derivate**:
   - Tag `sourceType: 'market' | 'model'` su tutte le selezioni. L'EV delle quote stimate dal modello matematico non entra nel punteggio finché l'utente non inserisce la quota reale SNAI.
   - Varietà gestita con selettore in interfaccia (*Auto*, *Alta*, *Normale*, *Nessun limite*) e avviso quando 3 o più gambe condividono lo stesso modello.
6. **5 Nuove Proposte Grafiche di Icona**:
   - File PNG in alta definizione (1024x1024) in `frontend/public/icon-proposals/`.
   - Pagina di confronto visivo locale in `frontend/icon-preview.html`.

---

## 3. Guida Passo-Passo alle Chiavi API Gratuite (Da Zero)

Non hai ancora nessuna chiave API? Segui questi passaggi gratuiti (non serve carta di credito):

1. **The Odds API (Quote Calcio & Tennis)**:
   - Vai su [the-odds-api.com](https://the-odds-api.com/) e registrati gratuitamente per 500 crediti/mese.
   - Copia la chiave in `.env` come `THE_ODDS_API_KEY`.
2. **Football-Data.org (Statistiche & Calendario)**:
   - Vai su [football-data.org/client/register](https://www.football-data.org/client/register) e registrati gratuitamente.
   - Copia la chiave in `.env` come `FOOTBALL_DATA_API_KEY`.
3. **Google Gemini AI (Analisi Intelligente & Revisione)**:
   - Vai su [aistudio.google.com](https://aistudio.google.com/) e crea una chiave API gratuita.
   - Copia la chiave in `.env` come `GEMINI_API_KEY`.

---

## 4. Guida all'AI: Google Gemini Cloud + Local AI Bridge

### Opzione A — Google Gemini Cloud (Consigliata)
Configura semplicemente `GEMINI_API_KEY` nel file `.env`. L'applicazione usa `gemini-3.8-flash` con reasoning adattivo per lo Stadio A e lo Stadio B.

### Opzione B — Local AI Bridge (Offline sul tuo PC)
Se desideri eseguire un modello open-source locale (es. Qwen 2.5 / Llama 3 via Unsloth o Ollama):
1. Avvia il server locale OpenAI-compatibile su `http://127.0.0.1:8888/v1`.
2. Avvia il bridge sicuro:
   ```powershell
   cd local-ai-bridge
   npm.cmd start
   ```
3. Nell'interfaccia PWA, clicca sul badge in alto a destra e seleziona **"Bridge Locale"**.

---

## 5. Deploy Online Gratuito su Vercel

Il progetto include già `vercel.json` con `maxDuration: 60` secondi e l'entrypoint serverless `/api/index.ts`.

1. Crea un repository GitHub e carica il codice (non committare il file `.env`).
2. Accedi gratuitamente a [vercel.com](https://vercel.com) e importa il repository.
3. Nella sezione **Environment Variables** di Vercel, aggiungi:
   - `NODE_ENV` = `production`
   - `THE_ODDS_API_KEY` = *(la tua chiave)*
   - `FOOTBALL_DATA_API_KEY` = *(la tua chiave)*
   - `GEMINI_API_KEY` = *(la tua chiave)*
   - `GEMINI_MODEL` = `gemini-3.8-flash`
4. Clicca su **"Deploy"**.
5. Apri l'URL da Safari (iOS) o Chrome (Android) e clicca **"Aggiungi alla schermata Home"** per installare la PWA a tutto schermo.

---

## 6. Icona Ufficiale PWA

È stata scelta e attivata come icona ufficiale la **Proposta 4 (Athletic Tech "S")**:
- **Design**: Lettera "S" audace e atletica formata da lame angolari sfaccettate in bianco puro e verde lime sportivo (#22c55e) su sfondo scuro opaco (#0f172a).
- **Asset generati**: `icon-192.png`, `icon-512.png` (supporto `any` e `maskable`), `apple-touch-icon.png` (iOS 180x180) e `favicon.png` (48x48).
- Le 5 proposte complete rimangono comunque consultabili in locale tramite:
👉 `frontend/icon-preview.html`

---

## 7. Riepilogo Fonti Dati Verificate e Limiti Noti

| Area | Fonte Verificata | Copertura | Note e Limiti |
|---|---|---|---|
| **Quote Calcio & Tennis** | **The Odds API** (Piano Free 500 crediti/mese) | 60+ campionati di calcio mondiali, eventi ATP/WTA | SNAI nativa non inclusa nel feed gratuito `eu`; si usa la mediana europea depurata dal margine + override manuale della quota SNAI reale. |
| **Statistiche Calcio** | **football-data.org** (Piano Free 10 req/min) | 12 campionati top mondiali e coppe | Dati ufficiali di classifica, calendario e forma. |
| **Formula 1** | **Jolpica-F1** (Open Source gratuito) | Calendario GP e classifiche piloti/costruttori | Nessun aggregatore gratuito offre quote F1 senza abbonamento a pagamento; l'app lo dichiara esplicitamente. |
| **News & Notizie** | **Feed RSS Sportivi** (Gazzetta, BBC, Sky) | Aggiornamenti live su formazioni, assenze e infortuni | Cache locale di 2 ore per non saturare la banda. |
| **OneFootball** | Non supportato | N/A | I Termini di Servizio vietano esplicitamente scraping o bot non autorizzati; non implementato per conformità legale. |
