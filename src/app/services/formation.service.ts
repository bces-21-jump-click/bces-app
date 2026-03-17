import { Injectable } from '@angular/core';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase.config';

export interface FormationEtat {
  competences: Array<{
    id: string;
    titre: string;
    emoji: string;
    sous_competences: Array<{ id: string; titre: string; emoji: string; roles: string[] }>;
  }>;
  role_emojis: Record<string, string>;
  progressions: Record<string, Record<string, number>>;
}

const FORMATION_COLLECTION = 'formation';
const FORMATION_DOC_ID = 'global';

@Injectable({ providedIn: 'root' })
export class FormationService {
  async chargerEtat(): Promise<FormationEtat> {
    const docSnap = await getDoc(doc(db, FORMATION_COLLECTION, FORMATION_DOC_ID));
    if (!docSnap.exists()) {
      return { competences: [], role_emojis: {}, progressions: {} };
    }
    return docSnap.data() as FormationEtat;
  }

  async sauvegarderEtat(etat: FormationEtat): Promise<FormationEtat> {
    await setDoc(
      doc(db, FORMATION_COLLECTION, FORMATION_DOC_ID),
      etat as unknown as Record<string, unknown>,
    );
    return etat;
  }
}
