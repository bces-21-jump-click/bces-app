<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import { useLogger } from '@/composables/useLogger'
import { useNotifManager } from '@/composables/useNotifManager'
import type { Order, OrderHistory } from '@/models/order'
import type { Stock, Entreprise } from '@/models/effectif'
import Swal from 'sweetalert2'

const userStore = useUserStore()
const logger = useLogger()
const notif = useNotifManager()
const ordersApi = useCollection<Order>('orders')
const historiesApi = useCollection<OrderHistory>('histories')

const onglet = ref<'orders' | 'alert' | 'history'>('orders')
const orders = ref<Order[]>([])
const histories = ref<OrderHistory[]>([])
const unsubs: (() => void)[] = []

// Price dialog
const dialogPrice = ref(false)
const priceOrder = ref<Order | null>(null)
const priceValue = ref<number | null>(null)

// Edit dialog
const dialogEdit = ref(false)
const editOrder = ref<{
  company: string
  items: { id: string; amount: number }[]
  destroy: number
  weight: number
  originalId: string
} | null>(null)

// Alert order creation
const dialogCreationMode = ref(false)
const dialogOrder = ref(false)
const orderData = ref<{
  company: Entreprise
  items: { item: Stock; orderNeeded: number; alertLevel: number }[]
  destroy: number
} | null>(null)

const companies = computed(() => notif.companies.value)
const items = computed(() => notif.items.value)
const storages = computed(() => notif.storages.value)
const alerts = computed(() => notif.alerts.value)

const perms = computed(() => userStore.profile?.permissions ?? [])
const canViewHistory = computed(() =>
  perms.value.some((p) => ['dev', 'admin', 'stock'].includes(p)),
)

const companyOrders = computed(() => orders.value.map((o) => o.company))

const statusOptions = [
  { label: 'A faire', value: 'A faire', color: 'danger' },
  { label: 'Message envoyé', value: 'Message envoyé', color: 'info' },
  { label: 'A relancer', value: 'A relancer', color: 'warning' },
  { label: 'Attente de réception', value: 'Attente de réception', color: 'success' },
]

const editWeight = computed(() => {
  const e = editOrder.value
  if (!e) return 0
  return e.items.reduce((t, oi) => {
    const info = items.value.find((i) => i.id === oi.id)
    return t + (info ? info.weight * oi.amount : 0)
  }, 0)
})

const orderWeight = computed(() => {
  const od = orderData.value
  if (!od) return 0
  return od.items.reduce((t, i) => t + i.orderNeeded * i.item.weight, 0)
})

const monthGrouped = computed(() => {
  const grouped: Record<
    string,
    { month: string; year: number; totalPaid: number; histories: OrderHistory[] }
  > = {}
  for (const h of histories.value) {
    if (!h.payDate) continue
    const d = new Date(h.payDate)
    const key = `${d.getMonth() + 1}-${d.getFullYear()}`
    if (!grouped[key]) {
      grouped[key] = {
        month: d.toLocaleString('default', { month: 'long' }),
        year: d.getFullYear(),
        totalPaid: 0,
        histories: [],
      }
    }
    grouped[key].histories.push(h)
    grouped[key].totalPaid += h.price
  }
  return grouped
})
const monthKeys = computed(() => Object.keys(monthGrouped.value))

function getCompanyName(id: string | null): string {
  const c = companies.value.find((co) => co.id === id)
  return c ? `${c.icon} ${c.name}` : ''
}
function getItemInfo(id: string): Stock | undefined {
  return items.value.find((i) => i.id === id)
}
function formatMoney(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(value)
    .replace('€', '$')
    .replace(',00', '')
}
function formatDate(ts: number): string {
  const d = new Date(ts)
  return (
    d.toLocaleDateString('fr-FR') +
    ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  )
}
function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    'A faire': 'danger',
    'Message envoyé': 'info',
    'A relancer': 'warning',
    'Attente de réception': 'success',
  }
  return map[status] ?? 'danger'
}

