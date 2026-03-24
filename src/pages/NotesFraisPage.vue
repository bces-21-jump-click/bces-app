<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import { useLogger } from '@/composables/useLogger'
import { useNotifManager } from '@/composables/useNotifManager'
import type { ExpenseNote } from '@/models/expense-note'
import type { OrderHistory } from '@/models/order'
import type { VehicleHistory } from '@/models/vehicle-history'
import type { Profile } from '@/models/profile'
import Swal from 'sweetalert2'

const userStore = useUserStore()
const logger = useLogger()
const { companies, vehicles } = useNotifManager()
const expenseNotesApi = useCollection<ExpenseNote>('expenseNotes')
const historiesApi = useCollection<OrderHistory>('histories')
const vehicleHistoriesApi = useCollection<VehicleHistory>('vehicleHistories')
const profilesApi = useCollection<Profile>('profiles')

const tab = ref<'my' | 'waiting' | 'history'>('my')
const myNotes = ref<ExpenseNote[]>([])
const allNotes = ref<ExpenseNote[]>([])
const histories = ref<OrderHistory[]>([])
const vehicleHistories = ref<VehicleHistory[]>([])
const profiles = ref<Profile[]>([])
const unsubs: (() => void)[] = []

// Create dialog
const dialogCreate = ref(false)

// New note form
const newNote = ref({
  reason: '',
  reasonType: 'buy' as 'buy' | 'vehicle' | 'other',
  amount: 0,
  description: '',
})

// Refuse dialog
const dialogRefuse = ref(false)
const refuseNote = ref<ExpenseNote | null>(null)
const refuseComment = ref('')

const reasonList = [
  { title: 'Achat de matériel', value: 'buy' as const },
  { title: 'Véhicule en fourrière', value: 'vehicle' as const },
  { title: 'Autre dépense', value: 'other' as const },
]

const perms = computed(() => userStore.profile?.permissions ?? [])
const canManage = computed(() => perms.value.some((p) => ['dev', 'admin', 'cash'].includes(p)))

const waitingNotes = computed(() =>
  allNotes.value
    .filter((n) => !n.isPaid && !n.isRefused)
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0)),
)
const historyNotes = computed(() =>
  allNotes.value
    .filter((n) => n.isPaid || n.isRefused)
    .sort((a, b) => (b.closeDate ?? 0) - (a.closeDate ?? 0)),
)

const monthGrouped = computed(() => {
  const grouped: Record<
    string,
    { month: string; year: number; totalPaid: number; notes: ExpenseNote[] }
  > = {}
  for (const note of historyNotes.value) {
    const d = new Date(note.closeDate ?? 0)
    const key = `${d.getMonth() + 1}-${d.getFullYear()}`
    if (!grouped[key]) {
      grouped[key] = {
        month: d.toLocaleString('fr-FR', { month: 'long' }),
        year: d.getFullYear(),
        totalPaid: 0,
        notes: [],
      }
    }
    grouped[key].notes.push(note)
    if (!note.isRefused) grouped[key].totalPaid += note.price
  }
  return grouped
})
const monthKeys = computed(() => Object.keys(monthGrouped.value))

const availableHistories = computed(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return histories.value.filter((h) => {
    if (!h.payDate || h.payDate < cutoff || !h.price) return false
    const co = companies.value.find((c) => c.id === h.company)
    return co?.canExpenseNote
  })
})

const availableVehicleHistories = computed(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return vehicleHistories.value.filter((vh) => {
    if (!vh.vehicle || vh.vehicle === 'all') return false
    if (!vh.date || vh.date < cutoff || !vh.price) return false
    const v = vehicles.value.find((vv) => vv.id === vh.vehicle)
    return v && vh.message.includes('Fourrière')
  })
})

