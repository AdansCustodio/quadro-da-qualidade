import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** * CONFIGURAÇÃO FIREBASE
 * Substitua as aspas vazias abaixo pelos dados do seu projeto no Firebase Console.
 */
const githubFirebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

// Detecção de ambiente para compatibilidade local/online
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : githubFirebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado do Sistema
const ovenList = ['FORNO 1', 'FORNO 2', 'FORNO 3A', 'FORNO 3B', 'FORNO 4'];
const schedule = [
    { time: "21:30", shift: "TC" }, { time: "23:30", shift: "TC" }, 
    { time: "01:30", shift: "TC" }, { time: "03:30", shift: "TC" },
    { time: "05:30", shift: "TA" }, { time: "07:30", shift: "TA" }, 
    { time: "09:30", shift: "TA" }, { time: "11:30", shift: "TA" },
    { time: "13:30", shift: "TB" }, { time: "15:30", shift: "TB" }, 
    { time: "17:30", shift: "TB" }, { time: "19:30", shift: "TB" }
];

let currentOven = 'FORNO 1';
let viewMode = 'single';
let selectedDate = new Date();
let presentationInterval = null;
let countdownInterval = null;
let countdownSeconds = 30;
let isSaving = false;
let unsubscribeRealtime = null;

const ovenDataStore = {};

const resetStore = () => {
    ovenList.forEach(ov => {
        ovenDataStore[ov] = { 
            linha: '', 
            rows: Array(12).fill(null).map(() => ({ 
                ref: '', turno: '', vol: '', qHora: '', 
                defects: ['', '', '', ''], quebras: ['', '', '', ''] 
            })) 
        };
    });
};

const getDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const updateDateUI = () => {
    const d = selectedDate.getDate().toString().padStart(2, '0');
    const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
    const y = selectedDate.getFullYear();
    const display = document.getElementById('display-date');
    if (display) display.innerText = `${d}/${m}/${y}`;
};

// --- FIREBASE CORE ---

const saveToFirebase = async (ovenId) => {
    const user = auth.currentUser;
    if (!user || isSaving) return;
    
    isSaving = true;
    const dateKey = getDateKey(selectedDate);
    try {
        const docId = `${ovenId}_${dateKey}`;
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'records', docId);
        await setDoc(docRef, ovenDataStore[ovenId]);
    } catch (e) {
        console.error("Erro ao salvar no Firebase:", e);
    } finally {
        setTimeout(() => { isSaving = false; }, 500);
    }
};

const setupRealtimeListener = () => {
    if (unsubscribeRealtime) unsubscribeRealtime();
    
    const dateKey = getDateKey(selectedDate);
    const ovensCollection = collection(db, 'artifacts', appId, 'public', 'data', 'records');
    
    unsubscribeRealtime = onSnapshot(ovensCollection, (snapshot) => {
        let hasDataForDate = false;
        snapshot.forEach((doc) => {
            const id = doc.id;
            if (id.includes(dateKey)) {
                const ovenName = id.replace(`_${dateKey}`, '');
                if (ovenList.includes(ovenName)) {
                    ovenDataStore[ovenName] = doc.data();
                    hasDataForDate = true;
                }
            }
        });

        if (!hasDataForDate) resetStore();
        renderContent();
    }, (error) => console.error("Erro no Firestore Realtime:", error));
};

// --- INTERFACE E DOM ---

