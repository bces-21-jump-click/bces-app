<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import { useLogger } from '@/composables/useLogger'
import { useNotifManager } from '@/composables/useNotifManager'
import type { Stock } from '@/models/effectif'
import type { Instance, InstanceEntry } from '@/models/instance'

const userStore = useUserStore()
const logger = useLogger()
const notif = useNotifManager()
const itemsApi = useCollection<Stock>('items')
const instancesApi = useCollection<Instance>('instances')
const savedatesApi = useCollection<Record<string, unknown> & { id: string }>('savedates')

const activeTab = ref<string | null>(null)
const filterName = ref('')
const filterSeller = ref<string | null>(null)
const filtersPanelOpen = ref(false)
const statsPanelOpen = ref(false)

// Instance dialog
const dialogInstance = ref(false)
const currentItem = ref<Stock | null>(null)
const currentInstance = ref<Instance | null>(null)
// Name dialog
const dialogName = ref(false)
const instanceName = ref('')
// Date dialog
const dialogDate = ref(false)
const instanceDate = ref('')
const instanceAmount = ref(0)
// Movement dialog
const dialogMovement = ref(false)
const movementItem = ref<Stock | null>(null)

const storages = computed(() => notif.storages.value)
const companies = computed(() => notif.companies.value)
const items = computed(() => notif.items.value)
const saveDates = computed(() => notif.saveDates.value)
const deltaTime = computed(() => notif.storageDeltaTime.value)

const currentStorageItems = computed(() => items.value.filter((i) => i.storage === activeTab.value))
const filteredItems = computed(() => {
  let r = currentStorageItems.value
  const n = filterName.value.toLowerCase().trim()
  if (n) r = r.filter((i) => i.name.toLowerCase().includes(n))
  const s = filterSeller.value
  if (s) r = r.filter((i) => i.seller === s)
  return r
})
const statsTotal = computed(() => currentStorageItems.value.reduce((t, i) => t + i.amount, 0))
const statsPoids = computed(
  () =>
    Math.round(currentStorageItems.value.reduce((t, i) => t + i.weight * i.amount, 0) * 1000) /
    1000,
)
const statsPoidsRestant = computed(() => {
  const st = storages.value.find((s) => s.id === activeTab.value)
  if (!st) return 0
  return Math.round((st.maxWeight - statsPoids.value) * 1000) / 1000
})
const perms = computed(() => userStore.profile?.permissions ?? [])
const canViewMovement = computed(() =>
  perms.value.some((p) => ['dev', 'admin', 'logs'].includes(p)),
)
const canEditInstances = computed(() =>
  perms.value.some((p) => ['dev', 'admin', 'stock'].includes(p)),
)

// Auto-select first tab
const tabCheck = setInterval(() => {
  if (storages.value.length > 0 && !activeTab.value) {
    activeTab.value = storages.value[0]?.id ?? null
    clearInterval(tabCheck)
  }
}, 200)
onUnmounted(() => clearInterval(tabCheck))

function getCompanyName(sellerId: string): string {
  const c = companies.value.find((co) => co.id === sellerId)
  return c ? `${c.icon} ${c.name}` : sellerId
}
function getSaveDateLabel(storageId: string): string {
  const sd = saveDates.value[storageId]
  if (!sd) return 'Aucune donnée'
  return new Date(sd.date).toLocaleString('fr-FR').slice(0, 16)
}
function getSaveDateClass(storageId: string): string {
  const dt = deltaTime.value[storageId] ?? 9999
  if (dt < 12) return 'text-success'
  if (dt < 24) return 'text-warning'
  return 'text-danger'
}
function getNeeded(item: Stock): number {
  return Math.max(0, item.wanted - item.amount)
}
function getNeededClass(item: Stock): string {
  if (item.amount >= item.wanted) return 'text-success'
  if (item.amount >= item.wanted * 0.5) return ''
  if (item.amount >= item.wanted * 0.25) return 'text-warning'
  return 'text-danger'
}

function startEditing(item: Stock): void {
  notif.editingItemIds.add(item.id)
}
function stopEditing(item: Stock): void {
  setTimeout(() => notif.editingItemIds.delete(item.id), 500)
}

