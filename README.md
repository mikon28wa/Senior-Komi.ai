# Senior-Komi.ai

> **Ein auf Gemini basierender, netter AI-Chat – speziell für Seniorenbetreuung und Aufgabenmanagement.**

---

## ✨ Features

- **Gemini-basierte KI**: Nutzt die **Google Gemini API** für intelligente, kontextbewusste und seniorenfreundliche Antworten.
- **Seniorenfreundliches Design**: Einfache, intuitive Benutzeroberfläche für eine barrierefreie Nutzung.
- **Aufgabenmanagement**: Integrierte Funktionen zur Verwaltung von Aufgaben und Erinnerungen.
- **Echtzeit-Interaktion**: Sofortige Antworten ohne Verzögerung.
- **Sicher**: Umgebungsspezifische Konfiguration (z. B. `GEMINI_API_KEY`).
- **Skalierbar**: Einfache Erweiterung um neue Funktionen oder Module.

---

## 🚀 Schnellstart

### Voraussetzungen

- [Node.js](https://nodejs.org/) (>= 20.x)
- [npm](https://www.npmjs.com/) oder [yarn](https://yarnpkg.com/)
- **Gemini AI API-Schlüssel** (für KI-Funktionen)

---

### Installation

1. **Repository klonen:**
   ```bash
   git clone https://github.com/mikon28wa/Senior-Komi.ai.git
   cd Senior-Komi.ai
   ```

2. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren:**
   - Erstelle eine `.env.local`-Datei im Projektverzeichnis:
     ```bash
     touch .env.local
     ```
   - Füge deinen **Gemini AI API-Schlüssel** hinzu:
     ```env
     GEMINI_API_KEY=dein_api_schlüssel_hier
     ```

4. **Anwendung starten:**
   - **Entwicklungsmodus:**
     ```bash
     npm run dev
     ```
     → Die Anwendung läuft unter `http://localhost:3000`.

---

## 📂 Projektstruktur

```
Senior-Komi.ai/
├── src/
│   ├── components/          # React-Komponenten (z. B. Chat, Aufgabenliste)
│   ├── pages/              # Seiten (z. B. Dashboard, Chat-UI)
│   ├── utils/              # Hilfsfunktionen (z. B. API-Aufrufe, Aufgabenlogik)
│   ├── App.tsx             # Haupt-App-Komponente
│   └── main.tsx            # Einstiegspunkt
├── .env.example            # Beispiel für Umgebungsvariablen
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📡 API-Endpunkte (falls vorhanden)

| Endpunkt               | Methode | Beschreibung                          |
|------------------------|---------|--------------------------------------|
| `/api/chat`            | POST    | Senden einer Nachricht an die KI     |
| `/api/tasks`           | GET     | Abrufen der Aufgabenliste            |
| `/api/tasks/add`       | POST    | Neue Aufgabe hinzufügen              |
| `/api/tasks/complete`  | POST    | Aufgabe als erledigt markieren       |

---

## 🛠 Technologien

| Bereich       | Technologie                     |
|---------------|---------------------------------|
| **Frontend**  | React, TypeScript, Tailwind CSS |
| **Backend**   | Node.js, Express                |
| **KI**        | [Google Gemini AI](https://ai.google.dev/) |
| **Build-Tool**| Vite                            |

---

## 🤝 Mitwirken

1. **Fork** das Repository.
2. **Branch** erstellen (`git checkout -b feature/neue-funktion`).
3. **Änderungen** commiten (`git commit -m "Füge neue Funktion hinzu"`).
4. **Push** (`git push origin feature/neue-funktion`).
5. **Pull Request** erstellen.

---

## 📄 Lizenz

Dieses Projekt ist **privat** und unterliegt den Nutzungsbedingungen von [llmbluetools](https://github.com/llmbluetools).

---

## 📞 Unterstützung

- **Issues**: [GitHub Issues](https://github.com/mikon28wa/Senior-Komi.ai/issues)
- **Wartung**: [Michael Konradi](https://github.com/mikon28wa)