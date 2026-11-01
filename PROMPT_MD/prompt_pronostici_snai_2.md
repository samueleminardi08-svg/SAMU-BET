# Prompt per Antigravity — App "SAMU BET"

## 1. Ruolo e obiettivo

Sei un senior full-stack engineer. Costruisci una **web app chiamata "SAMU BET"**, in italiano e mobile-first, che consiglia pronostici da giocare **manualmente** nell'app SNAI per **calcio (tutti i campionati), Formula 1 e tennis**, e che compone la **miglior schedina** in base ai parametri scelti dall'utente.

L'utente imposta:

1. la **quota** che vuole raggiungere,
2. il **livello di rischio** (slider da 1 a 10),
3. il **numero di eventi** (partite/gare) da includere.

L'app produce due output:

- **A. Pronostici consigliati**: elenco di singole selezioni coerenti con rischio e numero di eventi.
- **B. Miglior schedina**: la combinazione di N selezioni la cui quota totale è più vicina alla quota desiderata, ottimizzata per probabilità/valore in base al rischio.

L'app **NON** piazza scommesse, **NON** si collega all'account SNAI e **NON** gestisce denaro. È solo uno strumento di analisi.

---

## 2. Come lavorare (importante)

1. **Prima di scrivere codice**, produci un Implementation Plan con: fonti dati scelte, architettura, struttura cartelle, rischi noti.
2. **Verifica le fonti dati al momento**: limiti dei piani gratuiti, copertura campionati, disponibilità dei mercati e se includono i bookmaker italiani/SNAI. Non fidarti della memoria; riporta nel piano ciò che hai verificato.
3. Implementa **solo** ciò che è descritto qui. Niente funzionalità extra (vedi sezione 13).
4. Se una fonte dati non è disponibile o non copre un'area, **dichiaralo** nell'interfaccia: non inventare mai dati.

---

## 3. Input utente (form iniziale)

| Campo | Tipo | Dettagli |
|---|---|---|
| Sport | multi-selezione | Calcio, Formula 1, Tennis (default: tutti e tre) |
| Quota desiderata | numero | Quota totale della schedina (es. 5.00). Minimo 1.10 |
| Livello di rischio | slider 1–10 | 1 = molto prudente, 10 = molto rischioso. Mostra l'etichetta e la descrizione del livello selezionato |
| Numero di eventi | stepper | Da 1 a 15 (default 3) |
| Finestra temporale | selettore | Oggi / Prossime 48 ore / Prossimi 7 giorni (default: prossime 48 ore) |

Pulsante: **"Genera consigli"**.

---

## 4. Fonti dati e architettura

SNAI non offre API pubbliche, quindi usa questa strategia a più livelli.

**Vincolo di budget: usa SOLO fonti gratuite** (piani free o API aperte). Nessun servizio a pagamento. Poiché i piani gratuiti hanno limiti di richieste e di copertura:
- Nel piano indica per ogni sport il **numero di richieste/giorno disponibili** e quanti campionati/competizioni riesci a coprire.
- Dai priorità alle competizioni con più eventi nella finestra temporale scelta e analizza in profondità (chiamata AI) solo le **migliori candidate** dopo un pre-filtro basato sulle sole quote, per restare nei limiti.
- Mostra nell'interfaccia un elenco "Competizioni coperte" e, se una competizione non è coperta, dillo chiaramente invece di ometterla in silenzio.
- Se il piano gratuito non permette di coprire "tutti i campionati", scegli la combinazione di fonti gratuite che massimizza la copertura e documenta i limiti nel README.

**Quote**
- Crea un'interfaccia astratta `OddsProvider` con implementazioni intercambiabili.
- Implementazione primaria: un aggregatore di quote con piano gratuito (es. The Odds API), con regione/mercati europei. Verifica se SNAI è tra i bookmaker disponibili; se non lo è, usa la **mediana dei bookmaker disponibili** come stima del mercato.
- **Override manuale (funzione chiave)**: ogni selezione ha un campo "Quota SNAI reale" modificabile dall'utente. Quando l'utente lo compila, ricalcola subito EV, probabilità combinata e quota totale della schedina. Questo serve perché la quota reale sull'app SNAI può differire da quella dell'aggregatore.

