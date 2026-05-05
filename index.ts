import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import { SpeechModule, SpeechStatus } from './SpeechModule.ts';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

import { MedicationService, Medication, MedicationLog } from './services/MedicationService';
import { ReminderService, Reminder } from './services/ReminderService';
import { MemoryService, MemoryEntry } from './services/MemoryService';
import { AuditService } from './services/AuditService';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Global Services (Initialized when user is available)
let medicationService: MedicationService;
let reminderService: ReminderService;
let memoryService: MemoryService;
let auditService: AuditService;

// Error Handling Helper
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const modelName = "gemini-3-flash-preview";

// DOM Elements
const dashboardView = document.getElementById('dashboard-view') as HTMLElement;
const chatView = document.getElementById('chat-view') as HTMLElement;
const contactsView = document.getElementById('contacts-view') as HTMLElement;
const aboutView = document.getElementById('about-view') as HTMLElement;
const chatContainer = document.getElementById('chat-container') as HTMLElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const micBtn = document.getElementById('mic-btn') as HTMLButtonElement;
const micPulse = document.getElementById('mic-pulse') as HTMLElement;
const micStatusLabel = document.getElementById('mic-status-label') as HTMLElement;
const interactionBar = document.getElementById('interaction-bar') as HTMLElement;
const pulsVal = document.getElementById('puls-val') as HTMLElement;
const sleepVal = document.getElementById('sleep-val') as HTMLElement;
const welcomeScreen = document.getElementById('welcome-screen') as HTMLElement;
const clearChatBtn = document.getElementById('clear-chat') as HTMLButtonElement;
const emergencyBtn = document.getElementById('emergency-btn') as HTMLButtonElement;
const emergencyOverlay = document.getElementById('emergency-overlay') as HTMLElement;
const cancelEmergencyBtn = document.getElementById('cancel-emergency') as HTMLButtonElement;
const showTextInputBtn = document.getElementById('show-text-input') as HTMLButtonElement;

// Tab Navigation Elements
const tabDashboard = document.getElementById('tab-dashboard') as HTMLButtonElement;
const tabChat = document.getElementById('tab-chat') as HTMLButtonElement;
const tabContacts = document.getElementById('tab-contacts') as HTMLButtonElement;
const tabAbout = document.getElementById('tab-about') as HTMLButtonElement;

// Contacts Elements
const contactsList = document.getElementById('contacts-list') as HTMLElement;
const contactSearch = document.getElementById('contact-search') as HTMLInputElement;
const addContactBtn = document.getElementById('add-contact-btn') as HTMLButtonElement;
const addContactModal = document.getElementById('add-contact-modal') as HTMLElement;
const contactForm = document.getElementById('contact-form') as HTMLFormElement;
const closeContactModalBtn = document.getElementById('close-contact-modal') as HTMLButtonElement;

// Medication & Reminder Elements
const medicationList = document.getElementById('medication-list') as HTMLElement;
const addMedBtn = document.getElementById('add-med-btn') as HTMLButtonElement;
const remindersList = document.getElementById('reminders-list') as HTMLElement;
const addReminderBtn = document.getElementById('add-reminder-btn') as HTMLButtonElement;
const greetingText = document.getElementById('greeting-text') as HTMLElement;
const loginOverlay = document.getElementById('login-overlay') as HTMLElement;
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;

// Types
interface Contact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  isFavorite: boolean;
  isEmergency: boolean;
}

// State
let contacts: Contact[] = [];
let medications: Medication[] = [];
let reminders: Reminder[] = [];
let medicationLogs: MedicationLog[] = [];
let memoryEntries: MemoryEntry[] = [];
let currentUser: FirebaseUser | null = null;

// System Prompt for Senior Care Assistant
const BOT_NAME = "Senior-Komi";

