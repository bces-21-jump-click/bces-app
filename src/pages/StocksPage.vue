<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import { useLogger } from '@/composables/useLogger'
import { useNotifManager } from '@/composables/useNotifManager'
import Swal from 'sweetalert2'
import type { Entreprise, Stock } from '@/models/effectif'
import type { Stockage } from '@/models/stockage'

function createId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/ /g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const userStore = useUserStore()
const logger = useLogger()
const notif = useNotifManager()
const companiesApi = useCollection<Entreprise>('companies')
const storagesApi = useCollection<Stockage>('storages')
const itemsApi = useCollection<Stock>('items')

const tab = ref<'companies' | 'storages' | 'items'>('companies')

const companies = computed(() => notif.companies.value)
const storages = computed(() => notif.storages.value)
const items = computed(() => notif.items.value)

const totalCompanies = computed(() => companies.value.length)
const totalStorages = computed(() => storages.value.length)
const totalItems = computed(() => items.value.length)
const sortedItems = computed(() => [...items.value].sort((a, b) => a.name.localeCompare(b.name)))
const totalSecureItems = computed(() => items.value.filter((i) => i.isSecure).length)

function getStorageName(id: string): string {
  const s = storages.value.find((s) => s.id === id)
  return s ? `${s.icon} ${s.name}` : ''
}
function companyName(id: string): string {
  const c = companies.value.find((c) => c.id === id)
  return c ? `${c.icon} ${c.name}` : ''
}

// === Entreprises ===
const dialogCompany = ref(false)
const editCompany = ref(false)
const companyForm = reactive<Entreprise>({
  id: '',
  icon: '',
  name: '',
  canDestroy: false,
  canExpenseNote: false,
  isGarage: false,
})

function openCompany(company?: Entreprise): void {
  if (company) {
    editCompany.value = true
    Object.assign(companyForm, company)
  } else {
    editCompany.value = false
    Object.assign(companyForm, {
      id: '',
      icon: '',
      name: '',
      canDestroy: false,
      canExpenseNote: false,
      isGarage: false,
    })
  }
  dialogCompany.value = true
}
async function saveCompany(): Promise<void> {
  const id = companyForm.id || createId(companyForm.name)
  const data = {
    icon: companyForm.icon,
    name: companyForm.name,
    canDestroy: companyForm.canDestroy,
    canExpenseNote: companyForm.canExpenseNote,
    isGarage: companyForm.isGarage,
  }
  const logAction = editCompany.value ? 'Modification' : 'Création'
  await companiesApi.creer(data as unknown as Record<string, unknown>, id)
  logger.log(
    userStore.profile?.id ?? '',
    'ENTREPRISES',
    `${logAction} de l'entreprise ${companyForm.icon}${companyForm.name}`,
  )
  dialogCompany.value = false
}
async function deleteCompany(company: Entreprise): Promise<void> {
  const result = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: `Voulez-vous vraiment supprimer l'entreprise "${company.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed) return
  await companiesApi.supprimer(company.id)
  logger.log(
    userStore.profile?.id ?? '',
    'ENTREPRISES',
    `Suppression de l'entreprise ${company.icon}${company.name}`,
  )
  Swal.fire('Supprimé !', `L'entreprise "${company.name}" a bien été supprimée.`, 'success')
}

// === Stockages ===
const dialogStorage = ref(false)
const editStorage = ref(false)
const storageForm = reactive<Stockage>({ id: null, icon: '', name: '', maxWeight: 0 })

