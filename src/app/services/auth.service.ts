import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase.config';
import { Profile } from '../modeles/utilisateur';

const PROFILES_COLLECTION = 'profiles';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly zone = inject(NgZone);
  private _resolveReady!: () => void;
  readonly authReady = new Promise<void>((r) => (this._resolveReady = r));

  readonly profile = signal<Profile | null>(null);
  readonly uid = signal<string | null>(null);
  readonly estConnecte = computed(() => this.profile() !== null && this.profile()!.activated);
  readonly estAdmin = computed(() => {
    const perms = this.profile()?.permissions ?? [];
    return perms.includes('admin') || perms.includes('dev');
  });

  constructor() {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.uid.set(user.uid);
        try {
          const profDoc = await getDoc(doc(db, PROFILES_COLLECTION, user.uid));
          if (profDoc.exists()) {
            const data = profDoc.data();
            const p: Profile = {
              id: profDoc.id,
              name: data['name'] ?? '',
              email: data['email'] ?? '',
              role: data['role'] ?? 'User',
              permissions: data['permissions'] ?? [],
              activated: data['activated'] ?? false,
              rejected: data['rejected'] ?? false,
            };
            this.zone.run(() => this.profile.set(p));
          }
        } finally {
          this._resolveReady();
        }
      } else {
        this.zone.run(() => {
          this.profile.set(null);
          this.uid.set(null);
        });
        this._resolveReady();
      }
    });
  }

  /** Liste les profils activés (pour l'autocomplete de connexion) */
  async listerProfilsActifs(): Promise<Profile[]> {
    const q = query(collection(db, PROFILES_COLLECTION), where('activated', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => this.docToProfile(d));
  }

  /** Liste tous les profils (pour la page utilisateurs) */
  async listerProfils(): Promise<Profile[]> {
    const snapshot = await getDocs(collection(db, PROFILES_COLLECTION));
    return snapshot.docs.map((d) => this.docToProfile(d));
  }

  /** Liste les demandes d'accès en attente (non activés, non rejetés) */
  async listerDemandes(): Promise<Profile[]> {
    const snapshot = await getDocs(collection(db, PROFILES_COLLECTION));
    return snapshot.docs
      .map((d) => this.docToProfile(d))
      .filter((p) => !p.activated && !p.rejected);
  }

  /** Écoute les profils activés en temps réel */
  ecouterProfilsActifs(callback: (profils: Profile[]) => void): () => void {
    const q = query(collection(db, PROFILES_COLLECTION), where('activated', '==', true));
    return onSnapshot(q, (snapshot) => {
      const profils = snapshot.docs.map((d) => this.docToProfile(d));
      this.zone.run(() => callback(profils));
    });
  }

  /** Écoute les profils en attente en temps réel */
  ecouterDemandes(callback: (profils: Profile[]) => void): () => void {
    const q = query(collection(db, PROFILES_COLLECTION), where('activated', '==', false));
    return onSnapshot(q, (snapshot) => {
      const profils = snapshot.docs.map((d) => this.docToProfile(d)).filter((p) => !p.rejected);
      this.zone.run(() => callback(profils));
    });
  }

  async approuverDemande(id: string): Promise<void> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { activated: true }, { merge: true });
  }

  async refuserDemande(id: string): Promise<void> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { rejected: true }, { merge: true });
  }

  async mettreAJourPermissions(id: string, permissions: string[]): Promise<void> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { permissions }, { merge: true });
    if (this.profile()?.id === id) {
      this.profile.update((p) => (p ? { ...p, permissions } : p));
    }
  }

  async mettreAJourRole(id: string, role: string): Promise<Profile> {
    await setDoc(doc(db, PROFILES_COLLECTION, id), { role }, { merge: true });
    const docSnap = await getDoc(doc(db, PROFILES_COLLECTION, id));
    const updated = this.docToProfile(docSnap);
    if (this.profile()?.id === id) {
      this.profile.set(updated);
    }
    return updated;
  }

  async supprimerProfil(id: string): Promise<void> {
    await setDoc(
      doc(db, PROFILES_COLLECTION, id),
      { activated: false, rejected: true },
      { merge: true },
    );
  }

  /** Connexion Firebase Auth — email = {name}@bces.app */
  async connexion(name: string, motDePasse: string): Promise<void> {
    const email = `${name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@bces.app`;
    await signInWithEmailAndPassword(auth, email, motDePasse);
  }

  /** Inscription — crée un user Firebase Auth + un profil dans Firestore */
  async inscription(prenom: string, nom: string, motDePasse: string): Promise<string> {
    const formatName = (str: string) =>
      str.toLowerCase().replace(/(?:^|\s|-|')\S/g, (c) => c.toUpperCase());
    const fullName = `${formatName(prenom.trim())} ${formatName(nom.trim())}`;
    const email = `${fullName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}@bces.app`;

    // Vérifier si le profil existe déjà
    const existing = await getDocs(
      query(collection(db, PROFILES_COLLECTION), where('name', '==', fullName)),
    );
    if (!existing.empty) {
      const existingProfile = this.docToProfile(existing.docs[0]);
      if (existingProfile.activated || !existingProfile.rejected) {
        throw new Error('Ce profil existe déjà.');
      }
      // Profile rejeté — réitérer la demande
      existingProfile.rejected = false;
      existingProfile.activated = false;
      await setDoc(
        doc(db, PROFILES_COLLECTION, existingProfile.id),
        {
          activated: false,
          rejected: false,
        },
        { merge: true },
      );
      return "Votre demande d'accès a été réitérée.";
    }

    const cred = await createUserWithEmailAndPassword(auth, email, motDePasse);
    await setDoc(doc(db, PROFILES_COLLECTION, cred.user.uid), {
      name: fullName,
      email,
      role: 'User',
      permissions: [],
      activated: false,
      rejected: false,
    });
    await signOut(auth);
    return "Demande envoyée. Vous pourrez vous connecter dès qu'un responsable aura approuvé votre demande.";
  }

  async deconnexion(): Promise<void> {
    await signOut(auth);
    this.profile.set(null);
    this.uid.set(null);
  }

  aLaPermission(permission: string): boolean {
    return this.profile()?.permissions?.includes(permission) ?? false;
  }

  private docToProfile(d: {
    id: string;
    data: () => Record<string, unknown> | undefined;
  }): Profile {
    const data = d.data() ?? {};
    return {
      id: d.id,
      name: (data['name'] as string) ?? '',
      email: (data['email'] as string) ?? '',
      role: (data['role'] as string) ?? 'User',
      permissions: (data['permissions'] as string[]) ?? [],
      activated: (data['activated'] as boolean) ?? false,
      rejected: (data['rejected'] as boolean) ?? false,
    };
  }
}
