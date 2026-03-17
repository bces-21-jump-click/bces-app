import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase.config';
import type { Profile } from '../modeles/utilisateur';
import type { ExpenseNote } from '../modeles/expense-note';
import type { Candidature } from '../modeles/candidature';
import type { SaveDate } from '../modeles/save-date';
import type { Vehicule, Stock, Entreprise } from '../modeles/effectif';
import type { Stockage } from '../modeles/stockage';
import type { Order } from '../modeles/order';
import type { ChecklistTask } from '../modeles/shared-checklist';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class NotifManagerService {
  private readonly zone = inject(NgZone);
  private readonly authService = inject(AuthService);

  readonly waitingUsers = signal<Profile[]>([]);
  readonly waitingExpenseNotes = signal<ExpenseNote[]>([]);
  readonly waitingCandidatures = signal<Candidature[]>([]);
  readonly companies = signal<Entreprise[]>([]);
  readonly items = signal<Stock[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly storages = signal<Stockage[]>([]);
  readonly saveDates = signal<Record<string, SaveDate>>({});
  readonly vehicles = signal<Vehicule[]>([]);
  readonly lastVehicleSaveDate = signal<SaveDate | null>(null);
  readonly rhWeeklyTasks = signal<ChecklistTask[]>([]);
  readonly rhMonthlyTasks = signal<ChecklistTask[]>([]);

  readonly editingItemIds = new Set<string>();

  private unsubscribers: (() => void)[] = [];
  private initCount = 0;

  readonly storageDeltaTime = computed(() => {
    const delta: Record<string, number> = {};
    for (const storage of this.storages()) {
      const key = storage.id;
      if (!key) continue;
      const sd = this.saveDates()[key];
      if (!sd) {
        delta[key] = 9999;
      } else {
        delta[key] = (Date.now() - new Date(sd.date).getTime()) / (1000 * 60 * 60);
      }
    }
    return delta;
  });

  readonly storagesOutdated = computed(() => {
    let amount = 0;
    for (const storage of this.storages()) {
      const key = storage.id;
      if (!key) continue;
      if (this.storageDeltaTime()[key] >= 12) {
        amount++;
      }
    }
    return amount;
  });

  readonly garageNotif = computed(() => {
    const lastSave = this.lastVehicleSaveDate();
    if (!lastSave) return Infinity;
    const deltaTime = Math.floor((Date.now() - lastSave.date) / (1000 * 60 * 60));
    let count = 0;
    if (deltaTime >= 24) count++;

    for (const vehicle of this.vehicles()) {
      if (vehicle.where === 'dead') continue;
      if (vehicle.insurance) {
        count++;
      } else if (
        vehicle.underGuard &&
        vehicle.recupDate !== null &&
        vehicle.recupDate < Date.now()
      ) {
        count++;
      } else if (vehicle.needRepair) {
        count++;
      } else if (
        !vehicle.underGuard &&
        !vehicle.hideAlert &&
        (vehicle.lastRepairDate ?? 0) < Date.now() - 24 * 60 * 60 * 1000
      ) {
        count++;
      }
    }
    return count;
  });

  readonly rhNotif = computed(() => {
    let count = 0;
    for (const task of this.rhWeeklyTasks()) {
      if (!task.doneAt) {
        count++;
      } else {
        const diffDays = Math.ceil(Math.abs(Date.now() - task.doneAt) / (1000 * 60 * 60 * 24));
        if (diffDays > 7) count++;
      }
    }
    for (const task of this.rhMonthlyTasks()) {
      if (!task.doneAt) {
        count++;
      } else {
        const diffDays = Math.ceil(Math.abs(Date.now() - task.doneAt) / (1000 * 60 * 60 * 24));
        if (diffDays > 30) count++;
      }
    }
    return count;
  });

  readonly alerts = computed(() => {
    const perms = this.authService.profile()?.permissions ?? [];
    const alertMap: Record<
      string,
      {
        company: Entreprise;
        items: { item: Stock; orderNeeded: number; alertLevel: number }[];
        maxAlertLevel: number;
        totalAlertLevel: number;
        totalItemCount: number;
        totalWeight: number;
      }
    > = {};

    for (const comp of this.companies()) {
      alertMap[comp.id] = {
        company: comp,
        items: [],
        maxAlertLevel: 0,
        totalAlertLevel: 0,
        totalItemCount: 0,
        totalWeight: 0,
      };
    }

    for (const item of this.items()) {
      let threshold = 10;
      if (item.wanted <= 10) threshold = 1;
      if (item.amount <= 50) threshold = 5;

      if (
        item.wanted > 0 &&
        item.amount < item.wanted &&
        (!item.isSecure || perms.some((p) => ['dev', 'admin', 'security'].includes(p)))
      ) {
        let alertLevel = 0;
        if (item.amount <= item.wanted * 0.25) {
          alertLevel = 2;
        } else if (item.amount <= item.wanted * 0.5) {
          alertLevel = 1;
        }

        const orderNeeded = Math.ceil((item.wanted - item.amount) / threshold) * threshold;
        if (orderNeeded > 0 && alertMap[item.seller]) {
          alertMap[item.seller].items.push({ item, orderNeeded, alertLevel });
          alertMap[item.seller].maxAlertLevel = Math.max(
            alertMap[item.seller].maxAlertLevel,
            alertLevel,
          );
          alertMap[item.seller].totalAlertLevel += alertLevel;
          alertMap[item.seller].totalItemCount += orderNeeded;
          alertMap[item.seller].totalWeight += orderNeeded * item.weight;
        }
      }
    }

    return Object.values(alertMap)
      .filter((c) => c.maxAlertLevel > 0)
      .sort((a, b) =>
        b.maxAlertLevel === a.maxAlertLevel
          ? b.totalWeight - a.totalWeight
          : b.maxAlertLevel - a.maxAlertLevel,
      );
  });

  init(): void {
    this.initCount++;
    if (this.initCount > 1) return;

    // Profiles en attente
    const qWaiting = query(collection(db, 'profiles'), where('activated', '==', false));
    this.unsubscribers.push(
      onSnapshot(qWaiting, (snap) => {
        const users = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Profile)
          .filter((u) => !u.rejected);
        this.zone.run(() => this.waitingUsers.set(users));
      }),
    );

    // Notes de frais en attente
    this.unsubscribers.push(
      onSnapshot(collection(db, 'expenseNotes'), (snap) => {
        const notes = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ExpenseNote)
          .filter((n) => !n.isPaid && !n.isRefused);
        this.zone.run(() => this.waitingExpenseNotes.set(notes));
      }),
    );

    // Candidatures en attente
    this.unsubscribers.push(
      onSnapshot(collection(db, 'candidatures'), (snap) => {
        const cands = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Candidature)
          .filter((c) => c.status === 'Candidature reçue');
        this.zone.run(() => this.waitingCandidatures.set(cands));
      }),
    );

    // SaveDates
    this.unsubscribers.push(
      onSnapshot(collection(db, 'savedates'), (snap) => {
        const map: Record<string, SaveDate> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() } as SaveDate;
        });
        this.zone.run(() => this.saveDates.set(map));
      }),
    );

    // SaveDate véhicules
    this.unsubscribers.push(
      onSnapshot(doc(db, 'savedates', 'repa_flotte'), (snap) => {
        if (snap.exists()) {
          this.zone.run(() =>
            this.lastVehicleSaveDate.set({ id: snap.id, ...snap.data() } as SaveDate),
          );
        }
      }),
    );

    // Véhicules
    this.unsubscribers.push(
      onSnapshot(collection(db, 'vehicles'), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Vehicule)
          .filter((v) => v.where !== 'dead')
          .sort((a, b) => a.name.localeCompare(b.name));
        this.zone.run(() => this.vehicles.set(list));
      }),
    );

    // Stockages
    this.unsubscribers.push(
      onSnapshot(collection(db, 'storages'), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Stockage)
          .sort((a, b) => a.name.localeCompare(b.name));
        this.zone.run(() => this.storages.set(list));
      }),
    );

    // Entreprises
    this.unsubscribers.push(
      onSnapshot(collection(db, 'companies'), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Entreprise)
          .sort((a, b) => a.name.localeCompare(b.name));
        this.zone.run(() => this.companies.set(list));
      }),
    );

    // Items
    this.unsubscribers.push(
      onSnapshot(collection(db, 'items'), (snap) => {
        const newItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Stock);
        const currentItems = this.items();
        const existingMap = new Map(currentItems.map((i) => [i.id, i]));

        const merged: Stock[] = [];
        for (const item of newItems) {
          const existing = existingMap.get(item.id);
          if (existing && this.editingItemIds.has(item.id)) {
            merged.push({ ...item, amount: existing.amount });
          } else {
            merged.push(item);
          }
        }
        merged.sort((a, b) => a.id.localeCompare(b.id));
        this.zone.run(() => this.items.set(merged));
      }),
    );

    // Commandes
    this.unsubscribers.push(
      onSnapshot(collection(db, 'orders'), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
        this.zone.run(() => this.orders.set(list));
      }),
    );

    // SharedChecklist weekly
    this.unsubscribers.push(
      onSnapshot(doc(db, 'settings', 'weekly_rh'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          this.zone.run(() => this.rhWeeklyTasks.set((data['tasks'] as ChecklistTask[]) ?? []));
        }
      }),
    );

    // SharedChecklist monthly
    this.unsubscribers.push(
      onSnapshot(doc(db, 'settings', 'monthly_rh'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          this.zone.run(() => this.rhMonthlyTasks.set((data['tasks'] as ChecklistTask[]) ?? []));
        }
      }),
    );
  }

  stop(): void {
    this.initCount--;
    if (this.initCount > 0) return;
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this.initCount = 0;
  }
}