**Statistiche e contesto**
- Calcio: provider con copertura ampia dei campionati (es. API-Football o football-data.org). Se il piano gratuito non copre tutti i campionati, indica nel piano quali sono coperti e mostra in app l'elenco dei campionati disponibili.
- Formula 1: provider gratuito con dati su griglie, risultati, passo gara (es. Jolpica-F1 / OpenF1).
- Tennis: provider gratuito o a basso costo per ranking, forma, superficie, head-to-head; se non esiste una fonte affidabile gratuita, usa le sole quote e i feed RSS e dichiaralo.
- **Notizie, infortuni, forma recente (feed RSS e pagine sportive gratuite)**: il backend legge feed RSS pubblici di testate sportive (es. Gazzetta, Sky Sport, BBC Sport, Formula1.com, Motorsport.com, ATP/WTA o testate tennis: **verifica tu quali feed esistono ancora e sono usabili**). Regole:
  - rispetta termini di servizio e `robots.txt`; usa solo **titolo, data, breve estratto e link**, mai il testo completo degli articoli, e cita sempre la fonte;
  - la lettura avviene **lato backend** (niente problemi CORS) con cache di 2 ore;
  - filtra gli articoli per evento associando i nomi di squadre/giocatori/piloti presenti nel titolo o nell'estratto (con alias e normalizzazione di accenti/maiuscole);
  - passa al modello AI solo gli elementi pertinenti (massimo 5 per evento) come "contesto notizie";
  - per gli infortuni usa anche gli endpoint gratuiti del provider statistico se li offre;
  - se non trovi notizie pertinenti, dillo al modello ("nessuna notizia recente trovata") e abbassa la `confidence`.

**Regole tecniche**
- Tutte le chiavi API stanno nel **backend** (file `.env`, mai nel frontend). Il frontend parla solo con il backend.
- **Cache** con TTL: quote 15 minuti, statistiche 6 ore, notizie RSS 2 ore (i risultati AI sono in cache nel browser, vedi 5.2). Conta e mostra il consumo delle quote API; se si esauriscono, degrada con un messaggio chiaro.
- `DEMO_MODE=true` può usare dati finti **solo in sviluppo**, con un banner ben visibile "DATI DI PROVA". In produzione i dati finti sono vietati.

---

## 5. Motore probabilistico

### 5.1 Probabilità di mercato
1. Probabilità implicita = `1 / quota`.
2. Rimuovi il margine del bookmaker (normalizzazione proporzionale; metodo Shin se i dati lo permettono).
3. Con più bookmaker, usa la **mediana** delle probabilità senza margine.

### 5.2 Stima AI (modello locale con Unsloth)
La stima AI è prodotta da un **modello locale (GGUF quantizzato) eseguito con Unsloth sul PC Windows dell'utente** (nessuna API a pagamento, nessuna chiave Gemini obbligatoria). Unsloth espone il modello tramite un'**API compatibile OpenAI** (`/v1/chat/completions`) protetta da una API key; **verifica nella documentazione ufficiale di Unsloth comandi, porte e parametri attuali** (es. `unsloth run --model ...`). Il PC è **solo CPU con 16 GB di RAM o più**: il modello è lento, quindi progetta di conseguenza.

**Astrazione**: crea un'interfaccia `AIProvider` con la funzione `estimate(eventContext) → AIEstimate`. Implementazioni:
- `LocalBridgeProvider` (**default**: parla con qualunque endpoint compatibile OpenAI, oggi Unsloth),
- `GeminiProvider` (**opzionale**, disattivato di default, attivabile solo se esiste `GEMINI_API_KEY`; senza ricerca Google, riceve lo stesso contesto RSS).

