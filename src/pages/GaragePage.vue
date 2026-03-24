<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import { useLogger } from '@/composables/useLogger'
import { useNotifManager } from '@/composables/useNotifManager'
import Swal from 'sweetalert2'
import type { Vehicule, Entreprise } from '@/models/effectif'
import type { VehicleHistory } from '@/models/vehicle-history'
import type { SaveDate } from '@/models/save-date'
import { VEHICLES_LOCATIONS, type VehicleLocation } from '@/config/vehicles-locations.config'

const userStore = useUserStore()
const logger = useLogger()
const notif = useNotifManager()
const vehiclesApi = useCollection<Vehicule>('vehicles')
const vehicleHistoriesApi = useCollection<VehicleHistory>('vehicleHistories')
const saveDatesApi = useCollection<SaveDate>('saveDates')

const onglet = ref<'garage' | 'history' | 'vehicles'>('garage')
const vehicles = ref<Vehicule[]>([])
const vehicleHistories = ref<VehicleHistory[]>([])
const lastSaveDate = ref<SaveDate | null>(null)
const unsubs: (() => void)[] = []

// Dialogs
const dialogRepa = ref(false)
const selectedGarage = ref<string | null>(null)
const selectedVehicles = ref<Record<string, boolean>>({})

const dialogGuard = ref(false)
const dialogRecup = ref(false)
const currentVehicle = ref<Vehicule | null>(null)
const newLocation = ref<string | null>(null)
const recupDateStr = ref('')
const price = ref(0)

const dialogVehicle = ref(false)
const editVehicle = ref<Partial<Vehicule>>({})

const companies = computed(() => notif.companies.value)
const perms = computed(() => userStore.profile?.permissions ?? [])
const canViewHistory = computed(() => perms.value.some((p) => ['dev', 'admin', 'cash'].includes(p)))
const canManageVehicles = computed(() =>
  perms.value.some((p) => ['dev', 'admin', 'vehicles'].includes(p)),
)
const isDev = computed(() => perms.value.includes('dev'))

const sortedVehicles = computed(() => {
  const iconOrder = ['🚑', '⛰️', '🚨']
  return [...vehicles.value]
    .filter((v) => v.where !== 'dead')
    .sort((a, b) => {
      if (a.insurance && !b.insurance) return -1
      if (!a.insurance && b.insurance) return 1
      if (a.needRepair && !b.needRepair) return -1
      if (!a.needRepair && b.needRepair) return 1
      if (a.underGuard && !b.underGuard) return -1
      if (!a.underGuard && b.underGuard) return 1
      if (a.hideAlert && !b.hideAlert) return 1
      if (!a.hideAlert && b.hideAlert) return -1
      if (a.where !== b.where) return a.where.localeCompare(b.where)
      const ai = iconOrder.findIndex((i) => a.icon.startsWith(i))
      const bi = iconOrder.findIndex((i) => b.icon.startsWith(i))
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.name.localeCompare(b.name)
    })
})

const deltaTime = computed(() => {
  const sd = lastSaveDate.value
  if (!sd?.date) return 0
  return Math.floor((Date.now() - sd.date) / (1000 * 60 * 60))
})

const allLocations = computed<VehicleLocation[]>(() => {
  const locs = [...VEHICLES_LOCATIONS]
  for (const c of companies.value) {
    if (c.isGarage) locs.push({ value: c.id, text: `${c.icon} ${c.name}`, home: false })
  }
  return locs
})

const monthGrouped = computed(() => {
  const grouped: Record<
    string,
    { month: string; year: number; totalPaid: number; histories: VehicleHistory[] }
  > = {}
  const sorted = [...vehicleHistories.value].sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
  for (const h of sorted) {
    const d = new Date(h.date ?? 0)
    const key = `${d.getMonth() + 1}-${d.getFullYear()}`
    if (!grouped[key]) {
      grouped[key] = {
        month: d.toLocaleString('fr-FR', { month: 'long' }),
        year: d.getFullYear(),
        totalPaid: 0,
        histories: [],
      }
    }
    grouped[key]!.histories.push(h)
    grouped[key]!.totalPaid += h.price
  }
  return grouped
})
const monthKeys = computed(() => Object.keys(monthGrouped.value))

