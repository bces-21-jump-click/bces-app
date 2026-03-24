<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useLogger } from '@/composables/useLogger'
import { useUserStore } from '@/stores/user'
import { ORDRE_ROLES, obtenirCouleurRole } from '@/config/roles.config'
import {
  RH_CHECKLISTS,
  type RhChecklist,
  type RhChecklistItem,
  type RhChecklistStep,
} from '@/config/rh-checklists.config'
import { RH_VALIDATION, type RhValidationGroup } from '@/config/rh-validation.config'
import type { Effectif } from '@/models/effectif'
import type { Specialty } from '@/models/specialty'
import type { Candidature } from '@/models/candidature'
import type { ChecklistTask, SharedChecklistData } from '@/models/shared-checklist'
import Swal from 'sweetalert2'

/* ── Constantes ────────────────────────────── */

const CANDIDATURE_STATUSES = [
  'Candidature reçue',
  'Appel pour entretien',
  'Entretien planifié',
  "Entretien en cours d'analyse",
  'Recrutement planifié',
  'Refusé',
]

const DELETE_REASONS = [
  'Départ volontaire',
  'Licenciement disciplinaire',
  'Licenciement administratif',
  'Abandon de poste',
  'Autre',
]

const RH_STATUSES = [
  { value: 'not_seen', label: 'Non vue', color: '#9e9e9e', icon: '👁️‍🗨️' },
  { value: 'seen', label: 'Vue', color: '#2196f3', icon: '👁️' },
  { value: 'in_progress', label: 'En cours', color: '#ff9800', icon: '⏳' },
  { value: 'mastered', label: 'Maîtrisée', color: '#4caf50', icon: '✅' },
]

const INTERVIEW_QUESTIONS: { key: string; label: string }[] = [
  { key: 'motivations', label: 'Motivations' },
  { key: 'background_before', label: "Que faisiez-vous avant d'arriver sur l'île ?" },
  { key: 'background_since', label: "Qu'avez-vous fait depuis ?" },
  { key: 'why_not_bces', label: 'Pourquoi le BCES ?' },
  { key: 'stress_management', label: 'Êtes-vous stressé ? Comment gérez-vous ?' },
  { key: 'stress_sources', label: "Sources de stress d'un médecin ?" },
  { key: 'specific_issues', label: 'Soucis hélico / conduite / plongée / fusillades ?' },
  { key: 'qualities', label: '3 qualités' },
  { key: 'flaws', label: '3 défauts' },
  { key: 'rh_comments', label: 'Commentaires du RH' },
]

/* ── Interfaces formulaires ────────────────── */

interface EmployeeForm {
  id: string | null
  name: string
  email: string
  role: string
  sex: string
  phone: string
  emoji: string
  specialties: string[]
  chiefSpecialties: string[]
  birthDate: string | null
  arrivalDate: string | null
  cdiDate: string | null
  lastPromotionDate: string | null
  medicalDegreeDate: string | null
  helicopterTrainingDate: string | null
  helicopterTrainingReimbursed: boolean
  isRHTrainee: boolean
}

interface CandidatureForm {
  id: string | null
  name: string
  phone: string
  email: string
  availabilities: string
  status: string
  votes: Record<string, string>
  answers: Record<string, string>
}

interface SpecialtyForm {
  id: string | null
  name: string
  icon: string
  value: string
  canTakeAppointments: boolean
}

type DialogType =
  | 'editEmployee'
  | 'details'
  | 'deleteEmployee'
  | 'specialties'
  | 'editSpecialty'
  | 'procedures'
  | 'trackingSelection'
  | 'tracking'
  | 'directory'
  | 'statistics'
  | 'candidatures'
  | 'candidatureForm'
  | 'promotions'
  | 'fault'
  | 'faultDetails'
  | 'suspension'
  | null

const EMPTY_EMP_FORM: EmployeeForm = {
  id: null,
  name: '',
  email: '',
  role: 'Interne',
  sex: '',
  phone: '555-',
  emoji: '',
  specialties: [],
  chiefSpecialties: [],
  birthDate: null,
  arrivalDate: null,
  cdiDate: null,
  lastPromotionDate: null,
  medicalDegreeDate: null,
  helicopterTrainingDate: null,
  helicopterTrainingReimbursed: false,
  isRHTrainee: false,
}

const EMPTY_CAND_FORM: CandidatureForm = {
  id: null,
  name: '',
  phone: '',
  email: '',
  availabilities: '',
  status: 'Candidature reçue',
  votes: {},
  answers: {},
}

/* ── Services ──────────────────────────────── */

const userStore = useUserStore()
const logger = useLogger()
const employeesFs = useCollection<Effectif>('employees')
const specialtiesFs = useCollection<Specialty>('specialties')
const candidaturesFs = useCollection<Candidature>('candidatures')
const settingsFs = useCollection<SharedChecklistData>('settings')

/* ── Données temps réel ────────────────────── */

const employees = ref<Effectif[]>([])
const specialties = ref<Specialty[]>([])
const candidatures = ref<Candidature[]>([])
const weeklyTasks = ref<ChecklistTask[]>([])
const monthlyTasks = ref<ChecklistTask[]>([])

/* ── UI ────────────────────────────────────── */

const recherche = ref('')
const emailBlur = ref(true)
const dialog = ref<DialogType>(null)
const weeklyOpen = ref(true)
const monthlyOpen = ref(true)

/* ── Formulaires ───────────────────────────── */

const editedEmployee = ref<EmployeeForm>({ ...EMPTY_EMP_FORM })
const editedCandidature = ref<CandidatureForm>({ ...EMPTY_CAND_FORM })
const editedSpecialty = ref<SpecialtyForm>({
  id: null,
  name: '',
  icon: '',
  value: '',
  canTakeAppointments: false,
})

/* ── Sélections ────────────────────────────── */

const selectedEmployee = ref<Effectif | null>(null)
const deleteReason = ref('')
const selectedChecklist = ref<RhChecklist | null>(null)
const checklistSteps = ref<boolean[]>([])
const selectedTrackingEmployee = ref<Effectif | null>(null)

/* ── Faute / Suspension ────────────────────── */

const faultEmployee = ref<Effectif | null>(null)
const faultReason = ref('')
const suspensionEmployee = ref<Effectif | null>(null)
const suspensionStartDate = ref('')
const suspensionDuration = ref(1)

const unsubs: (() => void)[] = []

/* ── Helpers privés ────────────────────────── */

function normalizeRoleName(role: string): string {
  switch (role) {
    case 'Titulaire':
    case 'Médecin':
      return 'Medecin'
    case 'Résident':
      return 'Résidant'
    default:
      return role
  }
}

function getRoleSortRank(role: string): number {
  const index = ORDRE_ROLES.indexOf(normalizeRoleName(role))
  return index === -1 ? 999 : index
}

/* ── Computed ──────────────────────────────── */

const filteredEmployees = computed(() => {
  const term = recherche.value.toLowerCase()
  return employees.value
    .filter(
      (e) => !term || e.name.toLowerCase().includes(term) || e.role.toLowerCase().includes(term),
    )
    .sort((a, b) => {
      const rankDelta = getRoleSortRank(a.role) - getRoleSortRank(b.role)
      if (rankDelta !== 0) return rankDelta
      return a.name.localeCompare(b.name)
    })
})

const rhTrainees = computed(() =>
  employees.value.filter((e) => e.isRHTrainee).sort((a, b) => a.name.localeCompare(b.name)),
)

const weeklyOverdueCount = computed(
  () => weeklyTasks.value.filter((t) => isTaskOverdue(t, 'weekly')).length,
)

const monthlyOverdueCount = computed(
  () => monthlyTasks.value.filter((t) => isTaskOverdue(t, 'monthly')).length,
)

const waitingCandidaturesCount = computed(
  () => candidatures.value.filter((c) => c.status === 'Candidature reçue').length,
)

const promotionRequests = computed(() => employees.value.filter((e) => e.promotionRequest))

const ROLES_EXCLUS = new Set(['Temporaire', 'Non assigné'])
const effectifTotal = computed(
  () => employees.value.filter((e) => !ROLES_EXCLUS.has(e.role)).length,
)

