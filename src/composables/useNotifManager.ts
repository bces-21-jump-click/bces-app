import { ref, computed } from 'vue'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/plugins/firebase'
import { useUserStore } from '@/stores/user'
import type { Profile } from '@/models/profile'
import type { ExpenseNote } from '@/models/expense-note'
import type { Candidature } from '@/models/candidature'
import type { SaveDate } from '@/models/save-date'
import type { Vehicule, Stock, Entreprise } from '@/models/effectif'
import type { Stockage } from '@/models/stockage'
import type { Order } from '@/models/order'
import type { ChecklistTask } from '@/models/shared-checklist'

const waitingUsers = ref<Profile[]>([])
const waitingExpenseNotes = ref<ExpenseNote[]>([])
const waitingCandidatures = ref<Candidature[]>([])
const companies = ref<Entreprise[]>([])
const items = ref<Stock[]>([])
const orders = ref<Order[]>([])
const storages = ref<Stockage[]>([])
const saveDates = ref<Record<string, SaveDate>>({})
const vehicles = ref<Vehicule[]>([])
const lastVehicleSaveDate = ref<SaveDate | null>(null)
const rhWeeklyTasks = ref<ChecklistTask[]>([])
const rhMonthlyTasks = ref<ChecklistTask[]>([])

const editingItemIds = new Set<string>()

let unsubscribers: (() => void)[] = []
let initCount = 0

const storageDeltaTime = computed(() => {
  const delta: Record<string, number> = {}
  for (const storage of storages.value) {
    const key = storage.id
    if (!key) continue
    const sd = saveDates.value[key]
    if (!sd) {
      delta[key] = 9999
    } else {
      delta[key] = (Date.now() - new Date(sd.date).getTime()) / (1000 * 60 * 60)
    }
  }
  return delta
})

const storagesOutdated = computed(() => {
  let amount = 0
  for (const storage of storages.value) {
    const key = storage.id
    if (!key) continue
    const dt = storageDeltaTime.value[key]
    if (dt !== undefined && dt >= 12) amount++
  }
  return amount
})

const garageNotif = computed(() => {
  const lastSave = lastVehicleSaveDate.value
  if (!lastSave) return 0
  const deltaTime = Math.floor((Date.now() - lastSave.date) / (1000 * 60 * 60))
  let count = 0
  if (deltaTime >= 24) count++

  for (const vehicle of vehicles.value) {
    if (vehicle.where === 'dead') continue
    if (vehicle.insurance) {
      count++
    } else if (vehicle.underGuard && vehicle.recupDate !== null && vehicle.recupDate < Date.now()) {
      count++
    } else if (vehicle.needRepair) {
      count++
    } else if (
      !vehicle.underGuard &&
      !vehicle.hideAlert &&
      (vehicle.lastRepairDate ?? 0) < Date.now() - 24 * 60 * 60 * 1000
    ) {
      count++
    }
  }
  return count
})

const rhNotif = computed(() => {
  let count = 0
  for (const task of rhWeeklyTasks.value) {
    if (!task.doneAt) {
      count++
    } else {
      const diffDays = Math.ceil(Math.abs(Date.now() - task.doneAt) / (1000 * 60 * 60 * 24))
      if (diffDays > 7) count++
    }
  }
  for (const task of rhMonthlyTasks.value) {
    if (!task.doneAt) {
      count++
    } else {
      const diffDays = Math.ceil(Math.abs(Date.now() - task.doneAt) / (1000 * 60 * 60 * 24))
      if (diffDays > 30) count++
    }
  }
  return count
})

const alerts = computed(() => {
  const userStore = useUserStore()
  const perms = userStore.profile?.permissions ?? []
  const alertMap: Record<
    string,
    {
      company: Entreprise
      items: { item: Stock; orderNeeded: number; alertLevel: number }[]
      maxAlertLevel: number
      totalAlertLevel: number
      totalItemCount: number
      totalWeight: number
    }
  > = {}

  for (const comp of companies.value) {
    alertMap[comp.id] = {
      company: comp,
      items: [],
      maxAlertLevel: 0,
      totalAlertLevel: 0,
      totalItemCount: 0,
      totalWeight: 0,
    }
  }

  for (const item of items.value) {
    let threshold = 10
    if (item.wanted <= 10) threshold = 1
    if (item.amount <= 50) threshold = 5

    if (
      item.wanted > 0 &&
      item.amount < item.wanted &&
      (!item.isSecure || perms.some((p: string) => ['dev', 'admin', 'security'].includes(p)))
    ) {
      let alertLevel = 0
      if (item.amount <= item.wanted * 0.25) {
        alertLevel = 2
      } else if (item.amount <= item.wanted * 0.5) {
        alertLevel = 1
      }

      const orderNeeded = Math.ceil((item.wanted - item.amount) / threshold) * threshold
      if (orderNeeded > 0 && alertMap[item.seller]) {
        const entry = alertMap[item.seller]!
        entry.items.push({ item, orderNeeded, alertLevel })
        entry.maxAlertLevel = Math.max(entry.maxAlertLevel, alertLevel)
        entry.totalAlertLevel += alertLevel
        entry.totalItemCount += orderNeeded
        entry.totalWeight += orderNeeded * item.weight
      }
    }
  }

  return Object.values(alertMap)
    .filter((c) => c.maxAlertLevel > 0)
    .sort((a, b) =>
      b.maxAlertLevel === a.maxAlertLevel
        ? b.totalWeight - a.totalWeight
        : b.maxAlertLevel - a.maxAlertLevel,
    )
})