async function updateStatus(order: Order, newStatus: string): Promise<void> {
  if (!order.id) return
  await ordersApi.modifier(order.id, { status: newStatus, updatedAt: Date.now() })
}

function openPriceDialog(order: Order): void {
  priceOrder.value = order
  priceValue.value = order.price
  dialogPrice.value = true
}
async function savePriceDialog(): Promise<void> {
  const order = priceOrder.value
  const val = priceValue.value
  if (order?.id && val !== null && val >= 0) {
    await ordersApi.modifier(order.id, { price: val })
  }
  dialogPrice.value = false
}

function openEditOrder(order: Order): void {
  const sellerItems = items.value
    .filter((i) => i.seller === order.company)
    .sort((a, b) => a.name.localeCompare(b.name))
  const editItems = sellerItems.map((it) => ({
    id: it.id,
    amount: order.items.find((oi) => oi.id === it.id)?.amount ?? 0,
  }))
  editOrder.value = {
    company: order.company!,
    items: editItems,
    destroy: order.destroy,
    weight: order.weight,
    originalId: order.id!,
  }
  dialogEdit.value = true
}
async function saveEditOrder(): Promise<void> {
  const e = editOrder.value
  if (!e) return
  const weight = e.items.reduce((t, oi) => {
    const info = items.value.find((i) => i.id === oi.id)
    return t + (info ? info.weight * oi.amount : 0)
  }, 0)
  const companyInfo = companies.value.find((c) => c.id === e.company)
  await ordersApi.modifier(e.originalId, {
    items: e.items.filter((i) => i.amount > 0),
    destroy: e.destroy,
    weight,
    updatedAt: Date.now(),
  })
  logger.log(
    userStore.profile?.id ?? '',
    'COMMANDES',
    `Modification d'une commande chez ${companyInfo?.icon}${companyInfo?.name} (${Math.round(weight * 100) / 100} kg)`,
  )
  dialogEdit.value = false
}

async function copyMessage(order: Order): Promise<void> {
  const company = companies.value.find((c) => c.id === order.company)
  let msg = `Commande - ${company?.icon} ${company?.name} :\n\n`
  for (const oi of order.items) {
    if (oi.amount > 0) {
      const info = getItemInfo(oi.id)
      if (info) msg += `${info.icon} ${info.name} - ${oi.amount}\n`
    }
  }
  if (order.destroy > 0) msg += `\n🗑️ Destruction - ${order.destroy}\n`
  msg += `\n(${Math.round(order.weight * 100) / 100} kg)`
  await navigator.clipboard.writeText(msg)
}

async function payOrder(order: Order): Promise<void> {
  let price = order.price ?? 0
  if (price <= 0) {
    const { value, isConfirmed } = await Swal.fire({
      title: 'Montant total de la commande ($)',
      input: 'number',
      inputPlaceholder: 'Montant',
      showCancelButton: true,
      confirmButtonText: 'Valider',
      cancelButtonText: 'Annuler',
    })
    if (!isConfirmed || !value) return
    price = parseFloat(value)
    if (isNaN(price) || price < 0) return
  }
  const history: Omit<OrderHistory, 'id'> = {
    company: order.company,
    items: order.items,
    weight: order.weight,
    destroy: order.destroy,
    price,
    payDate: Date.now(),
    date: null,
  }
  for (const oi of order.items) {
    const currentItem = items.value.find((i) => i.id === oi.id)
    if (currentItem && !currentItem.isInstantiated) {
      const itemsApi = useCollection<Stock>('items')
      await itemsApi.modifier(currentItem.id, { amount: currentItem.amount + oi.amount })
    }
  }
  await historiesApi.creer(history as unknown as Record<string, unknown>)
  const company = companies.value.find((c) => c.id === order.company)
  logger.log(
    userStore.profile?.id ?? '',
    'COMMANDES',
    `Validation d'une commande chez ${company?.icon}${company?.name} (${Math.round(order.weight * 100) / 100} kg) pour ${price}$`,
  )
  await ordersApi.supprimer(order.id!)
}