const vehiclesCount = computed(() => sortedVehicles.value.length)
const vehiclesNeedRepairCount = computed(
  () => sortedVehicles.value.filter((v) => v.needRepair).length,
)
const vehiclesUnderGuardCount = computed(
  () => sortedVehicles.value.filter((v) => v.underGuard).length,
)
const vehiclesInsuranceCount = computed(
  () => sortedVehicles.value.filter((v) => v.insurance).length,
)
const fleetStatusLabel = computed(() => {
  const sd = lastSaveDate.value
  if (!sd?.date) return 'Aucune réparation flotte enregistrée'
  const dt = deltaTime.value
  if (dt < 24) return 'Flotte révisée récemment'
  if (dt < 36) return 'Contrôle flotte à prévoir'
  return 'Réparation flotte en retard'
})

// Helpers
function formatMoney(v: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(v)
    .replace('€', '$')
    .replace(',00', '')
}
function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR').slice(0, 16)
}
function getLocationName(val: string): string {
  return allLocations.value.find((l) => l.value === val)?.text ?? val
}
function getVehicleName(id: string | null): string {
  if (!id) return ''
  const v = vehicles.value.find((vv) => vv.id === id)
  return v ? `${v.icon}${v.name}` : ''
}
function getVehicleColor(v: Vehicule): string {
  if (v.underGuard) return 'accent'
  if (v.needRepair) return 'danger'
  if (v.insurance) return 'warning'
  return ''
}
function shouldShowRepairAlert(v: Vehicule): boolean {
  if (v.underGuard || v.hideAlert || !v.lastRepairDate) return false
  return Date.now() - v.lastRepairDate > 24 * 60 * 60 * 1000
}

// Repa flotte
function openRepaDialog(): void {
  const sel: Record<string, boolean> = {}
  for (const v of sortedVehicles.value) sel[v.id] = !v.underGuard && !v.hideAlert
  selectedVehicles.value = sel
  selectedGarage.value = null
  dialogRepa.value = true
}
async function repaFlotte(): Promise<void> {
  const garageId = selectedGarage.value
  if (!garageId) return
  const garage = companies.value.find((c) => c.id === garageId)
  if (!garage) return
  const sel = selectedVehicles.value
  const count = Object.values(sel).filter(Boolean).length
  const userId = userStore.profile?.id ?? ''
  logger.log(
    userId,
    'VEHICULES',
    `Réparation de la flotte - ${garage.icon} ${garage.name} (${count}/${sortedVehicles.value.length} véhicules réparés)`,
  )
  const sd = lastSaveDate.value
  if (sd?.id) await saveDatesApi.modifier(sd.id, { date: Date.now() })
  for (const vId of Object.keys(sel)) {
    if (sel[vId]) await vehiclesApi.modifier(vId, { lastRepairDate: Date.now(), needRepair: false })
  }
  await vehicleHistoriesApi.ajouter({
    date: Date.now(),
    vehicle: 'all',
    message: `Réparation de la flotte de véhicules - ${garage.icon} ${garage.name} (${count}/${sortedVehicles.value.length} véhicules réparés)`,
    price: 0,
  } as unknown as Record<string, unknown>)
  dialogRepa.value = false
}

async function repairNow(v: Vehicule): Promise<void> {
  logger.log(
    userStore.profile?.id ?? '',
    'VEHICULES',
    `${v.icon}${v.name} (${v.imat}) vient d'être réparé`,
  )
  await vehiclesApi.modifier(v.id, { needRepair: false, lastRepairDate: Date.now() })
}
async function needRepair(v: Vehicule): Promise<void> {
  logger.log(
    userStore.profile?.id ?? '',
    'VEHICULES',
    `${v.icon}${v.name} (${v.imat}) a besoin de réparation`,
  )
  await vehiclesApi.modifier(v.id, { needRepair: true })
}
async function insurance(v: Vehicule): Promise<void> {
  logger.log(
    userStore.profile?.id ?? '',
    'VEHICULES',
    `Demande d'assurance pour ${v.icon}${v.name} (${v.imat})`,
  )
  await vehicleHistoriesApi.ajouter({
    date: Date.now(),
    vehicle: v.id,
    message: `Demande d'assurance pour ${v.icon}${v.name} (${v.imat})`,
    price: 0,
  } as unknown as Record<string, unknown>)
  await vehiclesApi.modifier(v.id, { insurance: true })
}