function init(): void {
  initCount++
  if (initCount > 1) return

  const logErr = (name: string) => (err: Error) =>
    console.error(`[NotifManager] ${name}:`, err.message)

  const qWaiting = query(collection(db, 'profiles'), where('activated', '==', false))
  unsubscribers.push(
    onSnapshot(
      qWaiting,
      (snap) => {
        waitingUsers.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Profile)
          .filter((u) => !u.rejected)
      },
      logErr('profiles'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'expenseNotes'),
      (snap) => {
        waitingExpenseNotes.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ExpenseNote)
          .filter((n) => !n.isPaid && !n.isRefused)
      },
      logErr('expenseNotes'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'candidatures'),
      (snap) => {
        waitingCandidatures.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Candidature)
          .filter((c) => c.status === 'Candidature reçue')
      },
      logErr('candidatures'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'savedates'),
      (snap) => {
        const map: Record<string, SaveDate> = {}
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() } as SaveDate
        })
        saveDates.value = map
      },
      logErr('savedates'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      doc(db, 'savedates', 'repa_flotte'),
      (snap) => {
        if (snap.exists()) {
          lastVehicleSaveDate.value = { id: snap.id, ...snap.data() } as SaveDate
        }
      },
      logErr('savedates/repa_flotte'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'vehicles'),
      (snap) => {
        vehicles.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Vehicule)
          .filter((v) => v.where !== 'dead')
          .sort((a, b) => a.name.localeCompare(b.name))
      },
      logErr('vehicles'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'storages'),
      (snap) => {
        storages.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Stockage)
          .sort((a, b) => a.name.localeCompare(b.name))
      },
      logErr('storages'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'companies'),
      (snap) => {
        companies.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Entreprise)
          .sort((a, b) => a.name.localeCompare(b.name))
      },
      logErr('companies'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'items'),
      (snap) => {
        const newItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Stock)
        const currentItems = items.value
        const existingMap = new Map(currentItems.map((i) => [i.id, i]))

        const merged: Stock[] = []
        for (const item of newItems) {
          const existing = existingMap.get(item.id)
          if (existing && editingItemIds.has(item.id)) {
            merged.push({ ...item, amount: existing.amount })
          } else {
            merged.push(item)
          }
        }
        merged.sort((a, b) => a.id.localeCompare(b.id))
        items.value = merged
      },
      logErr('items'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        orders.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order)
      },
      logErr('orders'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      doc(db, 'settings', 'weekly_rh'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          rhWeeklyTasks.value = (data['tasks'] as ChecklistTask[]) ?? []
        }
      },
      logErr('settings/weekly_rh'),
    ),
  )

  unsubscribers.push(
    onSnapshot(
      doc(db, 'settings', 'monthly_rh'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          rhMonthlyTasks.value = (data['tasks'] as ChecklistTask[]) ?? []
        }
      },
      logErr('settings/monthly_rh'),
    ),
  )
}

function stop(): void {
  initCount--
  if (initCount > 0) return
  unsubscribers.forEach((unsub) => unsub())
  unsubscribers = []
  initCount = 0
}

export function useNotifManager() {
  return {
    waitingUsers,
    waitingExpenseNotes,
    waitingCandidatures,
    companies,
    items,
    orders,
    storages,
    saveDates,
    vehicles,
    lastVehicleSaveDate,
    rhWeeklyTasks,
    rhMonthlyTasks,
    editingItemIds,
    storageDeltaTime,
    storagesOutdated,
    garageNotif,
    rhNotif,
    alerts,
    init,
    stop,
  }
}
