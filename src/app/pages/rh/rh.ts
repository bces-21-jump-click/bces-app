import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { NotifManagerService } from '../../services/notif-manager.service';
import { ORDRE_ROLES, obtenirCouleurRole } from '../../config/roles.config';
import {
  RH_CHECKLISTS,
  type RhChecklist,
  type RhChecklistItem,
  type RhChecklistStep,
} from '../../config/rh-checklists.config';
import { RH_VALIDATION, type RhValidationGroup } from '../../config/rh-validation.config';
import type { Effectif } from '../../modeles/effectif';
import type { Specialty } from '../../modeles/specialty';
import type { Candidature } from '../../modeles/candidature';
import type { ChecklistTask, SharedChecklistData } from '../../modeles/shared-checklist';

/* ── Constantes ────────────────────────────── */

const CANDIDATURE_STATUSES = [
  'Candidature reçue',
  'Appel pour entretien',
  'Entretien planifié',
  "Entretien en cours d'analyse",
  'Recrutement planifié',
  'Refusé',
];

const DELETE_REASONS = [
  'Départ volontaire',
  'Licenciement disciplinaire',
  'Licenciement administratif',
  'Abandon de poste',
  'Autre',
];

const RH_STATUSES = [
  { value: 'not_seen', label: 'Non vue', color: '#9e9e9e', icon: '👁️‍🗨️' },
  { value: 'seen', label: 'Vue', color: '#2196f3', icon: '👁️' },
  { value: 'in_progress', label: 'En cours', color: '#ff9800', icon: '⏳' },
  { value: 'mastered', label: 'Maîtrisée', color: '#4caf50', icon: '✅' },
];

const INTERVIEW_QUESTIONS: { key: string; label: string }[] = [
  { key: 'motivations', label: 'Motivations' },
  { key: 'background_before', label: "Que faisiez-vous avant d'arriver sur l'île ?" },
  { key: 'background_since', label: "Qu'avez-vous fait depuis ?" },
  { key: 'why_not_bces', label: 'Pourquoi le BCES ?' },
  { key: 'stress_management', label: 'Êtes-vous stressé ? Comment gérez-vous ?' },
  { key: 'stress_sources', label: "Sources de stress d'un médecin ?" },
  { key: 'specific_issues', label: 'Soucis hélico / conduite / plongée / fusillades ?' },
  { key: 'qualities', label: '3 qualités' },
  { key: 'flaws', label: '3 défauts' },
  { key: 'rh_comments', label: 'Commentaires du RH' },
];

interface EmployeeForm {
  id: string | null;
  name: string;
  email: string;
  role: string;
  sex: string;
  phone: string;
  emoji: string;
  specialties: string[];
  chiefSpecialties: string[];
  birthDate: string | null;
  arrivalDate: string | null;
  cdiDate: string | null;
  lastPromotionDate: string | null;
  medicalDegreeDate: string | null;
  helicopterTrainingDate: string | null;
  helicopterTrainingReimbursed: boolean;
  isRHTrainee: boolean;
}

interface CandidatureForm {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  availabilities: string;
  status: string;
  votes: Record<string, string>;
  answers: Record<string, string>;
}

interface SpecialtyForm {
  id: string | null;
  name: string;
  icon: string;
  value: string;
  canTakeAppointments: boolean;
}

type DialogType =
  | 'editEmployee'
  | 'details'
  | 'deleteEmployee'
  | 'specialties'
  | 'editSpecialty'
  | 'procedures'
  | 'trackingSelection'
  | 'tracking'
  | 'directory'
  | 'statistics'
  | 'candidatures'
  | 'candidatureForm'
  | 'promotions'
  | 'fault'
  | 'faultDetails'
  | 'suspension'
  | null;

const EMPTY_EMP_FORM: EmployeeForm = {
  id: null,
  name: '',
  email: '',
  role: 'Interne',
  sex: '',
  phone: '555-',
  emoji: '',
  specialties: [],
  chiefSpecialties: [],
  birthDate: null,
  arrivalDate: null,
  cdiDate: null,
  lastPromotionDate: null,
  medicalDegreeDate: null,
  helicopterTrainingDate: null,
  helicopterTrainingReimbursed: false,
  isRHTrainee: false,
};

