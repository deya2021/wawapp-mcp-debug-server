import { getFirestore } from './firebase-admin.js';
import { getCollection, getField } from '../config/collection-mapping.js';
import type { Firestore, WhereFilterOp, OrderByDirection } from 'firebase-admin/firestore';

export interface QueryFilter {
  field: string;
  operator: WhereFilterOp;
  value: any;
}

export interface QueryOptions {
  orderBy?: { field: string; direction: OrderByDirection };
  limit?: number;
}

export class FirestoreClient {
  private static instance: FirestoreClient;
  private db: Firestore;

  private constructor() {
    this.db = getFirestore();
  }

  static getInstance(): FirestoreClient {
    if (!this.instance) {
      this.instance = new FirestoreClient();
    }
    return this.instance;
  }

  async getDocument(
    collectionName: string,
    docId: string
  ): Promise<any | null> {
    const actualCollection = getCollection(collectionName);
    const docRef = this.db.collection(actualCollection).doc(docId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) return null;

    return { id: snapshot.id, ...snapshot.data() };
  }

  async queryDocuments(
    collectionName: string,
    filters: QueryFilter[] = [],
    options: QueryOptions = {}
  ): Promise<any[]> {
    const actualCollection = getCollection(collectionName);
    let query: any = this.db.collection(actualCollection);

    // Apply filters
    for (const filter of filters) {
      const actualField = getField(collectionName, filter.field);
      query = query.where(actualField, filter.operator, filter.value);
    }

    // Apply ordering
    if (options.orderBy) {
      const actualField = getField(collectionName, options.orderBy.field);
      query = query.orderBy(actualField, options.orderBy.direction || 'asc');
    }

    // Apply limit
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Convert Firestore Timestamp to Date
   */
  timestampToDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    if (timestamp._seconds !== undefined) {
      return new Date(timestamp._seconds * 1000);
    }
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    return null;
  }
}
