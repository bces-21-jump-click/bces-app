import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import Swal from 'sweetalert2';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { NotifManagerService } from '../../services/notif-manager.service';
import type { Order, OrderHistory } from '../../modeles/order';
import type { Stock, Entreprise } from '../../modeles/effectif';

@Component({
  selector: 'app-commandes',
  templateUrl: './commandes.html',
  styleUrl: './commandes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe],
})
export class CommandesPage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);
  readonly notif = inject(NotifManagerService);

  readonly onglet = signal<'orders' | 'alert' | 'history'>('orders');

  // Realtime orders & histories
  readonly orders = signal<Order[]>([]);
  readonly histories = signal<OrderHistory[]>([]);
  private unsubs: (() => void)[] = [];

  // Price dialog
  readonly dialogPrice = signal(false);
  readonly priceOrder = signal<Order | null>(null);
  readonly priceValue = signal<number | null>(null);

  // Edit dialog
  readonly dialogEdit = signal(false);
  readonly editOrder = signal<{
    company: string;
    items: { id: string; amount: number }[];
    destroy: number;
    weight: number;
    originalId: string;
  } | null>(null);

  // Order creation from alerts
  readonly dialogCreationMode = signal(false);
  readonly dialogOrder = signal(false);
  readonly orderData = signal<{
    company: Entreprise;
    items: { item: Stock; orderNeeded: number; alertLevel: number }[];
    destroy: number;
  } | null>(null);

  readonly companies = computed(() => this.notif.companies());
  readonly items = computed(() => this.notif.items());
  readonly storages = computed(() => this.notif.storages());
  readonly alerts = computed(() => this.notif.alerts());

  readonly perms = computed(() => this.auth.profile()?.permissions ?? []);
  readonly canViewHistory = computed(() =>
    this.perms().some((p) => ['dev', 'admin', 'stock'].includes(p)),
  );

  readonly companyOrders = computed(() => this.orders().map((o) => o.company));

  readonly editWeight = computed(() => {
    const e = this.editOrder();
    if (!e) return 0;
    return e.items.reduce((t, oi) => {
      const info = this.items().find((i) => i.id === oi.id);
      return t + (info ? info.weight * oi.amount : 0);
    }, 0);
  });

  readonly orderWeight = computed(() => {
    const od = this.orderData();
    if (!od) return 0;
    return od.items.reduce((t, i) => t + i.orderNeeded * i.item.weight, 0);
  });

  // Histories grouped by month
  readonly monthGrouped = computed(() => {
    const grouped: Record<
      string,
      { month: string; year: number; totalPaid: number; histories: OrderHistory[] }
    > = {};
    for (const h of this.histories()) {
      if (!h.payDate) continue;
      const d = new Date(h.payDate);
      const key = `${d.getMonth() + 1}-${d.getFullYear()}`;
      if (!grouped[key]) {
        grouped[key] = {
          month: d.toLocaleString('default', { month: 'long' }),
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

  readonly statusOptions = [
    { label: 'A faire', value: 'A faire', color: 'danger' },
    { label: 'Message envoyé', value: 'Message envoyé', color: 'info' },
    { label: 'A relancer', value: 'A relancer', color: 'warning' },
    { label: 'Attente de réception', value: 'Attente de réception', color: 'success' },
  ];

  constructor() {
    this.unsubs.push(this.api.ecouter<Order>('orders', (o) => this.orders.set(o)));
    this.unsubs.push(
      this.api.ecouter<OrderHistory>('histories', (h) => {
        h.sort((a, b) => (b.payDate ?? 0) - (a.payDate ?? 0));
        this.histories.set(h);
      }),
    );
  }

  ngOnDestroy(): void {
    this.unsubs.forEach((u) => u());
  }

  getCompanyName(id: string | null): string {
    const c = this.companies().find((co) => co.id === id);
    return c ? `${c.icon} ${c.name}` : '';
  }

  getItemInfo(id: string): Stock | undefined {
    return this.items().find((i) => i.id === id);
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
      .format(value)
      .replace('€', '$')
      .replace(',00', '');
  }

  formatDate(ts: number): string {
    const d = new Date(ts);
    return (
      d.toLocaleDateString('fr-FR') +
      ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  getStatusColor(status: string): string {
    const map: Record<string, string> = {
      'A faire': 'danger',
      'Message envoyé': 'info',
      'A relancer': 'warning',
      'Attente de réception': 'success',
    };
    return map[status] ?? 'danger';
  }

  // --- Status ---
  async updateStatus(order: Order, newStatus: string): Promise<void> {
    order.status = newStatus;
    order.updatedAt = Date.now();
    const { id, ...data } = order;
    await this.api.modifier('orders', id!, data as unknown as Record<string, unknown>);
  }

  // --- Price ---
  openPriceDialog(order: Order): void {
    this.priceOrder.set(order);
    this.priceValue.set(order.price);
    this.dialogPrice.set(true);
  }

  async savePriceDialog(): Promise<void> {
    const order = this.priceOrder();
    const val = this.priceValue();
    if (order && val !== null && val >= 0) {
      order.price = val;
      const { id, ...data } = order;
      await this.api.modifier('orders', id!, data as unknown as Record<string, unknown>);
    }
    this.dialogPrice.set(false);
  }

  // --- Edit ---
  openEditOrder(order: Order): void {
    const sellerItems = this.items()
      .filter((i) => i.seller === order.company)
      .sort((a, b) => a.name.localeCompare(b.name));
    const editItems = sellerItems.map((it) => ({
      id: it.id,
      amount: order.items.find((oi) => oi.id === it.id)?.amount ?? 0,
    }));
    this.editOrder.set({
      company: order.company!,
      items: editItems,
      destroy: order.destroy,
      weight: order.weight,
      originalId: order.id!,
    });
    this.dialogEdit.set(true);
  }

  async saveEditOrder(): Promise<void> {
    const e = this.editOrder();
    if (!e) return;
    const weight = e.items.reduce((t, oi) => {
      const info = this.items().find((i) => i.id === oi.id);
      return t + (info ? info.weight * oi.amount : 0);
    }, 0);
    const companyInfo = this.companies().find((c) => c.id === e.company);
    await this.api.modifier('orders', e.originalId, {
      items: e.items.filter((i) => i.amount > 0),
      destroy: e.destroy,
      weight,
      updatedAt: Date.now(),
    });
    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'COMMANDES',
      `Modification d'une commande chez ${companyInfo?.icon}${companyInfo?.name} (${Math.round(weight * 100) / 100} kg)`,
    );
    this.dialogEdit.set(false);
  }

  // --- Copy message ---
  async copyMessage(order: Order): Promise<void> {
    const company = this.companies().find((c) => c.id === order.company);
    let msg = `Commande - ${company?.icon} ${company?.name} :\n\n`;
    for (const oi of order.items) {
      if (oi.amount > 0) {
        const info = this.getItemInfo(oi.id);
        if (info) msg += `${info.icon} ${info.name} - ${oi.amount}\n`;
      }
    }
    if (order.destroy > 0) msg += `\n🗑️ Destruction - ${order.destroy}\n`;
    msg += `\n(${Math.round(order.weight * 100) / 100} kg)`;
    await navigator.clipboard.writeText(msg);
  }

  // --- Pay / Validate ---
  async payOrder(order: Order): Promise<void> {
    let price = order.price ?? 0;
    if (price <= 0) {
      const { value, isConfirmed } = await Swal.fire({
        title: 'Montant total de la commande ($)',
        input: 'number',
        inputPlaceholder: 'Montant',
        showCancelButton: true,
        confirmButtonText: 'Valider',
        cancelButtonText: 'Annuler',
      });
      if (!isConfirmed || !value) return;
      price = parseFloat(value);
      if (isNaN(price) || price < 0) return;
    }

    const history: Omit<OrderHistory, 'id'> = {
      company: order.company,
      items: order.items,
      weight: order.weight,
      destroy: order.destroy,
      price,
      payDate: Date.now(),
      date: null,
    };

    // Update non-instantiated item amounts
    for (const oi of order.items) {
      const currentItem = this.items().find((i) => i.id === oi.id);
      if (currentItem && !currentItem.isInstantiated) {
        await this.api.modifier('items', currentItem.id, {
          amount: currentItem.amount + oi.amount,
        });
      }
    }

    await this.api.creer('histories', history as unknown as Record<string, unknown>);
    const company = this.companies().find((c) => c.id === order.company);
    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'COMMANDES',
      `Validation d'une commande chez ${company?.icon}${company?.name} (${Math.round(order.weight * 100) / 100} kg) pour ${price}$`,
    );
    await this.api.supprimer('orders', order.id!);
  }

  // --- Delete ---
  async deleteOrder(order: Order): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: 'Annuler cette commande ?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui',
      cancelButtonText: 'Non',
    });
    if (!isConfirmed) return;
    const company = this.companies().find((c) => c.id === order.company);
    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'COMMANDES',
      `Annulation d'une commande chez ${company?.icon}${company?.name} (${Math.round(order.weight * 100) / 100} kg)`,
    );
    await this.api.supprimer('orders', order.id!);
  }

  // --- Alert tab: order creation ---
  openOrderCreation(company: Entreprise): void {
    this.orderData.set({
      company,
      items: [],
      destroy: 0,
    });
    this.dialogCreationMode.set(true);
  }

  openOrderDialog(mode: number | null): void {
    const od = this.orderData();
    if (!od) return;

    const alert = this.alerts().find((a) => a.company.id === od.company.id);
    if (!alert) return;

    let resultItems: { item: Stock; orderNeeded: number; alertLevel: number }[];

    if (mode === null || mode === 0 || (alert && mode! > alert.totalWeight)) {
      // Unlimited or mode > total weight - take all
      resultItems =
        mode === 0
          ? alert.items.map((ai) => ({ ...ai, orderNeeded: 0 }))
          : alert.items.map((ai) => ({ ...ai }));
    } else {
      // Weight-limited mode
      const maxW = mode!;
      const ratio = maxW / alert.totalWeight;
      resultItems = [];
      let currentW = 0;

      const sorted = [...alert.items].sort((a, b) =>
        b.alertLevel !== a.alertLevel ? b.alertLevel - a.alertLevel : b.orderNeeded - a.orderNeeded,
      );

      for (const ai of sorted) {
        let threshold = 10;
        if (ai.orderNeeded <= 10) threshold = 1;
        if (ai.orderNeeded <= 50) threshold = 5;
        const amount = Math.floor((ai.orderNeeded * ratio) / threshold) * threshold;
        if (amount > 0) {
          resultItems.push({ ...ai, orderNeeded: amount });
          currentW += amount * ai.item.weight;
        }
      }

      // Fill remaining weight
      let noSolution = false;
      while (!noSolution) {
        noSolution = true;
        for (const ai of sorted) {
          const cur = resultItems.find((r) => r.item.id === ai.item.id);
          if (!cur) continue;
          let threshold = 10;
          if (ai.orderNeeded <= 10) threshold = 1;
          if (ai.orderNeeded <= 50) threshold = 5;
          if (
            cur.orderNeeded + threshold <= ai.orderNeeded &&
            currentW + threshold * ai.item.weight <= maxW
          ) {
            cur.orderNeeded += threshold;
            currentW += threshold * ai.item.weight;
            noSolution = false;
          }
        }
      }
    }

    // Add remaining seller items with 0
    const sellerItems = this.items().filter((i) => i.seller === od.company.id);
    for (const si of sellerItems) {
      if (!resultItems.some((r) => r.item.id === si.id)) {
        resultItems.push({ item: si, orderNeeded: 0, alertLevel: 0 });
      }
    }

    od.items = resultItems;
    if (od.company.canDestroy && mode !== 0) {
      od.destroy = this.getNeedToBeTrashed();
    }
    this.orderData.set({ ...od });
    this.dialogCreationMode.set(false);
    this.dialogOrder.set(true);
  }

  getNeedToBeTrashed(): number {
    // Simplified: uses notif items but doesn't compute instance-level expiry
    return 0;
  }

  async saveOrder(): Promise<void> {
    const od = this.orderData();
    if (!od) return;

    const orderItems = od.items
      .filter((i) => i.orderNeeded > 0)
      .map((i) => ({ id: i.item.id, amount: i.orderNeeded }));
    const weight = od.items.reduce((t, i) => t + i.orderNeeded * i.item.weight, 0);

    await this.api.creer('orders', {
      company: od.company.id,
      items: orderItems,
      weight,
      destroy: od.destroy,
      status: 'A faire',
      price: null,
      date: Date.now(),
      updatedAt: Date.now(),
    });

    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'COMMANDES',
      `Création d'une commande chez ${od.company.icon}${od.company.name} (${Math.round(weight * 100) / 100} kg)`,
    );

    this.dialogOrder.set(false);
  }

  // --- History deletion ---
  async deleteHistory(h: OrderHistory): Promise<void> {
    const { isConfirmed } = await Swal.fire({
      title: 'Supprimer cet historique ?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui',
      cancelButtonText: 'Non',
    });
    if (!isConfirmed) return;
    const company = this.companies().find((c) => c.id === h.company);
    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'COMMANDES',
      `Suppression de l'historique d'une commande du ${new Date(h.payDate!).toLocaleDateString()} chez ${company?.icon}${company?.name}`,
    );
    await this.api.supprimer('histories', h.id!);
  }
}
