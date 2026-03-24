<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import {
  useFormation,
  type CategorieCompetence,
  type FormationEtat,
} from '@/composables/useFormation'
import { useLogger } from '@/composables/useLogger'
import { useUserStore } from '@/stores/user'
import { ORDRE_ROLES, obtenirCouleurRole } from '@/config/roles.config'
import { TRAININGS_CONFIG } from '@/config/trainings.config'
import type { Effectif } from '@/models/effectif'
import Swal from 'sweetalert2'

const ROLES_COMPETENCES = ORDRE_ROLES.filter((r) => r !== 'Temporaire')

interface Employe {
  id: string
  name: string
  role: string
  helicopterTrainingDate: string | null
  arrivalDate: string | null
  lastPromotionDate: string | null
  lastFollowUpDate: string | null
  trainingRequests: string[]
  validatedTrainings: string[]
  progression_competences: Record<string, number>
}

interface Guide {
  id: string
  title: string
  description: string
  steps: { header?: string; title: string; description: string }[]
}

const CATEGORIES_PAR_DEFAUT: CategorieCompetence[] = [
  {
    id: 'basics',
    titre: 'Bases',
    emoji: '📋',
    sous_competences: [
      { id: 'dds', titre: 'DDS', emoji: '🩸', roles: [...ROLES_COMPETENCES] },
      { id: 'vm', titre: 'VM', emoji: '⚕️', roles: [...ROLES_COMPETENCES] },
      { id: 'vc', titre: 'VC', emoji: '🩺', roles: [...ROLES_COMPETENCES] },
      { id: 'redaction', titre: 'Rédaction dossier', emoji: '✏️', roles: [...ROLES_COMPETENCES] },
      { id: 'conduite', titre: 'Conduite', emoji: '🚗', roles: [...ROLES_COMPETENCES] },
    ],
  },
  {
    id: 'basic_inters',
    titre: 'Interventions basiques',
    emoji: '🚑',
    sous_competences: [
      { id: 'avp', titre: 'AVP / Airbag', emoji: '🚔', roles: [...ROLES_COMPETENCES] },
      {
        id: 'deshydratation',
        titre: 'Déshydratation / Hypoglycémie',
        emoji: '🥤',
        roles: [...ROLES_COMPETENCES],
      },
      { id: 'fractures', titre: 'Fractures', emoji: '🦴', roles: [...ROLES_COMPETENCES] },
      { id: 'chocs_tete', titre: 'Chocs tête', emoji: '🧠', roles: [...ROLES_COMPETENCES] },
      { id: 'noyade', titre: 'Noyade', emoji: '🌊', roles: [...ROLES_COMPETENCES] },
    ],
  },
  {
    id: 'advanced_inters',
    titre: 'Interventions avancées',
    emoji: '🏥',
    sous_competences: [
      { id: 'brulures', titre: 'Brûlures', emoji: '🔥', roles: [...ROLES_COMPETENCES] },
      { id: 'balles', titre: 'Balles', emoji: '🔫', roles: [...ROLES_COMPETENCES] },
      { id: 'chute_15m', titre: 'Chute +15m', emoji: '🧗', roles: [...ROLES_COMPETENCES] },
      { id: 'plaques_vis', titre: 'Plaques et vis', emoji: '🛠️', roles: [...ROLES_COMPETENCES] },
      { id: 'trepanation', titre: 'Trépanation', emoji: '🪚', roles: [...ROLES_COMPETENCES] },
      { id: 'centrale', titre: 'Centrale', emoji: '📻', roles: [...ROLES_COMPETENCES] },
    ],
  },
  {
    id: 'optional',
    titre: 'Optionnel',
    emoji: '⭐',
    sous_competences: [
      { id: 'detatouage', titre: 'Détatouage', emoji: '🧽', roles: [...ROLES_COMPETENCES] },
      { id: 'unite_x', titre: 'Unité X', emoji: '❎', roles: [...ROLES_COMPETENCES] },
      { id: 'patrouille', titre: 'Patrouille', emoji: '🚓', roles: [...ROLES_COMPETENCES] },
      {
        id: 'ouverture_dossier',
        titre: 'Ouverture de dossier',
        emoji: '📂',
        roles: [...ROLES_COMPETENCES],
      },
    ],
  },
]

const ROLES_VALIDATION = new Set([
  'Directeur',
  'Directeur Adjoint',
  'Assistant RH',
  'Responsable de Service',
])

const ROLE_EMOJIS_DEFAUT: Record<string, string> = {
  Directeur: '👑',
  'Directeur Adjoint': '🧭',
  'Assistant RH': '🗂️',
  'Responsable de Service': '📣',
  Spécialiste: '🧪',
  Titulaire: '🩺',
  Résident: '📚',
  Interne: '🧑‍🎓',
  Temporaire: '⏳',
}

const employeesApi = useCollection<Effectif>('employees')
const guidesApi = useCollection<Record<string, unknown>>('guides')
const formationSvc = useFormation()
const logger = useLogger()
const userStore = useUserStore()

const employes = ref<Employe[]>([])
const guides = ref<Guide[]>([])
const chargement = ref(false)
const recherche = ref('')
const onglet = ref<'suivi' | 'guides' | 'competences' | 'demandes'>('suivi')
const employeSelectionne = ref<Employe | null>(null)
const categories = ref<CategorieCompetence[]>([...CATEGORIES_PAR_DEFAUT])
const roleEmojis = ref<Record<string, string>>({ ...ROLE_EMOJIS_DEFAUT })