function onBlurItem(item: Stock): void {
  stopEditing(item)
  updateItem(item)
}

async function updateItem(item: Stock): Promise<void> {
  const { id, ...data } = item
  await itemsApi.modifier(id, data as unknown as Record<string, unknown>)
  const storageId = item.storage
  const sd = saveDates.value[storageId]
  if (sd?.id) {
    await savedatesApi.modifier(sd.id, { date: Date.now() })
  } else {
    await savedatesApi.creer({ date: Date.now() }, storageId)
  }
  const storage = storages.value.find((s) => s.id === storageId)
  const storageName = storage ? `${storage.icon}${storage.name}` : storageId
  logger.log(
    userStore.profile?.id ?? '',
    'INVENTAIRE',
    `Mise à jour de l'item ${item.icon}${item.name} dans ${storageName}. (Nouvelle quantité : ${item.amount})`,
  )
}

async function openInstanceDialog(item: Stock): Promise<void> {
  currentItem.value = item
  dialogInstance.value = true
  let inst: Instance | null = null
  try {
    inst = await instancesApi.lire(item.id)
  } catch {
    inst = null
  }
  if (!inst) {
    inst = { id: item.id, content: [] }
    await instancesApi.creer({ content: [] }, item.id)
  }
  if (item.instanceByDate) {
    inst.content = inst.content.filter((e) => e.amount > 0)
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const dateStr = d.toLocaleDateString('fr-FR')
      if (!inst.content.find((e) => e.date === dateStr)) {
        inst.content.push({ date: dateStr, amount: 0, locked: false })
      }
    }
    inst.content.sort(
      (a, b) =>
        new Date(a.date!.split('/').reverse().join('-')).getTime() -
        new Date(b.date!.split('/').reverse().join('-')).getTime(),
    )
    await instancesApi.modifier(item.id, { content: inst.content })
  }
  currentInstance.value = inst
}
function closeInstanceDialog(): void {
  dialogInstance.value = false
}
async function saveInstance(): Promise<void> {
  const inst = currentInstance.value
  const item = currentItem.value
  if (!inst || !item) return
  const totalAmount = inst.content.reduce(
    (t, e) => t + (typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount))),
    0,
  )
  item.amount = totalAmount
  await updateItem(item)
  await instancesApi.modifier(item.id, { content: inst.content })
  closeInstanceDialog()
}
function openNameDialog(): void {
  instanceName.value = ''
  dialogName.value = true
}
function closeNameDialog(): void {
  dialogName.value = false
}
function addInstance(): void {
  const n = instanceName.value.trim()
  if (!n) return
  const inst = currentInstance.value
  if (!inst || inst.content.find((e) => e.name === n)) return
  inst.content.push({ name: n, amount: 0, locked: false })
  inst.content.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  currentInstance.value = { ...inst }
  closeNameDialog()
}
function openDateDialog(): void {
  instanceDate.value = new Date().toLocaleDateString('fr-FR')
  instanceAmount.value = 0
  dialogDate.value = true
}
function closeDateDialog(): void {
  dialogDate.value = false
}
function addDateInstance(): void {
  const d = instanceDate.value.trim()
  if (!d) return
  const dateRegex = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/
  if (!dateRegex.test(d)) return
  const inst = currentInstance.value
  if (!inst || inst.content.find((e) => e.date === d)) return
  inst.content.push({ date: d, amount: instanceAmount.value, locked: false })
  inst.content.sort(
    (a, b) =>
      new Date(a.date!.split('/').reverse().join('-')).getTime() -
      new Date(b.date!.split('/').reverse().join('-')).getTime(),
  )
  currentInstance.value = { ...inst }
  closeDateDialog()
}
function removeInstanceEntry(entry: InstanceEntry): void {
  const inst = currentInstance.value
  if (!inst) return
  inst.content = inst.content.filter((e) => e !== entry)
  currentInstance.value = { ...inst }
}
function toggleLock(entry: InstanceEntry): void {
  entry.locked = !entry.locked
  if (currentInstance.value) currentInstance.value = { ...currentInstance.value }
}
function showMovement(item: Stock): void {
  movementItem.value = item
  dialogMovement.value = true
}
function closeMovementDialog(): void {
  dialogMovement.value = false
}
function isDateExpired(dateStr: string): boolean {
  const parts = dateStr.split('/').reverse().join('-')
  return new Date(parts).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0)
}
</script>