const statsParRole = computed(() => {
  const stats: Record<string, number> = {}
  for (const e of employees.value) stats[e.role] = (stats[e.role] ?? 0) + 1
  return Object.entries(stats).sort(([ra], [rb]) => {
    const ia = ORDRE_ROLES.indexOf(ra)
    const ib = ORDRE_ROLES.indexOf(rb)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
})

const statsParSexe = computed(() => {
  let h = 0,
    f = 0
  for (const e of employees.value) e.sex === 'H' ? h++ : f++
  return { hommes: h, femmes: f }
})

const statsParSpecialite = computed(() => {
  const stats: Record<string, number> = {}
  for (const e of employees.value)
    for (const s of e.specialties ?? []) stats[s] = (stats[s] ?? 0) + 1
  return Object.entries(stats).sort(([, a], [, b]) => b - a)
})

const formTitle = computed(() =>
  editedEmployee.value.id ? "Modifier l'employé" : 'Nouvel employé',
)

const checklistProgress = computed(() => {
  const checklist = selectedChecklist.value
  if (!checklist) return 0
  const steps = checklistSteps.value
  let total = 0,
    completed = 0
  checklist.steps.forEach((step, i) => {
    if (isStepHeader(step)) return
    total++
    if (steps[i]) completed++
  })
  return total === 0 ? 0 : Math.round((completed / total) * 100)
})

const sortedDirectoryEmployees = computed(() =>
  [...employees.value].sort((a, b) => {
    const ra = getRoleSortRank(a.role)
    const rb = getRoleSortRank(b.role)
    if (ra !== rb) return ra - rb
    return (a.arrivalDate ?? '').localeCompare(b.arrivalDate ?? '')
  }),
)

/* ── Employee ──────────────────────────────── */

function openAddDialog(): void {
  editedEmployee.value = {
    ...EMPTY_EMP_FORM,
    specialties: [],
    chiefSpecialties: [],
    arrivalDate: new Date().toISOString().split('T')[0] ?? null,
  }
  dialog.value = 'editEmployee'
}

function editEmployee(emp: Effectif): void {
  editedEmployee.value = {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    role: emp.role,
    sex: emp.sex,
    phone: emp.phone,
    emoji: emp.emoji,
    specialties: [...(emp.specialties ?? [])],
    chiefSpecialties: [...(emp.chiefSpecialties ?? [])],
    birthDate: emp.birthDate,
    arrivalDate: emp.arrivalDate,
    cdiDate: emp.cdiDate,
    lastPromotionDate: emp.lastPromotionDate,
    medicalDegreeDate: emp.medicalDegreeDate,
    helicopterTrainingDate: emp.helicopterTrainingDate,
    helicopterTrainingReimbursed: emp.helicopterTrainingReimbursed,
    isRHTrainee: emp.isRHTrainee,
  }
  dialog.value = 'editEmployee'
}

function toggleEditSpecialty(value: string): void {
  const specs = [...editedEmployee.value.specialties]
  const idx = specs.indexOf(value)
  if (idx >= 0) specs.splice(idx, 1)
  else specs.push(value)
  const chiefs = editedEmployee.value.chiefSpecialties.filter((c) => specs.includes(c))
  editedEmployee.value = { ...editedEmployee.value, specialties: specs, chiefSpecialties: chiefs }
}

function toggleEditChiefSpecialty(value: string): void {
  const chiefs = [...editedEmployee.value.chiefSpecialties]
  const idx = chiefs.indexOf(value)
  if (idx >= 0) chiefs.splice(idx, 1)
  else chiefs.push(value)
  editedEmployee.value = { ...editedEmployee.value, chiefSpecialties: chiefs }
}

async function saveEmployee(): Promise<void> {
  const emp = editedEmployee.value
  if (!emp.name) return

  const data: Record<string, unknown> = {
    name: emp.name,
    email: emp.email || '',
    role: emp.role || 'Interne',
    sex: emp.sex || '',
    phone: emp.phone || '',
    emoji: emp.emoji || '',
    specialties: emp.specialties,
    chiefSpecialties: emp.chiefSpecialties,
    birthDate: emp.birthDate || null,
    arrivalDate: emp.arrivalDate || null,
    cdiDate: emp.cdiDate || null,
    lastPromotionDate: emp.lastPromotionDate || null,
    medicalDegreeDate: emp.medicalDegreeDate || null,
    helicopterTrainingDate: emp.helicopterTrainingDate || null,
    helicopterTrainingReimbursed: emp.helicopterTrainingReimbursed,
    isRHTrainee: emp.isRHTrainee,
  }

  const user = userStore.profile?.id ?? 'unknown'
  if (emp.id) {
    const old = employees.value.find((e) => e.id === emp.id)
    await employeesFs.modifier(emp.id, data)
    if (old && old.role !== emp.role) {
      logger.log(user, 'Changement de grade', `${emp.name} : ${old.role} → ${emp.role}`)
    }
  } else {
    await employeesFs.ajouter(data)
    logger.log(user, 'Ajout employés', `Ajout de ${emp.name}`)
  }
  dialog.value = null
}

function openDetails(emp: Effectif): void {
  selectedEmployee.value = emp
  dialog.value = 'details'
}

function openDeleteDialog(emp: Effectif): void {
  selectedEmployee.value = emp
  deleteReason.value = ''
  dialog.value = 'deleteEmployee'
}

async function confirmDelete(): Promise<void> {
  const emp = selectedEmployee.value
  if (!emp || !deleteReason.value) return
  await employeesFs.supprimer(emp.id)
  const user = userStore.profile?.id ?? 'unknown'
  logger.log(user, 'Suppression employé', `Suppression de ${emp.name} (${deleteReason.value})`)
  dialog.value = null
}

/* ── Specialties ───────────────────────────── */

function openSpecialtiesDialog(): void {
  dialog.value = 'specialties'
}

function openAddSpecialty(): void {
  editedSpecialty.value = { id: null, name: '', icon: '', value: '', canTakeAppointments: false }
  dialog.value = 'editSpecialty'
}

function editSpecialtyItem(s: Specialty): void {
  editedSpecialty.value = { ...s, id: s.id ?? null }
  dialog.value = 'editSpecialty'
}

async function saveSpecialty(): Promise<void> {
  const s = editedSpecialty.value
  if (!s.name) return
  const data = {
    name: s.name,
    icon: s.icon || '',
    value: s.value || s.name.toLowerCase(),
    canTakeAppointments: s.canTakeAppointments,
  }
  if (s.id) await specialtiesFs.modifier(s.id, data as unknown as Record<string, unknown>)
  else await specialtiesFs.ajouter(data as unknown as Record<string, unknown>)
  dialog.value = 'specialties'
}

async function deleteSpecialty(s: Specialty): Promise<void> {
  if (!s.id) return
  const { isConfirmed } = await Swal.fire({
    title: `Supprimer la spécialité ${s.name} ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  await specialtiesFs.supprimer(s.id)
}

async function toggleSpecialtyAppointments(s: Specialty): Promise<void> {
  if (!s.id) return
  await specialtiesFs.modifier(s.id, {
    canTakeAppointments: !s.canTakeAppointments,
  } as unknown as Record<string, unknown>)
}

/* ── Checklists ────────────────────────────── */

function isTaskOverdue(task: ChecklistTask, period: 'weekly' | 'monthly'): boolean {
  if (!task.doneAt) return true
  const days = (Date.now() - task.doneAt) / (1000 * 60 * 60 * 24)
  return period === 'weekly' ? days > 7 : days > 30
}

function getCheckDate(task: ChecklistTask): string {
  if (!task.doneAt) return 'Jamais'
  return new Date(task.doneAt).toLocaleDateString('fr-FR')
}

async function addTask(type: 'weekly' | 'monthly'): Promise<void> {
  const { value: text, isConfirmed } = await Swal.fire({
    title: 'Nom de la tâche',
    input: 'text',
    inputPlaceholder: 'Nom de la tâche',
    showCancelButton: true,
    confirmButtonText: 'Ajouter',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed || !text) return
  const docId = type === 'weekly' ? 'weekly_rh' : 'monthly_rh'
  const tasks = type === 'weekly' ? [...weeklyTasks.value] : [...monthlyTasks.value]
  tasks.push({ id: Date.now().toString(), text, done: false, doneAt: null, link: null })
  await settingsFs.modifier(docId, { tasks } as unknown as Record<string, unknown>)
}

async function removeTask(type: 'weekly' | 'monthly', taskId: string): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: 'Supprimer cette tâche ?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  const docId = type === 'weekly' ? 'weekly_rh' : 'monthly_rh'
  const tasks = (type === 'weekly' ? [...weeklyTasks.value] : [...monthlyTasks.value]).filter(
    (t) => t.id !== taskId,
  )
  await settingsFs.modifier(docId, { tasks } as unknown as Record<string, unknown>)
}

async function toggleTask(type: 'weekly' | 'monthly', taskId: string): Promise<void> {
  const docId = type === 'weekly' ? 'weekly_rh' : 'monthly_rh'
  const tasks = (type === 'weekly' ? [...weeklyTasks.value] : [...monthlyTasks.value]).map((t) =>
    t.id === taskId ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t,
  )
  await settingsFs.modifier(docId, { tasks } as unknown as Record<string, unknown>)
}

/* ── Procedures ────────────────────────────── */

function openProcedures(checklist: RhChecklist): void {
  selectedChecklist.value = checklist
  checklistSteps.value = checklist.steps.map(() => false)
  dialog.value = 'procedures'
}

function toggleChecklistStep(index: number): void {
  const copy = [...checklistSteps.value]
  copy[index] = !copy[index]
  checklistSteps.value = copy
}

function isStepHeader(step: RhChecklistItem): boolean {
  return typeof step !== 'string' && 'header' in step && !!step.header
}

function getStepText(step: RhChecklistItem): string {
  if (typeof step === 'string') return step
  return (step as RhChecklistStep).text ?? ''
}

function getStepLink(step: RhChecklistItem): { text: string; url: string } | null {
  if (typeof step === 'string') return null
  return (step as RhChecklistStep).link ?? null
}

function getStepHeader(step: RhChecklistItem): string {
  if (typeof step === 'string') return ''
  return (step as RhChecklistStep).header ?? ''
}

/* ── Tracking ──────────────────────────────── */

function openTrackingDialog(): void {
  selectedTrackingEmployee.value = null
  dialog.value = 'trackingSelection'
}

function selectTrainee(emp: Effectif): void {
  selectedTrackingEmployee.value = emp
  dialog.value = 'tracking'
}

function getRHStatus(subId: string): string {
  const emp = selectedTrackingEmployee.value
  if (!emp?.competencyProgress) return 'not_seen'
  return (emp.competencyProgress[subId] as string) || 'not_seen'
}

function getRHStatusObj(subId: string) {
  const status = getRHStatus(subId)
  return RH_STATUSES.find((s) => s.value === status) ?? RH_STATUSES[0]!
}

function getCategoryProgress(group: RhValidationGroup): number {
  if (!group.items.length) return 0
  const total = group.items.length * 100
  let current = 0
  for (const item of group.items) {
    const status = getRHStatus(item.id)
    if (status === 'mastered') current += 100
    else if (status === 'in_progress') current += 50
    else if (status === 'seen') current += 25
  }
  return Math.round((current / total) * 100)
}

function getCompetencyColor(progress: number): string {
  if (progress === 100) return '#4caf50'
  if (progress >= 50) return '#ff9800'
  return '#9e9e9e'
}

async function toggleCompetency(subId: string): Promise<void> {
  const emp = selectedTrackingEmployee.value
  if (!emp) return
  const currentIndex = RH_STATUSES.findIndex((s) => s.value === getRHStatus(subId))
  const nextIndex = (currentIndex + 1) % RH_STATUSES.length
  const next = RH_STATUSES[nextIndex]
  if (!next) return
  const progress = { ...(emp.competencyProgress ?? {}), [subId]: next.value }
  await employeesFs.modifier(emp.id, {
    competencyProgress: progress,
  } as unknown as Record<string, unknown>)
  selectedTrackingEmployee.value = { ...emp, competencyProgress: progress }
}

async function toggleRHTrainee(emp: Effectif): Promise<void> {
  await employeesFs.modifier(emp.id, {
    isRHTrainee: !emp.isRHTrainee,
  } as unknown as Record<string, unknown>)
}

/* ── Directory / Statistics ────────────────── */

function openDirectory(): void {
  dialog.value = 'directory'
}
function openStatistics(): void {
  dialog.value = 'statistics'
}

/* ── Candidatures ──────────────────────────── */

function openCandidaturesDialog(): void {
  dialog.value = 'candidatures'
}

function openCandidatureForm(c?: Candidature): void {
  editedCandidature.value = c
    ? { ...c, id: c.id ?? null }
    : { ...EMPTY_CAND_FORM, votes: {}, answers: {} }
  dialog.value = 'candidatureForm'
}

function updateAnswer(key: string, value: string): void {
  editedCandidature.value = {
    ...editedCandidature.value,
    answers: { ...editedCandidature.value.answers, [key]: value },
  }
}

function getCandidatureStatusColor(status: string): string {
  switch (status) {
    case 'Candidature reçue':
      return '#bdbdbd'
    case 'Appel pour entretien':
      return '#757575'
    case 'Entretien planifié':
      return '#2196f3'
    case "Entretien en cours d'analyse":
      return '#ff9800'
    case 'Recrutement planifié':
      return '#4caf50'
    case 'Refusé':
      return '#f44336'
    default:
      return '#9e9e9e'
  }
}

function vote(type: string): void {
  const userId = userStore.profile?.id
  if (!userId) return
  const votes = { ...editedCandidature.value.votes }
  if (votes[userId] === type) delete votes[userId]
  else votes[userId] = type
  editedCandidature.value = { ...editedCandidature.value, votes }
}

function getVoteCounts(votes: Record<string, string>): { pour: number; contre: number } {
  let pour = 0,
    contre = 0
  for (const v of Object.values(votes ?? {})) {
    if (v === 'pour') pour++
    else if (v === 'contre') contre++
  }
  return { pour, contre }
}

function myVote(): string | null {
  const userId = userStore.profile?.id
  if (!userId) return null
  return editedCandidature.value.votes[userId] ?? null
}

function showInterviewSection(): boolean {
  const status = editedCandidature.value.status
  return [
    'Entretien planifié',
    "Entretien en cours d'analyse",
    'Recrutement planifié',
    'Refusé',
  ].includes(status)
}

function isInterviewReadonly(): boolean {
  return editedCandidature.value.status !== 'Entretien planifié'
}

async function saveCandidature(): Promise<void> {
  const c = editedCandidature.value
  if (!c.name || !c.email || !c.phone) return
  const { id, ...data } = c
  if (id) await candidaturesFs.modifier(id, data as unknown as Record<string, unknown>)
  else await candidaturesFs.ajouter(data as unknown as Record<string, unknown>)
  dialog.value = 'candidatures'
}

async function deleteCandidature(c: Candidature): Promise<void> {
  if (!c.id) return
  const { isConfirmed } = await Swal.fire({
    title: `Supprimer la candidature de ${c.name} ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  await candidaturesFs.supprimer(c.id)
}

async function finalizeCandidature(decision: 'accept' | 'reject'): Promise<void> {
  const c = editedCandidature.value
  const { isConfirmed } = await Swal.fire({
    title: decision === 'accept' ? `Embaucher ${c.name} ?` : `Refuser ${c.name} ?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return

  if (decision === 'accept') {
    const exists = employees.value.some((e) => e.name.toLowerCase() === c.name.toLowerCase())
    if (exists) {
      void Swal.fire('Erreur', `${c.name} est déjà dans la liste des employés !`, 'error')
      return
    }
    const today = new Date().toISOString().split('T')[0] ?? ''
    await employeesFs.ajouter({
      name: c.name,
      email: '',
      role: 'Interne',
      sex: '',
      phone: c.phone,
      specialties: [],
      chiefSpecialties: [],
      emoji: '',
      birthDate: null,
      arrivalDate: today,
      cdiDate: null,
      lastPromotionDate: today,
      medicalDegreeDate: null,
      helicopterTrainingDate: null,
      helicopterTrainingReimbursed: false,
      trainingRequests: [],
      promotionRequest: null,
      rankPromotionRequest: null,
      competencyProgress: {},
      lastFollowUpDate: null,
      simpleFault: null,
      suspension: null,
      isTrainerTrainee: false,
      simulations: [],
      isRHTrainee: false,
      validatedTrainings: [],
    } as unknown as Record<string, unknown>)
    editedCandidature.value = { ...editedCandidature.value, status: 'Recrutement planifié' }
  } else {
    editedCandidature.value = { ...editedCandidature.value, status: 'Refusé' }
  }
  await saveCandidature()
}

/* ── Promotions ────────────────────────────── */

function openPromotionsDialog(): void {
  dialog.value = 'promotions'
}

function getPromotionValue(emp: Effectif): string {
  if (!emp.promotionRequest) return ''
  if (typeof emp.promotionRequest === 'string') return emp.promotionRequest
  return emp.promotionRequest.value || ''
}

function getPromotionMotivation(emp: Effectif): string {
  if (!emp.promotionRequest || typeof emp.promotionRequest === 'string') return ''
  return emp.promotionRequest.motivation || ''
}

async function acceptPromotion(emp: Effectif): Promise<void> {
  const request = getPromotionValue(emp)
  if (!request) return
  const specs = [...(emp.specialties ?? [])]
  if (!specs.includes(request)) specs.push(request)
  await employeesFs.modifier(emp.id, {
    specialties: specs,
    promotionRequest: null,
  } as unknown as Record<string, unknown>)
}

async function rejectPromotion(emp: Effectif): Promise<void> {
  await employeesFs.modifier(emp.id, {
    promotionRequest: null,
  } as unknown as Record<string, unknown>)
}

/* ── Fault ─────────────────────────────────── */

function openFaultDialog(emp: Effectif): void {
  faultEmployee.value = emp
  faultReason.value = ''
  dialog.value = 'fault'
}

async function saveFault(): Promise<void> {
  const emp = faultEmployee.value
  if (!emp || !faultReason.value) return
  const today = new Date()
  const expireDate = new Date(today)
  expireDate.setDate(expireDate.getDate() + 30)
  await employeesFs.modifier(emp.id, {
    simpleFault: {
      reason: faultReason.value,
      date: today.toISOString(),
      expireDate: expireDate.toISOString(),
    },
  } as unknown as Record<string, unknown>)
  logger.log(
    userStore.profile?.id ?? 'unknown',
    'Ajout faute',
    `Ajout d'une faute à ${emp.name} : ${faultReason.value}`,
  )
  dialog.value = null
}

async function deleteFault(emp: Effectif): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: `Retirer la faute de ${emp.name} ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  await employeesFs.modifier(emp.id, { simpleFault: null } as unknown as Record<string, unknown>)
}

function showFaultDetails(emp: Effectif): void {
  selectedEmployee.value = emp
  dialog.value = 'faultDetails'
}

/* ── Suspension ────────────────────────────── */

function openSuspensionDialog(emp: Effectif): void {
  suspensionEmployee.value = emp
  suspensionStartDate.value = new Date().toISOString().split('T')[0] ?? ''
  suspensionDuration.value = 1
  dialog.value = 'suspension'
}

async function saveSuspension(): Promise<void> {
  const emp = suspensionEmployee.value
  if (!emp || !suspensionStartDate.value) return
  const startDate = new Date(suspensionStartDate.value)
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + suspensionDuration.value)
  await employeesFs.modifier(emp.id, {
    suspension: {
      startDate: suspensionStartDate.value,
      duration: suspensionDuration.value,
      endDate: endDate.toISOString().split('T')[0],
    },
  } as unknown as Record<string, unknown>)
  logger.log(
    userStore.profile?.id ?? 'unknown',
    'Mise à pied',
    `Mise à pied de ${emp.name} pour ${suspensionDuration.value} jour(s)`,
  )
  dialog.value = null
}

async function deleteSuspension(emp: Effectif): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: `Retirer la mise à pied de ${emp.name} ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  await employeesFs.modifier(emp.id, { suspension: null } as unknown as Record<string, unknown>)
  logger.log(
    userStore.profile?.id ?? 'unknown',
    'Retrait de mise a pied',
    `Retrait de la mise à pied de ${emp.name}`,
  )
}

/* ── Helpers ───────────────────────────────── */

function getSpecialtyIcon(value: string): string {
  return specialties.value.find((s) => s.value === value)?.icon ?? ''
}

function getSpecialtyName(value: string): string {
  return specialties.value.find((s) => s.value === value || s.name === value)?.name ?? value
}

function isBirthday(emp: Effectif): boolean {
  if (!emp.birthDate) return false
  const today = new Date()
  const bd = new Date(emp.birthDate)
  return bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate()
}

function needsHeliReimbursement(emp: Effectif): boolean {
  if (!emp.helicopterTrainingDate || emp.helicopterTrainingReimbursed) return false
  const days = (Date.now() - new Date(emp.helicopterTrainingDate).getTime()) / (1000 * 60 * 60 * 24)
  return days >= 365
}

async function confirmReimbursement(emp: Effectif): Promise<void> {
  const { isConfirmed } = await Swal.fire({
    title: `Confirmer le remboursement hélicoptère de ${emp.name} ?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!isConfirmed) return
  await employeesFs.modifier(emp.id, {
    helicopterTrainingReimbursed: true,
  } as unknown as Record<string, unknown>)
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('fr-FR')
}

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const today = new Date()
  const bd = new Date(birthDate)
  let age = today.getFullYear() - bd.getFullYear()
  if (
    today.getMonth() < bd.getMonth() ||
    (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())
  )
    age--
  return age
}

function calculateSeniority(arrivalDate: string | null): string {
  if (!arrivalDate) return '-'
  const diff = Date.now() - new Date(arrivalDate).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  if (years > 0) return `${years} an(s) ${months} mois`
  return `${months} mois`
}

function calculateDays(date: string | null): number | null {
  if (!date) return null
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

function closeDialog(): void {
  dialog.value = null
}

/* ── Lifecycle ─────────────────────────────── */

onMounted(() => {
  unsubs.push(
    employeesFs.ecouter((list) => {
      employees.value = list
    }),
    specialtiesFs.ecouter((list) => {
      specialties.value = list
    }),
    candidaturesFs.ecouter((list) => {
      candidatures.value = list
    }),
    settingsFs.ecouterDocument('weekly_rh', (d) => {
      weeklyTasks.value = (d as SharedChecklistData | null)?.tasks ?? []
    }),
    settingsFs.ecouterDocument('monthly_rh', (d) => {
      monthlyTasks.value = (d as SharedChecklistData | null)?.tasks ?? []
    }),
  )
})

onUnmounted(() => unsubs.forEach((fn) => fn()))
</script>

<template>
  <div class="rh-page">
    <!-- ── Hero ──────────────────────────────── -->
    <section class="rh-hero">
      <div class="rh-hero__copy">
        <p class="hero-kicker">Administration</p>
        <h1>Ressources Humaines</h1>
        <p class="hero-subtitle">
          Gérez l'effectif, le suivi RH, les candidatures et les procédures internes depuis une vue
          unique.
        </p>
        <div class="hero-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            v-model="recherche"
            type="text"
            placeholder="Rechercher un employé ou un rôle"
            class="search-input"
          />
        </div>
      </div>
      <div class="rh-hero__stats" aria-label="Indicateurs RH">
        <article class="rh-stat-card">
          <span class="rh-stat-card__label">Effectif actif</span>
          <strong class="rh-stat-card__value">{{ effectifTotal }}</strong>
          <span class="rh-stat-card__meta">hors temporaire et non assigné</span>
        </article>
        <article class="rh-stat-card rh-stat-card--warn">
          <span class="rh-stat-card__label">Candidatures en attente</span>
          <strong class="rh-stat-card__value">{{ waitingCandidaturesCount }}</strong>
          <span class="rh-stat-card__meta">à traiter par l'équipe RH</span>
        </article>
        <article class="rh-stat-card rh-stat-card--accent">
          <span class="rh-stat-card__label">Demandes de promotion</span>
          <strong class="rh-stat-card__value">{{ promotionRequests.length }}</strong>
          <span class="rh-stat-card__meta">en attente de décision</span>
        </article>
        <article class="rh-stat-card rh-stat-card--soft">
          <span class="rh-stat-card__label">Stagiaires RH</span>
          <strong class="rh-stat-card__value">{{ rhTrainees.length }}</strong>
          <span class="rh-stat-card__meta">en suivi de formation</span>
        </article>
      </div>
    </section>

    <!-- ── Actions rapides ───────────────────── -->
    <section class="panel action-panel" aria-label="Actions RH">
      <div class="panel-title">
        <i class="fa-solid fa-bolt" aria-hidden="true"></i>
        <h2>Actions rapides</h2>
      </div>
      <div class="header-actions">
        <button class="btn-action" @click="openAddDialog()">
          <i class="fa-solid fa-user-plus" aria-hidden="true"></i><span>Ajouter</span>
        </button>
        <button class="btn-action" @click="openSpecialtiesDialog()">
          <i class="fa-solid fa-star" aria-hidden="true"></i><span>Spécialités</span>
        </button>
        <button class="btn-action" @click="openTrackingDialog()">
          <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i><span>Suivi RH</span>
        </button>
        <button class="btn-action" @click="openDirectory()">
          <i class="fa-solid fa-address-book" aria-hidden="true"></i><span>Annuaire</span>
        </button>
        <button class="btn-action" @click="openCandidaturesDialog()">
          <i class="fa-solid fa-inbox" aria-hidden="true"></i><span>Candidatures</span>
          <span v-if="waitingCandidaturesCount > 0" class="badge">{{
            waitingCandidaturesCount
          }}</span>
        </button>
        <button class="btn-action" @click="openPromotionsDialog()">
          <i class="fa-solid fa-arrow-up-right-dots" aria-hidden="true"></i><span>Promotions</span>
          <span v-if="promotionRequests.length > 0" class="badge">{{
            promotionRequests.length
          }}</span>
        </button>
        <button class="btn-action" @click="openStatistics()">
          <i class="fa-solid fa-chart-column" aria-hidden="true"></i><span>Statistiques</span>
        </button>
      </div>
      <div v-if="RH_CHECKLISTS.length > 0" class="procedures-group">
        <button
          v-for="cl in RH_CHECKLISTS"
          :key="cl.id"
          class="btn-action btn-action--sm"
          @click="openProcedures(cl)"
        >
          {{ cl.icon }} {{ cl.title }}
        </button>
      </div>
    </section>

    <!-- ── Table controls ────────────────────── -->
    <section class="table-controls">
      <button
        class="btn-small btn-email-toggle"
        type="button"
        :class="{ 'is-masked': emailBlur }"
        @click="emailBlur = !emailBlur"
      >
        <span class="btn-email-toggle__icon" aria-hidden="true">
          <i class="fa-solid" :class="emailBlur ? 'fa-eye' : 'fa-eye-slash'"></i>
        </span>
        <span class="btn-email-toggle__text">{{
          emailBlur ? 'Afficher les emails' : 'Masquer les emails'
        }}</span>
      </button>
      <span class="employee-count">{{ filteredEmployees.length }} employé(s)</span>
    </section>

    <!-- ── Employee Table ────────────────────── -->
    <section class="panel table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Employé</th>
            <th>Email</th>
            <th>Rôle</th>
            <th>Spécialités</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in filteredEmployees" :key="e.id">
            <td class="col-name">
              <span class="employee-name">
                <span v-if="e.sex === 'F'">👩</span>
                <span v-else>👨</span>
                <span class="emp-emoji">{{ e.emoji }}</span>
                <span>{{ e.name }}</span>
                <span v-if="isBirthday(e)" title="Anniversaire !">🎂</span>
                <button
                  v-if="needsHeliReimbursement(e)"
                  class="btn-icon btn-heli"
                  type="button"
                  title="Remboursement hélicoptère"
                  @click="confirmReimbursement(e)"
                >
                  <i class="fa-solid fa-helicopter" aria-hidden="true"></i>
                </button>
                <button
                  v-if="e.simpleFault"
                  class="btn-icon indicator-fault"
                  type="button"
                  title="Faute simple"
                  @click="showFaultDetails(e)"
                >
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                </button>
                <span v-if="e.suspension" class="indicator-suspension" title="Mise à pied">
                  <i class="fa-solid fa-ban" aria-hidden="true"></i>
                </span>
              </span>
            </td>
            <td :class="{ 'email-blur': emailBlur }">{{ e.email }}</td>
            <td>
              <span class="role-badge" :style="{ background: obtenirCouleurRole(e.role) }">{{
                e.role
              }}</span>
            </td>
            <td class="col-specialties">
              <template v-if="e.specialties && e.specialties.length > 0">
                <span
                  v-for="s in e.specialties"
                  :key="s"
                  class="specialty-chip"
                  :class="{ chief: (e.chiefSpecialties || []).includes(s) }"
                >
                  <template v-if="(e.chiefSpecialties || []).includes(s)">👑 </template>
                  {{ getSpecialtyIcon(s) }} {{ getSpecialtyName(s) }}
                </span>
              </template>
              <span v-else class="vide">-</span>
            </td>
            <td class="col-actions">
              <div class="row-actions">
                <button class="btn-icon" type="button" title="Modifier" @click="editEmployee(e)">
                  <i class="fa-solid fa-pen" aria-hidden="true"></i>
                </button>
                <button class="btn-icon" type="button" title="Dossier" @click="openDetails(e)">
                  <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon"
                  type="button"
                  title="Supprimer"
                  @click="openDeleteDialog(e)"
                >
                  <i class="fa-solid fa-trash" aria-hidden="true"></i>
                </button>
                <button class="btn-icon" type="button" title="Faute" @click="openFaultDialog(e)">
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon"
                  type="button"
                  title="Mise à pied"
                  @click="openSuspensionDialog(e)"
                >
                  <i class="fa-solid fa-user-slash" aria-hidden="true"></i>
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredEmployees.length === 0">
            <td colspan="5" class="empty">Aucun employé</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ═══════════════ DIALOGS ═══════════════ -->

    <Teleport to="body">
      <div v-if="dialog" class="overlay" @click="closeDialog()"></div>

      <!-- ── Edit Employee ───────────────────── -->
      <div
        v-if="dialog === 'editEmployee'"
        class="dialog dialog--lg dialog--staff"
        role="dialog"
        aria-modal="true"
      >
        <div class="staff-dialog__header">
          <div>
            <p class="staff-dialog__kicker">Ressources Humaines</p>
            <h2>{{ formTitle }}</h2>
            <p class="staff-dialog__subtitle">
              Complétez les informations du membre du personnel puis enregistrez.
            </p>
          </div>
          <button type="button" class="btn-icon" @click="closeDialog()" aria-label="Fermer">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div class="staff-dialog__section-label">Informations générales</div>
        <div class="form-grid form-grid--staff">
          <label class="field"
            ><span>Nom *</span
            ><input
              type="text"
              :value="editedEmployee.name"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  name: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Sexe</span>
            <select
              :value="editedEmployee.sex"
              @change="
                editedEmployee = {
                  ...editedEmployee,
                  sex: ($event.target as HTMLSelectElement).value,
                }
              "
            >
              <option value="">--</option>
              <option value="H">Homme</option>
              <option value="F">Femme</option>
            </select>
          </label>
          <label class="field"
            ><span>Email</span
            ><input
              type="email"
              :value="editedEmployee.email"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  email: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Téléphone</span
            ><input
              type="text"
              :value="editedEmployee.phone"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  phone: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Emoji</span
            ><input
              type="text"
              :value="editedEmployee.emoji"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  emoji: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Rôle</span>
            <select
              :value="editedEmployee.role"
              @change="
                editedEmployee = {
                  ...editedEmployee,
                  role: ($event.target as HTMLSelectElement).value,
                }
              "
            >
              <option v-for="r in ORDRE_ROLES" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <label class="field"
            ><span>Date de naissance</span
            ><input
              type="date"
              :value="editedEmployee.birthDate"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  birthDate: ($event.target as HTMLInputElement).value || null,
                }
              "
          /></label>
          <label class="field"
            ><span>Date d'arrivée</span
            ><input
              type="date"
              :value="editedEmployee.arrivalDate"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  arrivalDate: ($event.target as HTMLInputElement).value || null,
                }
              "
          /></label>
        </div>
        <div class="staff-dialog__section-label">Parcours et validations</div>
        <div class="form-grid form-grid--staff">
          <label class="field"
            ><span>Date CDI</span
            ><input
              type="date"
              :value="editedEmployee.cdiDate"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  cdiDate: ($event.target as HTMLInputElement).value || null,
                }
              "
          /></label>
          <label class="field"
            ><span>Dernière promotion</span
            ><input
              type="date"
              :value="editedEmployee.lastPromotionDate"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  lastPromotionDate: ($event.target as HTMLInputElement).value || null,
                }
              "
          /></label>
          <label class="field"
            ><span>Diplôme médecin</span
            ><input
              type="date"
              :value="editedEmployee.medicalDegreeDate"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  medicalDegreeDate: ($event.target as HTMLInputElement).value || null,
                }
              "
          /></label>
          <label class="field"
            ><span>Formation hélico</span
            ><input
              type="date"
              :value="editedEmployee.helicopterTrainingDate"
              @input="
                editedEmployee = {
                  ...editedEmployee,
                  helicopterTrainingDate: ($event.target as HTMLInputElement).value || null,
                }
              "
          /></label>
        </div>
        <div class="staff-dialog__section-label">Affectations</div>
        <div class="form-grid form-grid--staff">
          <div class="field field--full">
            <span>Spécialités</span>
            <div class="chip-select">
              <button
                v-for="s in specialties"
                :key="s.id ?? s.value"
                type="button"
                class="chip-toggle"
                :class="{ selected: editedEmployee.specialties.includes(s.value) }"
                @click="toggleEditSpecialty(s.value)"
              >
                {{ s.icon }} {{ s.name }}
              </button>
            </div>
          </div>
          <div v-if="editedEmployee.specialties.length > 0" class="field field--full">
            <span>Chef de pôle</span>
            <div class="chip-select">
              <button
                v-for="s in editedEmployee.specialties"
                :key="s"
                type="button"
                class="chip-toggle"
                :class="{ selected: editedEmployee.chiefSpecialties.includes(s) }"
                @click="toggleEditChiefSpecialty(s)"
              >
                👑 {{ getSpecialtyName(s) }}
              </button>
            </div>
          </div>
          <div class="field field--full toggle-row toggle-row--staff">
            <label class="option-check">
              <input
                type="checkbox"
                :checked="editedEmployee.isRHTrainee"
                @change="
                  editedEmployee = {
                    ...editedEmployee,
                    isRHTrainee: ($event.target as HTMLInputElement).checked,
                  }
                "
              />
              <span>Stagiaire RH</span>
            </label>
            <label class="option-check">
              <input
                type="checkbox"
                :checked="editedEmployee.helicopterTrainingReimbursed"
                @change="
                  editedEmployee = {
                    ...editedEmployee,
                    helicopterTrainingReimbursed: ($event.target as HTMLInputElement).checked,
                  }
                "
              />
              <span>Hélico remboursé</span>
            </label>
          </div>
        </div>
        <div class="dialog-actions dialog-actions--staff">
          <button type="button" class="btn-secondary" @click="closeDialog()">Annuler</button>
          <button type="button" class="btn-primary" @click="saveEmployee()">Enregistrer</button>
        </div>
      </div>

      <!-- ── Employee Details ────────────────── -->
      <div
        v-if="dialog === 'details' && selectedEmployee"
        class="dialog dialog--md"
        role="dialog"
        aria-modal="true"
      >
        <h2>{{ selectedEmployee.emoji }} {{ selectedEmployee.name }}</h2>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="label">Email</span><span>{{ selectedEmployee.email }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Téléphone</span><span>{{ selectedEmployee.phone }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Rôle</span>
            <span
              class="role-badge"
              :style="{ background: obtenirCouleurRole(selectedEmployee.role) }"
              >{{ selectedEmployee.role }}</span
            >
          </div>
          <div class="detail-item">
            <span class="label">Sexe</span>
            <span>{{
              selectedEmployee.sex === 'H' ? 'Homme' : selectedEmployee.sex === 'F' ? 'Femme' : '-'
            }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Naissance</span>
            <span
              >{{ formatDate(selectedEmployee.birthDate) }}
              <template v-if="calculateAge(selectedEmployee.birthDate) !== null">
                ({{ calculateAge(selectedEmployee.birthDate) }} ans)
              </template></span
            >
          </div>
          <div class="detail-item">
            <span class="label">Arrivée</span>
            <span>{{ formatDate(selectedEmployee.arrivalDate) }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Ancienneté</span>
            <span>{{ calculateSeniority(selectedEmployee.arrivalDate) }}</span>
          </div>
          <div class="detail-item">
            <span class="label">CDI</span>
            <span
              >{{ formatDate(selectedEmployee.cdiDate) }}
              <template v-if="calculateDays(selectedEmployee.cdiDate) !== null">
                ({{ calculateDays(selectedEmployee.cdiDate) }} j)
              </template></span
            >
          </div>
          <div class="detail-item">
            <span class="label">Dernière promotion</span>
            <span
              >{{ formatDate(selectedEmployee.lastPromotionDate) }}
              <template v-if="calculateDays(selectedEmployee.lastPromotionDate) !== null">
                ({{ calculateDays(selectedEmployee.lastPromotionDate) }} j)
              </template></span
            >
          </div>
          <div class="detail-item">
            <span class="label">Diplôme médecin</span>
            <span>{{ formatDate(selectedEmployee.medicalDegreeDate) }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Formation hélico</span>
            <span>{{ formatDate(selectedEmployee.helicopterTrainingDate) }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Hélico remboursé</span>
            <span>{{ selectedEmployee.helicopterTrainingReimbursed ? '✅' : '❌' }}</span>
          </div>
        </div>
        <div class="detail-specialties">
          <span class="label">Spécialités</span>
          <div class="chip-list">
            <template
              v-if="selectedEmployee.specialties && selectedEmployee.specialties.length > 0"
            >
              <span
                v-for="s in selectedEmployee.specialties"
                :key="s"
                class="specialty-chip"
                :class="{ chief: (selectedEmployee.chiefSpecialties || []).includes(s) }"
              >
                <template v-if="(selectedEmployee.chiefSpecialties || []).includes(s)"
                  >👑
                </template>
                {{ getSpecialtyIcon(s) }} {{ getSpecialtyName(s) }}
              </span>
            </template>
            <span v-else class="vide">Aucune</span>
          </div>
        </div>
        <div v-if="selectedEmployee.simpleFault" class="alerte">
          ⚠️ Faute : {{ selectedEmployee.simpleFault.reason }} — expire le
          {{ formatDate(selectedEmployee.simpleFault.expireDate) }}
          <button class="btn-small btn-danger" type="button" @click="deleteFault(selectedEmployee)">
            Retirer
          </button>
        </div>
        <div v-if="selectedEmployee.suspension" class="alerte danger">
          🚫 Mise à pied : du {{ selectedEmployee.suspension.startDate }} au
          {{ selectedEmployee.suspension.endDate }} ({{ selectedEmployee.suspension.duration }} j)
          <button
            class="btn-small btn-danger"
            type="button"
            @click="deleteSuspension(selectedEmployee)"
          >
            Retirer
          </button>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn-secondary" @click="editEmployee(selectedEmployee)">
            ✏️ Modifier
          </button>
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Delete Employee ─────────────────── -->
      <div
        v-if="dialog === 'deleteEmployee' && selectedEmployee"
        class="dialog dialog--sm"
        role="dialog"
        aria-modal="true"
      >
        <h2>🗑️ Supprimer {{ selectedEmployee.name }}</h2>
        <p>Cette action est irréversible.</p>
        <label class="field"
          ><span>Raison *</span>
          <select v-model="deleteReason">
            <option value="">Choisir…</option>
            <option v-for="r in DELETE_REASONS" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
        <div class="dialog-actions">
          <button type="button" class="btn-secondary" @click="closeDialog()">Annuler</button>
          <button type="button" class="btn-danger" :disabled="!deleteReason" @click="confirmDelete">
            Confirmer
          </button>
        </div>
      </div>

      <!-- ── Specialties ─────────────────────── -->
      <div
        v-if="dialog === 'specialties'"
        class="dialog dialog--md dialog--specialties"
        role="dialog"
        aria-modal="true"
      >
        <div class="specialties-dialog__header">
          <div>
            <p class="specialties-dialog__kicker">Configuration RH</p>
            <h2>⭐ Spécialités</h2>
          </div>
        </div>
        <div class="specialties-dialog__table-wrap">
          <table class="data-table specialties-table">
            <thead>
              <tr>
                <th>Emoji</th>
                <th>Nom</th>
                <th>RDV</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in specialties" :key="s.id ?? s.value">
                <td>{{ s.icon }}</td>
                <td>{{ s.name }}</td>
                <td>
                  <button
                    class="btn-small specialty-rdv-toggle"
                    type="button"
                    @click="toggleSpecialtyAppointments(s)"
                  >
                    {{ s.canTakeAppointments ? '✅ Actif' : '❌ Inactif' }}
                  </button>
                </td>
                <td class="row-actions">
                  <button
                    class="btn-icon"
                    type="button"
                    title="Modifier"
                    @click="editSpecialtyItem(s)"
                  >
                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                  </button>
                  <button
                    class="btn-icon"
                    type="button"
                    title="Supprimer"
                    @click="deleteSpecialty(s)"
                  >
                    <i class="fa-solid fa-trash" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="specialties.length === 0">
                <td colspan="4" class="empty">Aucune spécialité</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dialog-actions specialties-dialog__actions">
          <button type="button" class="btn-secondary" @click="openAddSpecialty()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter
          </button>
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Edit Specialty ──────────────────── -->
      <div
        v-if="dialog === 'editSpecialty'"
        class="dialog dialog--sm dialog--specialty"
        role="dialog"
        aria-modal="true"
      >
        <div class="specialty-dialog__header">
          <div>
            <p class="specialty-dialog__kicker">Configuration RH</p>
            <h2>{{ editedSpecialty.id ? 'Modifier' : 'Nouvelle' }} spécialité</h2>
          </div>
        </div>
        <div class="form-grid specialty-dialog__grid">
          <label class="field"
            ><span>Nom *</span
            ><input
              type="text"
              :value="editedSpecialty.name"
              @input="
                editedSpecialty = {
                  ...editedSpecialty,
                  name: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Emoji</span
            ><input
              type="text"
              :value="editedSpecialty.icon"
              @input="
                editedSpecialty = {
                  ...editedSpecialty,
                  icon: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Valeur</span
            ><input
              type="text"
              :value="editedSpecialty.value"
              @input="
                editedSpecialty = {
                  ...editedSpecialty,
                  value: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <div class="field field--full specialty-dialog__options">
            <label class="option-check">
              <input
                type="checkbox"
                :checked="editedSpecialty.canTakeAppointments"
                @change="
                  editedSpecialty = {
                    ...editedSpecialty,
                    canTakeAppointments: ($event.target as HTMLInputElement).checked,
                  }
                "
              />
              <span>Prend des RDV</span>
            </label>
          </div>
        </div>
        <div class="dialog-actions specialty-dialog__actions">
          <button type="button" class="btn-secondary" @click="dialog = 'specialties'">
            Retour
          </button>
          <button type="button" class="btn-primary" @click="saveSpecialty()">Enregistrer</button>
        </div>
      </div>

      <!-- ── Procedures ──────────────────────── -->
      <div
        v-if="dialog === 'procedures' && selectedChecklist"
        class="dialog dialog--lg"
        role="dialog"
        aria-modal="true"
      >
        <h2>{{ selectedChecklist.icon }} {{ selectedChecklist.title }}</h2>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: checklistProgress + '%' }"></div>
          <span class="progress-label">{{ checklistProgress }}%</span>
        </div>
        <div class="procedures-list">
          <template v-for="(step, idx) in selectedChecklist.steps" :key="idx">
            <h3 v-if="isStepHeader(step)" class="step-header">{{ getStepHeader(step) }}</h3>
            <div v-else class="step-item" :class="{ checked: checklistSteps[idx] }">
              <input
                type="checkbox"
                :checked="checklistSteps[idx]"
                @change="toggleChecklistStep(idx)"
              />
              <span class="step-text">
                {{ getStepText(step) }}
                <a
                  v-if="getStepLink(step)"
                  :href="getStepLink(step)!.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="step-link"
                  >🔗 {{ getStepLink(step)!.text }}</a
                >
              </span>
            </div>
          </template>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Tracking Selection ──────────────── -->
      <div
        v-if="dialog === 'trackingSelection'"
        class="dialog dialog--md dialog--tracking-selection"
        role="dialog"
        aria-modal="true"
      >
        <div class="tracking-selection__header">
          <div>
            <p class="tracking-selection__kicker">Formation RH</p>
            <h2>🎓 Suivi RH - Choisir un stagiaire</h2>
          </div>
        </div>
        <div class="tracking-selection__section">
          <h3>Stagiaires disponibles</h3>
          <div class="trainee-list trainee-list--carded">
            <template v-if="rhTrainees.length > 0">
              <button
                v-for="e in rhTrainees"
                :key="e.id"
                class="trainee-item"
                type="button"
                @click="selectTrainee(e)"
              >
                <span>{{ e.emoji }} {{ e.name }}</span>
                <span class="role-badge" :style="{ background: obtenirCouleurRole(e.role) }">{{
                  e.role
                }}</span>
              </button>
            </template>
            <p v-else class="empty">Aucun stagiaire RH</p>
          </div>
        </div>
        <div class="tracking-selection__section tracking-selection__section--toggle">
          <h3>Ajouter / Retirer des stagiaires</h3>
          <div class="trainee-toggle-list trainee-toggle-list--grid">
            <label v-for="e in employees" :key="e.id" class="trainee-toggle">
              <input type="checkbox" :checked="e.isRHTrainee" @change="toggleRHTrainee(e)" />
              <span>{{ e.name }}</span>
            </label>
          </div>
        </div>
        <div class="dialog-actions tracking-selection__actions">
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Tracking ────────────────────────── -->
      <div
        v-if="dialog === 'tracking' && selectedTrackingEmployee"
        class="dialog dialog--lg"
        role="dialog"
        aria-modal="true"
      >
        <h2>🎓 Suivi de {{ selectedTrackingEmployee.name }}</h2>
        <div v-for="group in RH_VALIDATION" :key="group.id" class="tracking-group">
          <div class="tracking-group-header">
            <h3>{{ group.title }}</h3>
            <div class="progress-bar-container progress-bar--small">
              <div
                class="progress-bar"
                :style="{
                  width: getCategoryProgress(group) + '%',
                  background: getCompetencyColor(getCategoryProgress(group)),
                }"
              ></div>
              <span class="progress-label">{{ getCategoryProgress(group) }}%</span>
            </div>
          </div>
          <div class="tracking-items">
            <button
              v-for="item in group.items"
              :key="item.id"
              class="tracking-item"
              type="button"
              @click="toggleCompetency(item.id)"
            >
              <span class="tracking-status" :style="{ background: getRHStatusObj(item.id).color }">
                {{ getRHStatusObj(item.id).icon }}
              </span>
              <span>{{ item.title }}</span>
              <span class="tracking-label">{{ getRHStatusObj(item.id).label }}</span>
            </button>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn-secondary" @click="dialog = 'trackingSelection'">
            Retour
          </button>
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Directory ───────────────────────── -->
      <div
        v-if="dialog === 'directory'"
        class="dialog dialog--md dialog--directory"
        role="dialog"
        aria-modal="true"
      >
        <div class="directory-dialog__header">
          <div>
            <p class="directory-dialog__kicker">Répertoire RH</p>
            <h2>📒 Annuaire</h2>
          </div>
        </div>
        <div class="directory-dialog__table-wrap">
          <table class="data-table directory-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Rôle</th>
                <th>Téléphone</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in sortedDirectoryEmployees" :key="e.id">
                <td>{{ e.emoji }} {{ e.name }}</td>
                <td>
                  <span class="role-badge" :style="{ background: obtenirCouleurRole(e.role) }">{{
                    e.role
                  }}</span>
                </td>
                <td>{{ e.phone }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dialog-actions directory-dialog__actions">
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Statistics ──────────────────────── -->
      <div
        v-if="dialog === 'statistics'"
        class="dialog dialog--lg dialog--specialties"
        role="dialog"
        aria-modal="true"
      >
        <div class="specialties-dialog__header">
          <div>
            <p class="specialties-dialog__kicker">Analyse RH</p>
            <h2>📊 Statistiques</h2>
          </div>
        </div>
        <div class="specialties-dialog__table-wrap">
          <div class="stats-grid">
            <div class="stat-card">
              <h3>Effectif total</h3>
              <span class="stat-big">{{ effectifTotal }}</span>
              <p class="stat-note">Hors Temporaire et Non assigné</p>
            </div>
            <div class="stat-card">
              <h3>Parité</h3>
              <div class="stat-parite">
                <span>👨 {{ statsParSexe.hommes }}</span>
                <span>👩 {{ statsParSexe.femmes }}</span>
              </div>
            </div>
            <div class="stat-card stat-card--wide">
              <h3>Répartition par grade</h3>
              <div class="stat-bars">
                <div v-for="s in statsParRole" :key="s[0]" class="stat-row">
                  <span class="role-badge" :style="{ background: obtenirCouleurRole(s[0]) }">{{
                    s[0]
                  }}</span>
                  <div
                    class="stat-bar"
                    :style="{ width: (s[1] / Math.max(employees.length, 1)) * 100 + '%' }"
                  ></div>
                  <span class="stat-val">{{ s[1] }}</span>
                </div>
              </div>
            </div>
            <div class="stat-card stat-card--wide">
              <h3>Spécialités</h3>
              <div class="stat-bars">
                <div v-for="s in statsParSpecialite" :key="s[0]" class="stat-row">
                  <span class="stat-label"
                    >{{ getSpecialtyIcon(s[0]) }} {{ getSpecialtyName(s[0]) }}</span
                  >
                  <div
                    class="stat-bar"
                    :style="{ width: (s[1] / Math.max(employees.length, 1)) * 100 + '%' }"
                  ></div>
                  <span class="stat-val">{{ s[1] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-actions specialties-dialog__actions">
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Candidatures ────────────────────── -->
      <div
        v-if="dialog === 'candidatures'"
        class="dialog dialog--lg dialog--candidatures"
        role="dialog"
        aria-modal="true"
      >
        <div class="candidatures-dialog__header">
          <div>
            <p class="candidatures-dialog__kicker">Recrutement RH</p>
            <h2>📥 Candidatures</h2>
          </div>
          <button class="btn-action" type="button" @click="openCandidatureForm()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter
          </button>
        </div>
        <div class="candidatures-dialog__table-wrap">
          <table class="data-table candidatures-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Statut</th>
                <th>Téléphone</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, idx) in candidatures" :key="c.id ?? idx">
                <td>{{ c.name }}</td>
                <td>
                  <span
                    class="status-badge"
                    :style="{ background: getCandidatureStatusColor(c.status) }"
                    >{{ c.status }}</span
                  >
                </td>
                <td>{{ c.phone }}</td>
                <td>{{ c.email }}</td>
                <td class="row-actions">
                  <button
                    class="btn-icon"
                    type="button"
                    title="Modifier"
                    @click="openCandidatureForm(c)"
                  >
                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                  </button>
                  <button
                    class="btn-icon"
                    type="button"
                    title="Supprimer"
                    @click="deleteCandidature(c)"
                  >
                    <i class="fa-solid fa-trash" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="candidatures.length === 0">
                <td colspan="5" class="empty">Aucune candidature</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dialog-actions candidatures-dialog__actions">
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Candidature Form ────────────────── -->
      <div
        v-if="dialog === 'candidatureForm'"
        class="dialog dialog--lg dialog--candidature-form"
        role="dialog"
        aria-modal="true"
      >
        <div class="candidature-form__header">
          <div>
            <p class="candidature-form__kicker">Recrutement RH</p>
            <h2>{{ editedCandidature.id ? 'Modifier' : 'Nouvelle' }} candidature</h2>
          </div>
        </div>
        <div class="form-grid candidature-form__grid">
          <label class="field"
            ><span>Nom *</span
            ><input
              type="text"
              :value="editedCandidature.name"
              @input="
                editedCandidature = {
                  ...editedCandidature,
                  name: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Téléphone *</span
            ><input
              type="text"
              :value="editedCandidature.phone"
              @input="
                editedCandidature = {
                  ...editedCandidature,
                  phone: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field field--full"
            ><span>Email * (&#64;discord.gg)</span
            ><input
              type="email"
              :value="editedCandidature.email"
              @input="
                editedCandidature = {
                  ...editedCandidature,
                  email: ($event.target as HTMLInputElement).value,
                }
              "
          /></label>
          <label class="field"
            ><span>Statut</span>
            <select
              :value="editedCandidature.status"
              @change="
                editedCandidature = {
                  ...editedCandidature,
                  status: ($event.target as HTMLSelectElement).value,
                }
              "
            >
              <option v-for="s in CANDIDATURE_STATUSES" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="field field--full"
            ><span>Disponibilités</span>
            <textarea
              :value="editedCandidature.availabilities"
              rows="2"
              @input="
                editedCandidature = {
                  ...editedCandidature,
                  availabilities: ($event.target as HTMLTextAreaElement).value,
                }
              "
            ></textarea>
          </label>
        </div>
        <!-- Voting -->
        <div
          v-if="editedCandidature.status === 'Entretien en cours d\'analyse'"
          class="vote-section"
        >
          <h3>Avis des RH</h3>
          <div class="vote-buttons">
            <button class="btn-vote" :class="{ active: myVote() === 'pour' }" @click="vote('pour')">
              👍 POUR ({{ getVoteCounts(editedCandidature.votes).pour }})
            </button>
            <button
              class="btn-vote btn-vote--contre"
              :class="{ active: myVote() === 'contre' }"
              @click="vote('contre')"
            >
              👎 CONTRE ({{ getVoteCounts(editedCandidature.votes).contre }})
            </button>
          </div>
        </div>
        <!-- Interview -->
        <div v-if="showInterviewSection()" class="interview-section">
          <h3>Questionnaire Entretien</h3>
          <label v-for="q in INTERVIEW_QUESTIONS" :key="q.key" class="field field--full">
            <span>{{ q.label }}</span>
            <textarea
              :value="editedCandidature.answers[q.key] || ''"
              rows="2"
              :readonly="isInterviewReadonly()"
              @input="updateAnswer(q.key, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
          </label>
        </div>
        <div class="dialog-actions candidature-form__actions">
          <button type="button" class="btn-secondary" @click="dialog = 'candidatures'">
            Retour
          </button>
          <button type="button" class="btn-primary" @click="saveCandidature()">Sauvegarder</button>
        </div>
        <div
          v-if="editedCandidature.status === 'Entretien en cours d\'analyse'"
          class="dialog-actions finalize-actions"
        >
          <button type="button" class="btn-danger" @click="finalizeCandidature('reject')">
            ❌ Refuser
          </button>
          <button type="button" class="btn-success" @click="finalizeCandidature('accept')">
            ✅ Embaucher
          </button>
        </div>
      </div>

      <!-- ── Promotions ──────────────────────── -->
      <div
        v-if="dialog === 'promotions'"
        class="dialog dialog--md dialog--specialties"
        role="dialog"
        aria-modal="true"
      >
        <div class="specialties-dialog__header">
          <div>
            <p class="specialties-dialog__kicker">Évolution RH</p>
            <h2>⬆️ Demandes de promotion</h2>
          </div>
        </div>
        <div class="specialties-dialog__table-wrap">
          <template v-if="promotionRequests.length > 0">
            <div class="promotion-list">
              <div v-for="emp in promotionRequests" :key="emp.id" class="promotion-item">
                <div class="promotion-info">
                  <strong>{{ emp.name }}</strong>
                  <span class="specialty-chip"
                    >{{ getSpecialtyIcon(getPromotionValue(emp)) }}
                    {{ getSpecialtyName(getPromotionValue(emp)) }}</span
                  >
                  <p v-if="getPromotionMotivation(emp)" class="promotion-motivation">
                    📝 {{ getPromotionMotivation(emp) }}
                  </p>
                </div>
                <div class="promotion-actions">
                  <button class="btn-success" type="button" @click="acceptPromotion(emp)">
                    ✅ Accepter
                  </button>
                  <button class="btn-danger" type="button" @click="rejectPromotion(emp)">
                    ❌ Refuser
                  </button>
                </div>
              </div>
            </div>
          </template>
          <p v-else class="empty">Aucune demande en attente</p>
        </div>
        <div class="dialog-actions specialties-dialog__actions">
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Fault ───────────────────────────── -->
      <div
        v-if="dialog === 'fault' && faultEmployee"
        class="dialog dialog--sm"
        role="dialog"
        aria-modal="true"
      >
        <h2>⚠️ Ajouter une faute</h2>
        <p>
          Employé : <strong>{{ faultEmployee.name }}</strong>
        </p>
        <label class="field field--full"
          ><span>Raison *</span>
          <textarea v-model="faultReason" rows="3"></textarea>
        </label>
        <p class="form-hint">Expire automatiquement après 30 jours.</p>
        <div class="dialog-actions">
          <button type="button" class="btn-secondary" @click="closeDialog()">Annuler</button>
          <button type="button" class="btn-danger" :disabled="!faultReason" @click="saveFault()">
            Ajouter
          </button>
        </div>
      </div>

      <!-- ── Fault Details ───────────────────── -->
      <div
        v-if="dialog === 'faultDetails' && selectedEmployee?.simpleFault"
        class="dialog dialog--sm"
        role="dialog"
        aria-modal="true"
      >
        <h2>⚠️ Détails de la faute</h2>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="label">Employé</span><span>{{ selectedEmployee.name }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Raison</span><span>{{ selectedEmployee.simpleFault.reason }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Date</span
            ><span>{{ formatDate(selectedEmployee.simpleFault.date) }}</span>
          </div>
          <div class="detail-item">
            <span class="label">Expire le</span
            ><span>{{ formatDate(selectedEmployee.simpleFault.expireDate) }}</span>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn-primary" @click="closeDialog()">Fermer</button>
        </div>
      </div>

      <!-- ── Suspension ──────────────────────── -->
      <div
        v-if="dialog === 'suspension' && suspensionEmployee"
        class="dialog dialog--sm"
        role="dialog"
        aria-modal="true"
      >
        <h2>🚫 Mise à pied</h2>
        <p>
          Employé : <strong>{{ suspensionEmployee.name }}</strong>
        </p>
        <div class="form-grid">
          <label class="field"
            ><span>Date de début</span>
            <input type="date" v-model="suspensionStartDate" />
          </label>
          <label class="field"
            ><span>Durée (jours)</span>
            <input type="number" min="1" v-model.number="suspensionDuration" />
          </label>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn-secondary" @click="closeDialog()">Annuler</button>
          <button type="button" class="btn-primary" @click="saveSuspension()">Appliquer</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
/* ── Base layout ─────────────────────────────── */
.rh-page {
  --rh-accent: #1f7a5a;
  --rh-accent-soft: #e5f3ed;
  --rh-danger-soft: #ffe7e5;
  --rh-warning-soft: #fff5df;
  --rh-shadow: 0 16px 30px -22px rgba(20, 56, 43, 0.45);
  padding: 1.5rem;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

/* ── Hero ────────────────────────────────────── */
.rh-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.32fr) minmax(320px, 0.95fr);
  gap: 1rem;
  padding: 1.15rem 1.2rem;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 58%, transparent 42%);
  background:
    radial-gradient(circle at top right, rgba(88, 184, 255, 0.2), transparent 30%),
    linear-gradient(135deg, #142733, #1a3443 52%, #21485b);
  box-shadow:
    0 18px 34px rgba(5, 13, 23, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

.rh-hero__copy {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-width: 58ch;

  h1 {
    margin: 0.1rem 0 0.35rem;
    color: #f4f9ff;
    font-size: clamp(1.45rem, 1rem + 1.1vw, 2rem);
    line-height: 1.05;
    letter-spacing: -0.03em;
  }
}

.hero-kicker {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin: 0;
  padding: 0.24rem 0.62rem;
  border-radius: 999px;
  border: 1px solid rgba(116, 177, 227, 0.26);
  background: rgba(255, 255, 255, 0.05);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.7rem;
  font-weight: 800;
  color: #d4edff;
}

.hero-subtitle {
  margin: 0;
  max-width: 56ch;
  color: #a9c7e2;
  font-size: 0.9rem;
  line-height: 1.45;
}

.hero-search {
  margin-top: 0.25rem;
  min-width: min(100%, 400px);
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: rgba(10, 23, 34, 0.5);
  border: 1px solid rgba(153, 200, 238, 0.24);

  i {
    color: #96bddb;
    font-size: 0.86rem;
  }

  .search-input {
    border: none;
    width: 100%;
    padding: 0;
    background: transparent;
    font-size: 0.88rem;
    color: #f0f7ff;
    &::placeholder {
      color: #8eb0cc;
    }
    &:focus {
      outline: none;
    }
  }
}

.rh-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.rh-stat-card {
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  border: 1px solid rgba(116, 177, 227, 0.15);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.rh-stat-card__label {
  display: block;
  color: #9fbad4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.rh-stat-card__value {
  display: block;
  margin-top: 0.25rem;
  color: #ffffff;
  font-size: 1.34rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.rh-stat-card__meta {
  display: block;
  margin-top: 0.15rem;
  color: #9fbad4;
  font-size: 0.69rem;
}

.rh-stat-card--warn .rh-stat-card__value {
  color: #ffbe7a;
}
.rh-stat-card--accent .rh-stat-card__value {
  color: #86dcff;
}
.rh-stat-card--soft .rh-stat-card__value {
  color: #f3d2ff;
}

/* ── Panel ───────────────────────────────────── */
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-elevated) 92%, #fff 8%);
  padding: 0.9rem;
  box-shadow: 0 10px 28px -26px rgba(0, 0, 0, 0.55);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.7rem;
  i {
    color: var(--rh-accent);
  }
  h2 {
    margin: 0;
    font-size: 0.95rem;
  }
}

.action-panel {
  .header-actions {
    gap: 0.5rem;
  }
}

/* ── Buttons ─────────────────────────────────── */
.header-actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
}

.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 0.72rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  i {
    font-size: 0.8rem;
  }
  &:hover {
    border-color: color-mix(in srgb, var(--rh-accent) 45%, var(--border) 55%);
    background: var(--rh-accent-soft);
  }
}

.badge {
  background: var(--rh-accent);
  color: #fff;
  border-radius: 999px;
  min-width: 20px;
  height: 20px;
  padding: 0 0.35rem;
  font-size: 0.68rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.2rem;
}

/* ── Table controls ──────────────────────────── */
.table-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-top: -0.15rem;
}

.employee-count {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.btn-small {
  padding: 0.42rem 0.72rem;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.78rem;
  &:hover {
    background: var(--surface-hover);
  }
}

.btn-email-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.35rem;
  padding: 0.42rem 0.55rem 0.42rem 0.48rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, var(--rh-accent) 28%);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--surface-elevated) 92%, #ffffff 8%),
    color-mix(in srgb, var(--surface) 88%, var(--rh-accent-soft) 12%)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 10px 20px -18px rgba(11, 30, 24, 0.75);
  &:hover {
    border-color: color-mix(in srgb, var(--rh-accent) 48%, var(--border) 52%);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--surface-elevated) 84%, #ffffff 16%),
      color-mix(in srgb, var(--surface) 78%, var(--rh-accent-soft) 22%)
    );
  }
  &.is-masked {
    border-color: color-mix(in srgb, var(--rh-accent) 34%, var(--border) 66%);
  }
}

.btn-email-toggle__icon {
  width: 1.7rem;
  height: 1.7rem;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: linear-gradient(135deg, #1f7a5a, #28956f);
  color: #f8fffc;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  flex-shrink: 0;
  i {
    font-size: 0.78rem;
    line-height: 1;
  }
}

.btn-email-toggle__text {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  padding-right: 0.12rem;
}

/* ── Employee table ──────────────────────────── */
.table-panel {
  padding: 0;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: transparent;
  border: none;
  border-radius: 0;
  th,
  td {
    padding: 0.68rem 0.72rem;
    border-bottom: 1px solid var(--border-subtle);
    text-align: left;
    vertical-align: middle;
    font-size: 0.82rem;
  }
  th {
    font-size: 0.73rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-secondary);
    background: color-mix(in srgb, var(--surface) 82%, #fff 18%);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  tbody tr:hover {
    background: var(--surface-hover);
  }
  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 1.2rem;
  }
}

.col-name {
  white-space: nowrap;
}

.employee-name {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 600;
}

.email-blur {
  filter: blur(5px);
  user-select: none;
  transition: filter 0.2s;
  &:hover {
    filter: none;
  }
}

.col-specialties {
  min-width: 120px;
}
.col-actions {
  width: 180px;
  white-space: nowrap;
  text-align: right;
}

.row-actions {
  display: inline-flex;
  gap: 0.2rem;
  align-items: center;
  justify-content: flex-end;
}

.role-badge {
  display: inline-block;
  padding: 0.12rem 0.45rem;
  border-radius: 10px;
  color: #fff;
  font-size: 0.73rem;
  font-weight: 600;
  white-space: nowrap;
}

.specialty-chip {
  display: inline-block;
  padding: 0.14rem 0.48rem;
  background: color-mix(in srgb, var(--surface) 84%, #fff 16%);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  font-size: 0.73rem;
  margin-right: 0.2rem;
  &.chief {
    border-color: #ffc107;
    background: rgba(255, 193, 7, 0.1);
  }
}

.status-badge {
  display: inline-block;
  padding: 0.12rem 0.45rem;
  border-radius: 10px;
  color: #fff;
  font-size: 0.73rem;
  font-weight: 600;
}

.vide {
  color: var(--text-muted);
}

.vote-count {
  font-size: 0.78rem;
  margin-right: 0.35rem;
}
.text-muted {
  color: var(--text-muted);
}

/* ── Icon buttons ────────────────────────────── */
.btn-icon {
  width: 1.9rem;
  height: 1.9rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.15rem;
  color: var(--text-primary);
  &:hover {
    border-color: var(--border);
    background: var(--surface);
  }
}

/* ── Overlay & dialogs ───────────────────────── */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 400;
}

.dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 1.5rem;
  z-index: 401;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 24px 45px -28px rgba(0, 0, 0, 0.6);
  h2 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }
}

.dialog--sm {
  width: min(92vw, 420px);
}
.dialog--md {
  width: min(92vw, 650px);
}
.dialog--lg {
  width: min(94vw, 900px);
}

.dialog--staff {
  width: min(96vw, 980px);
  padding: 0;
  border-radius: 16px;
  overflow: hidden;
}

.dialog--specialty {
  width: min(92vw, 520px);
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}

.dialog--specialties {
  width: min(94vw, 760px);
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}

.dialog--candidatures {
  width: min(95vw, 940px);
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}

.dialog--candidature-form {
  width: min(95vw, 940px);
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}

.dialog--directory {
  width: min(94vw, 760px);
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

/* ── Staff dialog ────────────────────────────── */
.staff-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 1.1rem 1.2rem 0.95rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--surface-elevated) 88%, #ffffff 12%),
    color-mix(in srgb, var(--surface) 90%, #ffffff 10%)
  );
  h2 {
    margin: 0.15rem 0 0.25rem;
  }
  .btn-icon {
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
}

.staff-dialog__kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.staff-dialog__subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.staff-dialog__section-label {
  padding: 0.8rem 1.2rem 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.form-grid--staff {
  padding: 0 1.2rem 0.35rem;
}

.dialog-actions--staff {
  margin-top: 0.4rem;
  padding: 0.85rem 1.2rem 1.1rem;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, #ffffff 6%);
}

/* ── Specialties dialog ──────────────────────── */
.specialties-dialog__header,
.specialty-dialog__header,
.candidatures-dialog__header,
.candidature-form__header,
.directory-dialog__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.95rem 1rem 0.85rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--surface-elevated) 90%, #ffffff 10%),
    color-mix(in srgb, var(--surface) 92%, #ffffff 8%)
  );
  h2 {
    margin: 0.12rem 0 0;
    font-size: 1rem;
  }
  .btn-icon {
    width: 1.9rem;
    height: 1.9rem;
    border: 1px solid var(--border);
    border-radius: 9px;
  }
}

.specialties-dialog__kicker,
.specialty-dialog__kicker,
.candidatures-dialog__kicker,
.candidature-form__kicker,
.directory-dialog__kicker {
  margin: 0;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--text-secondary);
}

.specialties-dialog__table-wrap,
.candidatures-dialog__table-wrap,
.directory-dialog__table-wrap {
  padding: 0.9rem 1rem 0.2rem;
}

.specialties-table,
.candidatures-table,
.directory-table {
  th,
  td {
    padding: 0.58rem 0.62rem;
  }
}

.specialties-dialog__actions,
.specialty-dialog__actions,
.candidatures-dialog__actions,
.candidature-form__actions,
.directory-dialog__actions {
  margin-top: 0.45rem;
  padding: 0.75rem 1rem 0.95rem;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, #ffffff 6%);
}

.specialty-dialog__grid,
.candidature-form__grid {
  padding: 0.95rem 1rem 0.3rem;
}

/* ── Forms ───────────────────────────────────── */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  > span {
    font-size: 0.7rem;
    color: var(--text-secondary);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  input,
  select,
  textarea {
    width: 100%;
    padding: 0.4rem 0.55rem;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    background: var(--input-bg);
    color: var(--text-primary);
    font-size: 0.82rem;
    font-family: inherit;
  }
  textarea {
    resize: vertical;
  }
}

.field--full {
  grid-column: 1 / -1;
}

.chip-select {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip-toggle {
  padding: 0.2rem 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.78rem;
  transition: all 0.15s;
  &.selected {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  &:hover {
    opacity: 0.85;
  }
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.25rem;
}

/* ── Detail dialog ───────────────────────────── */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  .label {
    font-size: 0.68rem;
    color: var(--text-muted);
    text-transform: uppercase;
    font-weight: 600;
  }
}

.detail-specialties {
  margin-top: 0.75rem;
  .label {
    font-size: 0.68rem;
    color: var(--text-muted);
    text-transform: uppercase;
    font-weight: 600;
    display: block;
    margin-bottom: 0.3rem;
  }
}

/* ── Buttons ─────────────────────────────────── */
.btn-primary {
  padding: 0.45rem 0.9rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  &:hover {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-secondary {
  padding: 0.45rem 0.9rem;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.82rem;
  &:hover {
    background: var(--surface-hover);
  }
}

.btn-danger {
  padding: 0.45rem 0.9rem;
  background: #f44336;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  &:hover {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-success {
  padding: 0.45rem 0.9rem;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  &:hover {
    opacity: 0.88;
  }
}

/* ── Statistics ──────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.85rem;
  h3 {
    font-size: 0.85rem;
    color: var(--accent);
    margin-bottom: 0.5rem;
  }
}

.stat-card--wide {
  grid-column: 1 / -1;
}

.stat-bars {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  .role-badge,
  .stat-label {
    min-width: 90px;
    font-size: 0.73rem;
  }
  .stat-bar {
    height: 14px;
    background: var(--accent);
    border-radius: 3px;
    min-width: 2px;
    flex: 1;
    max-width: 200px;
  }
  .stat-val {
    font-size: 0.78rem;
    color: var(--text-secondary);
    min-width: 24px;
  }
}

.stat-label {
  font-size: 0.73rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-big {
  display: block;
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  color: var(--accent);
}

.stat-note {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-align: center;
  margin-top: -0.3rem;
}

/* ── Promotions ──────────────────────────────── */
.promotion-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.promotion-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.promotion-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.promotion-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 1rem;
  font-size: 0.85rem;
}

/* ── Procedures group ────────────────────────── */
.procedures-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-subtle);
}

.btn-action--sm {
  padding: 0.32rem 0.55rem;
  font-size: 0.75rem;
}

/* ── Employee indicators ─────────────────────── */
.emp-emoji {
  font-size: 0.9rem;
}

.btn-heli {
  color: #ff9800;
  font-size: 0.75rem;
}

.indicator-fault {
  color: #f44336;
  font-size: 0.75rem;
}

.indicator-suspension {
  color: #9e9e9e;
  font-size: 0.75rem;
  margin-left: 0.15rem;
}

/* ── Toggle row ──────────────────────────────── */
.toggle-row {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.toggle-row--staff {
  padding: 0.3rem 0;
}

.option-check {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  cursor: pointer;
  input[type='checkbox'] {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
    cursor: pointer;
  }
}

.specialty-rdv-toggle {
  font-size: 0.73rem;
  padding: 0.2rem 0.45rem;
}

.specialty-dialog__options {
  padding: 0.2rem 0;
}

/* ── Progress bar ────────────────────────────── */
.progress-bar-container {
  position: relative;
  height: 22px;
  background: color-mix(in srgb, var(--surface) 82%, #fff 18%);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 12px;
  transition: width 0.3s ease;
}

.progress-bar--small {
  height: 14px;
  flex: 1;
}

.progress-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-primary);
}

/* ── Procedures ──────────────────────────────── */
.procedures-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.step-header {
  font-size: 0.85rem;
  margin: 0.6rem 0 0.2rem;
  color: var(--accent);
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  &.checked {
    opacity: 0.55;
    text-decoration: line-through;
  }
  input[type='checkbox'] {
    margin-top: 0.15rem;
    accent-color: var(--accent);
  }
}

.step-text {
  font-size: 0.82rem;
  line-height: 1.4;
}

.step-link {
  display: inline;
  margin-left: 0.3rem;
  color: var(--accent);
  font-size: 0.78rem;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
}

/* ── Tracking selection ──────────────────────── */
.dialog--tracking-selection {
  width: min(94vw, 760px);
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}

.tracking-selection__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.95rem 1rem 0.85rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--surface-elevated) 90%, #ffffff 10%),
    color-mix(in srgb, var(--surface) 92%, #ffffff 8%)
  );
  h2 {
    margin: 0.12rem 0 0;
    font-size: 1rem;
  }
}

.tracking-selection__kicker {
  margin: 0;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--text-secondary);
}

.tracking-selection__section {
  padding: 0.9rem 1rem;
  h3 {
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
}

.tracking-selection__section--toggle {
  border-top: 1px solid var(--border);
}

.tracking-selection__actions {
  margin-top: 0;
  padding: 0.75rem 1rem 0.95rem;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, #ffffff 6%);
}

.trainee-list--carded {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.trainee-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.82rem;
  &:hover {
    border-color: var(--accent);
    background: var(--surface-hover);
  }
}

.trainee-toggle-list--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.3rem;
}

.trainee-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  cursor: pointer;
  input {
    accent-color: var(--accent);
  }
}

/* ── Tracking ────────────────────────────────── */
.tracking-group {
  margin-bottom: 0.75rem;
}

.tracking-group-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
  h3 {
    font-size: 0.85rem;
    white-space: nowrap;
    margin: 0;
  }
}

.tracking-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.tracking-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.55rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.78rem;
  &:hover {
    border-color: var(--accent);
  }
}

.tracking-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 6px;
  font-size: 0.65rem;
  color: #fff;
  flex-shrink: 0;
}

.tracking-label {
  font-size: 0.68rem;
  color: var(--text-muted);
}

/* ── Vote ────────────────────────────────────── */
.vote-section {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
  h3 {
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
  }
}

.vote-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-vote {
  padding: 0.45rem 0.9rem;
  background: var(--surface);
  border: 2px solid #4caf50;
  border-radius: 8px;
  color: #4caf50;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  &.active {
    background: #4caf50;
    color: #fff;
  }
}

.btn-vote--contre {
  border-color: #f44336;
  color: #f44336;
  &.active {
    background: #f44336;
    color: #fff;
  }
}

/* ── Interview ───────────────────────────────── */
.interview-section {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
  h3 {
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
}

.finalize-actions {
  padding: 0 1rem 0.75rem;
  border-top: none;
  margin-top: 0.3rem;
}

/* ── Alerts ──────────────────────────────────── */
.alerte {
  margin-top: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.3);
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  &.danger {
    background: rgba(244, 67, 54, 0.1);
    border-color: rgba(244, 67, 54, 0.3);
  }
}

.form-hint {
  font-size: 0.73rem;
  color: var(--text-muted);
  margin-top: 0.3rem;
}

/* ── Statistics extras ───────────────────────── */
.stat-parite {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  font-size: 1.2rem;
  padding: 0.5rem 0;
}

.promotion-motivation {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin: 0.15rem 0 0;
}

/* ── Responsive ──────────────────────────────── */
@media (max-width: 1080px) {
  .rh-hero {
    grid-template-columns: 1fr;
  }
  .rh-hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 840px) {
  .rh-page {
    padding: 1rem;
  }
  .rh-hero {
    padding: 1rem;
  }
  .hero-search {
    min-width: 0;
  }
  .rh-hero__stats {
    grid-template-columns: 1fr;
  }
  .panel {
    padding: 0.7rem;
  }
  .data-table {
    display: block;
    overflow-x: auto;
  }
  .form-grid,
  .detail-grid,
  .stats-grid {
    grid-template-columns: 1fr;
  }
  .header-actions {
    flex-wrap: wrap;
  }
  .stat-card--wide {
    grid-column: auto;
  }
  .dialog {
    min-width: min(92vw, 360px);
  }
}

@media (max-width: 640px) {
  .btn-email-toggle {
    width: 100%;
    justify-content: space-between;
  }
  .btn-email-toggle__text {
    flex: 1;
    min-width: 0;
  }
}
</style>
