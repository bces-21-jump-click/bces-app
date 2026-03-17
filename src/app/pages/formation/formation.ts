import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ORDRE_ROLES, obtenirCouleurRole } from '../../config/roles.config';
import { Effectif } from '../../modeles/effectif';
import { AuthService } from '../../services/auth.service';
import { FormationService, FormationEtat } from '../../services/formation.service';

const ROLES_COMPETENCES = ORDRE_ROLES.filter((role) => role !== 'Temporaire');

interface Employe {
  id: string;
  name: string;
  role: string;
  helicopterTrainingDate: string | null;
  arrivalDate: string | null;
  progression_competences: Record<string, number>;
  date_dernier_suivi: string;
}

interface Guide {
  id: number;
  titre: string;
  description: string;
  etapes: { titre: string; description: string }[];
}

interface Competence {
  id: string;
  titre: string;
  emoji: string;
  sous_competences: { id: string; titre: string; emoji: string; roles: string[] }[];
}

const CATEGORIES_COMPETENCES_PAR_DEFAUT: Competence[] = [
  {
    id: 'basics',
    titre: 'Bases',
    emoji: '📋',
    sous_competences: [
      { id: 'dds', titre: 'DDS', emoji: '🩸', roles: [...ROLES_COMPETENCES] },
      { id: 'vm', titre: 'VM', emoji: '⚕️', roles: [...ROLES_COMPETENCES] },
      { id: 'vc', titre: 'VC', emoji: '🩺', roles: [...ROLES_COMPETENCES] },
      {
        id: 'redaction',
        titre: 'Rédaction dossier',
        emoji: '✏️',
        roles: [...ROLES_COMPETENCES],
      },
      { id: 'conduite', titre: 'Conduite', emoji: '🚗', roles: [...ROLES_COMPETENCES] },
    ],
  },
  {
    id: 'basic_inters',
    titre: 'Interventions basiques',
    emoji: '🚑',
    sous_competences: [
      { id: 'avp', titre: 'AVP / Airbag', emoji: '🚔', roles: [...ROLES_COMPETENCES] },
      {
        id: 'deshydratation',
        titre: 'Déshydratation / Hypoglycémie',
        emoji: '🥤',
        roles: [...ROLES_COMPETENCES],
      },
      { id: 'fractures', titre: 'Fractures', emoji: '🦴', roles: [...ROLES_COMPETENCES] },
      { id: 'chocs_tete', titre: 'Chocs tête', emoji: '🧠', roles: [...ROLES_COMPETENCES] },
      { id: 'noyade', titre: 'Noyade', emoji: '🌊', roles: [...ROLES_COMPETENCES] },
    ],
  },
  {
    id: 'advanced_inters',
    titre: 'Interventions avancées',
    emoji: '🏥',
    sous_competences: [
      { id: 'brulures', titre: 'Brûlures', emoji: '🔥', roles: [...ROLES_COMPETENCES] },
      { id: 'balles', titre: 'Balles', emoji: '🔫', roles: [...ROLES_COMPETENCES] },
      { id: 'chute_15m', titre: 'Chute +15m', emoji: '🧗', roles: [...ROLES_COMPETENCES] },
      { id: 'plaques_vis', titre: 'Plaques et vis', emoji: '🛠️', roles: [...ROLES_COMPETENCES] },
      { id: 'trepanation', titre: 'Trépanation', emoji: '🪚', roles: [...ROLES_COMPETENCES] },
      { id: 'centrale', titre: 'Centrale', emoji: '📻', roles: [...ROLES_COMPETENCES] },
    ],
  },
  {
    id: 'optional',
    titre: 'Optionnel',
    emoji: '⭐',
    sous_competences: [
      { id: 'detatouage', titre: 'Détatouage', emoji: '🧽', roles: [...ROLES_COMPETENCES] },
      { id: 'unite_x', titre: 'Unité X', emoji: '❎', roles: [...ROLES_COMPETENCES] },
      { id: 'patrouille', titre: 'Patrouille', emoji: '🚓', roles: [...ROLES_COMPETENCES] },
      {
        id: 'ouverture_dossier',
        titre: 'Ouverture de dossier',
        emoji: '📂',
        roles: [...ROLES_COMPETENCES],
      },
    ],
  },
];

const FORMATIONS_CONFIG = [
  { titre: 'Formation Grenouille', couleur: '#0d9488' },
  { titre: 'Formation Conduite', couleur: '#16a34a' },
  { titre: 'Formation Off Road', couleur: '#78350f' },
  { titre: 'Formation Médicoptère', couleur: '#4338ca' },
];

const ROLES_VALIDATION_COMPETENCES = new Set([
  'Directeur',
  'Directeur Adjoint',
  'Assistant RH',
  'Responsable de Service',
]);