function openStorage(storage?: Stockage): void {
  if (storage) {
    editStorage.value = true
    Object.assign(storageForm, storage)
  } else {
    editStorage.value = false
    Object.assign(storageForm, { id: null, icon: '', name: '', maxWeight: 0 })
  }
  dialogStorage.value = true
}
async function saveStorage(): Promise<void> {
  const id = storageForm.id || createId(storageForm.name)
  const data = { icon: storageForm.icon, name: storageForm.name, maxWeight: storageForm.maxWeight }
  const logAction = editStorage.value ? 'Modification' : 'Création'
  await storagesApi.creer(data as unknown as Record<string, unknown>, id)
  logger.log(
    userStore.profile?.id ?? '',
    'STOCKAGES',
    `${logAction} du stockage ${storageForm.icon}${storageForm.name}`,
  )
  dialogStorage.value = false
}
async function deleteStorage(storage: Stockage): Promise<void> {
  const result = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: `Voulez-vous vraiment supprimer le stockage "${storage.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed) return
  if (!storage.id) return
  await storagesApi.supprimer(storage.id)
  logger.log(
    userStore.profile?.id ?? '',
    'STOCKAGES',
    `Suppression du stockage ${storage.icon}${storage.name}`,
  )
  Swal.fire('Supprimé !', `Le stockage "${storage.name}" a bien été supprimé.`, 'success')
}

// === Items ===
const dialogItem = ref(false)
const editItem = ref(false)
const itemForm = reactive<Stock>({
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
})

function openItem(item?: Stock): void {
  if (item) {
    editItem.value = true
    Object.assign(itemForm, { ...item, history: [...item.history] })
  } else {
    editItem.value = false
    Object.assign(itemForm, {
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
    })
  }
  dialogItem.value = true
}
async function saveItem(): Promise<void> {
  const id = itemForm.id || createId(itemForm.name)
  const data = {
    icon: itemForm.icon,
    name: itemForm.name,
    storage: itemForm.storage,
    weight: itemForm.weight,
    seller: itemForm.seller,
    amount: itemForm.amount,
    wanted: itemForm.wanted,
    maxOrder: itemForm.maxOrder,
    isInstantiated: itemForm.isInstantiated,
    instanceByDate: itemForm.instanceByDate,
    isSecure: itemForm.isSecure,
    history: itemForm.history,
  }
  const logAction = editItem.value ? 'Modification' : 'Création'
  await itemsApi.creer(data as unknown as Record<string, unknown>, id)
  logger.log(
    userStore.profile?.id ?? '',
    'ITEMS',
    `${logAction} de l'item ${itemForm.icon}${itemForm.name}`,
  )
  dialogItem.value = false
}
async function deleteItem(item: Stock): Promise<void> {
  const result = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: `Voulez-vous vraiment supprimer l'item "${item.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed) return
  await itemsApi.supprimer(item.id)
  logger.log(userStore.profile?.id ?? '', 'ITEMS', `Suppression de l'item ${item.icon}${item.name}`)
  Swal.fire('Supprimé !', `L'item "${item.name}" a bien été supprimé.`, 'success')
}
</script>