// Guard dialog
function openGuardDialog(v: Vehicule): void {
  currentVehicle.value = v
  newLocation.value = null
  recupDateStr.value = new Date().toISOString().slice(0, 16)
  price.value = 0
  dialogGuard.value = true
}
async function guardVehicle(): Promise<void> {
  const v = currentVehicle.value
  const loc = newLocation.value
  const dateStr = recupDateStr.value
  if (!v || !loc || !dateStr) return
  const recupTs = new Date(dateStr).getTime()
  const fromLoc = getLocationName(v.where)
  const toLoc = getLocationName(loc)
  logger.log(
    userStore.profile?.id ?? '',
    'VEHICULES',
    `${v.icon}${v.name} envoyé de ${fromLoc} vers ${toLoc}`,
  )
  await vehicleHistoriesApi.ajouter({
    date: Date.now(),
    vehicle: v.id,
    message: `${v.icon}${v.name} (${v.imat}) envoyé depuis ${fromLoc} vers ${toLoc} (récupération le ${new Date(recupTs).toLocaleString('fr-FR')})`,
    price: 0,
  } as unknown as Record<string, unknown>)
  await vehiclesApi.modifier(v.id, {
    where: loc,
    underGuard: true,
    recupDate: recupTs,
    insurance: false,
  })
  dialogGuard.value = false
}

// Recup dialog
function openRecupDialog(v: Vehicule): void {
  if (v.insurance) {
    recoverInsurance(v)
    return
  }
  currentVehicle.value = v
  newLocation.value = null
  price.value = 0
  dialogRecup.value = true
}
async function recoverInsurance(v: Vehicule): Promise<void> {
  logger.log(
    userStore.profile?.id ?? '',
    'VEHICULES',
    `Assurance acceptée pour ${v.icon}${v.name} (${v.imat})`,
  )
  await vehicleHistoriesApi.ajouter({
    date: Date.now(),
    vehicle: v.id,
    message: `Assurance acceptée et récupération pour ${v.icon}${v.name} (${v.imat})`,
    price: 0,
  } as unknown as Record<string, unknown>)
  await vehiclesApi.modifier(v.id, { insurance: false })
}
async function recupVehicle(): Promise<void> {
  const v = currentVehicle.value
  const loc = newLocation.value
  const p = price.value
  if (!v || !loc) return
  const fromLoc = getLocationName(v.where)
  const toLoc = getLocationName(loc)
  logger.log(
    userStore.profile?.id ?? '',
    'VEHICULES',
    `Récupération de ${v.icon}${v.name} pour ${p}$ (${fromLoc} → ${toLoc})`,
  )
  await vehicleHistoriesApi.ajouter({
    date: Date.now(),
    vehicle: v.id,
    message: `Récupération de ${v.icon}${v.name} (${v.imat}) depuis ${fromLoc} vers ${toLoc} pour ${p}$`,
    price: p,
  } as unknown as Record<string, unknown>)
  await vehiclesApi.modifier(v.id, { where: loc, underGuard: false, recupDate: null })
  dialogRecup.value = false
}

// Vehicle CRUD
function openNewVehicle(): void {
  editVehicle.value = {
    icon: '',
    name: '',
    imat: '',
    where: 'garage',
    underGuard: false,
    recupDate: null,
    lastRepairDate: null,
    hideAlert: false,
    needRepair: false,
    insurance: false,
  }
  dialogVehicle.value = true
}
function openEditVehicle(v: Vehicule): void {
  editVehicle.value = { ...v }
  dialogVehicle.value = true
}
async function saveVehicle(): Promise<void> {
  const v = editVehicle.value
  const userId = userStore.profile?.id ?? ''
  if (v.id) {
    logger.log(userId, 'VEHICULES', `Modification du véhicule ${v.icon}${v.name}`)
    await vehiclesApi.modifier(v.id, v as unknown as Record<string, unknown>)
  } else {
    logger.log(userId, 'VEHICULES', `Création du véhicule ${v.icon}${v.name}`)
    await vehiclesApi.ajouter(v as unknown as Record<string, unknown>)
  }
  dialogVehicle.value = false
}
async function destroyVehicle(v: Vehicule): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: `Voulez-vous marquer le véhicule "${v.name}" comme détruit ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  logger.log(userStore.profile?.id ?? '', 'VEHICULES', `Destruction du véhicule ${v.icon}${v.name}`)
  await vehicleHistoriesApi.ajouter({
    date: Date.now(),
    vehicle: v.id,
    message: `Destruction du véhicule : ${v.icon}${v.name} (${v.imat})`,
    price: 0,
  } as unknown as Record<string, unknown>)
  await vehiclesApi.modifier(v.id, {
    where: 'dead',
    hideAlert: true,
    underGuard: false,
    recupDate: null,
    needRepair: false,
    insurance: false,
  })
}
async function deleteVehicle(v: Vehicule): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: `Voulez-vous vraiment supprimer le véhicule "${v.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  logger.log(userStore.profile?.id ?? '', 'VEHICULES', `Suppression du véhicule ${v.icon}${v.name}`)
  await vehiclesApi.supprimer(v.id)
}
function toggleSelectedVehicle(id: string): void {
  const sel = { ...selectedVehicles.value }
  sel[id] = !sel[id]
  selectedVehicles.value = sel
}

