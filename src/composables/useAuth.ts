import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { auth, db } from '@/plugins/firebase'
import { useUserStore } from '@/stores/user'
import type { Profile } from '@/models/profile'

const PROFILES_COLLECTION = 'profiles'

/** Promesse qui se résout une fois l'état d'auth initial connu. */
let authReadyResolve: (() => void) | null = null
export const authReady = new Promise<void>((r) => {
  authReadyResolve = r
})

let authListenerInitialized = false

/**
 * Composable d'authentification Firebase.
 *
 * Initialise un listener `onAuthStateChanged` (une seule fois) qui synchronise
 * le profil Firestore dans le store Pinia `user`.
 */
export function useAuth() {
  const userStore = useUserStore()

  // Initialiser le listener auth une seule fois
  if (!authListenerInitialized) {
    authListenerInitialized = true

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        userStore.uid = user.uid
        try {
          const profDoc = await getDoc(doc(db, PROFILES_COLLECTION, user.uid))
          if (profDoc.exists()) {
            const data = profDoc.data()
            userStore.profile = {
              id: profDoc.id,
              name: (data['name'] as string) ?? '',
              email: (data['email'] as string) ?? '',
              role: (data['role'] as string) ?? 'User',
              permissions: (data['permissions'] as string[]) ?? [],
              activated: (data['activated'] as boolean) ?? false,
              rejected: (data['rejected'] as boolean) ?? false,
            }
          }
        } finally {
          authReadyResolve?.()
          authReadyResolve = null
        }
      } else {
        userStore.$reset()
        authReadyResolve?.()
        authReadyResolve = null
      }
    })
  }

  // ── Méthodes d'authentification ──────────────────────────

  /** Connexion Firebase Auth — email = {name}@bces.app */
  async function connexion(name: string, motDePasse: string): Promise<void> {
    const email = `${name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@bces.app`
    await signInWithEmailAndPassword(auth, email, motDePasse)
  }

  /** Inscription — crée un user Firebase Auth + un profil Firestore */
  async function inscription(prenom: string, nom: string, motDePasse: string): Promise<string> {
    const formatName = (str: string) =>
      str.toLowerCase().replace(/(?:^|\s|-|')\S/g, (c) => c.toUpperCase())
    const fullName = `${formatName(prenom.trim())} ${formatName(nom.trim())}`
    const email = `${fullName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@bces.app`

    // Vérifier si le profil existe déjà
    const existing = await getDocs(
      query(collection(db, PROFILES_COLLECTION), where('name', '==', fullName)),
    )
    if (!existing.empty) {
      const existingDoc = existing.docs[0]!
      const existingData = existingDoc.data()
      const activated = (existingData['activated'] as boolean) ?? false
      const rejected = (existingData['rejected'] as boolean) ?? false

      if (activated || !rejected) {
        throw new Error('Ce profil existe déjà.')
      }

      // Profil rejeté — réitérer la demande
      await setDoc(
        doc(db, PROFILES_COLLECTION, existingDoc.id),
        { activated: false, rejected: false },
        { merge: true },
      )
      return "Votre demande d'accès a été réitérée."
    }

    const cred = await createUserWithEmailAndPassword(auth, email, motDePasse)
    await setDoc(doc(db, PROFILES_COLLECTION, cred.user.uid), {
      name: fullName,
      email,
      role: 'User',
      permissions: [],
      activated: false,
      rejected: false,
    })
    await signOut(auth)
    return "Demande envoyée. Vous pourrez vous connecter dès qu'un responsable aura approuvé votre demande."
  }

  /** Déconnexion */
  async function deconnexion(): Promise<void> {
    await signOut(auth)
    userStore.$reset()
  }

  // ── Gestion des profils ──────────────────────────────────

  /** Liste les profils activés (pour l'autocomplete de connexion) */
  async function listerProfilsActifs(): Promise<Profile[]> {
    const q = query(collection(db, PROFILES_COLLECTION), where('activated', '==', true))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => docToProfile(d))
  }

  /** Liste tous les profils */
  async function listerProfils(): Promise<Profile[]> {
    const snapshot = await getDocs(collection(db, PROFILES_COLLECTION))
    return snapshot.docs.map((d) => docToProfile(d))
  }

  /** Liste les demandes d'accès en attente (non activés, non rejetés) */
  async function listerDemandes(): Promise<Profile[]> {
    const snapshot = await getDocs(collection(db, PROFILES_COLLECTION))
    return snapshot.docs.map((d) => docToProfile(d)).filter((p) => !p.activated && !p.rejected)
  }

  /** Écoute les profils activés en temps réel */
  function ecouterProfilsActifs(callback: (profils: Profile[]) => void): () => void {
    const q = query(collection(db, PROFILES_COLLECTION), where('activated', '==', true))
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => docToProfile(d)))
    })
  }

  /** Écoute les demandes d'accès en attente en temps réel */
  function ecouterDemandes(callback: (profils: Profile[]) => void): () => void {
    const q = query(collection(db, PROFILES_COLLECTION), where('activated', '==', false))
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => docToProfile(d)).filter((p) => !p.rejected))
    })
  }

  /** Approuver une demande d'accès */
  async function approuverDemande(id: string): Promise<void> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { activated: true }, { merge: true })
  }

  /** Refuser une demande d'accès */
  async function refuserDemande(id: string): Promise<void> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { rejected: true }, { merge: true })
  }

  /** Mettre à jour les permissions d'un utilisateur */
  async function mettreAJourPermissions(id: string, permissions: string[]): Promise<void> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { permissions }, { merge: true })
    if (userStore.profile?.id === id) {
      userStore.profile = { ...userStore.profile, permissions }
    }
  }

  /** Mettre à jour le rôle d'un utilisateur */
  async function mettreAJourRole(id: string, role: string): Promise<Profile> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { role }, { merge: true })
    const docSnap = await getDoc(doc(db, PROFILES_COLLECTION, id))
    const updated = docToProfile(docSnap)
    if (userStore.profile?.id === id) {
      userStore.profile = updated
    }
    return updated
  }

  /** Supprimer (désactiver) un profil */
  async function supprimerProfil(id: string): Promise<void> {
    await setDoc(
      doc(db, PROFILES_COLLECTION, id),
      { activated: false, rejected: true },
      { merge: true },
    )
  }

  /** Vérifie si l'utilisateur courant a une permission donnée */
  function aLaPermission(permission: string): boolean {
    return userStore.hasPermission(permission)
  }

  return {
    // Auth
    connexion,
    inscription,
    deconnexion,
    // Profils
    listerProfilsActifs,
    listerProfils,
    listerDemandes,
    ecouterProfilsActifs,
    ecouterDemandes,
    approuverDemande,
    refuserDemande,
    mettreAJourPermissions,
    mettreAJourRole,
    supprimerProfil,
    aLaPermission,
  }
}

// ── Helpers ────────────────────────────────────────────────

function docToProfile(d: { id: string; data: () => Record<string, unknown> | undefined }): Profile {
  const data = d.data() ?? {}
  return {
    id: d.id,
    name: (data['name'] as string) ?? '',
    email: (data['email'] as string) ?? '',
    role: (data['role'] as string) ?? 'User',
    permissions: (data['permissions'] as string[]) ?? [],
    activated: (data['activated'] as boolean) ?? false,
    rejected: (data['rejected'] as boolean) ?? false,
  }
}
