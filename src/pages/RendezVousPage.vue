<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import { fetchFormResponses, markRowAsImported, type FormRequest } from '@/utils/google-form'
import {
  fetchPsyFormResponses,
  markPsyRowAsImported,
  type PsyFormRequest,
} from '@/utils/google-form-psy'
import type { Appointment } from '@/models/appointment'
import type { Specialty } from '@/models/specialty'
import type { Effectif } from '@/models/effectif'
import Swal from 'sweetalert2'

type ViewMode = 'list' | 'agenda' | 'demandes' | 'demandesPsy'

interface CurrentAppointment {
  id: string | null
  patientName: string
  patientPhone: string
  specialty: string
  date: string
  time: string
  duration: number
  reason: string
  status: string
  doctor: string
  companion: string
  notes: string
  availability: string
  createdAt?: number
  _sheetRowNumber?: number
  _isPsyRequest?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  'En attente': '#FB8C00',
  Programmé: '#2196F3',
  Terminé: '#4CAF50',
  Annulé: '#F44336',
}
const STATUTS = ['Tous', 'En attente', 'Programmé', 'Terminé', 'Annulé']

const appointmentsApi = useCollection<Appointment>('appointments')
const specialtiesApi = useCollection<Specialty>('specialties')
const employeesApi = useCollection<Effectif>('employees')
const userStore = useUserStore()

const appointments = ref<Appointment[]>([])
const specialties = ref<Specialty[]>([])
const employees = ref<Effectif[]>([])
const specialtiesLoaded = ref(false)
const employeesLoaded = ref(false)

const viewMode = ref<ViewMode>('list')
const filterSpecialty = ref('')
const filterStatus = ref('Tous')

const isModalOpen = ref(false)
const isEditing = ref(false)
const isSaving = ref(false)
const isRecapOpen = ref(false)
const recapAppointment = ref<Appointment | null>(null)
const currentAppointment = ref<CurrentAppointment>(emptyAppointment())

const formRequests = ref<FormRequest[]>([])
const isLoadingRequests = ref(false)
const formRequestsError = ref<string | null>(null)

const psyRequests = ref<PsyFormRequest[]>([])
const isLoadingPsyRequests = ref(false)
const psyRequestsError = ref<string | null>(null)

const unsubs: (() => void)[] = []

const isLoaded = computed(() => specialtiesLoaded.value && employeesLoaded.value)

const hasAccess = computed(() => {
  const perms = userStore.profile?.permissions ?? []
  if (perms.some((p) => ['dev', 'admin'].includes(p))) return true
  const name = userStore.profile?.name?.toLowerCase().trim()
  const emp = employees.value.find((e) => e.name?.toLowerCase().trim() === name)
  if (!emp) return false
  if (['Directeur', 'Directeur Adjoint'].includes(emp.role)) return true
  const allSpecs = [...(emp.specialties || []), ...(emp.chiefSpecialties || [])]
  return allSpecs.some((s) => {
    const spec = specialties.value.find((sp) => sp.value === s || sp.name === s)
    return spec?.canTakeAppointments
  })
})

const hasPsyAccess = computed(() => {
  const perms = userStore.profile?.permissions ?? []
  if (perms.some((p) => ['dev', 'admin'].includes(p))) return true
  const name = userStore.profile?.name?.toLowerCase().trim()
  const emp = employees.value.find((e) => e.name?.toLowerCase().trim() === name)
  if (!emp) return false
  if (['Directeur', 'Directeur Adjoint'].includes(emp.role)) return true
  const allSpecs = [...(emp.specialties || []), ...(emp.chiefSpecialties || [])]
  return allSpecs.some((s) => {
    const spec = specialties.value.find((sp) => sp.value === s || sp.name === s)
    return spec?.name.toLowerCase().includes('psy')
  })
})

const specialtiesList = computed(() => specialties.value.filter((s) => s.canTakeAppointments))

const filteredAppointments = computed(() => {
  let list = appointments.value
  const perms = userStore.profile?.permissions ?? []
  const isGlobalAdmin = perms.some((p) => ['dev', 'admin'].includes(p))
  const profileName = userStore.profile?.name?.toLowerCase().trim()
  const emp = employees.value.find((e) => e.name?.toLowerCase().trim() === profileName)
  const isDirector = emp && ['Directeur', 'Directeur Adjoint'].includes(emp.role)

  if (!isGlobalAdmin && !isDirector && emp) {
    const allSpecs = [...(emp.specialties || []), ...(emp.chiefSpecialties || [])]
    if (allSpecs.length > 0) {
      const specNames = specialties.value
        .filter((sp) => allSpecs.includes(sp.value) || allSpecs.includes(sp.name))
        .map((sp) => sp.name)
      list = list.filter((app) => specNames.includes(app.specialty))
    }
  }

  const spec = filterSpecialty.value
  const status = filterStatus.value
  return list.filter((app) => {
    if (spec && app.specialty !== spec) return false
    if (status && status !== 'Tous' && app.status !== status) return false
    return true
  })
})