**Come si collega l'app al modello locale (architettura scelta)**
1. L'app web resta **online su hosting gratuito** (sezione 9) e raggiungibile dal telefono.
2. Sul PC gira un piccolo servizio **`local-ai-bridge`** (Node.js/TypeScript) che riceve le richieste dal browser e le inoltra a Unsloth (`/v1/chat/completions`, usando la API key di Unsloth salvata in `LLM_API_KEY`). **Non esporre mai Unsloth direttamente su internet** (niente `--cloudflare`, niente binding su `0.0.0.0`): Unsloth può eseguire strumenti lato server (ricerca web, codice Python/terminale) e una chiave trapelata significherebbe esecuzione di codice sul PC. Avvia Unsloth **solo su loopback** (127.0.0.1) con gli **strumenti server disattivati** (`--disable-tools`: verifica il flag attuale) e non inviare mai nelle richieste i campi che attivano i tool lato server.
3. Il bridge:
   - richiede un **token** (`Authorization: Bearer ...`) definito in `BRIDGE_TOKEN`,
   - accetta richieste solo dall'origine dell'app (CORS con `ALLOWED_ORIGIN`),
   - applica rate limiting e un limite di dimensione del prompt,
   - espone `GET /health` (stato, modello caricato) e `POST /estimate`,
   - impone l'**output JSON secondo lo schema**: prova `response_format` di tipo `json_schema` (compatibile OpenAI) e **verifica che Unsloth lo supporti**; in caso contrario istruisci il modello a rispondere solo in JSON, estrai il JSON in modo tollerante, valida con Zod e riprova una sola volta. Usa `temperature` bassa (≈0.2) e un limite di token in output; se il modello ha una modalità di ragionamento/thinking, **disattivala** per risparmiare tempo su CPU.
4. Il PC viene reso raggiungibile da internet in **HTTPS** tramite tunnel gratuito (es. **Tailscale Funnel**, che dà un URL stabile, oppure Cloudflare Tunnel: verifica tu opzioni, limiti e stabilità attuali e scegli la più adatta). Serve HTTPS, altrimenti il browser blocca le chiamate dall'app online.
5. **L'URL del bridge e il token si inseriscono nell'app dalla schermata Impostazioni** e restano **solo nel browser dell'utente** (localStorage). Il **browser del telefono chiama direttamente il bridge**, non il backend serverless: così si evitano i timeout delle funzioni gratuite e chiunque altro apra il link, non avendo il token, usa l'app in modalità "solo mercato".

**Prestazioni su CPU**
- Modello predefinito **piccolo e quantizzato in GGUF** (3–4 miliardi di parametri, quantizzazione ≈Q4): scegli tra i modelli GGUF piccoli attualmente disponibili e consigliati da Unsloth (verifica i nomi aggiornati), configurabile con `LLM_MODEL`; un modello da 7–8B è un'opzione più lenta ma più accurata. Indica nel README tempi stimati per entrambi.
- **Una sola chiamata per evento**, con tutte le selezioni candidate di quell'evento nello stesso prompt, prompt breve (target < 1500 token) e output limitato.
- Analizza solo le **migliori candidate** dopo il pre-filtro sulle quote (default **12 eventi**, configurabile), **in sequenza**, con timeout di 90 secondi per chiamata e pulsante "Annulla".
- Cache dei risultati AI per evento+mercato (2 ore) nel browser.
- Interfaccia con avanzamento esplicito ("Analisi AI 4/12") e **risultati parziali** subito disponibili: se l'utente interrompe, usa quanto già calcolato e il resto in modalità "solo mercato".

**Validazione e fallback**: valida ogni risposta con uno schema (Zod). Se il bridge non è raggiungibile, il token è errato, il modello non risponde in tempo o la risposta è invalida, usa **solo la probabilità di mercato**, segna le selezioni come "solo mercato" e mostra un avviso chiaro sullo stato dell'AI. Nessun crash.

### 5.3 Probabilità finale
```
p_final = w * p_mercato + (1 - w) * p_ai
```
- `w` = 0.70 di default; sale a 0.90 se `confidence` dell'AI < 0.5.
- **Limita** `p_ai` entro ±10 punti percentuali da `p_mercato` per evitare stime allucinate.

### 5.4 Valore atteso
```
EV   = p_final * quota - 1
edge = p_final - 1 / quota
```
Mostra l'EV in modo **onesto**: poiché i bookmaker applicano un margine, l'EV è spesso negativo. Non nasconderlo e non abbellirlo.