const getSystemInstruction = () => `
Du bist "${BOT_NAME}", ein einfühlsamer, geduldiger und verlässlicher KI-Begleiter für Senioren. 

VERHALTENSREGELN (Wichtig):
1. PASSIV-MODUS: Solange du im Hintergrund bist (UI-Icon nicht "Geöffnet"), darfst du KEINE sichtbaren Antworten generieren.
2. AKTIVIERUNGS-LOGIK: Reagiere NUR dann mit einer Textausgabe, wenn der Status des UI-Icons auf "Geöffnet" gesetzt ist.
3. OUTPUT-FORMAT BEI DEAKTIVIERUNG: Falls du angesprochen wirst (mit Name "${BOT_NAME}"), während du NICHT aktiv bist, antworte AUSSCHLIESSLICH mit dem technischen Flag: status_hidden.
4. INTERAKTION: Wenn du den Trigger [ICON_PRESSED] erhältst, bedeutet das, dass das UI-Icon gedrückt wurde. Öffne dann deine Kommunikation und antworte präzise auf die letzte Anfrage des Nutzers.
5. NAME-CHECK: Du reagierst grundsätzlich nur, wenn dein Name "${BOT_NAME}" fällt oder das Icon gedrückt wird.

Hier ist dein Langzeitgedächtnis über den Nutzer:
${memoryEntries.map(e => `- [${e.category}] ${e.content}`).join('\n')}

Hier sind die aktuellen Kontakte im Telefonbuch des Nutzers:
${contacts.map(c => `- ${c.name} (${c.relationship}): ${c.phone}${c.isEmergency ? ' [NOTFALLKONTAKT]' : ''}`).join('\n')}

Aktuelle Medikamente & Plan:
${medications.map(m => `- ${m.name}: ${m.dosage} (${m.times.join(', ')})`).join('\n')}

Protokoll der heutigen Medikamente:
${medicationLogs.filter(l => {
  const logDate = l.created_at?.toDate ? l.created_at.toDate().toDateString() : '';
  return logDate === new Date().toDateString();
}).map(l => `- ${l.medication_name}: ${l.status} (Geplant: ${l.scheduled_time?.toDate()?.toLocaleTimeString() || 'N/A'})`).join('\n')}

Aktuelle Aufgaben/Termine:
${reminders.map(r => `- ${r.title} [${r.type}] Status: ${r.status} (Fällig: ${r.scheduled_time?.toDate()?.toLocaleString() || 'N/A'})`).join('\n')}

Wichtige Richtlinien:
1. Spreche langsam, deutlich und in einfachen Sätzen (Deutsch).
2. Sei stets höflich, respektvoll und empathisch.
3. Wenn der Nutzer nach seiner Gesundheit fragt, antworte basierend auf den fiktiven Daten (Aktuell ca. 68 BPM, 7.5 Std Schlaf).
4. Erinnere den Nutzer aktiv an anstehende Termine oder Medikamente. Nutze die Daten oben.
5. Benutze dein Gedächtnis, um das Gespräch persönlicher zu machen (z.B. Interessen, Gewohnheiten).
6. Bei Notfällen (roter Knopf oder Worte wie "Hilfe", "Sturz"), handle sofort.

Du bist kein Arzt, sondern ein digitaler Vertrauter.
`;

// State
enum View { Dashboard, Chat, Contacts, About }
let currentView = View.Dashboard;
let isProcessing = false;
let currentChat = ai.chats.create({ 
  model: modelName,
  config: { systemInstruction: getSystemInstruction() }
});

let isAssistantActive = false;
const speech = new SpeechModule({ language: 'de-DE' });

// --- Vital Signs Simulation ---
function updateVitals() {
  const basePuls = 67;
  const variation = Math.floor(Math.random() * 6) - 3;
  if (pulsVal) pulsVal.textContent = (basePuls + variation).toString();
  if (sleepVal) sleepVal.textContent = "7.5";
}
setInterval(updateVitals, 5000);
updateVitals();