async function deleteOrder(order: Order): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: 'Annuler cette commande ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Non',
  })
  if (!isConfirmed) return
  const company = companies.value.find((c) => c.id === order.company)
  logger.log(
    userStore.profile?.id ?? '',
    'COMMANDES',
    `Annulation d'une commande chez ${company?.icon}${company?.name} (${Math.round(order.weight * 100) / 100} kg)`,
  )
  await ordersApi.supprimer(order.id!)
}

function openOrderCreation(company: Entreprise): void {
  orderData.value = { company, items: [], destroy: 0 }
  dialogCreationMode.value = true
}

function openOrderDialog(mode: number | null): void {
  const od = orderData.value
  if (!od) return
  const alert = alerts.value.find((a) => a.company.id === od.company.id)
  if (!alert) return

  let resultItems: { item: Stock; orderNeeded: number; alertLevel: number }[]
  if (mode === null || mode === 0 || (alert && mode! > alert.totalWeight)) {
    resultItems =
      mode === 0
        ? alert.items.map((ai) => ({ ...ai, orderNeeded: 0 }))
        : alert.items.map((ai) => ({ ...ai }))
  } else {
    const maxW = mode!
    const ratio = maxW / alert.totalWeight
    resultItems = []
    let currentW = 0
    const sorted = [...alert.items].sort((a, b) =>
      b.alertLevel !== a.alertLevel ? b.alertLevel - a.alertLevel : b.orderNeeded - a.orderNeeded,
    )
    for (const ai of sorted) {
      let threshold = 10
      if (ai.orderNeeded <= 10) threshold = 1
      if (ai.orderNeeded <= 50) threshold = 5
      const amount = Math.floor((ai.orderNeeded * ratio) / threshold) * threshold
      if (amount > 0) {
        resultItems.push({ ...ai, orderNeeded: amount })
        currentW += amount * ai.item.weight
      }
    }
    let noSolution = false
    while (!noSolution) {
      noSolution = true
      for (const ai of sorted) {
        const cur = resultItems.find((r) => r.item.id === ai.item.id)
        if (!cur) continue
        let threshold = 10
        if (ai.orderNeeded <= 10) threshold = 1
        if (ai.orderNeeded <= 50) threshold = 5
        if (
          cur.orderNeeded + threshold <= ai.orderNeeded &&
          currentW + threshold * ai.item.weight <= maxW
        ) {
          cur.orderNeeded += threshold
          currentW += threshold * ai.item.weight
          noSolution = false
        }
      }
    }
  }
  const sellerItems = items.value.filter((i) => i.seller === od.company.id)
  for (const si of sellerItems) {
    if (!resultItems.some((r) => r.item.id === si.id)) {
      resultItems.push({ item: si, orderNeeded: 0, alertLevel: 0 })
    }
  }
  od.items = resultItems
  if (od.company.canDestroy && mode !== 0) od.destroy = 0
  orderData.value = { ...od }
  dialogCreationMode.value = false
  dialogOrder.value = true
}

async function saveOrder(): Promise<void> {
  const od = orderData.value
  if (!od) return
  const orderItems = od.items
    .filter((i) => i.orderNeeded > 0)
    .map((i) => ({ id: i.item.id, amount: i.orderNeeded }))
  const weight = od.items.reduce((t, i) => t + i.orderNeeded * i.item.weight, 0)
  await ordersApi.creer({
    company: od.company.id,
    items: orderItems,
    weight,
    destroy: od.destroy,
    status: 'A faire',
    price: null,
    date: Date.now(),
    updatedAt: Date.now(),
  })
  logger.log(
    userStore.profile?.id ?? '',
    'COMMANDES',
    `Création d'une commande chez ${od.company.icon}${od.company.name} (${Math.round(weight * 100) / 100} kg)`,
  )
  dialogOrder.value = false
}