<template>
  <div class="stocks-page">
    <div class="page-header stocks-hero">
      <div class="stocks-hero__copy">
        <span class="stocks-kicker">BCES Supply Hub</span>
        <h1>Stocks</h1>
        <p>Gestion centralisée des entreprises, zones de stockage et catalogue d'items.</p>
      </div>
      <div class="stocks-hero__stats">
        <article class="stocks-stat-card">
          <span class="stocks-stat-card__label">Entreprises</span>
          <strong class="stocks-stat-card__value">{{ totalCompanies }}</strong>
        </article>
        <article class="stocks-stat-card stocks-stat-card--accent">
          <span class="stocks-stat-card__label">Stockages</span>
          <strong class="stocks-stat-card__value">{{ totalStorages }}</strong>
        </article>
        <article class="stocks-stat-card stocks-stat-card--soft">
          <span class="stocks-stat-card__label">Items référencés</span>
          <strong class="stocks-stat-card__value">{{ totalItems }}</strong>
        </article>
        <article class="stocks-stat-card stocks-stat-card--warn">
          <span class="stocks-stat-card__label">Items sécurisés</span>
          <strong class="stocks-stat-card__value">{{ totalSecureItems }}</strong>
        </article>
      </div>
    </div>

    <section class="stocks-shell">
      <div class="tabs stocks-tabs">
        <button :class="{ active: tab === 'companies' }" @click="tab = 'companies'">
          <i class="fa-solid fa-building" aria-hidden="true"></i>
          Entreprises
        </button>
        <button :class="{ active: tab === 'storages' }" @click="tab = 'storages'">
          <i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i>
          Stockage
        </button>
        <button :class="{ active: tab === 'items' }" @click="tab = 'items'">
          <i class="fa-solid fa-cubes" aria-hidden="true"></i>
          Items
        </button>
      </div>

      <!-- Entreprises -->
      <div v-if="tab === 'companies'" class="tab-content stocks-panel">
        <div class="section-head">
          <h3>Entreprises</h3>
          <p>Référentiel des partenaires et prestataires.</p>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in companies" :key="c.id">
              <td>{{ c.icon }} {{ c.name }}</td>
              <td class="text-end">
                <button class="btn-icon" @click="openCompany(c)" aria-label="Modifier">
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                </button>
                <button class="btn-icon danger" @click="deleteCompany(c)" aria-label="Supprimer">
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
            <tr v-if="companies.length === 0">
              <td colspan="2" class="text-center text-muted">Aucune entreprise</td>
            </tr>
          </tbody>
        </table>
        <div class="actions-center">
          <button class="btn btn-accent" @click="openCompany()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Ajouter une entreprise
          </button>
        </div>
      </div>

      <!-- Stockages -->
      <div v-if="tab === 'storages'" class="tab-content stocks-panel">
        <div class="section-head">
          <h3>Stockages</h3>
          <p>Capacité maximale et suivi des espaces de stockage.</p>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Poids max</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in storages" :key="s.id ?? s.name">
              <td>{{ s.icon }} {{ s.name }}</td>
              <td>{{ s.maxWeight }} Kg</td>
              <td class="text-end">
                <button class="btn-icon" @click="openStorage(s)" aria-label="Modifier">
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                </button>
                <button class="btn-icon danger" @click="deleteStorage(s)" aria-label="Supprimer">
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
            <tr v-if="storages.length === 0">
              <td colspan="3" class="text-center text-muted">Aucun stockage</td>
            </tr>
          </tbody>
        </table>
        <div class="actions-center">
          <button class="btn btn-accent" @click="openStorage()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Ajouter un stockage
          </button>
        </div>
      </div>

      <!-- Items -->
      <div v-if="tab === 'items'" class="tab-content stocks-panel">
        <div class="section-head">
          <h3>Items</h3>
          <p>Catalogue du matériel, fournisseurs et paramètres de commande.</p>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Poids</th>
              <th>Stockage</th>
              <th>Vendeur</th>
              <th>Stock souhaité</th>
              <th>Commande max</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(i, index) in sortedItems" :key="i.id ?? index">
              <td>
                {{ i.icon }} {{ i.name }}
                <span v-if="i.isSecure" class="badge-secure">🔒</span>
              </td>
              <td>{{ i.weight }} Kg</td>
              <td>{{ getStorageName(i.storage) }}</td>
              <td>{{ companyName(i.seller) }}</td>
              <td>{{ i.wanted }}</td>
              <td>{{ i.maxOrder === 0 ? '♾️' : i.maxOrder }}</td>
              <td class="text-end">
                <button class="btn-icon" @click="openItem(i)" aria-label="Modifier">
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                </button>
                <button class="btn-icon danger" @click="deleteItem(i)" aria-label="Supprimer">
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
            <tr v-if="sortedItems.length === 0">
              <td colspan="7" class="text-center text-muted">Aucun item</td>
            </tr>
          </tbody>
        </table>
        <div class="actions-center">
          <button class="btn btn-accent" @click="openItem()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Ajouter un item
          </button>
        </div>
      </div>
    </section>

    <!-- Dialog Entreprise -->
    <Teleport to="body">
      <div v-if="dialogCompany" class="overlay" @click="dialogCompany = false">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">{{ editCompany ? 'Modifier' : 'Ajouter' }} une entreprise</h3>
          <label>Icone <input v-model="companyForm.icon" /></label>
          <label>Nom <input v-model="companyForm.name" /></label>
          <label class="toggle"
            ><input type="checkbox" v-model="companyForm.canDestroy" /> Peut détruire le sang</label
          >
          <label class="toggle"
            ><input type="checkbox" v-model="companyForm.canExpenseNote" /> Notes de frais</label
          >
          <label class="toggle"
            ><input type="checkbox" v-model="companyForm.isGarage" /> Garage auto</label
          >
          <div class="dialog-actions">
            <button class="btn btn-primary" @click="saveCompany">Valider</button>
            <button class="btn btn-danger" @click="dialogCompany = false">Annuler</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Dialog Stockage -->
    <Teleport to="body">
      <div v-if="dialogStorage" class="overlay" @click="dialogStorage = false">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">{{ editStorage ? 'Modifier' : 'Ajouter' }} un stockage</h3>
          <label>Icone <input v-model="storageForm.icon" /></label>
          <label>Nom <input v-model="storageForm.name" /></label>
          <label
            >Poids max (Kg) <input type="number" v-model.number="storageForm.maxWeight"
          /></label>
          <div class="dialog-actions">
            <button class="btn btn-primary" @click="saveStorage">Valider</button>
            <button class="btn btn-danger" @click="dialogStorage = false">Annuler</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Dialog Item -->
    <Teleport to="body">
      <div v-if="dialogItem" class="overlay" @click="dialogItem = false">
        <div class="dialog dialog-large" @click.stop>
          <h3 class="dialog-title">{{ editItem ? 'Modifier' : 'Ajouter' }} un item</h3>
          <label>Icone <input v-model="itemForm.icon" /></label>
          <label>Nom <input v-model="itemForm.name" /></label>
          <label>Poids (Kg) <input type="number" v-model.number="itemForm.weight" /></label>
          <label
            >Stockage
            <select v-model="itemForm.storage">
              <option value="">—</option>
              <option v-for="s in storages" :key="s.id ?? s.name" :value="s.id ?? ''">
                {{ s.icon }} {{ s.name }}
              </option>
            </select>
          </label>
          <label
            >Vendeur
            <select v-model="itemForm.seller">
              <option value="">—</option>
              <option v-for="c in companies" :key="c.id" :value="c.id">
                {{ c.icon }} {{ c.name }}
              </option>
            </select>
          </label>
          <label>Stock souhaité <input type="number" v-model.number="itemForm.wanted" /></label>
          <label
            >Commande max (0 = illimité) <input type="number" v-model.number="itemForm.maxOrder"
          /></label>
          <label class="toggle"
            ><input type="checkbox" v-model="itemForm.isSecure" /> Commande sécurisée</label
          >
          <label class="toggle"
            ><input type="checkbox" v-model="itemForm.isInstantiated" /> Contient des
            instances</label
          >
          <label v-if="itemForm.isInstantiated" class="toggle"
            ><input type="checkbox" v-model="itemForm.instanceByDate" /> Instances par date</label
          >
          <div class="dialog-actions">
            <button class="btn btn-primary" @click="saveItem">Valider</button>
            <button class="btn btn-danger" @click="dialogItem = false">Annuler</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.stocks-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: fadeIn 0.28s ease;
}