const guideOuvert = ref<Guide | null>(null)
const guideChecks = ref<boolean[]>([])

const formations = TRAININGS_CONFIG
const rolesEdition = [...ROLES_COMPETENCES].reverse()

const peutValiderCompetences = computed(() => {
  const role = userStore.profile?.role
  return !!role && ROLES_VALIDATION.has(role)
})

const employesFiltres = computed(() => {
  const terme = recherche.value.toLowerCase()
  return employes.value
    .filter((e) => !terme || e.name.toLowerCase().includes(terme))
    .sort((a, b) => {
      const ia = ORDRE_ROLES.indexOf(a.role)
      const ib = ORDRE_ROLES.indexOf(b.role)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
})

const demandesGroupees = computed(() => {
  const groups: Record<string, { id: string; name: string; training: string }[]> = {}
  for (const e of employes.value) {
    for (const req of e.trainingRequests ?? []) {
      if (!groups[req]) groups[req] = []
      groups[req]!.push({ id: e.id, name: e.name, training: req })
    }
  }
  return groups
})

const aDesDemandes = computed(() => Object.keys(demandesGroupees.value).length > 0)

// ─── Date helpers ───────────────────────────
function joursDepuis(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round(Math.abs((now.getTime() - d.getTime()) / 86400000))
}

function couleurJours(jours: number | null): string {
  if (jours == null) return ''
  if (jours >= 28) return '#ef4444'
  if (jours >= 21) return '#f97316'
  if (jours >= 14) return '#eab308'
  return ''
}

function labelJours(jours: number | null): string {
  if (jours == null) return ''
  if (jours >= 28) return 'Critique'
  if (jours >= 21) return 'Attention'
  if (jours >= 14) return 'A surveiller'
  return ''
}

// ─── Loading ────────────────────────────────
function normaliserCompetences(donnees: CategorieCompetence[]): CategorieCompetence[] {
  if (!Array.isArray(donnees) || donnees.length === 0) return CATEGORIES_PAR_DEFAUT
  return donnees.map((cat) => ({
    ...cat,
    sous_competences: (cat.sous_competences || []).map((sc) => ({
      ...sc,
      emoji: sc.emoji || '✅',
      roles:
        Array.isArray(sc.roles) && sc.roles.length > 0
          ? sc.roles.filter((r) => ROLES_COMPETENCES.includes(r))
          : [...ROLES_COMPETENCES],
    })),
  }))
}

function normaliserProgressions(
  donnees: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}
  for (const [id, progression] of Object.entries(donnees ?? {})) {
    if (typeof progression !== 'object' || progression === null) continue
    const norm: Record<string, number> = {}
    for (const [comp, val] of Object.entries(progression)) {
      norm[comp] = typeof val === 'number' && val > 0 ? 1 : 0
    }
    result[id] = norm
  }
  return result
}

async function charger(): Promise<void> {
  chargement.value = true
  const [effectifs, guidesData, etatCharge] = await Promise.all([
    employeesApi.lister().catch(() => [] as Effectif[]),
    guidesApi.lister().catch(() => [] as Record<string, unknown>[]),
    formationSvc.chargerEtat().catch(() => null),
  ])

  let etatFormation = etatCharge
  const etatVide =
    !etatFormation ||
    ((etatFormation.competences?.length ?? 0) === 0 &&
      Object.keys(etatFormation.role_emojis ?? {}).length === 0 &&
      Object.keys(etatFormation.progressions ?? {}).length === 0)

  if (etatVide) {
    const legacy = lireEtatLegacy()
    if (legacy) {
      etatFormation = legacy
      void formationSvc.sauvegarderEtat(legacy)
    }
  }

  const comps = normaliserCompetences(etatFormation?.competences ?? [])
  const emojis = { ...ROLE_EMOJIS_DEFAUT, ...etatFormation?.role_emojis }
  const progs = normaliserProgressions(etatFormation?.progressions ?? {})

  categories.value = comps
  roleEmojis.value = emojis

  employes.value = effectifs.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role || 'Non assigné',
    helicopterTrainingDate: e.helicopterTrainingDate ?? null,
    arrivalDate: e.arrivalDate ?? null,
    lastPromotionDate: e.lastPromotionDate ?? null,
    lastFollowUpDate: e.lastFollowUpDate ?? null,
    trainingRequests: e.trainingRequests ?? [],
    validatedTrainings: e.validatedTrainings ?? [],
    progression_competences: progs[e.id] ?? {},
  }))

  guides.value = guidesData.map((g) => ({
    id: (g as { id: string }).id,
    title: (g as { title?: string }).title ?? '',
    description: (g as { description?: string }).description ?? '',
    steps: ((g as { steps?: unknown[] }).steps ?? []) as Guide['steps'],
  }))

  chargement.value = false
}

function lireEtatLegacy(): FormationEtat | null {
  try {
    const compBrut = localStorage.getItem('bces_formation_competences_config')
    const rolesBrut = localStorage.getItem('bces_formation_role_emojis')
    const progBrut = localStorage.getItem('bces_formation_progressions')
    if (!compBrut && !rolesBrut && !progBrut) return null
    return {
      competences: normaliserCompetences(
        compBrut ? (JSON.parse(compBrut) as CategorieCompetence[]) : CATEGORIES_PAR_DEFAUT,
      ),
      role_emojis: {
        ...ROLE_EMOJIS_DEFAUT,
        ...(rolesBrut ? (JSON.parse(rolesBrut) as Record<string, string>) : {}),
      },
      progressions: normaliserProgressions(
        progBrut ? (JSON.parse(progBrut) as Record<string, Record<string, number>>) : {},
      ),
    }
  } catch {
    return null
  }
}