### 5.5 Mappatura del rischio (slider 1–10)
Costanti in un unico file di configurazione (`riskConfig.ts`), modificabili.

| Rischio | Probabilità minima per selezione | Quota massima per selezione |
|---|---|---|
| 1 | ≥ 0.80 | ≤ 1.30 |
| 2 | ≥ 0.72 | ≤ 1.45 |
| 3 | ≥ 0.65 | ≤ 1.65 |
| 4 | ≥ 0.58 | ≤ 1.90 |
| 5 | ≥ 0.50 | ≤ 2.30 |
| 6 | ≥ 0.42 | ≤ 2.80 |
| 7 | ≥ 0.35 | ≤ 3.50 |
| 8 | ≥ 0.28 | ≤ 4.50 |
| 9 | ≥ 0.20 | ≤ 6.50 |
| 10 | ≥ 0.12 | ≤ 10.00 |

Quota minima per selezione, sempre: **1.05**.

### 5.6 Costruzione della schedina
Input: quota desiderata `Q`, numero eventi `N`, rischio `R`.

1. **Fattibilità**: quota media per selezione `g = Q^(1/N)`.
   - Se `g > quota_max(R)`: la richiesta è incoerente. Non forzare il risultato. Mostra un avviso e proponi il numero minimo di eventi `N_min = ceil(ln(Q) / ln(quota_max(R)))` oppure un rischio più alto.
   - Se `g < 1.05`: avvisa che con quel numero di eventi la quota è troppo bassa e proponi di ridurre `N`.
2. **Pool candidati**: selezioni che rispettano probabilità minima e quota massima di `R`, ordinate per punteggio; tieni le prime 40.
3. **Ricerca** (beam search o branch & bound) di combinazioni di `N` selezioni con:
   - **massimo 1 selezione per evento** (una partita, un Gran Premio, un match),
   - prodotto delle quote entro **±8% di Q** (tolleranza configurabile).
4. **Punteggio** della combinazione: interpola con `α = (R - 1) / 9` tra due metriche normalizzate (min-max sul pool di combinazioni):
   - `P_comb = Π p_final` (probabilità combinata, privilegiata a rischio basso),
   - `EV_comb = P_comb * Q_comb - 1` (privilegiato a rischio alto).
   `score = (1 - α) * P_comb_norm + α * EV_comb_norm`.
5. Restituisci la combinazione con score massimo. Se non esiste nessuna combinazione entro la tolleranza, mostra la più vicina e dichiaralo.

### 5.7 Pronostici consigliati (output A)
Lista delle migliori selezioni singole dal pool, ordinate per punteggio (stessa interpolazione `α`), almeno `N` elementi se disponibili.

---

## 6. Mercati supportati

Supporta **tutti i mercati che i provider gratuiti mettono a disposizione**, senza una lista chiusa. Esempi indicativi (non esaustivi):

- **Calcio**: 1X2, Doppia Chance, Draw No Bet, Under/Over (varie linee), Goal/NoGoal, Handicap, Combo disponibili.
- **Formula 1**: Vincente del GP, Podio, Top 6/Top 10, Testa a testa tra piloti, Giro veloce.
- **Tennis**: Vincente del match, Under/Over giochi totali, Handicap giochi/set, Risultato esatto set.

Regole:
- Costruisci un **modello dati generico dei mercati** (`market`, `selection`, `line` opzionale) in modo che un nuovo mercato si aggiunga senza modificare il motore.
- Per ogni mercato la probabilità di mercato si calcola **sempre sull'insieme completo degli esiti dello stesso mercato** (necessario per rimuovere il margine in modo corretto).
- Se un mercato ha una sola quota disponibile (senza gli esiti complementari), non puoi depurare il margine: usa `1/quota` e segna la selezione con badge "margine non depurato".
- Evita selezioni **correlate** nello stesso evento: nella schedina vale sempre il limite di 1 selezione per evento.
- Se un mercato non è disponibile dal provider, non mostrarlo.

---

## 7. Interfaccia