onMounted(() => {
  unsubs.push(
    vehiclesApi.ecouter((list) => {
      vehicles.value = list
    }),
  )
  unsubs.push(
    vehicleHistoriesApi.ecouter((list) => {
      vehicleHistories.value = list
    }),
  )
  unsubs.push(
    saveDatesApi.ecouterDocument('repa_flotte', (sd) => {
      lastSaveDate.value = sd
    }),
  )
})
onUnmounted(() => unsubs.forEach((u) => u()))
</script>

<template>
  <div class="garage-page">
    <!-- Hero -->
    <div class="page-header garage-hero">
      <div class="garage-hero__copy">
        <span class="garage-kicker">BCES Fleet Control</span>
        <h1>Garage</h1>
        <p>Suivi des réparations, gardiennages, assurances et historique des véhicules.</p>
      </div>
      <div class="garage-hero__stats">
        <article class="garage-stat-card">
          <span class="garage-stat-card__label">Véhicules actifs</span>
          <strong class="garage-stat-card__value">{{ vehiclesCount }}</strong>
        </article>
        <article class="garage-stat-card garage-stat-card--warn">
          <span class="garage-stat-card__label">À réparer</span>
          <strong class="garage-stat-card__value">{{ vehiclesNeedRepairCount }}</strong>
        </article>
        <article class="garage-stat-card garage-stat-card--accent">
          <span class="garage-stat-card__label">Gardiennage</span>
          <strong class="garage-stat-card__value">{{ vehiclesUnderGuardCount }}</strong>
        </article>
        <article class="garage-stat-card garage-stat-card--soft">
          <span class="garage-stat-card__label">Assurances</span>
          <strong class="garage-stat-card__value">{{ vehiclesInsuranceCount }}</strong>
        </article>
      </div>
    </div>

    <section class="garage-shell">
      <!-- Tabs -->
      <div class="tabs garage-tabs">
        <button :class="{ active: onglet === 'garage' }" @click="onglet = 'garage'">Garage</button>
        <button
          v-if="canViewHistory"
          :class="{ active: onglet === 'history' }"
          @click="onglet = 'history'"
        >
          Historique
        </button>
        <button
          v-if="canManageVehicles"
          :class="{ active: onglet === 'vehicles' }"
          @click="onglet = 'vehicles'"
        >
          Véhicules
        </button>
      </div>

      <!-- ===== GARAGE TAB ===== -->
      <div v-if="onglet === 'garage'" class="garage-content garage-panel">
        <div class="garage-toolbar">
          <div
            class="garage-status-banner"
            :class="{
              'text-success': deltaTime < 24,
              'text-danger': deltaTime >= 36,
            }"
          >
            <span class="garage-status-banner__icon">🚑</span>
            <div>
              <strong>{{ fleetStatusLabel }}</strong>
              <div v-if="lastSaveDate" class="garage-status-banner__meta">
                Dernière réparation flotte : {{ formatDate(lastSaveDate.date) }}
              </div>
              <div v-else class="garage-status-banner__meta">
                Aucune date enregistrée pour la réparation flotte.
              </div>
            </div>
          </div>
        </div>

        <div class="repa-row">
          <button class="btn accent" @click="openRepaDialog()">Faire une répa flotte</button>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 40px"></th>
              <th>Nom</th>
              <th>Immatriculation</th>
              <th>Localisation</th>
              <th>Info</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in sortedVehicles" :key="v.id">
              <td>
                <span v-if="v.needRepair" title="À réparer">⚠️</span>
                <span v-if="v.insurance" title="Assurance en cours">📋</span>
                <span v-if="v.underGuard" title="En gardiennage">🚛</span>
                <span
                  v-if="!v.underGuard && !v.insurance && shouldShowRepairAlert(v)"
                  title="Non réparé depuis longtemps"
                  >🔴</span
                >
              </td>
              <td :class="'text-' + getVehicleColor(v)">{{ v.icon }} {{ v.name }}</td>
              <td :class="'text-' + getVehicleColor(v)">{{ v.imat }}</td>
              <td>{{ getLocationName(v.where) }}</td>
              <td>
                <template v-if="v.underGuard && v.recupDate && v.recupDate > 0">
                  <span v-if="v.recupDate > Date.now()" class="text-accent"
                    >À récupérer le {{ formatDate(v.recupDate) }}</span
                  >
                  <span v-else class="text-success">À récupérer dès que possible</span>
                </template>
                <span v-else-if="v.needRepair" class="text-danger"
                  >À réparer avant utilisation</span
                >
                <span v-else-if="v.insurance" class="text-warning"
                  >En attente retour assurance</span
                >
              </td>
              <td class="action-cell">
                <button
                  v-if="!v.underGuard && !v.insurance"
                  class="btn-icon"
                  title="Vient d'être réparé"
                  @click="repairNow(v)"
                >
                  🔧
                </button>
                <button
                  v-if="!v.underGuard && !v.insurance && !v.needRepair"
                  class="btn-icon"
                  title="Besoin de réparation"
                  @click="needRepair(v)"
                >
                  ⚠️
                </button>
                <button
                  v-if="!v.underGuard && !v.insurance"
                  class="btn-icon"
                  title="Demande d'assurance"
                  @click="insurance(v)"
                >
                  📋
                </button>
                <button
                  v-if="!v.underGuard"
                  class="btn-icon"
                  title="Envoyer en gardiennage"
                  @click="openGuardDialog(v)"
                >
                  🚛
                </button>
                <button
                  v-if="(v.underGuard && v.recupDate && v.recupDate < Date.now()) || v.insurance"
                  class="btn-icon"
                  title="Récupérer"
                  @click="openRecupDialog(v)"
                >
                  🏠
                </button>
              </td>
            </tr>
            <tr v-if="sortedVehicles.length === 0">
              <td colspan="6" class="empty">Aucun véhicule</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ===== HISTORY TAB ===== -->
      <div v-if="onglet === 'history'" class="history-list garage-panel">
        <template v-for="key in monthKeys" :key="key">
          <details class="month-panel" open>
            <summary class="month-title">
              {{ monthGrouped[key]?.month }} {{ monthGrouped[key]?.year }} ({{
                monthGrouped[key]?.histories.length ?? 0
              }}
              opération(s) : {{ formatMoney(monthGrouped[key]?.totalPaid ?? 0) }})
            </summary>
            <details
              v-for="(h, hIdx) in monthGrouped[key]?.histories ?? []"
              :key="h.id ?? hIdx"
              class="history-entry"
            >
              <summary class="history-header">
                <span v-if="h.vehicle === 'all'">🚑</span>
                <span v-else-if="h.message.includes('Récupération')">🔙</span>
                <span v-else-if="h.message.includes('envoyé')">🛠️</span>
                Le {{ formatDate(h.date ?? 0) }}
                <template v-if="h.vehicle === 'all'">(Répa flotte)</template>
                <template v-else>({{ getVehicleName(h.vehicle) }})</template>
                <span v-if="h.price > 0" class="history-price">{{ formatMoney(h.price) }}</span>
              </summary>
              <div class="history-detail">{{ h.message }}</div>
            </details>
          </details>
        </template>
        <p v-if="monthKeys.length === 0" class="empty">Aucun historique</p>
      </div>

      <!-- ===== VEHICLES TAB ===== -->
      <div v-if="onglet === 'vehicles'" class="vehicles-content garage-panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Immatriculation</th>
              <th>Localisation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in sortedVehicles" :key="v.id">
              <td>{{ v.icon }} {{ v.name }}</td>
              <td>{{ v.imat }}</td>
              <td>{{ getLocationName(v.where) }}</td>
              <td class="action-cell">
                <button class="btn-icon" title="Modifier" @click="openEditVehicle(v)">✏️</button>
                <button class="btn-icon" title="Détruire" @click="destroyVehicle(v)">⚰️</button>
                <button class="btn-icon danger" title="Supprimer" @click="deleteVehicle(v)">
                  🗑️
                </button>
              </td>
            </tr>
            <tr v-if="sortedVehicles.length === 0">
              <td colspan="4" class="empty">Aucun véhicule</td>
            </tr>
          </tbody>
        </table>
        <div class="add-row">
          <button class="btn accent" @click="openNewVehicle()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Ajouter un véhicule
          </button>
        </div>
      </div>

      <!-- Repa flotte dialog -->
      <Teleport to="body">
        <div v-if="dialogRepa" class="overlay" @click="dialogRepa = false">
          <div class="dialog" @click.stop>
            <h3 class="dialog-title">Répa flotte</h3>
            <div class="form-group">
              <label>Garage</label>
              <select class="field" v-model="selectedGarage">
                <option :value="null" disabled>Choisir un garage</option>
                <template v-for="c in companies" :key="c.id">
                  <option v-if="c.isGarage" :value="c.id">{{ c.icon }} {{ c.name }}</option>
                </template>
              </select>
            </div>
            <div class="vehicle-checklist">
              <label v-for="v in sortedVehicles" :key="v.id" class="check-item">
                <input
                  type="checkbox"
                  :checked="!!selectedVehicles[v.id]"
                  @change="toggleSelectedVehicle(v.id)"
                />
                {{ v.icon }} {{ v.name }} ({{ v.imat }})
              </label>
            </div>
            <div class="dialog-actions">
              <button class="btn accent" @click="repaFlotte()">Valider</button>
              <button class="btn danger" @click="dialogRepa = false">Annuler</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Guard dialog -->
      <Teleport to="body">
        <div v-if="dialogGuard" class="overlay" @click="dialogGuard = false">
          <div class="dialog dialog-sm" @click.stop>
            <h3 class="dialog-title">Envoyer en gardiennage</h3>
            <div class="form-group">
              <label>Localisation</label>
              <select class="field" v-model="newLocation">
                <option :value="null" disabled>Choisir</option>
                <option v-for="l in allLocations" :key="l.value" :value="l.value">
                  {{ l.text }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Date de récupération</label>
              <input type="datetime-local" class="field" v-model="recupDateStr" />
            </div>
            <div class="dialog-actions">
              <button class="btn accent" @click="guardVehicle()">Valider</button>
              <button class="btn danger" @click="dialogGuard = false">Annuler</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Recup dialog -->
      <Teleport to="body">
        <div v-if="dialogRecup" class="overlay" @click="dialogRecup = false">
          <div class="dialog dialog-sm" @click.stop>
            <h3 class="dialog-title">Récupérer le véhicule</h3>
            <div class="form-group">
              <label>Nouvelle localisation</label>
              <select class="field" v-model="newLocation">
                <option :value="null" disabled>Choisir</option>
                <option v-for="l in allLocations" :key="l.value" :value="l.value">
                  {{ l.text }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Coût ($)</label>
              <input type="number" class="field" v-model.number="price" />
            </div>
            <div class="dialog-actions">
              <button class="btn accent" @click="recupVehicle()">Valider</button>
              <button class="btn danger" @click="dialogRecup = false">Annuler</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Vehicle edit dialog -->
      <Teleport to="body">
        <div v-if="dialogVehicle" class="overlay" @click="dialogVehicle = false">
          <div class="dialog dialog-sm" @click.stop>
            <h3 class="dialog-title">{{ editVehicle.id ? 'Modifier' : 'Ajouter' }} un véhicule</h3>
            <div class="form-group">
              <label>Icône</label>
              <input type="text" class="field" v-model="editVehicle.icon" />
            </div>
            <div class="form-group">
              <label>Nom</label>
              <input type="text" class="field" v-model="editVehicle.name" />
            </div>
            <div class="form-group">
              <label>Immatriculation</label>
              <input type="text" class="field" v-model="editVehicle.imat" />
            </div>
            <div class="form-group">
              <label>Localisation</label>
              <select class="field" v-model="editVehicle.where">
                <option v-for="l in allLocations" :key="l.value" :value="l.value">
                  {{ l.text }}
                </option>
              </select>
            </div>
            <label class="check-item">
              <input type="checkbox" v-model="editVehicle.hideAlert" />
              Réparation facultative
            </label>
            <div class="dialog-actions">
              <button class="btn accent" @click="saveVehicle()">Valider</button>
              <button class="btn danger" @click="dialogVehicle = false">Annuler</button>
            </div>
          </div>
        </div>
      </Teleport>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.garage-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  animation: fadeIn 0.28s ease;
}

.garage-hero {
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

.garage-hero__copy h1 {
  margin: 0.1rem 0 0.35rem;
  color: #f4f9ff;
  font-size: 1.72rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.garage-hero__copy p {
  margin: 0;
  max-width: 56ch;
  color: #a9c7e2;
  font-size: 0.92rem;
  line-height: 1.5;
}

.garage-kicker {
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

.garage-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.garage-stat-card {
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  border: 1px solid rgba(116, 177, 227, 0.15);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.garage-stat-card__label {
  display: block;
  color: #9fbad4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.garage-stat-card__value {
  display: block;
  margin-top: 0.25rem;
  color: #ffffff;
  font-size: 1.36rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.garage-stat-card--warn .garage-stat-card__value {
  color: #ffbe7a;
}

.garage-stat-card--accent .garage-stat-card__value {
  color: #86dcff;
}

.garage-stat-card--soft .garage-stat-card__value {
  color: #f3d2ff;
}

.garage-shell {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.tabs.garage-tabs {
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
    display: inline-flex;
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

.garage-panel {
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

.garage-content,
.vehicles-content,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.garage-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.garage-status-banner {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  width: 100%;
  padding: 0.88rem 0.95rem;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  background: color-mix(in srgb, var(--theme-soft-band) 80%, var(--surface-elevated) 20%);
}

.garage-status-banner__icon {
  display: inline-grid;
  place-items: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(82, 170, 255, 0.24), rgba(41, 98, 159, 0.18));
  font-size: 1.2rem;
}

.garage-status-banner strong {
  display: block;
  color: var(--text-primary);
  font-size: 0.92rem;
}

.garage-status-banner__meta {
  margin-top: 0.16rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.repa-row,
.add-row {
  display: flex;
  justify-content: flex-start;
  margin: 0;
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
    border-bottom: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
    font-size: 0.82rem;
    text-align: left;
  }

  th {
    background: linear-gradient(180deg, #121b2f, #0f172a);
    font-weight: 800;
    font-size: 0.7rem;
    text-transform: uppercase;
    color: #bfd0e6;
    position: sticky;
    top: 0;
    letter-spacing: 0.08em;
  }

  tbody tr {
    transition: background 0.14s ease;
  }

  tbody tr:hover {
    background: color-mix(in srgb, var(--surface-hover) 78%, var(--accent-subtle) 22%);
  }
}

.action-cell {
  white-space: nowrap;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.18rem;
}

/* History */
.history-list {
  gap: 0.7rem;
}

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
}

.history-price {
  color: var(--accent);
  margin-left: 0.5rem;
}

.history-detail {
  padding: 0.18rem 1.5rem 0.72rem;
  font-size: 0.8rem;
  color: var(--text-muted);
  border-left: 2px solid color-mix(in srgb, var(--dispatch-zone-border) 52%, transparent 48%);
  margin-left: 1rem;
}

/* Vehicle checklist */
.vehicle-checklist {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0.5rem 0;
  padding-right: 0.15rem;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent 8%);

  input[type='checkbox'] {
    accent-color: var(--accent);
  }
}

/* Dialogs */
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
  max-width: 400px;
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
  color: var(--text);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  border-radius: 10px;
  font-size: 0.85rem;
}

.field-sm {
  width: auto;
  padding: 0.35rem 0.5rem;
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
  color: var(--text);
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
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 2.2rem;
}

.text-accent {
  color: var(--accent);
}

.text-success {
  color: var(--success);
}

.text-danger {
  color: var(--danger);
}

.text-warning {
  color: var(--warning);
}

@media (max-width: 768px) {
  .garage-page {
    padding: 1rem;
  }

  .garage-hero {
    grid-template-columns: 1fr;
  }

  .garage-hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tabs.garage-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .data-table {
    display: block;
    overflow-x: auto;
  }
}

@media (max-width: 560px) {
  .garage-hero__stats {
    grid-template-columns: 1fr;
  }

  .garage-status-banner {
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
