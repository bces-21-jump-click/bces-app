import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { NotifManagerService } from '../../services/notif-manager.service';
import type { ExpenseNote } from '../../modeles/expense-note';
import type { OrderHistory, OrderItem } from '../../modeles/order';
import type { VehicleHistory } from '../../modeles/vehicle-history';
import type { Profile } from '../../modeles/utilisateur';

@Component({
  selector: 'app-notes-frais',
  templateUrl: './notes-frais.html',
  styleUrl: './notes-frais.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class NotesFraisPage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);
  readonly notif = inject(NotifManagerService);

  readonly onglet = signal<'my' | 'waiting' | 'history'>('my');

  // Realtime data
  readonly myNotes = signal<ExpenseNote[]>([]);
  readonly allNotes = signal<ExpenseNote[]>([]);
  readonly histories = signal<OrderHistory[]>([]);
  readonly vehicleHistories = signal<VehicleHistory[]>([]);
  readonly profiles = signal<Profile[]>([]);
  private unsubs: (() => void)[] = [];

  // Dialog
  readonly dialogCreate = signal(false);
  readonly selectedReason = signal<'buy' | 'vehicle' | 'other' | null>(null);
  readonly selectedBuyId = signal<string | null>(null);
  readonly selectedVehicleId = signal<string | null>(null);
  readonly otherText = signal('');
  readonly otherPrice = signal(0);

  // Refuse dialog
  readonly dialogRefuse = signal(false);
  readonly refuseNote = signal<ExpenseNote | null>(null);
  readonly refuseComment = signal('');

  readonly reasonList = [
    { title: 'Achat de matériel', value: 'buy' as const },
    { title: 'Véhicule en fourrière', value: 'vehicle' as const },
    { title: 'Autre dépense', value: 'other' as const },
  ];

  readonly companies = computed(() => this.notif.companies());
  readonly items = computed(() => this.notif.items());
  readonly vehicles = computed(() => this.notif.vehicles().filter((v) => v.where !== 'dead'));

  readonly perms = computed(() => this.auth.profile()?.permissions ?? []);
  readonly canManage = computed(() =>
    this.perms().some((p) => ['dev', 'admin', 'cash'].includes(p)),
  );

  // Waiting notes (not paid, not refused)
  readonly waitingNotes = computed(() =>
    this.allNotes()
      .filter((n) => !n.isPaid && !n.isRefused)
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0)),
  );

  // History notes (paid or refused), grouped by month
  readonly historyNotes = computed(() =>
    this.allNotes()
      .filter((n) => n.isPaid || n.isRefused)
      .sort((a, b) => (b.closeDate ?? 0) - (a.closeDate ?? 0)),
  );

  readonly monthGrouped = computed(() => {
    const grouped: Record<
      string,
      { month: string; year: number; totalPaid: number; notes: ExpenseNote[] }
    > = {};
    for (const note of this.historyNotes()) {
      const d = new Date(note.closeDate ?? 0);
      const key = `${d.getMonth() + 1}-${d.getFullYear()}`;
      if (!grouped[key]) {
        grouped[key] = {
          month: d.toLocaleString('fr-FR', { month: 'long' }),
          year: d.getFullYear(),
          totalPaid: 0,
          notes: [],
        };
      }
      grouped[key].notes.push(note);
      if (!note.isRefused) grouped[key].totalPaid += note.price;
    }
    return grouped;
  });
  readonly monthKeys = computed(() => Object.keys(this.monthGrouped()));

  // Available histories for buy reason (recent, with price, from canExpenseNote companies)
  readonly availableHistories = computed(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.histories().filter((h) => {
      if (!h.payDate || h.payDate < cutoff || !h.price) return false;
      const co = this.companies().find((c) => c.id === h.company);
      return co?.canExpenseNote;
    });
  });

  // Available vehicle histories for fourrière
  readonly availableVehicleHistories = computed(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.vehicleHistories().filter((vh) => {
      if (!vh.vehicle || vh.vehicle === 'all') return false;
      if (!vh.date || vh.date < cutoff || !vh.price) return false;
      const v = this.vehicles().find((vv) => vv.id === vh.vehicle);
      return v && vh.message.includes('Fourrière');
    });
  });

  constructor() {
    const userId = this.auth.profile()?.id;

    // My notes (filtered by user)
    if (userId) {
      this.unsubs.push(
        this.api.ecouter<ExpenseNote>('expenseNotes', (list) => {
          const mine = list
            .filter((n) => n.user === userId)
            .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
          this.myNotes.set(mine);
        }),
      );
    }

    // All notes + histories + vehicle histories + profiles (for admin tabs)
    if (this.canManage()) {
      this.unsubs.push(
        this.api.ecouter<ExpenseNote>('expenseNotes', (list) => this.allNotes.set(list)),
      );
      this.unsubs.push(this.api.ecouter<Profile>('profiles', (list) => this.profiles.set(list)));
    }

    // Histories & vehicle histories for MyTab create dialog
    this.unsubs.push(
      this.api.ecouter<OrderHistory>('histories', (list) => this.histories.set(list)),
    );
    this.unsubs.push(
      this.api.ecouter<VehicleHistory>('vehicleHistories', (list) =>
        this.vehicleHistories.set(list),
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

  getCompanyName(companyId: string | null): string {
    if (!companyId) return '—';
    return this.companies().find((c) => c.id === companyId)?.name ?? companyId;
  }

  getCompanyIcon(companyId: string | null): string {
    if (!companyId) return '';
    return this.companies().find((c) => c.id === companyId)?.icon ?? '';
  }

  getProfileName(userId: string | null): string {
    if (!userId) return '—';
    return this.profiles().find((p) => p.id === userId)?.name ?? userId;
  }

  getItemInfo(id: string): { icon: string; name: string } | undefined {
    return this.items().find((i) => i.id === id);
  }

  getHistoryInfo(dataId: string): OrderHistory | undefined {
    return this.histories().find((h) => h.id === dataId);
  }

  getVehicleHistoryInfo(dataId: string): VehicleHistory | undefined {
    return this.vehicleHistories().find((h) => h.id === dataId);
  }

  getVehicleInfo(vehicleId: string | null): { icon: string; name: string } | undefined {
    if (!vehicleId) return undefined;
    return this.vehicles().find((v) => v.id === vehicleId);
  }

  getNoteColor(note: ExpenseNote): string {
    if (note.isPaid) return 'success';
    if (note.isRefused) return 'danger';
    return 'accent';
  }

  // Create dialog
  openCreateDialog(): void {
    this.selectedReason.set(null);
    this.selectedBuyId.set(null);
    this.selectedVehicleId.set(null);
    this.otherText.set('');
    this.otherPrice.set(0);
    this.dialogCreate.set(true);
  }

  async sendExpenseNote(): Promise<void> {
    const reason = this.selectedReason();
    if (!reason) return;

    const userId = this.auth.profile()?.id;
    if (!userId) return;

    let data: string = '';
    let price = 0;

    if (reason === 'buy') {
      const buyId = this.selectedBuyId();
      if (!buyId) return;
      data = buyId;
      const h = this.histories().find((hh) => hh.id === buyId);
      price = h?.price ?? 0;
    } else if (reason === 'vehicle') {
      const vhId = this.selectedVehicleId();
      if (!vhId) return;
      data = vhId;
      const vh = this.vehicleHistories().find((h) => h.id === vhId);
      price = vh?.price ?? 0;
    } else {
      data = this.otherText();
      price = this.otherPrice();
    }

    const note: Omit<ExpenseNote, 'id'> = {
      user: userId,
      date: Date.now(),
      reason,
      data,
      price,
      isPaid: false,
      isRefused: false,
      refusalComment: '',
      closeDate: null,
    };

    const reasonLabel = this.reasonList.find((r) => r.value === reason)?.title ?? reason;
    this.logger.log(
      userId,
      'NOTES DE FRAIS',
      `Création d'une note de frais pour ${reasonLabel} (${this.formatMoney(price)})`,
    );
    await this.api.creer('expenseNotes', note);
    this.dialogCreate.set(false);
    Swal.fire({
      icon: 'success',
      title: 'Note de frais envoyée !',
      showConfirmButton: false,
      timer: 1500,
    });
  }

  // Pay
  async payNote(note: ExpenseNote): Promise<void> {
    if (!note.id) return;
    const { isConfirmed } = await Swal.fire({
      title: 'Confirmer le paiement',
      text: 'Êtes-vous sûr de vouloir marquer cette note de frais comme payée ?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, payer !',
      cancelButtonText: 'Annuler',
    });
    if (!isConfirmed) return;
    const reasonLabel = this.reasonList.find((r) => r.value === note.reason)?.title ?? note.reason;
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'NOTES DE FRAIS',
      `Paiement d'une note de frais à ${this.getProfileName(note.user)} pour ${reasonLabel} (${this.formatMoney(note.price)})`,
    );
    await this.api.modifier('expenseNotes', note.id, {
      isPaid: true,
      closeDate: Date.now(),
    });
  }

  // Refuse
  openRefuseDialog(note: ExpenseNote): void {
    this.refuseNote.set(note);
    this.refuseComment.set('');
    this.dialogRefuse.set(true);
  }

  async confirmRefuse(): Promise<void> {
    const note = this.refuseNote();
    if (!note?.id) return;
    const reasonLabel = this.reasonList.find((r) => r.value === note.reason)?.title ?? note.reason;
    this.logger.log(
      this.auth.profile()?.id ?? '',
      'NOTES DE FRAIS',
      `Refus d'une note de frais à ${this.getProfileName(note.user)} pour ${reasonLabel} (${this.formatMoney(note.price)})`,
    );
    await this.api.modifier('expenseNotes', note.id, {
      isRefused: true,
      refusalComment: this.refuseComment(),
      closeDate: Date.now(),
    });
    this.dialogRefuse.set(false);
  }
}
