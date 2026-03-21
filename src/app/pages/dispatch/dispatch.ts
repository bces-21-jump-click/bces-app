import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  OnInit,
  OnDestroy,
  ElementRef,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DispatchService } from '../../services/dispatch.service';
import { ApiService } from '../../services/api.service';
import { FormationService } from '../../services/formation.service';
import { AuthService } from '../../services/auth.service';
import { Effectif } from '../../modeles/effectif';
import {
  EtatDispatch,
  SlotIntervention,
  EffectifPatate,
  EntreeCrise,
  RadioDispatch,
} from '../../modeles/dispatch';
import {
  CATEGORIES,
  TYPES_INTERVENTION,
  STATUTS_RETOUR,
  ROLES_CENTRAL,
  STATUTS_HOPITAL,
  COMPLEMENTS,
  APPARTENANCES_CRISE,
  CHAMBRES_CRISE,
} from '../../config/dispatch.config';
import { ROLES_CONFIG, ORDRE_ROLES } from '../../config/roles.config';

@Component({
  selector: 'app-dispatch',
  templateUrl: './dispatch.html',
  styleUrl: './dispatch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class DispatchPage implements OnInit, OnDestroy {
  private readonly dispatchSvc = inject(DispatchService);
  private readonly api = inject(ApiService);
  private readonly formationSvc = inject(FormationService);
  private readonly authSvc = inject(AuthService);
  private readonly el = inject(ElementRef);
  private readonly sheetGvizUrl =
    'https://docs.google.com/spreadsheets/d/1A1gxOho_roNwxTtcbiEpLGSWbD8JUasMDu4NL-zdcbw/gviz/tq?gid=0&tqx=out:json&range=B3:D3';
  private readonly triTexte = new Intl.Collator('fr', { sensitivity: 'base' });
  private timerStatutsServices: ReturnType<typeof setInterval> | null = null;
  private readonly effetSynchroReferentiels = effect(() => {
    const version = this.dispatchSvc.versionSynchroReferentiels();
    if (version <= 0) return;
    void this.chargerReferentielsDispatch();
  });

  // Config refs for template
  readonly categories = CATEGORIES;
  readonly typesIntervention = TYPES_INTERVENTION;
  readonly statutsRetour = STATUTS_RETOUR;
  readonly rolesCentral = ROLES_CENTRAL;
  readonly statutsHopital = STATUTS_HOPITAL;
  readonly complements = COMPLEMENTS;
  readonly appartenances = APPARTENANCES_CRISE;
  readonly chambresCrise = CHAMBRES_CRISE;
  readonly rolesConfig = ROLES_CONFIG;

  // Data
  readonly effectifs = signal<Effectif[]>([]);
  readonly progressionsFormation = signal<Record<string, Record<string, number>>>({});
  readonly competencesFormation = signal<Record<string, { emoji: string; roles: string[] }>>({});
  readonly roleEmojisFormation = signal<Record<string, string>>({});
  readonly etat = this.dispatchSvc.etat;
  readonly connecte = this.dispatchSvc.connecte;
  readonly statutLses = signal('Indisponibles');
  readonly statutSafd = signal('Indisponibles');

  // Section visibility
  readonly sectionCriseOuverte = signal(false);
  readonly inclureLsesCrise = signal(false);
  readonly selectAjoutRadioOuvert = signal(false);

  // Computed: effectifs en service (in the "patate")
  readonly effectifsVisibles = computed(() =>
    this.effectifs().filter((eff) => this.estVisibleSurDispatch(eff)),
  );

  readonly effectifsEnService = computed(() => {
    const idsVisibles = new Set(this.effectifsVisibles().map((eff) => eff.id));
    const patates = this.etat().patates;
    return this.trierPatatesParEffectif(
      patates.filter((p) => p.categorie === 'en_service' && idsVisibles.has(p.id)),
    );
  });

  readonly indexPrenomsTuiles = computed(() => {
    const index = new Map<string, number>();
    for (const eff of this.effectifsVisibles()) {
      const prenom = this.extrairePrenom(eff.name);
      if (!prenom) continue;
      const cle = this.normaliserNom(prenom);
      index.set(cle, (index.get(cle) ?? 0) + 1);
    }
    return index;
  });

  readonly nombreEnServiceTotal = computed(() => {
    const etat = this.etat();
    const idsEnService = new Set<string>();

    for (const p of etat.patates) {
      if (p.categorie === 'en_service') idsEnService.add(p.id);
    }
    for (const id of etat.centrale.effectifs) idsEnService.add(id);
    for (const inter of etat.interventions) {
      for (const id of inter.effectifs) idsEnService.add(id);
    }

    let total = 0;
    for (const id of idsEnService) {
      if (this.obtenirEffectif(id)) total++;
    }
    return total;
  });

  // Computed: effectifs par catégorie
  readonly effectifsParCategorie = computed(() => {
    const idsVisibles = new Set(this.effectifsVisibles().map((eff) => eff.id));
    const patates = this.etat().patates;
    const map: Record<string, EffectifPatate[]> = {};
    for (const cat of this.categories) {
      map[cat.id] = this.trierPatatesParEffectif(
        patates.filter((p) => p.categorie === cat.id && idsVisibles.has(p.id)),
      );
    }
    return map;
  });

  // Computed: effectifs hors service (not in any patate, not in centrale, not in intervention)
  readonly effectifsHorsService = computed(() => {
    const etat = this.etat();
    const idsAssignes = new Set<string>();
    for (const p of etat.patates) idsAssignes.add(p.id);
    for (const id of etat.centrale.effectifs) idsAssignes.add(id);
    for (const inter of etat.interventions) {
      for (const id of inter.effectifs) idsAssignes.add(id);
    }
    for (const id of etat.effectifs_temporaires) idsAssignes.add(id);
    return this.trierEffectifs(this.effectifsVisibles().filter((e) => !idsAssignes.has(e.id)));
  });

  readonly nombreHorsService = computed(() => this.effectifsHorsService().length);

  readonly medecinsCrise = computed(() => {
    const set = new Set<string>();
    const rolesAutorises = new Set(ORDRE_ROLES);
    rolesAutorises.delete('LSES');

    for (const eff of this.effectifs()) {
      const role = eff.role;
      if (!role || !rolesAutorises.has(role)) continue;
      if (eff.name) set.add(eff.name);
    }

    if (this.inclureLsesCrise()) {
      set.add('LSES');
    }

    return Array.from(set);
  });

  readonly radiosDirectes = computed(() =>
    this.etat().radios.filter((radio) => this.estCategorieDirecte(radio.categorie)),
  );

  readonly radiosStandards = computed(() =>
    this.etat().radios.filter((radio) => !this.estCategorieDirecte(radio.categorie)),
  );

  readonly isDirection = computed(() => {
    const roleProfil = this.authSvc.profile()?.role ?? '';
    if (roleProfil === 'Directeur' || roleProfil === 'Directeur Adjoint') return true;

    const perms = this.authSvc.profile()?.permissions ?? [];
    if (perms.includes('admin') || perms.includes('dev')) return true;

    const nomProfil = this.normaliserNom(this.authSvc.profile()?.name ?? '');
    if (!nomProfil) return false;
    const employe = this.effectifs().find((eff) => this.normaliserNom(eff.name) === nomProfil);
    return employe?.role === 'Directeur' || employe?.role === 'Directeur Adjoint';
  });

  readonly hasLsesPerm = computed(() => {
    const perms = this.authSvc.profile()?.permissions ?? [];
    const aPermission =
      perms.includes('lses') ||
      perms.includes('bces') ||
      perms.includes('dev') ||
      perms.includes('admin');
    return aPermission || this.isDirection();
  });

  readonly peutGererRadiosDepuisDispatch = computed(() => this.hasLsesPerm());

  readonly peutGererRadiosDirection = computed(() => {
    const perms = this.authSvc.profile()?.permissions ?? [];
    return this.isDirection() || perms.includes('admin') || perms.includes('dev');
  });

  readonly peutGererAssignationRadios = computed(() => {
    return this.hasLsesPerm();
  });

  readonly effectifsAssignablesRadio = computed(() => {
    const etat = this.etat();
    const idsEnService = new Set<string>();

    for (const p of etat.patates) {
      if (p.categorie === 'en_service') idsEnService.add(p.id);
    }
    for (const id of etat.centrale.effectifs) idsEnService.add(id);
    for (const inter of etat.interventions) {
      for (const id of inter.effectifs) idsEnService.add(id);
    }

    const assignables = this.effectifsVisibles().filter((eff) => idsEnService.has(eff.id));
    return this.trierEffectifs(assignables);
  });

  ngOnInit(): void {
    this.dispatchSvc.connecter();
    void this.chargerReferentielsDispatch();
    this.chargerStatutsServices();
    this.timerStatutsServices = setInterval(() => this.chargerStatutsServices(), 30000);
  }

  ngOnDestroy(): void {
    if (this.timerStatutsServices) {
      clearInterval(this.timerStatutsServices);
      this.timerStatutsServices = null;
    }
    this.dispatchSvc.deconnecter();
  }

  private async chargerStatutsServices(): Promise<void> {
    try {
      const res = await fetch(this.sheetGvizUrl, { method: 'GET' });
      if (!res.ok) {
        return;
      }

      const texte = await res.text();
      const debut = texte.indexOf('{');
      const fin = texte.lastIndexOf('}');
      if (debut < 0 || fin < 0 || fin <= debut) {
        return;
      }

      const json = JSON.parse(texte.slice(debut, fin + 1)) as {
        table?: {
          rows?: Array<{ c?: Array<{ v?: string | number | null; f?: string | null } | null> }>;
        };
      };

      const ligne = json.table?.rows?.[0]?.c ?? [];
      const lsesBrut = this.valeurCellule(ligne[0]);
      const safdBrut = this.valeurCellule(ligne[2]);

      this.statutLses.set(this.traduireStatutLses(lsesBrut));
      this.statutSafd.set(this.traduireStatutSafd(safdBrut));
    } catch {
      // Conserver la dernière valeur connue en cas d'échec temporaire.
    }
  }

  private valeurCellule(
    cellule: { v?: string | number | null; f?: string | null } | null | undefined,
  ): string {
    const brut = cellule?.f ?? cellule?.v;
    return String(brut ?? '').trim();
  }

  private traduireStatutLses(brut: string): string {
    const valeur = brut.trim();
    if (!valeur) return "C'est bugué";

    const min = valeur.toLowerCase();
    if (min.includes('indispon')) return 'Indisponibles';
    if (min.includes('off') || min.includes('ferm')) return 'Indisponibles';
    if (min.includes('ouvert')) return 'Disponibles';
    if (min === 'disponibles' || min === 'disponible') return 'Disponibles';
    if (min.includes('nuit')) return 'Mode nuit';

    switch (valeur) {
      case '🎙️':
        return 'Disponibles';
      case 'Off - 🎙️':
        return 'Indisponibles';
      case '🌙':
        return 'Mode nuit';
      default:
        return "C'est bugué";
    }
  }

  private traduireStatutSafd(brut: string): string {
    const valeur = brut.trim();
    if (!valeur) return 'Indisponibles';

    const n = Number(valeur.replace(',', '.'));
    if (!Number.isNaN(n)) {
      return n > 0 ? 'Disponibles' : 'Indisponibles';
    }

    const min = valeur.toLowerCase();
    if (min.includes('indispon') || min.includes('ferm')) return 'Indisponibles';
    if (min === 'disponibles' || min === 'disponible') return 'Disponibles';
    return valeur;
  }

  couleurFondLses(): string {
    switch (this.etatLsesNormalise()) {
      case 'disponibles':
        return 'linear-gradient(180deg, #1f5f3f, #184e34)';
      case 'mode_nuit':
        return 'linear-gradient(180deg, #2f356a, #262d5a)';
      case 'indisponibles':
        return 'linear-gradient(180deg, #5b1f2a, #4c1822)';
      default:
        return 'linear-gradient(180deg, #5a3f1d, #4a3318)';
    }
  }

  couleurBordLses(): string {
    switch (this.etatLsesNormalise()) {
      case 'disponibles':
        return this.couleurHopitalOuvert();
      case 'mode_nuit':
        return this.couleurHopitalModeNuit();
      case 'indisponibles':
        return this.couleurHopitalFerme();
      default:
        return this.couleurHopitalFerme();
    }
  }

  couleurEtatLses(): string {
    switch (this.etatLsesNormalise()) {
      case 'disponibles':
        return '#d8ffe9';
      case 'mode_nuit':
        return '#dce3ff';
      case 'indisponibles':
        return '#ffd1dc';
      default:
        return '#ffe4b8';
    }
  }

  couleurFondSafd(): string {
    return this.etatSafdNormalise() === 'disponibles'
      ? 'linear-gradient(180deg, #1f5f3f, #184e34)'
      : 'linear-gradient(180deg, #5b1f2a, #4c1822)';
  }

  couleurBordSafd(): string {
    return this.etatSafdNormalise() === 'disponibles'
      ? this.couleurHopitalOuvert()
      : this.couleurHopitalFerme();
  }

  couleurEtatSafd(): string {
    return this.etatSafdNormalise() === 'disponibles' ? '#d8ffe9' : '#ffd1dc';
  }

  private etatLsesNormalise(): 'disponibles' | 'indisponibles' | 'mode_nuit' | 'bug' {
    const min = this.statutLses().trim().toLowerCase();
    if (min === 'mode nuit') return 'mode_nuit';
    if (min === 'disponibles' || min === 'disponible') return 'disponibles';
    if (min === 'indisponibles' || min === 'indisponible') return 'indisponibles';
    return 'bug';
  }

  private etatSafdNormalise(): 'disponibles' | 'indisponibles' {
    const min = this.statutSafd().trim().toLowerCase();
    if (min === 'disponibles' || min === 'disponible') return 'disponibles';
    return 'indisponibles';
  }

  private couleurHopitalOuvert(): string {
    return this.statutsHopital.find((s) => s.id === 'gestion_normale')?.couleur ?? '#4caf50';
  }

  private couleurHopitalFerme(): string {
    return this.statutsHopital.find((s) => s.id === 'hopital_ferme')?.couleur ?? '#f44336';
  }

  private couleurHopitalModeNuit(): string {
    return this.statutsHopital.find((s) => s.id === 'mode_nuit')?.couleur ?? '#311b92';
  }

  obtenirSpecialites(effectif: Effectif): string[] {
    return Array.isArray(effectif.specialties) ? effectif.specialties : [];
  }

  obtenirValidations(effectif: Effectif): string[] {
    const validations = new Set<string>();
    const role = effectif.role;

    const progression = this.progressionsFormation()[effectif.id] ?? {};
    const definitions = this.competencesFormation();
    for (const [competenceId, valeur] of Object.entries(progression)) {
      if (valeur <= 0) continue;
      const definition = definitions[competenceId];
      if (!definition) continue;
      if (role && definition.roles.length > 0 && !definition.roles.includes(role)) continue;
      if (definition.emoji) {
        validations.add(definition.emoji);
      }
    }

    return Array.from(validations);
  }

  private async chargerEtatFormation(): Promise<void> {
    try {
      const etat = await this.formationSvc.chargerEtat();

      const progressions: Record<string, Record<string, number>> = {};
      for (const [idTexte, progression] of Object.entries(etat.progressions ?? {})) {
        if (typeof progression !== 'object' || progression === null) {
          continue;
        }

        const ligne: Record<string, number> = {};
        for (const [competence, valeur] of Object.entries(progression)) {
          ligne[competence] = typeof valeur === 'number' && valeur > 0 ? 1 : 0;
        }
        progressions[idTexte] = ligne;
      }
      this.progressionsFormation.set(progressions);

      const mapCompetences: Record<string, { emoji: string; roles: string[] }> = {};
      for (const categorie of etat.competences ?? []) {
        for (const competence of categorie.sous_competences ?? []) {
          if (!competence.id) continue;
          mapCompetences[competence.id] = {
            emoji: competence.emoji ?? '✅',
            roles: Array.isArray(competence.roles) ? competence.roles : [],
          };
        }
      }
      this.competencesFormation.set(mapCompetences);
      this.roleEmojisFormation.set(etat.role_emojis ?? {});
    } catch {
      this.progressionsFormation.set({});
      this.competencesFormation.set({});
      this.roleEmojisFormation.set({});
    }
  }

  private async chargerReferentielsDispatch(): Promise<void> {
    const effectifs = await this.api.lister<Effectif>('employees').catch(() => [] as Effectif[]);
    this.effectifs.set(effectifs);
    await this.chargerEtatFormation();
  }

  obtenirEffectif(id: string): Effectif | undefined {
    return this.effectifsVisibles().find((e) => e.id === id);
  }

  obtenirCouleurRole(role: string): string {
    return ROLES_CONFIG[role]?.color ?? '#757575';
  }

  nomEffectifRadio(effectifId: string | null): string {
    if (effectifId == null) return 'Assigner';
    const eff = this.obtenirEffectif(effectifId);
    return eff?.name || 'Assigner';
  }

  trierIdsEffectifs(ids: readonly string[]): string[] {
    return [...ids].sort((a, b) => {
      const effA = this.obtenirEffectif(a);
      const effB = this.obtenirEffectif(b);
      if (!effA && !effB) return a.localeCompare(b);
      if (!effA) return 1;
      if (!effB) return -1;
      return this.comparerEffectifs(effA, effB);
    });
  }

  nombreRadiosUtilisees(radios: readonly RadioDispatch[]): number {
    return radios.filter((radio) => radio.effectif_id != null).length;
  }

  basculerSelectAjoutRadio(): void {
    this.selectAjoutRadioOuvert.set(!this.selectAjoutRadioOuvert());
  }

  ajouterRadioDepuisSelect(categorie: string): void {
    if (categorie !== 'standard' && categorie !== 'direction') {
      this.selectAjoutRadioOuvert.set(false);
      return;
    }
    this.ajouterRadio(categorie);
    this.selectAjoutRadioOuvert.set(false);
  }

  ajouterRadio(categorie: 'standard' | 'direction' = 'standard'): void {
    if (!this.isDirection() || !this.hasLsesPerm()) return;

    const etat = { ...this.etat() };
    const radios = [...etat.radios];
    if (radios.length >= 30) return;

    const totalCategorie = radios.filter((radio) => {
      const estDirection = this.estCategorieDirecte(radio.categorie);
      return categorie === 'direction' ? estDirection : !estDirection;
    }).length;

    const prefixeSerie = categorie === 'direction' ? 'DIR' : 'STD';
    const nouvelleRadio: RadioDispatch = {
      id: `radio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      serie: `${prefixeSerie}-${String(totalCategorie + 1).padStart(2, '0')}`,
      effectif_id: null,
      dernier_effectif_nom: null,
      actif: true,
      categorie,
    };

    etat.radios = [...radios, nouvelleRadio];
    this.dispatchSvc.envoyerEtat(etat);
  }

  majSerieRadio(radioId: string, serie: string): void {
    if (!this.isDirection() || !this.hasLsesPerm()) return;

    const etat = { ...this.etat() };
    etat.radios = etat.radios.map((radio) =>
      radio.id === radioId ? { ...radio, serie: serie.trim().slice(0, 24) } : radio,
    );
    this.dispatchSvc.envoyerEtat(etat);
  }

  basculerEtatRadio(radioId: string): void {
    if (!this.hasLsesPerm()) return;

    const etat = { ...this.etat() };
    etat.radios = etat.radios.map((radio) => {
      if (radio.id !== radioId) return radio;
      return { ...radio, actif: !radio.actif };
    });
    this.dispatchSvc.envoyerEtat(etat);
  }

  supprimerRadio(radioId: string): void {
    if (!this.isDirection() || !this.hasLsesPerm()) return;

    const etat = { ...this.etat() };
    etat.radios = etat.radios.filter((radio) => radio.id !== radioId);
    this.dispatchSvc.envoyerEtat(etat);
  }

  majAffectationRadio(radioId: string, effectifId: string): void {
    if (!this.peutGererAssignationRadios()) return;

    const radio = this.etat().radios.find((r) => r.id === radioId);
    if (!radio) return;
    if (this.estCategorieDirecte(radio.categorie) && !this.peutGererRadiosDirection()) return;

    const idsAssignables = new Set(this.getRadioEmployeeOptions(radio).map((eff) => eff.id));
    const nouvelleAffectation = effectifId && idsAssignables.has(effectifId) ? effectifId : null;
    const dernierNom = nouvelleAffectation
      ? (this.obtenirEffectif(nouvelleAffectation)?.name ?? null)
      : null;

    const etat = { ...this.etat() };
    etat.radios = etat.radios.map((radio) => {
      if (radio.id !== radioId) return radio;
      return {
        ...radio,
        effectif_id: nouvelleAffectation,
        dernier_effectif_nom: dernierNom ?? radio.dernier_effectif_nom ?? null,
        actif: nouvelleAffectation != null,
      };
    });
    this.dispatchSvc.envoyerEtat(etat);
  }

  getRadioEmployeeOptions(radio: RadioDispatch): Effectif[] {
    if (this.estCategorieDirecte(radio.categorie)) {
      const direction = this.effectifs().filter(
        (eff) => eff.role === 'Directeur' || eff.role === 'Directeur Adjoint',
      );
      const triees = this.trierEffectifs(direction);
      if (!radio.effectif_id) return triees;

      const dejaPresent = triees.some((eff) => eff.id === radio.effectif_id);
      if (dejaPresent) return triees;

      const current = this.obtenirEffectif(radio.effectif_id);
      return current ? [...triees, current] : triees;
    }

    const enService = this.effectifsAssignablesRadio();
    if (!radio.effectif_id) return enService;

    const dejaPresent = enService.some((eff) => eff.id === radio.effectif_id);
    if (dejaPresent) return enService;

    const current = this.obtenirEffectif(radio.effectif_id);
    return current ? [...enService, current] : enService;
  }

  peutAssignerRadio(radio: RadioDispatch): boolean {
    if (!this.hasLsesPerm()) return false;
    if (this.estCategorieDirecte(radio.categorie)) return this.peutGererRadiosDirection();
    return true;
  }

  dernierAssigneRadio(radio: RadioDispatch): string {
    if (radio.effectif_id) {
      return (
        this.obtenirEffectif(radio.effectif_id)?.name ?? radio.dernier_effectif_nom ?? 'Assigner'
      );
    }
    return radio.dernier_effectif_nom ?? 'Assigner';
  }

  estRadioDirection(radio: RadioDispatch): boolean {
    return this.estCategorieDirecte(radio.categorie);
  }

  private estCategorieDirecte(categorie: string | null | undefined): boolean {
    const normalisee = (categorie ?? '').toLowerCase();
    return normalisee.includes('direction') || normalisee.includes('direct');
  }

  private normaliserNom(nom: string): string {
    return nom.trim().toLowerCase();
  }

  nomTuile(effectif: Effectif): string {
    const nomComplet = (effectif.name ?? '').trim();
    if (!nomComplet) return '';

    const prenom = this.extrairePrenom(nomComplet);
    if (!prenom) return nomComplet;

    const nbMemePrenom = this.indexPrenomsTuiles().get(this.normaliserNom(prenom)) ?? 0;
    if (nbMemePrenom < 2) return prenom;

    const initialeNomFamille = this.extraireInitialeNomFamille(nomComplet);
    return initialeNomFamille ? `${prenom} ${initialeNomFamille}.` : prenom;
  }

  private extrairePrenom(nomComplet: string): string {
    const morceaux = nomComplet.trim().split(/\s+/).filter(Boolean);
    return morceaux[0] ?? '';
  }

  private extraireInitialeNomFamille(nomComplet: string): string {
    const morceaux = nomComplet.trim().split(/\s+/).filter(Boolean);
    if (morceaux.length < 2) return '';
    const dernier = morceaux[morceaux.length - 1] ?? '';
    return dernier.charAt(0).toUpperCase();
  }

  private estVisibleSurDispatch(effectif: Effectif): boolean {
    const role = effectif.role;
    if (!role || !ORDRE_ROLES.includes(role) || role === 'Non assigné') {
      return false;
    }
    return true;
  }

  private trierEffectifs(effectifs: readonly Effectif[]): Effectif[] {
    return [...effectifs].sort((a, b) => this.comparerEffectifs(a, b));
  }

  private trierPatatesParEffectif(patates: readonly EffectifPatate[]): EffectifPatate[] {
    return [...patates].sort((a, b) => {
      const effA = this.obtenirEffectif(a.id);
      const effB = this.obtenirEffectif(b.id);
      if (!effA && !effB) return a.id.localeCompare(b.id);
      if (!effA) return 1;
      if (!effB) return -1;
      return this.comparerEffectifs(effA, effB);
    });
  }

  private comparerEffectifs(a: Effectif, b: Effectif): number {
    const ordreRoleA = this.ordreRole(a.role);
    const ordreRoleB = this.ordreRole(b.role);

    if (ordreRoleA !== ordreRoleB) {
      return ordreRoleA - ordreRoleB;
    }

    return this.triTexte.compare(a.name || '', b.name || '');
  }

  private ordreRole(role: string): number {
    const index = ORDRE_ROLES.indexOf(role);
    return index === -1 ? 999 : index;
  }

  // --- Drag & Drop ---
  private dragData: { type: string; id: string; source: string } | null = null;

  onDragStart(event: DragEvent, id: string, source: string): void {
    this.dragData = { type: 'DispatchEffectif', id, source };
    event.dataTransfer?.setData('text/plain', String(id));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDropPatate(event: DragEvent, categorie: string): void {
    event.preventDefault();
    if (!this.dragData) return;
    const effectifId = this.dragData.id;
    this.retirerEffectifDeTout(effectifId);
    const etat = { ...this.etat() };
    etat.patates = [...etat.patates, { id: effectifId, categorie }];
    this.dispatchSvc.envoyerEtat(etat);
    this.dragData = null;
  }

  onDropCentrale(event: DragEvent): void {
    event.preventDefault();
    if (!this.dragData) return;
    const effectifId = this.dragData.id;
    this.retirerEffectifDeTout(effectifId);
    const etat = { ...this.etat() };
    etat.centrale = { ...etat.centrale, effectifs: [...etat.centrale.effectifs, effectifId] };
    this.dispatchSvc.envoyerEtat(etat);
    this.dragData = null;
  }

  onDropIntervention(event: DragEvent, index: number): void {
    event.preventDefault();
    if (!this.dragData) return;
    const effectifId = this.dragData.id;
    this.retirerEffectifDeTout(effectifId);
    const etat = { ...this.etat() };
    const interventions = [...etat.interventions];
    const inter = { ...interventions[index] };
    inter.effectifs = [...inter.effectifs, effectifId];
    interventions[index] = inter;
    etat.interventions = interventions;
    this.dispatchSvc.envoyerEtat(etat);
    this.dragData = null;
  }

  onDropHorsService(event: DragEvent): void {
    event.preventDefault();
    if (!this.dragData) return;
    const effectifId = this.dragData.id;
    this.retirerEffectifDeTout(effectifId);
    this.dispatchSvc.envoyerEtat(this.etat());
    this.dragData = null;
  }

  private retirerEffectifDeTout(id: string): void {
    const etat = { ...this.etat() };
    etat.patates = etat.patates.filter((p) => p.id !== id);
    etat.centrale = {
      ...etat.centrale,
      effectifs: etat.centrale.effectifs.filter((eid) => eid !== id),
    };
    etat.interventions = etat.interventions.map((inter) => ({
      ...inter,
      effectifs: inter.effectifs.filter((eid) => eid !== id),
    }));
    this.dispatchSvc.etat.set(etat);
  }

  // --- Interventions ---
  ajouterIntervention(): void {
    const etat = { ...this.etat() };
    const slot: SlotIntervention = {
      effectifs: [],
      type: 'intervention',
      statut_retour: '',
      lieu: '',
      complement: '',
    };
    etat.interventions = [...etat.interventions, slot];
    this.dispatchSvc.envoyerEtat(etat);
    // Scroll la colonne pour rendre la nouvelle intervention visible
    setTimeout(() => {
      const col = this.el.nativeElement.querySelector('.column-centrale');
      if (col) col.scrollTop = col.scrollHeight;
    });
  }

  supprimerIntervention(index: number): void {
    const etat = { ...this.etat() };
    etat.interventions = etat.interventions.filter((_, i) => i !== index);
    this.dispatchSvc.envoyerEtat(etat);
  }

  resetAffectations(): void {
    const confirme = window.confirm(
      'Réinitialiser le Dispatch ? Tous les effectifs seront remis hors service et les interventions supprimées.',
    );
    if (!confirme) return;

    const etat = { ...this.etat() };
    etat.patates = [];
    etat.centrale = { ...etat.centrale, effectifs: [] };
    etat.interventions = [];
    etat.effectifs_temporaires = [];

    this.dispatchSvc.envoyerEtat(etat);
  }

  majInterventionChamp(index: number, champ: string, valeur: string): void {
    const etat = { ...this.etat() };
    const interventions = [...etat.interventions];
    interventions[index] = { ...interventions[index], [champ]: valeur };
    etat.interventions = interventions;
    this.dispatchSvc.envoyerEtat(etat);
  }

  // --- Centrale ---
  majCentraleChamp(champ: string, valeur: string): void {
    const etat = { ...this.etat() };
    etat.centrale = { ...etat.centrale, [champ]: valeur };
    this.dispatchSvc.envoyerEtat(etat);
  }

  // --- Statut hôpital ---
  majStatutHopital(statut: string): void {
    this.dispatchSvc.mettreAJour({ statut_hopital: statut });
  }

  ouvrirSelectHopital(selectEl: HTMLSelectElement, event: MouseEvent): void {
    const cible = event.target as HTMLElement | null;
    if (cible?.closest('select')) return;

    selectEl.focus();
    const selectAvecPicker = selectEl as HTMLSelectElement & { showPicker?: () => void };
    selectAvecPicker.showPicker?.();
  }

  basculerStatutHopital(): void {
    if (this.statutsHopital.length === 0) return;
    const actuel = this.etat().statut_hopital;
    const indexActuel = this.statutsHopital.findIndex((s) => s.id === actuel);
    const indexSuivant = indexActuel >= 0 ? (indexActuel + 1) % this.statutsHopital.length : 0;
    this.majStatutHopital(this.statutsHopital[indexSuivant].id);
  }

  labelStatutHopital(): string {
    return (
      this.statutsHopital.find((s) => s.id === this.etat().statut_hopital)?.label ??
      'Gestion Normale'
    );
  }

  // --- Bloc-notes ---
  majBlocNotes(texte: string): void {
    this.dispatchSvc.mettreAJour({ bloc_notes: texte });
  }

  // --- Fréquences ---
  majRadioLses(freq: string): void {
    this.dispatchSvc.mettreAJour({ radio_lses: freq });
  }

  majRadioCommune(freq: string): void {
    this.dispatchSvc.mettreAJour({ radio_commune: freq });
  }

  // --- Crises ---
  ajouterCrise(): void {
    const etat = { ...this.etat() };
    const entree: EntreeCrise = {
      ajout_canal: false,
      chambre: '',
      nom_prenom_primo: '',
      groupe: '',
      coma: false,
      blessure_lourde: false,
      inconscient: false,
      commentaires: '',
      medecin_rapatrie: '',
      medecin_soignant: '',
      soins: false,
    };
    etat.crises = [...etat.crises, entree];
    this.dispatchSvc.envoyerEtat(etat);

    // Scroll global vers le bas pour afficher la nouvelle ligne crise.
    setTimeout(() => {
      const host = this.el.nativeElement as HTMLElement;
      host.scrollTo({ top: host.scrollHeight, behavior: 'smooth' });

      const pageScroller = document.scrollingElement as HTMLElement | null;
      pageScroller?.scrollTo({ top: pageScroller.scrollHeight, behavior: 'smooth' });
    });
  }

  supprimerCrise(index: number): void {
    const etat = { ...this.etat() };
    etat.crises = etat.crises.filter((_, i) => i !== index);
    this.dispatchSvc.envoyerEtat(etat);
  }

  majCriseChamp(index: number, champ: string, valeur: unknown): void {
    const etat = { ...this.etat() };
    const crises = [...etat.crises];
    crises[index] = { ...crises[index], [champ]: valeur };
    etat.crises = crises;
    this.dispatchSvc.envoyerEtat(etat);
  }

  majZipCrise(zip: string): void {
    this.dispatchSvc.mettreAJour({ zip_crise: zip });
  }

  // Helpers

  trouverLabelType(id: string): string {
    return this.typesIntervention.find((t) => t.id === id)?.emoji ?? '';
  }

  trouverLabelStatut(id: string): string {
    return this.statutsRetour.find((s) => s.id === id)?.label ?? '';
  }

  couleurStatutHopital(): string {
    return (
      this.statutsHopital.find((s) => s.id === this.etat().statut_hopital)?.couleur ?? '#4caf50'
    );
  }

  couleurTypeIntervention(type: string): string {
    switch (type) {
      case 'intervention':
        return '#2e7d32';
      case 'primo_inter':
        return '#d9480f';
      case 'patrouille':
        return '#1565c0';
      case 'event':
        return '#8e24aa';
      case 'rdv':
        return '#00897b';
      case 'psy':
        return '#6a1b9a';
      case 'otage':
        return '#c62828';
      case 'bureau_admin':
        return '#546e7a';
      case 'formation':
        return '#ef6c00';
      case 'operation':
        return '#5d4037';
      case 'vm':
        return '#00838f';
      case 'hopital':
        return '#7b1fa2';
      default:
        return 'var(--dispatch-card-border)';
    }
  }

  fondTypeIntervention(type: string): string {
    const couleur = this.couleurTypeIntervention(type);
    if (couleur === 'var(--dispatch-card-border)') {
      return 'var(--dispatch-card-bg)';
    }
    return `color-mix(in srgb, var(--dispatch-card-bg) 90%, ${couleur} 10%)`;
  }

  couleurStatutRetour(statut: string): string {
    switch (statut) {
      case 'pat':
        return '#2e7d32';
      case 'retour_0':
        return '#1565c0';
      case 'retour_1':
        return '#00897b';
      case 'retour_2':
        return '#ef6c00';
      case 'retour_3':
        return '#c62828';
      case 'bennys':
        return '#6d4c41';
      case 'zombie_car':
        return '#455a64';
      case 'airbaged':
        return '#8d6e63';
      default:
        return 'var(--input-border)';
    }
  }

  fondStatutRetour(statut: string): string {
    const couleur = this.couleurStatutRetour(statut);
    if (couleur === 'var(--input-border)') {
      return 'var(--input-bg)';
    }
    return `color-mix(in srgb, var(--input-bg) 86%, ${couleur} 14%)`;
  }
}