async function deleteHistory(h: OrderHistory): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: 'Supprimer cet historique ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Non',
  })
  if (!isConfirmed || !h.id) return
  const company = companies.value.find((c) => c.id === h.company)
  logger.log(
    userStore.profile?.id ?? '',
    'COMMANDES',
    `Suppression de l'historique d'une commande du ${new Date(h.payDate!).toLocaleDateString()} chez ${company?.icon}${company?.name}`,
  )
  await historiesApi.supprimer(h.id)
}

onMounted(() => {
  unsubs.push(
    ordersApi.ecouter((o) => {
      orders.value = o
    }),
  )
  unsubs.push(
    historiesApi.ecouter((h) => {
      h.sort((a, b) => (b.payDate ?? 0) - (a.payDate ?? 0))
      histories.value = h
    }),
  )
})
onUnmounted(() => {
  unsubs.forEach((u) => u())
})
</script>

<template>
  <div class="commandes-page">
    <!-- Hero -->
    <div class="page-header commandes-hero">
      <div class="commandes-hero__copy">
        <span class="commandes-kicker">BCES Supply Orders</span>
        <h1>Commandes</h1>
        <p>Suivi des commandes fournisseurs, préparation des besoins et historique des achats.</p>
      </div>
      <div class="commandes-hero__stats">
        <article class="commandes-stat-card">
          <span class="commandes-stat-card__label">Commandes en cours</span>
          <strong class="commandes-stat-card__value">{{ orders.length }}</strong>
        </article>
        <article class="commandes-stat-card commandes-stat-card--warn">
          <span class="commandes-stat-card__label">Préparations</span>
          <strong class="commandes-stat-card__value">{{ alerts.length }}</strong>
        </article>
        <article class="commandes-stat-card commandes-stat-card--accent">
          <span class="commandes-stat-card__label">Fournisseurs actifs</span>
          <strong class="commandes-stat-card__value">{{ companyOrders.length }}</strong>
        </article>
        <article class="commandes-stat-card commandes-stat-card--soft">
          <span class="commandes-stat-card__label">Historique</span>
          <strong class="commandes-stat-card__value">{{ histories.length }}</strong>
        </article>
      </div>
    </div>

    <section class="commandes-shell">
      <!-- Tabs -->
      <div class="tabs commandes-tabs">
        <button :class="{ active: onglet === 'orders' }" @click="onglet = 'orders'">
          En cours
          <span v-if="orders.length" class="tab-badge">{{ orders.length }}</span>
        </button>
        <button :class="{ active: onglet === 'alert' }" @click="onglet = 'alert'">
          Préparation
          <span v-if="alerts.length" class="tab-badge">{{ alerts.length }}</span>
        </button>
        <button
          v-if="canViewHistory"
          :class="{ active: onglet === 'history' }"
          @click="onglet = 'history'"
        >
          Historique
        </button>
      </div>

      <!-- ===== ORDERS TAB ===== -->
      <div v-if="onglet === 'orders'" class="orders-list commandes-panel">
        <template v-if="orders.length">
          <div
            v-for="(order, idx) in orders"
            :key="order.id ?? idx"
            class="order-card"
            :class="'border-' + getStatusColor(order.status)"
          >
            <div class="order-header">
              <select
                class="status-select"
                :value="order.status"
                @change="updateStatus(order, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <span class="order-company">{{ getCompanyName(order.company) }}</span>
              <div class="order-actions">
                <button
                  class="btn-icon"
                  @click="copyMessage(order)"
                  title="Copier"
                  aria-label="Copier"
                >
                  <i class="fa-solid fa-clipboard" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon"
                  @click="openEditOrder(order)"
                  title="Modifier"
                  aria-label="Modifier"
                >
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon"
                  @click="openPriceDialog(order)"
                  title="Prix"
                  aria-label="Prix"
                >
                  <i class="fa-solid fa-dollar-sign" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon danger"
                  @click="deleteOrder(order)"
                  title="Annuler"
                  aria-label="Annuler"
                >
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
                <button class="btn accent" @click="payOrder(order)">
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                  Valider
                </button>
              </div>
            </div>
            <div class="order-summary">
              <span>{{ order.items.length }} article(s)</span>
              <span
                ><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
                {{ order.weight.toFixed(2) }} kg</span
              >
              <span>
                <i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i>
                <template v-if="order.price !== null">{{ order.price }} $</template>
                <em v-else>Inconnue</em>
              </span>
              <span v-if="order.updatedAt">
                <i class="fa-solid fa-clock" aria-hidden="true"></i>
                {{ formatDate(order.updatedAt) }}
              </span>
            </div>
            <details class="order-details">
              <summary>Détails</summary>
              <div class="order-items">
                <template v-for="oi in order.items" :key="oi.id">
                  <div v-if="oi.amount > 0 && getItemInfo(oi.id)" class="order-item-row">
                    <span>{{ getItemInfo(oi.id)?.icon }} {{ getItemInfo(oi.id)?.name }}</span>
                    <span>× {{ oi.amount }}</span>
                  </div>
                </template>
                <div v-if="order.destroy > 0" class="order-item-row text-danger">
                  <span><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Destruction</span>
                  <span>× {{ order.destroy }}</span>
                </div>
              </div>
            </details>
          </div>
        </template>
        <p v-else class="empty">Aucune commande en cours</p>
      </div>

      <!-- ===== ALERT TAB ===== -->
      <div v-if="onglet === 'alert'" class="alerts-list commandes-panel">
        <template v-if="alerts.length">
          <template v-for="alert in alerts" :key="alert.company.id">
            <div
              v-if="!alert.company.isGarage"
              class="alert-card"
              :class="
                alert.maxAlertLevel >= 2
                  ? 'alert-critical'
                  : alert.maxAlertLevel >= 1
                    ? 'alert-warning'
                    : 'alert-ok'
              "
            >
              <div class="alert-header">
                <span
                  >{{ alert.company.icon }} {{ alert.company.name }} :
                  {{ alert.totalItemCount }} item(s) ({{ alert.totalWeight.toFixed(2) }} kg)</span
                >
                <button
                  v-if="!companyOrders.includes(alert.company.id)"
                  class="btn accent"
                  @click="openOrderCreation(alert.company)"
                >
                  <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
                  Commander
                </button>
                <span v-else class="chip">Commande en cours</span>
              </div>
              <div class="alert-items">
                <div
                  v-for="ai in alert.items"
                  :key="ai.item.id"
                  :class="
                    ai.alertLevel >= 2 ? 'text-danger' : ai.alertLevel >= 1 ? 'text-warning' : ''
                  "
                >
                  {{ ai.item.icon }} {{ ai.item.name }} - {{ ai.orderNeeded }} ({{
                    ai.item.amount
                  }}/{{ ai.item.wanted }})
                </div>
              </div>
            </div>
          </template>
        </template>
        <p v-else class="empty">Aucune alerte</p>
      </div>

      <!-- ===== HISTORY TAB ===== -->
      <div v-if="onglet === 'history'" class="history-list commandes-panel">
        <template v-if="monthKeys.length">
          <details
            v-for="[key, group] in Object.entries(monthGrouped)"
            :key="key"
            class="month-panel"
            open
          >
            <summary class="month-title">
              {{ group.month }} {{ group.year }} ({{ group.histories.length }} commande(s) :
              {{ formatMoney(group.totalPaid) }})
            </summary>
            <details v-for="(h, hIdx) in group.histories" :key="h.id ?? hIdx" class="history-entry">
              <summary class="history-header">
                Le {{ formatDate(h.payDate ?? 0) }} | {{ getCompanyName(h.company) }} | ({{
                  h.weight
                }}
                kg - {{ formatMoney(h.price) }})
                <button
                  v-if="canViewHistory"
                  class="btn-icon danger"
                  @click.stop="deleteHistory(h)"
                  aria-label="Supprimer historique"
                >
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </summary>
              <div class="history-items">
                <template v-for="hi in h.items" :key="hi.id">
                  <div v-if="hi.amount > 0 && getItemInfo(hi.id)">
                    {{ getItemInfo(hi.id)?.icon }} {{ getItemInfo(hi.id)?.name }} - {{ hi.amount }}
                  </div>
                </template>
                <div v-if="h.destroy > 0" class="text-danger">
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Destruction -
                  {{ h.destroy }}
                </div>
              </div>
            </details>
          </details>
        </template>
        <p v-else class="empty">Aucun historique</p>
      </div>
    </section>

    <!-- Dialogs -->
    <Teleport to="body">
      <!-- Price dialog -->
      <div v-if="dialogPrice" class="overlay" @click="dialogPrice = false">
        <div class="dialog dialog-sm" @click.stop>
          <h3 class="dialog-title">Modifier le prix</h3>
          <input type="number" class="field" placeholder="Prix ($)" v-model.number="priceValue" />
          <div class="dialog-actions">
            <button class="btn accent" @click="savePriceDialog()">Valider</button>
            <button class="btn danger" @click="dialogPrice = false">Annuler</button>
          </div>
        </div>
      </div>

      <!-- Edit dialog -->
      <div v-if="dialogEdit && editOrder" class="overlay" @click="dialogEdit = false">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">Modifier la commande ({{ editWeight.toFixed(2) }} kg)</h3>
          <table class="data-table">
            <tbody>
              <template v-for="oi in editOrder.items" :key="oi.id">
                <tr v-if="getItemInfo(oi.id)">
                  <td>
                    {{ getItemInfo(oi.id)?.icon }} {{ getItemInfo(oi.id)?.name }} ({{
                      Math.max(
                        (getItemInfo(oi.id)?.wanted ?? 0) - (getItemInfo(oi.id)?.amount ?? 0),
                        0,
                      )
                    }})
                  </td>
                  <td style="width: 100px">
                    <input type="number" class="inline-input" v-model.number="oi.amount" />
                  </td>
                  <td>{{ (oi.amount * (getItemInfo(oi.id)?.weight ?? 0)).toFixed(2) }} kg</td>
                </tr>
              </template>
            </tbody>
          </table>
          <div class="dialog-actions">
            <button class="btn accent" @click="saveEditOrder()">Valider</button>
            <button class="btn danger" @click="dialogEdit = false">Annuler</button>
          </div>
        </div>
      </div>

      <!-- Order creation mode dialog -->
      <div v-if="dialogCreationMode" class="overlay" @click="dialogCreationMode = false">
        <div class="dialog dialog-sm" @click.stop>
          <h3 class="dialog-title">Mode de commande</h3>
          <div class="mode-buttons">
            <button class="btn" @click="openOrderDialog(0)">Vide</button>
            <button class="btn" @click="openOrderDialog(200)">200 Kg max</button>
            <button class="btn" @click="openOrderDialog(600)">600 Kg max</button>
            <button class="btn" @click="openOrderDialog(null)">Illimité</button>
          </div>
        </div>
      </div>

      <!-- Order dialog -->
      <div v-if="dialogOrder && orderData" class="overlay" @click="dialogOrder = false">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">Commande ({{ orderWeight.toFixed(2) }} kg)</h3>
          <table class="data-table">
            <tbody>
              <tr v-for="ai in orderData.items" :key="ai.item.id">
                <td>
                  {{ ai.item.icon }} {{ ai.item.name }} ({{
                    Math.max(ai.item.wanted - ai.item.amount, 0)
                  }})
                </td>
                <td style="width: 100px">
                  <input type="number" class="inline-input" v-model.number="ai.orderNeeded" />
                </td>
                <td>{{ (ai.orderNeeded * ai.item.weight).toFixed(2) }} kg</td>
              </tr>
            </tbody>
          </table>
          <div class="dialog-actions">
            <button class="btn accent" @click="saveOrder()">Valider</button>
            <button class="btn danger" @click="dialogOrder = false">Annuler</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.commandes-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  animation: fadeIn 0.28s ease;
}

