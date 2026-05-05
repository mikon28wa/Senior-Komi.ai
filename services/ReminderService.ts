import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  Firestore 
} from 'firebase/firestore';

export interface Reminder {
  id: string;
  user_id: string;
  type: 'medication' | 'appointment' | 'task';
  reference_id: string;
  title: string;
  scheduled_time: any;
  status: 'pending' | 'completed' | 'skipped' | 'overdue';
  priority: 'low' | 'normal' | 'high' | 'emergency';
  repeat_rule?: string;
  ownerId: string;
  created_at: any;
}

export class ReminderService {
  constructor(private db: Firestore, private userId: string) {}

  private get collectionPath() {
    return `users/${this.userId}/reminders`;
  }

  async createReminder(data: Omit<Reminder, 'id' | 'ownerId' | 'created_at' | 'user_id'>) {
    return addDoc(collection(this.db, this.collectionPath), {
      ...data,
      user_id: this.userId,
      ownerId: this.userId,
      created_at: serverTimestamp(),
      status: 'pending'
    });
  }

  async confirmReminder(reminderId: string) {
    const ref = doc(this.db, `${this.collectionPath}/${reminderId}`);
    return updateDoc(ref, { status: 'completed' });
  }

  async markAsOverdue(reminderId: string) {
    const ref = doc(this.db, `${this.collectionPath}/${reminderId}`);
    return updateDoc(ref, { status: 'overdue' });
  }
}
