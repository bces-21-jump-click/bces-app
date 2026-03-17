import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { NotifManagerService } from '../../services/notif-manager.service';
import type { Vehicule, Entreprise } from '../../modeles/effectif';
import type { VehicleHistory } from '../../modeles/vehicle-history';
import type { SaveDate } from '../../modeles/save-date';
import { VEHICLES_LOCATIONS, type VehicleLocation } from '../../config/vehicles-locations.config';

@Component({
  selector: 'app-garage',
  templateUrl: './garage.html',
  styleUrl: './garage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class GaragePage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);
  readonly notif = inject(NotifManagerService);

  readonly onglet = signal<'garage' | 'history' | 'vehicles'>('garage');
  readonly vehicles = signal<Vehicule[]>([]);
  readonly vehicleHistories = signal<VehicleHistory[]>([]);
  readonly lastSaveDate = signal<SaveDate | null>(null);
  readonly companies = signal<Entreprise[]>([]);
  private unsubs: (() => void)[] = [];

  // Dialogs
  readonly dialogRepa = signal(false);
  readonly selectedGarage = signal<string | null>(null);
  readonly selectedVehicles = signal<Record<string, boolean>>({});

  readonly dialogGuard = signal(false);
  readonly dialogRecup = signal(false);
  readonly currentVehicle = signal<Vehicule | null>(null);
  readonly newLocation = signal<string | null>(null);
  readonly recupDateStr = signal('');
  readonly price = signal(0);

  readonly dialogVehicle = signal(false);
  readonly editVehicle = signal<Partial<Vehicule>>({});

  now(): number {
    return Date.now();
  }

  readonly perms = computed(() => this.auth.profile()?.permissions ?? []);
  readonly canViewHistory = computed(() =>
    this.perms().some((p) => ['dev', 'admin', 'cash'].includes(p)),
  );
  readonly canManageVehicles = computed(() =>
    this.perms().some((p) => ['dev', 'admin', 'vehicles'].includes(p)),
  );
  readonly isDev = computed(() => this.perms().includes('dev'));

  readonly sortedVehicles = computed(() => {
    const iconOrder = ['🚑', '⛰️', '🚨'];
    return [...this.vehicles()]
      .filter((v) => v.where !== 'dead')
      .sort((a, b) => {
        if (a.insurance && !b.insurance) return -1;
        if (!a.insurance && b.insurance) return 1;
        if (a.needRepair && !b.needRepair) return -1;
        if (!a.needRepair && b.needRepair) return 1;
        if (a.underGuard && !b.underGuard) return -1;
        if (!a.underGuard && b.underGuard) return 1;
        if (a.hideAlert && !b.hideAlert) return 1;
        if (!a.hideAlert && b.hideAlert) return -1;
        if (a.where !== b.where) return a.where.localeCompare(b.where);
        const ai = iconOrder.findIndex((i) => a.icon.startsWith(i));
        const bi = iconOrder.findIndex((i) => b.icon.startsWith(i));
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  });

  readonly deltaTime = computed(() => {
    const sd = this.lastSaveDate();
    if (!sd?.date) return Infinity;
    return Math.floor((Date.now() - sd.date) / (1000 * 60 * 60));
  });

  readonly allLocations = computed<VehicleLocation[]>(() => {
    const locs = [...VEHICLES_LOCATIONS];
    for (const c of this.companies()) {
      if (c.isGarage) {
        locs.push({ value: c.id, text: `${c.icon} ${c.name}`, home: false });
      }
    }
    return locs;
  });

  readonly monthGrouped = computed(() => {
    const grouped: Record<
      string,
      { month: string; year: number; totalPaid: number; histories: VehicleHistory[] }
    > = {};
    const sorted = [...this.vehicleHistories()].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    for (const h of sorted) {
      const d = new Date(h.date ?? 0);
      const key = `${d.getMonth() + 1}-${d.getFullYear()}`;
      if (!grouped[key]) {
        grouped[key] = {
          month: d.toLocaleString('fr-FR', { month: 'long' }),
          year: d.getFullYear(),
          totalPaid: 0,
          histories: [],
        };
      }
      grouped[key].histories.push(h);
      grouped[key].totalPaid += h.price;
    }
    return grouped;
  });
  readonly monthKeys = computed(() => Object.keys(this.monthGrouped()));

  constructor() {
    this.unsubs.push(this.api.ecouter<Vehicule>('vehicles', (list) => this.vehicles.set(list)));
    this.unsubs.push(
      this.api.ecouter<VehicleHistory>('vehicleHistories', (list) =>
        this.vehicleHistories.set(list),
      ),
    );
    this.unsubs.push(this.api.ecouter<Entreprise>('companies', (list) => this.companies.set(list)));
    this.unsubs.push(
      this.api.ecouterDocument<SaveDate>('saveDates', 'repa_flotte', (sd) =>
        this.lastSaveDate.set(sd),
      ),
    );
  }

  ngOnDestroy(): void {
    this.unsubs.forEach((fn) => fn());
  }

  // Helpers
  formatMoney(v: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
      .format(v)
      .replace('€', '$')
      .replace(',00', '');
  }

  formatDate(ts: number): string {
    return new Date(ts).toLocaleString('fr-FR').slice(0, 16);
  }

  getLocationName(val: string): string {
    return this.allLocations().find((l) => l.value === val)?.text ?? val;
  }

  getVehicleName(id: string | null): string {
    if (!id) return '';
    const v = this.vehicles().find((vv) => vv.id === id);
    return v ? `${v.icon}${v.name}` : '';
  }

  getVehicleColor(v: Vehicule): string {
    if (v.underGuard) return 'accent';
    if (v.needRepair) return 'danger';
    if (v.insurance) return 'warning';
    return '';
  }

  shouldShowRepairAlert(v: Vehicule): boolean {
    if (v.underGuard || v.hideAlert || !v.lastRepairDate) return false;
    return Date.now() - v.lastRepairDate > 24 * 60 * 60 * 1000;
  }

  // Repa flotte
  openRepaDialog(): void {
    const sel: Record<string, boolean> = {};
    for (const v of this.sortedVehicles()) {
      sel[v.id] = !v.underGuard && !v.hideAlert;
    }
    this.selectedVehicles.set(sel);
    this.selectedGarage.set(null);
    this.dialogRepa.set(true);
  }

  async repaFlotte(): Promise<void> {
    const garageId = this.selectedGarage();
    if (!garageId) return;
    const garage = this.companies().find((c) => c.id === garageId);
    if (!garage) return;
    const sel = this.selectedVehicles();
    const count = Object.values(sel).filter(Boolean).length;
    const userId = this.auth.profile()?.id ?? '';

    this.logger.log(
      userId,
      'VEHICULES',
      `Réparation de la flotte - ${garage.icon} ${garage.name} (${count}/${this.sortedVehicles().length} véhicules réparés)`,
    );

    // Update save date
    const sd = this.lastSaveDate();
    if (sd?.id) {
      await this.api.modifier('saveDates', sd.id, { date: Date.now() });
    }

    // Update each selected vehicle
    for (const vId of Object.keys(sel)) {
      if (sel[vId]) {
        await this.api.modifier('vehicles', vId, { lastRepairDate: Date.now(), needRepair: false });
      }
    }

    // Create history
    await this.api.creer('vehicleHistories', {
      date: Date.now(),
      vehicle: 'all',
      message: `Réparation de la flotte de véhicules - ${garage.icon} ${garage.name} (${count}/${this.sortedVehicles().length} véhicules réparés)`,
      price: 0,
    });

    this.dialogRepa.set(false);
  }

  // Individual repair
  async repairNow(v: Vehicule): Promise<void> {
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `${v.icon}${v.name} (${v.imat}) vient d'être réparé`,
    );
    await this.api.modifier('vehicles', v.id, { needRepair: false, lastRepairDate: Date.now() });
  }

  async needRepair(v: Vehicule): Promise<void> {
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `${v.icon}${v.name} (${v.imat}) a besoin de réparation`,
    );
    await this.api.modifier('vehicles', v.id, { needRepair: true });
  }

  async insurance(v: Vehicule): Promise<void> {
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `Demande d'assurance pour ${v.icon}${v.name} (${v.imat})`,
    );
    await this.api.creer('vehicleHistories', {
      date: Date.now(),
      vehicle: v.id,
      message: `Demande d'assurance pour ${v.icon}${v.name} (${v.imat})`,
      price: 0,
    });
    await this.api.modifier('vehicles', v.id, { insurance: true });
  }

  // Guard dialog
  openGuardDialog(v: Vehicule): void {
    this.currentVehicle.set(v);
    this.newLocation.set(null);
    this.recupDateStr.set(new Date().toISOString().slice(0, 16));
    this.price.set(0);
    this.dialogGuard.set(true);
  }

  async guardVehicle(): Promise<void> {
    const v = this.currentVehicle();
    const loc = this.newLocation();
    const dateStr = this.recupDateStr();
    if (!v || !loc || !dateStr) return;

    const recupTs = new Date(dateStr).getTime();
    const fromLoc = this.getLocationName(v.where);
    const toLoc = this.getLocationName(loc);

    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `${v.icon}${v.name} envoyé de ${fromLoc} vers ${toLoc}`,
    );
    await this.api.creer('vehicleHistories', {
      date: Date.now(),
      vehicle: v.id,
      message: `${v.icon}${v.name} (${v.imat}) envoyé depuis ${fromLoc} vers ${toLoc} (récupération le ${new Date(recupTs).toLocaleString('fr-FR')})`,
      price: 0,
    });
    await this.api.modifier('vehicles', v.id, {
      where: loc,
      underGuard: true,
      recupDate: recupTs,
      insurance: false,
    });
    this.dialogGuard.set(false);
  }

  // Recup dialog
  openRecupDialog(v: Vehicule): void {
    if (v.insurance) {
      // Direct insurance recovery
      this.recoverInsurance(v);
      return;
    }
    this.currentVehicle.set(v);
    this.newLocation.set(null);
    this.price.set(0);
    this.dialogRecup.set(true);
  }

  private async recoverInsurance(v: Vehicule): Promise<void> {
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `Assurance acceptée pour ${v.icon}${v.name} (${v.imat})`,
    );
    await this.api.creer('vehicleHistories', {
      date: Date.now(),
      vehicle: v.id,
      message: `Assurance acceptée et récupération pour ${v.icon}${v.name} (${v.imat})`,
      price: 0,
    });
    await this.api.modifier('vehicles', v.id, { insurance: false });
  }

  async recupVehicle(): Promise<void> {
    const v = this.currentVehicle();
    const loc = this.newLocation();
    const p = this.price();
    if (!v || !loc) return;

    const fromLoc = this.getLocationName(v.where);
    const toLoc = this.getLocationName(loc);

    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `Récupération de ${v.icon}${v.name} pour ${p}$ (${fromLoc} → ${toLoc})`,
    );
    await this.api.creer('vehicleHistories', {
      date: Date.now(),
      vehicle: v.id,
      message: `Récupération de ${v.icon}${v.name} (${v.imat}) depuis ${fromLoc} vers ${toLoc} pour ${p}$`,
      price: p,
    });
    await this.api.modifier('vehicles', v.id, { where: loc, underGuard: false, recupDate: null });
    this.dialogRecup.set(false);
  }

  // Vehicle CRUD
  openNewVehicle(): void {
    this.editVehicle.set({
      icon: '',
      name: '',
      imat: '',
      where: 'garage',
      underGuard: false,
      recupDate: null,
      lastRepairDate: null,
      hideAlert: false,
      needRepair: false,
      insurance: false,
    });
    this.dialogVehicle.set(true);
  }

  openEditVehicle(v: Vehicule): void {
    this.editVehicle.set({ ...v });
    this.dialogVehicle.set(true);
  }

  async saveVehicle(): Promise<void> {
    const v = this.editVehicle();
    const userId = this.auth.profile()?.id ?? '';
    if (v.id) {
      this.logger.log(userId, 'VEHICULES', `Modification du véhicule ${v.icon}${v.name}`);
      await this.api.modifier('vehicles', v.id, v);
    } else {
      this.logger.log(userId, 'VEHICULES', `Création du véhicule ${v.icon}${v.name}`);
      await this.api.creer('vehicles', v);
    }
    this.dialogVehicle.set(false);
  }

  async destroyVehicle(v: Vehicule): Promise<void> {
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `Destruction du véhicule ${v.icon}${v.name}`,
    );
    await this.api.creer('vehicleHistories', {
      date: Date.now(),
      vehicle: v.id,
      message: `Destruction du véhicule : ${v.icon}${v.name} (${v.imat})`,
      price: 0,
    });
    await this.api.modifier('vehicles', v.id, {
      where: 'dead',
      hideAlert: true,
      underGuard: false,
      recupDate: null,
      needRepair: false,
      insurance: false,
    });
  }

  async deleteVehicle(v: Vehicule): Promise<void> {
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'VEHICULES',
      `Suppression du véhicule ${v.icon}${v.name}`,
    );
    await this.api.supprimer('vehicles', v.id);
  }

  toggleSelectedVehicle(id: string): void {
    const sel = { ...this.selectedVehicles() };
    sel[id] = !sel[id];
    this.selectedVehicles.set(sel);
  }
}
