import { 
  collection, 
  addDoc, 
  serverTimestamp,
  Firestore 
} from 'firebase/firestore';

export interface MemoryEntry {
  id: string;
  category: 'Personen' | 'Gewohnheiten' | 'Präferenzen' | 'Notfall' | 'Risiken' | 'Organisatorisch';
  content: string;
  priority: number;
  valid_until?: any;
  created_at: any;
  ownerId: string;
}

export class MemoryService {
  constructor(private db: Firestore, private userId: string) {}

  private get collectionPath() {
    return `users/${this.userId}/memory`;
  }

  async addEntry(category: MemoryEntry['category'], content: string, priority: number = 1) {
    return addDoc(collection(this.db, this.collectionPath), {
      category,
      content,
      priority,
      ownerId: this.userId,
      created_at: serverTimestamp()
    });
  }
}
