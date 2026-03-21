import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NAV_ITEMS } from '../../config/navigation.config';
import { DispatchService } from '../../services/dispatch.service';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { LoggerService } from '../../services/logger.service';
import { NotifManagerService } from '../../services/notif-manager.service';
import { PERMISSIONS } from '../../config/permissions.config';
import { TRAININGS_CONFIG } from '../../config/trainings.config';
import type { Effectif } from '../../modeles/effectif';
import type { Specialty } from '../../modeles/specialty';
import type { Candidature } from '../../modeles/candidature';

@Component({
  selector: 'app-accueil',
  templateUrl: './accueil.html',
  styleUrl: './accueil.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class AccueilPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly dispatchSvc = inject(DispatchService);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly logger = inject(LoggerService);
  readonly notif = inject(NotifManagerService);

  readonly profile = this.auth.profile;
  readonly allPermissions = PERMISSIONS;
  readonly employees = signal<Effectif[]>([]);
  readonly specialties = signal<Specialty[]>([]);
  private unsubs: (() => void)[] = [];

  // Dialogs
  readonly dialogFormation = signal(false);
  readonly selectedTraining = signal(TRAININGS_CONFIG[0]?.title ?? '');
  readonly dialogPromotion = signal(false);
  readonly promotionType = signal<'specialist' | 'rh'>('specialist');
  readonly promotionSpecialty = signal<string | null>(null);
  readonly promotionMotivation = signal('');
  readonly dialogCandidature = signal(false);
  readonly candidatureName = signal('');
  readonly candidaturePhone = signal('555-');
  readonly candidatureEmail = signal('');
  readonly candidatureAvailabilities = signal('');

  readonly perms = computed(() => this.profile()?.permissions ?? []);
  readonly canAction = computed(() =>
    this.perms().some((p) => ['lses', 'dev', 'admin'].includes(p)),
  );

  readonly currentEmployee = computed(() => {
    const name = this.profile()?.name?.toLowerCase().trim();
    if (!name) return null;
    return this.employees().find((e) => e.name?.toLowerCase().trim() === name) ?? null;
  });

  readonly myDispatchPosition = computed(() => {
    const emp = this.currentEmployee();
    if (!emp) return null;
    const etat = this.dispatchSvc.etat();
    const empId = emp.id;

    // Centrale
    const centraleEffs = etat.centrale?.effectifs ?? [];
    if (centraleEffs.includes(empId)) {
      return { label: 'Centrale', emoji: '🎧', color: 'blue' };
    }

    // Interventions
    for (const slot of etat.interventions ?? []) {
      if ((slot.effectifs ?? []).includes(empId)) {
        const interTypes: Record<string, { label: string; emoji: string }> = {
          intervention: { label: 'Intervention', emoji: '🚑' },
          primo_inter: { label: 'Primo Inter', emoji: '🔥' },
          patrouille: { label: 'Patrouille', emoji: '🚔' },
          event: { label: 'Event', emoji: '🎪' },
          rdv: { label: 'Rendez-Vous', emoji: '📅' },
          psy: { label: 'Psy', emoji: '🧠' },
          otage: { label: 'Banque/Bijouterie', emoji: '💰' },
          bureau_admin: { label: 'Bureau/Admin', emoji: '🖥️' },
          formation: { label: 'Formation', emoji: '📚' },
          operation: { label: 'Opération', emoji: '⚙️' },
          vm: { label: 'VM', emoji: '🩺' },
          hopital: { label: "Dans l'hôpital", emoji: '🏥' },
        };
        const meta = interTypes[slot.type] ?? { label: 'Intervention', emoji: '🚑' };
        const loc = slot.lieu ? ` — ${slot.lieu}` : '';
        return { label: meta.label + loc, emoji: meta.emoji, color: 'red' };
      }
    }

    // Patates
    const patate = (etat.patates ?? []).find((p) => p.id === empId);
    if (patate) {
      const cats: Record<string, { label: string; emoji: string; color: string }> = {
        en_service: { label: 'En service', emoji: '🟢', color: 'green' },
        astreinte: { label: 'En astreinte', emoji: '⏰', color: 'orange' },
        conges: { label: 'En congés', emoji: '🏖️', color: 'blue' },
        fin_service: { label: 'Fin de service', emoji: '🔴', color: 'red' },
        sans_permis: { label: 'Tout PT / Sans Permis', emoji: '🚶', color: 'grey' },
      };
      const cat = cats[patate.categorie] ?? { label: patate.categorie, emoji: '🥔', color: 'grey' };
      return { label: cat.label, emoji: cat.emoji, color: cat.color };
    }

    return { label: 'Hors service', emoji: '😴', color: 'grey' };
  });

  readonly myRadio = computed(() => {
    const emp = this.currentEmployee();
    if (!emp) return null;
    const radios = this.dispatchSvc.etat().radios ?? [];
    return radios.find((r) => r.effectif_id === emp.id) ?? null;
  });

  readonly filteredNavItems = computed(() => {
    const userPerms = this.perms();
    const result: { titre: string; icon: string; lien: string; notif: number }[] = [];

    for (const group of NAV_ITEMS) {
      for (const item of group) {
        if (item.lien === '/' || item.lien === this.router.url) continue;
        const itemPerms = item.permissions ?? [];
        let hasAccess = false;
        if (itemPerms.length === 0) hasAccess = true;
        else if (userPerms.some((p) => ['dev', 'admin'].includes(p))) hasAccess = true;
        else if (itemPerms.some((p) => userPerms.includes(p))) hasAccess = true;

        // Special case: rendez-vous needs appointment-capable specialty or director role
        if (item.lien === '/rendez-vous') {
          const emp = this.currentEmployee();
          if (!emp) {
            hasAccess = false;
          } else if (userPerms.some((p) => ['dev', 'admin'].includes(p))) {
            hasAccess = true;
          } else if (['Directeur', 'Directeur Adjoint'].includes(emp.role)) {
            hasAccess = true;
          } else {
            const allSpecs = [...(emp.specialties ?? []), ...(emp.chiefSpecialties ?? [])];
            hasAccess = allSpecs.some((s) => {
              const spec = this.specialties().find((sp) => sp.value === s || sp.name === s);
              return spec?.canTakeAppointments ?? false;
            });
          }
        }

        if (hasAccess) {
          let notif = 0;
          if (item.lien === '/utilisateurs') notif = this.notif.waitingUsers().length;
          if (item.lien === '/notes-frais') notif = this.notif.waitingExpenseNotes().length;
          if (item.lien === '/commandes')
            notif = this.notif.orders().length + this.notif.alerts().length;
          if (item.lien === '/inventaire') notif = this.notif.storagesOutdated();
          if (item.lien === '/garage') notif = this.notif.garageNotif();
          if (item.lien === '/rh') notif = this.notif.rhNotif();
          result.push({ titre: item.titre, icon: item.icon, lien: item.lien, notif });
        }
      }
    }
    return result;
  });

  readonly availableTrainings = computed(() => {
    const emp = this.currentEmployee();
    if (!emp) return [];
    const all = TRAININGS_CONFIG.map((t) => t.title);
    return all.filter((t) => !(emp.trainingRequests ?? []).includes(t));
  });

  readonly connecte = this.dispatchSvc.connecte;

  constructor() {
    this.dispatchSvc.connecter();
    this.unsubs.push(
      this.api.ecouter<Effectif>('employees', (list) =>
        this.employees.set([...list].sort((a, b) => a.name.localeCompare(b.name))),
      ),
    );
    this.unsubs.push(
      this.api.ecouter<Specialty>('specialties', (list) => this.specialties.set(list)),
    );
  }

  ngOnDestroy(): void {
    this.dispatchSvc.deconnecter();
    this.unsubs.forEach((u) => u());
  }

  naviguer(lien: string): void {
    this.router.navigate([lien]);
  }

  permissionIcon(value: string): string {
    return this.allPermissions.find((p) => p.value === value)?.icon ?? '';
  }

  permissionName(value: string): string {
    return this.allPermissions.find((p) => p.value === value)?.name ?? value;
  }

  // Training request
  openFormationDialog(): void {
    if (!this.currentEmployee()) {
      alert('Impossible de trouver votre dossier employé.');
      return;
    }
    this.selectedTraining.set(this.availableTrainings()[0] ?? '');
    this.dialogFormation.set(true);
  }

  async saveFormation(): Promise<void> {
    const emp = this.currentEmployee();
    const training = this.selectedTraining();
    if (!emp || !training) return;

    const requests = [...(emp.trainingRequests ?? [])];
    if (requests.includes(training)) {
      alert('Demande déjà existante.');
      return;
    }
    requests.push(training);
    await this.api.modifier('employees', emp.id, { trainingRequests: requests });
    this.logger.log(
      this.profile()!.id,
      'FORMATION',
      `Demande de formation "${training}" par ${emp.name}`,
    );
    this.dialogFormation.set(false);
  }

  // Promotion request
  openPromotionDialog(): void {
    if (!this.currentEmployee()) {
      alert('Impossible de trouver votre dossier employé.');
      return;
    }
    this.promotionType.set('specialist');
    this.promotionSpecialty.set(null);
    this.promotionMotivation.set('');
    this.dialogPromotion.set(true);
  }

  async savePromotion(): Promise<void> {
    const emp = this.currentEmployee();
    if (!emp) return;
    if (this.promotionType() === 'specialist' && !this.promotionSpecialty()) return;
    if (!this.promotionMotivation()) {
      alert('Les motivations sont obligatoires.');
      return;
    }
    if (emp.promotionRequest) {
      alert('Vous avez déjà une demande en cours.');
      return;
    }
    const value = this.promotionType() === 'rh' ? 'Intégration RH' : this.promotionSpecialty()!;
    await this.api.modifier('employees', emp.id, {
      promotionRequest: { value, motivation: this.promotionMotivation() },
    });
    this.dialogPromotion.set(false);
  }

  // Candidature
  openCandidatureDialog(): void {
    this.candidatureName.set('');
    this.candidaturePhone.set('555-');
    this.candidatureEmail.set('');
    this.candidatureAvailabilities.set('');
    this.dialogCandidature.set(true);
  }

  async saveCandidature(): Promise<void> {
    const name = this.candidatureName();
    const email = this.candidatureEmail();
    const phone = this.candidaturePhone();
    if (!name || !email || !phone) {
      alert('Veuillez remplir les champs obligatoires.');
      return;
    }
    if (!email.endsWith('@discord.gg')) {
      alert("L'email doit se terminer par @discord.gg");
      return;
    }
    const cand: Omit<Candidature, 'id'> = {
      name,
      phone,
      email,
      availabilities: this.candidatureAvailabilities(),
      status: 'Candidature reçue',
      votes: {},
      answers: {},
    };
    await this.api.creer('candidatures', cand);
    this.dialogCandidature.set(false);
  }
}
