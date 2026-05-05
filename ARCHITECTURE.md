# Architecture Specification: Senior-Komi.AI

## 1. System Overview
Senior-Komi.AI is an AI-driven elder care platform. While the current implementation uses Firebase/TypeScript for immediate deployment, this specification defines the portable backend architecture.

---

## 2. Database Schema (SQL / PostgreSQL)
```sql
-- Schema for a relational port
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'senior',
    preferences JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,
    dosage TEXT,
    times TEXT[], -- Array of "HH:MM"
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE medication_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID REFERENCES medications(id),
    scheduled_time TIMESTAMP WITH TIME ZONE,
    taken_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) CHECK (status IN ('genommen', 'offen', 'verpasst', 'verschoben')),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(20) CHECK (type IN ('medication', 'appointment', 'task')),
    reference_id UUID,
    title TEXT NOT NULL,
    scheduled_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 3. API Design (FastAPI / Python Example)
```python
from fastapi import FastAPI, Depends
from pydantic import BaseModel

app = FastAPI()

class MedicationLogCreate(BaseModel):
    medication_id: str
    status: str
    comment: str = ""

@app.post("/medication/log")
async def log_medication(log: MedicationLogCreate, user=Depends(get_current_user)):
    # Save to SQL, delete pending reminder if exists
    return {"status": "success"}

@app.post("/reminder/create")
async def create_reminder(reminder: ReminderCreate, user=Depends(get_current_user)):
    # Logic to add to Celery beat or Task Queue
    return {"id": "uuid"}

@app.get("/reminder/open")
async def get_open_reminders(user=Depends(get_current_user)):
    # SELECT * FROM reminders WHERE status = 'pending'
    return []
```

---

## 4. Reminder Engine Logic (Pseudocode)
The heart of the system is the **Escalation Engine**:

```python
def check_due_tasks():
    now = datetime.now()
    
    # 1. Trigger fresh reminders
    due_tasks = db.query(Reminders).filter(scheduled_time == now)
    for task in due_tasks:
        send_ai_voice_notification(task)
        db.create_log(task, status="offen")

    # 2. Re-Notification (15 Min Gap)
    pending_logs = db.query(Logs).filter(status="offen", age >= 15min)
    for log in pending_logs:
        send_ai_voice_notification(f"Zweite Erinnerung für {log.name}")

    # 3. Escalation (60 Min Gap)
    orphaned_logs = db.query(Logs).filter(status="offen", age >= 60min)
    for log in orphaned_logs:
        log.update(status="verpasst")
        notify_emergency_contacts(log.user_id, f"ESKALATION: {log.name} verpasst!")
```

---

## 5. Security & Scaling
- **JWT Auth:** Every request verified.
- **Audit Logging:** Every write event is logged in the `audit` table for traceability.
- **Horizontal Scale:** Celery Workers handle notifications; FastAPI handles I/O.