.stocks-hero {
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
    0 18px 34px rgba(5, 13, 23, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.stocks-kicker {
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

.stocks-hero__copy h1 {
  margin: 0.1rem 0 0.35rem;
  color: #f4f9ff;
  font-size: 1.72rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.stocks-hero__copy p {
  margin: 0;
  max-width: 56ch;
  color: #a9c7e2;
  font-size: 0.92rem;
  line-height: 1.5;
}

.stocks-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.stocks-stat-card {
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  border: 1px solid rgba(116, 177, 227, 0.15);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.stocks-stat-card__label {
  display: block;
  color: #9fbad4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.stocks-stat-card__value {
  display: block;
  margin-top: 0.25rem;
  color: #ffffff;
  font-size: 1.36rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.stocks-stat-card--accent .stocks-stat-card__value {
  color: #86dcff;
}

.stocks-stat-card--soft .stocks-stat-card__value {
  color: #f3d2ff;
}

.stocks-stat-card--warn .stocks-stat-card__value {
  color: #ffbe7a;
}

.stocks-shell {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.tabs.stocks-tabs {
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
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.48rem 0.88rem;
    border-radius: 11px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.84rem;
    font-weight: 800;
    transition:
      background 0.16s ease,
      color 0.16s ease,
      transform 0.16s ease;

    &:hover {
      color: var(--text-primary);
      background: color-mix(in srgb, var(--surface-hover) 82%, transparent 18%);
    }

    &.active {
      color: #fff;
      background: linear-gradient(135deg, #1b6ec2, #2f8de2);
      box-shadow: 0 10px 18px rgba(36, 119, 201, 0.26);
    }
  }
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.stocks-panel {
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

.section-head h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}

.section-head p {
  margin: 0.16rem 0 0;
  color: var(--text-secondary);
  font-size: 0.76rem;
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
  }

  tbody tr:hover {
    background: color-mix(in srgb, var(--surface-hover) 78%, var(--accent-subtle) 22%);
  }
}

.text-center {
  text-align: center;
}

.text-end {
  text-align: right;
}

.text-muted {
  color: var(--text-secondary);
}

.btn-icon {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  background: color-mix(in srgb, var(--surface-elevated) 86%, transparent 14%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
  cursor: pointer;
  font-size: 0.98rem;
  padding: 0;
  border-radius: 10px;
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

.badge-secure {
  margin-left: 0.45rem;
  font-size: 0.85rem;
}

.actions-center {
  display: flex;
  justify-content: flex-start;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.48rem 0.86rem;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 800;
  background: color-mix(in srgb, var(--surface-elevated) 80%, var(--dispatch-zone-border) 20%);
  color: var(--text-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.btn-accent,
.btn-primary {
  background: linear-gradient(135deg, #1976d2, #1e88e5);
  color: #fff;
}

.btn-danger {
  background: linear-gradient(135deg, #b32740, #d33f5a);
  color: #fff;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(2, 8, 16, 0.66);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog {
  background: linear-gradient(180deg, #112235, #0e1b2d);
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 56%, transparent 44%);
  padding: 1.25rem;
  border-radius: 18px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.36);
}

.dialog-title {
  margin: 0 0 1rem;
  color: #f4f9ff;
  font-size: 1.02rem;
  font-weight: 800;
}

.dialog label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: #a7bdd6;

  input,
  select {
    padding: 0.52rem 0.68rem;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
    background: color-mix(in srgb, var(--input-bg) 86%, transparent 14%);
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  &.toggle {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    color: #d5e2ef;

    input[type='checkbox'] {
      width: 1.1rem;
      height: 1.1rem;
      accent-color: #1e88e5;
    }
  }
}

.dialog-large {
  max-width: 600px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.1rem;
}

@media (max-width: 920px) {
  .stocks-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .stocks-page {
    padding: 1rem;
  }

  .stocks-hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tabs.stocks-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .data-table {
    display: block;
    overflow-x: auto;
  }

  .actions-center {
    justify-content: stretch;
  }

  .actions-center .btn {
    width: 100%;
  }

  .dialog-actions {
    flex-direction: column;
  }

  .dialog-actions .btn {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .stocks-hero__stats {
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