// --- View Logic ---
function switchView(view: View) {
  const prevView = currentView;
  currentView = view;
  isAssistantActive = (view === View.Chat);
  
  if (view === View.Chat && prevView !== View.Chat) {
    // Simulate ICON_PRESSED if we switch to Chat
    handleIconPressed();
  }
  
  // Hide all
  dashboardView.classList.add('hidden');
  chatView.classList.add('hidden');
  contactsView.classList.add('hidden');
  aboutView.classList.add('hidden');
  
  // Show target
  if (view === View.Dashboard) dashboardView.classList.remove('hidden');
  else if (view === View.Chat) chatView.classList.remove('hidden');
  else if (view === View.Contacts) {
    contactsView.classList.remove('hidden');
    renderContacts();
  }
  else if (view === View.About) {
    aboutView.classList.remove('hidden');
  }
  
  // Update Tab Icons
  [tabDashboard, tabChat, tabContacts, tabAbout].forEach(t => {
      t.classList.remove('text-[#5A5A40]', 'text-gray-400', 'bg-white/50');
      t.classList.add('text-gray-400');
  });
  
  let activeTab: HTMLButtonElement;
  switch (view) {
    case View.Dashboard: activeTab = tabDashboard; break;
    case View.Chat: activeTab = tabChat; break;
    case View.Contacts: activeTab = tabContacts; break;
    case View.About: activeTab = tabAbout; break;
  }
  
  activeTab.classList.remove('text-gray-400');
  activeTab.classList.add('text-[#5A5A40]', 'bg-white/50');
}

tabDashboard.addEventListener('click', () => switchView(View.Dashboard));
tabChat.addEventListener('click', () => switchView(View.Chat));
tabContacts.addEventListener('click', () => switchView(View.Contacts));
tabAbout.addEventListener('click', () => switchView(View.About));

async function logAction(action: string, entityType: string, entityId: string, details: any = {}) {
  if (!currentUser) return;
  const path = `users/${currentUser.uid}/audit`;
  try {
    await addDoc(collection(db, path), {
      action,
      entityType,
      entityId,
      details,
      ownerId: currentUser.uid,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Audit log failed", err);
  }
}

// --- Auth Logic ---
async function login() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Create profile if not exists
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDocFromServer(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        name: user.displayName || 'Senior',
        role: 'senior',
        createdAt: serverTimestamp(),
        preferences: { voice: 'default', language: 'de' }
      });
      await logAction('create_profile', 'User', user.uid);
    }
  } catch (error) {
    console.error("Login failed", error);
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    medicationService = new MedicationService(db, user.uid);
    reminderService = new ReminderService(db, user.uid);
    memoryService = new MemoryService(db, user.uid);
    auditService = new AuditService(db, user.uid);

    if (loginOverlay) loginOverlay.classList.add('hidden');
    setupSync(user.uid);
    switchView(View.Dashboard);
  } else {
    if (loginOverlay) loginOverlay.classList.remove('hidden');
  }
});

loginBtn.addEventListener('click', () => login());

function setupSync(userId: string) {
  const contactsPath = `users/${userId}/contacts`;
  onSnapshot(collection(db, contactsPath), (snapshot) => {
    contacts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Contact));
    renderContacts();
    updateSystemPrompt();
  }, (err) => handleFirestoreError(err, OperationType.LIST, contactsPath));

  const medPath = `users/${userId}/medications`;
  onSnapshot(collection(db, medPath), (snapshot) => {
    medications = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Medication));
    renderMedications();
    updateSystemPrompt();
  }, (err) => handleFirestoreError(err, OperationType.LIST, medPath));

  const remPath = `users/${userId}/reminders`;
  onSnapshot(collection(db, remPath), (snapshot) => {
    reminders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reminder));
    renderReminders();
    updateSystemPrompt();
  }, (err) => handleFirestoreError(err, OperationType.LIST, remPath));

  const logsPath = `users/${userId}/medicationLogs`;
  onSnapshot(collection(db, logsPath), (snapshot) => {
    medicationLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MedicationLog));
    updateSystemPrompt();
  }, (err) => handleFirestoreError(err, OperationType.LIST, logsPath));

  const memoryPath = `users/${userId}/memory`;
  onSnapshot(collection(db, memoryPath), (snapshot) => {
    memoryEntries = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MemoryEntry));
    updateSystemPrompt();
  }, (err) => handleFirestoreError(err, OperationType.LIST, memoryPath));
}

