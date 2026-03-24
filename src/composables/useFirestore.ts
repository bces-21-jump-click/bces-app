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
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/plugins/firebase'

/**
 * Composable Firestore générique — équivalent Vue.js d'un service CRUD.
 *
 * Usage :
 *   const { lister, obtenir, creer, modifier, supprimer, ecouter, ecouterDocument } = useFirestore()
 */
export function useFirestore() {
  /** Récupère tous les documents d'une collection. */
  async function lister<T>(collectionName: string): Promise<T[]> {
    const snapshot = await getDocs(collection(db, collectionName))
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
  }

  /** Récupère les documents d'une collection avec des filtres (where, orderBy…). */
  async function listerAvecFiltre<T>(
    collectionName: string,
    ...constraints: QueryConstraint[]
  ): Promise<T[]> {
    const q = query(collection(db, collectionName), ...constraints)
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
  }

  /** Récupère un document par son ID. */
  async function obtenir<T>(collectionName: string, id: string): Promise<T> {
    const docSnap = await getDoc(doc(db, collectionName, id))
    if (!docSnap.exists()) throw new Error('Document introuvable')
    return { id: docSnap.id, ...docSnap.data() } as T
  }

  /** Crée un document. Si `id` est fourni, utilise `setDoc` ; sinon `addDoc`. */
  async function creer<T>(collectionName: string, donnees: DocumentData, id?: string): Promise<T> {
    if (id) {
      await setDoc(doc(db, collectionName, id), donnees)
      return { id, ...donnees } as T
    }
    const docRef = await addDoc(collection(db, collectionName), donnees)
    return { id: docRef.id, ...donnees } as T
  }

  /** Met à jour un document (merge). */
  async function modifier<T>(
    collectionName: string,
    id: string,
    donnees: DocumentData,
  ): Promise<T> {
    await setDoc(doc(db, collectionName, id), donnees, { merge: true })
    const docSnap = await getDoc(doc(db, collectionName, id))
    return { id: docSnap.id, ...docSnap.data() } as T
  }

  /** Supprime un document. */
  async function supprimer(collectionName: string, id: string): Promise<void> {
    await deleteDoc(doc(db, collectionName, id))
  }

  /**
   * Écoute une collection en temps réel.
   * Retourne la fonction de désinscription (unsubscribe).
   */
  function ecouter<T>(
    collectionName: string,
    callback: (items: T[]) => void,
    ...constraints: QueryConstraint[]
  ): () => void {
    const ref =
      constraints.length > 0
        ? query(collection(db, collectionName), ...constraints)
        : collection(db, collectionName)

    return onSnapshot(
      ref,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
        callback(items)
      },
      (error) => console.error(`[Firestore] ecouter(${collectionName}):`, error.message),
    )
  }

  /**
   * Écoute un document unique en temps réel.
   * Retourne la fonction de désinscription (unsubscribe).
   */
  function ecouterDocument<T>(
    collectionName: string,
    docId: string,
    callback: (item: T | null) => void,
  ): () => void {
    return onSnapshot(
      doc(db, collectionName, docId),
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null)
          return
        }
        callback({ id: snapshot.id, ...snapshot.data() } as T)
      },
      (error) =>
        console.error(`[Firestore] ecouterDocument(${collectionName}/${docId}):`, error.message),
    )
  }

  return { lister, listerAvecFiltre, obtenir, creer, modifier, supprimer, ecouter, ecouterDocument }
}

/**
 * Variante typée et pré-liée à une collection Firestore.
 *
 * Usage :
 *   const ordersFs = useCollection<Order>('orders')
 *   ordersFs.ajouter({ … })          // pas besoin de repasser le nom de collection
 *   ordersFs.ecouter(items => { … })
 */
export function useCollection<T>(collectionName: string) {
  const fs = useFirestore()
  return {
    lister: () => fs.lister<T>(collectionName),
    listerAvecFiltre: (...constraints: QueryConstraint[]) =>
      fs.listerAvecFiltre<T>(collectionName, ...constraints),
    obtenir: (id: string) => fs.obtenir<T>(collectionName, id),
    lire: (id: string) => fs.obtenir<T>(collectionName, id),
    creer: (donnees: DocumentData, id?: string) => fs.creer<T>(collectionName, donnees, id),
    ajouter: (donnees: DocumentData, id?: string) => fs.creer<T>(collectionName, donnees, id),
    modifier: (id: string, donnees: DocumentData) => fs.modifier<T>(collectionName, id, donnees),
    supprimer: (id: string) => fs.supprimer(collectionName, id),
    ecouter: (callback: (items: T[]) => void, ...constraints: QueryConstraint[]) =>
      fs.ecouter<T>(collectionName, callback, ...constraints),
    ecouterDocument: (docId: string, callback: (item: T | null) => void) =>
      fs.ecouterDocument<T>(collectionName, docId, callback),
  }
}