const generateOvenHTML = (ovenName, isMini = false) => {
    const data = ovenDataStore[ovenName];
    const headerSize = isMini ? 'text-xs py-1' : 'text-xl py-2';
    const tableFontSize = isMini ? 'text-[0.6rem]' : 'text-xs';

    let rowsHTML = schedule.map((item, index) => {
        const rowData = data.rows[index];
        const rowBg = index % 2 !== 0 ? 'bg-gray-custom' : '';
        return `
            <tr class="${rowBg}" data-oven="${ovenName}" data-row="${index}">
                <td class="font-bold border-black ${isMini ? 'text-[0.7rem]' : 'text-sm'} p-0">
                    ${item.time}<span class="shift-stamp">${item.shift}</span>
                </td>
                <td class="border-black">
                    <input type="text" class="nav-input ref-input" list="ref-suggestions" value="${rowData.ref || ''}" 
                        oninput="window.syncData('${ovenName}', ${index}, 'ref', this.value); window.sugerirReferencia(this, '${ovenName}')">
                </td>
                <td class="border-black">
                    <select class="text-gray-700 font-medium nav-input" onchange="window.syncData('${ovenName}', ${index}, 'turno', this.value)">
                        <option value="" ${rowData.turno === '' ? 'selected' : ''}>-</option>
                        <option value="A" ${rowData.turno === 'A' ? 'selected' : ''}>A</option>
                        <option value="B" ${rowData.turno === 'B' ? 'selected' : ''}>B</option>
                        <option value="C" ${rowData.turno === 'C' ? 'selected' : ''}>C</option>
                    </select>
                </td>
                <td class="border-black">
                    <input type="number" step="0.01" class="nav-input" value="${rowData.vol || ''}" 
                        oninput="window.syncData('${ovenName}', ${index}, 'vol', this.value)">
                </td>
                <td class="border-black">
                    <input type="number" step="0.01" class="input-quali-hora nav-input" value="${rowData.qHora || ''}" 
                        data-oven="${ovenName}" oninput="window.syncData('${ovenName}', ${index}, 'qHora', this.value)">
                </td>
                <td class="border-black">
                    <input type="text" class="input-quali-acum" data-oven="${ovenName}" readonly placeholder="0.00">
                </td>
                <td class="border-black p-0">
                    <div class="flex flex-col">
                        ${[0,1,2,3].map(i => `<input type="text" class="defect-input nav-input" placeholder="${i+1}." value="${rowData.defects[i] || ''}" oninput="window.syncSub('${ovenName}', ${index}, 'defects', ${i}, this.value)">`).join('')}
                    </div>
                </td>
                <td class="border-black p-0">
                    <div class="flex h-full">
                        <div class="flex flex-col flex-grow">
                            ${[0,1,2,3].map(i => `<input type="text" class="defect-input nav-input" placeholder="${i+1}." value="${rowData.quebras[i] || ''}" oninput="window.syncSub('${ovenName}', ${index}, 'quebras', ${i}, this.value)">`).join('')}
                        </div>
                        <div class="quebra-total-box">
                            <div class="quebra-total-header uppercase">Total</div>
                            <div class="flex-grow flex items-center justify-center font-bold ${isMini ? 'text-[0.6rem]' : 'text-xs'}" id="total-${ovenName}-${index}">0,00</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="border-b border-black text-center ${headerSize} font-bold uppercase bg-gray-50">Acompanhamento - ${ovenName}</div>
        <div class="flex border-b border-black font-bold uppercase text-[0.6rem] bg-white">
            <div class="w-1/2 border-r border-black p-1 flex justify-center items-center">${ovenName}</div>
            <div class="w-1/2 p-1 flex justify-center items-center gap-1">
                <span>Linha:</span>
                <select onchange="window.syncLinha('${ovenName}', this.value)" class="border border-gray-300 rounded px-1 font-normal text-red-600">
                    <option value="">-</option>
                    <option value="1" ${data.linha === '1' ? 'selected' : ''}>1</option>
                    <option value="2" ${data.linha === '2' ? 'selected' : ''}>2</option>
                    <option value="4" ${data.linha === '4' ? 'selected' : ''}>4</option>
                    <option value="5" ${data.linha === '5' ? 'selected' : ''}>5</option>
                    <option value="6" ${data.linha === '6' ? 'selected' : ''}>6</option>
                </select>
            </div>
        </div>
        <table class="w-full">
            <thead>
                <tr class="header-blue font-bold ${tableFontSize} leading-tight bg-gray-50">
                    <th class="w-12">Hora</th><th class="w-24">Referência</th><th class="w-14">Turno Esmaltação</th>
                    <th class="w-12">Volume</th><th class="w-16">Qualidade Hora (%)</th><th class="w-16">Qualidade Acumulada (%)</th>
                    <th class="w-24 italic">Defeitos</th><th class="w-32 text-red-600">Quebra (%)</th>
                </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
        </table>
    `;
};

const renderContent = () => {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    if (viewMode === 'grid') {
        mainContent.className = "grid-view-container";
        mainContent.innerHTML = ovenList.map(ov => `<div class="oven-card p-1 rounded">${generateOvenHTML(ov, true)}</div>`).join('');
        ovenList.forEach(ov => window.attachCalculations(ov));
    } else {
        mainContent.className = "max-w-7xl mx-auto bg-white shadow-lg border-t border-black";
        mainContent.innerHTML = generateOvenHTML(currentOven);
        window.attachCalculations(currentOven);
    }
};

// --- EXPOSIÇÃO GLOBAL PARA ACESSO PELO HTML ---

window.changeDate = (offset) => {
    selectedDate.setDate(selectedDate.getDate() + offset);
    updateDateUI();
    resetStore();
    setupRealtimeListener();
};

window.setViewMode = (mode, oven = null) => {
    viewMode = mode;
    if (oven) currentOven = oven;
    
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const btnGeral = document.getElementById('btn-GERAL');
    if (btnGeral) btnGeral.classList.remove('bg-blue-600');
    
    if (mode === 'grid') {
        if (btnGeral) btnGeral.classList.add('bg-blue-600');
    } else {
        const btn = document.getElementById(`btn-${currentOven}`);
        if (btn) btn.classList.add('active');
    }
    renderContent();
};

window.syncData = (oven, row, field, val) => {
    ovenDataStore[oven].rows[row][field] = val;
    saveToFirebase(oven);
};

window.syncSub = (oven, row, field, sub, val) => {
    ovenDataStore[oven].rows[row][field][sub] = val;
    saveToFirebase(oven);
    if (field === 'quebras') window.runQuebra(oven, row);
};

window.syncLinha = (oven, val) => {
    ovenDataStore[oven].linha = val;
    saveToFirebase(oven);
};

window.attachCalculations = (oven) => {
    window.runCalcs(oven);
    for(let i=0; i<12; i++) window.runQuebra(oven, i);
};

window.runCalcs = (oven) => {
    const hInputs = document.querySelectorAll(`.input-quali-hora[data-oven="${oven}"]`);
    const aInputs = document.querySelectorAll(`.input-quali-acum[data-oven="${oven}"]`);
    let sum = 0, count = 0;
    hInputs.forEach((input, i) => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
            input.className = val >= 97 ? "input-quali-hora nav-input text-target-ok" : "input-quali-hora nav-input text-target-low";
            sum += val; count++;
            const avg = sum / count;
            if (aInputs[i]) {
                aInputs[i].value = avg.toFixed(2);
                aInputs[i].className = avg >= 97 ? "input-quali-acum text-target-ok" : "input-quali-acum text-target-low";
            }
        } else {
            input.className = "input-quali-hora nav-input";
            if (aInputs[i]) aInputs[i].value = "";
        }
    });
};