const doctorsForSpecialty = computed(() => {
  const specName = currentAppointment.value.specialty
  if (!specName) return [] as string[]
  const spec = specialties.value.find((s) => s.name === specName)
  if (!spec) return [] as string[]
  return employees.value
    .filter((e) => e.specialties?.includes(spec.value))
    .map((e) => e.name)
    .sort()
})

const allDoctors = computed(() =>
  employees.value
    .filter((e) => e.specialties && e.specialties.length > 0)
    .map((e) => e.name)
    .sort(),
)

const newRequestsCount = computed(
  () => formRequests.value.filter((r) => !isAlreadyImported(r)).length,
)
const newPsyRequestsCount = computed(
  () => psyRequests.value.filter((r) => !isAlreadyImported(r)).length,
)

// ─── Calendar ───────────────────────────────
const calendarDate = ref(new Date())

const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

const calendarMonthLabel = computed(() =>
  calendarDate.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
)

interface CalendarDay {
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  appointments: Appointment[]
}

const calendarDays = computed((): CalendarDay[] => {
  const d = calendarDate.value
  const year = d.getFullYear()
  const month = d.getMonth()

  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const start = new Date(year, month, 1 - startOffset)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const days: CalendarDay[] = []
  const apps = filteredAppointments.value

  for (let i = 0; i < 42; i++) {
    const current = new Date(start)
    current.setDate(start.getDate() + i)
    const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    days.push({
      dateStr,
      day: current.getDate(),
      isCurrentMonth: current.getMonth() === month,
      isToday: dateStr === todayStr,
      appointments: apps.filter((a) => a.date === dateStr),
    })
  }
  return days
})

function calendarPrev(): void {
  const d = calendarDate.value
  calendarDate.value = new Date(d.getFullYear(), d.getMonth() - 1, 1)
}

