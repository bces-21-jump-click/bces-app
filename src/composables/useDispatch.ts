import { ref } from 'vue'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '@/plugins/firebase'
import {
  type EtatDispatch,
  type DonneesChambres,
  creerEtatInitial,
  fusionnerDonneesChambres,
} from '@/models/dispatch'

const DISPATCH_COLLECTION = 'dispatches'
const DISPATCH_DOC_ID = 'global'

const etat = ref<EtatDispatch>(creerEtatInitial())
const connecte = ref(false)

let unsubscribe: (() => void) | null = null
let timerEnvoi: ReturnType<typeof setTimeout> | null = null
let refCount = 0

function fusionnerEtatServeur(partiel: Partial<EtatDispatch>): EtatDispatch {
  const base = creerEtatInitial()
  const chambresPartielles = partiel.chambres as Partial<DonneesChambres> | undefined
  return {
    ...base,
    ...partiel,
    centrale: { ...base.centrale, ...partiel.centrale },
    morgue: {
      casiers: { ...base.morgue.casiers, ...partiel.morgue?.casiers },
      urnes: { ...base.morgue.urnes, ...partiel.morgue?.urnes },
      enterrements: { ...base.morgue.enterrements, ...partiel.morgue?.enterrements },
    },
    chambres: fusionnerDonneesChambres(chambresPartielles),
    crises: partiel.crises ?? base.crises,
    patates: partiel.patates ?? base.patates,
    interventions: partiel.interventions ?? base.interventions,
    radios: partiel.radios ?? base.radios,
    effectifs_temporaires: partiel.effectifs_temporaires ?? base.effectifs_temporaires,
    lits: partiel.lits ?? base.lits,
  }
}

function planifierEnvoi(e: EtatDispatch): void {
  if (timerEnvoi) clearTimeout(timerEnvoi)
  timerEnvoi = setTimeout(() => {
    timerEnvoi = null
    void setDoc(
      doc(db, DISPATCH_COLLECTION, DISPATCH_DOC_ID),
      e as unknown as Record<string, unknown>,
      { merge: true },
    )
  }, 300)
}

export function useDispatch() {
  function connecter(): void {
    refCount++
    if (unsubscribe) return

    unsubscribe = onSnapshot(
      doc(db, DISPATCH_COLLECTION, DISPATCH_DOC_ID),
      (snapshot) => {
        connecte.value = true
        if (!snapshot.exists()) return
        if (timerEnvoi !== null) return

        const data = snapshot.data() as Partial<EtatDispatch>
        const etatFusionne = fusionnerEtatServeur(data)
        etat.value = etatFusionne
      },
      () => {
        connecte.value = false
      },
    )
  }

  function envoyerEtat(e: EtatDispatch): void {
    etat.value = e
    planifierEnvoi(e)
  }

  function mettreAJour(partiel: Partial<EtatDispatch>): void {
    const nouvelEtat = { ...etat.value, ...partiel }
    envoyerEtat(nouvelEtat)
  }

  function deconnecter(): void {
    refCount--
    if (refCount > 0) return

    if (timerEnvoi) {
      clearTimeout(timerEnvoi)
      timerEnvoi = null
    }
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    connecte.value = false
  }

  return { etat, connecte, connecter, deconnecter, envoyerEtat, mettreAJour }
}