window.runQuebra = (oven, row) => {
    const data = ovenDataStore[oven].rows[row].quebras;
    let total = 0;
    data.forEach(s => {
        const ms = String(s || '').replace(',', '.').match(/[-+]?[0-9]*\.?[0-9]+/g);
        if (ms) ms.forEach(m => total += parseFloat(m));
    });
    const display = document.getElementById(`total-${oven}-${row}`);
    if (display) {
        display.innerText = total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        display.className = `flex-grow flex items-center justify-center font-bold ${total < 1.5 ? 'text-target-ok' : 'text-target-low'}`;
    }
};

window.togglePresentation = () => {
    const overlay = document.getElementById('presentation-overlay');
    if (presentationInterval) {
        clearInterval(presentationInterval); 
        clearInterval(countdownInterval);
        presentationInterval = null;
        if (overlay) overlay.style.display = 'none';
    } else {
        window.setViewMode('single', 'FORNO 1');
        if (overlay) overlay.style.display = 'block';
        countdownSeconds = 30;
        countdownInterval = setInterval(() => {
            countdownSeconds--; if (countdownSeconds < 0) countdownSeconds = 29;
            const timer = document.getElementById('presentation-timer');
            if (timer) timer.innerText = countdownSeconds;
        }, 1000);
        presentationInterval = setInterval(() => {
            const idx = (ovenList.indexOf(currentOven) + 1) % ovenList.length;
            window.setViewMode('single', ovenList[idx]);
            countdownSeconds = 30;
        }, 30000);
    }
};

window.sugerirReferencia = (input, oven) => {
    const rowIndex = parseInt(input.closest('tr').dataset.row);
    const refDatalist = document.getElementById('ref-suggestions');
    if (!refDatalist) return;
    refDatalist.innerHTML = '';
    if (rowIndex > 0) {
        const prev = ovenDataStore[oven].rows[rowIndex - 1].ref;
        if (input.value && prev && prev.toLowerCase().startsWith(input.value.toLowerCase())) {
            const opt = document.createElement('option'); opt.value = prev;
            refDatalist.appendChild(opt);
        }
    }
};

// Inicialização Geral
const init = async () => {
    resetStore();
    updateDateUI();
    
    // Autenticação Inicial
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (e) { console.error("Erro auth:", e); }

    onAuthStateChanged(auth, (user) => {
        if (user) setupRealtimeListener();
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const inputs = Array.from(document.querySelectorAll('.nav-input'));
            const idx = inputs.indexOf(e.target);
            if (idx >= 0 && idx < inputs.length - 1) inputs[idx + 1].focus();
        }
    });
};

init();
