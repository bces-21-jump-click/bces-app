import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  viewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  fetchFormResponses,
  markRowAsImported,
  type FormRequest,
} from '../../services/google-form.service';
import {
  fetchPsyFormResponses,
  markPsyRowAsImported,
  type PsyFormRequest,
} from '../../services/google-form-psy.service';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import frLocale from '@fullcalendar/core/locales/fr';
import type { Appointment } from '../../modeles/appointment';
import type { Specialty } from '../../modeles/specialty';
import type { Effectif } from '../../modeles/effectif';
import Swal from 'sweetalert2';

type ViewMode = 'list' | 'agenda' | 'demandes' | 'demandesPsy';
type RdvStatus = 'En attente' | 'Programmé' | 'Terminé' | 'Annulé';

interface CurrentAppointment {
  id: string | null;
  patientName: string;
  patientPhone: string;
  specialty: string;
  date: string;
  time: string;
  duration: number;
  reason: string;
  status: string;
  doctor: string;
  companion: string;
  notes: string;
  availability: string;
  createdAt?: number;
  _sheetRowNumber?: number;
  _isPsyRequest?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  'En attente': '#FB8C00',
  Programmé: '#2196F3',
  Terminé: '#4CAF50',
  Annulé: '#F44336',
};

@Component({
  selector: 'app-rendez-vous',
  templateUrl: './rendez-vous.html',
  styleUrl: './rendez-vous.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, FullCalendarModule],
})
export class RendezVousPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private unsubAppointments?: () => void;
  private unsubSpecialties?: () => void;
  private unsubEmployees?: () => void;

  readonly appointments = signal<Appointment[]>([]);
  readonly specialties = signal<Specialty[]>([]);
  readonly employees = signal<Effectif[]>([]);
  readonly specialtiesLoaded = signal(false);
  readonly employeesLoaded = signal(false);

  readonly viewMode = signal<ViewMode>('list');
  readonly filterSpecialty = signal('');
  readonly filterStatus = signal('Tous');
  readonly statuts: string[] = ['Tous', 'En attente', 'Programmé', 'Terminé', 'Annulé'];

  readonly isModalOpen = signal(false);
  readonly isEditing = signal(false);
  readonly isSaving = signal(false);
  readonly isRecapOpen = signal(false);
  readonly recapAppointment = signal<Appointment | null>(null);

  readonly currentAppointment = signal<CurrentAppointment>(this.emptyAppointment());

  readonly formRequests = signal<FormRequest[]>([]);
  readonly isLoadingRequests = signal(false);
  readonly formRequestsError = signal<string | null>(null);

  readonly psyRequests = signal<PsyFormRequest[]>([]);
  readonly isLoadingPsyRequests = signal(false);
  readonly psyRequestsError = signal<string | null>(null);

  readonly calendarOptions = signal<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    events: [],
    locales: [frLocale],
    locale: 'fr',
    height: 'auto',
    slotMinTime: '08:00:00',
    slotMaxTime: '24:00:00',
    allDaySlot: false,
    displayEventEnd: true,
    selectable: false,
    editable: false,
    eventClick: (info) => {
      const app = info.event.extendedProps['appointment'] as Appointment;
      if (app) this.openEditModal(app);
    },
  });

  readonly isLoaded = computed(() => this.specialtiesLoaded() && this.employeesLoaded());

  readonly hasAccess = computed(() => {
    const perms = this.auth.profile()?.permissions ?? [];
    if (perms.some((p: string) => ['dev', 'admin'].includes(p))) return true;
    const profileName = this.auth.profile()?.name?.toLowerCase().trim();
    const emp = this.employees().find((e) => e.name?.toLowerCase().trim() === profileName);
    if (!emp) return false;
    if (['Directeur', 'Directeur Adjoint'].includes(emp.role)) return true;
    const allSpecs = [...(emp.specialties || []), ...(emp.chiefSpecialties || [])];
    return allSpecs.some((s) => {
      const spec = this.specialties().find((sp) => sp.value === s || sp.name === s);
      return spec?.canTakeAppointments;
    });
  });

  readonly hasPsyAccess = computed(() => {
    const perms = this.auth.profile()?.permissions ?? [];
    if (perms.some((p: string) => ['dev', 'admin'].includes(p))) return true;
    const profileName = this.auth.profile()?.name?.toLowerCase().trim();
    const emp = this.employees().find((e) => e.name?.toLowerCase().trim() === profileName);
    if (!emp) return false;
    if (['Directeur', 'Directeur Adjoint'].includes(emp.role)) return true;
    const allSpecs = [...(emp.specialties || []), ...(emp.chiefSpecialties || [])];
    return allSpecs.some((s) => {
      const spec = this.specialties().find((sp) => sp.value === s || sp.name === s);
      return spec?.name.toLowerCase().includes('psy');
    });
  });

  readonly specialtiesList = computed(() =>
    this.specialties().filter((s) => s.canTakeAppointments),
  );

  readonly filteredAppointments = computed(() => {
    let list = this.appointments();
    const perms = this.auth.profile()?.permissions ?? [];
    const isGlobalAdmin = perms.some((p: string) => ['dev', 'admin'].includes(p));
    const profileName = this.auth.profile()?.name?.toLowerCase().trim();
    const emp = this.employees().find((e) => e.name?.toLowerCase().trim() === profileName);
    const isDirector = emp && ['Directeur', 'Directeur Adjoint'].includes(emp.role);

    if (!isGlobalAdmin && !isDirector && emp) {
      const allSpecs = [...(emp.specialties || []), ...(emp.chiefSpecialties || [])];
      if (allSpecs.length > 0) {
        const specNames = this.specialties()
          .filter((sp) => allSpecs.includes(sp.value) || allSpecs.includes(sp.name))
          .map((sp) => sp.name);
        list = list.filter((app) => specNames.includes(app.specialty));
      }
    }

    const specialty = this.filterSpecialty();
    const status = this.filterStatus();
    return list.filter((app) => {
      if (specialty && app.specialty !== specialty) return false;
      if (status && status !== 'Tous' && app.status !== status) return false;
      return true;
    });
  });

  readonly doctorsForSpecialty = computed(() => {
    const specName = this.currentAppointment().specialty;
    if (!specName) return [];
    const spec = this.specialties().find((s) => s.name === specName);
    if (!spec) return [];
    return this.employees()
      .filter((e) => e.specialties?.includes(spec.value))
      .map((e) => e.name)
      .sort();
  });

  readonly allDoctors = computed(() =>
    this.employees()
      .filter((e) => e.specialties && e.specialties.length > 0)
      .map((e) => e.name)
      .sort(),
  );

  readonly newRequestsCount = computed(
    () => this.formRequests().filter((r) => !this.isAlreadyImported(r)).length,
  );

  readonly newPsyRequestsCount = computed(
    () => this.psyRequests().filter((r) => !this.isAlreadyImported(r)).length,
  );

  ngOnInit(): void {
    this.unsubAppointments = this.api.ecouter<Appointment>('appointments', (data) => {
      this.appointments.set(data);
      this.updateCalendarEvents();
    });
    this.unsubSpecialties = this.api.ecouter<Specialty>('specialties', (data) => {
      this.specialties.set(data);
      this.specialtiesLoaded.set(true);
    });
    this.unsubEmployees = this.api.ecouter<Effectif>('employees', (data) => {
      this.employees.set(data);
      this.employeesLoaded.set(true);
    });
  }

  ngOnDestroy(): void {
    this.unsubAppointments?.();
    this.unsubSpecialties?.();
    this.unsubEmployees?.();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    if (mode === 'demandes' && this.formRequests().length === 0) this.loadFormRequests();
    if (mode === 'demandesPsy' && this.psyRequests().length === 0) this.loadPsyRequests();
    if (mode === 'agenda') this.updateCalendarEvents();
  }

  updateCalendarEvents(): void {
    const events = this.filteredAppointments().map((app) => {
      let startStr = app.time ? `${app.date}T${app.time}` : app.date;
      let endStr: string | undefined;
      if (app.time) {
        const endDate = new Date(startStr);
        if (!isNaN(endDate.getTime())) {
          endDate.setMinutes(endDate.getMinutes() + (app.duration || 30));
          const y = endDate.getFullYear();
          const m = String(endDate.getMonth() + 1).padStart(2, '0');
          const d = String(endDate.getDate()).padStart(2, '0');
          const hh = String(endDate.getHours()).padStart(2, '0');
          const mm = String(endDate.getMinutes()).padStart(2, '0');
          endStr = `${y}-${m}-${d}T${hh}:${mm}`;
        }
      }
      let title = `${app.patientName} (${app.specialty})`;
      if (app.doctor) title += ` - ${app.doctor}`;
      return {
        id: app.id ?? undefined,
        title,
        start: startStr,
        end: endStr,
        backgroundColor: STATUS_COLORS[app.status] ?? '#9E9E9E',
        extendedProps: { appointment: app },
      };
    });
    this.calendarOptions.update((opts) => ({ ...opts, events }));
  }

  getSpecialtyIcon(name: string): string {
    return this.specialties().find((s) => s.name === name)?.icon ?? '';
  }

  getStatusColor(status: string): string {
    return STATUS_COLORS[status] ?? '#9E9E9E';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'En attente':
        return 'attente';
      case 'Programmé':
        return 'programme';
      case 'Terminé':
        return 'termine';
      case 'Annulé':
        return 'annule';
      default:
        return '';
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  }

  formatTimestamp(ts: string | number | undefined): string {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(ts);
    }
  }

  truncate(text: string, max: number): string {
    if (!text) return '—';
    return text.length > max ? text.substring(0, max) + '...' : text;
  }

  // --- Modal ---
  emptyAppointment(): CurrentAppointment {
    return {
      id: null,
      patientName: '',
      patientPhone: '',
      specialty: '',
      date: new Date().toISOString().split('T')[0],
      time: '',
      reason: '',
      status: 'En attente',
      doctor: '',
      companion: '',
      duration: 30,
      notes: '',
      availability: '',
    };
  }

  openAddModal(): void {
    this.isEditing.set(false);
    this.currentAppointment.set(this.emptyAppointment());
    this.isModalOpen.set(true);
  }

  openEditModal(app: Appointment): void {
    this.isEditing.set(true);
    this.currentAppointment.set({ ...app });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  openRecapModal(app: Appointment): void {
    this.recapAppointment.set(app);
    this.isRecapOpen.set(true);
  }

  closeRecap(): void {
    this.isRecapOpen.set(false);
  }

  editFromRecap(): void {
    const app = this.recapAppointment();
    this.isRecapOpen.set(false);
    if (app) this.openEditModal(app);
  }

  updateAppointmentField<K extends keyof CurrentAppointment>(
    field: K,
    value: CurrentAppointment[K],
  ): void {
    this.currentAppointment.update((a) => ({ ...a, [field]: value }));
  }

  async saveAppointment(): Promise<void> {
    const ca = this.currentAppointment();
    if (!ca.patientName || !ca.specialty || !ca.date || !ca.reason) {
      Swal.fire('Erreur', 'Veuillez remplir tous les champs obligatoires (*)', 'error');
      return;
    }
    this.isSaving.set(true);
    try {
      const data: Record<string, unknown> = {
        patientName: ca.patientName,
        patientPhone: ca.patientPhone,
        specialty: ca.specialty,
        date: ca.date,
        time: ca.time,
        duration: ca.duration,
        reason: ca.reason,
        status: ca.status,
        doctor: ca.doctor,
        companion: ca.companion,
        notes: ca.notes,
        availability: ca.availability,
        createdAt: ca.createdAt ?? Date.now(),
      };
      if (ca.id) {
        await this.api.modifier('appointments', ca.id, data);
      } else {
        await this.api.creer('appointments', data);
      }
      if (ca._sheetRowNumber) {
        if (ca._isPsyRequest) {
          markPsyRowAsImported(ca._sheetRowNumber);
        } else {
          markRowAsImported(ca._sheetRowNumber);
        }
      }
      Swal.fire('Succès', 'Le rendez-vous a été enregistré.', 'success');
      this.closeModal();
    } catch (err) {
      console.error(err);
      Swal.fire('Erreur', 'Impossible de sauvegarder le rendez-vous.', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  async confirmDelete(app: Appointment): Promise<void> {
    const result = await Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: 'Voulez-vous vraiment supprimer ce rendez-vous ?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer !',
      cancelButtonText: 'Annuler',
    });
    if (result.isConfirmed && app.id) {
      try {
        await this.api.supprimer('appointments', app.id);
        Swal.fire('Supprimé !', 'Le rendez-vous a été supprimé.', 'success');
      } catch (err) {
        console.error(err);
        Swal.fire('Erreur', 'Impossible de supprimer le rendez-vous.', 'error');
      }
    }
  }

  // --- Google Forms ---
  async loadFormRequests(): Promise<void> {
    this.isLoadingRequests.set(true);
    this.formRequestsError.set(null);
    try {
      const data = await fetchFormResponses();
      this.formRequests.set(data);
    } catch {
      this.formRequestsError.set('Impossible de charger les demandes Google Forms.');
    } finally {
      this.isLoadingRequests.set(false);
    }
  }

  async loadPsyRequests(): Promise<void> {
    this.isLoadingPsyRequests.set(true);
    this.psyRequestsError.set(null);
    try {
      const data = await fetchPsyFormResponses();
      this.psyRequests.set(data);
    } catch {
      this.psyRequestsError.set('Impossible de charger les demandes Psy.');
    } finally {
      this.isLoadingPsyRequests.set(false);
    }
  }

  isAlreadyImported(request: FormRequest | PsyFormRequest): boolean {
    return this.appointments().some(
      (app) =>
        app.patientName?.toLowerCase().trim() === request.patientName?.toLowerCase().trim() &&
        app.createdAt === request.createdAt,
    );
  }

  importRequest(request: FormRequest): void {
    this.isEditing.set(false);
    let matchedSpecialty = '';
    if (request.specialty) {
      const match = this.specialtiesList().find(
        (s) => request.specialty.includes(s.name) || request.specialty.includes(s.icon),
      );
      if (match) matchedSpecialty = match.name;
    }
    this.currentAppointment.set({
      id: null,
      patientName: request.patientName,
      patientPhone: request.patientPhone,
      specialty: matchedSpecialty,
      date: new Date().toISOString().split('T')[0],
      time: '',
      reason: request.reason || request.notes || '',
      status: 'En attente',
      doctor: '',
      companion: '',
      duration: 30,
      notes: request.notes || '',
      availability: request.availability,
      createdAt: request.createdAt,
      _sheetRowNumber: request._sheetRowNumber,
    });
    this.isModalOpen.set(true);
  }

  importPsyRequest(request: PsyFormRequest): void {
    this.isEditing.set(false);
    const psySpec = this.specialtiesList().find((s) => s.name.toLowerCase().includes('psy'));
    let baseNotes = '';
    if (request.category) baseNotes += `Catégorie: ${request.category}\n`;
    if (request.notes) baseNotes += `Divers: ${request.notes}`;
    this.currentAppointment.set({
      id: null,
      patientName: request.patientName,
      patientPhone: request.patientPhone,
      specialty: psySpec?.name ?? 'Psychologue',
      date: new Date().toISOString().split('T')[0],
      time: '',
      reason: request.reason || '',
      status: 'En attente',
      doctor: '',
      companion: '',
      duration: 30,
      notes: baseNotes.trim(),
      availability: request.availability,
      createdAt: request.createdAt,
      _sheetRowNumber: request._sheetRowNumber,
      _isPsyRequest: true,
    });
    this.isModalOpen.set(true);
  }
}