const ROLE_EMOJIS_PAR_DEFAUT: Record<string, string> = {
  Directeur: '👑',
  'Directeur Adjoint': '🧭',
  'Assistant RH': '🗂️',
  'Responsable de Service': '📣',
  Spécialiste: '🧪',
  Titulaire: '🩺',
  Résident: '📚',
  Interne: '🧑‍🎓',
  Temporaire: '⏳',
};

@Component({
  selector: 'app-formation',
  templateUrl: './formation.html',
  styleUrl: './formation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class FormationPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly formationSvc = inject(FormationService);

  readonly employes = signal<Employe[]>([]);
  readonly guides = signal<Guide[]>([]);
  readonly chargement = signal(false);
  readonly recherche = signal('');
  readonly onglet = signal<'suivi' | 'guides' | 'competences' | 'demandes'>('suivi');
  readonly employeSelectionne = signal<Employe | null>(null);
  readonly categories = signal<Competence[]>(CATEGORIES_COMPETENCES_PAR_DEFAUT);
  readonly roleEmojis = signal<Record<string, string>>({ ...ROLE_EMOJIS_PAR_DEFAUT });

  readonly roles = ORDRE_ROLES;
  readonly rolesEdition = [...ROLES_COMPETENCES].reverse();
  readonly formations = FORMATIONS_CONFIG;
  readonly obtenirCouleurRole = obtenirCouleurRole;
  readonly peutValiderCompetences = computed(() => {
    const role = this.auth.profile()?.role;
    return !!role && ROLES_VALIDATION_COMPETENCES.has(role);
  });

  readonly employesFiltres = computed(() => {
    const terme = this.recherche().toLowerCase();
    return this.employes()
      .filter((e) => !terme || e.name.toLowerCase().includes(terme))
      .sort((a, b) => {
        const ia = ORDRE_ROLES.indexOf(a.role);
        const ib = ORDRE_ROLES.indexOf(b.role);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
  });

  ngOnInit(): void {
    this.charger();
  }

  async charger(): Promise<void> {
    this.chargement.set(true);
    const [effectifs, guides, etatFormationCharge] = await Promise.all([
      this.api.lister<Effectif>('employees').catch(() => [] as Effectif[]),
      this.api.lister<Guide>('guides').catch(() => [] as Guide[]),
      this.formationSvc.chargerEtat().catch(() => null),
    ]);

    let etatFormation = etatFormationCharge;
    const etatVide =
      !etatFormation ||
      ((etatFormation.competences?.length ?? 0) === 0 &&
        Object.keys(etatFormation.role_emojis ?? {}).length === 0 &&
        Object.keys(etatFormation.progressions ?? {}).length === 0);

    if (etatVide) {
      const legacy = this.lireEtatLegacyLocalStorage();
      if (legacy) {
        etatFormation = legacy;
        void this.formationSvc.sauvegarderEtat(legacy);
      }
    }

    const competences = this.normaliserCompetences(etatFormation?.competences ?? []);
    const roleEmojis = this.normaliserRoleEmojis(etatFormation?.role_emojis ?? {});
    const progressions = this.normaliserProgressions(etatFormation?.progressions ?? {});

    this.categories.set(competences);
    this.roleEmojis.set(roleEmojis);

    this.employes.set(
      effectifs.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role || 'Non assigné',
        helicopterTrainingDate: e.helicopterTrainingDate ?? null,
        arrivalDate: e.arrivalDate ?? null,
        progression_competences: progressions[e.id] ?? {},
        date_dernier_suivi: '—',
      })),
    );
    this.guides.set(guides);
    this.chargement.set(false);
  }

  async synchroniserEmployes(): Promise<void> {
    await this.charger();
  }

  majEmojiRole(role: string, emoji: string): void {
    this.roleEmojis.update((courants) => ({
      ...courants,
      [role]: emoji.trim() || ROLE_EMOJIS_PAR_DEFAUT[role] || '🏷️',
    }));
    this.sauvegarderEtatFormation();
  }

  emojiRole(role: string): string {
    return this.roleEmojis()[role] || ROLE_EMOJIS_PAR_DEFAUT[role] || '🏷️';
  }

  ajouterCompetencePourRole(role: string): void {
    const id = this.genererIdCompetence();
    const categorieCible = this.categories().some((c) => c.id === 'optional')
      ? 'optional'
      : (this.categories()[0]?.id ?? 'optional');
    this.categories.update((categories) =>
      categories.map((cat) =>
        cat.id === categorieCible
          ? {
              ...cat,
              sous_competences: [
                ...cat.sous_competences,
                {
                  id,
                  titre: `Nouvelle compétence ${this.competencesPourRole(role).length + 1}`,
                  emoji: '✅',
                  roles: [role],
                },
              ],
            }
          : cat,
      ),
    );
    this.sauvegarderEtatFormation();
  }

  supprimerCompetence(competenceId: string): void {
    this.categories.update((categories) =>
      categories.map((cat) => ({
        ...cat,
        sous_competences: cat.sous_competences.filter((sc) => sc.id !== competenceId),
      })),
    );

    this.employes.update((courants) =>
      courants.map((e) => {
        const progression = { ...(e.progression_competences ?? {}) };
        delete progression[competenceId];
        return { ...e, progression_competences: progression };
      }),
    );

    const selection = this.employeSelectionne();
    if (selection) {
      const progression = { ...(selection.progression_competences ?? {}) };
      delete progression[competenceId];
      this.employeSelectionne.set({ ...selection, progression_competences: progression });
    }

    this.sauvegarderEtatFormation();
  }

  majTitreCompetence(competenceId: string, titre: string): void {
    this.categories.update((categories) =>
      categories.map((cat) => ({
        ...cat,
        sous_competences: cat.sous_competences.map((sc) =>
          sc.id === competenceId ? { ...sc, titre: titre.trim() || sc.titre } : sc,
        ),
      })),
    );
    this.sauvegarderEtatFormation();
  }

  majEmojiCompetence(competenceId: string, emoji: string): void {
    this.categories.update((categories) =>
      categories.map((cat) => ({
        ...cat,
        sous_competences: cat.sous_competences.map((sc) =>
          sc.id === competenceId ? { ...sc, emoji: emoji.trim() || '✅' } : sc,
        ),
      })),
    );
    this.sauvegarderEtatFormation();
  }

  basculerRoleCompetence(competenceId: string, role: string, active: boolean): void {
    this.categories.update((categories) =>
      categories.map((cat) => ({
        ...cat,
        sous_competences: cat.sous_competences.map((sc) => {
          if (sc.id !== competenceId) return sc;
          const roles = new Set(sc.roles);
          if (active) roles.add(role);
          else roles.delete(role);
          return { ...sc, roles: Array.from(roles) };
        }),
      })),
    );
    this.sauvegarderEtatFormation();
  }

  competenceActivePourRole(competenceId: string, role: string): boolean {
    const competence = this.trouverSousCompetence(competenceId);
    if (!competence) return false;
    return competence.roles.includes(role);
  }

  competencesPourRole(role: string): { id: string; titre: string; emoji: string }[] {
    return this.categories()
      .flatMap((c) => c.sous_competences)
      .filter((sc) => sc.roles.includes(role))
      .map((sc) => ({ id: sc.id, titre: sc.titre, emoji: sc.emoji }));
  }

  competencesCategoriePourSelection(
    categorieId: string,
  ): { id: string; titre: string; emoji: string }[] {
    const selection = this.employeSelectionne();
    if (!selection) return [];

    const categorie = this.categories().find((c) => c.id === categorieId);
    if (!categorie) return [];

    return categorie.sous_competences
      .filter((sc) => sc.roles.includes(selection.role))
      .map((sc) => ({ id: sc.id, titre: sc.titre, emoji: sc.emoji }));
  }

  basculerValidationCompetence(competenceId: string, validee: boolean): void {
    if (!this.peutValiderCompetences()) return;
    const selection = this.employeSelectionne();
    if (!selection) return;
    if (!this.competenceActivePourRole(competenceId, selection.role)) return;

    const progression = {
      ...(selection.progression_competences ?? {}),
      [competenceId]: validee ? 1 : 0,
    };

    this.employes.update((courants) =>
      courants.map((e) =>
        e.id === selection.id
          ? {
              ...e,
              progression_competences: progression,
            }
          : e,
      ),
    );

    this.employeSelectionne.set({
      ...selection,
      progression_competences: progression,
    });
    this.sauvegarderEtatFormation();
  }

  async basculerValidationHelico(validee: boolean): Promise<void> {
    if (!this.peutValiderCompetences()) return;
    const selection = this.employeSelectionne();
    if (!selection) return;

    const precedent = selection.helicopterTrainingDate;
    const newValue = validee ? new Date().toISOString().split('T')[0] : null;

    this.employes.update((courants) =>
      courants.map((e) => (e.id === selection.id ? { ...e, helicopterTrainingDate: newValue } : e)),
    );
    this.employeSelectionne.set({ ...selection, helicopterTrainingDate: newValue });

    try {
      await this.api.modifier<Effectif>('employees', selection.id, {
        helicopterTrainingDate: newValue,
      });
    } catch {
      this.employes.update((courants) =>
        courants.map((e) =>
          e.id === selection.id ? { ...e, helicopterTrainingDate: precedent } : e,
        ),
      );
      this.employeSelectionne.set({ ...selection, helicopterTrainingDate: precedent });
    }
  }

  estCompetenceValidee(competenceId: string): boolean {
    const selection = this.employeSelectionne();
    if (!selection) return false;
    return (selection.progression_competences?.[competenceId] ?? 0) > 0;
  }

  voirCompetences(e: Employe): void {
    this.employeSelectionne.set(e);
  }

  fermerCompetences(): void {
    this.employeSelectionne.set(null);
  }

  progressionTotale(e: Employe): number {
    const competencesActives = this.categories()
      .flatMap((c) => c.sous_competences)
      .filter((sc) => sc.roles.includes(e.role));
    const total = competencesActives.length;
    const idsActifs = new Set(competencesActives.map((sc) => sc.id));
    const valides = Object.entries(e.progression_competences || {}).filter(
      ([id, v]) => idsActifs.has(id) && v > 0,
    ).length;
    return total > 0 ? Math.round((valides / total) * 100) : 0;
  }

  private trouverSousCompetence(
    competenceId: string,
  ): { id: string; titre: string; emoji: string; roles: string[] } | undefined {
    for (const categorie of this.categories()) {
      const trouvee = categorie.sous_competences.find((sc) => sc.id === competenceId);
      if (trouvee) return trouvee;
    }
    return undefined;
  }

  private genererIdCompetence(): string {
    const ids = new Set(this.categories().flatMap((c) => c.sous_competences.map((sc) => sc.id)));
    let index = ids.size + 1;
    let id = `custom_${index}`;
    while (ids.has(id)) {
      index += 1;
      id = `custom_${index}`;
    }
    return id;
  }

  private normaliserCompetences(
    donnees: Array<{
      id: string;
      titre: string;
      emoji: string;
      sous_competences: Array<{ id: string; titre: string; emoji: string; roles: string[] }>;
    }>,
  ): Competence[] {
    if (!Array.isArray(donnees) || donnees.length === 0) {
      return CATEGORIES_COMPETENCES_PAR_DEFAUT;
    }

    return donnees.map((cat) => ({
      ...cat,
      sous_competences: (cat.sous_competences || []).map((sc) => ({
        ...sc,
        emoji: sc.emoji || '✅',
        roles:
          Array.isArray(sc.roles) && sc.roles.length > 0
            ? sc.roles.filter((role) => ROLES_COMPETENCES.includes(role))
            : [...ROLES_COMPETENCES],
      })),
    }));
  }

  private normaliserRoleEmojis(donnees: Record<string, string>): Record<string, string> {
    return { ...ROLE_EMOJIS_PAR_DEFAUT, ...(donnees ?? {}) };
  }

  private normaliserProgressions(
    donnees: Record<string, Record<string, number>>,
  ): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const [id, progression] of Object.entries(donnees ?? {})) {
      if (typeof progression !== 'object' || progression === null) {
        continue;
      }
      const normalisee: Record<string, number> = {};
      for (const [competence, valeur] of Object.entries(progression)) {
        normalisee[competence] = typeof valeur === 'number' && valeur > 0 ? 1 : 0;
      }
      result[id] = normalisee;
    }
    return result;
  }

  private construireProgressions(): Record<string, Record<string, number>> {
    const donnees: Record<string, Record<string, number>> = {};
    for (const employe of this.employes()) {
      donnees[String(employe.id)] = employe.progression_competences ?? {};
    }
    return donnees;
  }

  private sauvegarderEtatFormation(): void {
    const payload: FormationEtat = {
      competences: this.categories(),
      role_emojis: this.roleEmojis(),
      progressions: this.construireProgressions(),
    };
    void this.formationSvc.sauvegarderEtat(payload);
  }

  private lireEtatLegacyLocalStorage(): FormationEtat | null {
    try {
      const competencesBrut = localStorage.getItem('bces_formation_competences_config');
      const rolesBrut = localStorage.getItem('bces_formation_role_emojis');
      const progressionsBrut = localStorage.getItem('bces_formation_progressions');
      if (!competencesBrut && !rolesBrut && !progressionsBrut) return null;

      const competences = this.normaliserCompetences(
        competencesBrut ? JSON.parse(competencesBrut) : CATEGORIES_COMPETENCES_PAR_DEFAUT,
      );
      const role_emojis = this.normaliserRoleEmojis(rolesBrut ? JSON.parse(rolesBrut) : {});
      const progressions = Object.fromEntries(
        Object.entries(
          this.normaliserProgressions(progressionsBrut ? JSON.parse(progressionsBrut) : {}),
        ).map(([id, progression]) => [String(id), progression]),
      );

      return {
        competences,
        role_emojis,
        progressions,
      };
    } catch {
      return null;
    }
  }
}
