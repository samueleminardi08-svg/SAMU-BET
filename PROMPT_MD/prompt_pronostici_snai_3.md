# Prompt per Antigravity — SAMU BET: aggiornamento v1.1

Data di riferimento: **02/11/2026**.

Aggiornamento in 6 punti: (1) AI più potente, veloce e con più ragionamento; (2) filtro per campionato e coppa; (3) calendario e dati da OneFootball, altrimenti da una fonte aggiornata a oggi; (4) finestra temporale fino a 14 giorni; (5) nuova icona; (6) varietà delle selezioni nella schedina.

---

## 0. Contesto e regole di lavoro

- Il repository **APP PRONOSTICI** esiste già (monorepo, vedi `RECAP_TOTALE_APP.md`). Questo è un **aggiornamento incrementale**: non riscrivere ciò che funziona.
- **Prima di scrivere codice** produci un Implementation Plan con file toccati, rischi e verifiche esterne da fare.
- **Verifica tu ogni informazione esterna al 02/11/2026** (modelli disponibili, limiti dei piani gratuiti, endpoint, termini d'uso): i dati citati qui sotto vengono da fonti consultate di recente ma possono essere imprecisi o cambiati. Riporta nel piano ciò che hai verificato.
- **Resta invariato**: solo fonti gratuite; massimo 1 selezione per evento nella schedina; clamp della stima AI a ±10 punti percentuali dalla probabilità di mercato (**confermato dall'utente: non allargarlo**); modalità "solo mercato" come ultimo fallback; banner e avvisi di gioco responsabile; Local AI Bridge protetto da token.
- **Non aggiungere funzionalità oltre a quelle descritte** (vedi sezione 8).
- Alla fine: aggiorna test (Vitest), `README.md`, `.env.example` e `RECAP_TOTALE_APP.md`. `npm run test` e `npm run build` devono passare.

---

## 1. AI più intelligente, veloce e con maggiore ragionamento

**Stato attuale (dal recap)**: Gemini default `gemini-3.1-flash-lite`, fallback `gemini-3.5-flash-lite` → `gemma-4-26b-a4b-it`; locale Unsloth con un modello piccolo (≈4B) su CPU.

### 1.1 Modelli cloud
- Con `models.list` e la documentazione ufficiale, verifica quali modelli sono **gratuiti oggi**. Da fonti consultate a fine ottobre 2026 risulta che il piano gratuito include la famiglia **Flash più recente (Gemini 3.8 Flash, 3.6/3.7 Flash)** oltre ai Flash-Lite e a Gemma 4, mentre **Gemini 4 Argon e Gemini 3.1 Pro risultano solo a pagamento**. Conferma tu.
- Nuova catena a cascata (in caso di errore 429/5xx/timeout): **Flash più recente gratuito** (atteso `gemini-3.8-flash`) → Flash precedente → Flash-Lite → Gemma 4. Modelli configurabili da `.env`: `GEMINI_MODEL` e `GEMINI_FALLBACK_MODELS` (lista separata da virgole). Non inserire nel codice nomi non verificati.

### 1.2 Ragionamento controllato
- Usa il parametro di "thinking" del modello (verifica nome e valori nella documentazione attuale): livello **basso/medio** per le stime per evento (velocità), livello **più alto** solo per la revisione finale della schedina (1.4). Variabili: `GEMINI_THINKING_LEVEL_ESTIMATE`, `GEMINI_THINKING_LEVEL_REVIEW`.

### 1.3 Ricerca con grounding
- Usa **Google Search grounding** per infortuni, squalifiche, formazioni probabili, forma e motivazioni. Da fonti recenti la quota gratuita sembra di circa **5.000 prompt al mese** condivisa tra i modelli Gemini 3 e successivi: verifica.
- Contatore `GROUNDING_MONTHLY_BUDGET` (default 4000) con salvataggio persistente del consumo; usa il grounding **solo sui migliori candidati dopo il pre-filtro**. Se il budget è esaurito, usa il contesto dei feed RSS.
- Verifica se grounding e output JSON strutturato si possono combinare sul modello scelto. Se no, usa due passaggi: ricerca → conversione in JSON.

### 1.4 Pipeline AI in due stadi
- **Stadio A, stima per evento**: batch di eventi per richiesta, con concorrenza limitata nel rispetto degli RPM. Output validato con Zod: `p_ai`, `confidence`, `key_factors[]`, `red_flags[]`, `data_gaps[]`, `sources[]`.
- **Stadio B, revisione della schedina e varietà**: dopo che il motore ha composto una prima schedina, **una chiamata** con ragionamento più alto la valuta e restituisce `slipReview { verdict: "ok" | "attenzione" | "sconsigliata", warnings[], weakestLegId, suggestedSwap?, recommendedMaxSameMarket, diversityRationale }`. Considera: correlazioni tra le gambe, rotazioni e stanchezza, fattori di rischio, gamba più debole, qualità dei dati. **La revisione non modifica mai le probabilità.** L'unico parametro che l'AI può influenzare sul motore è `recommendedMaxSameMarket` (vedi 6.3). Il parere è mostrato come card **"Parere AI"**; `suggestedSwap`, se presente, appare solo come suggerimento.

### 1.5 Velocità e resilienza
- Cache lato server per evento+mercato (2 ore), timeout, retry con backoff, fallback a cascata.
- `/api/status` espone modello attivo, latenza media e consumo del budget grounding. Il badge in header mostra il motore in uso.

### 1.6 Qualità del prompt di stima
- Istruzioni per una stima calibrata: parti dalla probabilità di mercato come àncora, spostala solo con motivi concreti e verificabili, dichiara l'incertezza, **non inventare**. Se manca una fonte → `red_flags` e `confidence` bassa.
- Non modificare le formule del recap (clamp ±10pp, peso `w`) salvo nuova istruzione dell'utente.

### 1.7 Motore locale (Unsloth)
- Resta come motore **opzionale/offline**. Aggiorna il modello predefinito **solo** se verifichi un GGUF più capace e ancora usabile su CPU con 16 GB di RAM (indicativamente 7–8B quantizzato), con tempi stimati nel README.
- Ordine automatico: **Gemini → locale → solo mercato**.

### 1.8 Privacy
- Sul piano gratuito Google può usare prompt e risposte per migliorare i suoi prodotti. Invia **solo** dati su eventi sportivi, mai dati personali o chiavi. Aggiungi la nota nel README e nelle Impostazioni.

---

## 2. Filtro per campionato e coppa

- **Dove**: `SearchForm.tsx`, `types/models.ts`, i provider nel backend.
- **UI (mobile-first)**: pulsante "Competizioni" che apre un pannello a schermo intero con sezioni **Campionati | Coppe | Altro** (nazionali, amichevoli), ricerca testuale, raggruppamento per paese, selezione multipla, "Seleziona tutto / Nessuno", **numero di partite per competizione nella finestra temporale scelta**, contatore delle competizioni selezionate. Default: tutte. Preferenza salvata nel browser.
- **Classificazione campionato/coppa**: dizionario mantenibile `competitionsCatalog.ts` (id provider → nome italiano, paese, tipo), con euristica di ripiego sul titolo (Cup, Coppa, Pokal, Copa, Coupe, Champions League, Europa League, Conference League, Supercup, ...). Tipo sconosciuto → "Altro", mai una classificazione sbagliata silenziosa.
- **Dati**: costruisci l'elenco dalle competizioni realmente disponibili (per esempio l'endpoint `/v4/sports` di The Odds API, che di norma non consuma crediti: verifica) incrociato con il calendario della sezione 3. Mostra solo competizioni con partite nella finestra.
- **Backend**: nuovo parametro `competitions[]` in `/api/analyze`. Il filtro si applica **prima** delle chiamate che consumano quote API e richieste AI.
- 0 eventi dopo il filtro → messaggio chiaro con suggerimento (allarga la finestra o le competizioni).
- Il filtro vale per il **calcio**; tennis e Formula 1 restano con il selettore sport esistente.

---

## 3. Fonti dati e calendario (OneFootball, altrimenti fonte aggiornata al 02/11/2026)

**Cosa risulta (da ricontrollare)**: OneFootball **non offre una API pubblica ufficiale**. Esistono una API non documentata usata da wrapper della community e scraper a pagamento di terzi. I termini d'uso e il `robots.txt` non sono stati verificati.

### 3.1 Architettura
- Crea l'interfaccia `FixturesProvider` con `getFixtures({ from, to, competitions[] })` che restituisce eventi normalizzati: id, competizione, tipo (campionato/coppa/altro), squadre, `kickoffUTC`, stato, `sources[]`, `fetchedAt`.

### 3.2 OneFootball (opzionale, disattivato di default)
- `ONEFOOTBALL_ENABLED=false` di default. **Prima di implementare** leggi termini di servizio e `robots.txt`. Se l'uso automatico non è chiaramente consentito, **non implementarlo**: annotalo nel piano e nel README.
- Se lo implementi: solo calendario pubblico minimo, cache lunga, rate limit prudente, user-agent trasparente, nessun testo o immagine copiati, mai come unica fonte, disattivabile.

### 3.3 Catena predefinita (tutto gratuito, da verificare)
1. **The Odds API**: eventi per competizione con quote. È la **fonte canonica del calendario** perché coincide con ciò su cui si può puntare. Verifica se l'endpoint degli eventi non consuma crediti.
2. **football-data.org** (piano free: 12 competizioni, 10 richieste al minuto): classifiche, forma e calendario di quelle competizioni. Verifica se gli orari risultano ritardati nel piano gratuito.
3. **API-Football** (piano free: 100 richieste al giorno, in teoria tutte le competizioni incluse le coppe): per le competizioni non coperte (es. Serie B, Coppa Italia, Europa League). **Prima di fare affidamento verifica con una chiave reale se il piano gratuito include la stagione corrente 2026/27.** Contatore giornaliero e priorità per restare nel budget.
4. Se nessuna fonte ha il dato: dichiaralo nell'interfaccia. **Mai inventare dati.**

### 3.4 Unione dei dati
- Deduplica: stessa partita da più fonti → un solo evento (squadre normalizzate + kickoff entro ±3 ore). In caso di conflitto sull'orario prevale la fonte canonica.

### 3.5 Aggiornamento al 02/11/2026
- **Nessuna data hardcodata**: "oggi" = data corrente in fuso `Europe/Rome`.
- Mostra "Calendario aggiornato al GG/MM/AAAA HH:MM" con la fonte. Ricarica i dati in cache più vecchi del TTL. Escludi partite già iniziate o finite. Ordina per kickoff.
- `CoveredCompetitions.tsx`: per ogni competizione indica la fonte usata e le lacune (es. "solo quote, senza statistiche").

---

## 4. Finestra temporale fino a 2 settimane

- Opzioni: **Oggi | 48 ore | 7 giorni | 14 giorni**. Default invariato (48 ore). Aggiorna `SearchForm.tsx`, tipi, validazione del backend e `RECAP_TOTALE_APP.md`.
- Con 14 giorni gli eventi aumentano: pre-filtro più stretto e analisi AI solo sui migliori N candidati (N configurabile, senza aumentare i costi); liste virtualizzate o paginate; richieste suddivise per evitare timeout.
- Oltre circa 7 giorni le quote sono spesso poche o incomplete: segnala "quote limitate per eventi oltre 7 giorni" e non calcolare l'EV senza una quota reale o inserita a mano.
- F1: includi il prossimo Gran Premio se cade nella finestra. Tennis: tornei in corso o in programma.
- Rispetta il budget giornaliero di The Odds API (45 chiamate) e mostra l'impatto della finestra scelta.

---

## 5. Icona dell'app (5 proposte create da te con Nano Banana)

- **Nano Banana** è il modello Google di generazione immagini: verifica nome attuale e disponibilità nel tuo ambiente Antigravity. Usalo come **strumento di sviluppo integrato in Antigravity**, non dall'app a runtime e **senza chiamare API a pagamento**. Se non è disponibile nel piano dell'utente, **fermati su questo punto e segnalalo** invece di usare un servizio a pagamento.
- Genera **5 proposte diverse** per l'icona di SAMU BET, con concept variati (per esempio monogramma, pallone con andamento, indicatore di probabilità, schedina, bersaglio/quota), coerenti con lo stile dell'app: tema scuro, accenti fluo verde/ciano/ambra, aspetto premium, **niente estetica da casinò**, soggetto centrale, leggibile anche a 48×48 px. **Evita testo piccolo**: al massimo "SB" o "SAMU BET" grande e nitido.
- Specifiche: PNG quadrato **1024×1024**, soggetto nell'80% centrale (zona sicura per le icone maskable), sfondo pieno senza trasparenza e senza angoli arrotondati già applicati.
- Salvale in `frontend/public/icon-proposals/icon-1.png … icon-5.png` e crea una pagina di anteprima locale (`icon-preview.html`, **esclusa dalla build di produzione**) che le mostra affiancate a 512, 192 e 48 px, anche con maschera arrotondata e circolare (simulazione dei launcher Android e iOS).
- **Non sostituire l'icona attuale finché l'utente non ha scelto.** Fermati e chiedi: "Quale icona scegli (1–5)?".
- **Dopo la scelta**: genera `icon-192.png`, `icon-512.png`, una versione **maskable**, `apple-touch-icon` 180×180 e favicon; aggiorna `manifest.json` (icone con purpose `any` e `maskable`, `theme_color` e `background_color` coerenti con il tema scuro) e `index.html`, compresi i riferimenti che puntavano ai vecchi `icon-192.svg` e `icon-512.svg`; elimina le proposte non scelte e la pagina di anteprima. Verifica l'installazione PWA su Android e iOS (icona nitida, nessun bordo bianco).

---

## 6. Varietà della schedina (selezioni uguali)

**Situazione**: il beam search impone solo 1 selezione per partita, ma nulla impedisce che molte gambe siano lo stesso mercato e lo stesso esito (es. molte "Over 1.5").

**Causa probabile da verificare**: a parità di quota il motore sceglie il mercato con la probabilità più alta, che tende a essere sempre lo stesso. Inoltre i mercati derivati dal generatore Poisson/Dixon-Coles condividono gli stessi input (1X2 e Over/Under 2.5), quindi il loro errore di modello è **correlato** tra le partite.

### 6.1 Audit (prima di cambiare il codice)
- Genera schedine di test con vari Q/N/R e riporta la distribuzione di `mercato + esito`. Conferma o smentisci la causa.
- Verifica se le quote dei mercati derivati sono **quote reali di un bookmaker** oppure **prezzi generati dal modello**.

### 6.2 Tipo di fonte della quota
- Aggiungi `sourceType: "market" | "model"` a ogni selezione. Per `model`: badge "Quota stimata dal modello, verifica su SNAI"; l'EV è "indicativo" e **non entra nel punteggio** finché l'utente non inserisce la quota SNAI reale (override già esistente). Se le quote sono già reali, documentalo e non cambiare nulla.

### 6.3 Vincolo di varietà deciso dall'IA (modalità Auto, predefinita)
- Il limite di selezioni identiche (stesso mercato e stesso esito) **non è fisso: lo decide l'IA dell'app** in base alle sue valutazioni (correlazione tra le gambe, qualità dei dati, affidabilità delle quote derivate dal modello, numero di eventi, rischio scelto).
- Flusso:
  1. il motore costruisce una prima schedina **senza** vincolo di varietà;
  2. la revisione dello Stadio B (1.4) restituisce `recommendedMaxSameMarket` e `diversityRationale`;
  3. il motore **valida** il valore: intero tra 1 e `DIVERSITY_HARD_MAX` (default `max(2, ceil(N/2))`), poi ricostruisce la schedina con `maxSameMarketSelection` pari al valore validato, più una penalità morbida nel punteggio oltre la soglia;
  4. se la schedina cambia, esegui al massimo **una seconda revisione** per aggiornare il parere;
  5. mostra all'utente il limite applicato e il motivo in una riga.
- L'IA **non decide nient'altro**: probabilità, quote, clamp ±10 punti e vincoli di rischio restano deterministici.
- Se l'output dell'IA non è valido o l'IA non è disponibile → ripiego deterministico `MAX_SAME_MARKET_SELECTION` (default 3).
- Se il vincolo rende irraggiungibile la quota target, rilassalo gradualmente e avvisa ("schedina con molte selezioni dello stesso tipo").

### 6.4 Interfaccia
- Interruttore "Varietà" in `SearchForm`: **Auto (decide l'IA, predefinito)** / Alta / Normale / Nessun limite. Alta e Normale sono limiti fissi (per esempio 2 e 3) e **hanno la precedenza sull'IA**.
- Nel riepilogo schedina: "Concentrazione: X selezioni dello stesso tipo" e, in modalità Auto, il limite scelto dall'IA con il motivo breve.

### 6.5 Avviso sul calcolo
- La probabilità combinata `Π p_final` assume indipendenza. Con 3 o più gambe dello stesso tipo mostra una riga di avviso: "le stime condividono lo stesso modello, la probabilità reale può essere più bassa".

---

## 7. Test di accettazione (da aggiungere a `acceptance.test.ts`)

1. Con data di sistema simulata **02/11/2026** il calendario contiene solo partite future in `Europe/Rome` e mostra il timestamp di aggiornamento.
2. Filtro "solo coppe" → nessuna partita di campionato; 0 eventi → messaggio dedicato.
3. Finestra 14 giorni accettata dalla validazione e rispettata dal fetch; budget quote non superato.
4. Provider non disponibile → catena di fallback, nessun crash, dati mancanti dichiarati.
5. Deduplica: stessa partita da 2 fonti → 1 evento.
6. Catena AI: simulando 429 sul modello di default passa al fallback; senza Gemini → locale → solo mercato.
7. Clamp ±10pp invariato (il test esistente deve passare).
8. Varietà Auto: se l'IA raccomanda un valore fuori range (0, negativo o oltre `DIVERSITY_HARD_MAX`) il motore lo riporta nei limiti; se l'IA non è disponibile usa 3; la schedina finale non supera il limite applicato (salvo rilassamento segnalato). Con Alta/Normale il limite manuale prevale sull'IA.
9. La revisione della schedina non altera `p_final`.
10. `slipReview` con JSON non valido → ignorata senza errori.
11. Dopo la scelta dell'icona, `manifest.json` referenzia file esistenti 192 e 512 (any e maskable) e non restano riferimenti ai vecchi SVG.

---

## 8. Vincoli (cosa NON fare)

- Niente login, database, scommesse automatiche o servizi a pagamento.
- Niente linguaggio che prometta vincite ("sicuro", "garantito").
- Niente funzionalità oltre a quelle richieste in questo documento.
- Non usare OneFootball senza la verifica dei termini descritta in 3.2.
- Per le icone non usare API di generazione immagini a pagamento (vedi sezione 5).

---

## 9. Deliverable

- Codice aggiornato e test verdi.
- `.env.example` con le nuove variabili: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_THINKING_LEVEL_ESTIMATE`, `GEMINI_THINKING_LEVEL_REVIEW`, `GROUNDING_MONTHLY_BUDGET`, `API_FOOTBALL_KEY`, `FIXTURES_PROVIDER_ORDER`, `ONEFOOTBALL_ENABLED`, `MAX_SAME_MARKET_SELECTION` (ripiego se l'IA non è disponibile), `DIVERSITY_HARD_MAX`.
- `README.md` e `RECAP_TOTALE_APP.md` aggiornati (compresa la nuova finestra a 14 giorni, il filtro competizioni e la catena AI).
- Riepilogo finale: cosa è stato fatto, cosa è stato verificato (con data) e cosa non è stato possibile fare, con il motivo.