- Lingua: **italiano**. Mobile-first e responsive, perché l'utente la userà dal telefono accanto all'app SNAI. Deve essere installabile come **PWA** (manifest, icona, schermata a tutto schermo) con nome **"SAMU BET"** (titolo, `name` e `short_name` del manifest). Crea un'icona/logo semplice e coerente con lo stile scuro e moderno dell'app (testo "SAMU BET" o monogramma "SB"), in tutte le dimensioni richieste dalla PWA.
- **Stile: tema scuro, intuitivo, molto grafico e moderno.** Direzione: dashboard di analisi sportiva premium, non un sito di scommesse.
  - Tema scuro come unico tema (sfondi quasi neri con sfumature blu/grafite), un colore d'accento dominante e uno secondario per EV/segnali, contrasto alto e leggibile.
  - Tipografia distintiva (no Inter/Roboto/Arial), numeri grandi e ben leggibili per quote e percentuali, font tabulare per i valori.
  - **Dati resi visivi, non solo testuali**: indicatore circolare/gauge per la probabilità, barra di confronto probabilità di mercato vs probabilità finale, badge colorati per rischio e EV, mini-grafico della distribuzione di probabilità della schedina, progress ring per la quota raggiunta rispetto a quella desiderata.
  - Slider del rischio molto visivo: il colore e l'intensità cambiano da 1 a 10, con etichetta e descrizione del livello.
  - Micro-animazioni fluide e sobrie (transizioni delle card, animazione dei gauge al caricamento, skeleton durante il caricamento). Usa CSS e, se serve, Motion.
  - Layout a card con gerarchia chiara; gesti e tap target comodi su telefono; navigazione semplice con pochi passaggi.
  - Mantieni **niente estetica da casinò** (niente slot, scintille, flash, colori o animazioni che incitano al gioco) e niente look generico "AI slop".
- **Schermata 1**: form (sezione 3).
- **Schermata 2**: risultati in due tab: **"Pronostici"** e **"Miglior schedina"**.
- **Schermata 3 (Impostazioni AI locale)**: campi per URL del bridge e token, pulsante "Testa connessione" (chiama `/health` e mostra modello e stato), salvataggio solo nel browser. Un indicatore di stato sempre visibile nell'intestazione: "AI locale connessa" / "AI non raggiungibile: uso solo il mercato". Includi un breve testo di aiuto su come avviare Unsloth e il bridge sul PC.

**Card di una selezione** (in entrambi i tab):
- Sport, competizione, evento, data/ora.
- Mercato e esito da giocare (es. "Doppia Chance 1X").
- Quota (aggregatore) + campo "Quota SNAI reale" modificabile.
- Probabilità finale %, EV %, badge "AI + mercato" o "solo mercato".
- "Perché" con 2–3 `key_factors` e `red_flags`.

**Riepilogo schedina**:
- Quota totale effettiva vs desiderata, probabilità combinata %, EV combinato %.
- Indicatore di difficoltà in base alla probabilità combinata.
- Timestamp "Quote aggiornate alle HH:MM. Verifica sempre la quota reale sull'app SNAI prima di giocare."

Stati da gestire: caricamento, nessun evento trovato, avviso di fattibilità (5.6), errore provider, quota API esaurita.

---

## 8. Gioco responsabile (obbligatorio)

- Banner fisso e footer: "Solo per maggiorenni (18+). Il gioco può causare dipendenza. Gioca responsabilmente."
- Riferimento al **Telefono Verde Nazionale per il gioco d'azzardo: 800 558 822**.
- Vietato usare nel testo dell'app parole come "sicuro", "garantito", "vincita certa", "fisso".
- Mostra **sempre** probabilità combinata ed EV vicino alla schedina.
- Se `P_comb < 5%`: avviso evidente "Probabilità di vincita molto bassa".
- Se l'EV è negativo (caso comune): dillo chiaramente in una riga, senza toni allarmistici.

---

## 9. Stack e struttura

