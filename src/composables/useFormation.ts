import { ref } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/plugins/firebase'

export interface SousCompetence {
  id: string
  titre: string
  emoji: string
  roles: string[]
}

export interface CategorieCompetence {
  id: string
  titre: string
  emoji: string
  sous_competences: SousCompetence[]
}

export interface FormationEtat {
  competences: CategorieCompetence[]
  role_emojis: Record<string, string>
  progressions: Record<string, Record<string, number>>
}

const COLLECTION = 'formation'
const DOC_ID = 'global'

function creerEtatVide(): FormationEtat {
  return { competences: [], role_emojis: {}, progressions: {} }
}

export function useFormation() {
  const etat = ref<FormationEtat>(creerEtatVide())

  async function chargerEtat(): Promise<FormationEtat | null> {
    const snap = await getDoc(doc(db, COLLECTION, DOC_ID))
    if (snap.exists()) {
      etat.value = snap.data() as FormationEtat
      return etat.value
    }
    etat.value = creerEtatVide()
    return null
  }

  async function sauvegarderEtat(payload?: FormationEtat): Promise<void> {
    const data = payload ?? etat.value
    await setDoc(doc(db, COLLECTION, DOC_ID), data as unknown as Record<string, unknown>, {
      merge: true,
    })
    if (payload) etat.value = payload
  }

  return { etat, chargerEtat, sauvegarderEtat }
}
