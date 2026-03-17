import { Injectable, NgZone, inject } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../config/firebase.config';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly zone = inject(NgZone);

  async lister<T>(collectionName: string): Promise<T[]> {
    const snapshot = await getDocs(collection(db, collectionName));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }

  async listerAvecFiltre<T>(
    collectionName: string,
    ...constraints: QueryConstraint[]
  ): Promise<T[]> {
    const q = query(collection(db, collectionName), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }

  async obtenir<T>(collectionName: string, id: string): Promise<T> {
    const docSnap = await getDoc(doc(db, collectionName, id));
    if (!docSnap.exists()) throw new Error('Document introuvable');
    return { id: docSnap.id, ...docSnap.data() } as T;
  }

  async creer<T>(
    collectionName: string,
    donnees: Record<string, unknown>,
    id?: string,
  ): Promise<T> {
    if (id) {
      await setDoc(doc(db, collectionName, id), donnees);
      return { id, ...donnees } as T;
    }
    const docRef = await addDoc(collection(db, collectionName), donnees);
    return { id: docRef.id, ...donnees } as T;
  }

  async modifier<T>(
    collectionName: string,
    id: string,
    donnees: Record<string, unknown>,
  ): Promise<T> {
    await setDoc(doc(db, collectionName, id), donnees, { merge: true });
    const docSnap = await getDoc(doc(db, collectionName, id));
    return { id: docSnap.id, ...docSnap.data() } as T;
  }

  async supprimer(collectionName: string, id: string): Promise<void> {
    await deleteDoc(doc(db, collectionName, id));
  }

  ecouter<T>(
    collectionName: string,
    callback: (items: T[]) => void,
    ...constraints: QueryConstraint[]
  ): () => void {
    const ref =
      constraints.length > 0
        ? query(collection(db, collectionName), ...constraints)
        : collection(db, collectionName);
    return onSnapshot(
      ref,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
        this.zone.run(() => callback(items));
      },
      (error) => console.error(`[Firestore] ecouter(${collectionName}):`, error.message),
    );
  }

  ecouterDocument<T>(
    collectionName: string,
    docId: string,
    callback: (item: T | null) => void,
  ): () => void {
    return onSnapshot(
      doc(db, collectionName, docId),
      (snapshot) => {
        if (!snapshot.exists()) {
          this.zone.run(() => callback(null));
          return;
        }
        const item = { id: snapshot.id, ...snapshot.data() } as T;
        this.zone.run(() => callback(item));
      },
      (error) =>
        console.error(`[Firestore] ecouterDocument(${collectionName}/${docId}):`, error.message),
    );
  }
}
