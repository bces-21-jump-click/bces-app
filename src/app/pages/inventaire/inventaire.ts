import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { NotifManagerService } from '../../services/notif-manager.service';
import { ApiService } from '../../services/api.service';
import { LoggerService } from '../../services/logger.service';
import { AuthService } from '../../services/auth.service';
import type { Stock } from '../../modeles/effectif';
import type { Instance, InstanceEntry } from '../../modeles/instance';

@Component({
  selector: 'app-inventaire',
  templateUrl: './inventaire.html',
  styleUrl: './inventaire.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe],
})
export class InventairePage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly logger = inject(LoggerService);
  private readonly auth = inject(AuthService);
  readonly notif = inject(NotifManagerService);

  readonly activeTab = signal<string | null>(null);
  readonly filterName = signal('');
  readonly filterSeller = signal<string | null>(null);

  // Instance dialog
  readonly dialogInstance = signal(false);
  readonly currentItem = signal<Stock | null>(null);
  readonly currentInstance = signal<Instance | null>(null);

  // Name dialog
  readonly dialogName = signal(false);
  readonly instanceName = signal('');

  // Date dialog
  readonly dialogDate = signal(false);
  readonly instanceDate = signal('');
  readonly instanceAmount = signal(0);

  // Movement dialog
  readonly dialogMovement = signal(false);
  readonly movementItem = signal<Stock | null>(null);

  readonly storages = computed(() => this.notif.storages());
  readonly companies = computed(() => this.notif.companies());
  readonly items = computed(() => this.notif.items());
  readonly saveDates = computed(() => this.notif.saveDates());
  readonly deltaTime = computed(() => this.notif.storageDeltaTime());

  readonly currentStorageItems = computed(() =>
    this.items().filter((i) => i.storage === this.activeTab()),
  );

  readonly filteredItems = computed(() => {
    let result = this.currentStorageItems();
    const name = this.filterName().toLowerCase().trim();
    if (name) {
      result = result.filter((i) => i.name.toLowerCase().includes(name));
    }
    const seller = this.filterSeller();
    if (seller) {
      result = result.filter((i) => i.seller === seller);
    }
    return result;
  });

  readonly statsTotal = computed(() =>
    this.currentStorageItems().reduce((t, i) => t + i.amount, 0),
  );

  readonly statsPoids = computed(
    () =>
      Math.round(this.currentStorageItems().reduce((t, i) => t + i.weight * i.amount, 0) * 1000) /
      1000,
  );

  readonly statsPoidsRestant = computed(() => {
    const storage = this.storages().find((s) => s.id === this.activeTab());
    if (!storage) return 0;
    return Math.round((storage.maxWeight - this.statsPoids()) * 1000) / 1000;
  });

  readonly perms = computed(() => this.auth.profile()?.permissions ?? []);
  readonly canViewMovement = computed(() =>
    this.perms().some((p) => ['dev', 'admin', 'logs'].includes(p)),
  );
  readonly canEditInstances = computed(() =>
    this.perms().some((p) => ['dev', 'admin', 'stock'].includes(p)),
  );

  constructor() {
    const checkTab = setInterval(() => {
      const st = this.storages();
      if (st.length > 0 && !this.activeTab()) {
        this.activeTab.set(st[0].id);
        clearInterval(checkTab);
      }
    }, 200);
  }

  getCompanyName(sellerId: string): string {
    const c = this.companies().find((co) => co.id === sellerId);
    return c ? `${c.icon} ${c.name}` : sellerId;
  }

  getSaveDateLabel(storageId: string): string {
    const sd = this.saveDates()[storageId];
    if (!sd) return 'Aucune donnée';
    return new Date(sd.date).toLocaleString().slice(0, 16);
  }

  getSaveDateClass(storageId: string): string {
    const dt = this.deltaTime()[storageId] ?? 9999;
    if (dt < 12) return 'text-success';
    if (dt < 24) return 'text-warning';
    return 'text-danger';
  }

  getNeeded(item: Stock): number {
    return Math.max(0, item.wanted - item.amount);
  }

  getNeededClass(item: Stock): string {
    if (item.amount >= item.wanted) return 'text-success';
    if (item.amount >= item.wanted * 0.5) return '';
    if (item.amount >= item.wanted * 0.25) return 'text-warning';
    return 'text-danger';
  }

  startEditing(item: Stock): void {
    this.notif.editingItemIds.add(item.id);
  }

  stopEditing(item: Stock): void {
    setTimeout(() => this.notif.editingItemIds.delete(item.id), 500);
  }

  async updateItem(item: Stock): Promise<void> {
    const { id, ...data } = item;
    await this.api.modifier('items', id, data as unknown as Record<string, unknown>);

    const storageId = item.storage;
    const sd = this.saveDates()[storageId];
    if (sd?.id) {
      await this.api.modifier('saveDates', sd.id, { date: Date.now() });
    } else {
      await this.api.creer('saveDates', { date: Date.now() }, storageId);
    }

    const storage = this.storages().find((s) => s.id === storageId);
    const storageName = storage ? `${storage.icon}${storage.name}` : storageId;
    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'INVENTAIRE',
      `Mise à jour de l'item ${item.icon}${item.name} dans ${storageName}. (Nouvelle quantité : ${item.amount})`,
    );
  }

  async openInstanceDialog(item: Stock): Promise<void> {
    this.currentItem.set(item);
    this.dialogInstance.set(true);

    let instance: Instance | null = null;
    try {
      instance = await this.api.obtenir<Instance>('instances', item.id);
    } catch {
      instance = null;
    }

    if (!instance) {
      instance = { id: item.id, content: [] };
      await this.api.creer('instances', { content: [] }, item.id);
    }

    if (item.instanceByDate) {
      instance.content = instance.content.filter((e) => e.amount > 0);
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toLocaleDateString();
        if (!instance.content.find((e) => e.date === dateStr)) {
          instance.content.push({ date: dateStr, amount: 0, locked: false });
        }
      }
      instance.content.sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
      await this.api.modifier('instances', item.id, { content: instance.content });
    }

    this.currentInstance.set(instance);
  }

  closeInstanceDialog(): void {
    this.dialogInstance.set(false);
  }

  async saveInstance(): Promise<void> {
    const inst = this.currentInstance();
    const item = this.currentItem();
    if (!inst || !item) return;

    const totalAmount = inst.content.reduce(
      (t, e) => t + (typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount))),
      0,
    );
    item.amount = totalAmount;
    await this.updateItem(item);
    await this.api.modifier('instances', item.id, { content: inst.content });
    this.closeInstanceDialog();
  }

  openNameDialog(): void {
    this.instanceName.set('');
    this.dialogName.set(true);
  }

  closeNameDialog(): void {
    this.dialogName.set(false);
  }

  addInstance(): void {
    const name = this.instanceName().trim();
    if (!name) return;
    const inst = this.currentInstance();
    if (!inst) return;
    if (inst.content.find((e) => e.name === name)) return;
    inst.content.push({ name, amount: 0, locked: false });
    inst.content.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    this.currentInstance.set({ ...inst });
    this.closeNameDialog();
  }

  openDateDialog(): void {
    this.instanceDate.set(new Date().toLocaleDateString());
    this.instanceAmount.set(0);
    this.dialogDate.set(true);
  }

  closeDateDialog(): void {
    this.dialogDate.set(false);
  }

  addDateInstance(): void {
    const date = this.instanceDate().trim();
    if (!date) return;
    const dateRegex = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/;
    if (!dateRegex.test(date)) return;
    const inst = this.currentInstance();
    if (!inst) return;
    if (inst.content.find((e) => e.date === date)) return;
    inst.content.push({ date, amount: this.instanceAmount(), locked: false });
    inst.content.sort(
      (a, b) =>
        new Date(a.date!.split('/').reverse().join('-')).getTime() -
        new Date(b.date!.split('/').reverse().join('-')).getTime(),
    );
    this.currentInstance.set({ ...inst });
    this.closeDateDialog();
  }

  removeInstanceEntry(entry: InstanceEntry): void {
    const inst = this.currentInstance();
    if (!inst) return;
    inst.content = inst.content.filter((e) => e !== entry);
    this.currentInstance.set({ ...inst });
  }

  toggleLock(entry: InstanceEntry): void {
    entry.locked = !entry.locked;
    this.currentInstance.update((inst) => (inst ? { ...inst } : inst));
  }

  showMovement(item: Stock): void {
    this.movementItem.set(item);
    this.dialogMovement.set(true);
  }

  closeMovementDialog(): void {
    this.dialogMovement.set(false);
  }

  isDateExpired(dateStr: string): boolean {
    const parts = dateStr.split('/').reverse().join('-');
    return new Date(parts).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  }

  ngOnDestroy(): void {
    // NotifManager handles its own cleanup
  }
}