const EMPTY_CAND_FORM: CandidatureForm = {
  id: null,
  name: '',
  phone: '',
  email: '',
  availabilities: '',
  status: 'Candidature reçue',
  votes: {},
  answers: {},
};

@Component({
  selector: 'app-rh',
  templateUrl: './rh.html',
  styleUrl: './rh.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class RhPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);
  readonly notif = inject(NotifManagerService);

  /* constantes exposées au template */
  readonly ORDRE_ROLES = ORDRE_ROLES;
  readonly RH_CHECKLISTS = RH_CHECKLISTS;
  readonly RH_VALIDATION = RH_VALIDATION;
  readonly RH_STATUSES = RH_STATUSES;
  readonly CANDIDATURE_STATUSES = CANDIDATURE_STATUSES;
  readonly DELETE_REASONS = DELETE_REASONS;
  readonly INTERVIEW_QUESTIONS = INTERVIEW_QUESTIONS;
  readonly obtenirCouleurRole = obtenirCouleurRole;

  /* données temps réel */
  readonly employees = signal<Effectif[]>([]);
  readonly specialties = signal<Specialty[]>([]);
  readonly candidatures = signal<Candidature[]>([]);
  readonly weeklyTasks = signal<ChecklistTask[]>([]);
  readonly monthlyTasks = signal<ChecklistTask[]>([]);

  /* UI */
  readonly recherche = signal('');
  readonly emailBlur = signal(true);
  readonly dialog = signal<DialogType>(null);
  readonly weeklyOpen = signal(true);
  readonly monthlyOpen = signal(true);

  /* formulaires */
  readonly editedEmployee = signal<EmployeeForm>({ ...EMPTY_EMP_FORM });
  readonly editedCandidature = signal<CandidatureForm>({ ...EMPTY_CAND_FORM });
  readonly editedSpecialty = signal<SpecialtyForm>({
    id: null,
    name: '',
    icon: '',
    value: '',
    canTakeAppointments: false,
  });

  /* sélections */
  readonly selectedEmployee = signal<Effectif | null>(null);
  readonly deleteReason = signal('');
  readonly selectedChecklist = signal<RhChecklist | null>(null);
  readonly checklistSteps = signal<boolean[]>([]);
  readonly selectedTrackingEmployee = signal<Effectif | null>(null);

  /* faute / suspension */
  readonly faultEmployee = signal<Effectif | null>(null);
  readonly faultReason = signal('');
  readonly suspensionEmployee = signal<Effectif | null>(null);
  readonly suspensionStartDate = signal('');
  readonly suspensionDuration = signal(1);

  private unsubs: (() => void)[] = [];

  /* ── Computed ─────────────────────────────── */

  readonly filteredEmployees = computed(() => {
    const term = this.recherche().toLowerCase();
    return this.employees()
      .filter(
        (e) => !term || e.name.toLowerCase().includes(term) || e.role.toLowerCase().includes(term),
      )
      .sort((a, b) => {
        const ia = ORDRE_ROLES.indexOf(a.role);
        const ib = ORDRE_ROLES.indexOf(b.role);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
  });

  readonly rhTrainees = computed(() =>
    this.employees()
      .filter((e) => e.isRHTrainee)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly weeklyOverdueCount = computed(
    () => this.weeklyTasks().filter((t) => this.isTaskOverdue(t, 'weekly')).length,
  );

  readonly monthlyOverdueCount = computed(
    () => this.monthlyTasks().filter((t) => this.isTaskOverdue(t, 'monthly')).length,
  );

  readonly waitingCandidaturesCount = computed(
    () => this.candidatures().filter((c) => c.status === 'Candidature reçue').length,
  );

  readonly promotionRequests = computed(() => this.employees().filter((e) => e.promotionRequest));

  readonly statsParRole = computed(() => {
    const stats: Record<string, number> = {};
    for (const e of this.employees()) stats[e.role] = (stats[e.role] || 0) + 1;
    return Object.entries(stats).sort(([ra], [rb]) => {
      const ia = ORDRE_ROLES.indexOf(ra);
      const ib = ORDRE_ROLES.indexOf(rb);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  });

  readonly statsParSexe = computed(() => {
    let h = 0,
      f = 0;
    for (const e of this.employees()) e.sex === 'H' ? h++ : f++;
    return { hommes: h, femmes: f };
  });

  readonly statsParSpecialite = computed(() => {
    const stats: Record<string, number> = {};
    for (const e of this.employees())
      for (const s of e.specialties || []) stats[s] = (stats[s] || 0) + 1;
    return Object.entries(stats).sort(([, a], [, b]) => b - a);
  });

  private readonly ROLES_EXCLUS = new Set(['Temporaire', 'Non assigné']);
  readonly effectifTotal = computed(
    () => this.employees().filter((e) => !this.ROLES_EXCLUS.has(e.role)).length,
  );

  readonly formTitle = computed(() =>
    this.editedEmployee().id ? "Modifier l'employé" : 'Nouvel employé',
  );

  readonly checklistProgress = computed(() => {
    const checklist = this.selectedChecklist();
    if (!checklist) return 0;
    const steps = this.checklistSteps();
    let total = 0,
      completed = 0;
    checklist.steps.forEach((step, i) => {
      if (this.isStepHeader(step)) return;
      total++;
      if (steps[i]) completed++;
    });
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  });

  readonly sortedDirectoryEmployees = computed(() =>
    [...this.employees()].sort((a, b) => {
      const ra = ORDRE_ROLES.indexOf(a.role);
      const rb = ORDRE_ROLES.indexOf(b.role);
      if (ra !== rb) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
      return (a.arrivalDate || '').localeCompare(b.arrivalDate || '');
    }),
  );

  /* ── Lifecycle ────────────────────────────── */

  ngOnInit(): void {
    this.unsubs.push(
      this.api.ecouter<Effectif>('employees', (list) => this.employees.set(list)),
      this.api.ecouter<Specialty>('specialties', (list) => this.specialties.set(list)),
      this.api.ecouter<Candidature>('candidatures', (list) => this.candidatures.set(list)),
      this.api.ecouterDocument<SharedChecklistData>('settings', 'weekly_rh', (d) =>
        this.weeklyTasks.set(d?.tasks ?? []),
      ),
      this.api.ecouterDocument<SharedChecklistData>('settings', 'monthly_rh', (d) =>
        this.monthlyTasks.set(d?.tasks ?? []),
      ),
    );
  }

  ngOnDestroy(): void {
    this.unsubs.forEach((fn) => fn());
  }

  /* ── Employee ─────────────────────────────── */

  openAddDialog(): void {
    this.editedEmployee.set({
      ...EMPTY_EMP_FORM,
      arrivalDate: new Date().toISOString().split('T')[0],
    });
    this.dialog.set('editEmployee');
  }

  editEmployee(emp: Effectif): void {
    this.editedEmployee.set({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      role: emp.role,
      sex: emp.sex,
      phone: emp.phone,
      emoji: emp.emoji,
      specialties: [...(emp.specialties || [])],
      chiefSpecialties: [...(emp.chiefSpecialties || [])],
      birthDate: emp.birthDate,
      arrivalDate: emp.arrivalDate,
      cdiDate: emp.cdiDate,
      lastPromotionDate: emp.lastPromotionDate,
      medicalDegreeDate: emp.medicalDegreeDate,
      helicopterTrainingDate: emp.helicopterTrainingDate,
      helicopterTrainingReimbursed: emp.helicopterTrainingReimbursed,
      isRHTrainee: emp.isRHTrainee,
    });
    this.dialog.set('editEmployee');
  }

  updateEdit(field: string, value: unknown): void {
    this.editedEmployee.update((e) => ({ ...e, [field]: value }) as EmployeeForm);
  }

  toggleEditSpecialty(value: string): void {
    this.editedEmployee.update((e) => {
      const specs = [...e.specialties];
      const idx = specs.indexOf(value);
      if (idx >= 0) specs.splice(idx, 1);
      else specs.push(value);
      const chiefs = e.chiefSpecialties.filter((c) => specs.includes(c));
      return { ...e, specialties: specs, chiefSpecialties: chiefs };
    });
  }

  toggleEditChiefSpecialty(value: string): void {
    this.editedEmployee.update((e) => {
      const chiefs = [...e.chiefSpecialties];
      const idx = chiefs.indexOf(value);
      if (idx >= 0) chiefs.splice(idx, 1);
      else chiefs.push(value);
      return { ...e, chiefSpecialties: chiefs };
    });
  }

  async saveEmployee(): Promise<void> {
    const emp = this.editedEmployee();
    if (!emp.name) return;

    const data: Record<string, unknown> = {
      name: emp.name,
      email: emp.email || '',
      role: emp.role || 'Interne',
      sex: emp.sex || '',
      phone: emp.phone || '',
      emoji: emp.emoji || '',
      specialties: emp.specialties,
      chiefSpecialties: emp.chiefSpecialties,
      birthDate: emp.birthDate || null,
      arrivalDate: emp.arrivalDate || null,
      cdiDate: emp.cdiDate || null,
      lastPromotionDate: emp.lastPromotionDate || null,
      medicalDegreeDate: emp.medicalDegreeDate || null,
      helicopterTrainingDate: emp.helicopterTrainingDate || null,
      helicopterTrainingReimbursed: emp.helicopterTrainingReimbursed,
      isRHTrainee: emp.isRHTrainee,
    };

    const user = this.auth.profile()?.id ?? 'unknown';
    if (emp.id) {
      const old = this.employees().find((e) => e.id === emp.id);
      await this.api.modifier('employees', emp.id, data);
      if (old && old.role !== emp.role) {
        this.logger.log(user, 'Changement de grade', `${emp.name} : ${old.role} → ${emp.role}`);
      }
    } else {
      await this.api.creer('employees', data);
      this.logger.log(user, 'Ajout employés', `Ajout de ${emp.name}`);
    }
    this.dialog.set(null);
  }

  openDetails(emp: Effectif): void {
    this.selectedEmployee.set(emp);
    this.dialog.set('details');
  }

  openDeleteDialog(emp: Effectif): void {
    this.selectedEmployee.set(emp);
    this.deleteReason.set('');
    this.dialog.set('deleteEmployee');
  }

  async confirmDelete(): Promise<void> {
    const emp = this.selectedEmployee();
    if (!emp || !this.deleteReason()) return;
    await this.api.supprimer('employees', emp.id);
    const user = this.auth.profile()?.id ?? 'unknown';
    this.logger.log(
      user,
      'Suppression employé',
      `Suppression de ${emp.name} (${this.deleteReason()})`,
    );
    this.dialog.set(null);
  }

  /* ── Specialties ──────────────────────────── */

  openSpecialtiesDialog(): void {
    this.dialog.set('specialties');
  }

  openAddSpecialty(): void {
    this.editedSpecialty.set({
      id: null,
      name: '',
      icon: '',
      value: '',
      canTakeAppointments: false,
    });
    this.dialog.set('editSpecialty');
  }

  editSpecialtyItem(s: Specialty): void {
    this.editedSpecialty.set({ ...s, id: s.id ?? null });
    this.dialog.set('editSpecialty');
  }

  updateSpecialty(field: string, value: unknown): void {
    this.editedSpecialty.update((s) => ({ ...s, [field]: value }) as SpecialtyForm);
  }

  async saveSpecialty(): Promise<void> {
    const s = this.editedSpecialty();
    if (!s.name) return;
    const data = {
      name: s.name,
      icon: s.icon || '',
      value: s.value || s.name.toLowerCase(),
      canTakeAppointments: s.canTakeAppointments,
    };
    if (s.id) await this.api.modifier('specialties', s.id, data);
    else await this.api.creer('specialties', data);
    this.dialog.set('specialties');
  }

  async deleteSpecialty(s: Specialty): Promise<void> {
    if (!s.id || !confirm(`Supprimer la spécialité ${s.name} ?`)) return;
    await this.api.supprimer('specialties', s.id);
  }

  async toggleSpecialtyAppointments(s: Specialty): Promise<void> {
    if (!s.id) return;
    await this.api.modifier('specialties', s.id, { canTakeAppointments: !s.canTakeAppointments });
  }

  /* ── Checklists ───────────────────────────── */

  isTaskOverdue(task: ChecklistTask, period: 'weekly' | 'monthly'): boolean {
    if (!task.doneAt) return true;
    const days = (Date.now() - task.doneAt) / (1000 * 60 * 60 * 24);
    return period === 'weekly' ? days > 7 : days > 30;
  }

  getCheckDate(task: ChecklistTask): string {
    if (!task.doneAt) return 'Jamais';
    return new Date(task.doneAt).toLocaleDateString('fr-FR');
  }

  async addTask(type: 'weekly' | 'monthly'): Promise<void> {
    const text = prompt('Nom de la tâche :');
    if (!text) return;
    const docId = type === 'weekly' ? 'weekly_rh' : 'monthly_rh';
    const tasks = type === 'weekly' ? [...this.weeklyTasks()] : [...this.monthlyTasks()];
    tasks.push({ id: Date.now().toString(), text, done: false, doneAt: null, link: null });
    await this.api.modifier('settings', docId, { tasks });
  }

  async removeTask(type: 'weekly' | 'monthly', taskId: string): Promise<void> {
    if (!confirm('Supprimer cette tâche ?')) return;
    const docId = type === 'weekly' ? 'weekly_rh' : 'monthly_rh';
    const tasks = (type === 'weekly' ? [...this.weeklyTasks()] : [...this.monthlyTasks()]).filter(
      (t) => t.id !== taskId,
    );
    await this.api.modifier('settings', docId, { tasks });
  }

  async toggleTask(type: 'weekly' | 'monthly', taskId: string): Promise<void> {
    const docId = type === 'weekly' ? 'weekly_rh' : 'monthly_rh';
    const tasks = (type === 'weekly' ? [...this.weeklyTasks()] : [...this.monthlyTasks()]).map(
      (t) => (t.id === taskId ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t),
    );
    await this.api.modifier('settings', docId, { tasks });
  }

  /* ── Procedures ───────────────────────────── */

  openProcedures(checklist: RhChecklist): void {
    this.selectedChecklist.set(checklist);
    this.checklistSteps.set(checklist.steps.map(() => false));
    this.dialog.set('procedures');
  }

  toggleChecklistStep(index: number): void {
    this.checklistSteps.update((s) => {
      const copy = [...s];
      copy[index] = !copy[index];
      return copy;
    });
  }

  isStepHeader(step: RhChecklistItem): boolean {
    return typeof step !== 'string' && 'header' in step && !!step.header;
  }

  getStepText(step: RhChecklistItem): string {
    if (typeof step === 'string') return step;
    return (step as RhChecklistStep).text ?? '';
  }

  getStepLink(step: RhChecklistItem): { text: string; url: string } | null {
    if (typeof step === 'string') return null;
    return (step as RhChecklistStep).link ?? null;
  }

  getStepHeader(step: RhChecklistItem): string {
    if (typeof step === 'string') return '';
    return (step as RhChecklistStep).header ?? '';
  }

  /* ── Tracking ─────────────────────────────── */

  openTrackingDialog(): void {
    this.selectedTrackingEmployee.set(null);
    this.dialog.set('trackingSelection');
  }

  selectTrainee(emp: Effectif): void {
    this.selectedTrackingEmployee.set(emp);
    this.dialog.set('tracking');
  }

  getRHStatus(subId: string): string {
    const emp = this.selectedTrackingEmployee();
    if (!emp?.competencyProgress) return 'not_seen';
    return (emp.competencyProgress[subId] as string) || 'not_seen';
  }

  getRHStatusObj(subId: string) {
    const status = this.getRHStatus(subId);
    return RH_STATUSES.find((s) => s.value === status) ?? RH_STATUSES[0];
  }

  getCategoryProgress(group: RhValidationGroup): number {
    if (!group.items.length) return 0;
    const total = group.items.length * 100;
    let current = 0;
    for (const item of group.items) {
      const status = this.getRHStatus(item.id);
      if (status === 'mastered') current += 100;
      else if (status === 'in_progress') current += 50;
      else if (status === 'seen') current += 25;
    }
    return Math.round((current / total) * 100);
  }

  getCompetencyColor(progress: number): string {
    if (progress === 100) return '#4caf50';
    if (progress >= 50) return '#ff9800';
    return '#9e9e9e';
  }

  async toggleCompetency(subId: string): Promise<void> {
    const emp = this.selectedTrackingEmployee();
    if (!emp) return;
    const currentIndex = RH_STATUSES.findIndex((s) => s.value === this.getRHStatus(subId));
    const nextIndex = (currentIndex + 1) % RH_STATUSES.length;
    const progress = {
      ...(emp.competencyProgress || {}),
      [subId]: RH_STATUSES[nextIndex].value,
    };
    await this.api.modifier('employees', emp.id, { competencyProgress: progress });
    this.selectedTrackingEmployee.set({ ...emp, competencyProgress: progress });
  }

  async toggleRHTrainee(emp: Effectif): Promise<void> {
    await this.api.modifier('employees', emp.id, { isRHTrainee: !emp.isRHTrainee });
  }

  /* ── Directory / Statistics ───────────────── */
  openDirectory(): void {
    this.dialog.set('directory');
  }
  openStatistics(): void {
    this.dialog.set('statistics');
  }

  /* ── Candidatures ─────────────────────────── */

  openCandidaturesDialog(): void {
    this.dialog.set('candidatures');
  }

  openCandidatureForm(c?: Candidature): void {
    this.editedCandidature.set(c ? { ...c, id: c.id ?? null } : { ...EMPTY_CAND_FORM });
    this.dialog.set('candidatureForm');
  }

  updateCandidate(field: string, value: unknown): void {
    this.editedCandidature.update((c) => ({ ...c, [field]: value }) as CandidatureForm);
  }

  updateAnswer(key: string, value: string): void {
    this.editedCandidature.update((c) => ({
      ...c,
      answers: { ...c.answers, [key]: value },
    }));
  }

  getCandidatureStatusColor(status: string): string {
    switch (status) {
      case 'Candidature reçue':
        return '#bdbdbd';
      case 'Appel pour entretien':
        return '#757575';
      case 'Entretien planifié':
        return '#2196f3';
      case "Entretien en cours d'analyse":
        return '#ff9800';
      case 'Recrutement planifié':
        return '#4caf50';
      case 'Refusé':
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  }

  vote(type: string): void {
    const userId = this.auth.profile()?.id;
    if (!userId) return;
    this.editedCandidature.update((c) => {
      const votes = { ...c.votes };
      if (votes[userId] === type) delete votes[userId];
      else votes[userId] = type;
      return { ...c, votes };
    });
  }

  getVoteCounts(votes: Record<string, string>): { pour: number; contre: number } {
    let pour = 0,
      contre = 0;
    for (const v of Object.values(votes || {})) {
      if (v === 'pour') pour++;
      else if (v === 'contre') contre++;
    }
    return { pour, contre };
  }

  myVote(): string | null {
    const userId = this.auth.profile()?.id;
    if (!userId) return null;
    return this.editedCandidature().votes[userId] || null;
  }

  showInterviewSection(): boolean {
    const status = this.editedCandidature().status;
    return [
      'Entretien planifié',
      "Entretien en cours d'analyse",
      'Recrutement planifié',
      'Refusé',
    ].includes(status);
  }

  isInterviewReadonly(): boolean {
    return this.editedCandidature().status !== 'Entretien planifié';
  }

  async saveCandidature(): Promise<void> {
    const c = this.editedCandidature();
    if (!c.name || !c.email || !c.phone) return;
    const { id, ...data } = c;
    if (id) await this.api.modifier('candidatures', id, data as Record<string, unknown>);
    else await this.api.creer('candidatures', data as Record<string, unknown>);
    this.dialog.set('candidatures');
  }

  async deleteCandidature(c: Candidature): Promise<void> {
    if (!c.id || !confirm(`Supprimer la candidature de ${c.name} ?`)) return;
    await this.api.supprimer('candidatures', c.id);
  }

  async finalizeCandidature(decision: 'accept' | 'reject'): Promise<void> {
    const c = this.editedCandidature();
    if (!confirm(decision === 'accept' ? `Embaucher ${c.name} ?` : `Refuser ${c.name} ?`)) return;

    if (decision === 'accept') {
      const exists = this.employees().some((e) => e.name.toLowerCase() === c.name.toLowerCase());
      if (exists) {
        alert(`${c.name} est déjà dans la liste des employés !`);
        return;
      }
      const today = new Date().toISOString().split('T')[0];
      await this.api.creer('employees', {
        name: c.name,
        email: '',
        role: 'Interne',
        sex: '',
        phone: c.phone,
        specialties: [],
        chiefSpecialties: [],
        emoji: '',
        birthDate: null,
        arrivalDate: today,
        cdiDate: null,
        lastPromotionDate: today,
        medicalDegreeDate: null,
        helicopterTrainingDate: null,
        helicopterTrainingReimbursed: false,
        trainingRequests: [],
        promotionRequest: null,
        rankPromotionRequest: null,
        competencyProgress: {},
        lastFollowUpDate: null,
        simpleFault: null,
        suspension: null,
        isTrainerTrainee: false,
        simulations: [],
        isRHTrainee: false,
        validatedTrainings: [],
      });
      this.updateCandidate('status', 'Recrutement planifié');
    } else {
      this.updateCandidate('status', 'Refusé');
    }
    await this.saveCandidature();
  }

  /* ── Promotions ───────────────────────────── */

  openPromotionsDialog(): void {
    this.dialog.set('promotions');
  }

  getPromotionValue(emp: Effectif): string {
    if (!emp.promotionRequest) return '';
    if (typeof emp.promotionRequest === 'string') return emp.promotionRequest;
    return emp.promotionRequest.value || '';
  }

  getPromotionMotivation(emp: Effectif): string {
    if (!emp.promotionRequest || typeof emp.promotionRequest === 'string') return '';
    return emp.promotionRequest.motivation || '';
  }

  async acceptPromotion(emp: Effectif): Promise<void> {
    const request = this.getPromotionValue(emp);
    if (!request) return;
    const specs = [...(emp.specialties || [])];
    if (!specs.includes(request)) specs.push(request);
    await this.api.modifier('employees', emp.id, {
      specialties: specs,
      promotionRequest: null,
    });
  }

  async rejectPromotion(emp: Effectif): Promise<void> {
    await this.api.modifier('employees', emp.id, { promotionRequest: null });
  }

  /* ── Fault ────────────────────────────────── */

  openFaultDialog(emp: Effectif): void {
    this.faultEmployee.set(emp);
    this.faultReason.set('');
    this.dialog.set('fault');
  }

  async saveFault(): Promise<void> {
    const emp = this.faultEmployee();
    if (!emp || !this.faultReason()) return;
    const today = new Date();
    const expireDate = new Date(today);
    expireDate.setDate(expireDate.getDate() + 30);
    await this.api.modifier('employees', emp.id, {
      simpleFault: {
        reason: this.faultReason(),
        date: today.toISOString(),
        expireDate: expireDate.toISOString(),
      },
    });
    this.logger.log(
      this.auth.profile()?.id ?? 'unknown',
      'Ajout faute',
      `Ajout d'une faute à ${emp.name} : ${this.faultReason()}`,
    );
    this.dialog.set(null);
  }

  async deleteFault(emp: Effectif): Promise<void> {
    if (!confirm(`Retirer la faute de ${emp.name} ?`)) return;
    await this.api.modifier('employees', emp.id, { simpleFault: null });
  }

  showFaultDetails(emp: Effectif): void {
    this.selectedEmployee.set(emp);
    this.dialog.set('faultDetails');
  }

  /* ── Suspension ───────────────────────────── */

  openSuspensionDialog(emp: Effectif): void {
    this.suspensionEmployee.set(emp);
    this.suspensionStartDate.set(new Date().toISOString().split('T')[0]);
    this.suspensionDuration.set(1);
    this.dialog.set('suspension');
  }

  async saveSuspension(): Promise<void> {
    const emp = this.suspensionEmployee();
    if (!emp || !this.suspensionStartDate()) return;
    const startDate = new Date(this.suspensionStartDate());
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + this.suspensionDuration());
    await this.api.modifier('employees', emp.id, {
      suspension: {
        startDate: this.suspensionStartDate(),
        duration: this.suspensionDuration(),
        endDate: endDate.toISOString().split('T')[0],
      },
    });
    this.logger.log(
      this.auth.profile()?.id ?? 'unknown',
      'Mise à pied',
      `Mise à pied de ${emp.name} pour ${this.suspensionDuration()} jour(s)`,
    );
    this.dialog.set(null);
  }

  async deleteSuspension(emp: Effectif): Promise<void> {
    if (!confirm(`Retirer la mise à pied de ${emp.name} ?`)) return;
    await this.api.modifier('employees', emp.id, { suspension: null });
    this.logger.log(
      this.auth.profile()?.id ?? 'unknown',
      'Retrait de mise a pied',
      `Retrait de la mise à pied de ${emp.name}`,
    );
  }

  /* ── Helpers ──────────────────────────────── */

  getSpecialtyIcon(value: string): string {
    return this.specialties().find((s) => s.value === value)?.icon ?? '';
  }

  getSpecialtyName(value: string): string {
    return this.specialties().find((s) => s.value === value || s.name === value)?.name ?? value;
  }

  isBirthday(emp: Effectif): boolean {
    if (!emp.birthDate) return false;
    const today = new Date();
    const bd = new Date(emp.birthDate);
    return bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate();
  }

  needsHeliReimbursement(emp: Effectif): boolean {
    if (!emp.helicopterTrainingDate || emp.helicopterTrainingReimbursed) return false;
    const days =
      (Date.now() - new Date(emp.helicopterTrainingDate).getTime()) / (1000 * 60 * 60 * 24);
    return days >= 365;
  }

  async confirmReimbursement(emp: Effectif): Promise<void> {
    if (!confirm(`Confirmer le remboursement hélicoptère de ${emp.name} ?`)) return;
    await this.api.modifier('employees', emp.id, { helicopterTrainingReimbursed: true });
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR');
  }

  calculateAge(birthDate: string | null): number | null {
    if (!birthDate) return null;
    const today = new Date();
    const bd = new Date(birthDate);
    let age = today.getFullYear() - bd.getFullYear();
    if (
      today.getMonth() < bd.getMonth() ||
      (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())
    )
      age--;
    return age;
  }

  calculateSeniority(arrivalDate: string | null): string {
    if (!arrivalDate) return '-';
    const diff = Date.now() - new Date(arrivalDate).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    if (years > 0) return `${years} an(s) ${months} mois`;
    return `${months} mois`;
  }

  calculateDays(date: string | null): number | null {
    if (!date) return null;
    return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  }

  closeDialog(): void {
    this.dialog.set(null);
  }

  hasPermission(perm: string): boolean {
    return this.auth.aLaPermission(perm);
  }
}
