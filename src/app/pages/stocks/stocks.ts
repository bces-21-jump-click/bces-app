import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotifManagerService } from '../../services/notif-manager.service';
import { LoggerService } from '../../services/logger.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import type { Entreprise, Stock } from '../../modeles/effectif';
import type { Stockage } from '../../modeles/stockage';

function createId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/ /g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

@Component({
  selector: 'app-stocks',
  templateUrl: './stocks.html',
  styleUrl: './stocks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class StocksPage {
  readonly notif = inject(NotifManagerService);
  private readonly logger = inject(LoggerService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly activeTab = signal<'companies' | 'storages' | 'items'>('companies');

  // Dialogs
  readonly companyDialog = signal(false);
  readonly editingCompany = signal<Entreprise | null>(null);

  readonly storageDialog = signal(false);
  readonly editingStorage = signal<Stockage | null>(null);

  readonly itemDialog = signal(false);
  readonly editingItem = signal<Stock | null>(null);

  readonly sortedItems = computed(() =>
    [...this.notif.items()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  constructor() {
    this.notif.init();
  }

  getStorageName(id: string): string {
    const s = this.notif.storages().find((s) => s.id === id);
    return s ? `${s.icon} ${s.name}` : '';
  }

  getCompanyName(id: string): string {
    const c = this.notif.companies().find((c) => c.id === id);
    return c ? `${c.icon} ${c.name}` : '';
  }

  // === Entreprises ===
  newCompany(): void {
    this.editingCompany.set({
      id: '',
      icon: '',
      name: '',
      canDestroy: false,
      canExpenseNote: false,
      isGarage: false,
    });
    this.companyDialog.set(true);
  }

  editCompany(company: Entreprise): void {
    this.editingCompany.set({ ...company });
    this.companyDialog.set(true);
  }

  async saveCompany(): Promise<void> {
    const c = this.editingCompany();
    if (!c) return;
    const id = c.id || createId(c.name);
    const data = {
      icon: c.icon,
      name: c.name,
      canDestroy: c.canDestroy,
      canExpenseNote: c.canExpenseNote,
      isGarage: c.isGarage,
    };
    const logAction = c.id ? 'Modification' : 'Création';
    await this.api.creer('companies', data, id);
    await this.logger.log(
      this.auth.profile()!.id,
      'ENTREPRISES',
      `${logAction} de l'entreprise ${c.icon}${c.name}`,
    );
    this.companyDialog.set(false);
  }

  async deleteCompany(company: Entreprise): Promise<void> {
    if (!confirm(`Voulez-vous vraiment supprimer l'entreprise "${company.name}" ?`)) return;
    await this.api.supprimer('companies', company.id);
    await this.logger.log(
      this.auth.profile()!.id,
      'ENTREPRISES',
      `Suppression de l'entreprise ${company.icon}${company.name}`,
    );
  }

  // === Stockages ===
  newStorage(): void {
    this.editingStorage.set({ id: '', icon: '', name: '', maxWeight: 0 });
    this.storageDialog.set(true);
  }

  editStorage(storage: Stockage): void {
    this.editingStorage.set({ ...storage });
    this.storageDialog.set(true);
  }

  async saveStorage(): Promise<void> {
    const s = this.editingStorage();
    if (!s) return;
    const id = s.id || createId(s.name);
    const data = { icon: s.icon, name: s.name, maxWeight: s.maxWeight };
    const logAction = s.id ? 'Modification' : 'Création';
    await this.api.creer('storages', data, id);
    await this.logger.log(
      this.auth.profile()!.id,
      'STOCKAGES',
      `${logAction} du stockage ${s.icon}${s.name}`,
    );
    this.storageDialog.set(false);
  }

  async deleteStorage(storage: Stockage): Promise<void> {
    if (!confirm(`Voulez-vous vraiment supprimer le stockage "${storage.name}" ?`)) return;
    await this.api.supprimer('storages', storage.id!);
    await this.logger.log(
      this.auth.profile()!.id,
      'STOCKAGES',
      `Suppression du stockage ${storage.icon}${storage.name}`,
    );
  }

  // === Items ===
  newItem(): void {
    this.editingItem.set({
      id: '',
      icon: '',
      name: '',
      storage: '',
      weight: 0,
      seller: '',
      amount: 0,
      wanted: 0,
      maxOrder: 0,
      isInstantiated: false,
      instanceByDate: false,
      isSecure: false,
      history: [],
    });
    this.itemDialog.set(true);
  }

  editItem(item: Stock): void {
    this.editingItem.set({ ...item });
    this.itemDialog.set(true);
  }

  async saveItem(): Promise<void> {
    const i = this.editingItem();
    if (!i) return;
    const id = i.id || createId(i.name);
    const data = {
      icon: i.icon,
      name: i.name,
      storage: i.storage,
      weight: i.weight,
      seller: i.seller,
      amount: i.amount,
      wanted: i.wanted,
      maxOrder: i.maxOrder,
      isInstantiated: i.isInstantiated,
      instanceByDate: i.instanceByDate,
      isSecure: i.isSecure,
      history: i.history,
    };
    const logAction = i.id ? 'Modification' : 'Création';
    await this.api.creer('items', data, id);
    await this.logger.log(
      this.auth.profile()!.id,
      'ITEMS',
      `${logAction} de l'item ${i.icon}${i.name}`,
    );
    this.itemDialog.set(false);
  }

  async deleteItem(item: Stock): Promise<void> {
    if (!confirm(`Voulez-vous vraiment supprimer l'item "${item.name}" ?`)) return;
    await this.api.supprimer('items', item.id);
    await this.logger.log(
      this.auth.profile()!.id,
      'ITEMS',
      `Suppression de l'item ${item.icon}${item.name}`,
    );
  }
}