function formatMoney(v: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(v)
    .replace('€', '$')
    .replace(',00', '')
}
function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR').slice(0, 16)
}
function getProfileName(userId: string | null): string {
  if (!userId) return '—'
  return profiles.value.find((p) => p.id === userId)?.name ?? userId
}
function reasonIcon(type: string): string {
  if (type === 'buy') return '🛒'
  if (type === 'vehicle') return '🚗'
  return '📋'
}
function getReasonLabel(reason: string): string {
  return reasonList.find((r) => r.value === reason)?.title ?? reason
}

function openCreate(): void {
  newNote.value = { reason: '', reasonType: 'buy', amount: 0, description: '' }
  dialogCreate.value = true
}
function openRefuse(note: ExpenseNote): void {
  openRefuseDialog(note)
}
function approveNote(note: ExpenseNote): Promise<void> {
  return payNote(note)
}
async function deleteNote(note: ExpenseNote): Promise<void> {
  if (!note.id) return
  const { isConfirmed } = await Swal.fire({
    title: 'Confirmer la suppression',
    text: 'Êtes-vous sûr de vouloir supprimer cette note de frais ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui, supprimer !',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  logger.log(
    userStore.profile?.id ?? '',
    'NOTES DE FRAIS',
    `Suppression d'une note de frais (${formatMoney(note.price)})`,
  )
  await expenseNotesApi.supprimer(note.id)
}
async function saveNote(): Promise<void> {
  const userId = userStore.profile?.id
  if (!userId) return
  const { reasonType, reason: reasonText, amount, description } = newNote.value
  const note: Omit<ExpenseNote, 'id'> = {
    user: userId,
    date: Date.now(),
    reason: reasonType,
    data: reasonText || description,
    price: amount,
    isPaid: false,
    isRefused: false,
    refusalComment: '',
    closeDate: null,
  }
  logger.log(userId, 'NOTES DE FRAIS', `Création d'une note de frais (${formatMoney(note.price)})`)
  await expenseNotesApi.creer(note as unknown as Record<string, unknown>)
  dialogCreate.value = false
  Swal.fire({
    icon: 'success',
    title: 'Note de frais envoyée !',
    showConfirmButton: false,
    timer: 1500,
  })
}

async function payNote(note: ExpenseNote): Promise<void> {
  if (!note.id) return
  const { isConfirmed } = await Swal.fire({
    title: 'Confirmer le paiement',
    text: 'Êtes-vous sûr de vouloir marquer cette note de frais comme payée ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui, payer !',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  const reasonLabel = reasonList.find((r) => r.value === note.reason)?.title ?? note.reason
  logger.log(
    userStore.profile?.id ?? '',
    'NOTES DE FRAIS',
    `Paiement d'une note de frais à ${getProfileName(note.user)} pour ${reasonLabel} (${formatMoney(note.price)})`,
  )
  await expenseNotesApi.modifier(note.id, { isPaid: true, closeDate: Date.now() })
}

function openRefuseDialog(note: ExpenseNote): void {
  refuseNote.value = note
  refuseComment.value = ''
  dialogRefuse.value = true
}

async function confirmRefuse(): Promise<void> {
  const note = refuseNote.value
  if (!note?.id) return
  const reasonLabel = reasonList.find((r) => r.value === note.reason)?.title ?? note.reason
  logger.log(
    userStore.profile?.id ?? '',
    'NOTES DE FRAIS',
    `Refus d'une note de frais à ${getProfileName(note.user)} pour ${reasonLabel} (${formatMoney(note.price)})`,
  )
  await expenseNotesApi.modifier(note.id, {
    isRefused: true,
    refusalComment: refuseComment.value,
    closeDate: Date.now(),
  })
  dialogRefuse.value = false
}

onMounted(() => {
  const userId = userStore.profile?.id
  if (userId) {
    unsubs.push(
      expenseNotesApi.ecouter((list) => {
        myNotes.value = list
          .filter((n) => n.user === userId)
          .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
      }),
    )
  }
  if (canManage.value) {
    unsubs.push(
      expenseNotesApi.ecouter((list) => {
        allNotes.value = list
      }),
    )
    unsubs.push(
      profilesApi.ecouter((list) => {
        profiles.value = list
      }),
    )
  }
  unsubs.push(
    historiesApi.ecouter((list) => {
      histories.value = list
    }),
  )
  unsubs.push(
    vehicleHistoriesApi.ecouter((list) => {
      vehicleHistories.value = list
    }),
  )
})
onUnmounted(() => {
  unsubs.forEach((fn) => fn())
})
</script>

<template>
  <div class="notes-frais-page">
    <!-- ══════ HERO ══════ -->
    <div class="page-header notes-frais-hero">
      <div class="notes-frais-hero__copy">
        <span class="notes-frais-kicker">BCES Expense Management</span>
        <h1>Notes de frais</h1>
        <p>Suivi des dépenses, validation des remboursements et historique des traitements.</p>
      </div>
      <div class="notes-frais-hero__stats">
        <article class="notes-frais-stat-card">
          <span class="notes-frais-stat-card__label">Mes notes</span>
          <strong class="notes-frais-stat-card__value">{{ myNotes.length }}</strong>
        </article>
        <article class="notes-frais-stat-card notes-frais-stat-card--warn">
          <span class="notes-frais-stat-card__label">En attente</span>
          <strong class="notes-frais-stat-card__value">{{ waitingNotes.length }}</strong>
        </article>
        <article class="notes-frais-stat-card notes-frais-stat-card--accent">
          <span class="notes-frais-stat-card__label">Approuvées</span>
          <strong class="notes-frais-stat-card__value">{{
            historyNotes.filter((n) => n.isPaid && !n.isRefused).length
          }}</strong>
        </article>
        <article class="notes-frais-stat-card notes-frais-stat-card--soft">
          <span class="notes-frais-stat-card__label">Refusées</span>
          <strong class="notes-frais-stat-card__value">{{
            historyNotes.filter((n) => n.isRefused).length
          }}</strong>
        </article>
      </div>
    </div>

    <!-- ══════ SHELL ══════ -->
    <section class="notes-frais-shell">
      <!-- Tabs -->
      <div class="tabs notes-frais-tabs">
        <button :class="{ active: tab === 'my' }" @click="tab = 'my'">Mes notes de frais</button>
        <button :class="{ active: tab === 'waiting' }" @click="tab = 'waiting'">
          En attente
          <span v-if="waitingNotes.length" class="tab-badge">{{ waitingNotes.length }}</span>
        </button>
        <button :class="{ active: tab === 'history' }" @click="tab = 'history'">Historique</button>
      </div>

      <!-- ===== MY TAB ===== -->
      <div v-if="tab === 'my'" class="notes-list notes-frais-panel">
        <div v-for="(n, index) in myNotes" :key="n.id ?? index" class="note-card border-accent">
          <div class="note-header">
            <span>Le {{ formatDate(n.date ?? 0) }}</span>
          </div>
          <div class="note-user">
            {{ reasonIcon(n.reason) }} {{ getReasonLabel(n.reason) }}&nbsp;: ({{ n.price }}&nbsp;$)
          </div>
          <div class="note-body">
            <div v-if="n.data" class="note-items">
              <div>{{ n.data }}</div>
            </div>
          </div>
          <template v-if="n.isRefused">
            <div class="note-status text-danger">Refusée</div>
            <div v-if="n.refusalComment" class="note-refusal">
              Motif du refus&nbsp;: {{ n.refusalComment }}
            </div>
          </template>
          <div v-else class="note-status">En cours de traitement</div>
          <div class="note-actions" style="margin-top: 0.4rem">
            <button class="btn danger" @click="deleteNote(n)">
              <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Supprimer
            </button>
          </div>
        </div>
        <p v-if="myNotes.length === 0" class="empty">Aucune note de frais</p>
        <div class="create-row">
          <button class="btn accent" @click="openCreate">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Nouvelle note
          </button>
        </div>
      </div>

      <!-- ===== WAITING TAB ===== -->
      <div v-if="tab === 'waiting'" class="notes-list notes-frais-panel">
        <div
          v-for="(n, index) in waitingNotes"
          :key="n.id ?? index"
          class="note-card border-accent"
        >
          <div class="note-header">
            <span>Le {{ formatDate(n.date ?? 0) }}</span>
            <div class="note-actions">
              <button class="btn danger" @click="openRefuse(n)">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i> Refuser
              </button>
              <button class="btn success" @click="approveNote(n)">
                <i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i> Approuver
              </button>
            </div>
          </div>
          <div class="note-user">
            {{ getProfileName(n.user) }} — {{ reasonIcon(n.reason) }}
            {{ getReasonLabel(n.reason) }}&nbsp;: ({{ n.price }}&nbsp;$)
          </div>
          <div class="note-body">
            <div v-if="n.data" class="note-items">
              <div>{{ n.data }}</div>
            </div>
          </div>
          <div class="note-status">En cours de traitement</div>
        </div>
        <p v-if="waitingNotes.length === 0" class="empty">Aucune note en attente</p>
      </div>

      <!-- ===== HISTORY TAB ===== -->
      <div v-if="tab === 'history'" class="history-list notes-frais-panel">
        <div v-for="key in monthKeys" :key="key" class="month-group">
          <template v-if="monthGrouped[key]">
            <h3 class="month-group__title">
              {{ monthGrouped[key]!.month }} {{ monthGrouped[key]!.year }}
              <span class="month-group__total">
                Total payé&nbsp;: {{ formatMoney(monthGrouped[key]!.totalPaid) }}
              </span>
            </h3>
            <div
              v-for="(n, index) in monthGrouped[key]!.notes"
              :key="n.id ?? index"
              class="note-card"
              :class="n.isPaid && !n.isRefused ? 'border-success' : 'border-danger'"
            >
              <div class="note-header">
                <span>Le {{ formatDate(n.date ?? 0) }}</span>
              </div>
              <div class="note-user">
                {{ getProfileName(n.user) }} — {{ reasonIcon(n.reason) }}
                {{ getReasonLabel(n.reason) }}&nbsp;: ({{ n.price }}&nbsp;$)
              </div>
              <div class="note-body">
                <div v-if="n.data" class="note-items">
                  <div>{{ n.data }}</div>
                </div>
              </div>
              <template v-if="n.isRefused">
                <div class="note-status text-danger">Refusée</div>
                <div v-if="n.refusalComment" class="note-refusal">
                  Motif du refus&nbsp;: {{ n.refusalComment }}
                </div>
              </template>
              <div v-else-if="n.isPaid" class="note-status text-success">Approuvée</div>
            </div>
          </template>
        </div>
        <p v-if="historyNotes.length === 0" class="empty">Aucun historique</p>
      </div>

      <!-- Create dialog -->
      <Teleport to="body">
        <div v-if="dialogCreate" class="overlay" @click="dialogCreate = false">
          <div class="dialog" @click.stop>
            <h3 class="dialog-title">Nouvelle note de frais</h3>
            <div class="form-group">
              <label>Raison</label>
              <input class="field" type="text" v-model="newNote.reason" />
            </div>
            <div class="form-group">
              <label>Type</label>
              <select class="field" v-model="newNote.reasonType">
                <option value="buy">🛒 Achat</option>
                <option value="vehicle">🚗 Véhicule</option>
                <option value="other">📋 Autre</option>
              </select>
            </div>
            <div class="form-group">
              <label>Montant ($)</label>
              <input class="field" type="number" v-model.number="newNote.amount" />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea class="field" rows="3" v-model="newNote.description"></textarea>
            </div>
            <div class="dialog-actions">
              <button class="btn accent" @click="saveNote">Valider</button>
              <button class="btn danger" @click="dialogCreate = false">Annuler</button>
            </div>
          </div>
        </div>
        <!-- Refuse dialog -->
        <div v-if="dialogRefuse" class="overlay" @click="dialogRefuse = false">
          <div class="dialog dialog-sm" @click.stop>
            <h3 class="dialog-title">Raison du refus</h3>
            <input
              class="field"
              type="text"
              placeholder="Raison du refus"
              v-model="refuseComment"
            />
            <div class="dialog-actions">
              <button class="btn accent" @click="confirmRefuse">Confirmer</button>
              <button class="btn danger" @click="dialogRefuse = false">Annuler</button>
            </div>
          </div>
        </div>
      </Teleport>
    </section>
  </div>
</template>

<style lang="scss" scoped>
/* ═══════ PAGE ROOT ═══════ */
.notes-frais-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  animation: fadeIn 0.28s ease;
}

/* ═══════ HERO ═══════ */
.notes-frais-hero {
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

.notes-frais-kicker {
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

.notes-frais-hero__copy {
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

.notes-frais-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.notes-frais-stat-card {
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  border: 1px solid rgba(116, 177, 227, 0.15);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.notes-frais-stat-card__label {
  display: block;
  color: #9fbad4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.notes-frais-stat-card__value {
  display: block;
  margin-top: 0.25rem;
  color: #ffffff;
  font-size: 1.36rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.notes-frais-stat-card--warn .notes-frais-stat-card__value {
  color: #ffbe7a;
}

.notes-frais-stat-card--accent .notes-frais-stat-card__value {
  color: #86dcff;
}

.notes-frais-stat-card--soft .notes-frais-stat-card__value {
  color: #f3d2ff;
}

/* ═══════ SHELL ═══════ */
.notes-frais-shell {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

/* ═══════ TABS ═══════ */
.tabs.notes-frais-tabs {
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

/* ═══════ PANEL ═══════ */
.notes-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.month-group {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.month-group__title {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0.4rem 0 0;
  color: #f4f9ff;
  font-size: 1.05rem;
  font-weight: 800;
  text-transform: capitalize;
}

.month-group__total {
  font-size: 0.78rem;
  font-weight: 600;
  color: #9fbad4;
}

.notes-frais-panel {
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

/* ═══════ NOTE CARD ═══════ */
.note-card {
  background: color-mix(in srgb, var(--surface-elevated) 94%, transparent 6%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 48%, transparent 52%);
  border-radius: 14px;
  padding: 0.78rem 0.9rem;
  border-left: 4px solid var(--card-border);

  &.border-success {
    border-left-color: var(--success);
  }

  &.border-danger {
    border-left-color: var(--danger);
  }

  &.border-accent {
    border-left-color: var(--accent);
  }
}

.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-weight: 700;
  flex-wrap: wrap;
}

.note-actions {
  display: flex;
  gap: 0.4rem;
}

.note-user {
  font-weight: 600;
  margin-top: 0.25rem;
  font-size: 0.9rem;
}

.note-body {
  margin-top: 0.4rem;
}

.note-items {
  padding-left: 0.75rem;
  border-left: 2px solid color-mix(in srgb, var(--dispatch-zone-border) 52%, transparent 48%);
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.note-meta {
  margin-top: 0.3rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.note-status {
  margin-top: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.note-refusal {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.create-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.2rem;
}

/* ═══════ DIALOGS ═══════ */
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
}

.dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.form-group {
  margin-bottom: 0.75rem;

  label {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: var(--text-muted);
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
  font-family: inherit;
  resize: vertical;
}

/* ═══════ BUTTONS ═══════ */
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

  &.success {
    background: linear-gradient(135deg, #109e78, #17b88e);
    color: #fff;
  }
}

/* ═══════ UTILITIES ═══════ */
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 2rem;
}

.text-danger {
  color: var(--danger);
}

.text-success {
  color: var(--success);
}

/* ═══════ RESPONSIVE ═══════ */
@media (max-width: 768px) {
  .notes-frais-page {
    padding: 1rem;
  }

  .notes-frais-hero {
    grid-template-columns: 1fr;
  }

  .notes-frais-hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tabs.notes-frais-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .note-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .dialog-actions {
    flex-direction: column;
  }

  .dialog-actions .btn {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .notes-frais-hero__stats {
    grid-template-columns: 1fr;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