function construireProgressions(): Record<string, Record<string, number>> {
  const res: Record<string, Record<string, number>> = {}
  for (const e of employes.value) res[e.id] = e.progression_competences ?? {}
  return res
}

function sauvegarderFormation(): void {
  void formationSvc.sauvegarderEtat({
    competences: categories.value,
    role_emojis: roleEmojis.value,
    progressions: construireProgressions(),
  })
}

// ─── Follow-up ──────────────────────────────
async function modifierDateSuivi(e: Employe): Promise<void> {
  const { value } = await Swal.fire({
    title: 'Date du dernier suivi',
    input: 'date',
    inputValue: e.lastFollowUpDate ?? new Date().toISOString().split('T')[0],
    showCancelButton: true,
    confirmButtonText: 'Enregistrer',
    cancelButtonText: 'Annuler',
    showDenyButton: true,
    denyButtonText: 'Supprimer la date',
  })
  if (value !== undefined) {
    const d = (value as string) || null
    await employeesApi.modifier(e.id, { lastFollowUpDate: d } as unknown as Record<string, unknown>)
    employes.value = employes.value.map((emp) =>
      emp.id === e.id ? { ...emp, lastFollowUpDate: d } : emp,
    )
  }
}

async function supprimerDateSuivi(e: Employe): Promise<void> {
  await employeesApi.modifier(e.id, { lastFollowUpDate: null } as unknown as Record<
    string,
    unknown
  >)
  employes.value = employes.value.map((emp) =>
    emp.id === e.id ? { ...emp, lastFollowUpDate: null } : emp,
  )
}

// ─── Training requests ──────────────────────
async function ajouterDemande(): Promise<void> {
  const { value: empId } = await Swal.fire({
    title: 'Employé demandeur',
    input: 'select',
    inputOptions: Object.fromEntries(
      [...employes.value].sort((a, b) => a.name.localeCompare(b.name)).map((e) => [e.id, e.name]),
    ),
    showCancelButton: true,
    confirmButtonText: 'Suivant',
    cancelButtonText: 'Annuler',
    inputPlaceholder: 'Sélectionner un employé',
  })
  if (!empId) return
  const emp = employes.value.find((e) => e.id === empId)
  if (!emp) return

  const available = TRAININGS_CONFIG.filter((f) => !(emp.trainingRequests ?? []).includes(f.title))
  if (available.length === 0) {
    await Swal.fire({ icon: 'info', title: 'Cet employé a déjà demandé toutes les formations' })
    return
  }

  const { value: training } = await Swal.fire({
    title: 'Formation demandée',
    input: 'select',
    inputOptions: Object.fromEntries(available.map((f) => [f.title, f.title])),
    showCancelButton: true,
    confirmButtonText: 'Enregistrer',
    cancelButtonText: 'Annuler',
  })
  if (!training) return

  const newReqs = [...(emp.trainingRequests ?? []), training as string]
  await employeesApi.modifier(emp.id, { trainingRequests: newReqs } as unknown as Record<
    string,
    unknown
  >)
  employes.value = employes.value.map((e) =>
    e.id === emp.id ? { ...e, trainingRequests: newReqs } : e,
  )
  logger.log(
    userStore.profile?.name ?? '?',
    'FORMATION',
    `Ajout demande "${training}" pour ${emp.name}`,
  )
  void Swal.fire({
    icon: 'success',
    title: 'Demande enregistrée',
    showConfirmButton: false,
    timer: 1500,
  })
}