function calendarNext(): void {
  const d = calendarDate.value
  calendarDate.value = new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

function calendarToday(): void {
  calendarDate.value = new Date()
}

// ─── Helpers ────────────────────────────────
function emptyAppointment(): CurrentAppointment {
  return {
    id: null,
    patientName: '',
    patientPhone: '',
    specialty: '',
    date: new Date().toISOString().split('T')[0] ?? '',
    time: '',
    reason: '',
    status: 'En attente',
    doctor: '',
    companion: '',
    duration: 30,
    notes: '',
    availability: '',
  }
}

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#9E9E9E'
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'En attente':
      return 'attente'
    case 'Programmé':
      return 'programme'
    case 'Terminé':
      return 'termine'
    case 'Annulé':
      return 'annule'
    default:
      return ''
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${d}/${m}/${y}`
}

function formatTimestamp(ts: string | number | undefined): string {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return String(ts)
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(ts)
  }
}

function truncate(text: string, max: number): string {
  if (!text) return '—'
  return text.length > max ? text.substring(0, max) + '...' : text
}

function getSpecialtyIcon(name: string): string {
  return specialties.value.find((s) => s.name === name)?.icon ?? ''
}

// ─── Modal ──────────────────────────────────
function openAddModal(): void {
  isEditing.value = false
  currentAppointment.value = emptyAppointment()
  isModalOpen.value = true
}

function openEditModal(app: Appointment): void {
  isEditing.value = true
  currentAppointment.value = { ...app } as CurrentAppointment
  isModalOpen.value = true
}

function closeModal(): void {
  isModalOpen.value = false
}

function openRecapModal(app: Appointment): void {
  recapAppointment.value = app
  isRecapOpen.value = true
}

function closeRecap(): void {
  isRecapOpen.value = false
}

function editFromRecap(): void {
  const app = recapAppointment.value
  isRecapOpen.value = false
  if (app) openEditModal(app)
}

async function saveAppointment(): Promise<void> {
  const ca = currentAppointment.value
  if (!ca.patientName || !ca.specialty || !ca.date || !ca.reason) {
    void Swal.fire('Erreur', 'Veuillez remplir tous les champs obligatoires (*)', 'error')
    return
  }
  isSaving.value = true
  try {
    const data: Record<string, unknown> = {
      patientName: ca.patientName,
      patientPhone: ca.patientPhone,
      specialty: ca.specialty,
      date: ca.date,
      time: ca.time,
      duration: ca.duration,
      reason: ca.reason,
      status: ca.status,
      doctor: ca.doctor,
      companion: ca.companion,
      notes: ca.notes,
      availability: ca.availability,
      createdAt: ca.createdAt ?? Date.now(),
    }
    if (ca.id) {
      await appointmentsApi.modifier(ca.id, data)
    } else {
      await appointmentsApi.ajouter(data)
    }
    if (ca._sheetRowNumber) {
      if (ca._isPsyRequest) markPsyRowAsImported(ca._sheetRowNumber)
      else markRowAsImported(ca._sheetRowNumber)
    }
    void Swal.fire('Succès', 'Le rendez-vous a été enregistré.', 'success')
    closeModal()
  } catch (err) {
    console.error(err)
    void Swal.fire('Erreur', 'Impossible de sauvegarder le rendez-vous.', 'error')
  } finally {
    isSaving.value = false
  }
}

async function confirmDelete(app: Appointment): Promise<void> {
  const result = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: 'Voulez-vous vraiment supprimer ce rendez-vous ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer !',
    cancelButtonText: 'Annuler',
  })
  if (result.isConfirmed && app.id) {
    try {
      await appointmentsApi.supprimer(app.id)
      void Swal.fire('Supprimé !', 'Le rendez-vous a été supprimé.', 'success')
    } catch (err) {
      console.error(err)
      void Swal.fire('Erreur', 'Impossible de supprimer le rendez-vous.', 'error')
    }
  }
}

// ─── View mode ──────────────────────────────
function setViewMode(mode: ViewMode): void {
  viewMode.value = mode
  if (mode === 'demandes' && formRequests.value.length === 0) void loadFormRequests()
  if (mode === 'demandesPsy' && psyRequests.value.length === 0) void loadPsyRequests()
}

// ─── Google Forms ───────────────────────────
async function loadFormRequests(): Promise<void> {
  isLoadingRequests.value = true
  formRequestsError.value = null
  try {
    formRequests.value = await fetchFormResponses()
  } catch {
    formRequestsError.value = 'Impossible de charger les demandes Google Forms.'
  } finally {
    isLoadingRequests.value = false
  }
}

async function loadPsyRequests(): Promise<void> {
  isLoadingPsyRequests.value = true
  psyRequestsError.value = null
  try {
    psyRequests.value = await fetchPsyFormResponses()
  } catch {
    psyRequestsError.value = 'Impossible de charger les demandes Psy.'
  } finally {
    isLoadingPsyRequests.value = false
  }
}

function isAlreadyImported(request: FormRequest | PsyFormRequest): boolean {
  return appointments.value.some(
    (app) =>
      app.patientName?.toLowerCase().trim() === request.patientName?.toLowerCase().trim() &&
      app.createdAt === request.createdAt,
  )
}

function importRequest(request: FormRequest): void {
  isEditing.value = false
  let matchedSpecialty = ''
  if (request.specialty) {
    const match = specialtiesList.value.find(
      (s) => request.specialty.includes(s.name) || request.specialty.includes(s.icon),
    )
    if (match) matchedSpecialty = match.name
  }
  currentAppointment.value = {
    id: null,
    patientName: request.patientName,
    patientPhone: request.patientPhone,
    specialty: matchedSpecialty,
    date: new Date().toISOString().split('T')[0] ?? '',
    time: '',
    reason: request.reason || request.notes || '',
    status: 'En attente',
    doctor: '',
    companion: '',
    duration: 30,
    notes: request.notes || '',
    availability: request.availability,
    createdAt: request.createdAt,
    _sheetRowNumber: request._sheetRowNumber,
  }
  isModalOpen.value = true
}

function importPsyRequest(request: PsyFormRequest): void {
  isEditing.value = false
  const psySpec = specialtiesList.value.find((s) => s.name.toLowerCase().includes('psy'))
  let baseNotes = ''
  if (request.category) baseNotes += `Catégorie: ${request.category}\n`
  if (request.notes) baseNotes += `Divers: ${request.notes}`
  currentAppointment.value = {
    id: null,
    patientName: request.patientName,
    patientPhone: request.patientPhone,
    specialty: psySpec?.name ?? 'Psychologue',
    date: new Date().toISOString().split('T')[0] ?? '',
    time: '',
    reason: request.reason || '',
    status: 'En attente',
    doctor: '',
    companion: '',
    duration: 30,
    notes: baseNotes.trim(),
    availability: request.availability,
    createdAt: request.createdAt,
    _sheetRowNumber: request._sheetRowNumber,
    _isPsyRequest: true,
  }
  isModalOpen.value = true
}

// ─── Lifecycle ──────────────────────────────
onMounted(() => {
  unsubs.push(
    appointmentsApi.ecouter((data) => {
      appointments.value = data
    }),
  )
  unsubs.push(
    specialtiesApi.ecouter((data) => {
      specialties.value = data
      specialtiesLoaded.value = true
    }),
  )
  unsubs.push(
    employeesApi.ecouter((data) => {
      employees.value = data
      employeesLoaded.value = true
    }),
  )
})
onUnmounted(() => unsubs.forEach((u) => u()))
</script>

<template>
  <div class="rdv-page">
    <div class="rendez-vous-page">
      <!-- Page header -->
      <div class="page-header">
        <h1>📅 Gestion des Rendez-vous</h1>
        <div class="actions">
          <div class="vue-toggle">
            <button :class="{ active: viewMode === 'list' }" @click="setViewMode('list')">
              📋 Liste
            </button>
            <button :class="{ active: viewMode === 'agenda' }" @click="setViewMode('agenda')">
              📅 Agenda
            </button>
            <button
              v-if="hasAccess"
              :class="{ active: viewMode === 'demandes' }"
              @click="setViewMode('demandes')"
            >
              📝 Demandes
              <span v-if="newRequestsCount" class="notif-badge">{{ newRequestsCount }}</span>
            </button>
            <button
              v-if="hasPsyAccess"
              :class="{ active: viewMode === 'demandesPsy' }"
              @click="setViewMode('demandesPsy')"
            >
              🧠 Demandes Psy
              <span v-if="newPsyRequestsCount" class="notif-badge">{{ newPsyRequestsCount }}</span>
            </button>
          </div>
          <button
            v-if="viewMode !== 'demandes' && viewMode !== 'demandesPsy'"
            class="btn-primary"
            @click="openAddModal"
          >
            + Nouveau RDV
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div v-if="viewMode === 'list' || viewMode === 'agenda'" class="filters-bar">
        <select v-model="filterSpecialty">
          <option value="">Toutes spécialités</option>
          <option v-for="s in specialtiesList" :key="s.value" :value="s.name">
            {{ s.icon }} {{ s.name }}
          </option>
        </select>
        <select v-model="filterStatus">
          <option v-for="st in STATUTS" :key="st" :value="st">{{ st }}</option>
        </select>
      </div>

      <!-- LIST VIEW -->
      <table v-if="viewMode === 'list'" class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Heure</th>
            <th>Patient</th>
            <th>Téléphone</th>
            <th>Spécialité</th>
            <th>Médecin</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(a, idx) in filteredAppointments" :key="a.id ?? idx">
            <td>{{ formatDate(a.date) }}</td>
            <td>{{ a.time || '—' }}</td>
            <td>{{ a.patientName }}</td>
            <td>{{ a.patientPhone || '—' }}</td>
            <td>{{ getSpecialtyIcon(a.specialty) }} {{ a.specialty }}</td>
            <td>{{ a.doctor || '—' }}</td>
            <td>
              <span :class="['statut-badge', getStatusClass(a.status)]">{{ a.status }}</span>
            </td>
            <td class="actions-cell">
              <button class="btn-icon" title="Voir" @click="openRecapModal(a)">👁️</button>
              <button class="btn-icon" title="Modifier" @click="openEditModal(a)">✏️</button>
              <button class="btn-icon danger" title="Supprimer" @click="confirmDelete(a)">
                🗑️
              </button>
            </td>
          </tr>
          <tr v-if="filteredAppointments.length === 0">
            <td colspan="8" class="empty">Aucun rendez-vous</td>
          </tr>
        </tbody>
      </table>

      <!-- AGENDA VIEW (Calendar) -->
      <div v-if="viewMode === 'agenda'" class="calendar-wrapper">
        <div class="calendar-nav">
          <button class="btn-icon" title="Mois précédent" @click="calendarPrev">◀</button>
          <button class="btn-small" @click="calendarToday">Aujourd'hui</button>
          <span class="calendar-title">{{ calendarMonthLabel }}</span>
          <button class="btn-icon" title="Mois suivant" @click="calendarNext">▶</button>
        </div>
        <div class="calendar-grid">
          <div v-for="j in JOURS_SEMAINE" :key="j" class="calendar-header-cell">{{ j }}</div>
          <div
            v-for="(day, idx) in calendarDays"
            :key="idx"
            :class="['calendar-cell', { 'other-month': !day.isCurrentMonth, today: day.isToday }]"
          >
            <span class="cell-day">{{ day.day }}</span>
            <div class="cell-events">
              <div
                v-for="(a, aIdx) in day.appointments"
                :key="a.id ?? aIdx"
                class="cal-event"
                :style="{ borderLeftColor: getStatusColor(a.status) }"
                :title="`${a.patientName} — ${a.specialty}`"
                @click="openRecapModal(a)"
              >
                <span class="cal-event-time">{{ a.time || '—' }}</span>
                <span class="cal-event-name">{{ a.patientName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- DEMANDES (Google Forms) -->
      <div v-if="viewMode === 'demandes'" class="card">
        <div class="card-header">
          <h2>📝 Demandes Google Forms</h2>
          <button class="btn-small" @click="loadFormRequests">
            <i class="fa-solid fa-rotate" aria-hidden="true"></i> Recharger
          </button>
        </div>
        <div v-if="isLoadingRequests" class="empty">Chargement…</div>
        <div v-else-if="formRequestsError" class="empty" style="color: #ef9a9a">
          {{ formRequestsError }}
        </div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Téléphone</th>
              <th>Spécialité</th>
              <th>Disponibilité</th>
              <th>Motif</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in formRequests"
              :key="r._sheetRowNumber"
              :class="{ 'already-imported': isAlreadyImported(r) }"
            >
              <td>{{ r.patientName }}</td>
              <td>{{ r.patientPhone || '—' }}</td>
              <td>{{ r.specialty || '—' }}</td>
              <td>{{ truncate(r.availability, 40) }}</td>
              <td>{{ truncate(r.reason || r.notes, 40) }}</td>
              <td>
                <button v-if="!isAlreadyImported(r)" class="btn-small" @click="importRequest(r)">
                  + Importer
                </button>
                <span v-else class="statut-badge termine">Importé</span>
              </td>
            </tr>
            <tr v-if="formRequests.length === 0">
              <td colspan="6" class="empty">Aucune demande</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- DEMANDES PSY -->
      <div v-if="viewMode === 'demandesPsy'" class="card">
        <div class="card-header">
          <h2>🧠 Demandes Psy</h2>
          <button class="btn-small" @click="loadPsyRequests">
            <i class="fa-solid fa-rotate" aria-hidden="true"></i> Recharger
          </button>
        </div>
        <div v-if="isLoadingPsyRequests" class="empty">Chargement…</div>
        <div v-else-if="psyRequestsError" class="empty" style="color: #ef9a9a">
          {{ psyRequestsError }}
        </div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Téléphone</th>
              <th>Catégorie</th>
              <th>Disponibilité</th>
              <th>Motif</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in psyRequests"
              :key="r._sheetRowNumber"
              :class="{ 'already-imported': isAlreadyImported(r) }"
            >
              <td>{{ r.patientName }}</td>
              <td>{{ r.patientPhone || '—' }}</td>
              <td>{{ r.category || '—' }}</td>
              <td>{{ truncate(r.availability, 40) }}</td>
              <td>{{ truncate(r.reason, 40) }}</td>
              <td>
                <button v-if="!isAlreadyImported(r)" class="btn-small" @click="importPsyRequest(r)">
                  + Importer
                </button>
                <span v-else class="statut-badge termine">Importé</span>
              </td>
            </tr>
            <tr v-if="psyRequests.length === 0">
              <td colspan="6" class="empty">Aucune demande</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CREATE/EDIT MODAL -->
    <Teleport to="body">
      <div v-if="isModalOpen" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h2>{{ isEditing ? 'Modifier le RDV' : 'Nouveau RDV' }}</h2>
            <button class="btn-close" @click="closeModal">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <label
                >Nom du patient *
                <input type="text" v-model="currentAppointment.patientName" />
              </label>
              <label
                >Téléphone
                <input type="text" v-model="currentAppointment.patientPhone" />
              </label>
            </div>
            <label
              >Spécialité demandée *
              <select v-model="currentAppointment.specialty">
                <option value="">Sélectionner</option>
                <option v-for="s in specialtiesList" :key="s.value" :value="s.name">
                  {{ s.icon }} {{ s.name }}
                </option>
              </select>
            </label>
            <div class="form-row">
              <label
                >Date *
                <input type="date" v-model="currentAppointment.date" />
              </label>
              <label
                >Heure
                <input type="time" v-model="currentAppointment.time" />
              </label>
              <label
                >Durée (min)
                <select v-model.number="currentAppointment.duration">
                  <option :value="30">30</option>
                  <option :value="45">45</option>
                  <option :value="60">60</option>
                  <option :value="90">90</option>
                  <option :value="120">120</option>
                </select>
              </label>
            </div>
            <label
              >Motif *
              <textarea rows="3" v-model="currentAppointment.reason"></textarea>
            </label>
            <label
              >Disponibilités du patient
              <textarea rows="2" v-model="currentAppointment.availability"></textarea>
            </label>
            <div class="form-row">
              <label
                >Statut
                <select v-model="currentAppointment.status">
                  <option value="En attente">En attente</option>
                  <option value="Programmé">Programmé</option>
                  <option value="Terminé">Terminé</option>
                  <option value="Annulé">Annulé</option>
                </select>
              </label>
              <label
                >Médecin en charge
                <select v-model="currentAppointment.doctor">
                  <option value="">—</option>
                  <option v-for="d in doctorsForSpecialty" :key="d" :value="d">{{ d }}</option>
                </select>
              </label>
            </div>
            <label
              >Médecin accompagnant
              <select v-model="currentAppointment.companion">
                <option value="">Aucun</option>
                <option v-for="d in allDoctors" :key="d" :value="d">{{ d }}</option>
              </select>
            </label>
            <label
              >Notes / Compte-rendu
              <textarea rows="4" v-model="currentAppointment.notes"></textarea>
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="closeModal">Annuler</button>
            <button class="btn-primary" :disabled="isSaving" @click="saveAppointment">
              {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- RECAP MODAL -->
    <Teleport to="body">
      <div v-if="isRecapOpen && recapAppointment" class="modal-overlay" @click="closeRecap">
        <div class="modal-content recap-modal" @click.stop>
          <div class="modal-header recap-header">
            <h2>📋 Récapitulatif</h2>
            <span :class="['statut-badge', getStatusClass(recapAppointment.status)]">{{
              recapAppointment.status
            }}</span>
          </div>
          <div class="modal-body">
            <div class="recap-row">
              <div class="recap-label">Patient</div>
              <div class="recap-value">{{ recapAppointment.patientName }}</div>
            </div>
            <div v-if="recapAppointment.patientPhone" class="recap-row">
              <div class="recap-label">Téléphone</div>
              <div class="recap-value">{{ recapAppointment.patientPhone }}</div>
            </div>
            <hr />
            <div class="recap-grid">
              <div>
                <div class="recap-label">Date</div>
                <div>{{ formatDate(recapAppointment.date) || '—' }}</div>
              </div>
              <div>
                <div class="recap-label">Heure</div>
                <div>{{ recapAppointment.time || '—' }}</div>
              </div>
              <div>
                <div class="recap-label">Durée</div>
                <div>{{ recapAppointment.duration }} min</div>
              </div>
            </div>
            <hr />
            <div class="recap-row">
              <div class="recap-label">Spécialité</div>
              <div class="recap-value">
                {{ getSpecialtyIcon(recapAppointment.specialty) }}
                {{ recapAppointment.specialty || '—' }}
              </div>
            </div>
            <div class="recap-row">
              <div class="recap-label">Médecin</div>
              <div class="recap-value">{{ recapAppointment.doctor || '—' }}</div>
            </div>
            <div v-if="recapAppointment.companion" class="recap-row">
              <div class="recap-label">Accompagnant</div>
              <div class="recap-value">{{ recapAppointment.companion }}</div>
            </div>
            <hr />
            <div class="recap-row">
              <div class="recap-label">Motif</div>
              <div class="recap-value recap-text">{{ recapAppointment.reason || '—' }}</div>
            </div>
            <div v-if="recapAppointment.availability" class="recap-row">
              <div class="recap-label">Disponibilités</div>
              <div class="recap-value recap-text">{{ recapAppointment.availability }}</div>
            </div>
            <div v-if="recapAppointment.notes" class="recap-row">
              <div class="recap-label">Notes / CR</div>
              <div class="recap-value recap-text">{{ recapAppointment.notes }}</div>
            </div>
            <div v-if="recapAppointment.createdAt" class="recap-row">
              <div class="recap-label">Créé le</div>
              <div class="recap-value">{{ formatTimestamp(recapAppointment.createdAt) }}</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="editFromRecap">✏️ Modifier</button>
            <button class="btn-primary" @click="closeRecap">Fermer</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
/* :host equivalent — root wrapper */
.rdv-page {
  display: block;
  height: 100%;
  overflow-y: auto;
  background:
    radial-gradient(circle at top right, rgba(24, 160, 251, 0.12), transparent 25%),
    radial-gradient(circle at bottom left, rgba(45, 212, 191, 0.08), transparent 22%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 24%), var(--bg);
}

.rendez-vous-page {
  max-width: 1380px;
  margin: 0 auto;
  padding: 1.25rem;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ─── Page header ─── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1.15rem 1.2rem;
  border-radius: 24px;
  border: 1px solid rgba(198, 220, 237, 0.14);
  background: rgba(10, 22, 34, 0.74);
  backdrop-filter: blur(12px);
  box-shadow: 0 24px 42px -34px rgba(0, 0, 0, 0.78);

  h1 {
    margin: 0;
    font-size: clamp(1.3rem, 1.05rem + 0.9vw, 2rem);
    font-weight: 900;
    letter-spacing: -0.04em;
    color: var(--text-primary);
  }
}

.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

/* ─── Vue toggle pill bar ─── */
.vue-toggle {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.35rem;
  border-radius: 18px;
  border: 1px solid rgba(194, 217, 234, 0.12);
  background: rgba(255, 255, 255, 0.05);

  button {
    min-height: 2.55rem;
    padding: 0.55rem 0.9rem;
    border-radius: 14px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8rem;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    transition:
      transform 0.16s ease,
      background 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease;

    &:hover {
      transform: translateY(-1px);
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.06);
    }

    &.active {
      background: linear-gradient(135deg, rgba(35, 107, 186, 0.92), rgba(55, 146, 230, 0.74));
      border-color: rgba(111, 190, 255, 0.32);
      color: #fff;
      box-shadow: 0 14px 24px -20px rgba(70, 146, 214, 0.72);
    }
  }
}

/* ─── Filters bar ─── */
.filters-bar {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  padding: 0.85rem 1rem;
  border-radius: 20px;
  border: 1px solid rgba(198, 220, 237, 0.12);
  background: rgba(10, 22, 34, 0.68);
  backdrop-filter: blur(10px);

  select,
  input {
    min-height: 2.75rem;
    min-width: 220px;
    padding: 0.55rem 0.9rem;
    border: 1px solid rgba(194, 217, 234, 0.12);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-primary);
    font-size: 0.84rem;
    font-family: inherit;
  }
}

/* ─── Primary & small buttons ─── */
.btn-primary,
.btn-small {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.55rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(111, 190, 255, 0.2);
  background: linear-gradient(135deg, rgba(35, 107, 186, 0.92), rgba(55, 146, 230, 0.72));
  color: #fff;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    filter 0.16s ease,
    box-shadow 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.04);
    box-shadow: 0 16px 26px -22px rgba(70, 146, 214, 0.7);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
}

.btn-small {
  min-height: 2.25rem;
  padding: 0.45rem 0.8rem;
  font-size: 0.76rem;
}

/* ─── Data table, card, calendar shared shell ─── */
.rendez-vous-page > .data-table,
.card,
.calendar-wrapper {
  border-radius: 24px;
  border: 1px solid rgba(198, 220, 237, 0.14);
  background: rgba(10, 22, 34, 0.72);
  backdrop-filter: blur(12px);
  box-shadow: 0 24px 44px -34px rgba(0, 0, 0, 0.74);
}

.rendez-vous-page > .data-table,
.card .data-table {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  font-size: 0.83rem;

  th,
  td {
    padding: 0.8rem 0.95rem;
    text-align: left;
    border-bottom: 1px solid rgba(198, 220, 237, 0.09);
  }

  th {
    background: rgba(14, 31, 47, 0.92);
    color: #9fc4dc;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  tbody tr {
    transition: background 0.16s ease;
  }

  tbody tr:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2.4rem 1rem;
  }
}

.actions-cell {
  display: flex;
  gap: 0.35rem;
}

/* ─── Icon buttons ─── */
.btn-icon {
  min-width: 2rem;
  min-height: 2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(194, 217, 234, 0.12);
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.88rem;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(116, 193, 255, 0.22);
  }

  &.danger:hover {
    background: rgba(190, 31, 57, 0.18);
    border-color: rgba(240, 109, 129, 0.2);
  }
}

/* ─── Status badge ─── */
.statut-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.85rem;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.05em;

  &.attente {
    background: rgba(190, 131, 20, 0.28);
    color: #ffd994;
  }

  &.programme {
    background: rgba(27, 104, 191, 0.28);
    color: #b7ddff;
  }

  &.termine {
    background: rgba(13, 119, 81, 0.28);
    color: #a7f0cf;
  }

  &.annule {
    background: rgba(153, 27, 47, 0.28);
    color: #ffc3cd;
  }
}

/* ─── Calendar / Agenda wrapper ─── */
.calendar-wrapper {
  padding: 1rem;
}

.agenda-day {
  margin-bottom: 0.75rem;
}

.day-label {
  font-size: 0.92rem;
  font-weight: 900;
  color: var(--text-primary);
  margin: 0 0 0.35rem;
  text-transform: capitalize;
}

.agenda-slot {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  margin-bottom: 0.25rem;
  transition: background 0.16s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }
}

.slot-time {
  font-weight: 800;
  font-size: 0.82rem;
  color: #42a5f5;
  min-width: 48px;
}

.slot-patient {
  flex: 1;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-primary);
}

.slot-specialty {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.slot-doctor {
  font-size: 0.76rem;
  color: var(--text-muted);
}

/* ─── Calendar grid ─── */
.calendar-nav {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.calendar-title {
  flex: 1;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--text-primary);
  text-transform: capitalize;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: rgba(198, 220, 237, 0.06);
  border-radius: 14px;
  overflow: hidden;
}

.calendar-header-cell {
  padding: 0.55rem 0.4rem;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9dbbd3;
  background: rgba(14, 31, 47, 0.92);
}

.calendar-cell {
  min-height: 5.5rem;
  padding: 0.35rem;
  background: rgba(10, 22, 34, 0.85);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;

  &.other-month {
    opacity: 0.35;
  }

  &.today .cell-day {
    background: linear-gradient(135deg, rgba(35, 107, 186, 0.92), rgba(55, 146, 230, 0.74));
    color: #fff;
    border-radius: 999px;
    width: 1.6rem;
    height: 1.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

.cell-day {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 0.15rem;
}

.cell-events {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  overflow-y: auto;
  max-height: 4.5rem;
}

.cal-event {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.35rem;
  border-radius: 6px;
  border-left: 3px solid #9e9e9e;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: background 0.14s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.cal-event-time {
  font-size: 0.62rem;
  font-weight: 800;
  color: #42a5f5;
  white-space: nowrap;
}

.cal-event-name {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 900;
  margin-left: 0.3rem;
}

.already-imported {
  opacity: 0.5;
}

/* ─── Card (demandes) ─── */
.card {
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid rgba(198, 220, 237, 0.09);

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-primary);
  }
}

/* ─── Modal overlay ─── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(3, 10, 18, 0.72);
  backdrop-filter: blur(8px);
}

.modal-content {
  width: min(92vw, 720px);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid rgba(198, 220, 237, 0.14);
  background: linear-gradient(180deg, rgba(16, 35, 53, 0.98), rgba(11, 24, 38, 0.96));
  box-shadow: 0 28px 58px -34px rgba(0, 0, 0, 0.88);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid rgba(198, 220, 237, 0.09);

  h2 {
    margin: 0;
    font-size: 1.08rem;
    font-weight: 900;
    color: var(--text-primary);
  }
}

.recap-header {
  gap: 0.75rem;
}

.btn-close,
.btn-cancel {
  min-height: 2.5rem;
  padding: 0.45rem 0.95rem;
  border-radius: 14px;
  border: 1px solid rgba(194, 217, 234, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
}

.btn-close {
  min-width: 2.5rem;
  padding: 0;
  font-size: 1rem;
}

.modal-body {
  padding: 1.2rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 0.9rem 1.2rem 1.15rem;
  border-top: 1px solid rgba(198, 220, 237, 0.09);
}

/* ─── Form rows & labels ─── */
.form-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;

  label {
    min-width: 0;
  }
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.76rem;
  font-weight: 800;
  color: #9dbbd3;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  input,
  select,
  textarea {
    width: 100%;
    font-size: 0.85rem;
    text-transform: none;
    letter-spacing: 0;
  }
}

/* Form inputs global styling within modal */
.modal-body {
  input,
  select,
  textarea {
    min-height: 2.75rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid rgba(194, 217, 234, 0.12);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-primary);
    font-family: inherit;
  }

  textarea {
    resize: vertical;
  }
}

/* ─── Recap modal ─── */
.recap-modal {
  max-width: 580px;
}

.recap-row {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;

  .recap-label {
    min-width: 110px;
    padding-top: 0.2rem;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .recap-value {
    flex: 1;
    font-size: 0.88rem;
    color: var(--text-primary);
  }

  .recap-text {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 0.75rem 0.85rem;
    white-space: pre-wrap;
  }
}

.recap-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;

  .recap-label {
    margin-bottom: 0.2rem;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
}

hr {
  border: none;
  border-top: 1px solid rgba(198, 220, 237, 0.09);
  margin: 0.2rem 0;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 2.4rem 1rem;
}

/* ─── Responsive ─── */
@media (max-width: 900px) {
  .rendez-vous-page {
    padding: 1rem;
  }

  .page-header,
  .filters-bar,
  .rendez-vous-page > .data-table,
  .card,
  .calendar-wrapper,
  .modal-content {
    border-radius: 18px;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .recap-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .vue-toggle,
  .actions,
  .filters-bar {
    width: 100%;
  }

  .vue-toggle button,
  .btn-primary,
  .filters-bar select,
  .filters-bar input {
    width: 100%;
  }

  .rendez-vous-page > .data-table,
  .card .data-table {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }

  .modal-footer {
    flex-direction: column;
  }

  .modal-footer button {
    width: 100%;
  }

  .recap-row {
    flex-direction: column;
  }
}
</style>
