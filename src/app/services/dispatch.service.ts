import { Injectable, NgZone, inject, signal } from '@angular/core';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase.config';
import {
  EtatDispatch,
  creerEtatInitial,
  fusionnerDonneesChambres,
  DonneesChambres,
} from '../modeles/dispatch';

const DISPATCH_COLLECTION = 'dispatches';
const DISPATCH_DOC_ID = 'global';

@Injectable({ providedIn: 'root' })
export class DispatchService {
  private readonly zone = inject(NgZone);

  readonly etat = signal<EtatDispatch>(creerEtatInitial());
  readonly connecte = signal(false);
  readonly versionSynchroReferentiels = signal(0);

  private unsubscribe: (() => void) | null = null;
  private timerEnvoi: ReturnType<typeof setTimeout> | null = null;
  private localModifie = false;
  private dernierEtatLocal: EtatDispatch = creerEtatInitial();

  connecter(): void {
    if (this.unsubscribe) return;

    this.unsubscribe = onSnapshot(
      doc(db, DISPATCH_COLLECTION, DISPATCH_DOC_ID),
      (snapshot) => {
        this.zone.run(() => {
          this.connecte.set(true);
          if (!snapshot.exists()) return;

          // Ignorer les échos pendant un envoi local en cours
          if (this.timerEnvoi !== null) return;

          const data = snapshot.data() as Partial<EtatDispatch>;
          const etatFusionne = this.fusionnerEtatServeur(data);
          this.etat.set(etatFusionne);
          this.dernierEtatLocal = etatFusionne;
        });
      },
      () => {
        this.zone.run(() => this.connecte.set(false));
      },
    );
  }

  envoyerEtat(etat: EtatDispatch): void {
    this.etat.set(etat);
    this.dernierEtatLocal = etat;
    this.localModifie = true;
    this.planifierEnvoi(etat);
  }

  mettreAJour(partiel: Partial<EtatDispatch>): void {
    const nouvelEtat = { ...this.etat(), ...partiel };
    this.envoyerEtat(nouvelEtat);
  }

  deconnecter(): void {
    if (this.timerEnvoi) {
      clearTimeout(this.timerEnvoi);
      this.timerEnvoi = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.connecte.set(false);
  }

  private planifierEnvoi(etat: EtatDispatch): void {
    if (this.timerEnvoi) clearTimeout(this.timerEnvoi);
    this.timerEnvoi = setTimeout(() => {
      this.timerEnvoi = null;
      void setDoc(
        doc(db, DISPATCH_COLLECTION, DISPATCH_DOC_ID),
        etat as unknown as Record<string, unknown>,
        {
          merge: true,
        },
      );
    }, 300);
  }

  private fusionnerEtatServeur(partiel: Partial<EtatDispatch>): EtatDispatch {
    const base = creerEtatInitial();
    const chambresPartielles = partiel.chambres as Partial<DonneesChambres> | undefined;
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
    };
  }
}