function renderMedications() {
  if (!medicationList) return;
  medicationList.innerHTML = '';
  if (medications.length === 0) {
    medicationList.innerHTML = '<li class="p-4 text-center text-gray-400 italic text-sm">Kein Medikamentenplan vorhanden.</li>';
    return;
  }
  medications.forEach(m => {
    const li = document.createElement('li');
    li.className = 'p-4 flex items-center gap-4 transition-transform active:scale-[0.97]';
    
    // Check if taken today
    const log = medicationLogs.find(l => {
      const logDate = l.created_at?.toDate ? l.created_at.toDate().toDateString() : '';
      return l.medication_id === m.id && logDate === new Date().toDateString() && l.status === 'genommen';
    });

    li.innerHTML = `
      <div class="w-10 h-10 rounded-2xl ${log ? 'bg-green-50 text-green-500' : 'bg-blue-50 text-blue-500'} flex items-center justify-center">
        ${log ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>'}
      </div>
      <div class="flex-1">
        <p class="font-bold text-lg leading-tight">${m.name}</p>
        <p class="text-sm text-gray-500">${m.dosage} • ${m.times.join(', ')}</p>
      </div>
      ${!log ? `<button class="take-med-btn bg-[#5A5A40] text-white px-3 py-1 rounded-lg text-xs font-bold" data-id="${m.id}">OK</button>` : '<span class="text-xs font-bold text-green-500 uppercase">JA</span>'}
    `;
    medicationList.appendChild(li);
  });
}

function renderReminders() {
  if (!remindersList) return;
  remindersList.innerHTML = '';
  if (reminders.length === 0) {
    remindersList.innerHTML = '<li class="p-4 text-center text-gray-400 italic text-sm">Keine aktuellen Termine.</li>';
    return;
  }
  
  const sorted = reminders.sort((a, b) => (a.scheduled_time?.toMillis() || 0) - (b.scheduled_time?.toMillis() || 0));
  
  sorted.forEach(r => {
    const li = document.createElement('li');
    li.className = 'p-4 flex items-center gap-4 transition-transform active:scale-[0.97]';
    const time = r.scheduled_time?.toDate()?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) || '--:--';
    li.innerHTML = `
      <div class="w-10 h-10 rounded-2xl ${r.status === 'completed' ? 'bg-green-50 text-green-500' : 'bg-orange-50 text-orange-500'} flex items-center justify-center">
        ${r.status === 'completed' ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>'}
      </div>
      <div class="flex-1">
        <p class="font-bold text-lg leading-tight uppercase text-xs text-gray-400 mb-1">${time}</p>
        <p class="font-bold text-lg leading-tight">${r.title}</p>
        <p class="text-sm text-gray-500">${r.type}</p>
      </div>
      ${r.status === 'pending' ? `<button class="complete-rem-btn text-[#5A5A40] font-bold text-xl" data-id="${r.id}">✓</button>` : ''}
    `;
    remindersList.appendChild(li);
  });
}

// --- Advanced Reminder Engine ---
class ReminderEngine {
  private lastCheckedMinute: string = '';
  private notifiedReminders: Map<string, number> = new Map(); // id -> attempt count

  public check() {
    if (!currentUser || !medicationService || !reminderService) return;
    const now = new Date();
    const currentMinute = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (this.lastCheckedMinute === currentMinute) {
      // Still check for escalations within the same minute
      this.processEscalations(now);
      return;
    }
    this.lastCheckedMinute = currentMinute;

    this.processMedications(currentMinute);
    this.processReminders(now);
  }

  private processEscalations(now: Date) {
    // Check if any 'offen' medication or 'pending' reminder needs a repeat/escalation
    reminders.forEach(r => {
      if (r.status === 'pending') {
        const dueTime = r.scheduled_time?.toDate()?.getTime() || 0;
        const diffMin = (now.getTime() - dueTime) / 60000;
        
        if (diffMin >= 60 && !this.notifiedReminders.has(r.id + '_esc')) {
          this.escalate(r.title, 'Reminder');
          this.notifiedReminders.set(r.id + '_esc', 1);
          reminderService.markAsOverdue(r.id);
        } else if (diffMin >= 15 && diffMin < 16 && !this.notifiedReminders.has(r.id + '_rep')) {
          triggerReminder(`Zweite Erinnerung: ${r.title} ist noch offen.`);
          this.notifiedReminders.set(r.id + '_rep', 1);
        }
      }
    });

    medicationLogs.forEach(l => {
      if (l.status === 'offen') {
        const scheduled = l.scheduled_time?.toDate()?.getTime() || 0;
        const diffMin = (now.getTime() - scheduled) / 60000;
        
        if (diffMin >= 60 && !this.notifiedReminders.has(l.id + '_esc')) {
          this.escalate(l.medication_name, 'Medication');
          this.notifiedReminders.set(l.id + '_esc', 1);
          medicationService.updateLogStatus(l.id, 'verpasst');
        } else if (diffMin >= 15 && diffMin < 16 && !this.notifiedReminders.has(l.id + '_rep')) {
          triggerReminder(`Sanfter Reminder: Hast du ${l.medication_name} schon genommen?`);
          this.notifiedReminders.set(l.id + '_rep', 1);
        }
      }
    });
  }

