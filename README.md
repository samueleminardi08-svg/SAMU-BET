# SAMU BET — Analisi Quantitativa Pronostici e Composizione Schedina

**SAMU BET** è una Progressive Web App (PWA) mobile-first in italiano che analizza quote di mercato, statistiche e notizie sportive (tramite feed RSS) per **Calcio, Formula 1 e Tennis**, consigliando singole selezioni e componendo la **miglior schedina** da giocare manualmente sull'app SNAI in base a:
1. **Quota totale desiderata** (`Q`, min `1.10`),
2. **Livello di rischio** (`R`, slider da `1` a `10`),
3. **Numero di eventi** (`N`, da `1` a `15`).

> **Importante (Gioco Responsabile — 18+)**: SAMU BET **non** piazza scommesse, **non** si collega all'account SNAI e **non** gestisce denaro. È esclusivamente uno strumento di analisi quantitativa. Solo per maggiorenni (18+). Telefono Verde Nazionale per le problematiche legate al Gioco d'Azzardo: **800 558 822**.

---

## Indice
1. [Avvio Rapido in Locale](#1-avvio-rapido-in-locale)
2. [Guida Passo-Passo alle Chiavi API Gratuite (Da Zero)](#2-guida-passo-passo-alle-chiavi-api-gratuite-da-zero)
3. [Guida Passo-Passo per Principianti all'AI Locale (Windows + Unsloth)](#3-guida-passo-passo-per-principianti-allai-locale-windows--unsloth)
4. [Deploy Online Gratuito su Vercel](#4-deploy-online-gratuito-su-vercel)
5. [Come Aggiungere un Nuovo Provider](#5-come-aggiungere-un-nuovo-provider)
6. [Riepilogo Fonti Dati Verificate e Limiti Noti](#6-riepilogo-fonti-dati-verificate-e-limiti-noti)

---

## 1. Avvio Rapido in Locale

### Prerequisiti
- **Node.js 20+** installato su Windows.
- *(Nota per PowerShell su Windows)*: se PowerShell blocca `npm.ps1`, esegui una volta:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```
  oppure usa `npm.cmd` al posto di `npm`.

### Passaggi
1. Clona o apri la cartella del progetto e copia il file delle variabili d'ambiente:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Installa le dipendenze di `backend`, `frontend` e `local-ai-bridge`:
   ```powershell
   npm.cmd run install:all
   ```
3. *(Opzionale per test immediato senza chiavi API)*: nel file `.env`, imposta `DEMO_MODE=true` (consentito **solo** in sviluppo locale `NODE_ENV=development`; in produzione viene disabilitato automaticamente).
4. Avvia il backend (porta `3001`) e il frontend (porta `5173`) in due terminali:
   ```powershell
   # Terminale 1 — Backend
   npm.cmd run dev:backend

   # Terminale 2 — Frontend PWA
   npm.cmd run dev:frontend
   ```
5. Apri `http://localhost:5173` nel browser.
6. Per eseguire i test unitari e di accettazione (Vitest):
   ```powershell
   npm.cmd test
   ```

---

## 2. Guida Passo-Passo alle Chiavi API Gratuite (Da Zero)

Non hai ancora nessuna chiave API? Segui questi passaggi gratuiti (non serve carta di credito).

### 2.1 The Odds API (Obbligatoria per le Quote Reali di Calcio e Tennis)
1. Vai su **[https://the-odds-api.com/](https://the-odds-api.com/)**.
2. Clicca sul pulsante **"Get API Key"** e seleziona il piano **"Starter (Free)"** (500 crediti gratuiti al mese).
3. Inserisci il tuo nome e il tuo indirizzo email e clicca su **"Get Free API Key"**.
4. Apri la tua casella email: riceverai subito un messaggio con la tua chiave alfanumerica (es. `a1b2c3d4e5f6...`).
5. **Dove inserirla**:
   - **In locale**: apri il file `.env` nella radice del progetto e incollala in:
     ```env
     THE_ODDS_API_KEY=la_tua_chiave_qui
     ```
   - **Su Vercel (hosting online)**: vai nel pannello del progetto su Vercel → **Settings** → **Environment Variables** → aggiungi `THE_ODDS_API_KEY` con il valore della chiave.
6. **Limiti verificati del piano gratuito**:
   - **500 crediti/mese**. L'elenco degli sport attivi (`/v4/sports`) costa **0 crediti**. Ogni richiesta quote per campionato costa `numero_mercati × numero_regioni` crediti (con `regions=eu` e `markets=h2h,totals` costa 2 crediti).
   - SAMU BET protegge i tuoi crediti tramite **cache condivisa di 15 minuti**, **rate limit per IP** (`RATE_LIMIT_PER_IP_HOUR=15`) e **tetto giornaliero globale** (`DAILY_API_QUOTA_LIMIT=45`).

### 2.2 football-data.org (Consigliata per Classifiche e Forma dei 12 Campionati Top di Calcio)
1. Vai su **[https://www.football-data.org/client/register](https://www.football-data.org/client/register)**.
2. Compila il modulo gratuito (Nome, Email) e conferma il link ricevuto via email.
3. Riceverai via email il tuo **API Token** gratuito.
4. **Dove inserirla**:
   - **In locale**: nel file `.env` alla voce:
     ```env
     FOOTBALL_DATA_API_KEY=il_tuo_token_qui
     ```
   - **Su Vercel**: in **Settings → Environment Variables** come `FOOTBALL_DATA_API_KEY`.
5. **Limiti verificati del piano gratuito**:
   - **10 richieste al minuto**, nessun costo mensile.
   - Copre **12 competizioni ufficiali**: Serie A (`SA`), Premier League (`PL`), La Liga (`PD`), Bundesliga (`BL1`), Ligue 1 (`FL1`), UEFA Champions League (`CL`), Eredivisie (`DED`), Primeira Liga (`PPL`), Championship (`ELC`), Brasileirão (`BSA`), Mondiale (`WC`), Europeo (`EC`).

### 2.3 Jolpica-F1 e Feed RSS (Nessuna Chiave Richiesta!)
- **Formula 1 (`Jolpica-F1`)**: `https://api.jolpi.ca/ergast/f1` è **100% gratuito e open-source** e non richiede registrazione né API key.
- **Feed RSS Notizie**: Gazzetta dello Sport, BBC Sport, Motorsport.com, FormulaPassion, Ubitennis e OA Sport sono letti direttamente dal backend con cache di 2 ore senza bisogno di chiavi.

### 2.4 Opzionali (Non necessarie per far funzionare l'app)
- `API_FOOTBALL_KEY` ([https://dashboard.api-football.com/register](https://dashboard.api-football.com/register)): piano gratuito da 100 richieste/giorno, ma con restrizioni sulle stagioni correnti.
- `GEMINI_API_KEY` ([https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)): provider AI secondario opzionale; non serve perché SAMU BET usa di default il modello locale Unsloth sul tuo PC.

---

## 3. Guida Passo-Passo per Principianti all'AI Locale (Windows + Unsloth)

Questa guida è progettata per un **PC Windows solo CPU con 16 GB di RAM o più**.

### Passo 1: Installare Unsloth su Windows e avviare il modello GGUF in sicurezza
1. Apri **PowerShell** su Windows e installa Unsloth CLI/Studio con l'installer ufficiale:
   ```powershell
   irm https://unsloth.ai/install.ps1 | iex
   ```
2. Chiudi e riapri PowerShell, poi avvia il modello GGUF quantizzato **solo su loopback locale (`127.0.0.1`)** e con gli **strumenti server disattivati (`--disable-tools`)**:
   ```powershell
   unsloth run --model unsloth/Qwen3-4B-Instruct-GGUF:Q4_K_M --host 127.0.0.1 --port 8888 --disable-tools
   ```
   > **Regola di sicurezza fondamentale**: **NON** usare mai `--host 0.0.0.0` e **NON** esporre mai la porta `8888` di Unsloth su internet. Usa sempre `--host 127.0.0.1` e `--disable-tools`.
3. Al primo avvio Unsloth scaricherà il file GGUF (~2.5 GB) e stamperà nel terminale la chiave API locale, ad esempio:
   ```text
   API Key: sk-unsloth-xxxxxxxxxxxxxxxxxxxxxxxx
   Server listening on http://127.0.0.1:8888
   ```
   **Annota questa chiave `sk-unsloth-...`**.

#### Tempi stimati su CPU (16 GB RAM)
| Modello GGUF (`LLM_MODEL`) | RAM Richiesta | Tempo stimato per evento (CPU) | Note |
|---|---|---|---|
| `unsloth/Qwen3-4B-Instruct-GGUF:Q4_K_M` *(Default consigliato)* | ~3.5 GB | **15 – 35 secondi** | Ottimo bilanciamento velocità/qualità su CPU |
| `unsloth/gemma-3-4b-it-GGUF:Q4_K_M` *(Alternativa 4B)* | ~3.5 GB | **15 – 35 secondi** | Molto stabile sull'output JSON |
| `unsloth/Qwen3-8B-Instruct-GGUF:Q4_K_M` *(Opzione 8B più accurata)* | ~6.5 GB | **40 – 75 secondi** | Più accurato ma circa 2x più lento su CPU |

### Passo 2: Generare `BRIDGE_TOKEN` e avviare il `local-ai-bridge`
1. Apri una **seconda finestra PowerShell** nella cartella del progetto e genera un token segreto casuale:
   ```powershell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 36 | ForEach-Object {[char]$_})
   ```
2. Apri il file `.env` e compila la sezione del bridge:
   ```env
   LLM_BASE_URL=http://127.0.0.1:8888/v1
   LLM_API_KEY=sk-unsloth-inserisci-la-chiave-del-passo-1
   LLM_MODEL=unsloth/Qwen3-4B-Instruct-GGUF:Q4_K_M
   BRIDGE_TOKEN=incolla-il-token-generato-di-36-caratteri
   ALLOWED_ORIGIN=https://tuo-progetto.vercel.app,http://localhost:5173
   BRIDGE_PORT=8787
   ```
3. Avvia il servizio `local-ai-bridge`:
   ```powershell
   npm.cmd --prefix local-ai-bridge run start
   ```
   Vedrai il messaggio: `[SAMU BET local-ai-bridge] Attivo su http://127.0.0.1:8787`.

### Passo 3: Rendere il bridge raggiungibile in HTTPS dal telefono (Tunnel Gratuito)
Poiché l'app web è in HTTPS, il browser del telefono richiede che anche il bridge sia in HTTPS. Hai due opzioni gratuite per Windows:

#### Opzione A (Consigliata — URL HTTPS fisso che non cambia mai): **Tailscale Funnel**
1. Scarica e installa Tailscale per Windows da [https://tailscale.com/download/windows](https://tailscale.com/download/windows) ed effettua il login gratuito.
2. Nella console admin di Tailscale abilita **HTTPS Certificates** e **Funnel**.
3. In PowerShell esegui:
   ```powershell
   tailscale funnel 8787
   ```
4. Tailscale ti mostrerà il tuo URL HTTPS permanente, ad esempio: `https://mio-pc.tail12345.ts.net`.

#### Opzione B (Immediata senza account): **Cloudflare Quick Tunnel**
1. Installa `cloudflared` su Windows con Winget:
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
2. Espone la porta `8787` del bridge in HTTPS:
   ```powershell
   cloudflared tunnel --url http://127.0.0.1:8787
   ```
3. Copia l'URL `https://xxxx-xxxx.trycloudflare.com` mostrato nel terminale.

### Passo 4: Inserire URL e Token nelle Impostazioni dell'app dal telefono
1. Apri l'app **SAMU BET** sul tuo telefono.
2. Tocca in alto la scheda **"AI Locale"** (oppure il badge di stato in alto a destra).
3. Incolla l'**URL HTTPS** del tunnel (Passo 3) e il **`BRIDGE_TOKEN`** (Passo 2).
4. I dati restano salvati **esclusivamente nella memoria locale del tuo browser sul telefono (`localStorage`)**. Chiunque altro apra il link dell'app non avrà il token e userà automaticamente la modalità `"solo mercato"`.

### Passo 5: Testare la connessione
1. Tocca il pulsante **"Salva e Testa connessione"**.
2. L'app chiamerà `GET /health` sul bridge: il badge nell'intestazione diventerà verde (**"AI locale connessa"**) mostrando il nome del modello GGUF caricato.

### Avvio Automatico all'Accensione del PC (Utilità di Pianificazione di Windows)
Per avviare tutto automaticamente quando accendi il PC:
1. Crea nella cartella del progetto un file `start-samubet-ai.ps1` con questo contenuto:
   ```powershell
   Start-Process powershell -ArgumentList "-NoExit", "-Command", "unsloth run --model unsloth/Qwen3-4B-Instruct-GGUF:Q4_K_M --host 127.0.0.1 --port 8888 --disable-tools"
   Start-Sleep -Seconds 8
   Start-Process powershell -WorkingDirectory "C:\Users\utente\Desktop\APP PRONOSTICI" -ArgumentList "-NoExit", "-Command", "npm.cmd --prefix local-ai-bridge run start"
   Start-Sleep -Seconds 3
   Start-Process powershell -ArgumentList "-NoExit", "-Command", "tailscale funnel 8787"
   ```
2. Premi `Win + R`, digita `taskschd.msc` e premi Invio per aprire **Utilità di pianificazione (Task Scheduler)**.
3. Clicca su **Crea attività di base...** → Nome: `SAMU BET Local AI`.
4. Trigger: **All'accesso dell'utente** (`At log on`).
5. Azione: **Avvia un programma** → Programma/script: `powershell.exe` → Argomenti: `-ExecutionPolicy Bypass -File "C:\Users\utente\Desktop\APP PRONOSTICI\start-samubet-ai.ps1"`.

### Cosa succede quando il PC è spento?
Quando il PC è spento o il tunnel non è attivo, SAMU BET rileva automaticamente che il bridge non è raggiungibile entro pochi secondi, mostra il badge **"AI non raggiungibile: uso solo il mercato"** e calcola regolarmente tutti i pronostici e la miglior schedina usando le probabilità matematiche di mercato depurate dal margine, **senza alcun errore o blocco**.

---

## 4. Deploy Online Gratuito su Vercel

Il progetto include già `vercel.json` e l'entrypoint serverless `/api/index.ts`.

1. Crea un repository GitHub (privato o pubblico) e carica il progetto (assicurati che `.env` **non** sia committato).
2. Accedi gratuitamente a **[https://vercel.com](https://vercel.com)** con il tuo account GitHub.
3. Clicca su **"Add New..." → "Project"** e importa il repository.
4. Nella sezione **Environment Variables** di Vercel, aggiungi:
   - `NODE_ENV` = `production`
   - `DEMO_MODE` = `false`
   - `THE_ODDS_API_KEY` = *(la tua chiave The Odds API)*
   - `FOOTBALL_DATA_API_KEY` = *(la tua chiave football-data.org)*
   - `DAILY_API_QUOTA_LIMIT` = `45`
   - `RATE_LIMIT_PER_IP_HOUR` = `15`
5. Clicca su **"Deploy"**. In circa 60 secondi avrai il tuo URL pubblico `https://tuo-progetto.vercel.app`.
6. Apri l'URL da Safari (iOS) o Chrome (Android) e seleziona **"Aggiungi alla schermata Home"** per installare **SAMU BET** come app PWA a tutto schermo!

---

## 5. Come Aggiungere un Nuovo Provider

### Aggiungere un nuovo `OddsProvider`
1. Apri `backend/src/providers/oddsProvider.ts`.
2. Crea una classe che implementa l'interfaccia `OddsProvider`:
   ```ts
   export class MioNuovoOddsProvider implements OddsProvider {
     public readonly name = 'Mio Provider Quote';
     public async fetchEvents(sports: SportKey[], timeWindow: TimeWindowKey): Promise<OddsFetchResult> {
       // Restituisce RawSportEvent[] usando il modello generico (marketKey, marketName, line, outcomes)
     }
   }
   ```
3. Poiché il motore probabilistico (`probability.ts`) e la ricerca schedina (`slipBuilder.ts`) lavorano sul modello dati generico (`market`, `selection`, `line` opzionale), non devi modificare il motore per supportare nuovi mercati.

### Aggiungere un nuovo `AIProvider`
1. Apri `backend/src/ai/aiProvider.ts`.
2. Implementa l'interfaccia `AIProvider`:
   ```ts
   export interface AIProvider {
     readonly name: string;
     estimate(eventContext: EventAIContextPayload): Promise<AIEstimate[]>;
   }
   ```

---

## 6. Riepilogo Fonti Dati Verificate e Limiti Noti

| Area | Fonte Scelta e Verificata | Cosa è Coperto | Cosa NON è stato possibile coprire gratuitamente e Perché |
|---|---|---|---|
| **Quote Calcio & Tennis** | **The Odds API** (`api.the-odds-api.com/v4`) — Piano Free 500 crediti/mese | 60+ campionati di calcio mondiali (top 6 attivi interrogati per finestra) e tutti i tornei ATP/WTA in corso. Mercati: `1X2` / `Testa a testa`, `Under/Over`, `Handicap`, più `Doppia Chance` e `Draw No Bet` derivati dalle quote 1X2 per bookmaker. | **Quote native SNAI**: SNAI non è inclusa nel feed gratuito `eu` di The Odds API; si usa la **mediana dei bookmaker europei** + il campo **"Quota SNAI reale"** modificabile dall'utente con ricalcolo istantaneo. Mercati `Goal/NoGoal` e `Combo` non sono esposti sul piano gratuito base di The Odds API. |
| **Quote Formula 1** | **Non disponibili gratuitamente** (Calendario da **Jolpica-F1**) | Calendario ufficiale GP e classifiche piloti/costruttori 100% coperti da `api.jolpi.ca/ergast/f1/current`. | **Quote bookmaker F1**: The Odds API non supporta la Formula 1 e nessun aggregatore gratuito offre quote F1 senza abbonamento. L'app lo dichiara chiaramente nell'interfaccia senza inventare quote in produzione. |
| **Statistiche Calcio** | **football-data.org** (`v4`) — Piano Free 10 req/min | Classifiche ufficiali, punti, differenza reti e forma per **12 campionati principali** (Serie A, Premier League, La Liga, Bundesliga, Ligue 1, Champions League, Eredivisie, Primeira Liga, Championship, Brasileirão). | Campionati minori oltre i 12 del piano free di `football-data.org` (e `API-Football` blocca le stagioni correnti sul piano free): dichiarato in UI, usando quote + RSS per i campionati extra. |
| **Statistiche F1** | **Jolpica-F1** (`api.jolpi.ca`) — Gratuito senza chiave | Calendario GP corrente, classifica piloti, classifica costruttori, risultati gare. | **OpenF1** (`api.openf1.org`) ha restituito `HTTP 401 Non autorizzato` ai test live perché richiede un account a pagamento durante le sessioni live; perciò è stato scelto Jolpica-F1. |
| **Statistiche Tennis** | **Quote + Feed RSS** | Quote ATP/WTA + notizie da Ubitennis, Gazzetta Tennis, BBC Tennis, OA Sport. | Non esiste alcuna API gratuita affidabile senza carta di credito per ranking/H2H/superficie live ATP-WTA; dichiarato trasparentemente in app. |