- Frontend: **React + Vite + TypeScript**, Tailwind opzionale, **PWA**.
- Backend: **funzioni serverless in TypeScript** (preferite per l'hosting gratuito); in alternativa Node.js (Express o Fastify) se la piattaforma scelta lo supporta gratis. Contiene provider di quote e statistiche, lettura RSS, cache e motore probabilistico. La parte AI **non** passa dal backend serverless: il browser dell'utente parla con il `local-ai-bridge` (sezione 5.2).

### Deploy online gratuito (obbligatorio)
- L'app deve essere **pubblicata online e raggiungibile dal telefono** tramite un hosting **gratuito** (es. Vercel, Netlify o Cloudflare Pages/Workers: scegli e verifica tu quale piano free è adatto, riportandolo nel piano).
- Le funzioni serverless gratuite hanno **timeout brevi e nessuna memoria persistente**: progetta di conseguenza.
  - Dividi il lavoro in più chiamate brevi (es. 1: recupero eventi, quote e notizie RSS dal backend; 2: analisi AI delle migliori candidate, eseguita dal **browser verso il bridge locale**; 3: costruzione schedina nel motore) con avanzamento visibile nell'interfaccia.
  - La cache deve usare una soluzione gratuita compatibile con la piattaforma (KV/edge cache); se non disponibile, cache best-effort in memoria e caching HTTP.
- Le chiavi API stanno nelle **variabili d'ambiente della piattaforma**, mai nel codice o nel frontend.
- L'app è **aperta a chiunque abbia il link: nessun PIN, nessun login**. Proprio per questo devi proteggere le quote gratuite delle API:
  - **rate limiting** per IP sulle funzioni che consumano API (es. poche generazioni all'ora per IP),
  - **cache condivisa**: se due persone chiedono gli stessi dati, le chiamate esterne non si ripetono,
  - un **contatore globale giornaliero** delle richieste: quando si esaurisce, l'app mostra "Limite giornaliero raggiunto, riprova domani" invece di fallire.
- Nel `README.md` includi i passaggi precisi per il deploy e come impostare le variabili d'ambiente.
- Validazione con **Zod**. Test unitari del motore con **Vitest**.
- Struttura minima consigliata:
```
/frontend
/backend
  /providers      (odds, football, f1, tennis)
  /engine         (probabilità, rischio, schedina)
  /rss            (lettura feed e abbinamento notizie-eventi)
  /ai             (AIProvider: LocalBridge, Gemini opzionale; prompt e schemi)
  /config         (riskConfig.ts)
/local-ai-bridge  (servizio Node.js da eseguire sul PC: token, CORS, proxy verso Unsloth)
.env.example
README.md
```
- `.env.example` con tutte le variabili (chiavi quote, chiavi statistiche, `GEMINI_API_KEY` solo opzionale, elenco feed RSS, `DEMO_MODE`). Per il bridge sul PC: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `BRIDGE_TOKEN`, `ALLOWED_ORIGIN`, `PORT`.

---

## 10. Prompt interno per la stima AI (da implementare nel bridge/provider)

Usa questo prompt di sistema per la chiamata al modello locale (Unsloth). Il modello **non ha accesso al web**: riceve nel messaggio utente tutto il contesto necessario (statistiche essenziali, probabilità di mercato, titoli e estratti delle notizie RSS pertinenti con data e fonte). Imponi l'output con il JSON Schema della sezione 11.

```
Sei un analista sportivo quantitativo. Ti viene data una selezione
(evento, mercato, esito) con la probabilità di mercato già depurata dal margine.
Ti vengono forniti anche statistiche essenziali e notizie recenti (titolo, data, fonte).
Usa ESCLUSIVAMENTE queste informazioni (forma, infortuni, squalifiche, calendario,
condizioni) per stimare la probabilità che l'esito si verifichi.
Se non ci sono notizie pertinenti, dichiaralo in "red_flags" e abbassa "confidence".

Regole:
- Non inventare dati. Se le informazioni sono scarse, abbassa "confidence".
- Parti dalla probabilità di mercato e spostala solo se hai motivi concreti.
- Rispondi ESCLUSIVAMENTE con JSON valido, senza testo extra né markdown.
```

---

## 11. Formato JSON della stima AI (con esempio)

Schema:
```json
{
  "event_id": "string",
  "market": "string",
  "selection": "string",
  "p_ai": 0.0,
  "confidence": 0.0,
  "key_factors": ["string"],
  "red_flags": ["string"]
}
```

Esempio:
```json
{
  "event_id": "serieA-2026-11-01-INT-NAP",
  "market": "Doppia Chance",
  "selection": "1X",
  "p_ai": 0.74,
  "confidence": 0.7,
  "key_factors": ["Imbattuta in casa nelle ultime 8", "Avversario senza due titolari in difesa"],
  "red_flags": ["Turnover probabile per impegno europeo"]
}
```

---

## 12. Test di accettazione

1. `Q=6, N=3, R=5` → `g≈1.82` è fattibile: restituisce 3 selezioni da eventi diversi, prodotto quote in [5.52, 6.48], ognuna con p ≥ 0.50 e quota ≤ 2.30.
2. `Q=20, N=2, R=2` → incoerente: mostra l'avviso e propone `N_min = 9` (o un rischio più alto). Non genera una schedina forzata.
3. `Q=1.5, N=10` → `g<1.05`: avviso e proposta di ridurre `N`.
4. Nessun evento nella finestra scelta → messaggio chiaro, nessun crash.
5. Bridge non raggiungibile, token errato (401), timeout del modello o JSON invalido → fallback su "solo mercato", badge corretto, indicatore di stato AI aggiornato, nessun crash.
5b. Visitatore senza URL/token del bridge → l'app funziona in modalità "solo mercato" senza errori.
5c. Analisi AI interrotta con "Annulla" a metà → vengono usati i risultati parziali e il resto resta "solo mercato".
5d. Il bridge rifiuta richieste senza token o da origini non consentite; Unsloth non è mai esposto direttamente.
6. Modifica di "Quota SNAI reale" su una selezione → ricalcolo immediato di EV, quota totale e probabilità combinata.
7. Mai due selezioni dello stesso evento nella stessa schedina.
8. Chiavi API assenti dal bundle del frontend.

---

## 13. Vincoli (cosa NON fare)

- Niente login/registrazione, database, storico delle schedine, gestione budget/puntata, notifiche, integrazione con l'account SNAI, piazzamento automatico di scommesse.
- Niente dati inventati in produzione.
- Niente linguaggio che prometta vincite.

---

## 14. Deliverable

- Codice completo funzionante (frontend + backend).
- `README.md` in italiano con: setup, variabili d'ambiente, come aggiungere un nuovo provider, limiti noti delle fonti dati scelte.
- **Guida passo-passo per principianti all'AI locale (Windows, con Unsloth)**, nell'ordine: (1) installare Unsloth su Windows con l'installer ufficiale (verifica la procedura attuale; PC solo CPU, 16 GB di RAM o più) e avviare il modello GGUF predefinito con gli strumenti server disattivati, solo su loopback, annotando la API key; (2) generare `BRIDGE_TOKEN` e avviare il `local-ai-bridge` (comandi PowerShell); (3) rendere il bridge raggiungibile in HTTPS con il tunnel gratuito scelto (versione per Windows); (4) inserire URL e token nelle Impostazioni dell'app dal telefono; (5) testare la connessione. Includi come avviare tutto automaticamente all'accensione del PC (es. Utilità di pianificazione di Windows) e cosa succede quando il PC è spento (modalità "solo mercato").
- **Guida passo-passo alle chiavi API gratuite**: l'utente **non ha ancora nessuna chiave**. Per ogni servizio di quote e statistiche usato, scrivi come registrarsi gratuitamente, dove trovare la chiave, in quale variabile d'ambiente inserirla (in locale e sulla piattaforma di hosting) e quali sono i limiti del piano gratuito verificati. Gemini è solo un'opzione facoltativa e non serve per far funzionare l'app.
- Un controllo all'avvio che segnali in modo chiaro, nell'interfaccia e nei log, **quali chiavi mancano** e cosa non funziona di conseguenza, senza crash.
- Riepilogo finale: fonti dati scelte e verificate, campionati/mercati effettivamente coperti, cosa non è stato possibile coprire e perché.