async function traiterDemande(empId: string, training: string): Promise<void> {
  const emp = employes.value.find((e) => e.id === empId)
  if (!emp) return

  const validables = ['Formation Grenouille', 'Formation Conduite']
  const isValidable = validables.includes(training)

  let result
  if (isValidable) {
    result = await Swal.fire({
      title: 'Traiter la demande',
      text: `Voulez-vous valider la formation "${training}" pour ${emp.name} ou simplement la supprimer ?`,
      icon: 'question',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Valider',
      denyButtonText: 'Refuser / Supprimer',
      cancelButtonText: 'Annuler',
    })
  } else {
    result = await Swal.fire({
      title: 'Supprimer la demande ?',
      text: `Supprimer la demande "${training}" pour ${emp.name} ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#d33',
    })
    if (result.isConfirmed) result = { ...result, isConfirmed: false, isDenied: true }
  }

  if (result.isDismissed) return

  const newReqs = (emp.trainingRequests ?? []).filter((r) => r !== training)
  const updates: Record<string, unknown> = { trainingRequests: newReqs }

  if (result.isConfirmed) {
    const newVal = [...(emp.validatedTrainings ?? [])]
    if (!newVal.includes(training)) newVal.push(training)
    updates['validatedTrainings'] = newVal
    await employeesApi.modifier(emp.id, updates)
    employes.value = employes.value.map((e) =>
      e.id === emp.id ? { ...e, trainingRequests: newReqs, validatedTrainings: newVal } : e,
    )
    logger.log(
      userStore.profile?.name ?? '?',
      'FORMATION',
      `Validation "${training}" pour ${emp.name}`,
    )
    void Swal.fire({
      icon: 'success',
      title: 'Formation validée',
      showConfirmButton: false,
      timer: 1500,
    })
  } else if (result.isDenied) {
    await employeesApi.modifier(emp.id, updates)
    employes.value = employes.value.map((e) =>
      e.id === emp.id ? { ...e, trainingRequests: newReqs } : e,
    )
    logger.log(
      userStore.profile?.name ?? '?',
      'FORMATION',
      `Suppression demande "${training}" pour ${emp.name}`,
    )
    void Swal.fire({
      icon: 'info',
      title: 'Demande supprimée',
      showConfirmButton: false,
      timer: 1500,
    })
  }
}

// ─── Validated trainings helpers ─────────────
function getTrainingEmoji(title: string): string {
  if (title === 'Formation Grenouille') return '🐸'
  if (title === 'Formation Conduite') return '🚗'
  if (title === 'Formation Off Road') return '⛰️'
  if (title === 'Formation Médicoptère') return '🚁'
  return '🎓'
}

function getTrainingColor(title: string): string {
  return TRAININGS_CONFIG.find((f) => f.title === title)?.color ?? '#6366f1'
}

function demandesPourFormation(titre: string): { id: string; name: string; training: string }[] {
  return demandesGroupees.value[titre] ?? []
}

async function retirerFormationValidee(emp: Employe, training: string): Promise<void> {
  const res = await Swal.fire({
    title: 'Retirer la formation ?',
    text: `Retirer "${training}" à ${emp.name} ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui, retirer',
    cancelButtonText: 'Annuler',
    confirmButtonColor: '#d33',
  })
  if (!res.isConfirmed) return
  const newVal = (emp.validatedTrainings ?? []).filter((t) => t !== training)
  await employeesApi.modifier(emp.id, { validatedTrainings: newVal } as unknown as Record<
    string,
    unknown
  >)
  employes.value = employes.value.map((e) =>
    e.id === emp.id ? { ...e, validatedTrainings: newVal } : e,
  )
  void Swal.fire({
    icon: 'success',
    title: 'Formation retirée',
    showConfirmButton: false,
    timer: 1500,
  })
}

// ─── Guide dialog ───────────────────────────
function ouvrirGuide(guide: Guide): void {
  guideOuvert.value = guide
  guideChecks.value = new Array(guide.steps?.length ?? 0).fill(false) as boolean[]
}

function fermerGuide(): void {
  guideOuvert.value = null
}

function basculerCheckGuide(index: number): void {
  const copy = [...guideChecks.value]
  copy[index] = !copy[index]
  guideChecks.value = copy
}

// ─── Competences editor ─────────────────────
function majEmojiRole(role: string, emoji: string): void {
  roleEmojis.value = {
    ...roleEmojis.value,
    [role]: emoji.trim() || ROLE_EMOJIS_DEFAUT[role] || '🏷️',
  }
  sauvegarderFormation()
}

function emojiRole(role: string): string {
  return roleEmojis.value[role] || ROLE_EMOJIS_DEFAUT[role] || '🏷️'
}

function genererIdCompetence(): string {
  const ids = new Set(categories.value.flatMap((c) => c.sous_competences.map((sc) => sc.id)))
  let index = ids.size + 1
  let id = `custom_${index}`
  while (ids.has(id)) {
    index++
    id = `custom_${index}`
  }
  return id
}

function ajouterCompetencePourRole(role: string): void {
  const id = genererIdCompetence()
  const cibleId = categories.value.some((c) => c.id === 'optional')
    ? 'optional'
    : (categories.value[0]?.id ?? 'optional')
  categories.value = categories.value.map((cat) =>
    cat.id === cibleId
      ? {
          ...cat,
          sous_competences: [
            ...cat.sous_competences,
            {
              id,
              titre: `Nouvelle compétence ${competencesPourRole(role).length + 1}`,
              emoji: '✅',
              roles: [role],
            },
          ],
        }
      : cat,
  )
  sauvegarderFormation()
}

function supprimerCompetence(compId: string): void {
  categories.value = categories.value.map((cat) => ({
    ...cat,
    sous_competences: cat.sous_competences.filter((sc) => sc.id !== compId),
  }))
  employes.value = employes.value.map((e) => {
    const prog = { ...e.progression_competences }
    delete prog[compId]
    return { ...e, progression_competences: prog }
  })
  const sel = employeSelectionne.value
  if (sel) {
    const prog = { ...sel.progression_competences }
    delete prog[compId]
    employeSelectionne.value = { ...sel, progression_competences: prog }
  }
  sauvegarderFormation()
}

function majTitreCompetence(compId: string, titre: string): void {
  categories.value = categories.value.map((cat) => ({
    ...cat,
    sous_competences: cat.sous_competences.map((sc) =>
      sc.id === compId ? { ...sc, titre: titre.trim() || sc.titre } : sc,
    ),
  }))
  sauvegarderFormation()
}

function majEmojiCompetence(compId: string, emoji: string): void {
  categories.value = categories.value.map((cat) => ({
    ...cat,
    sous_competences: cat.sous_competences.map((sc) =>
      sc.id === compId ? { ...sc, emoji: emoji.trim() || '✅' } : sc,
    ),
  }))
  sauvegarderFormation()
}

function basculerRoleCompetence(compId: string, role: string, active: boolean): void {
  categories.value = categories.value.map((cat) => ({
    ...cat,
    sous_competences: cat.sous_competences.map((sc) => {
      if (sc.id !== compId) return sc
      const roles = new Set(sc.roles)
      if (active) roles.add(role)
      else roles.delete(role)
      return { ...sc, roles: Array.from(roles) }
    }),
  }))
  sauvegarderFormation()
}

function competenceActivePourRole(compId: string, role: string): boolean {
  for (const cat of categories.value) {
    const sc = cat.sous_competences.find((s) => s.id === compId)
    if (sc) return sc.roles.includes(role)
  }
  return false
}

function competencesPourRole(role: string): { id: string; titre: string; emoji: string }[] {
  return categories.value
    .flatMap((c) => c.sous_competences)
    .filter((sc) => sc.roles.includes(role))
    .map((sc) => ({ id: sc.id, titre: sc.titre, emoji: sc.emoji }))
}

function competencesCategoriePourSelection(
  catId: string,
): { id: string; titre: string; emoji: string }[] {
  const sel = employeSelectionne.value
  if (!sel) return []
  const cat = categories.value.find((c) => c.id === catId)
  if (!cat) return []
  return cat.sous_competences
    .filter((sc) => sc.roles.includes(sel.role))
    .map((sc) => ({ id: sc.id, titre: sc.titre, emoji: sc.emoji }))
}

function basculerValidationCompetence(compId: string, validee: boolean): void {
  if (!peutValiderCompetences.value) return
  const sel = employeSelectionne.value
  if (!sel) return
  if (!competenceActivePourRole(compId, sel.role)) return
  const progression = { ...sel.progression_competences, [compId]: validee ? 1 : 0 }
  employes.value = employes.value.map((e) =>
    e.id === sel.id ? { ...e, progression_competences: progression } : e,
  )
  employeSelectionne.value = { ...sel, progression_competences: progression }
  sauvegarderFormation()
}

async function basculerValidationHelico(validee: boolean): Promise<void> {
  if (!peutValiderCompetences.value) return
  const sel = employeSelectionne.value
  if (!sel) return
  const prev = sel.helicopterTrainingDate
  const newVal = validee ? (new Date().toISOString().split('T')[0] ?? '') : null
  employes.value = employes.value.map((e) =>
    e.id === sel.id ? { ...e, helicopterTrainingDate: newVal } : e,
  )
  employeSelectionne.value = { ...sel, helicopterTrainingDate: newVal }
  try {
    await employeesApi.modifier(sel.id, { helicopterTrainingDate: newVal } as unknown as Record<
      string,
      unknown
    >)
  } catch {
    employes.value = employes.value.map((e) =>
      e.id === sel.id ? { ...e, helicopterTrainingDate: prev } : e,
    )
    employeSelectionne.value = { ...sel, helicopterTrainingDate: prev }
  }
}

function estCompetenceValidee(compId: string): boolean {
  return (employeSelectionne.value?.progression_competences?.[compId] ?? 0) > 0
}

function voirCompetences(e: Employe): void {
  employeSelectionne.value = e
}
function fermerCompetences(): void {
  employeSelectionne.value = null
}

function progressionTotale(e: Employe): number {
  const actives = categories.value
    .flatMap((c) => c.sous_competences)
    .filter((sc) => sc.roles.includes(e.role))
  const total = actives.length
  const idsActifs = new Set(actives.map((sc) => sc.id))
  const valides = Object.entries(e.progression_competences || {}).filter(
    ([id, v]) => idsActifs.has(id) && v > 0,
  ).length
  return total > 0 ? Math.round((valides / total) * 100) : 0
}

onMounted(() => {
  void charger()
})
</script>

<template>
  <div class="formation-page">
    <div class="page-header formation-hero">
      <div class="formation-hero__copy">
        <span class="formation-kicker">Formation</span>
        <h1>Formation</h1>
        <p>Suivi des employés, guides, compétences et demandes de formation.</p>
      </div>
    </div>

    <!-- Demandes banner -->
    <div v-if="aDesDemandes" class="alert-banner">
      <i class="fa-solid fa-bell" aria-hidden="true"></i>
      {{ Object.values(demandesGroupees).flat().length }} demande{{
        Object.values(demandesGroupees).flat().length > 1 ? 's' : ''
      }}
      en attente
    </div>

    <nav class="tab-bar">
      <button :class="['tab-btn', { active: onglet === 'suivi' }]" @click="onglet = 'suivi'">
        Suivi
      </button>
      <button :class="['tab-btn', { active: onglet === 'guides' }]" @click="onglet = 'guides'">
        Guides
      </button>
      <button
        :class="['tab-btn', { active: onglet === 'competences' }]"
        @click="onglet = 'competences'"
      >
        Compétences
      </button>
      <button :class="['tab-btn', { active: onglet === 'demandes' }]" @click="onglet = 'demandes'">
        Demandes
      </button>
    </nav>

    <!-- Loading -->
    <div v-if="chargement" class="empty">Chargement…</div>

    <!-- Suivi -->
    <section v-else-if="onglet === 'suivi'" class="panel">
      <div class="toolbar">
        <input
          type="text"
          class="field"
          v-model="recherche"
          placeholder="Rechercher…"
          style="max-width: 260px"
        />
        <button class="btn accent" @click="charger()">
          <i class="fa-solid fa-rotate" aria-hidden="true"></i> Synchroniser
        </button>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employé</th>
              <th>Rôle</th>
              <th>Arrivée</th>
              <th>Jours au grade</th>
              <th>Formations</th>
              <th>Progression</th>
              <th>Dernier suivi</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in employesFiltres" :key="e.id">
              <td>{{ e.name }}</td>
              <td>
                <span class="chip" :style="{ borderColor: obtenirCouleurRole(e.role) }">{{
                  e.role
                }}</span>
              </td>
              <td>{{ e.arrivalDate ?? '—' }}</td>
              <td>
                <template v-if="joursDepuis(e.lastPromotionDate) != null">
                  {{ joursDepuis(e.lastPromotionDate) }} j
                  <span
                    v-if="labelJours(joursDepuis(e.lastPromotionDate))"
                    class="chip sm"
                    :style="{
                      background: couleurJours(joursDepuis(e.lastPromotionDate)) + '22',
                      color: couleurJours(joursDepuis(e.lastPromotionDate)),
                    }"
                    >{{ labelJours(joursDepuis(e.lastPromotionDate)) }}</span
                  >
                </template>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <span
                  v-for="t in e.validatedTrainings"
                  :key="t"
                  class="chip sm"
                  :style="{ background: getTrainingColor(t) + '22', color: getTrainingColor(t) }"
                  @click="retirerFormationValidee(e, t)"
                  style="cursor: pointer"
                  :title="'Cliquer pour retirer'"
                >
                  {{ getTrainingEmoji(t) }} {{ t }}
                </span>
                <span v-if="!e.validatedTrainings?.length" class="text-muted">—</span>
              </td>
              <td>
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: progressionTotale(e) + '%' }"></div>
                </div>
                <span class="progress-label">{{ progressionTotale(e) }}%</span>
              </td>
              <td>
                <span
                  v-if="e.lastFollowUpDate"
                  :style="{ color: couleurJours(joursDepuis(e.lastFollowUpDate)) }"
                >
                  {{ e.lastFollowUpDate }}
                  <span
                    v-if="labelJours(joursDepuis(e.lastFollowUpDate))"
                    class="chip sm"
                    :style="{
                      background: couleurJours(joursDepuis(e.lastFollowUpDate)) + '22',
                      color: couleurJours(joursDepuis(e.lastFollowUpDate)),
                    }"
                    >{{ labelJours(joursDepuis(e.lastFollowUpDate)) }}</span
                  >
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <div style="display: flex; gap: 0.25rem">
                  <button
                    class="btn-icon"
                    @click="modifierDateSuivi(e)"
                    title="Modifier date suivi"
                  >
                    <i class="fa-solid fa-calendar-pen" aria-hidden="true"></i>
                  </button>
                  <button
                    v-if="e.lastFollowUpDate"
                    class="btn-icon danger"
                    @click="supprimerDateSuivi(e)"
                    title="Supprimer date"
                  >
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                  </button>
                  <button class="btn-icon" @click="voirCompetences(e)" title="Compétences">
                    <i class="fa-solid fa-user-graduate" aria-hidden="true"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="employesFiltres.length === 0">
              <td colspan="8" class="empty">Aucun employé</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Guides -->
    <section v-else-if="onglet === 'guides'" class="panel">
      <div class="cards-grid">
        <div v-for="g in guides" :key="g.id" class="guide-card" @click="ouvrirGuide(g)">
          <span class="guide-title">{{ g.title }}</span>
          <p v-if="g.description" class="guide-desc">{{ g.description }}</p>
          <span class="guide-steps">{{ g.steps?.length ?? 0 }} étapes</span>
        </div>
        <p v-if="guides.length === 0" class="empty">Aucun guide</p>
      </div>
    </section>

    <!-- Competences editor -->
    <section v-else-if="onglet === 'competences'" class="panel">
      <!-- Role emojis -->
      <div class="comp-section">
        <h3 class="comp-cat-title">Emojis par rôle</h3>
        <div class="comp-list">
          <div v-for="role in rolesEdition" :key="role" class="comp-item">
            <span class="comp-emoji">{{ emojiRole(role) }}</span>
            <span class="comp-name">{{ role }}</span>
            <input
              type="text"
              class="field sm-input"
              :value="emojiRole(role)"
              @change="majEmojiRole(role, ($event.target as HTMLInputElement).value)"
              style="width: 3rem"
            />
          </div>
        </div>
      </div>

      <!-- Categories & sub-competences -->
      <div v-for="cat in categories" :key="cat.id" class="comp-section">
        <h3 class="comp-cat-title">{{ cat.emoji }} {{ cat.titre }}</h3>
        <div class="comp-list">
          <div v-for="sc in cat.sous_competences" :key="sc.id" class="comp-item">
            <input
              type="text"
              class="field sm-input"
              :value="sc.emoji"
              @change="majEmojiCompetence(sc.id, ($event.target as HTMLInputElement).value)"
              style="width: 3rem"
            />
            <input
              type="text"
              class="field sm-input"
              :value="sc.titre"
              @change="majTitreCompetence(sc.id, ($event.target as HTMLInputElement).value)"
              style="flex: 1"
            />
            <div class="role-toggles">
              <button
                v-for="r in rolesEdition"
                :key="r"
                :class="['chip toggle', { active: sc.roles.includes(r) }]"
                @click="basculerRoleCompetence(sc.id, r, !sc.roles.includes(r))"
              >
                {{ emojiRole(r) }}
              </button>
            </div>
            <button class="btn-icon danger" @click="supprimerCompetence(sc.id)">
              <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Add competence per role -->
      <div class="toolbar" style="margin-top: 0.5rem">
        <span class="text-muted" style="font-size: 0.78rem">Ajouter une compétence pour :</span>
        <button
          v-for="r in rolesEdition"
          :key="r"
          class="btn sm"
          @click="ajouterCompetencePourRole(r)"
        >
          {{ emojiRole(r) }} {{ r }}
        </button>
      </div>
    </section>

    <!-- Demandes -->
    <section v-else-if="onglet === 'demandes'" class="panel">
      <div class="toolbar">
        <button class="btn accent" @click="ajouterDemande">
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter une demande
        </button>
      </div>
      <div v-for="f in formations" :key="f.title" class="req-group">
        <h3 class="req-title">{{ getTrainingEmoji(f.title) }} {{ f.title }}</h3>
        <template v-if="demandesPourFormation(f.title).length">
          <div v-for="item in demandesPourFormation(f.title)" :key="item.id" class="req-card">
            <div class="req-info">
              <strong>{{ item.name }}</strong>
            </div>
            <div class="req-actions">
              <button class="btn accent sm" @click="traiterDemande(item.id, item.training)">
                <i class="fa-solid fa-gavel" aria-hidden="true"></i> Traiter
              </button>
            </div>
          </div>
        </template>
        <p v-else class="empty" style="padding: 0.5rem">Aucune demande en attente</p>
      </div>
    </section>

    <!-- Guide dialog -->
    <Teleport to="body">
      <div v-if="guideOuvert" class="overlay" @click="fermerGuide">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">{{ guideOuvert.title }}</h3>
          <p v-if="guideOuvert.description" class="text-muted" style="margin: 0 0 0.5rem">
            {{ guideOuvert.description }}
          </p>
          <ul class="checklist">
            <li
              v-for="(step, idx) in guideOuvert.steps"
              :key="idx"
              :class="{ done: guideChecks[idx] }"
            >
              <template v-if="step.header">
                <strong class="step-header">{{ step.header }}</strong>
              </template>
              <label
                ><input
                  type="checkbox"
                  :checked="guideChecks[idx]"
                  @change="basculerCheckGuide(idx)"
                />
                {{ step.title }}</label
              >
              <p v-if="step.description" class="step-desc">{{ step.description }}</p>
            </li>
          </ul>
          <div class="dialog-actions">
            <button class="btn" @click="fermerGuide">Fermer</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Employee competencies dialog -->
    <Teleport to="body">
      <div v-if="employeSelectionne" class="overlay" @click="fermerCompetences">
        <div class="dialog dialog-wide" @click.stop>
          <h3 class="dialog-title">
            Compétences — {{ employeSelectionne.name }}
            <span
              class="chip"
              :style="{ borderColor: obtenirCouleurRole(employeSelectionne.role) }"
              >{{ employeSelectionne.role }}</span
            >
          </h3>
          <p v-if="peutValiderCompetences" class="text-muted" style="margin: 0 0 0.5rem">
            Validation activée pour votre rôle.
          </p>
          <p v-else class="text-muted" style="margin: 0 0 0.5rem">
            Lecture seule : votre rôle ne peut pas valider les compétences.
          </p>

          <!-- Helicopter -->
          <div class="comp-item" style="margin-bottom: 0.5rem">
            <span class="comp-emoji">🚁</span>
            <span class="comp-name">Formation Médicoptère</span>
            <button
              v-if="peutValiderCompetences"
              :class="['chip toggle', { active: !!employeSelectionne.helicopterTrainingDate }]"
              @click="basculerValidationHelico(!employeSelectionne.helicopterTrainingDate)"
            >
              {{
                employeSelectionne.helicopterTrainingDate
                  ? '✅ ' + employeSelectionne.helicopterTrainingDate
                  : '⬜'
              }}
            </button>
            <span
              v-else
              :class="employeSelectionne.helicopterTrainingDate ? 'chip sm green' : 'chip sm'"
            >
              {{
                employeSelectionne.helicopterTrainingDate
                  ? '✅ ' + employeSelectionne.helicopterTrainingDate
                  : '⬜'
              }}
            </span>
          </div>

          <div v-for="cat in categories" :key="cat.id" class="comp-category">
            <h4 class="comp-cat-title">{{ cat.emoji }} {{ cat.titre }}</h4>
            <div class="comp-list">
              <div
                v-for="sc in competencesCategoriePourSelection(cat.id)"
                :key="sc.id"
                class="comp-item"
              >
                <span class="comp-emoji">{{ sc.emoji }}</span>
                <span class="comp-name">{{ sc.titre }}</span>
                <button
                  v-if="peutValiderCompetences"
                  :class="['chip toggle', { active: estCompetenceValidee(sc.id) }]"
                  @click="basculerValidationCompetence(sc.id, !estCompetenceValidee(sc.id))"
                >
                  {{ estCompetenceValidee(sc.id) ? '✅' : '⬜' }}
                </button>
                <span v-else :class="estCompetenceValidee(sc.id) ? 'chip sm green' : 'chip sm'">
                  {{ estCompetenceValidee(sc.id) ? '✅' : '⬜' }}
                </span>
              </div>
            </div>
          </div>

          <div style="margin-top: 0.75rem">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: progressionTotale(employeSelectionne) + '%' }"
              ></div>
            </div>
            <span class="progress-label"
              >Progression : {{ progressionTotale(employeSelectionne) }}%</span
            >
          </div>

          <div class="dialog-actions">
            <button class="btn" @click="fermerCompetences">Fermer</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.formation-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  animation: fadeIn 0.28s ease;
}
.formation-hero {
  display: flex;
  align-items: center;
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
.formation-kicker {
  display: inline-flex;
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
.formation-hero__copy {
  h1 {
    margin: 0.1rem 0 0.35rem;
    color: #f4f9ff;
    font-size: 1.72rem;
    font-weight: 900;
  }
  p {
    margin: 0;
    color: #a9c7e2;
    font-size: 0.92rem;
  }
}
.alert-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  border-radius: 12px;
  background: rgba(255, 152, 0, 0.12);
  border: 1px solid rgba(255, 152, 0, 0.3);
  color: #ffb74d;
  font-size: 0.85rem;
  font-weight: 700;
}
.tab-bar {
  display: flex;
  gap: 0.35rem;
}
.tab-btn {
  padding: 0.42rem 0.78rem;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-elevated) 82%, transparent 18%);
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  &.active {
    background: linear-gradient(135deg, #1976d2, #1e88e5);
    color: #fff;
    border-color: transparent;
  }
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.table-container {
  overflow: auto;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 52%, transparent 48%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 93%, transparent 7%),
    color-mix(in srgb, var(--surface) 92%, transparent 8%)
  );
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  th,
  td {
    padding: 0.5rem 0.65rem;
    border-bottom: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
    text-align: left;
    font-size: 0.82rem;
  }
  th {
    background: linear-gradient(180deg, #121b2f, #0f172a);
    font-weight: 800;
    font-size: 0.7rem;
    text-transform: uppercase;
    color: #bfd0e6;
    position: sticky;
    top: 0;
  }
  tbody tr:hover {
    background: color-mix(in srgb, var(--surface-hover) 78%, var(--accent-subtle) 22%);
  }
}
.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  flex: 1;
  min-width: 60px;
  &.sm {
    height: 4px;
  }
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1976d2, #42a5f5);
  border-radius: 3px;
  transition: width 0.3s;
}
.progress-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: #8dadc7;
}
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
}
.guide-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  cursor: pointer;
  transition: background 0.2s;
  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }
}
.guide-icon {
  font-size: 1.5rem;
}
.guide-title {
  font-weight: 800;
  font-size: 0.88rem;
  color: #f4f9ff;
}
.guide-desc {
  font-size: 0.78rem;
  color: #a9c7e2;
  margin: 0;
}
.guide-steps {
  font-size: 0.7rem;
  color: #8dadc7;
}
.step-header {
  display: block;
  font-size: 0.78rem;
  color: #8dadc7;
  margin-bottom: 0.15rem;
}
.step-desc {
  font-size: 0.75rem;
  color: #8dadc7;
  margin: 0.1rem 0 0 1.5rem;
}
.comp-category {
  margin-bottom: 0.5rem;
}
.comp-section {
  margin-bottom: 0.75rem;
}
.comp-cat-title {
  font-size: 0.82rem;
  font-weight: 800;
  color: #8dadc7;
  text-transform: uppercase;
  margin: 0.25rem 0;
}
.comp-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.comp-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}
.comp-emoji {
  font-size: 1.1rem;
}
.comp-name {
  flex: 1;
  font-size: 0.82rem;
  font-weight: 600;
}
.comp-roles {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.comp-actions {
  display: flex;
  gap: 0.25rem;
}
.chip {
  display: inline-flex;
  padding: 0.15rem 0.45rem;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  &.sm {
    font-size: 0.65rem;
    padding: 0.1rem 0.35rem;
  }
  &.toggle {
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.08);
    &.active {
      background: linear-gradient(135deg, #1976d2, #1e88e5);
      color: #fff;
      border-color: transparent;
    }
  }
  &.green {
    background: rgba(76, 175, 80, 0.15);
    color: #81c784;
  }
}
.badge {
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  &.green {
    background: rgba(76, 175, 80, 0.15);
    color: #81c784;
  }
  &.red {
    background: rgba(244, 67, 54, 0.15);
    color: #ef9a9a;
  }
  &.orange {
    background: rgba(255, 152, 0, 0.15);
    color: #ffb74d;
  }
}
.req-group {
  margin-bottom: 0.75rem;
}
.req-title {
  font-size: 0.92rem;
  font-weight: 800;
  color: #f4f9ff;
  margin: 0 0 0.35rem;
}
.req-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 0.25rem;
}
.req-info {
  flex: 1;
  font-size: 0.82rem;
}
.req-actions {
  display: flex;
  gap: 0.25rem;
}
.text-muted {
  color: var(--text-muted);
}
.checklist {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
  li {
    padding: 0.35rem 0;
    label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      cursor: pointer;
    }
    &.done label {
      text-decoration: line-through;
      opacity: 0.6;
    }
  }
}
.role-toggles {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
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
.form-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0.25rem 0;
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
.sm-input {
  width: auto;
  padding: 0.3rem 0.45rem;
  font-size: 0.78rem;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.48rem 0.86rem;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  background: color-mix(in srgb, var(--surface-elevated) 80%, var(--dispatch-zone-border) 20%);
  color: var(--text-primary);
  &.accent {
    background: linear-gradient(135deg, #1976d2, #1e88e5);
    color: #fff;
  }
  &.danger {
    background: rgba(244, 67, 54, 0.15);
    color: #ef9a9a;
  }
  &.sm {
    padding: 0.3rem 0.55rem;
    font-size: 0.75rem;
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
  font-size: 0.9rem;
  padding: 0;
  &.danger {
    color: var(--danger);
  }
  i {
    display: block;
    line-height: 1;
  }
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 2rem;
}
.dialog-wide {
  min-width: 480px;
}
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
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