<template>
  <div class="inventaire-page">
    <div class="page-header inventaire-hero">
      <div class="inventaire-hero__copy">
        <span class="inventaire-kicker">BCES Inventory Control</span>
        <h1>Inventaire</h1>
        <p>Pilotage des stocks par zone, suivi des besoins et contrôle des mouvements.</p>
      </div>
      <div class="inventaire-hero__stats">
        <article class="inventaire-stat-card">
          <span class="inventaire-stat-card__label">Zones de stockage</span>
          <strong class="inventaire-stat-card__value">{{ storages.length }}</strong>
        </article>
        <article class="inventaire-stat-card inventaire-stat-card--accent">
          <span class="inventaire-stat-card__label">Items référencés</span>
          <strong class="inventaire-stat-card__value">{{ items.length }}</strong>
        </article>
        <article class="inventaire-stat-card inventaire-stat-card--warn">
          <span class="inventaire-stat-card__label">Besoin de réassort</span>
          <strong class="inventaire-stat-card__value">{{
            filteredItems.filter((item) => getNeeded(item) > 0).length
          }}</strong>
        </article>
        <article class="inventaire-stat-card inventaire-stat-card--soft">
          <span class="inventaire-stat-card__label">Items à risque</span>
          <strong class="inventaire-stat-card__value">{{
            filteredItems.filter((item) => getNeeded(item) >= item.wanted * 0.75).length
          }}</strong>
        </article>
      </div>
    </div>

    <section class="inventaire-shell">
      <!-- Tabs -->
      <div class="storage-tabs tabs inventaire-tabs">
        <button
          v-for="(storage, idx) in storages"
          :key="storage.id ?? idx"
          class="tab-btn"
          :class="{ active: activeTab === storage.id }"
          @click="activeTab = storage.id"
        >
          {{ storage.icon }} {{ storage.name }}
          <span
            v-if="storage.id && getSaveDateClass(storage.id) !== 'text-success'"
            class="tab-badge"
            >!</span
          >
        </button>
      </div>

      <template v-if="activeTab">
        <!-- Save date / Status banner -->
        <div class="inventaire-toolbar">
          <div class="inventaire-status-banner" :class="getSaveDateClass(activeTab)">
            <span class="inventaire-status-banner__icon">
              <i class="fa-solid fa-box-archive" aria-hidden="true"></i>
            </span>
            <div>
              <strong>Suivi du stock actif</strong>
              <div class="inventaire-status-banner__meta">
                Dernière mise à jour : {{ getSaveDateLabel(activeTab) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Filters + Stats panels -->
        <div class="panels-row inventaire-panels">
          <div class="panel inventaire-panel">
            <button
              type="button"
              class="panel-title"
              @click="filtersPanelOpen = !filtersPanelOpen"
              :aria-expanded="filtersPanelOpen"
            >
              <span>Filtres</span>
              <span
                class="panel-title__indicator"
                :class="{ 'is-open': filtersPanelOpen }"
                aria-hidden="true"
              >
                <i class="fa-solid fa-chevron-down"></i>
              </span>
            </button>
            <div v-if="filtersPanelOpen" class="panel-body">
              <input type="text" placeholder="Nom" class="field" v-model="filterName" />
              <select class="field" v-model="filterSeller">
                <option :value="null">Tous les vendeurs</option>
                <option v-for="c in companies" :key="c.id" :value="c.id">
                  {{ c.icon }} {{ c.name }}
                </option>
              </select>
            </div>
          </div>
          <div class="panel inventaire-panel">
            <button
              type="button"
              class="panel-title"
              @click="statsPanelOpen = !statsPanelOpen"
              :aria-expanded="statsPanelOpen"
            >
              <span>Statistiques</span>
              <span
                class="panel-title__indicator"
                :class="{ 'is-open': statsPanelOpen }"
                aria-hidden="true"
              >
                <i class="fa-solid fa-chevron-down"></i>
              </span>
            </button>
            <div v-if="statsPanelOpen" class="panel-body">
              <p>Nombre d'items : {{ statsTotal }}</p>
              <p>Poids total : {{ statsPoids }} Kg</p>
              <p>Poids restant : {{ statsPoidsRestant }} Kg</p>
            </div>
          </div>
        </div>

        <!-- Data table -->
        <div class="table-container inventaire-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Vendeur</th>
                <th>Poids</th>
                <th>Stock actuel</th>
                <th>Stock souhaité</th>
                <th>Besoin</th>
                <th v-if="canViewMovement"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredItems" :key="item.id">
                <td>{{ item.icon }} {{ item.name }}</td>
                <td>{{ getCompanyName(item.seller) }}</td>
                <td>{{ item.weight }} Kg</td>
                <td>
                  <div v-if="item.isInstantiated" class="instance-cell">
                    <span>{{ item.amount }}</span>
                    <button
                      class="btn-icon"
                      @click="openInstanceDialog(item)"
                      title="Instances"
                      aria-label="Instances"
                    >
                      <i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>
                    </button>
                  </div>
                  <input
                    v-else
                    type="number"
                    class="inline-input"
                    v-model.number="item.amount"
                    @focus="startEditing(item)"
                    @blur="onBlurItem(item)"
                  />
                </td>
                <td>{{ item.wanted }}</td>
                <td :class="getNeededClass(item)">
                  <span v-if="getNeeded(item) === 0" class="text-success">0</span>
                  <template v-else>{{ getNeeded(item) }}</template>
                </td>
                <td v-if="canViewMovement">
                  <button
                    class="btn-icon"
                    @click="showMovement(item)"
                    title="Historique"
                    aria-label="Historique"
                  >
                    <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="filteredItems.length === 0">
                <td :colspan="canViewMovement ? 7 : 6" class="empty">Aucun item</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <!-- Instance dialog -->
    <Teleport to="body">
      <div v-if="dialogInstance" class="overlay" @click="closeInstanceDialog">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">{{ currentItem?.icon }} {{ currentItem?.name }}</h3>

          <table class="data-table instance-table" v-if="currentInstance">
            <thead>
              <tr>
                <th>{{ currentItem?.instanceByDate ? 'Date' : 'Nom' }}</th>
                <th>Quantité</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(entry, i) in currentInstance.content" :key="i">
                <template v-if="currentItem?.instanceByDate">
                  <td :class="{ 'text-danger': isDateExpired(entry.date ?? '') }">
                    {{ entry.date }}
                  </td>
                  <td>
                    <input type="number" class="inline-input" v-model.number="entry.amount" />
                  </td>
                  <td>
                    <button v-if="canEditInstances" class="btn-icon" @click="toggleLock(entry)">
                      <i
                        class="fa-solid"
                        :class="entry.locked ? 'fa-lock' : 'fa-lock-open'"
                        aria-hidden="true"
                      ></i>
                    </button>
                    <i
                      v-else
                      class="fa-solid"
                      :class="entry.locked ? 'fa-lock' : 'fa-lock-open'"
                      aria-hidden="true"
                    ></i>
                  </td>
                </template>
                <template v-else>
                  <td>{{ entry.name }}</td>
                  <td>
                    <input type="number" class="inline-input" v-model.number="entry.amount" />
                  </td>
                  <td>
                    <button
                      v-if="canEditInstances"
                      class="btn-icon danger"
                      @click="removeInstanceEntry(entry)"
                      aria-label="Supprimer instance"
                    >
                      <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                    </button>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>

          <div v-if="!currentItem?.instanceByDate && canEditInstances" class="dialog-actions">
            <button class="btn success" @click="openNameDialog">Ajouter une instance</button>
          </div>
          <div v-if="currentItem?.instanceByDate && canEditInstances" class="dialog-actions">
            <button class="btn success" @click="openDateDialog">Ajouter une date spécifique</button>
          </div>

          <div class="dialog-actions">
            <button class="btn accent" @click="saveInstance">Valider</button>
            <button class="btn danger" @click="closeInstanceDialog">Annuler</button>
          </div>
        </div>
      </div>

      <!-- Name dialog -->
      <div v-if="dialogName" class="overlay" @click="closeNameDialog">
        <div class="dialog dialog-sm" @click.stop>
          <input type="text" placeholder="Nom de l'instance" class="field" v-model="instanceName" />
          <div class="dialog-actions">
            <button class="btn accent" @click="addInstance">Valider</button>
            <button class="btn danger" @click="closeNameDialog">Annuler</button>
          </div>
        </div>
      </div>

      <!-- Date dialog -->
      <div v-if="dialogDate" class="overlay" @click="closeDateDialog">
        <div class="dialog dialog-sm" @click.stop>
          <input type="text" placeholder="Date (jj/mm/aaaa)" class="field" v-model="instanceDate" />
          <input
            type="number"
            placeholder="Quantité"
            class="field"
            v-model.number="instanceAmount"
          />
          <div class="dialog-actions">
            <button class="btn accent" @click="addDateInstance">Valider</button>
            <button class="btn danger" @click="closeDateDialog">Annuler</button>
          </div>
        </div>
      </div>

      <!-- Movement dialog -->
      <div v-if="dialogMovement" class="overlay" @click="closeMovementDialog">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">
            📈 Historique — {{ movementItem?.icon }} {{ movementItem?.name }}
          </h3>
          <div v-if="movementItem?.history?.length" class="movement-list">
            <div v-for="(h, i) in movementItem!.history" :key="i" class="movement-entry">
              <span>{{ new Date(h.date).toLocaleString('fr-FR') }}</span>
              <span class="movement-amount">{{ h.amount }}</span>
            </div>
          </div>
          <p v-else class="empty">Aucun historique disponible</p>
          <div class="dialog-actions">
            <button class="btn danger" @click="closeMovementDialog">Fermer</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.inventaire-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  animation: fadeIn 0.28s ease;
}

.inventaire-hero {
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

.inventaire-kicker {
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

.inventaire-hero__copy h1 {
  margin: 0.1rem 0 0.35rem;
  color: #f4f9ff;
  font-size: 1.72rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.inventaire-hero__copy p {
  margin: 0;
  max-width: 56ch;
  color: #a9c7e2;
  font-size: 0.92rem;
  line-height: 1.5;
}

.inventaire-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.inventaire-stat-card {
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  border: 1px solid rgba(116, 177, 227, 0.15);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.inventaire-stat-card__label {
  display: block;
  color: #9fbad4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.inventaire-stat-card__value {
  display: block;
  margin-top: 0.25rem;
  color: #ffffff;
  font-size: 1.36rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.inventaire-stat-card--warn .inventaire-stat-card__value {
  color: #ffbe7a;
}

.inventaire-stat-card--accent .inventaire-stat-card__value {
  color: #86dcff;
}

.inventaire-stat-card--soft .inventaire-stat-card__value {
  color: #f3d2ff;
}

.inventaire-shell {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.storage-tabs.tabs.inventaire-tabs {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: fit-content;
  padding: 0.25rem;
  border-radius: 14px;
  border: 1px solid var(--dispatch-zone-border);
  background: color-mix(in srgb, var(--surface-elevated) 88%, #08121e 12%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  flex-wrap: wrap;
}

.tab-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.48rem 0.88rem;
  border-radius: 11px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
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

.tab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d83d52, #b31f36);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  display: inline-grid;
  place-items: center;
}

.inventaire-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.inventaire-status-banner {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  width: 100%;
  padding: 0.88rem 0.95rem;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  background: color-mix(in srgb, var(--theme-soft-band) 80%, var(--surface-elevated) 20%);
}

.inventaire-status-banner__icon {
  display: inline-grid;
  place-items: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(82, 170, 255, 0.24), rgba(41, 98, 159, 0.18));
  font-size: 1.1rem;
}

.inventaire-status-banner__icon i {
  display: block;
  line-height: 1;
}

.inventaire-status-banner strong {
  display: block;
  color: var(--text-primary);
  font-size: 0.92rem;
}

.inventaire-status-banner__meta {
  margin-top: 0.16rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.text-success {
  color: var(--success);
}

.text-warning {
  color: var(--warning);
}

.text-danger {
  color: var(--danger);
}

.panels-row.inventaire-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
  align-items: start;
}

.inventaire-panel {
  padding: 0;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 52%, transparent 48%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 93%, transparent 7%),
    color-mix(in srgb, var(--surface) 92%, transparent 8%)
  );
  box-shadow: 0 10px 26px rgba(3, 9, 18, 0.18);
  overflow: hidden;
  align-self: start;
}

.panel-title {
  width: 100%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  font-weight: 800;
  font-size: 0.84rem;
  color: #bfd0e6;
  cursor: pointer;
  text-align: left;
  background: linear-gradient(180deg, #121b2f, #0f172a);
}

.panel-title__indicator {
  display: inline-grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #d6e8fb;
  font-size: 0.7rem;
  transition: transform 0.16s ease;
}

.panel-title__indicator.is-open {
  transform: rotate(180deg);
}

.panel-body {
  padding: 0.78rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  p {
    margin: 0;
    font-size: 0.84rem;
  }
}

.field {
  width: 100%;
  padding: 0.52rem 0.68rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  background: color-mix(in srgb, var(--input-bg) 86%, transparent 14%);
  color: var(--text-primary);
  font-size: 0.85rem;
}

.table-container.inventaire-table-wrap {
  overflow: auto;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 52%, transparent 48%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 93%, transparent 7%),
    color-mix(in srgb, var(--surface) 92%, transparent 8%)
  );
  box-shadow: 0 10px 26px rgba(3, 9, 18, 0.18);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface-elevated) 95%, transparent 5%);

  th,
  td {
    padding: 0.58rem 0.72rem;
    text-align: left;
    border-bottom: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
    font-size: 0.82rem;
  }

  th {
    background: linear-gradient(180deg, #121b2f, #0f172a);
    color: #bfd0e6;
    font-weight: 800;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  tbody tr {
    transition: background 0.14s ease;
  }

  tbody tr:hover {
    background: color-mix(in srgb, var(--surface-hover) 78%, var(--accent-subtle) 22%);
  }
}

.empty {
  text-align: center;
  padding: 2.2rem;
  color: var(--text-muted);
}

.inline-input {
  width: 86px;
  padding: 0.36rem 0.54rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  background: color-mix(in srgb, var(--input-bg) 86%, transparent 14%);
  color: var(--text-primary);
  font-size: 0.82rem;
}

.instance-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
}

.btn-icon i {
  display: block;
  line-height: 1;
  font-size: 0.9rem;
  text-align: center;
  vertical-align: middle;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 8, 16, 0.66);
  backdrop-filter: blur(6px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease;
}

.dialog {
  background: linear-gradient(180deg, #112235, #0e1b2d);
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 56%, transparent 44%);
  border-radius: 18px;
  padding: 1.25rem;
  max-width: 600px;
  width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.36);
}

.dialog-sm {
  max-width: 400px;
}

.dialog-title {
  margin: 0;
  color: #f4f9ff;
  font-size: 1.02rem;
  font-weight: 800;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.instance-table {
  font-size: 0.88rem;
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

  &.success {
    background: linear-gradient(135deg, #109e78, #17b88e);
    color: #fff;
  }

  &.danger {
    background: linear-gradient(135deg, #b32740, #d33f5a);
    color: #fff;
  }
}

.movement-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 300px;
  overflow-y: auto;
}

.movement-entry {
  display: flex;
  justify-content: space-between;
  padding: 0.48rem 0.75rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent 8%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
  font-size: 0.82rem;
}

.movement-amount {
  font-weight: 800;
  color: var(--accent);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 920px) {
  .inventaire-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .inventaire-page {
    padding: 1rem;
  }

  .inventaire-hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .storage-tabs.tabs.inventaire-tabs {
    width: 100%;
    overflow-x: auto;
    flex-wrap: nowrap;
  }

  .panels-row.inventaire-panels {
    grid-template-columns: 1fr;
  }

  .data-table {
    display: block;
    overflow-x: auto;
  }

  .dialog-actions {
    flex-direction: column;
  }

  .dialog-actions .btn {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .inventaire-hero__stats {
    grid-template-columns: 1fr;
  }

  .inventaire-status-banner {
    grid-template-columns: 1fr;
  }
}
</style>
