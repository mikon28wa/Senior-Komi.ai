import { 
  collection, 
  addDoc, 
  serverTimestamp,
  Firestore 
} from 'firebase/firestore';

export class AuditService {
  constructor(private db: Firestore, private userId: string) {}

  private get collectionPath() {
    return `users/${this.userId}/audit`;
  }

  async log(action: string, entityType: string, entityId: string, details: any = {}) {
    try {
      return await addDoc(collection(this.db, this.collectionPath), {
        action,
        entityType,
        entityId,
        details,
        ownerId: this.userId,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Audit log failed", err);
    }
  }
}