/* ── Hero ── */
.commandes-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.95fr);
  gap: 1rem;
  padding: 1.15rem 1.2rem;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 58%, transparent 42%);
  background:
    radial-gradient(circle at top right, rgba(68, 160, 255, 0.18), transparent 30%),
    linear-gradient(135deg, #0f2031, #13293d 52%, #173956);
  box-shadow:
    0 18px 34px rgba(5, 13, 23, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.commandes-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.26rem 0.62rem;
  border-radius: 999px;
  border: 1px solid rgba(116, 177, 227, 0.26);
  background: rgba(255, 255, 255, 0.05);
  color: #d4edff;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.commandes-hero__copy {
  h1 {
    margin: 0.1rem 0 0.35rem;
    color: #f4f9ff;
    font-size: 1.72rem;
    font-weight: 900;
    letter-spacing: -0.03em;
  }
  p {
    margin: 0;
    max-width: 56ch;
    color: #a9c7e2;
    font-size: 0.92rem;
    line-height: 1.5;
  }
}

.commandes-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.commandes-stat-card {
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  border: 1px solid rgba(116, 177, 227, 0.15);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);

  &__label {
    display: block;
    color: #9fbad4;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  &__value {
    display: block;
    margin-top: 0.25rem;
    color: #ffffff;
    font-size: 1.36rem;
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  &--warn .commandes-stat-card__value {
    color: #ffbe7a;
  }
  &--accent .commandes-stat-card__value {
    color: #86dcff;
  }
  &--soft .commandes-stat-card__value {
    color: #f3d2ff;
  }
}

/* ── Shell ── */
.commandes-shell {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.commandes-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* ── Tabs ── */
.tabs.commandes-tabs {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: fit-content;
  padding: 0.25rem;
  border-radius: 14px;
  border: 1px solid var(--dispatch-zone-border);
  background: color-mix(in srgb, var(--surface-elevated) 88%, #08121e 12%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);

  button {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.84rem;
    font-weight: 800;
    padding: 0.48rem 0.88rem;
    cursor: pointer;
    border-radius: 11px;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition:
      background 0.16s ease,
      color 0.16s ease,
      transform 0.16s ease;

    &:hover {
      color: var(--text-primary);
      background: color-mix(in srgb, var(--surface-hover) 82%, transparent 18%);
    }

    &.active {
      color: #ffffff;
      background: linear-gradient(135deg, #1b6ec2, #2f8de2);
      box-shadow: 0 10px 18px rgba(36, 119, 201, 0.26);
    }
  }
}

.tab-badge {
  background: linear-gradient(135deg, #d83d52, #b31f36);
  color: #fff;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  min-width: 1.2rem;
  text-align: center;
}

/* ── Panel wrapper ── */
.commandes-panel {
  padding: 0.9rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 52%, transparent 48%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 93%, transparent 7%),
    color-mix(in srgb, var(--surface) 92%, transparent 8%)
  );
  box-shadow: 0 10px 26px rgba(3, 9, 18, 0.18);
}

.orders-list,
.alerts-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

/* ── Order card ── */
.order-card {
  background: color-mix(in srgb, var(--surface-elevated) 94%, transparent 6%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 48%, transparent 52%);
  border-radius: 14px;
  padding: 0.78rem 0.9rem;
  border-left: 4px solid var(--card-border);

  &.border-danger {
    border-left-color: var(--danger);
  }
  &.border-info {
    border-left-color: var(--info, #2196f3);
  }
  &.border-warning {
    border-left-color: var(--warning);
  }
  &.border-success {
    border-left-color: var(--success);
  }
}

.order-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.status-select {
  background: color-mix(in srgb, var(--input-bg) 86%, transparent 14%);
  color: var(--text-primary);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  border-radius: 10px;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
  cursor: pointer;
}

.order-company {
  font-weight: 600;
  flex: 1;
}

.order-actions {
  display: flex;
  gap: 0.3rem;
  align-items: center;
}

.order-summary {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-top: 0.5rem;

  i {
    margin-right: 0.28rem;
  }
}

.order-details {
  margin-top: 0.5rem;

  summary {
    cursor: pointer;
    font-size: 0.82rem;
    color: var(--text-muted);
    font-weight: 700;
  }
}

.order-items {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: 0.3rem;
  font-size: 0.82rem;
}

.order-item-row {
  display: flex;
  justify-content: space-between;
  padding: 0.2rem 0.5rem;
}

/* ── Alert card ── */
.alert-card {
  background: color-mix(in srgb, var(--surface-elevated) 94%, transparent 6%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 48%, transparent 52%);
  border-radius: 14px;
  padding: 0.78rem 0.9rem;

  &.alert-critical {
    border-left: 4px solid var(--danger);
  }
  &.alert-warning {
    border-left: 4px solid var(--warning);
  }
  &.alert-ok {
    border-left: 4px solid var(--success);
  }
}

.alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-weight: 600;
  flex-wrap: wrap;
}

.alert-items {
  margin-top: 0.4rem;
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.alert-item-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.chip {
  display: inline-flex;
  background: color-mix(in srgb, var(--accent-subtle) 85%, transparent 15%);
  color: var(--accent-light);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}

/* ── History ── */
.month-panel {
  background: color-mix(in srgb, var(--surface-elevated) 94%, transparent 6%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 48%, transparent 52%);
  border-radius: 14px;
  overflow: hidden;
}

.month-title {
  padding: 0.75rem 1rem;
  font-weight: 800;
  cursor: pointer;
  font-size: 0.88rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
}

.history-entry {
  border-top: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
}

.history-header {
  padding: 0.62rem 1rem;
  font-size: 0.82rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.history-items {
  padding: 0.25rem 1.5rem 0.72rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* ── Dialogs ── */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 8, 16, 0.66);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: linear-gradient(180deg, #112235, #0e1b2d);
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 56%, transparent 44%);
  border-radius: 18px;
  padding: 1.25rem;
  min-width: 320px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.36);
}

.dialog-sm {
  max-width: 380px;
}

.dialog-title {
  font-size: 1.02rem;
  font-weight: 800;
  margin: 0 0 1rem;
  color: #f4f9ff;

  i {
    margin-right: 0.35rem;
  }
}

.dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

/* ── Common ── */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  span {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
}

.item-row {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
  align-items: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.48rem 0.86rem;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  background: color-mix(in srgb, var(--surface-elevated) 80%, var(--dispatch-zone-border) 20%);
  color: var(--text-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);

  &.accent {
    background: linear-gradient(135deg, #1976d2, #1e88e5);
    color: #fff;
  }
  &.danger {
    background: linear-gradient(135deg, #b32740, #d33f5a);
    color: #fff;
  }
}

.btn-icon {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  background: color-mix(in srgb, var(--surface-elevated) 86%, transparent 14%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.98rem;
  padding: 0;
  line-height: 1;

  &:hover {
    background: color-mix(in srgb, var(--surface-hover) 78%, transparent 22%);
  }

  &.danger {
    color: var(--danger);
  }

  i {
    display: block;
    line-height: 1;
    font-size: 0.9rem;
    text-align: center;
    vertical-align: middle;
  }
}

.field {
  width: 100%;
  padding: 0.52rem 0.68rem;
  background: color-mix(in srgb, var(--input-bg) 86%, transparent 14%);
  color: var(--text-primary);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  border-radius: 10px;
  font-size: 0.85rem;
}

.field-sm {
  width: 70px;
  flex-shrink: 0;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 2rem;
}

.inline-input {
  width: 100%;
  padding: 0.36rem 0.54rem;
  background: color-mix(in srgb, var(--input-bg) 86%, transparent 14%);
  color: var(--text-primary);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  border-radius: 10px;
  font-size: 0.82rem;
  text-align: center;
}

.mode-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.text-danger {
  color: var(--danger);
}
.text-warning {
  color: var(--warning);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .commandes-page {
    padding: 1rem;
  }
  .commandes-hero {
    grid-template-columns: 1fr;
  }
}
</style>
