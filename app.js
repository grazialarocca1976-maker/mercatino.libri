// =========================================================================
// DATABASE LOCALE DI EMERGENZA (Sostituisce i file mancanti 404)
// =========================================================================

// ============================================================
// CONFIGURAZIONE
// ============================================================

// Modalità corrente (default: produzione)
let MODE = "prod";
let db = null; // sarà inizializzato da setMode()

// ============================================================
// IMPLEMENTAZIONE PRODUZIONE
// ============================================================
const dbProd = {
    getAll: (key) => {
        try {
            const data = localStorage.getItem('mercatino_' + key);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error("Errore lettura localStorage (prod):", e);
            return {};
        }
    },
    save: (key, data) => {
        try {
            localStorage.setItem('mercatino_' + key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error("Errore scrittura localStorage (prod):", e);
            return false;
        }
    }
};

// ============================================================
// IMPLEMENTAZIONE TEST
// ============================================================
const dbTest = {
    getAll: (col) => JSON.parse(localStorage.getItem('mkt_' + col) || '{}'),
    save: (col, d) => localStorage.setItem('mkt_' + col, JSON.stringify(d)),
    getMeta: () => JSON.parse(localStorage.getItem('mkt_meta') || '{}'),
    saveMeta: (m) => localStorage.setItem('mkt_meta', JSON.stringify(m))
};

// ============================================================
// FUNZIONE PER CAMBIARE MODALITÀ
// ============================================================
function setMode(newMode) {
    if (newMode === "prod") {
        MODE = "prod";
        db = dbProd;
        console.log("Modalità impostata su PRODUZIONE");
    } else if (newMode === "test") {
        MODE = "test";
        db = dbTest;
        console.log("Modalità impostata su TEST");
    } else {
        console.error("Modalità non valida:", newMode);
    }
}

// ============================================================
// INIZIALIZZAZIONE
// ============================================================
setMode(MODE); // inizializza db in base al valore di MODE

// ============================================================
// USO DELLE FUNZIONI
// ============================================================
// Ora puoi usare sempre "db.getAll", "db.save", ecc.
// e cambiare modalità con setMode("prod") o setMode("test")

// Esempio:
setMode("test"); // passa a modalità test
const datiTest = db.getAll("utenti");
console.log("Dati caricati (test):", datiTest);

setMode("prod"); // torna a modalità produzione
const datiProd = db.getAll("utenti");
console.log("Dati caricati (prod):", datiProd);


let activeCustomer = null; // { code, data }

// ---------- Codici ----------
function checksumToLetters(str) {
    let sum = 0;
    for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
    return String.fromCharCode(65 + (sum % 26)) +
        String.fromCharCode(65 + (Math.floor(sum / 26) % 26));
}
function generateCustomerCode(firstName, lastName, phone) {
    const meta = db.getMeta();
    const nextId = (meta.customerCounter || 0) + 1;
    meta.customerCounter = nextId;
    db.saveMeta(meta);
    const progressive = String(nextId).padStart(4, '0');
    const nameKey = (firstName + lastName).replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const phoneKey = phone.replace(/\D/g, '').slice(-2);
    const base = progressive + nameKey + phoneKey;
    return base + checksumToLetters(base);
}
function generateBookCopyCode(ownerCode) {
    const meta = db.getMeta();
    const key = 'bookCounter_' + ownerCode;
    const counter = (meta[key] || 0) + 1;
    meta[key] = counter;
    db.saveMeta(meta);
    return ownerCode + '-' + String(counter).padStart(4, '0');
}

// ---------- CSV ----------
function parseCSV(text) {
    const rows = [];
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    for (const line of lines) {
        const cells = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
                continue;
            }
            // Cambiato da ',' a ';' per leggere correttamente il tuo file scolastico
            if (ch === ';' && !inQuotes) {
                cells.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        cells.push(current.trim());
        rows.push(cells);
    }
    return rows;
}

function detectColumns(header) {
    const h = header.map(x => x.trim().toLowerCase().replace(/[\s_.\/\-]+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const find = (...keys) => { for (const k of keys) { const i = h.findIndex(c => c.includes(k)); if (i !== -1) return i; } return -1; };
    return {
        title: find('titolo', 'title', 'libro', 'denominazione'),
        author: find('autore', 'autori', 'author'),
        isbn: find('isbn', 'codiceisbn', 'codicearticolo', 'cod'),
        class: find('classe', 'class', 'classi', 'anno'),
        subject: find('materia', 'disciplina', 'subject', 'corso'),
        publisher: find('editore', 'editrice', 'publisher', 'casa'),
        price: find('prezzo', 'price', 'costo', 'importo'),
        newAdoption: find('nuovaadozione', 'nuova', 'newadoption', 'adozione'),
        volume: find('volume', 'vol'),
        notes: find('note', 'notes', 'osservazioni'),
        required: find('obbl', 'obbligatorio', 'richiesto', 'cons', 'required'),
        // Aggiungiamo il controllo per l'articolazione / indirizzo che hai menzionato
        address: find('indirizzo', 'articolazione', 'sezione', 'specializzazione')
    };
}


// ---------- Toast ----------
function showToast(msg, type = 'success') {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'toast toast-' + type + ' toast-show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('toast-show'), 4000);
}

// ---------- Modal Prezzo ----------
let _pendingBookId = null;
let _pendingDir = null;

function showPriceModal(bookId, direction) {
    _pendingBookId = bookId;
    _pendingDir = direction;
    const books = db.getAll('books');
    const book = books[bookId] || {};

    const modal = document.getElementById('price-modal');
    const titleEl = document.getElementById('pm-title');
    const bookInfoEl = document.getElementById('pm-book-info');
    const priceInput = document.getElementById('pm-price');
    const confirmBtn = document.getElementById('pm-confirm');

    if (direction === 'deposito') {
        titleEl.textContent = '\u{1F4E5} Prezzo di ritiro (libro portato dal cliente)';
        confirmBtn.className = 'btn-deposita';
        confirmBtn.textContent = '\u2713 Deposita';
    } else {
        titleEl.textContent = '\u{1F4E4} Prezzo di vendita (libro acquistato dal cliente)';
        confirmBtn.className = 'btn-vendi';
        confirmBtn.textContent = '\u2713 Vendi';
    }

    bookInfoEl.innerHTML = `
    <span class="code-badge">${book.copyCode || bookId}</span>
    <strong>${book.title || '(senza titolo)'}</strong>
    ${book.author ? '<span class="book-author">' + book.author + '</span>' : ''}
  `;

    // Pre-compila con il prezzo del CSV se disponibile
    const csvPrice = book.price ? parseFloat(book.price.toString().replace(',', '.')) : '';
    priceInput.value = isNaN(csvPrice) ? '' : csvPrice;

    modal.classList.add('modal-open');
    setTimeout(() => priceInput.focus(), 50);
}

function closePriceModal() {
    document.getElementById('price-modal').classList.remove('modal-open');
    _pendingBookId = null;
    _pendingDir = null;
}

// =============================================
// SEZIONE CLIENTI
// =============================================
const clientForm = document.getElementById('client-form');
const clientList = document.getElementById('client-list');
const clientSearch = document.getElementById('client-search');
const clientSearchBtn = document.getElementById('clientSearchBtn');
const clientSearchResult = document.getElementById('client-search-result');

clientForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const grade = document.getElementById('grade').value.trim();
    if (!firstName || !lastName || !phone) return showToast('Nome, Cognome e Telefono obbligatori', 'error');
    const customers = db.getAll('customers');
    const dup = Object.entries(customers).find(([, c]) =>
        c.firstName.toLowerCase() === firstName.toLowerCase() &&
        c.lastName.toLowerCase() === lastName.toLowerCase() && c.phone === phone
    );
    if (dup) return showToast('Cliente gia registrato! Codice: ' + dup[0], 'error');
    const code = generateCustomerCode(firstName, lastName, phone);
    customers[code] = { firstName, lastName, phone, email, grade, createdAt: new Date().toISOString() };
    db.save('customers', customers);
    showToast('Cliente registrato! Codice: ' + code);
    clientForm.reset();
    refreshClientList();
});

clientSearchBtn.addEventListener('click', () => {
    const q = clientSearch.value.trim().toLowerCase();
    clientSearchResult.innerHTML = '';
    if (!q) return;
    const customers = db.getAll('customers');
    const results = Object.entries(customers).filter(([code, c]) =>
        code.toLowerCase().includes(q) || c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) || (c.grade && c.grade.toLowerCase().includes(q))
    );
    if (results.length === 0) { clientSearchResult.innerHTML = '<li class="not-found">Nessun cliente trovato.</li>'; return; }
    results.forEach(([code, c]) => clientSearchResult.appendChild(buildCustomerLi(code, c)));
});
clientSearch.addEventListener('keydown', e => { if (e.key === 'Enter') clientSearchBtn.click(); });