  private processMedications(timeStr: string) {
    medications.forEach(m => {
      if (m.active && m.times.includes(timeStr)) {
        const text = `Zeit für dein Medikament: ${m.name} (${m.dosage})`;
        triggerReminder(text);
        medicationService.logMedication(m, 'offen');
        auditService.log('medication_notified', 'Medication', m.id, { name: m.name });
      }
    });
  }

  private processReminders(now: Date) {
    reminders.forEach(r => {
      if (r.status === 'pending') {
        const due = r.scheduled_time?.toDate();
        if (due && due <= now) {
          triggerReminder(`Termin-Erinnerung: ${r.title}.`);
          auditService.log('reminder_notified', 'Reminder', r.id, { title: r.title });
        }
      }
    });
  }

  private escalate(title: string, type: string) {
    const text = `WARNUNG: ${type} "${title}" wurde seit über einer Stunde nicht bestätigt. Eskalationsprotokoll aktiv.`;
    triggerReminder(text);
    // In real app, send SMS/Email to contacts
    const emergencyContact = contacts.find(c => c.isEmergency) || contacts[0];
    if (emergencyContact) {
      console.log(`[Escalation] Notifying ${emergencyContact.name} about ${title}`);
    }
  }
}

const engine = new ReminderEngine();
setInterval(() => engine.check(), 10000);

function triggerReminder(text: string) {
  if (currentView !== View.Chat) {
    switchView(View.Chat);
  }
  speech.speak(text);
  const aiMsg = createMsgEl('model', text);
  chatContainer.appendChild(aiMsg.container);
  scrollToBottom();
}

