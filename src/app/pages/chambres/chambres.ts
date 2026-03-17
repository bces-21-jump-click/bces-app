import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DispatchService } from '../../services/dispatch.service';
import {
  SALLES_AVEC_LITS,
  SALLES_SIMPLES,
  SALLES_OPERATION,
  STATUTS_CHAMBRE,
  STATUTS_OPERATION,
  COULEURS_STATUTS_CHAMBRE,
} from '../../config/dispatch.config';
import { DonneesChambres, FicheChambre, FicheOperation } from '../../modeles/dispatch';

type SalleAvecLitsId = 'emergency_room' | 'josiah_room' | 'chiliad_room';
type LitId = 'lit_g' | 'lit_m' | 'lit_d';
type SalleSimpleId = 'gordo_room' | 'san_chianki_room';
type SalleOperationId = 'op_1' | 'op_2' | 'op_3';

@Component({
  selector: 'app-chambres',
  templateUrl: './chambres.html',
  styleUrl: './chambres.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ChambresPage implements OnInit, OnDestroy {
  private readonly admissionSep = ' | ';
  private readonly couleursStatutsChambre = COULEURS_STATUTS_CHAMBRE;

  private readonly dispatchSvc = inject(DispatchService);

  readonly sallesAvecLits = SALLES_AVEC_LITS;
  readonly sallesSimples = SALLES_SIMPLES;
  readonly sallesOperation = SALLES_OPERATION;
  readonly statutsChambre = STATUTS_CHAMBRE;
  readonly statutsOperation = STATUTS_OPERATION;

  readonly etat = this.dispatchSvc.etat;
  readonly chambres = computed(() => this.etat().chambres);
  readonly connecte = this.dispatchSvc.connecte;

  ngOnInit(): void {
    this.dispatchSvc.connecter();
  }

  ngOnDestroy(): void {
    this.dispatchSvc.deconnecter();
  }

  majLit(
    salleId: SalleAvecLitsId,
    litId: LitId,
    champ: keyof FicheChambre,
    valeur: string | boolean,
  ): void {
    const chambres = this.chambres();
    const ficheMaj = this.completerHorodatageAdmissionSiNecessaire(
      {
        ...chambres[salleId][litId],
        [champ]: valeur,
      },
      champ,
    );
    const salle = {
      ...chambres[salleId],
      [litId]: ficheMaj,
    };
    this.mettreAJourChambres({ ...chambres, [salleId]: salle });
  }

  majSalleSimple(
    salleId: SalleSimpleId,
    champ: keyof FicheChambre,
    valeur: string | boolean,
  ): void {
    const chambres = this.chambres();
    const ficheMaj = this.completerHorodatageAdmissionSiNecessaire(
      {
        ...chambres[salleId],
        [champ]: valeur,
      },
      champ,
    );
    const salle = {
      ...ficheMaj,
    };
    this.mettreAJourChambres({ ...chambres, [salleId]: salle });
  }

  majOperation(salleId: SalleOperationId, champ: keyof FicheOperation, valeur: string): void {
    const chambres = this.chambres();
    const operations = {
      ...chambres.operations,
      [salleId]: {
        ...chambres.operations[salleId],
        [champ]: valeur,
      },
    };
    this.mettreAJourChambres({ ...chambres, operations });
  }

  admissionHorodatage(salleId: SalleAvecLitsId, litId: LitId): string {
    return this.lireAdmission(this.chambres()[salleId][litId].admission_medecin).date;
  }

  admissionMedecins(salleId: SalleAvecLitsId, litId: LitId): string {
    return this.lireAdmission(this.chambres()[salleId][litId].admission_medecin).medecins;
  }

  admissionHorodatageSalleSimple(salleId: SalleSimpleId): string {
    return this.lireAdmission(this.chambres()[salleId].admission_medecin).date;
  }

  admissionMedecinsSalleSimple(salleId: SalleSimpleId): string {
    return this.lireAdmission(this.chambres()[salleId].admission_medecin).medecins;
  }

  majAdmissionMedecins(salleId: SalleAvecLitsId, litId: LitId, medecins: string): void {
    const courant = this.lireAdmission(this.chambres()[salleId][litId].admission_medecin);
    this.majLit(salleId, litId, 'admission_medecin', this.ecrireAdmission(courant.date, medecins));
  }

  majAdmissionMedecinsSalleSimple(salleId: SalleSimpleId, medecins: string): void {
    const courant = this.lireAdmission(this.chambres()[salleId].admission_medecin);
    this.majSalleSimple(salleId, 'admission_medecin', this.ecrireAdmission(courant.date, medecins));
  }

  couleurStatutChambre(statut: string): string {
    const cle = statut.trim();
    if (!cle) {
      return '';
    }
    return this.couleursStatutsChambre[cle] ?? '';
  }

  couleurStatutLit(salleId: SalleAvecLitsId, litId: LitId): string {
    return this.couleurStatutChambre(this.chambres()[salleId][litId].statut);
  }

  couleurStatutSalleSimple(salleId: SalleSimpleId): string {
    return this.couleurStatutChambre(this.chambres()[salleId].statut);
  }

  private mettreAJourChambres(chambres: DonneesChambres): void {
    const etat = { ...this.etat(), chambres };
    this.dispatchSvc.envoyerEtat(etat);
  }

  viderLit(salleId: SalleAvecLitsId, litId: LitId): void {
    const chambres = this.chambres();
    const salle = {
      ...chambres[salleId],
      [litId]: this.ficheChambreVide(),
    };
    this.mettreAJourChambres({ ...chambres, [salleId]: salle });
  }

  viderSalleSimple(salleId: SalleSimpleId): void {
    const chambres = this.chambres();
    this.mettreAJourChambres({ ...chambres, [salleId]: this.ficheChambreVide() });
  }

  viderSalleOperation(salleId: SalleOperationId): void {
    const chambres = this.chambres();
    const operations = {
      ...chambres.operations,
      [salleId]: this.ficheOperationVide(),
    };
    this.mettreAJourChambres({ ...chambres, operations });
  }

  litRempli(salleId: SalleAvecLitsId, litId: LitId): boolean {
    return this.estFicheChambreRemplie(this.chambres()[salleId][litId]);
  }

  salleSimpleRemplie(salleId: SalleSimpleId): boolean {
    return this.estFicheChambreRemplie(this.chambres()[salleId]);
  }

  salleOperationRemplie(salleId: SalleOperationId): boolean {
    return this.estFicheOperationRemplie(this.chambres().operations[salleId]);
  }

  private estFicheChambreRemplie(fiche: FicheChambre): boolean {
    return Boolean(
      fiche.patient.trim() ||
      fiche.admission_medecin.trim() ||
      fiche.type_prise_en_charge.trim() ||
      fiche.statut.trim() ||
      fiche.fdo ||
      fiche.soins,
    );
  }

  private estFicheOperationRemplie(fiche: FicheOperation): boolean {
    return Boolean(
      fiche.patient.trim() ||
      fiche.medecins.trim() ||
      fiche.statut.trim() ||
      fiche.description.trim(),
    );
  }

  private lireAdmission(valeur: string): { date: string; medecins: string } {
    const texte = valeur.trim();
    if (!texte) {
      return { date: '', medecins: '' };
    }

    const withPipe = texte.match(/^([^|]+)\|\s*(.*)$/);
    if (withPipe) {
      return {
        date: withPipe[1].trim(),
        medecins: withPipe[2].trim(),
      };
    }

    // Compatibilite avec les anciennes valeurs: "jj/mm hh:mm",
    // "jj/mm hh:mm - medecin" ou "jj/mm hh:mm medecin".
    const withDatePrefix = texte.match(/^(\d{2}\/\d{2}\s\d{2}:\d{2})(?:\s*(?:\||-|–)?\s*(.*))?$/);
    if (withDatePrefix) {
      return {
        date: withDatePrefix[1].trim(),
        medecins: (withDatePrefix[2] ?? '').trim(),
      };
    }

    return { date: '', medecins: texte };
  }

  private ecrireAdmission(date: string, medecins: string): string {
    const d = date.trim();
    const m = medecins.trim();
    if (!d && !m) {
      return '';
    }
    if (!d) {
      return m;
    }
    if (!m) {
      return d;
    }
    return `${d}${this.admissionSep}${m}`;
  }

  private completerHorodatageAdmissionSiNecessaire(
    fiche: FicheChambre,
    champModifie: keyof FicheChambre,
  ): FicheChambre {
    const admission = this.lireAdmission(fiche.admission_medecin);
    if (admission.date) {
      return fiche;
    }

    if (!this.estFicheChambreRemplie(fiche)) {
      return fiche;
    }

    const medecins =
      champModifie === 'admission_medecin'
        ? this.lireAdmission(fiche.admission_medecin).medecins
        : admission.medecins;

    return {
      ...fiche,
      admission_medecin: this.ecrireAdmission(this.horodatageSansAnnee(), medecins),
    };
  }

  private horodatageSansAnnee(): string {
    const now = new Date();
    const j = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${j}/${m} ${h}:${min}`;
  }

  private ficheChambreVide(): FicheChambre {
    return {
      patient: '',
      admission_medecin: '',
      type_prise_en_charge: '',
      fdo: false,
      soins: false,
      statut: '',
    };
  }

  private ficheOperationVide(): FicheOperation {
    return {
      patient: '',
      medecins: '',
      statut: '',
      description: '',
    };
  }
}
