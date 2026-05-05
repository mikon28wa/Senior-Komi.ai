import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  Firestore 
} from 'firebase/firestore';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  active: boolean;
  ownerId: string;
}

export interface MedicationLog {
  id: string;
  medication_id: string;
  medication_name: string;
  scheduled_time: any;
  taken_time: any;
  status: 'genommen' | 'offen' | 'verpasst' | 'verschoben';
  comment?: string;
  ownerId: string;
  created_at: any;
}

export class MedicationService {
  constructor(private db: Firestore, private userId: string) {}

  private get collectionPath() {
    return `users/${this.userId}/medications`;
  }

  private get logsPath() {
    return `users/${this.userId}/medicationLogs`;
  }

  async addMedication(data: Omit<Medication, 'id' | 'ownerId'>) {
    return addDoc(collection(this.db, this.collectionPath), {
      ...data,
      ownerId: this.userId,
      createdAt: serverTimestamp()
    });
  }

  async logMedication(medication: Medication, status: MedicationLog['status'] = 'genommen', comment?: string) {
    return addDoc(collection(this.db, this.logsPath), {
      medication_id: medication.id,
      medication_name: medication.name,
      scheduled_time: serverTimestamp(), // In real app, this would be the actual scheduled slot
      taken_time: status === 'genommen' ? serverTimestamp() : null,
      status,
      comment: comment || '',
      ownerId: this.userId,
      created_at: serverTimestamp()
    });
  }

  async updateLogStatus(logId: string, status: MedicationLog['status']) {
    const logRef = doc(this.db, `${this.logsPath}/${logId}`);
    return updateDoc(logRef, { 
      status,
      taken_time: status === 'genommen' ? serverTimestamp() : null
    });
  }
}