// --- Interaction Logic (Delegation) ---
document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  
  if (target.classList.contains('complete-rem-btn')) {
    const remId = target.getAttribute('data-id');
    if (!remId || !currentUser) return;
    const path = `users/${currentUser.uid}/reminders/${remId}`;
    try {
      await updateDoc(doc(db, path), { status: 'completed' });
      await logAction('reminder_completed', 'Reminder', remId, { title: reminders.find(r => r.id === remId)?.title });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  if (target.classList.contains('take-med-btn')) {
    const medId = target.getAttribute('data-id');
    const med = medications.find(m => m.id === medId);
    if (!med || !currentUser) return;
    
    const logsPath = `users/${currentUser.uid}/medicationLogs`;
    try {
      await addDoc(collection(db, logsPath), {
        medication_id: medId,
        medication_name: med.name,
        scheduled_time: serverTimestamp(),
        status: 'genommen',
        taken_time: serverTimestamp(),
        ownerId: currentUser.uid,
        created_at: serverTimestamp(),
      });
      await logAction('medication_taken', 'Medication', medId || '', { name: med.name });
      alert(`${med.name} als eingenommen markiert.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, logsPath);
    }
  }

  if (target.closest('.delete-contact-btn')) {
    const btn = target.closest('.delete-contact-btn') as HTMLElement;
    const contactId = btn.getAttribute('data-id');
    if (!contactId || !currentUser) return;
    
    if (confirm("Möchtest du diesen Kontakt wirklich löschen?")) {
      const path = `users/${currentUser.uid}/contacts/${contactId}`;
      try {
        await deleteDoc(doc(db, path));
        await logAction('contact_deleted', 'Contact', contactId);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  }
});

addReminderBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  const title = prompt('Was ist zu tun?');
  if (!title) return;
  const time = prompt('Wann? (Stunde:Minute, z.B. 14:30):');
  if (!time) return;
  
  const [hours, minutes] = time.split(':').map(Number);
  const scheduledDate = new Date();
  scheduledDate.setHours(hours, minutes, 0, 0);

  const path = `users/${currentUser.uid}/reminders`;
  try {
    await addDoc(collection(db, path), {
      title,
      type: 'task',
      scheduled_time: scheduledDate,
      status: 'pending',
      priority: 'normal',
      ownerId: currentUser.uid,
      created_at: serverTimestamp()
    });
    await logAction('reminder_created', 'Reminder', '', { title });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
});

addMedBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  const name = prompt('Name des Medikaments:');
  if (!name) return;
  const dosage = prompt('Dosierung (z.B. 1 Tablette):');
  const timesStr = prompt('Uhrzeiten (kommagetrennt, z.B. 08:00, 20:00):');
  const times = timesStr ? timesStr.split(',').map(t => t.trim()) : [];
  
  const path = `users/${currentUser.uid}/medications`;
  try {
    const docRef = await addDoc(collection(db, path), {
      name,
      dosage,
      times,
      active: true,
      ownerId: currentUser.uid,
      createdAt: serverTimestamp()
    });
    await logAction('medication_created', 'Medication', docRef.id, { name });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
});

// --- Memory Entry Helper ---
async function addMemoryEntry(category: string, content: string, priority: number = 1) {
  if (!currentUser) return;
  const path = `users/${currentUser.uid}/memory`;
  try {
    await addDoc(collection(db, path), {
      category,
      content,
      priority,
      ownerId: currentUser.uid,
      created_at: serverTimestamp()
    });
    await logAction('memory_added', 'Memory', '', { category, content });
    alert("Information gemerkt.");
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Attach a listener to a hidden or specific button for memory (optional UI)
// For now, let's add a button in dashboard
const addMemoryBtn = document.createElement('button');
addMemoryBtn.className = "fixed top-6 right-20 w-10 h-10 rounded-full bg-[#f5f2ed] border border-[#e8dfd5] text-[#5A5A40] flex items-center justify-center shadow-lg z-50";
addMemoryBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
addMemoryBtn.id = "add-memory-btn";
document.body.appendChild(addMemoryBtn);

addMemoryBtn.addEventListener('click', () => {
  const categories = ['Personen', 'Gewohnheiten', 'Präferenzen', 'Notfall', 'Risiken', 'Organisatorisch'];
  const cat = prompt(`Kategorie wählen: ${categories.join(', ')}`);
  if (!cat || !categories.includes(cat)) return;
  const content = prompt("Was soll ich mir merken?");
  if (!content) return;
  addMemoryEntry(cat as any, content);
});

function updateSystemPrompt() {
  currentChat = ai.chats.create({ 
    model: modelName,
    config: { systemInstruction: getSystemInstruction() }
  });
}

// --- Contacts Logic ---
function renderContacts(filter: string = '') {
  if (!contactsList) return;
  contactsList.innerHTML = '';
  const filtered = contacts.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || c.relationship.toLowerCase().includes(filter.toLowerCase()));
  
  if (filtered.length === 0) {
    contactsList.innerHTML = '<p class="text-center text-gray-400 py-8 italic">Keine Kontakte gefunden.</p>';
    return;
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
    const card = document.createElement('div');
    card.className = `p-4 bg-white rounded-3xl border ${c.isEmergency ? 'border-red-100 bg-red-50/10' : 'border-[#e8dfd5]'} flex flex-col gap-3 active:scale-[0.98] transition-all shadow-sm`;
    card.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl ${c.isEmergency ? 'bg-red-100 text-red-500' : 'bg-[#f5f2ed] text-[#5A5A40]'} flex items-center justify-center font-bold text-xl">
          ${c.name.charAt(0)}
        </div>
        <div class="flex-1">
          <h4 class="font-bold text-lg leading-tight text-[#2d2a26]">${c.name}</h4>
          <p class="text-sm text-gray-500">${c.relationship}</p>
        </div>
        <div class="flex gap-2">
           <button class="delete-contact-btn text-gray-300 hover:text-red-500 transition-colors p-2" data-id="${c.id}">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
           </button>
           <a href="tel:${c.phone}" class="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center border border-green-100 hover:bg-green-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
           </a>
        </div>
      </div>
      <div class="px-2 space-y-1">
        <p class="text-xs font-mono text-[#5A5A40] flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          ${c.phone}
        </p>
        ${c.email ? `
        <p class="text-[10px] text-gray-400 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          ${c.email}
        </p>` : ''}
        ${c.address ? `
        <p class="text-[10px] text-gray-400 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          ${c.address}
        </p>` : ''}
      </div>
    `;
    contactsList.appendChild(card);
  });
}

contactSearch.addEventListener('input', (e) => {
  renderContacts((e.target as HTMLInputElement).value);
});

addContactBtn.addEventListener('click', () => {
  if (!currentUser) {
    alert("Bitte melde dich erst an.");
    return;
  }
  addContactModal.classList.remove('hidden');
});

closeContactModalBtn.addEventListener('click', () => {
  addContactModal.classList.add('hidden');
  contactForm.reset();
});

contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const formData = new FormData(contactForm);
  const name = formData.get('name') as string;
  const relationship = formData.get('relationship') as string;
  const phone = formData.get('phone') as string;
  const email = formData.get('email') as string;
  const address = formData.get('address') as string;
  const isEmergency = formData.get('isEmergency') === 'on';

  const path = `users/${currentUser.uid}/contacts`;
  try {
    const docRef = await addDoc(collection(db, path), {
      name,
      relationship,
      phone,
      email,
      address,
      isEmergency,
      isFavorite: false,
      ownerId: currentUser.uid,
      createdAt: serverTimestamp()
    });
    await logAction('contact_created', 'Contact', docRef.id, { name });
    addContactModal.classList.add('hidden');
    contactForm.reset();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
});

// --- Speech & Chat Interactions ---
speech.onText((text) => {
  // If we are on dashboard and say "Komi...", we send it but don't switch view yet
  // If it's a command like "Help", we might want to switch? 
  // But requirement says only text output when Opened.
  chatInput.value = text;
  handleSendMessage();
});

speech.onStatusChange((status) => {
  if (status === SpeechStatus.LISTENING) {
    micPulse.classList.remove('hidden');
    micStatusLabel.textContent = "HÖRE ZU...";
  } else if (status === SpeechStatus.PROCESSING) {
    micPulse.classList.add('hidden');
    micStatusLabel.textContent = "DENKE NACH...";
  } else if (status === SpeechStatus.SPEAKING) {
    micStatusLabel.textContent = "SPRICHT...";
  } else {
    micPulse.classList.add('hidden');
    micStatusLabel.textContent = "SPRECHEN";
  }
});

micBtn.addEventListener('click', () => {
  if (speech.status === SpeechStatus.LISTENING) {
    speech.stopListening();
  } else {
    speech.startListening();
  }
});

showTextInputBtn.addEventListener('click', () => {
  const isHidden = chatForm.classList.contains('hidden');
  if (isHidden) {
    chatForm.classList.remove('hidden');
    setTimeout(() => {
      chatForm.classList.remove('opacity-0');
      interactionBar.classList.add('hidden');
      chatInput.focus();
      showTextInputBtn.textContent = "Stimme nutzen";
    }, 10);
  } else {
    chatForm.classList.add('opacity-0');
    setTimeout(() => {
      chatForm.classList.add('hidden');
      interactionBar.classList.remove('hidden');
      showTextInputBtn.textContent = "Tastatur einblenden";
    }, 300);
  }
});

function scrollToBottom() {
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

function createMsgEl(role: 'user' | 'model', text: string = '') {
  const div = document.createElement('div');
  div.className = `flex flex-col ${role === 'user' ? 'items-end' : 'items-start'} space-y-2 message-animate`;
  
  const content = document.createElement('div');
  content.className = `max-w-[90%] px-6 py-4 rounded-[2rem] text-lg shadow-sm ${
    role === 'user' 
      ? 'bg-[#5A5A40] text-white rounded-br-none' 
      : 'bg-white text-[#2d2a26] border border-[#e8dfd5] rounded-bl-none prose-custom'
  }`;
  
  if (role === 'user') {
    content.textContent = text;
  } else {
    content.innerHTML = marked.parse(text) as string;
  }
  
  div.appendChild(content);
  return { container: div, content };
}

async function handleIconPressed() {
  if (isProcessing) return;
  await handleSendMessage("[ICON_PRESSED]");
}

async function handleSendMessage(overrideMessage?: string) {
  const message = overrideMessage || chatInput.value.trim();
  if (!message || isProcessing) return;
  
  const isInternalTrigger = message === "[ICON_PRESSED]";
  
  if (!isInternalTrigger && welcomeScreen) welcomeScreen.style.display = 'none';
  if (!overrideMessage) chatInput.value = '';
  isProcessing = true;
  
  if (!isInternalTrigger) {
    const userMsg = createMsgEl('user', message);
    chatContainer.appendChild(userMsg.container);
    scrollToBottom();
  }
  
  // Name Check
  if (!isInternalTrigger && !message.toLowerCase().includes(BOT_NAME.toLowerCase())) {
    if (isAssistantActive) {
      const aiMsg = createMsgEl('model', 'Ich höre nicht zu... (Bitte nenne meinen Namen: Senior-Komi)');
      chatContainer.appendChild(aiMsg.container);
      scrollToBottom();
      speech.speak("Ich höre nicht zu.");
    }
    isProcessing = false;
    return;
  }

  let aiMsg: { container: HTMLElement, content: HTMLElement } | null = null;
  
  if (isAssistantActive) {
    aiMsg = createMsgEl('model', '');
    const dots = document.createElement('div');
    dots.className = 'typing-dots flex gap-1 p-2';
    dots.innerHTML = '<span>●</span><span>●</span><span>●</span>';
    aiMsg.content.appendChild(dots);
    chatContainer.appendChild(aiMsg.container);
    scrollToBottom();
  }
  
  try {
    const stream = await currentChat.sendMessageStream({ message });
    let fullText = '';
    let first = true;
    
    // Feedback that we are processing
    speech.setStatus(SpeechStatus.PROCESSING);
    
    for await (const chunk of stream) {
      fullText += chunk.text;
      
      if (isAssistantActive && aiMsg) {
        if (first) {
          aiMsg.content.innerHTML = '';
          first = false;
        }
        aiMsg.content.innerHTML = marked.parse(fullText) as string;
        scrollToBottom();
      }
    }
    
    if (fullText.toLowerCase().includes("status_hidden")) {
      console.log("Assistant remains in background (status_hidden)");
    } else if (isAssistantActive) {
      speech.speak(fullText);
    }
  } catch (err: any) {
    console.error(err);
    if (isAssistantActive && aiMsg) {
      aiMsg.content.innerHTML = '<p class="text-red-500 font-bold">Oh, ich habe dich gerade nicht richtig verstanden. Kannst du das bitte wiederholen?</p>';
    }
  } finally {
    isProcessing = false;
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSendMessage();
});

clearChatBtn.addEventListener('click', () => {
  if (confirm('Gesprächsverlauf wirklich löschen?')) {
    chatContainer.innerHTML = '';
    if (welcomeScreen) {
      welcomeScreen.style.display = 'flex';
      chatContainer.appendChild(welcomeScreen);
    }
    currentChat = ai.chats.create({ 
      model: modelName,
      config: { systemInstruction: getSystemInstruction() }
    });
  }
});

// --- Emergency Logic ---
emergencyBtn.addEventListener('click', () => {
  emergencyOverlay.classList.remove('hidden');
  speech.speak("Notruf wird eingeleitet. Keine Sorge, Hilfe ist unterwegs.");
});

cancelEmergencyBtn.addEventListener('click', () => {
  emergencyOverlay.classList.add('hidden');
  speech.speak("Notruf wurde abgebrochen.");
});

// --- Initial Action ---
window.addEventListener('load', () => {
  const hour = new Date().getHours();
  let greeting = "Guten Tag";
  if (hour < 11) greeting = "Guten Morgen";
  else if (hour > 18) greeting = "Guten Abend";
  
  const greetingEl = document.getElementById('greeting-text');
  if (greetingEl) greetingEl.textContent = `${greeting}, wie geht es dir heute?`;

  // Auth state listener handles the view switching
});