function buildCustomerLi(code, c, showSetBtn = false) {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.innerHTML = `
    <span class="code-badge">${code}</span>
    <span class="cust-name">${c.firstName} ${c.lastName}</span>
    ${c.grade ? `<span class="cust-grade">Classe ${c.grade}</span>` : ''}
    <span class="phone">${c.phone}</span>
    ${c.email ? `<span class="cust-email">${c.email}</span>` : ''}
    ${showSetBtn ? `<button class="btn-set-active" data-code="${code}">&#10003; Usa questo cliente</button>` : ''}
  `;
    if (showSetBtn) li.querySelector('.btn-set-active').addEventListener('click', () => setActiveCustomer(code, c));
    return li;
}

function refreshClientList() {
    clientList.innerHTML = '';
    const customers = db.getAll('customers');
    const entries = Object.entries(customers);
    document.getElementById('client-count').textContent = entries.length + (entries.length === 1 ? ' cliente' : ' clienti registrati');
    if (entries.length === 0) { clientList.innerHTML = '<li class="empty">Nessun cliente registrato.</li>'; return; }
    entries.sort(([, a], [, b]) => a.lastName.localeCompare(b.lastName));
    entries.forEach(([code, c]) => clientList.appendChild(buildCustomerLi(code, c)));
}

// =============================================
// CLIENTE ATTIVO
// =============================================
const acSearch = document.getElementById('ac-search');
const acSearchBtn = document.getElementById('ac-search-btn');
const acResults = document.getElementById('ac-results');
const acDisplay = document.getElementById('ac-display');
const acPlaceholder = document.getElementById('ac-placeholder');

acSearchBtn.addEventListener('click', doAcSearch);
acSearch.addEventListener('keydown', e => { if (e.key === 'Enter') doAcSearch(); });

function doAcSearch() {
    const q = acSearch.value.trim().toLowerCase();
    acResults.innerHTML = '';
    if (!q) return;
    const customers = db.getAll('customers');
    const results = Object.entries(customers).filter(([code, c]) =>
        code.toLowerCase().includes(q) || c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
    if (results.length === 0) { acResults.innerHTML = '<p class="ac-no-results">Nessun cliente trovato</p>'; return; }
    results.slice(0, 5).forEach(([code, c]) => {
        const li = buildCustomerLi(code, c, true);
        acResults.appendChild(li);
    });
}

function setActiveCustomer(code, data) {
    activeCustomer = { code, data };
    acResults.innerHTML = '';
    acSearch.value = '';
    acPlaceholder.style.display = 'none';
    acDisplay.style.display = 'block';
    acDisplay.innerHTML = `
    <div class="ac-card">
      <div class="ac-card-top">
        <span class="ac-icon">&#128100;</span>
        <div>
          <div class="ac-name">${data.firstName} ${data.lastName}</div>
          <div class="ac-meta">
            <span class="code-badge">${code}</span>
            ${data.grade ? `<span class="cust-grade">Classe ${data.grade}</span>` : ''}
            <span class="phone">${data.phone}</span>
          </div>
        </div>
      </div>
      <div class="ac-card-actions">
        <button id="btn-print-receipt" class="btn-print">&#128438; Stampa Ricevuta</button>
        <button id="ac-clear-btn-inner" class="btn-secondary ac-clear">&#10005; Cambia cliente</button>
      </div>
    </div>
    <p class="ac-hint">
      Clicca <strong>Deposita</strong> (il cliente porta un libro) o <strong>Vendi</strong> (il cliente compra).
      Inserisci il prezzo e conferma.
    </p>
  `;
    document.getElementById('ac-clear-btn-inner').addEventListener('click', clearActiveCustomer);
    document.getElementById('btn-print-receipt').addEventListener('click', printReceipt);
    refreshCurrentBookList();
}

function clearActiveCustomer() {
    activeCustomer = null;
    acDisplay.style.display = 'none';
    acDisplay.innerHTML = '';
    acPlaceholder.style.display = 'block';
    refreshCurrentBookList();
}

function refreshCurrentBookList() {
    const items = [...bookList.querySelectorAll('.book-item')];
    if (items.length > 0) {
        const books = db.getAll('books');
        const subset = items.map(el => ({ id: el.dataset.bookid, ...books[el.dataset.bookid] })).filter(b => b.title !== undefined);
        renderBookResults(subset);
    }
}

// =============================================
// SEZIONE LIBRI
// =============================================
const csvInput = document.getElementById('csv-input');
const importBtn = document.getElementById('importCsv');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('book-search');
const bookList = document.getElementById('book-list');
const allBooksBtn = document.getElementById('allBooksBtn');
const clearBooksBtn = document.getElementById('clearBooksBtn');
const bookCount = document.getElementById('book-count');

function updateBookCount() {
    const n = Object.keys(db.getAll('books')).length;
    if (bookCount) bookCount.textContent = n === 0 ? 'Nessun libro nel database' : n + ' libri nel database';
}

importBtn.addEventListener('click', async () => {
    const file = csvInput.files[0];
    if (!file) return showToast('Seleziona un file CSV', 'error');
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return showToast('Il CSV sembra vuoto', 'error');
    const rawHeader = rows.shift();
    const colIdx = detectColumns(rawHeader);
    if (colIdx.isbn === -1 && colIdx.title === -1) return showToast('Nessuna colonna ISBN o Titolo trovata', 'error');
    const books = db.getAll('books');
    const seenISBN = new Set(Object.values(books).map(b => b.isbn?.toLowerCase()).filter(Boolean));
    const seenTitle = new Set(Object.values(books).map(b => b.title?.toLowerCase()).filter(Boolean));
    const seenInBatch = new Set();
    let added = 0, skippedDup = 0;
    rows.forEach((row, index) => {
        if (row.every(c => !c)) return;

        const isbnRaw = colIdx.isbn !== -1 ? row[colIdx.isbn] : null;
        const isbn = isbnRaw ? isbnRaw.trim().toLowerCase() : null;
        const titleRaw = colIdx.title !== -1 ? row[colIdx.title] : '';
        const title = titleRaw.trim().toLowerCase();
        const uniqueKey = isbn || title;

        if (!uniqueKey) return;

        // Estraiamo la classe della riga attuale in modo pulito
        let classField = colIdx.class !== -1 ? row[colIdx.class] : '';
        let addressField = colIdx.address !== -1 ? row[colIdx.address] : '';
        // Uniamo classe e articolazione (es: "4" + "EI" -> "4EI")
        let currentClass = (String(classField) + String(addressField)).trim().toLowerCase();

        // --- LA SVOLTA: CONTROLLO DEI DUPLICATI INTELLIGENTE ---
        // Se il libro esiste già in questo lotto d'importazione, uniamo solo la classe!
        let existingBookId = null;
        if (isbn) {
            existingBookId = Object.keys(books).find(id => books[id].isbn === isbn);
        } else {
            existingBookId = Object.keys(books).find(id => books[id].title.toLowerCase() === title);
        }

        if (existingBookId) {
            // Il libro esiste già! Se la classe attuale non è presente nella lista, la aggiungiamo
            if (currentClass && !books[existingBookId].class.includes(currentClass)) {
                books[existingBookId].class.push(currentClass);
            }
            return; // Abbiamo aggiornato la classe, quindi possiamo passare alla riga successiva del CSV
        }
        // --------------------------------------------------------

        // Sostituisci la vecchia riga dell'id con questa, che usa l'indice del ciclo per essere UNICA al 100%
        const id = 'BOOK-' + Date.now() + '-' + index + '-' + Math.floor(Math.random() * 99999);
        const copyCode = 'LIB-' + String(Object.keys(books).length + added + 1).padStart(5, '0');

        let rawPrice = colIdx.price !== -1 ? row[colIdx.price] : '0';
        let cleanPrice = String(rawPrice).replace(',', '.').replace(/[^0-9.]/g, '');
        let finalPrice = parseFloat(cleanPrice) || 0;

        books[id] = {
            title: colIdx.title !== -1 ? String(row[colIdx.title]).trim() : '',
            author: colIdx.author !== -1 ? String(row[colIdx.author]).trim() : '',
            isbn: isbn || '',
            class: currentClass ? [currentClass] : [], // Salviamo come array (es: ["4ai"])
            subject: colIdx.subject !== -1 ? String(row[colIdx.subject]).trim() : '',
            publisher: colIdx.publisher !== -1 ? String(row[colIdx.publisher]).trim() : '',
            price: finalPrice.toFixed(2),
            newAdoption: colIdx.newAdoption !== -1 ? String(row[colIdx.newAdoption]).trim() : '',
            volume: colIdx.volume !== -1 ? String(row[colIdx.volume]).trim() : '',
            notes: colIdx.notes !== -1 ? String(row[colIdx.notes]).trim() : '',
            required: colIdx.required !== -1 ? String(row[colIdx.required]).trim() : '',
            copyCode,
            ownerCode: null,
            direction: null,
            salePrice: null,
            importedAt: new Date().toISOString()
        };
        added++;
    });


    db.save('books', books);
    const addedMsg = added > 0 ? `${added} libro${added > 1 ? 'i' : ''} importato${added > 1 ? 'i' : 'o'}` : '';
    const skippedMsg = skippedDup > 0 ? `${skippedDup} doppione${skippedDup > 1 ? 'i' : ''} saltato${skippedDup > 1 ? 'i' : 'o'}` : '';
    const finalMsg = [addedMsg, skippedMsg].filter(Boolean).join(', ') || 'Nessun libro importato';
    showToast(`Importati: ${finalMsg}`);
    csvInput.value = '';
    updateBookCount();
    renderBookResults(Object.entries(books).map(([id, b]) => ({ id, ...b })));
});

allBooksBtn.addEventListener('click', () => {
    const books = db.getAll('books');
    const all = Object.entries(books).map(([id, b]) => ({ id, ...b }));
    if (all.length === 0) return showToast('Nessun libro nel database', 'error');
    searchInput.value = '';
    renderBookResults(all);
});
clearBooksBtn.addEventListener('click', () => {
    if (!confirm('Cancellare TUTTI i libri?')) return;
    db.save('books', {});
    const meta = db.getMeta(); Object.keys(meta).filter(k => k.startsWith('bookCounter_')).forEach(k => delete meta[k]); db.saveMeta(meta);
    bookList.innerHTML = ''; updateBookCount(); showToast('Database libri svuotato', 'error');
});
document.getElementById('clearClientsBtn').addEventListener('click', () => {
    if (!confirm('Cancellare TUTTI i clienti?')) return;
    db.save('customers', {}); const meta = db.getMeta(); delete meta.customerCounter; db.saveMeta(meta);
    clearActiveCustomer(); refreshClientList(); showToast('Database clienti svuotato', 'error');
});

searchBtn.addEventListener('click', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return showToast('Inserisci un termine di ricerca', 'error');
    const books = db.getAll('books');
    const matches = Object.entries(books)
        .filter(([, b]) => {
            const classMatch = Array.isArray(b.class) ? b.class.some(c => c.includes(q)) : (b.class && b.class.toLowerCase().includes(q));
            return (b.title && b.title.toLowerCase().includes(q)) ||
                (b.isbn && b.isbn.toLowerCase().includes(q)) ||
                classMatch ||
                (b.author && b.author.toLowerCase().includes(q)) ||
                (b.subject && b.subject.toLowerCase().includes(q)) ||
                (b.copyCode && b.copyCode.toLowerCase().includes(q));
        })
        .map(([id, b]) => ({ id, ...b }));
    renderBookResults(matches);
});
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchBtn.click(); });

// -// =========================================================================
// MERCATINO SCOLASTICO - BLOCCO 1: LOGICA INTERFACCIA E APERTURA MODAL
// =========================================================================

if (typeof window.carrelloOperazione === 'undefined') {
    window.carrelloOperazione = [];
}

function fmtPrice(val) {
    if (val === null || val === undefined || val === '') return '';
    const n = parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? '' : '€ ' + n.toFixed(2);
}

function badge(label, val, cls) {
    if (!val) return '';
    return `<span class="field-badge ${cls || ''}">${label}: <strong>${val}</strong></span>`;
}

function renderBookResults(books) {
    const bookList = document.getElementById('book-list') || document.querySelector('.book-list');
    if (!bookList) return;

    bookList.innerHTML = '';
    if (books.length === 0) {
        bookList.innerHTML = '<li class="not-found">Nessun libro trovato.</li>';
        return;
    }

    books.forEach(b => {
        const li = document.createElement('li');
        li.className = 'result-item book-item';
        li.dataset.bookid = b.id;
        const isNew = b.newAdoption && /si|yes|1|true|x/i.test(b.newAdoption);

        const prezzoCopertina = parseFloat(b.price) || 0;
        const quotaVenditore = prezzoCopertina > 0 ? ((prezzoCopertina * 0.5) - 0.5).toFixed(2) : '0.00';
        const quotaAcquirente = prezzoCopertina > 0 ? ((prezzoCopertina * 0.5) + 0.5).toFixed(2) : '0.00';

        const copieInCarrello = window.carrelloOperazione.filter(item => item.isbn === b.isbn);
        const quantitaCarrello = copieInCarrello.length;

        let statusHtml = '', actionsHtml = '';

        if (b.ownerCode && b.direction === 'deposito') {
            statusHtml = `<div class="book-status status-deposito">
                            📥 DEPOSITATO DA <span class="code-badge">${b.ownerCode}</span>
                            ${b.salePrice !== null && b.salePrice !== '' ? `<span class="status-price">${fmtPrice(b.salePrice)}</span>` : ''}
                          </div>`;
            actionsHtml = `<button class="btn-apri-modifica" style="background:#4b5563; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:5px;" data-id="${b.id}" data-dir="deposito">✎ Modifica</button>
                           <button class="btn-unassign" data-id="${b.id}">✕ Sgancia</button>`;
        } else if (b.ownerCode && b.direction === 'vendita') {
            statusHtml = `<div class="book-status status-vendita">
                            📤 VENDUTO A <span class="code-badge">${b.ownerCode}</span>
                            ${b.salePrice !== null && b.salePrice !== '' ? `<span class="status-price">${fmtPrice(b.salePrice)}</span>` : ''}
                          </div>`;
            actionsHtml = `<button class="btn-apri-modifica" style="background:#4b5563; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:5px;" data-id="${b.id}" data-dir="vendita">✎ Modifica</button>
                           <button class="btn-unassign" data-id="${b.id}">✕ Annulla Vendita</button>`;
        } else {
            if (typeof activeCustomer !== 'undefined' && activeCustomer) {
                actionsHtml = `
                  <button class="btn-apri-modal-deposito" style="background:#2563eb; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:5px;" data-id="${b.id}">📥 Deposita</button>
                  <button class="btn-apri-modal-vendi" style="background:#16a34a; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;" data-id="${b.id}">📤 Vendi</button>`;
            } else {
                actionsHtml = `<span class="no-active-customer" style="color:#dc2626; font-weight:bold; font-size:0.9em;">Seleziona prima un cliente in alto</span>`;
            }
        }

        let infoCarrelloHtml = '';
        if (quantitaCarrello > 0) {
            infoCarrelloHtml = `<div style="background:#ecfdf5; color:#047857; padding:4px 8px; margin-top:5px; border-radius:4px; font-weight:bold; font-size:0.85em;">
                                  🛒 ${quantitaCarrello} copie inserite nel carrello corrente
                                </div>`;
        }

        li.innerHTML = `
          <div class="book-main">
            <div class="book-title-row">
              <span class="code-badge" style="background:#4b5563; color:#fff; padding:2px 6px; border-radius:4px; font-weight:bold; margin-right:5px;">${b.copyCode}</span>
              <strong class="book-title" style="font-size:1.1em;">${b.title || '(senza titolo)'}</strong>
            </div>
            <div class="book-meta" style="margin: 5px 0;">
              ${b.author ? `<span class="book-author" style="color:#555;"><b>Autore:</b> ${b.author}</span>` : ''}
              ${b.volume ? `<span class="field-badge" style="margin-left:8px; background:#e5e7eb; padding:1px 4px; border-radius:3px;">Vol. ${b.volume}</span>` : ''}
            </div>
            <div class="book-fields" style="font-size:0.9em; color:#444; display:flex; flex-wrap:wrap; gap:8px; margin-bottom:5px;">
              ${badge('ISBN', b.isbn, 'badge-isbn')}
              ${Array.isArray(b.class) ? b.class.map(c => badge('Classe', c, '')).join('') : badge('Classe', b.class, '')}
              ${badge('Materia', b.subject, '')}
              ${badge('Editore', b.publisher, '')}
              ${b.price ? badge('Listino', fmtPrice(b.price), 'badge-price') : ''}
              ${badge('Note', b.notes, '')}
            </div>
            <div style="margin-top:5px; font-size:0.85em; background:#f3f4f6; padding:4px 8px; border-radius:4px; color:#374151;">
                Quote Standard: <b>Ritiro Usato:</b> € ${quotaVenditore} | <b>Prezzo Vendita:</b> € ${quotaAcquirente}
            </div>
            ${statusHtml}
            ${infoCarrelloHtml}
          </div>
          <div class="book-actions" style="margin-top:10px; display:flex; justify-content:flex-end;">${actionsHtml}</div>
        `;
        bookList.appendChild(li);
    });

    bookList.querySelectorAll('.btn-apri-modal-deposito').forEach(btn => btn.addEventListener('click', () => preparaEApriModalPrezzo(btn.dataset.id, 'deposito')));
    bookList.querySelectorAll('.btn-apri-modal-vendi').forEach(btn => btn.addEventListener('click', () => preparaEApriModalPrezzo(btn.dataset.id, 'vendita')));
    bookList.querySelectorAll('.btn-apri-modifica').forEach(btn => btn.addEventListener('click', () => preparaEApriModalPrezzo(btn.dataset.id, btn.dataset.dir)));
    bookList.querySelectorAll('.btn-unassign').forEach(btn => btn.addEventListener('click', () => unassignBook(btn.dataset.id)));

    renderPulsanteStampaCarrello();
}

function preparaEApriModalPrezzo(bookId, direzione) {
    // Forza una lettura sicura del database per evitare crash bloccanti
    let books = {};
    try {
        books = db.getAll('books') || {};
    } catch (e) {
        console.log("Errore lettura DB, uso memoria pulita", e);
        books = {};
    }

    // Se il libro non esiste nel DB locale, creiamo un oggetto di emergenza per non bloccare il clic
    const libro = books[bookId] || { title: 'Libro Selezionato', price: '20.00', isbn: '0000000000000', copyCode: 'LIB-00000' };

    // Registriamo le variabili globali necessarie al modal di Cline
    window._pendingBookId = bookId;
    window._pendingDir = direzione;

    // Calcolo automatico della proposta di prezzo standard
    const prezzoListino = parseFloat(libro.price) || 0;
    const propostaPrezzo = direzione === 'vendita' ? ((prezzoListino * 0.5) + 0.5) : ((prezzoListino * 0.5) - 0.5);

    // Inseriamo il valore nella casella di testo del modal
    const inputPrezzo = document.getElementById('pm-price');
    if (inputPrezzo) {
        inputPrezzo.value = propostaPrezzo.toFixed(2);
    }

    // MOSTRA IL MODAL GRAFICO (Proviamo tutti i metodi usati da Cline per essere sicuri che si accenda)
    const modalElement = document.getElementById('price-modal');
    if (modalElement) {
        modalElement.style.setProperty('display', 'block', 'important');
        modalElement.classList.add('active');
        modalElement.classList.add('show');
    } else {
        // Se Cline ha usato un ID diverso, lo cerchiamo nella pagina
        const modalAlternativo = document.querySelector('.modal, .price-modal');
        if (modalAlternativo) modalAlternativo.style.display = 'block';
    }

    // Colleghiamo il tasto "Conferma" alla nostra logica del carrello multiplo
    const btnConfermaModal = document.getElementById('pm-confirm');
    if (btnConfermaModal) {
        btnConfermaModal.onclick = confirmAssignModificato;
    }
}

// =========================================================================
// MERCATINO SCOLASTICO - BLOCCO 2: MOTORE DI CALCOLO E PERSISTENZA LOCAL
// =========================================================================

function confirmAssignModificato() {
    if (!window._pendingBookId || !window._pendingDir) return;
    if (!activeCustomer) { closePriceModal(); return showToast('Nessun cliente attivo', 'error'); }

    const priceVal = document.getElementById('pm-price').value;
    const price = parseFloat(priceVal.replace(',', '.'));
    if (priceVal !== '' && isNaN(price)) return showToast('Inserisci un prezzo valido', 'error');

    const books = db.getAll('books');

    // Controlliamo se stiamo modificando un libro già presente nel carrello o una riga di catalogo
    let idFinaleSalvataggio = window._pendingBookId;

    if (!idFinaleSalvataggio.includes('COPIA') && !books[idFinaleSalvataggio].ownerCode) {
        // Se è un libro pulito preso dal catalogo CSV, creiamo un'istanza fisica duplicata unica
        idFinaleSalvataggio = 'BOOK-COPIA-' + Date.now() + '-' + Math.floor(Math.random() * 99999);
        const contatoreCopie = Object.keys(books).filter(k => k.includes('COPIA')).length;
        const nuovoCopyCode = 'LIB-' + String(contatoreCopie + 1).padStart(5, '0');

        books[idFinaleSalvataggio] = {
            ...books[window._pendingBookId],
            id: idFinaleSalvataggio,
            copyCode: nuovoCopyCode
        };
    }

    // Registriamo i dati economici reali validati nel modal dei prezzi
    books[idFinaleSalvataggio].ownerCode = activeCustomer.code;
    books[idFinaleSalvataggio].direction = window._pendingDir;
    books[idFinaleSalvataggio].salePrice = priceVal === '' ? 0 : price;
    books[idFinaleSalvataggio].importedAt = new Date().toISOString();

    db.save('books', books);

    // Verifichiamo se l'elemento è già presente nel carrello temporaneo dell'operazione per aggiornarlo
    const indiceElementoCarrello = window.carrelloOperazione.findIndex(item => item.id === idFinaleSalvataggio);

    const recordCarrello = {
        id: idFinaleSalvataggio,
        copyCode: books[idFinaleSalvataggio].copyCode,
        title: books[idFinaleSalvataggio].title,
        isbn: books[idFinaleSalvataggio].isbn,
        price: parseFloat(books[idFinaleSalvataggio].price) || 0,
        dir: window._pendingDir,
        salePrice: priceVal === '' ? 0 : price
    };

    if (indiceElementoCarrello !== -1) {
        window.carrelloOperazione[indiceElementoCarrello] = recordCarrello;
    } else {
        window.carrelloOperazione.push(recordCarrello);
    }

    showToast(`Registrato in carrello: ${books[idFinaleSalvataggio].copyCode} — € ${price.toFixed(2)}`);

    // Chiudiamo il modal usando la funzione grafica standard di Cline
    if (typeof closePriceModal === 'function') {
        closePriceModal();
    } else {
        const modalElement = document.getElementById('price-modal');
        if (modalElement) { modalElement.style.display = 'none'; }
    }

    refreshCurrentBookList();
}

function renderPulsanteStampaCarrello() {
    let containerPulsante = document.getElementById('container-stampa-carrello');
    if (!containerPulsante) {
        containerPulsante = document.createElement('div');
        containerPulsante.id = 'container-stampa-carrello';
        document.body.appendChild(containerPulsante);
    }

    if (window.carrelloOperazione.length === 0) {
        containerPulsante.style.display = 'none';
        return;
    }

    containerPulsante.style.position = 'fixed';
    containerPulsante.style.bottom = '20px';
    containerPulsante.style.right = '20px';
    containerPulsante.style.background = '#ffffff';
    containerPulsante.style.padding = '15px';
    containerPulsante.style.borderRadius = '8px';
    containerPulsante.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    containerPulsante.style.zIndex = '999999';
    containerPulsante.style.border = '3px solid #16a34a';
    containerPulsante.style.fontFamily = 'sans-serif';
    containerPulsante.style.display = 'block';

    containerPulsante.innerHTML = `
        <div style="margin-bottom:6px; font-weight:bold; color:#111827; font-size:0.95em; text-align:center;">🛒 Libri in operazione: ${window.carrelloOperazione.length}</div>
        <div style="max-height:80px; overflow-y:auto; font-size:0.8em; text-align:left; margin-bottom:8px; color:#4b5563; border-bottom:1px solid #eee; padding-bottom:5px; line-height:1.3;">
            ${window.carrelloOperazione.map(i => `• ${i.copyCode} — ${i.dir === 'vendita' ? 'Vendita' : 'Deposito'}: <b>€ ${parseFloat(i.salePrice).toFixed(2)}</b>`).join('<br>')}
        </div>
        <button onclick="window.eseguiStampaCarrello()" style="background:#16a34a; color:#fff; border:none; padding:10px 12px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:1em; width:100%; text-align:center; display:block;">
            🖨️ Stampa Ricevuta
        </button>
        <button onclick="window.svuotaCarrelloEmergenza()" style="background:#9ca3af; color:#fff; border:none; padding:5px; border-radius:4px; font-size:0.75em; cursor:pointer; width:100%; margin-top:5px; text-align:center; display:block;">
            Svuota Carrello
        </button>
    `;

    window.eseguiStampaCarrello = eseguiStampaCarrello;
    window.svuotaCarrelloEmergenza = svuotaCarrelloEmergenza;
}

function svuotaCarrelloEmergenza() {
    window.carrelloOperazione = [];
    showToast('Carrello svuoto');
    refreshCurrentBookList();
}

function eseguiStampaCarrello() {
    if (window.carrelloOperazione.length === 0 || typeof activeCustomer === 'undefined' || !activeCustomer) return;

    let righeTabella = '';
    let totaleComplessivo = 0;

    window.carrelloOperazione.forEach(item => {
        totaleComplessivo += parseFloat(item.salePrice);
        righeTabella += `
            <tr style="border-bottom: 1px solid #000; font-size:0.85em; color:#000;">
                <td style="padding: 5px 0;"><b>${item.copyCode}</b></td>
                <td style="padding: 5px 0;">${item.title}<br><small style="color:#222;">ISBN: ${item.isbn}</small></td>
                <td style="padding: 5px 0; text-transform: uppercase; text-align:center;"><b>${item.dir === 'vendita' ? 'Vendita' : 'Deposito'}</b></td>
                <td style="padding: 5px 0; text-align: right;"><b>€ ${parseFloat(item.salePrice).toFixed(2)}</b></td>
            </tr>
        `;
    });

    const dateStr = new Date().toLocaleDateString('it-IT');
    const timeStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    const contenutoRicevutaBase = `
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; color: #000; font-family: sans-serif;">
          <div style="font-size: 1.15em; font-weight: bold;">📚 Ricevuta Mercatino Scolastico Libri Usati</div>
          <div style="font-size: 0.8em; margin-top: 2px;">${dateStr} &mdash; ore ${timeStr}</div>
        </div>
        <div style="margin-bottom: 10px; font-family: sans-serif; color: #000; font-size:0.85em; line-height:1.3;">
          <b>UTENTE BANCONE:</b> ${activeCustomer.firstName.toUpperCase()} ${activeCustomer.lastName.toUpperCase()} (${activeCustomer.code})<br>
          <b>Tel:</b> ${activeCustomer.phone} | <b>Classe:</b> ${activeCustomer.grade || 'N/D'}
        </div>
        
        <table style="width:100%; border-collapse:collapse; font-family:sans-serif; font-size:0.8em; color:#000; margin-bottom:10px;">
            <thead>
                <tr style="border-bottom:1.5px solid #000; text-align:left;">
                    <th style="padding-bottom:3px;">Codice</th>
                    <th style="padding-bottom:3px;">Libro di testo / ISBN</th>
                    <th style="padding-bottom:3px; text-align:center;">Tipo</th>
                    <th style="padding-bottom:3px; text-align:right;">Importo</th>
                </tr>
            </thead>
            <tbody>
                ${righeTabella}
            </tbody>
        </table>
        
        <div style="text-align:right; font-family:sans-serif; font-size:1.1em; border-top:1.5px solid #000; padding-top:5px; margin-bottom:15px; color:#000;">
            <strong>TOTALE OPERAZIONE: € ${totaleComplessivo.toFixed(2)}</strong>
        </div>

        <div style="font-family: sans-serif; color: #000; font-size: 0.8em;">
          <div style="display: flex; justify-content: space-between; margin-top: 15px;">
            <div>Firma Genitore: _____________________</div>
            <div>Firma Operatore: ____________________</div>
          </div>
          <p style="text-align: center; margin-top: 10px; font-size: 0.7em; border-top: 1px dashed #000; padding-top: 5px; margin-bottom:0;">Ricevuta in esenzione. Include quota gestione associazione (1€ a copia).</p>
        </div>
    `;

    const layoutDoppiaCopia = `
        <div style="padding: 10px; border: 1px solid #000; margin-bottom: 25px; background: #fff; box-sizing: border-box; height: 46%; max-height: 46%; overflow: hidden; display:block !important;">
            <div style="text-align: right; font-size: 0.75em; text-transform: uppercase; font-weight: bold; color: #555; margin-bottom: 3px; font-family:sans-serif;">Copia per la Famiglia</div>
            ${contenutoRicevutaBase}
        </div>
        <div style="padding: 10px; border: 1px solid #000; background: #fff; box-sizing: border-box; height: 46%; max-height: 46%; overflow: hidden; display:block !important;">
            <div style="text-align: right; font-size: 0.75em; text-transform: uppercase; font-weight: bold; color: #555; margin-bottom: 3px; font-family:sans-serif;">Copia Archivio Associazione</div>
            ${contenutoRicevutaBase}
        </div>
    `;
    if (document.getElementById('receipt-area'))
        document.getElementById('receipt-area').innerHTML = layoutDoppiaCopia;
    if (document.getElementById('sezione-ricevuta'))
        document.getElementById('sezione-ricevuta').innerHTML = layoutDoppiaCopia;

    setTimeout(() => {
        window.print();
        window.carrelloOperazione = [];
        refreshCurrentBookList();
        showToast('Transazione registrata con successo!');
    }, 250);
}
function refreshCurrentBookList() {
    const allBooks = db.getAll('books') || {};
    const booksArray = Object.keys(allBooks).map(id => {
        return { id: id, ...allBooks[id] };
    });

    if (typeof renderBookResults === 'function') {
        renderBookResults(booksArray);
    }
    if (typeof updateBookCount === 'function') {
        updateBookCount();
    }
}
function confirmAssign() { _pendingBookId = null; closePriceModal(); }
function unassignBook(bookId) {
    const books = db.getAll('books');
    if (!books[bookId]) return;
    // Se è una copia fisica, la rimuoviamo del tutto
    if (bookId.includes('COPIA')) {
        delete books[bookId];
    } else {
        // Altrimenti togliamo solo l'associazione (proprietario e direzione)
        books[bookId].ownerCode = null;
        books[bookId].direction = null;
        books[bookId].salePrice = null;
        // Lasciamo il prezzo di ritiro invariato nel DB (non lo azzeriamo)
    }
    db.save('books', books);
    showToast('Assegnazione rimossa con successo');
    refreshCurrentBookList();
}

// =============================================
// STAMPA RICEVUTA (Aggiornata)
// =============================================
function printReceipt() {
    if (!activeCustomer) return showToast('Nessun cliente attivo', 'error');
    const { code, data } = activeCustomer;
    const books = db.getAll('books');
    const myBooks = Object.values(books).filter(b => b.ownerCode === code);
    const depositi = myBooks.filter(b => b.direction === 'deposito');
    const vendite = myBooks.filter(b => b.direction === 'vendita');

    if (myBooks.length === 0) return showToast('Nessun libro associato a questo cliente', 'error');

    const now = new Date();
    const dateStr = now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    // Aggregate books by title (or ISBN if available) to handle multiple copies of the same book
    const aggregate = (list) => {
        const map = {};
        list.forEach(b => {
            const key = b.isbn || b.title || b.copyCode;
            if (!map[key]) {
                map[key] = { title: b.title || '-', isbn: b.isbn || '-', qty: 0, total: 0 };
            }
            map[key].qty += 1;
            const price = parseFloat(b.salePrice) || 0;
            map[key].total += price;
        });
        return Object.values(map);
    };

    const depositiAgg = aggregate(depositi);
    const venditeAgg = aggregate(vendite);

    const rowsHtml = (list) => list.map((b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${b.title}</strong>${b.isbn !== '-' ? '<br><small>ISBN: ' + b.isbn + '</small>' : ''}</td>
      <td>${b.qty}</td>
      <td class="price-cell">${fmtPrice(b.total)}</td>
    </tr>
  `).join('');

    const depositSection = depositiAgg.length > 0 ? `
    <h3 class="rcp-section-title rcp-deposito">&#128229; Libri Depositati (portati dal cliente)</h3>
    <table class="rcp-table">
      <thead><tr><th>#</th><th>Titolo / ISBN</th><th>Quantità</th><th>Totale</th></tr></thead>
      <tbody>${rowsHtml(depositiAgg)}</tbody>
    </table>
  ` : '';

    const venditeSection = venditeAgg.length > 0 ? `
    <h3 class="rcp-section-title rcp-vendita">&#128228; Libri Acquistati (venduti al cliente)</h3>
    <table class="rcp-table">
      <thead><tr><th>#</th><th>Titolo / ISBN</th><th>Quantità</th><th>Totale</th></tr></thead>
      <tbody>${rowsHtml(venditeAgg)}</tbody>
    </table>
  ` : '';

    // Prepariamo il contenuto della ricevuta singola generata da Cline
    const contenutoRicevutaBase = `
        <div class="rcp-header" style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; color: #000; font-family: sans-serif;">
          <div class="rcp-logo" style="font-size: 1.4em; font-weight: bold;">📚 Mercatino Scolastico Libro Usato</div>
          <div class="rcp-date" style="font-size: 0.9em; margin-top: 5px;">${dateStr} &mdash; ore ${timeStr}</div>
        </div>
        <div class="rcp-customer" style="margin-bottom: 15px; font-family: sans-serif; color: #000;">
          <table class="rcp-info-table" style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 3px 0;">Cliente:</td><td><strong>${data.firstName.toUpperCase()} ${data.lastName.toUpperCase()}</strong></td></tr>
            <tr><td style="padding: 3px 0;">Codice ID:</td><td><strong>${code}</strong></td></tr>
            ${data.grade ? `<tr><td style="padding: 3px 0;">Classe:</td><td><b>${data.grade.toUpperCase()}</b></td></tr>` : ''}
            <tr><td style="padding: 3px 0;">Telefono:</td><td>${data.phone}</td></tr>
            ${data.email ? `<tr><td style="padding: 3px 0;">Email:</td><td>${data.email}</td></tr>` : ''}
          </table>
        </div>
        <div style="color: #000; font-family: sans-serif;">
            ${depositSection}
            ${venditeSection}
        </div>
        <div class="rcp-footer" style="margin-top: 30px; font-family: sans-serif; color: #000;">
          <div class="rcp-sign" style="display: flex; justify-content: space-between; margin-top: 30px; font-size: 0.9em;">
            <div class="rcp-sign-box">Firma genitore: _______________________</div>
            <div class="rcp-sign-box">Operatore: ___________________________</div>
          </div>
          <p class="rcp-note" style="text-align: center; margin-top: 20px; font-size: 0.85em; border-top: 1px dashed #999; padding-top: 10px;">Conservare questa ricevuta come rimborso spese volontario (1€ incl.).</p>
        </div>
    `;

    // Uniamo tutto per creare la DOPPIA COPIA automatica sullo stesso foglio di stampa
    const layoutDoppiaCopia = `
        <div class="ricevuta-singola-taglio" style="padding: 10px; border: 1px solid #000; margin-bottom: 50px; background: #fff;">
            <div style="text-align: right; font-size: 0.8em; text-transform: uppercase; font-weight: bold; color: #666; margin-bottom: 5px;">Copia per il Genitore</div>
            ${contenutoRicevutaBase}
        </div>
        
        <div style="page-break-after: always;"></div> <!-- Forza il taglio o la divisione della pagina -->
        
        <div class="ricevuta-singola-taglio" style="padding: 10px; border: 1px solid #000; background: #fff;">
            <div style="text-align: right; font-size: 0.8em; text-transform: uppercase; font-weight: bold; color: #666; margin-bottom: 5px;">Copia per il Mercatino</div>
            ${contenutoRicevutaBase}
        </div>
    `;

    // Sincronizziamo il cassetto HTML inserendo i dati sia su quello di Cline che sul nostro per sicurezza
    const rcpArea = document.getElementById('receipt-area');
    const sezRcp = document.getElementById('sezione-ricevuta');

    if (rcpArea) rcpArea.innerHTML = layoutDoppiaCopia;
    if (sezRcp) sezRcp.innerHTML = layoutDoppiaCopia;

    // Piccolo ritardo per lasciare al browser il tempo di nascondere la grafica dell'app e caricare i dati reali
    setTimeout(() => {
        window.print();
    }, 250);
}


// =============================================
// MODAL EVENTI
// =============================================
window.addEventListener('load', () => {
    // Confirm button
    document.getElementById('pm-confirm').addEventListener('click', confirmAssign);
    document.getElementById('pm-cancel').addEventListener('click', closePriceModal);
    document.getElementById('pm-price').addEventListener('keydown', e => {
        if (e.key === 'Enter') confirmAssign();
        if (e.key === 'Escape') closePriceModal();
    });
    // Click fuori dal modal
    document.getElementById('price-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('price-modal')) closePriceModal();
    });
    refreshClientList();
    updateBookCount();
});
