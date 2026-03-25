<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useDispatch } from '@/composables/useDispatch'
import { useFormation } from '@/composables/useFormation'
import { useUserStore } from '@/stores/user'
import type { Effectif } from '@/models/effectif'
import type {
  SlotIntervention,
  EffectifPatate,
  EntreeCrise,
  RadioDispatch,
} from '@/models/dispatch'
import {
  CATEGORIES,
  TYPES_INTERVENTION,
  STATUTS_RETOUR,
  ROLES_CENTRAL,
  STATUTS_HOPITAL,
  COMPLEMENTS,
  APPARTENANCES_CRISE,
  CHAMBRES_CRISE,
} from '@/config/dispatch.config'
import { ROLES_CONFIG, ORDRE_ROLES } from '@/config/roles.config'

const { etat, connecte, connecter, deconnecter, envoyerEtat, mettreAJour } = useDispatch()
const employeesApi = useCollection<Effectif>('employees')
const formationSvc = useFormation()
const userStore = useUserStore()

const triTexte = new Intl.Collator('fr', { sensitivity: 'base' })
const sheetGvizUrl =
  'https://docs.google.com/spreadsheets/d/1A1gxOho_roNwxTtcbiEpLGSWbD8JUasMDu4NL-zdcbw/gviz/tq?gid=0&tqx=out:json&range=B3:D3'
let timerStatutsServices: ReturnType<typeof setInterval> | null = null

const categories = CATEGORIES
const typesIntervention = TYPES_INTERVENTION
const statutsRetour = STATUTS_RETOUR
const rolesCentral = ROLES_CENTRAL
const statutsHopital = STATUTS_HOPITAL
const complements = COMPLEMENTS
const appartenances = APPARTENANCES_CRISE
const chambresCrise = CHAMBRES_CRISE

const effectifs = ref<Effectif[]>([])
const progressionsFormation = ref<Record<string, Record<string, number>>>({})
const competencesFormation = ref<Record<string, { emoji: string; roles: string[] }>>({})
const roleEmojisFormation = ref<Record<string, string>>({})
const statutLses = ref('Indisponibles')
const statutSafd = ref('Indisponibles')

const sectionCriseOuverte = ref(false)
const inclureLsesCrise = ref(false)
const selectAjoutRadioOuvert = ref(false)

const unsubs: (() => void)[] = []

const hopitalSelectRef = ref<HTMLSelectElement | null>(null)

// ── Helpers privés ──
function normaliserNom(nom: string): string {
  return nom.trim().toLowerCase()
}
function extrairePrenom(nomComplet: string): string {
  return nomComplet.trim().split(/\s+/).filter(Boolean)[0] ?? ''
}
function extraireInitialeNomFamille(nomComplet: string): string {
  const morceaux = nomComplet.trim().split(/\s+/).filter(Boolean)
  if (morceaux.length < 2) return ''
  const dernier = morceaux[morceaux.length - 1] ?? ''
  return dernier.charAt(0).toUpperCase()
}
function estVisibleSurDispatch(effectif: Effectif): boolean {
  const role = effectif.role
  if (!role || !ORDRE_ROLES.includes(role) || role === 'Non assigné') return false
  return true
}
function ordreRole(role: string): number {
  const index = ORDRE_ROLES.indexOf(role)
  return index === -1 ? 999 : index
}
function comparerEffectifs(a: Effectif, b: Effectif): number {
  const oa = ordreRole(a.role)
  const ob = ordreRole(b.role)
  if (oa !== ob) return oa - ob
  return triTexte.compare(a.name || '', b.name || '')
}
function trierEffectifs(liste: readonly Effectif[]): Effectif[] {
  return [...liste].sort((a, b) => comparerEffectifs(a, b))
}
function trierPatatesParEffectif(patates: readonly EffectifPatate[]): EffectifPatate[] {
  return [...patates].sort((a, b) => {
    const effA = obtenirEffectif(a.id)
    const effB = obtenirEffectif(b.id)
    if (!effA && !effB) return a.id.localeCompare(b.id)
    if (!effA) return 1
    if (!effB) return -1
    return comparerEffectifs(effA, effB)
  })
}
function estCategorieDirecte(categorie: string | null | undefined): boolean {
  const n = (categorie ?? '').toLowerCase()
  return n.includes('direction') || n.includes('direct')
}

// ── Computed ──
const effectifsVisibles = computed(() => effectifs.value.filter((e) => estVisibleSurDispatch(e)))

const indexPrenomsTuiles = computed(() => {
  const index = new Map<string, number>()
  for (const eff of effectifsVisibles.value) {
    const prenom = extrairePrenom(eff.name)
    if (!prenom) continue
    const cle = normaliserNom(prenom)
    index.set(cle, (index.get(cle) ?? 0) + 1)
  }
  return index
})

const nombreEnServiceTotal = computed(() => {
  const e = etat.value
  const ids = new Set<string>()
  for (const p of e.patates) {
    if (p.categorie === 'en_service') ids.add(p.id)
  }
  for (const id of e.centrale.effectifs) ids.add(id)
  for (const inter of e.interventions) {
    for (const id of inter.effectifs) ids.add(id)
  }
  let total = 0
  for (const id of ids) {
    if (obtenirEffectif(id)) total++
  }
  return total
})

const effectifsEnService = computed(() => {
  const idsVis = new Set(effectifsVisibles.value.map((e) => e.id))
  return trierPatatesParEffectif(
    etat.value.patates.filter((p) => p.categorie === 'en_service' && idsVis.has(p.id)),
  )
})

const effectifsParCategorie = computed(() => {
  const idsVis = new Set(effectifsVisibles.value.map((e) => e.id))
  const map: Record<string, EffectifPatate[]> = {}
  for (const cat of categories) {
    map[cat.id] = trierPatatesParEffectif(
      etat.value.patates.filter((p) => p.categorie === cat.id && idsVis.has(p.id)),
    )
  }
  return map
})

const effectifsHorsService = computed(() => {
  const e = etat.value
  const ids = new Set<string>()
  for (const p of e.patates) ids.add(p.id)
  for (const id of e.centrale.effectifs) ids.add(id)
  for (const inter of e.interventions) {
    for (const id of inter.effectifs) ids.add(id)
  }
  for (const id of e.effectifs_temporaires) ids.add(id)
  return trierEffectifs(effectifsVisibles.value.filter((e) => !ids.has(e.id)))
})

const nombreHorsService = computed(() => effectifsHorsService.value.length)

const medecinsCrise = computed(() => {
  const set = new Set<string>()
  const rolesAutorises = new Set(ORDRE_ROLES)
  rolesAutorises.delete('LSES')
  for (const eff of effectifs.value) {
    if (!eff.role || !rolesAutorises.has(eff.role)) continue
    if (eff.name) set.add(eff.name)
  }
  if (inclureLsesCrise.value) set.add('LSES')
  return Array.from(set)
})

const radiosDirectes = computed(() =>
  etat.value.radios.filter((r) => estCategorieDirecte(r.categorie)),
)
const radiosStandards = computed(() =>
  etat.value.radios.filter((r) => !estCategorieDirecte(r.categorie)),
)

const isDirection = computed(() => {
  const p = userStore.profile
  if (!p) return false
  if (p.role === 'Directeur' || p.role === 'Directeur Adjoint') return true
  const perms = p.permissions ?? []
  if (perms.includes('admin') || perms.includes('dev')) return true
  const nom = normaliserNom(p.name ?? '')
  if (!nom) return false
  const emp = effectifs.value.find((e) => normaliserNom(e.name) === nom)
  return emp?.role === 'Directeur' || emp?.role === 'Directeur Adjoint'
})

const hasLsesPerm = computed(() => {
  const perms = userStore.profile?.permissions ?? []
  return (
    perms.includes('lses') ||
    perms.includes('bces') ||
    perms.includes('dev') ||
    perms.includes('admin') ||
    isDirection.value
  )
})

const peutGererRadiosDepuisDispatch = computed(() => hasLsesPerm.value)
const peutGererRadiosDirection = computed(() => {
  const perms = userStore.profile?.permissions ?? []
  return isDirection.value || perms.includes('admin') || perms.includes('dev')
})
const peutGererAssignationRadios = computed(() => hasLsesPerm.value)

const effectifsAssignablesRadio = computed(() => {
  const e = etat.value
  const ids = new Set<string>()
  for (const p of e.patates) {
    if (p.categorie === 'en_service') ids.add(p.id)
  }
  for (const id of e.centrale.effectifs) ids.add(id)
  for (const inter of e.interventions) {
    for (const id of inter.effectifs) ids.add(id)
  }
  return trierEffectifs(effectifsVisibles.value.filter((e) => ids.has(e.id)))
})

// ── Fonctions publiques ──
function obtenirEffectif(id: string): Effectif | undefined {
  return effectifsVisibles.value.find((e) => e.id === id)
}
function obtenirCouleurRole(role: string): string {
  return ROLES_CONFIG[role]?.color ?? '#757575'
}
function nomEffectifRadio(effectifId: string | null): string {
  if (effectifId == null) return 'Assigner'
  return obtenirEffectif(effectifId)?.name || 'Assigner'
}
function trierIdsEffectifs(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ea = obtenirEffectif(a)
    const eb = obtenirEffectif(b)
    if (!ea && !eb) return a.localeCompare(b)
    if (!ea) return 1
    if (!eb) return -1
    return comparerEffectifs(ea, eb)
  })
}
function nomTuile(effectif: Effectif): string {
  const nc = (effectif.name ?? '').trim()
  if (!nc) return ''
  const prenom = extrairePrenom(nc)
  if (!prenom) return nc
  const nb = indexPrenomsTuiles.value.get(normaliserNom(prenom)) ?? 0
  if (nb < 2) return prenom
  const init = extraireInitialeNomFamille(nc)
  return init ? `${prenom} ${init}.` : prenom
}

function obtenirSpecialites(effectif: Effectif): string[] {
  return Array.isArray(effectif.specialties) ? effectif.specialties : []
}
function obtenirValidations(effectif: Effectif): string[] {
  const validations = new Set<string>()
  const role = effectif.role
  const prog = progressionsFormation.value[effectif.id] ?? {}
  const defs = competencesFormation.value
  for (const [cid, val] of Object.entries(prog)) {
    if (val <= 0) continue
    const def = defs[cid]
    if (!def) continue
    if (role && def.roles.length > 0 && !def.roles.includes(role)) continue
    if (def.emoji) validations.add(def.emoji)
  }
  return Array.from(validations)
}

function nombreRadiosUtilisees(radios: readonly RadioDispatch[]): number {
  return radios.filter((r) => r.effectif_id != null).length
}

// ── Statuts services polling ──
function valeurCellule(
  c: { v?: string | number | null; f?: string | null } | null | undefined,
): string {
  return String(c?.f ?? c?.v ?? '').trim()
}
function traduireStatutLses(brut: string): string {
  const v = brut.trim()
  if (!v) return "C'est bugué"
  const m = v.toLowerCase()
  if (m.includes('indispon')) return 'Indisponibles'
  if (m.includes('off') || m.includes('ferm')) return 'Indisponibles'
  if (m.includes('ouvert')) return 'Disponibles'
  if (m === 'disponibles' || m === 'disponible') return 'Disponibles'
  if (m.includes('nuit')) return 'Mode nuit'
  switch (v) {
    case '🎙️':
      return 'Disponibles'
    case 'Off - 🎙️':
      return 'Indisponibles'
    case '🌙':
      return 'Mode nuit'
    default:
      return "C'est bugué"
  }
}
function traduireStatutSafd(brut: string): string {
  const v = brut.trim()
  if (!v) return 'Indisponibles'
  const n = Number(v.replace(',', '.'))
  if (!Number.isNaN(n)) return n > 0 ? 'Disponibles' : 'Indisponibles'
  const m = v.toLowerCase()
  if (m.includes('indispon') || m.includes('ferm')) return 'Indisponibles'
  if (m === 'disponibles' || m === 'disponible') return 'Disponibles'
  return v
}
function etatLsesNormalise(): 'disponibles' | 'indisponibles' | 'mode_nuit' | 'bug' {
  const m = statutLses.value.trim().toLowerCase()
  if (m === 'mode nuit') return 'mode_nuit'
  if (m === 'disponibles' || m === 'disponible') return 'disponibles'
  if (m === 'indisponibles' || m === 'indisponible') return 'indisponibles'
  return 'bug'
}
function etatSafdNormalise(): 'disponibles' | 'indisponibles' {
  const m = statutSafd.value.trim().toLowerCase()
  return m === 'disponibles' || m === 'disponible' ? 'disponibles' : 'indisponibles'
}
function couleurHopitalOuvert(): string {
  return statutsHopital.find((s) => s.id === 'gestion_normale')?.couleur ?? '#4caf50'
}
function couleurHopitalFerme(): string {
  return statutsHopital.find((s) => s.id === 'hopital_ferme')?.couleur ?? '#f44336'
}
function couleurHopitalModeNuit(): string {
  return statutsHopital.find((s) => s.id === 'mode_nuit')?.couleur ?? '#311b92'
}

function couleurFondLses(): string {
  switch (etatLsesNormalise()) {
    case 'disponibles':
      return 'linear-gradient(180deg, #1f5f3f, #184e34)'
    case 'mode_nuit':
      return 'linear-gradient(180deg, #2f356a, #262d5a)'
    case 'indisponibles':
      return 'linear-gradient(180deg, #5b1f2a, #4c1822)'
    default:
      return 'linear-gradient(180deg, #5a3f1d, #4a3318)'
  }
}
function couleurBordLses(): string {
  switch (etatLsesNormalise()) {
    case 'disponibles':
      return couleurHopitalOuvert()
    case 'mode_nuit':
      return couleurHopitalModeNuit()
    default:
      return couleurHopitalFerme()
  }
}
function couleurEtatLses(): string {
  switch (etatLsesNormalise()) {
    case 'disponibles':
      return '#d8ffe9'
    case 'mode_nuit':
      return '#dce3ff'
    case 'indisponibles':
      return '#ffd1dc'
    default:
      return '#ffe4b8'
  }
}
function couleurFondSafd(): string {
  return etatSafdNormalise() === 'disponibles'
    ? 'linear-gradient(180deg, #1f5f3f, #184e34)'
    : 'linear-gradient(180deg, #5b1f2a, #4c1822)'
}
function couleurBordSafd(): string {
  return etatSafdNormalise() === 'disponibles' ? couleurHopitalOuvert() : couleurHopitalFerme()
}
function couleurEtatSafd(): string {
  return etatSafdNormalise() === 'disponibles' ? '#d8ffe9' : '#ffd1dc'
}

async function chargerStatutsServices(): Promise<void> {
  try {
    const res = await fetch(sheetGvizUrl, { method: 'GET' })
    if (!res.ok) return
    const texte = await res.text()
    const debut = texte.indexOf('{')
    const fin = texte.lastIndexOf('}')
    if (debut < 0 || fin < 0 || fin <= debut) return
    const json = JSON.parse(texte.slice(debut, fin + 1)) as {
      table?: {
        rows?: Array<{ c?: Array<{ v?: string | number | null; f?: string | null } | null> }>
      }
    }
    const ligne = json.table?.rows?.[0]?.c ?? []
    statutLses.value = traduireStatutLses(valeurCellule(ligne[0]))
    statutSafd.value = traduireStatutSafd(valeurCellule(ligne[2]))
  } catch {
    /* conserver dernière valeur */
  }
}

async function chargerEtatFormation(): Promise<void> {
  try {
    await formationSvc.chargerEtat()
    const fe = formationSvc.etat.value
    const progs: Record<string, Record<string, number>> = {}
    for (const [id, prog] of Object.entries(fe.progressions ?? {})) {
      if (typeof prog !== 'object' || prog === null) continue
      const ligne: Record<string, number> = {}
      for (const [comp, val] of Object.entries(prog as Record<string, unknown>)) {
        ligne[comp] = typeof val === 'number' && val > 0 ? 1 : 0
      }
      progs[id] = ligne
    }
    progressionsFormation.value = progs
    const mapComp: Record<string, { emoji: string; roles: string[] }> = {}
    for (const cat of (fe.competences as unknown as Array<{
      sous_competences?: Array<{ id?: string; emoji?: string; roles?: string[] }>
    }>) ?? []) {
      for (const c of cat.sous_competences ?? []) {
        if (!c.id) continue
        mapComp[c.id] = { emoji: c.emoji ?? '✅', roles: Array.isArray(c.roles) ? c.roles : [] }
      }
    }
    competencesFormation.value = mapComp
    roleEmojisFormation.value = fe.role_emojis ?? {}
  } catch {
    progressionsFormation.value = {}
    competencesFormation.value = {}
    roleEmojisFormation.value = {}
  }
}

async function chargerReferentielsDispatch(): Promise<void> {
  try {
    const list = await employeesApi.lister()
    effectifs.value = list
  } catch {
    effectifs.value = []
  }
  await chargerEtatFormation()
}

// ── Radios ──
function basculerSelectAjoutRadio(): void {
  selectAjoutRadioOuvert.value = !selectAjoutRadioOuvert.value
}
function ajouterRadioDepuisSelect(categorie: string): void {
  if (categorie !== 'standard' && categorie !== 'direction') {
    selectAjoutRadioOuvert.value = false
    return
  }
  ajouterRadio(categorie)
  selectAjoutRadioOuvert.value = false
}
function ajouterRadio(categorie: 'standard' | 'direction' = 'standard'): void {
  if (!isDirection.value || !hasLsesPerm.value) return
  const e = { ...etat.value }
  const radios = [...e.radios]
  if (radios.length >= 30) return
  const total = radios.filter((r) =>
    categorie === 'direction'
      ? estCategorieDirecte(r.categorie)
      : !estCategorieDirecte(r.categorie),
  ).length
  const prefix = categorie === 'direction' ? 'DIR' : 'STD'
  const nr: RadioDispatch = {
    id: `radio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    serie: `${prefix}-${String(total + 1).padStart(2, '0')}`,
    effectif_id: null,
    dernier_effectif_nom: null,
    actif: true,
    categorie,
  }
  e.radios = [...radios, nr]
  envoyerEtat(e)
}
function majSerieRadio(radioId: string, serie: string): void {
  if (!isDirection.value || !hasLsesPerm.value) return
  const e = { ...etat.value }
  e.radios = e.radios.map((r) =>
    r.id === radioId ? { ...r, serie: serie.trim().slice(0, 24) } : r,
  )
  envoyerEtat(e)
}
function basculerEtatRadio(radioId: string): void {
  if (!hasLsesPerm.value) return
  const e = { ...etat.value }
  e.radios = e.radios.map((r) => (r.id === radioId ? { ...r, actif: !r.actif } : r))
  envoyerEtat(e)
}
function supprimerRadio(radioId: string): void {
  if (!isDirection.value || !hasLsesPerm.value) return
  const e = { ...etat.value }
  e.radios = e.radios.filter((r) => r.id !== radioId)
  envoyerEtat(e)
}
function majAffectationRadio(radioId: string, effectifId: string): void {
  if (!peutGererAssignationRadios.value) return
  const radio = etat.value.radios.find((r) => r.id === radioId)
  if (!radio) return
  if (estCategorieDirecte(radio.categorie) && !peutGererRadiosDirection.value) return
  const opts = getRadioEmployeeOptions(radio)
  const idsAssignables = new Set(opts.map((e) => e.id))
  const newAff = effectifId && idsAssignables.has(effectifId) ? effectifId : null
  const lastName = newAff ? (obtenirEffectif(newAff)?.name ?? null) : null
  const e = { ...etat.value }
  e.radios = e.radios.map((r) =>
    r.id === radioId
      ? {
          ...r,
          effectif_id: newAff,
          dernier_effectif_nom: lastName ?? r.dernier_effectif_nom ?? null,
          actif: newAff != null,
        }
      : r,
  )
  envoyerEtat(e)
}
function getRadioEmployeeOptions(radio: RadioDispatch): Effectif[] {
  if (estCategorieDirecte(radio.categorie)) {
    const dir = effectifs.value.filter(
      (e) => e.role === 'Directeur' || e.role === 'Directeur Adjoint',
    )
    const triees = trierEffectifs(dir)
    if (!radio.effectif_id) return triees
    if (triees.some((e) => e.id === radio.effectif_id)) return triees
    const cur = obtenirEffectif(radio.effectif_id)
    return cur ? [...triees, cur] : triees
  }
  const enService = effectifsAssignablesRadio.value
  if (!radio.effectif_id) return enService
  if (enService.some((e) => e.id === radio.effectif_id)) return enService
  const cur = obtenirEffectif(radio.effectif_id)
  return cur ? [...enService, cur] : enService
}
function peutAssignerRadio(radio: RadioDispatch): boolean {
  if (!hasLsesPerm.value) return false
  if (estCategorieDirecte(radio.categorie)) return peutGererRadiosDirection.value
  return true
}
function dernierAssigneRadio(radio: RadioDispatch): string {
  if (radio.effectif_id)
    return obtenirEffectif(radio.effectif_id)?.name ?? radio.dernier_effectif_nom ?? 'Assigner'
  return radio.dernier_effectif_nom ?? 'Assigner'
}
function estRadioDirection(radio: RadioDispatch): boolean {
  return estCategorieDirecte(radio.categorie)
}

// ── Drag & Drop ──
let dragData: { type: string; id: string; source: string } | null = null
function onDragStart(event: DragEvent, id: string, source: string = ''): void {
  dragData = { type: 'DispatchEffectif', id, source }
  event.dataTransfer?.setData('text/plain', String(id))
}
function onDragOver(event: DragEvent): void {
  event.preventDefault()
}
function retirerEffectifDeTout(id: string): void {
  const e = { ...etat.value }
  e.patates = e.patates.filter((p) => p.id !== id)
  e.centrale = { ...e.centrale, effectifs: e.centrale.effectifs.filter((eid) => eid !== id) }
  e.interventions = e.interventions.map((inter) => ({
    ...inter,
    effectifs: inter.effectifs.filter((eid) => eid !== id),
  }))
  etat.value = e
}
function onDropPatate(event: DragEvent, categorie: string): void {
  event.preventDefault()
  if (!dragData) return
  const id = dragData.id
  retirerEffectifDeTout(id)
  const e = { ...etat.value }
  e.patates = [...e.patates, { id, categorie }]
  envoyerEtat(e)
  dragData = null
}
function onDropCentrale(event: DragEvent): void {
  event.preventDefault()
  if (!dragData) return
  const id = dragData.id
  retirerEffectifDeTout(id)
  const e = { ...etat.value }
  e.centrale = { ...e.centrale, effectifs: [...e.centrale.effectifs, id] }
  envoyerEtat(e)
  dragData = null
}
function onDropIntervention(event: DragEvent, index: number): void {
  event.preventDefault()
  if (!dragData) return
  const id = dragData.id
  retirerEffectifDeTout(id)
  const e = { ...etat.value }
  const inters = [...e.interventions]
  const inter = { ...inters[index]! }
  inter.effectifs = [...inter.effectifs, id]
  inters[index] = inter
  e.interventions = inters
  envoyerEtat(e)
  dragData = null
}
function onDropHorsService(event: DragEvent): void {
  event.preventDefault()
  if (!dragData) return
  retirerEffectifDeTout(dragData.id)
  envoyerEtat(etat.value)
  dragData = null
}

// ── Interventions ──
function ajouterIntervention(): void {
  const e = { ...etat.value }
  const slot: SlotIntervention = {
    effectifs: [],
    type: 'intervention',
    statut_retour: '',
    lieu: '',
    complement: '',
  }
  e.interventions = [...e.interventions, slot]
  envoyerEtat(e)
}
function supprimerIntervention(index: number): void {
  const e = { ...etat.value }
  e.interventions = e.interventions.filter((_, i) => i !== index)
  envoyerEtat(e)
}
function majInterventionChamp(index: number, champ: string, valeur: string): void {
  const e = { ...etat.value }
  const inters = [...e.interventions]
  inters[index] = { ...inters[index]!, [champ]: valeur }
  e.interventions = inters
  envoyerEtat(e)
}
function resetAffectations(): void {
  if (
    !window.confirm(
      'Réinitialiser le Dispatch ? Tous les effectifs seront remis hors service et les interventions supprimées.',
    )
  )
    return
  const e = { ...etat.value }
  e.patates = []
  e.centrale = { ...e.centrale, effectifs: [] }
  e.interventions = []
  e.effectifs_temporaires = []
  envoyerEtat(e)
}

// ── Centrale ──
function majCentraleChamp(champ: string, valeur: string): void {
  const e = { ...etat.value }
  e.centrale = { ...e.centrale, [champ]: valeur }
  envoyerEtat(e)
}

// ── Hôpital ──
function majStatutHopital(statut: string): void {
  mettreAJour({ statut_hopital: statut })
}
function ouvrirSelectHopital(event: MouseEvent): void {
  const cible = event.target as HTMLElement | null
  if (cible?.closest('select')) return
  const sel = hopitalSelectRef.value
  if (!sel) return
  sel.focus()
  const withPicker = sel as HTMLSelectElement & { showPicker?: () => void }
  withPicker.showPicker?.()
}
function basculerStatutHopital(): void {
  if (statutsHopital.length === 0) return
  const actuel = etat.value.statut_hopital
  const idx = statutsHopital.findIndex((s) => s.id === actuel)
  const next = idx >= 0 ? (idx + 1) % statutsHopital.length : 0
  majStatutHopital(statutsHopital[next]!.id)
}
function labelStatutHopital(): string {
  return statutsHopital.find((s) => s.id === etat.value.statut_hopital)?.label ?? 'Gestion Normale'
}
function couleurStatutHopital(): string {
  return statutsHopital.find((s) => s.id === etat.value.statut_hopital)?.couleur ?? '#4caf50'
}

// ── Bloc-notes / fréquences ──
function majBlocNotes(texte: string): void {
  mettreAJour({ bloc_notes: texte })
}
function majRadioLses(freq: string): void {
  mettreAJour({ radio_lses: freq })
}
function majRadioCommune(freq: string): void {
  mettreAJour({ radio_commune: freq })
}

// ── Crises ──
function ajouterCrise(): void {
  const e = { ...etat.value }
  const entree: EntreeCrise = {
    ajout_canal: false,
    chambre: '',
    nom_prenom_primo: '',
    groupe: '',
    coma: false,
    blessure_lourde: false,
    inconscient: false,
    commentaires: '',
    medecin_rapatrie: '',
    medecin_soignant: '',
    soins: false,
  }
  e.crises = [...e.crises, entree]
  envoyerEtat(e)
}
function supprimerCrise(index: number): void {
  const e = { ...etat.value }
  e.crises = e.crises.filter((_, i) => i !== index)
  envoyerEtat(e)
}
function majCriseChamp(index: number, champ: string, valeur: unknown): void {
  const e = { ...etat.value }
  const c = [...e.crises]
  c[index] = { ...c[index]!, [champ]: valeur }
  e.crises = c
  envoyerEtat(e)
}
function majZipCrise(zip: string): void {
  mettreAJour({ zip_crise: zip })
}

// ── Helpers template ──
function trouverLabelType(id: string): string {
  return typesIntervention.find((t) => t.id === id)?.emoji ?? ''
}
function trouverLabelStatut(id: string): string {
  return statutsRetour.find((s) => s.id === id)?.label ?? ''
}
function couleurTypeIntervention(type: string): string {
  const m: Record<string, string> = {
    intervention: '#2e7d32',
    primo_inter: '#d9480f',
    patrouille: '#1565c0',
    event: '#8e24aa',
    rdv: '#00897b',
    psy: '#6a1b9a',
    otage: '#c62828',
    bureau_admin: '#546e7a',
    formation: '#ef6c00',
    operation: '#5d4037',
    vm: '#00838f',
    hopital: '#7b1fa2',
  }
  return m[type] ?? 'var(--dispatch-card-border)'
}
function fondTypeIntervention(type: string): string {
  const c = couleurTypeIntervention(type)
  return c === 'var(--dispatch-card-border)'
    ? 'var(--dispatch-card-bg)'
    : `color-mix(in srgb, var(--dispatch-card-bg) 90%, ${c} 10%)`
}
function couleurStatutRetour(statut: string): string {
  const m: Record<string, string> = {
    pat: '#2e7d32',
    retour_0: '#1565c0',
    retour_1: '#00897b',
    retour_2: '#ef6c00',
    retour_3: '#c62828',
    bennys: '#6d4c41',
    zombie_car: '#455a64',
    airbaged: '#8d6e63',
  }
  return m[statut] ?? 'var(--input-border)'
}
function fondStatutRetour(statut: string): string {
  const c = couleurStatutRetour(statut)
  return c === 'var(--input-border)'
    ? 'var(--input-bg)'
    : `color-mix(in srgb, var(--input-bg) 86%, ${c} 14%)`
}

// ── Bridge: template-facing API ──
interface EffectifEnrichi extends Effectif {
  validations: string[]
}

function enrichirEffectif(eff: Effectif): EffectifEnrichi {
  return { ...eff, validations: obtenirValidations(eff) }
}

const state = computed(() => ({
  zip_crise: etat.value.zip_crise,
  freq_bces: etat.value.radio_lses,
  freq_commune: etat.value.radio_commune,
  hospital_bces: etat.value.statut_hopital,
  hospital_safd: statutSafd.value,
  hospital_lses: statutLses.value,
  bloc_notes: etat.value.bloc_notes,
  crises: etat.value.crises,
}))

function updateState(field: string, value: string): void {
  switch (field) {
    case 'zip_crise':
      majZipCrise(value)
      break
    case 'freq_bces':
      majRadioLses(value)
      break
    case 'freq_commune':
      majRadioCommune(value)
      break
    case 'hospital_bces':
      majStatutHopital(value)
      break
    case 'bloc_notes':
      majBlocNotes(value)
      break
  }
}

function roleColor(role: string): string {
  return obtenirCouleurRole(role)
}

const centraleEffectifs = computed<EffectifEnrichi[]>(() => {
  return trierIdsEffectifs(etat.value.centrale.effectifs)
    .map((id) => obtenirEffectif(id))
    .filter((e): e is Effectif => !!e)
    .map(enrichirEffectif)
})

function obtenirEffectifsIntervention(index: number): EffectifEnrichi[] {
  const inter = etat.value.interventions[index]
  if (!inter) return []
  return trierIdsEffectifs(inter.effectifs)
    .map((id) => obtenirEffectif(id))
    .filter((e): e is Effectif => !!e)
    .map(enrichirEffectif)
}

const interventions = computed(() => {
  return etat.value.interventions.map((inter, i) => ({
    ...inter,
    id: `inter-${i}`,
    status: inter.statut_retour,
    zip: inter.lieu,
  }))
})

function addIntervention(): void {
  ajouterIntervention()
}
function removeIntervention(inter: { id: string }): void {
  const idx = etat.value.interventions.findIndex((_, i) => `inter-${i}` === inter.id)
  if (idx >= 0) supprimerIntervention(idx)
}
function updateIntervention(inter: { id: string }, field: string, value: string): void {
  const idx = etat.value.interventions.findIndex((_, i) => `inter-${i}` === inter.id)
  if (idx >= 0) {
    const mapped = field === 'status' ? 'statut_retour' : field === 'zip' ? 'lieu' : field
    majInterventionChamp(idx, mapped, value)
  }
}

const effectifsByCategory = computed<Record<string, EffectifEnrichi[]>>(() => {
  const result: Record<string, EffectifEnrichi[]> = {}
  const parCat = effectifsParCategorie.value
  for (const [catId, patates] of Object.entries(parCat)) {
    result[catId] = patates
      .map((p) => obtenirEffectif(p.id))
      .filter((e): e is Effectif => !!e)
      .map(enrichirEffectif)
  }
  result['hors_service'] = effectifsHorsService.value.map(enrichirEffectif)
  return result
})

function onDrop(event: DragEvent, target: string): void {
  if (target === 'centrale') {
    onDropCentrale(event)
    return
  }
  if (target === 'hors_service') {
    onDropHorsService(event)
    return
  }
  if (target.startsWith('intervention-')) {
    const idx = Number(target.split('-')[1])
    if (!Number.isNaN(idx)) {
      onDropIntervention(event, idx)
      return
    }
  }
  onDropPatate(event, target)
}

const radiosDirection = computed(() => radiosDirectes.value)
const radiosStandard = computed(() => radiosStandards.value)

function updateRadio(r: RadioDispatch, field: string, value: string): void {
  if (field === 'serie') majSerieRadio(r.id, value)
  else if (field === 'effectif_id') majAffectationRadio(r.id, value)
}
function toggleRadio(r: RadioDispatch): void {
  basculerEtatRadio(r.id)
}

const sectionCriseOpen = sectionCriseOuverte

function updateCrise(index: number, field: string, value: unknown): void {
  majCriseChamp(index, field, value)
}
function removeCrise(index: number): void {
  supprimerCrise(index)
}
function addCrise(): void {
  ajouterCrise()
}

// ── Lifecycle ──
onMounted(() => {
  connecter()
  void chargerReferentielsDispatch()
  void chargerStatutsServices()
  timerStatutsServices = setInterval(() => void chargerStatutsServices(), 30000)
})
onUnmounted(() => {
  if (timerStatutsServices) {
    clearInterval(timerStatutsServices)
    timerStatutsServices = null
  }
  deconnecter()
  unsubs.forEach((u) => u())
})
</script>

<template>
  <div class="dispatch-page">
    <div class="dispatch-grid">
      <!-- ===== COL 1: CENTRALE + INTERVENTIONS ===== -->
      <section class="column column-centrale">
        <div class="section-header">Centrale &amp; Interventions</div>

        <!-- Centrale -->
        <div
          class="centrale-card"
          :style="{
            borderTopColor: couleurTypeIntervention(etat.centrale.type),
            background: fondTypeIntervention(etat.centrale.type),
          }"
        >
          <div class="card-title card-title--centrale">
            <span class="card-title-icon">📡</span>
            <span>Centrale</span>
          </div>
          <div class="card-selects">
            <select
              class="select-type"
              :style="{
                borderColor: couleurTypeIntervention(etat.centrale.type),
                background: fondTypeIntervention(etat.centrale.type),
              }"
              :value="etat.centrale.type"
              @change="majCentraleChamp('type', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Type...</option>
              <option v-for="t in typesIntervention" :key="t.id" :value="t.id">
                {{ t.emoji }} {{ t.label }}
              </option>
            </select>
            <select
              class="select-statut"
              :style="{
                borderColor: couleurStatutRetour(etat.centrale.statut_retour),
                background: fondStatutRetour(etat.centrale.statut_retour),
              }"
              :value="etat.centrale.statut_retour"
              @change="
                majCentraleChamp('statut_retour', ($event.target as HTMLSelectElement).value)
              "
            >
              <option value="">Statut...</option>
              <option v-for="s in statutsRetour" :key="s.id" :value="s.id">
                {{ s.label }}
              </option>
            </select>
            <div class="location-pair">
              <input
                type="text"
                :value="etat.centrale.lieu"
                @input="majCentraleChamp('lieu', ($event.target as HTMLInputElement).value)"
                placeholder="ZIP"
                class="zip-input"
              />
              <input
                type="text"
                :value="etat.centrale.complement"
                @input="majCentraleChamp('complement', ($event.target as HTMLInputElement).value)"
                placeholder="Complément"
                class="complement-input"
              />
            </div>
          </div>
          <div class="drop-zone" @dragover="onDragOver($event)" @drop="onDropCentrale($event)">
            <div class="effectif-cards-grid">
              <div
                v-for="eff in centraleEffectifs"
                :key="eff.id"
                class="effectif-card"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'centrale')"
                :style="{
                  borderLeftColor: obtenirCouleurRole(eff.role),
                  '--role-color': obtenirCouleurRole(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="obtenirSpecialites(eff).length > 0" class="effectif-card__specs">
                  <span v-for="s in obtenirSpecialites(eff)" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: obtenirCouleurRole(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
            <div v-if="etat.centrale.effectifs.length === 0" class="drop-placeholder">
              Déposer ici
            </div>
          </div>
        </div>

        <!-- Interventions -->
        <div
          v-for="(inter, i) in etat.interventions"
          :key="'inter-' + i"
          class="intervention-card"
          :style="{
            borderTopColor: couleurTypeIntervention(inter.type),
            background: fondTypeIntervention(inter.type),
          }"
        >
          <div class="card-title-row">
            <span class="card-title"
              >{{ trouverLabelType(inter.type) }} Intervention {{ i + 1 }}</span
            >
            <button
              class="btn-suppr"
              @click="supprimerIntervention(i)"
              aria-label="Supprimer intervention"
            >
              ✕
            </button>
          </div>
          <div class="card-selects">
            <select
              class="select-type"
              :style="{
                borderColor: couleurTypeIntervention(inter.type),
                background: fondTypeIntervention(inter.type),
              }"
              :value="inter.type"
              @change="majInterventionChamp(i, 'type', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="t in typesIntervention" :key="t.id" :value="t.id">
                {{ t.emoji }} {{ t.label }}
              </option>
            </select>
            <select
              class="select-statut"
              :style="{
                borderColor: couleurStatutRetour(inter.statut_retour),
                background: fondStatutRetour(inter.statut_retour),
              }"
              :value="inter.statut_retour"
              @change="
                majInterventionChamp(i, 'statut_retour', ($event.target as HTMLSelectElement).value)
              "
            >
              <option value="">Statut...</option>
              <option v-for="s in statutsRetour" :key="s.id" :value="s.id">
                {{ s.label }}
              </option>
            </select>
            <div class="location-pair">
              <input
                type="text"
                :value="inter.lieu"
                @input="majInterventionChamp(i, 'lieu', ($event.target as HTMLInputElement).value)"
                placeholder="ZIP"
                class="zip-input"
              />
              <input
                type="text"
                :value="inter.complement"
                @input="
                  majInterventionChamp(i, 'complement', ($event.target as HTMLInputElement).value)
                "
                placeholder="Complément"
                class="complement-input"
              />
            </div>
          </div>
          <div
            class="drop-zone"
            @dragover="onDragOver($event)"
            @drop="onDropIntervention($event, i)"
          >
            <div class="effectif-cards-grid">
              <div
                v-for="eff in obtenirEffectifsIntervention(i)"
                :key="eff.id"
                class="effectif-card"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'intervention-' + i)"
                :style="{
                  borderLeftColor: obtenirCouleurRole(eff.role),
                  '--role-color': obtenirCouleurRole(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="obtenirSpecialites(eff).length > 0" class="effectif-card__specs">
                  <span v-for="s in obtenirSpecialites(eff)" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: obtenirCouleurRole(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
            <div v-if="inter.effectifs.length === 0" class="drop-placeholder">Déposer ici</div>
          </div>
        </div>

        <button class="btn-ajouter" @click="ajouterIntervention()">+ Intervention</button>
      </section>

      <!-- ===== COL 2: STATUTS ===== -->
      <section class="column column-patate">
        <div class="section-header section-header--status">
          <div class="section-header-tools">
            <div class="section-header-radios" aria-label="Fréquences radio">
              <div class="freq-group freq-group--inline freq-group--bces">
                <label
                  ><i class="fa-solid fa-radio freq-label__icon" aria-hidden="true"></i>BCES:</label
                >
                <input
                  type="text"
                  :value="state.freq_bces"
                  @input="updateState('freq_bces', ($event.target as HTMLInputElement).value)"
                  placeholder="--"
                  class="freq-input freq-input--inline"
                  aria-label="Radio BCES"
                />
              </div>
              <div class="freq-group freq-group--inline freq-group--commune">
                <label
                  ><i class="fa-solid fa-signal freq-label__icon" aria-hidden="true"></i
                  >Commune:</label
                >
                <input
                  type="text"
                  :value="state.freq_commune"
                  @input="updateState('freq_commune', ($event.target as HTMLInputElement).value)"
                  placeholder="--"
                  class="freq-input freq-input--inline"
                  aria-label="Radio commune"
                />
              </div>
            </div>
            <div class="section-header-hospital">
              <div
                class="freq-group freq-group--chip freq-group--chip-clickable service-chip service-chip--bces"
                :style="{ '--hopital-color': couleurStatutHopital() }"
                @click="ouvrirSelectHopital($event)"
              >
                <span class="service-chip__badge">BCES</span>
                <div class="service-chip__value">
                  <select
                    ref="hopitalSelectRef"
                    class="hopital-select"
                    :value="etat.statut_hopital"
                    @change="majStatutHopital(($event.target as HTMLSelectElement).value)"
                    @click.stop
                  >
                    <option v-for="s in statutsHopital" :key="s.id" :value="s.id">
                      {{ s.label }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
            <div class="section-header-service section-header-service--safd">
              <div
                class="freq-group freq-group--chip service-chip service-chip--safd"
                aria-label="Statut service SAFD"
                :style="{ '--hopital-color': couleurBordSafd() }"
              >
                <span class="service-chip__badge">SAFD</span>
                <span class="service-chip__value">{{ statutSafd }}</span>
              </div>
            </div>
            <div class="section-header-service section-header-service--lses">
              <div
                class="freq-group freq-group--chip service-chip service-chip--lses"
                aria-label="Statut service LSES"
                :style="{ '--hopital-color': couleurBordLses() }"
              >
                <span class="service-chip__badge">LSES</span>
                <a
                  class="service-chip__value service-chip__value--link"
                  href="https://lses-inventory.web.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ouvrir LSES Inventory dans un nouvel onglet"
                >
                  <span>{{ statutLses }}</span>
                  <i
                    class="fa-solid fa-arrow-up-right-from-square service-chip__icon"
                    aria-hidden="true"
                  ></i>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class="status-grid">
          <!-- En service -->
          <div
            class="status-zone status-en-service"
            @dragover="onDragOver($event)"
            @drop="onDrop($event, 'en_service')"
          >
            <div class="zone-header" style="border-color: #2e7d32">
              <span class="zone-header__label">🟢 En service</span>
              <span class="zone-header__count">{{ nombreEnServiceTotal }}</span>
            </div>
            <div class="effectif-cards-grid">
              <div
                v-for="eff in effectifsByCategory['en_service']"
                :key="eff.id"
                class="effectif-card"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'patate')"
                :style="{
                  borderLeftColor: roleColor(eff.role),
                  '--role-color': roleColor(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="eff.specialties.length" class="effectif-card__specs">
                  <span v-for="s in eff.specialties" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: roleColor(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Hors service -->
          <div
            class="status-zone status-hors-service"
            @dragover="onDragOver($event)"
            @drop="onDrop($event, 'hors_service')"
          >
            <div class="zone-header" style="border-color: #6b7280">
              <span class="zone-header__label">Hors service</span>
              <span class="zone-header__count">{{
                effectifsByCategory['hors_service']?.length ?? 0
              }}</span>
            </div>
            <div class="effectif-cards-grid">
              <div
                v-for="eff in effectifsByCategory['hors_service']"
                :key="eff.id"
                class="effectif-card"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'hors-service')"
                :style="{
                  borderLeftColor: roleColor(eff.role),
                  '--role-color': roleColor(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="eff.specialties.length" class="effectif-card__specs">
                  <span v-for="s in eff.specialties" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: roleColor(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pause -->
          <div
            class="status-zone status-pause"
            @dragover="onDragOver($event)"
            @drop="onDrop($event, 'pause')"
          >
            <div class="zone-header-small" style="border-color: #f59f00">
              <span class="zone-header__label">⏸️ En Pause</span>
              <span class="zone-header__count">{{
                effectifsByCategory['pause']?.length ?? 0
              }}</span>
            </div>
            <div class="effectif-cards-grid">
              <div
                v-for="eff in effectifsByCategory['pause']"
                :key="eff.id"
                class="effectif-card small"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'patate-pause')"
                :style="{
                  borderLeftColor: roleColor(eff.role),
                  '--role-color': roleColor(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="eff.specialties.length" class="effectif-card__specs">
                  <span v-for="s in eff.specialties" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: roleColor(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Astreinte -->
          <div
            class="status-zone status-astreinte"
            @dragover="onDragOver($event)"
            @drop="onDrop($event, 'astreinte')"
          >
            <div class="zone-header-small" style="border-color: #e65100">
              <span class="zone-header__label">⏰ Astreinte</span>
              <span class="zone-header__count">{{
                effectifsByCategory['astreinte']?.length ?? 0
              }}</span>
            </div>
            <div class="effectif-cards-grid">
              <div
                v-for="eff in effectifsByCategory['astreinte']"
                :key="eff.id"
                class="effectif-card small"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'patate-astreinte')"
                :style="{
                  borderLeftColor: roleColor(eff.role),
                  '--role-color': roleColor(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="eff.specialties.length" class="effectif-card__specs">
                  <span v-for="s in eff.specialties" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: roleColor(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Congés -->
          <div
            class="status-zone status-conges"
            @dragover="onDragOver($event)"
            @drop="onDrop($event, 'conges')"
          >
            <div class="zone-header-small conges-header">
              <span class="zone-header__label">🏖️ Congés</span>
              <span class="zone-header__count">{{
                effectifsByCategory['conges']?.length ?? 0
              }}</span>
            </div>
            <div class="effectif-cards-grid">
              <div
                v-for="eff in effectifsByCategory['conges']"
                :key="eff.id"
                class="effectif-card small"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'patate-conges')"
                :style="{
                  borderLeftColor: roleColor(eff.role),
                  '--role-color': roleColor(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="eff.specialties.length" class="effectif-card__specs">
                  <span v-for="s in eff.specialties" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: roleColor(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- IPT -->
          <div
            class="status-zone status-ipt"
            @dragover="onDragOver($event)"
            @drop="onDrop($event, 'ipt')"
          >
            <div class="zone-header-small" style="border-color: #455a64">
              <span class="zone-header__label">🚶 IPT</span>
              <span class="zone-header__count">{{ effectifsByCategory['ipt']?.length ?? 0 }}</span>
            </div>
            <div class="effectif-cards-grid">
              <div
                v-for="eff in effectifsByCategory['ipt']"
                :key="eff.id"
                class="effectif-card small"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'patate-ipt')"
                :style="{
                  borderLeftColor: roleColor(eff.role),
                  '--role-color': roleColor(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="eff.specialties.length" class="effectif-card__specs">
                  <span v-for="s in eff.specialties" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: roleColor(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Fin de service -->
          <div
            class="status-zone status-fin-service"
            @dragover="onDragOver($event)"
            @drop="onDrop($event, 'fin_service')"
          >
            <div class="zone-header-small" style="border-color: #c62828">
              <span class="zone-header__label">🔴 Fin de service</span>
              <span class="zone-header__count">{{
                effectifsByCategory['fin_service']?.length ?? 0
              }}</span>
            </div>
            <div class="effectif-cards-grid">
              <div
                v-for="eff in effectifsByCategory['fin_service']"
                :key="eff.id"
                class="effectif-card small"
                :class="{ 'effectif-card--helico': eff.helicopterTrainingDate }"
                draggable="true"
                @dragstart="onDragStart($event, eff.id ?? '', 'patate-fin_service')"
                :style="{
                  borderLeftColor: roleColor(eff.role),
                  '--role-color': roleColor(eff.role),
                }"
              >
                <div class="effectif-card__top">
                  <span class="effectif-grip" aria-hidden="true">⠿</span>
                  <span class="effectif-emoji">{{ eff.emoji }}</span>
                  <span class="effectif-nom">{{ nomTuile(eff) }}</span>
                </div>
                <div v-if="eff.phone" class="effectif-card__tel">{{ eff.phone }}</div>
                <div v-if="eff.specialties.length" class="effectif-card__specs">
                  <span v-for="s in eff.specialties" :key="s">{{ s }}</span>
                </div>
                <div v-if="eff.validations.length" class="effectif-card__validations">
                  <span v-for="v in eff.validations" :key="v">{{ v }}</span>
                </div>
                <div class="effectif-card__meta">
                  <span class="effectif-badge" :style="{ color: roleColor(eff.role) }">{{
                    eff.role
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== COL 3: RADIOS & NOTES ===== -->
      <section class="column column-radios">
        <div class="section-header">
          <span>📻 Radios &amp; Notes</span>
          <button
            class="btn-reset-dispatch btn-reset-dispatch--header"
            type="button"
            @click="resetAffectations()"
          >
            RESET
          </button>
        </div>
        <div class="radios-stock-zone">
          <div class="notes-label-row">
            <label class="notes-label">Stock Radios</label>
            <span
              class="stock-count zone-header__count"
              aria-label="Radios standard utilisées sur le total hors direction"
            >
              {{ nombreRadiosUtilisees(radiosStandards) }}/{{ radiosStandards.length }}
            </span>
            <div v-if="peutGererRadiosDepuisDispatch" class="radios-stock-actions">
              <button
                class="radio-add-btn"
                type="button"
                @click="basculerSelectAjoutRadio()"
                aria-label="Ouvrir le sélecteur d'ajout de radio"
              >
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                Ajouter
              </button>
              <select
                v-if="selectAjoutRadioOuvert"
                class="radio-add-select"
                :value="''"
                @change="ajouterRadioDepuisSelect(($event.target as HTMLSelectElement).value)"
                aria-label="Choisir le type de radio à ajouter"
              >
                <option value="" disabled>Choisir...</option>
                <option value="standard">Radio standard</option>
                <option value="direction">Radio direction</option>
              </select>
            </div>
          </div>

          <div class="radios-stock-group">
            <div class="radios-stock-group-title">DIRECTION</div>
            <div v-if="radiosDirectes.length === 0" class="radio-stock-empty">
              Aucune radio direction
            </div>
            <div v-for="radio in radiosDirectes" :key="radio.id" class="radio-stock-row">
              <template v-if="peutGererRadiosDepuisDispatch">
                <input
                  class="radio-stock-serie-input"
                  type="text"
                  :value="radio.serie"
                  @input="majSerieRadio(radio.id, ($event.target as HTMLInputElement).value)"
                  placeholder="N° série"
                  :aria-label="'Numéro de série radio direction ' + radio.id"
                />
              </template>
              <span v-else class="radio-stock-serie-readonly">{{ radio.serie || '---' }}</span>
              <select
                class="radio-stock-owner-select"
                :value="radio.effectif_id ?? ''"
                @change="majAffectationRadio(radio.id, ($event.target as HTMLSelectElement).value)"
                :disabled="!peutAssignerRadio(radio) || getRadioEmployeeOptions(radio).length === 0"
                :aria-label="'Affectation radio direction ' + radio.id"
              >
                <option value="">Non assignée</option>
                <option v-for="eff in getRadioEmployeeOptions(radio)" :key="eff.id" :value="eff.id">
                  {{ eff.name }}
                </option>
              </select>
              <button
                :class="[
                  'radio-stock-toggle',
                  radio.actif ? 'radio-stock-toggle--on' : 'radio-stock-toggle--off',
                ]"
                type="button"
                @click="basculerEtatRadio(radio.id)"
                :disabled="!hasLsesPerm"
                :aria-label="(radio.actif ? 'Désactiver' : 'Activer') + ' la radio direction'"
              >
                {{ radio.actif ? 'ON' : 'OFF' }}
              </button>
              <button
                v-if="peutGererRadiosDepuisDispatch"
                class="radio-stock-delete"
                type="button"
                @click="supprimerRadio(radio.id)"
                aria-label="Supprimer la radio direction"
              >
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
              <span v-if="!radio.effectif_id && radio.dernier_effectif_nom" class="radio-stock-last"
                >Dernier: {{ dernierAssigneRadio(radio) }}</span
              >
            </div>
          </div>

          <div class="radios-stock-group">
            <div class="radios-stock-group-title">STANDARD</div>
            <div v-if="radiosStandards.length === 0" class="radio-stock-empty">
              Aucune radio standard
            </div>
            <div v-for="radio in radiosStandards" :key="radio.id" class="radio-stock-row">
              <template v-if="peutGererRadiosDepuisDispatch">
                <input
                  class="radio-stock-serie-input"
                  type="text"
                  :value="radio.serie"
                  @input="majSerieRadio(radio.id, ($event.target as HTMLInputElement).value)"
                  placeholder="N° série"
                  :aria-label="'Numéro de série radio standard ' + radio.id"
                />
              </template>
              <span v-else class="radio-stock-serie-readonly">{{ radio.serie || '---' }}</span>
              <select
                class="radio-stock-owner-select"
                :value="radio.effectif_id ?? ''"
                @change="majAffectationRadio(radio.id, ($event.target as HTMLSelectElement).value)"
                :disabled="!peutAssignerRadio(radio) || getRadioEmployeeOptions(radio).length === 0"
                :aria-label="'Affectation radio standard ' + radio.id"
              >
                <option value="">Non assignée</option>
                <option v-for="eff in getRadioEmployeeOptions(radio)" :key="eff.id" :value="eff.id">
                  {{ eff.name }}
                </option>
              </select>
              <button
                :class="[
                  'radio-stock-toggle',
                  radio.actif ? 'radio-stock-toggle--on' : 'radio-stock-toggle--off',
                ]"
                type="button"
                @click="basculerEtatRadio(radio.id)"
                :disabled="!hasLsesPerm"
                :aria-label="(radio.actif ? 'Désactiver' : 'Activer') + ' la radio standard'"
              >
                {{ radio.actif ? 'ON' : 'OFF' }}
              </button>
              <button
                v-if="peutGererRadiosDepuisDispatch"
                class="radio-stock-delete"
                type="button"
                @click="supprimerRadio(radio.id)"
                aria-label="Supprimer la radio standard"
              >
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
              <span v-if="!radio.effectif_id && radio.dernier_effectif_nom" class="radio-stock-last"
                >Dernier: {{ dernierAssigneRadio(radio) }}</span
              >
            </div>
          </div>
        </div>
        <div class="notes-zone">
          <label class="notes-label">Bloc-notes</label>
          <textarea
            class="bloc-notes"
            :value="state.bloc_notes"
            @input="updateState('bloc_notes', ($event.target as HTMLTextAreaElement).value)"
            placeholder="Notes..."
          ></textarea>
        </div>
      </section>
    </div>

    <!-- ===== SECTION CRISES ===== -->
    <section class="section-expandable">
      <button class="section-toggle" @click="sectionCriseOpen = !sectionCriseOpen">
        <span class="crise-toggle-main">🚨 Gestion de Crise ({{ state.crises.length }})</span>
        <span class="crise-toggle-zip" @click.stop>
          <input
            id="zip-crise"
            class="zip-crise-input"
            type="text"
            maxlength="8"
            :value="state.zip_crise"
            @input="updateState('zip_crise', ($event.target as HTMLInputElement).value)"
            @click.stop
            @keydown.stop
            placeholder="ZIP"
          />
        </span>
        <span class="toggle-icon">{{ sectionCriseOpen ? '▼' : '▶' }}</span>
      </button>
      <div v-if="sectionCriseOpen" class="crise-content">
        <label class="lses-toggle" for="inclure-lses-crise">
          <input
            id="inclure-lses-crise"
            type="checkbox"
            :checked="inclureLsesCrise"
            @change="inclureLsesCrise = ($event.target as HTMLInputElement).checked"
          />
          Inclure LSES dans les médecins
        </label>
        <div class="table-wrapper">
          <table class="crise-table">
            <thead>
              <tr>
                <th class="col-check col-ajout-canal">Ajout canal</th>
                <th>Chambre</th>
                <th>Nom Prénom (PRIMO)</th>
                <th>Groupe</th>
                <th class="col-check col-coma">Coma</th>
                <th class="col-check col-blessure">Blessure Lourde</th>
                <th class="col-check col-inconscient">Inconscient</th>
                <th>Commentaires</th>
                <th>Médecin Rapatrie</th>
                <th>Médecin Soignant</th>
                <th class="col-check col-soins">Soins</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(c, i) in state.crises"
                :key="i"
                :class="{
                  'crise-row-soins': c.soins,
                  'crise-row-blessure': !c.soins && c.blessure_lourde,
                  'crise-row-canal': !c.soins && !c.blessure_lourde && c.ajout_canal,
                }"
              >
                <td class="col-check col-ajout-canal">
                  <input
                    type="checkbox"
                    :checked="c.ajout_canal"
                    @change="
                      updateCrise(i, 'ajout_canal', ($event.target as HTMLInputElement).checked)
                    "
                  />
                </td>
                <td>
                  <select
                    :value="c.chambre"
                    @change="updateCrise(i, 'chambre', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">-</option>
                    <option v-for="ch in chambresCrise" :key="ch" :value="ch">{{ ch }}</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    :value="c.nom_prenom_primo"
                    @input="
                      updateCrise(i, 'nom_prenom_primo', ($event.target as HTMLInputElement).value)
                    "
                  />
                </td>
                <td>
                  <select
                    :value="c.groupe"
                    @change="updateCrise(i, 'groupe', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">-</option>
                    <option v-for="a in appartenances" :key="a.id" :value="a.id">
                      {{ a.label }}
                    </option>
                  </select>
                </td>
                <td class="col-check col-coma">
                  <input
                    type="checkbox"
                    :checked="c.coma"
                    @change="updateCrise(i, 'coma', ($event.target as HTMLInputElement).checked)"
                  />
                </td>
                <td class="col-check col-blessure">
                  <input
                    type="checkbox"
                    :checked="c.blessure_lourde"
                    @change="
                      updateCrise(i, 'blessure_lourde', ($event.target as HTMLInputElement).checked)
                    "
                  />
                </td>
                <td class="col-check col-inconscient">
                  <input
                    type="checkbox"
                    :checked="c.inconscient"
                    @change="
                      updateCrise(i, 'inconscient', ($event.target as HTMLInputElement).checked)
                    "
                  />
                </td>
                <td>
                  <input
                    type="text"
                    :value="c.commentaires"
                    @input="
                      updateCrise(i, 'commentaires', ($event.target as HTMLInputElement).value)
                    "
                  />
                </td>
                <td>
                  <select
                    :value="c.medecin_rapatrie"
                    @change="
                      updateCrise(i, 'medecin_rapatrie', ($event.target as HTMLSelectElement).value)
                    "
                  >
                    <option value="">-</option>
                    <option v-for="medecin in medecinsCrise" :key="medecin" :value="medecin">
                      {{ medecin }}
                    </option>
                  </select>
                </td>
                <td>
                  <select
                    :value="c.medecin_soignant"
                    @change="
                      updateCrise(i, 'medecin_soignant', ($event.target as HTMLSelectElement).value)
                    "
                  >
                    <option value="">-</option>
                    <option v-for="medecin in medecinsCrise" :key="medecin" :value="medecin">
                      {{ medecin }}
                    </option>
                  </select>
                </td>
                <td class="col-check col-soins">
                  <input
                    type="checkbox"
                    :checked="c.soins"
                    @change="updateCrise(i, 'soins', ($event.target as HTMLInputElement).checked)"
                  />
                </td>
                <td style="text-align: center">
                  <button class="btn-suppr" @click="removeCrise(i)" aria-label="Supprimer crise">
                    ✕
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="btn-ajouter" @click="addCrise">+ Patient</button>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
/* =========================================================
   DISPATCH PAGE — VUE 3 PORT OF ANGULAR V3 MAX
   ========================================================= */

/* ---- HOST ---- */
.dispatch-page {
  --crise-toggle-height: 35px;

  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg);
}

/* =============================================================
   MAIN GRID
   ============================================================= */
.dispatch-grid {
  display: grid;
  grid-template-columns: 320px 1fr 280px;
  gap: 0;
  flex: 0 0 auto;
  height: calc(100% - var(--crise-toggle-height));
  min-height: 0;
  box-sizing: border-box;
}

.column {
  border-right: 1px solid var(--dispatch-zone-border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--dispatch-zone-bg);
  padding: 0 0.45rem 0.45rem;

  &:last-child {
    border-right: none;
  }
  &:first-child {
    background: color-mix(in srgb, var(--dispatch-zone-bg) 90%, var(--accent) 10%);
  }
}

/* =============================================================
   COLUMN HEADERS
   ============================================================= */
.section-header {
  font-size: 0.71rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dispatch-col-header-text);
  background: var(--dispatch-col-header);
  min-height: 42px;
  padding: 0.38rem 0.85rem;
  border-bottom: 2px solid
    color-mix(in srgb, var(--dispatch-col-header) 74%, var(--theme-shadow-medium) 26%);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 6px var(--theme-shadow-medium);
  margin: 0 -0.45rem;
}

/* =============================================================
   INTERVENTION & CENTRALE CARDS
   ============================================================= */
.centrale-card,
.intervention-card {
  background: var(--dispatch-card-bg);
  border: 1px solid var(--dispatch-card-border);
  border-radius: 8px;
  padding: 0.55rem;
  margin-bottom: 0.55rem;
  box-shadow:
    0 2px 8px var(--theme-shadow-soft),
    0 0 0 1px var(--dispatch-card-border);
  transition: box-shadow 0.15s;
  animation: slideIn 0.2s ease;

  &:hover {
    box-shadow:
      0 4px 14px var(--theme-shadow-medium),
      0 0 0 1px var(--dispatch-card-border);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.centrale-card {
  border-top: 3px solid var(--accent);
}

.intervention-card {
  border-top: 3px solid var(--dispatch-card-border);
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}

.card-title {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.card-title--centrale {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}

.card-title-icon {
  font-size: 1rem;
}

.card-selects {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  margin-bottom: 0.4rem;

  select,
  input {
    font-size: 0.68rem;
    padding: 0.2rem 0.28rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    color: var(--text-primary);
    transition: border-color 0.15s;

    &:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }
  }
}

.location-pair {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
}

.btn-suppr {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0.12rem 0.35rem;
  border-radius: 4px;
  line-height: 1;
  transition: all 0.15s;

  &:hover {
    background: var(--danger-subtle);
    color: var(--danger);
  }
}

.btn-ajouter {
  width: 100%;
  padding: 0.45rem;
  background: transparent;
  border: 1.5px dashed var(--dispatch-card-border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.73rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s;
  letter-spacing: 0.01em;

  &:hover {
    background: var(--accent-subtle);
    color: var(--accent);
    border-color: var(--accent);
    border-style: solid;
  }
}

/* =============================================================
   DROP ZONES
   ============================================================= */
.drop-zone {
  min-height: 40px;
  border: 1.5px dashed var(--dispatch-card-border);
  border-radius: 6px;
  padding: 0.25rem;
  transition: all 0.18s;
  background: color-mix(in srgb, var(--dispatch-zone-bg) 88%, var(--theme-shadow-soft) 12%);

  &:hover {
    background: color-mix(in srgb, var(--dispatch-zone-bg) 85%, var(--accent-subtle) 15%);
    border-color: color-mix(in srgb, var(--dispatch-card-border) 70%, var(--accent) 30%);
  }

  &.drag-over {
    background: color-mix(in srgb, var(--dispatch-zone-bg) 72%, var(--accent-subtle) 28%);
    border-color: var(--accent);
    border-style: dashed;
  }
}

.drop-placeholder {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.64rem;
  padding: 0.6rem;
  font-style: italic;
  opacity: 0.6;
}

/* =============================================================
   STATUS GRID (COL 2)
   ============================================================= */
.status-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  grid-template-rows: minmax(280px, 1.55fr) minmax(96px, 0.75fr) minmax(96px, 0.75fr);
  gap: 0.5rem;
  margin-top: 0.55rem;
}

.status-zone {
  background: var(--dispatch-card-bg);
  border: 1.5px dashed var(--dispatch-zone-border);
  border-radius: 8px;
  padding: 0.4rem;
  overflow-y: auto;
  transition: all 0.18s;
}

.status-en-service {
  grid-column: 1 / span 3;
  grid-row: 1;
  background: rgba(46, 125, 50, 0.06);
  border-color: rgba(46, 125, 50, 0.35);
}

.status-hors-service {
  grid-column: 4;
  grid-row: 1 / span 3;
  background: color-mix(in srgb, var(--dispatch-zone-bg) 90%, var(--theme-shadow-soft) 10%);
}

.status-pause {
  grid-column: 1;
  grid-row: 2;
}

.status-astreinte {
  grid-column: 2;
  grid-row: 2;
}

.status-conges {
  grid-column: 3;
  grid-row: 2 / span 2;
  background: color-mix(in srgb, var(--warning-subtle) 45%, transparent 55%);
}

.status-ipt {
  grid-column: 1;
  grid-row: 3;
}

.status-fin-service {
  grid-column: 2;
  grid-row: 3;
}

.conges-header {
  border-left-color: var(--warning);
}

/* =============================================================
   ZONE HEADERS
   ============================================================= */
.zone-header {
  font-size: 0.76rem;
  font-weight: 800;
  padding: 0.3rem 0.6rem;
  margin-bottom: 0.4rem;
  border-left: 4px solid currentColor;
  border-radius: 0 5px 5px 0;
  background: var(--theme-soft-band);
  color: var(--text-primary);
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.zone-header-small {
  font-size: 0.67rem;
  font-weight: 800;
  padding: 0.22rem 0.4rem;
  margin-bottom: 0.25rem;
  border-left: 3px solid currentColor;
  border-radius: 0 4px 4px 0;
  background: var(--theme-soft-band-alt);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
}

.zone-header__label {
  min-width: 0;
}

.zone-header__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.65rem;
  height: 1.45rem;
  padding: 0 0.52rem;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 72%, var(--accent) 28%),
    color-mix(in srgb, var(--surface) 60%, var(--accent) 40%)
  );
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--input-border) 55%);
  color: #ffffff;
  font-size: 0.64rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.zone-header-small .zone-header__count {
  min-width: 1.42rem;
  height: 1.26rem;
  font-size: 0.58rem;
}

/* =============================================================
   EFFECTIF CARDS
   ============================================================= */
.effectif-cards-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.44rem;
  align-content: flex-start;
}

.effectif-card {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 4px 6px;
  background: color-mix(in srgb, var(--role-color, #64748b) 15%, var(--surface-elevated) 85%);
  border: 1.5px solid color-mix(in srgb, var(--dispatch-card-border) 72%, transparent 28%);
  border-left: 3px solid #666;
  border-radius: 8px;
  min-width: 90px;
  width: max-content;
  max-width: 156px;
  cursor: grab;
  user-select: none;
  position: relative;
  transition:
    transform 0.1s,
    box-shadow 0.15s,
    opacity 0.15s;
  box-shadow: 0 1px 4px var(--theme-shadow-strong);

  &:active {
    cursor: grabbing;
    opacity: 0.7;
    transform: scale(0.97);
  }

  &:hover {
    background: color-mix(in srgb, var(--role-color, #64748b) 18%, var(--surface-hover) 82%);
    box-shadow: 0 4px 12px var(--theme-shadow-medium);
    transform: translateY(-1px);
  }

  &.small {
    min-width: 82px;
    max-width: 140px;
    width: max-content;
    padding: 3px 5px;
    border-left-width: 3px;
    border-radius: 6px;
    gap: 0.08rem;
  }

  &.effectif-card--helico {
    padding-right: 1.35rem;
  }

  &.small.effectif-card--helico {
    padding-right: 1.15rem;
  }

  &.effectif-card--helico::after {
    content: '🚁';
    position: absolute;
    top: 3px;
    right: 4px;
    font-size: 0.95rem;
    line-height: 1;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45));
    pointer-events: none;
  }

  &.small.effectif-card--helico::after {
    top: 2px;
    right: 3px;
    font-size: 0.82rem;
  }
}

.effectif-card__top {
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
}

.effectif-card--helico .effectif-card__top {
  padding-right: 0.2rem;
}

.effectif-card.small.effectif-card--helico .effectif-card__top {
  padding-right: 0.15rem;
}

.effectif-grip {
  font-size: 11px;
  color: #bdbdbd;
  line-height: 1;
  margin-top: 2px;
}

.effectif-emoji {
  font-size: 0.96rem;
  line-height: 1;
  flex-shrink: 0;
}

.effectif-nom {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.75rem;

  .small & {
    font-size: 0.7rem;
  }
}

.effectif-card__tel {
  font-size: 0.62rem;
  color: #cbd5e1;
  line-height: 1;
}

.effectif-card__specs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  font-size: 0.6rem;
  line-height: 1.1;
  margin-top: 1px;
}

.effectif-card__validations {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  font-size: 11px;
  margin-top: 1px;
  line-height: 1;

  span {
    cursor: default;
  }
}

.effectif-card__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 1px;
}

.effectif-badge {
  font-size: 0.62rem;
  padding: 0;
  border-radius: 0;
  color: var(--text-secondary);
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.01em;
  border: none;
  box-shadow: none;
  background: transparent !important;
}

// Hide validations/meta in centrale & intervention cards, reveal on hover
.intervention-card .effectif-card__validations,
.centrale-card .effectif-card__validations {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  overflow: hidden;
  transition:
    opacity 0.14s ease,
    max-height 0.14s ease,
    margin-top 0.14s ease;
}

.intervention-card .effectif-card__meta,
.centrale-card .effectif-card__meta {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  overflow: hidden;
  transition:
    opacity 0.14s ease,
    max-height 0.14s ease,
    margin-top 0.14s ease;
}

.intervention-card .effectif-card:hover .effectif-card__validations,
.centrale-card .effectif-card:hover .effectif-card__validations {
  opacity: 1;
  max-height: 40px;
  margin-top: 1px;
}

.intervention-card .effectif-card:hover .effectif-card__meta,
.centrale-card .effectif-card:hover .effectif-card__meta {
  opacity: 1;
  max-height: 32px;
  margin-top: 1px;
}

/* =============================================================
   SECTION-HEADER STATUS BAR (COL 2)
   ============================================================= */
.section-header--status {
  text-transform: none;
  letter-spacing: normal;
  min-height: 42px;
  padding: 0.38rem 0.8rem;
  background: linear-gradient(180deg, #0f3450, #0b2a42);
  border-bottom: 1px solid #1c4f71;
  box-shadow: 0 2px 10px rgba(4, 18, 30, 0.35);
  --status-block-height: 24px;
}

.section-header-tools {
  display: grid;
  grid-template-columns: auto auto auto auto;
  align-items: center;
  justify-content: space-between;
  column-gap: 0.8rem;
  width: 100%;
}

.section-header-radios,
.section-header-hospital,
.section-header-service {
  display: inline-flex;
  align-items: center;
}

.section-header-radios {
  gap: 0.95rem;
  justify-content: center;
}

.section-header-hospital {
  justify-content: center;
}

.section-header-service {
  justify-content: center;
}

.freq-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;

  label {
    font-size: 0.58rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--dispatch-col-header-text);
    opacity: 0.6;
  }
}

.freq-group--inline {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  min-height: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    margin: 0;
    color: #a8c8dd;
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.035em;
    opacity: 1;
  }
}

.freq-label__icon {
  font-size: 0.66rem;
  line-height: 1;
}

.freq-input {
  width: 76px;
  font-size: 0.78rem;
  padding: 0.22rem 0.45rem;
  background: var(--theme-panel-input-bg);
  border: 1px solid var(--theme-panel-input-border);
  border-radius: 5px;
  color: var(--dispatch-col-header-text);
  font-weight: 700;
  transition: all 0.15s;

  &::placeholder {
    opacity: 0.35;
  }
  &:focus {
    outline: none;
    background: color-mix(in srgb, var(--theme-panel-input-bg) 84%, white 16%);
    border-color: var(--theme-panel-input-focus);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-panel-input-focus) 65%, transparent 35%);
  }
}

.freq-input--inline {
  width: 46px;
  min-height: 0;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1;

  &:focus {
    outline: none;
    border: 0;
    box-shadow: none;
  }
}

.freq-group--bces {
  .freq-input--inline {
    color: #6dbc8e;
  }
  .freq-label__icon {
    color: #6dbc8e;
  }
  label {
    color: #6dbc8e;
  }
}

.freq-group--commune {
  label {
    color: #ffd666;
  }
  .freq-label__icon {
    color: #f59e0b;
  }
  .freq-input--inline {
    color: #f59e0b;
  }
}

// Service chips (BCES / SAFD / LSES pills)
.freq-group--chip {
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-height: var(--status-block-height);
  border: 1px solid color-mix(in srgb, var(--hopital-color, #4caf50) 42%, var(--input-border) 58%);
  border-radius: 999px;
  padding: 0;
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 88%, var(--hopital-color, #4caf50) 12%),
    color-mix(in srgb, var(--surface) 78%, var(--hopital-color, #4caf50) 22%)
  );
  backdrop-filter: blur(6px);

  label {
    display: inline-flex;
    align-items: center;
    min-height: var(--status-block-height);
    padding: 0.2rem 0.55rem;
    color: var(--text-secondary);
    background: color-mix(in srgb, var(--surface) 82%, transparent 18%);
    border: 0;
    border-right: 1px solid color-mix(in srgb, var(--input-border) 58%, transparent 42%);
    border-radius: 999px 0 0 999px;
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: none;
    letter-spacing: 0.025em;
    opacity: 1;
  }
}

.service-chip {
  min-height: var(--status-block-height);
  align-items: stretch;
  display: inline-grid;
  grid-template-columns: 68px minmax(116px, 1fr);
  min-width: 184px;
  border: 1px solid color-mix(in srgb, var(--hopital-color, #4caf50) 38%, var(--input-border) 62%);
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 90%, var(--hopital-color, #4caf50) 10%),
    color-mix(in srgb, var(--surface) 80%, var(--hopital-color, #4caf50) 20%)
  );
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
  overflow: hidden;
}

.service-chip__badge {
  display: grid;
  place-items: center;
  align-self: stretch;
  width: 100%;
  height: 100%;
  min-height: var(--status-block-height);
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border-radius: 999px 0 0 999px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--input-border) 58%, transparent 42%);
  color: #ffffff !important;
  font-size: 0.57rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: normal;
  text-align: center;
  white-space: nowrap;
}

.service-chip__value {
  display: grid;
  place-items: center;
  align-self: stretch;
  width: 100%;
  height: 100%;
  min-height: var(--status-block-height);
  box-sizing: border-box;
  padding: 0;
  border-radius: 0 999px 999px 0;
  border: 0;
  border-left: 1px solid color-mix(in srgb, var(--input-border) 58%, transparent 42%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface) 84%, var(--hopital-color, #4caf50) 16%),
    color-mix(in srgb, var(--surface) 76%, var(--hopital-color, #4caf50) 24%)
  );
  color: #ffffff;
  font-size: 0.63rem;
  font-weight: 900;
  line-height: normal;
  letter-spacing: 0.025em;
  text-transform: uppercase;
  text-align: center;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.service-chip--safd .service-chip__badge {
  background: linear-gradient(180deg, #ad2328, #8e1c20);
}

.service-chip--lses .service-chip__badge {
  background: linear-gradient(180deg, #0a58a2, #084784);
}

.service-chip--bces .service-chip__badge {
  background: linear-gradient(180deg, #46966d, #377859);
}

.service-chip--bces .service-chip__value {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.28rem;
}

.hopital-select {
  font-size: 0.72rem;
  padding: 0.24rem 0.5rem;
  border-radius: 5px;
  color: #fff;
  font-weight: 800;
  border: none;
  cursor: pointer;
  text-shadow: 0 1px 2px var(--theme-text-shadow);
  min-height: calc(var(--status-block-height) - 2px);
  width: 100%;
  min-width: 108px;
  border-radius: 0 999px 999px 0;
  background: transparent;
  font-size: 0.63rem;
  font-weight: 900;
  letter-spacing: 0.025em;
  text-transform: uppercase;
  line-height: normal;

  option {
    background: var(--surface-elevated);
    color: var(--text-primary);
    font-weight: 600;
  }

  &:focus-visible {
    outline: none;
    box-shadow: none;
  }
}

/* =============================================================
   RADIOS COL 3
   ============================================================= */
.radios-stock-zone {
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
  margin-top: 0.35rem;
  margin-bottom: 0.5rem;
}

.notes-label-row {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.radios-stock-group {
  display: flex;
  flex-direction: column;
  gap: 0.26rem;
}

.radios-stock-group-title {
  font-size: 0.56rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
}

.radio-stock-row {
  display: grid;
  grid-template-columns: 82px minmax(90px, 1fr) auto auto auto;
  align-items: center;
  gap: 0.28rem;
  min-height: 24px;
  padding: 0.15rem 0.3rem;
  border-radius: 5px;
  border: 1px solid var(--dispatch-zone-border);
  background: var(--theme-soft-band);
}

.radio-stock-serie-input,
.radio-stock-owner-select {
  min-height: 22px;
  border-radius: 4px;
  border: 1px solid var(--dispatch-zone-border);
  background: color-mix(in srgb, var(--input-bg) 82%, transparent 18%);
  color: var(--text-primary);
  font-size: 0.58rem;
  font-weight: 700;
  padding: 0.08rem 0.24rem;
  width: 100%;

  &:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--accent) 62%, var(--dispatch-zone-border) 38%);
  }
}

.radio-stock-serie-input {
  color: #c6dbff;
}

.radio-stock-toggle {
  min-width: 36px;
  text-align: center;
  padding: 0.08rem 0.24rem;
  border-radius: 4px;
  font-size: 0.52rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border: 1px solid transparent;
  cursor: pointer;
}

.radio-stock-toggle--on {
  color: #6dffb0;
  background: rgba(27, 78, 49, 0.65);
  border-color: rgba(89, 206, 141, 0.45);
}

.radio-stock-toggle--off {
  color: #ff95a4;
  background: rgba(78, 27, 39, 0.65);
  border-color: rgba(232, 121, 141, 0.45);
}

.radio-stock-toggle:disabled {
  opacity: 0.78;
  cursor: not-allowed;
}

.radio-stock-last {
  grid-column: 1 / -1;
  font-size: 0.52rem;
  color: var(--text-muted);
  opacity: 0.92;
  padding-left: 0.1rem;
}

.radio-stock-empty {
  font-size: 0.56rem;
  color: var(--text-muted);
  padding: 0.2rem 0;
}

/* =============================================================
   NOTES ZONE
   ============================================================= */
.notes-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.notes-label {
  font-size: 0.63rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.bloc-notes {
  width: 100%;
  flex: 1;
  min-height: 170px;
  resize: vertical;
  font-size: 0.76rem;
  padding: 0.5rem 0.6rem;
  background: color-mix(in srgb, var(--input-bg) 72%, transparent 28%);
  border: 1px solid color-mix(in srgb, var(--input-border) 65%, transparent 35%);
  border-radius: 7px;
  color: var(--text-primary);
  font-family: inherit;
  line-height: 1.55;

  &:focus {
    box-shadow: none;
    outline: none;
  }
}

/* =============================================================
   EXPANDABLE CRISIS SECTION
   ============================================================= */
.section-expandable {
  position: relative;
  border-top: 2px solid var(--dispatch-zone-border);
  margin-bottom: 0;
  background: color-mix(in srgb, var(--dispatch-zone-bg) 90%, black 10%);
  box-shadow: none;
}

.section-toggle {
  width: 100%;
  min-height: var(--crise-toggle-height);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.55rem;
  padding: 0.6rem 1.1rem;
  background: var(--dispatch-col-header);
  border: none;
  color: var(--dispatch-col-header-text);
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
  transition: filter 0.15s;
  letter-spacing: -0.01em;
  text-shadow: 0 1px 2px var(--theme-text-shadow);
  box-shadow: 0 2px 6px var(--theme-shadow-medium);

  &:hover {
    filter: brightness(1.15);
  }
}

.crise-toggle-main {
  display: inline-flex;
  align-items: center;
}

.crise-toggle-zip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.zip-crise-input {
  width: 78px;
  height: 26px;
  padding: 0.2rem 0.4rem;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--theme-panel-input-border) 70%, transparent 30%);
  background: color-mix(in srgb, var(--theme-panel-input-bg) 76%, transparent 24%);
  color: var(--dispatch-col-header-text);
  font-size: 0.7rem;
  font-weight: 700;

  &::placeholder {
    opacity: 0.5;
  }
  &:focus {
    outline: none;
    box-shadow: none;
  }
}

.toggle-icon {
  margin-left: auto;
  font-size: 0.68rem;
  opacity: 0.7;
  transition: transform 0.2s;
}

/* =============================================================
   CRISIS TABLE
   ============================================================= */
.crise-content {
  padding: 0.65rem 1rem 0.45rem;
  background: var(--dispatch-zone-bg);
  border-top: 1px solid var(--dispatch-zone-border);
  max-height: none;
  overflow: visible;

  .btn-ajouter {
    margin-top: 0.45rem;
  }
}

.table-wrapper {
  overflow-x: auto;
}

.crise-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.73rem;

  th,
  td {
    padding: 0.2rem 0.28rem;
    border: 1px solid var(--dispatch-card-border);
    text-align: left;
  }

  th {
    background: var(--dispatch-col-header);
    font-weight: 800;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--dispatch-col-header-text);
    text-align: center;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 2;
    box-shadow: 0 2px 4px var(--theme-shadow-medium);
  }

  tbody tr {
    background: var(--dispatch-card-bg);
    transition: background 0.1s;

    &:nth-child(even) {
      background: var(--dispatch-zone-bg);
    }
    &:hover {
      background: var(--surface-hover);
    }
  }

  tbody tr.crise-row-canal {
    background: rgba(34, 197, 94, 0.2);
  }
  tbody tr.crise-row-blessure {
    background: rgba(239, 68, 68, 0.2);
  }
  tbody tr.crise-row-soins {
    background: rgba(250, 204, 21, 0.28);
  }

  td {
    input,
    select {
      display: block;
      width: 100%;
      border: 0;
      background: transparent;
      font-size: 0.69rem;
      line-height: 1.15;
      min-height: 24px;
      padding: 0.08rem 0.2rem;
      margin: 0;
      color: var(--text-primary);
      border-radius: 4px;
      box-sizing: border-box;

      &:focus,
      &:focus-visible {
        outline: none;
        box-shadow: none;
      }
    }

    select option {
      background: var(--surface-elevated);
      color: var(--text-primary);
    }

    input[type='checkbox'] {
      display: inline-block;
      width: auto;
      min-height: auto;
      padding: 0;
      margin: 0 auto;
      border: none;
      background: transparent;
      cursor: pointer;
      accent-color: var(--accent);
    }
  }

  th.col-check,
  td.col-check {
    text-align: center;
    white-space: nowrap;
  }

  th.col-ajout-canal,
  td.col-ajout-canal {
    width: 100px;
    min-width: 100px;
  }
  th.col-coma,
  td.col-coma {
    width: 72px;
    min-width: 72px;
  }
  th.col-blessure,
  td.col-blessure {
    width: 134px;
    min-width: 134px;
  }
  th.col-inconscient,
  td.col-inconscient {
    width: 116px;
    min-width: 116px;
  }
  th.col-soins,
  td.col-soins {
    width: 78px;
    min-width: 78px;
  }
}

/* =============================================================
   RESPONSIVE
   ============================================================= */
@media (max-width: 1250px) {
  .dispatch-grid {
    grid-template-columns: 300px 1fr;
    grid-template-areas:
      'centrale radios'
      'statuts statuts';
    flex: 1 1 auto;
  }

  .column-centrale {
    grid-area: centrale;
  }
  .column-radios {
    grid-area: radios;
  }
  .column-patate {
    grid-area: statuts;
  }

  .status-grid {
    grid-template-columns: repeat(3, minmax(140px, 1fr));
    grid-template-rows: minmax(250px, 1.45fr) minmax(96px, 0.75fr) minmax(96px, 0.75fr) minmax(
        96px,
        0.75fr
      );
  }

  .status-en-service {
    grid-column: 1 / span 2;
    grid-row: 1;
  }
  .status-hors-service {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
  .status-conges {
    grid-column: 3;
    grid-row: 3 / span 2;
  }
  .status-pause {
    grid-column: 1;
    grid-row: 2;
  }
  .status-astreinte {
    grid-column: 2;
    grid-row: 2;
  }
  .status-ipt {
    grid-column: 1;
    grid-row: 3;
  }
  .status-fin-service {
    grid-column: 2;
    grid-row: 3;
  }
}

/* =============================================================
   ADDITIONAL ELEMENTS
   ============================================================= */
.btn-reset-dispatch {
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.42rem;
  background: color-mix(in srgb, var(--danger-subtle) 70%, transparent 30%);
  border: 1px solid color-mix(in srgb, var(--danger) 55%, transparent 45%);
  border-radius: 6px;
  color: var(--danger);
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.16s;
  letter-spacing: 0.02em;

  &:hover {
    background: color-mix(in srgb, var(--danger-subtle) 82%, transparent 18%);
    border-color: color-mix(in srgb, var(--danger) 72%, transparent 28%);
  }
}

.btn-reset-dispatch--header {
  width: auto;
  margin-top: 0;
  padding: 0.2rem 0.55rem;
  font-size: 0.64rem;
  line-height: 1.2;
}

.radio-stock-delete {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid rgba(232, 121, 141, 0.4);
  background: rgba(78, 27, 39, 0.45);
  color: #ff95a4;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(78, 27, 39, 0.62);
  }
}

.radio-stock-serie-readonly {
  width: 100%;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--dispatch-zone-border);
  background: color-mix(in srgb, var(--input-bg) 82%, transparent 18%);
  color: #94a3b8;
  font-size: 0.58rem;
  font-weight: 700;
  padding: 0.08rem 0.24rem;
}

.radios-stock-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.24rem;
}

.radio-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 20px;
  padding: 0.1rem 0.36rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--dispatch-zone-border) 55%);
  background: color-mix(in srgb, var(--theme-soft-band) 82%, var(--accent) 18%);
  color: var(--text-secondary);
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: color-mix(in srgb, var(--accent) 65%, var(--dispatch-zone-border) 35%);
    color: var(--text-primary);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 72%, #ffffff 28%);
    outline-offset: 1px;
  }
}

.radio-add-select {
  min-height: 20px;
  padding: 0.1rem 0.34rem;
  border-radius: 999px;
  border: 1px solid var(--dispatch-zone-border);
  background: color-mix(in srgb, var(--input-bg) 84%, transparent 16%);
  color: var(--text-primary);
  font-size: 0.56rem;
  font-weight: 700;
}

.lses-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.15rem 0 0.6rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;

  input {
    width: 0.95rem;
    height: 0.95rem;
    accent-color: var(--accent);
    cursor: pointer;
  }
}

.service-chip__value--link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  padding: 0 0.62rem;
  text-decoration: none;
  color: inherit;
  cursor: pointer;

  &:hover {
    filter: brightness(1.08);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--hopital-color, #4caf50) 64%, #ffffff 36%);
    outline-offset: 2px;
  }
}

.service-chip__icon {
  font-size: 0.58rem;
  line-height: 1;
  opacity: 0.92;
}

.freq-group--chip-clickable {
  cursor: pointer;
  user-select: none;
  transition:
    filter 0.14s ease,
    box-shadow 0.14s ease;

  &:hover {
    filter: none;
    border-color: color-mix(in srgb, var(--hopital-color, #4caf50) 54%, var(--input-border) 46%);
    box-shadow:
      0 6px 14px rgba(0, 0, 0, 0.2),
      0 0 0 1px color-mix(in srgb, var(--hopital-color, #4caf50) 18%, transparent 82%);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--hopital-color, #4caf50) 64%, #ffffff 36%);
    outline-offset: 2px;
  }
}

.stock-count {
  font-size: 0.56rem;
}

.stock-count.zone-header__count {
  min-width: 2.6rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-elevated) 72%, var(--accent) 28%),
    color-mix(in srgb, var(--surface) 60%, var(--accent) 40%)
  );
  border-color: color-mix(in srgb, var(--accent) 45%, var(--input-border) 55%);
  color: #ffffff;
  letter-spacing: 0.03em;
}

/* =============================================================
   LIGHT THEME — EFFECTIF CARDS
   ============================================================= */
:deep([data-theme='light']) .effectif-card {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

:deep([data-theme='light']) .effectif-card__tel {
  color: #64748b;
}

:deep([data-theme='light']) .effectif-nom {
  color: #1e293b;
}

:deep([data-theme='light']) .effectif-card__specs,
:deep([data-theme='light']) .effectif-card__validations {
  color: #475569;
}

/* =============================================================
   COLUMN CENTRALE — LOCATION INPUTS
   ============================================================= */
.column-centrale .card-selects .location-pair .complement-input,
.column-centrale .intervention-card .location-pair .complement-input {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent;
  box-shadow: none;
}

.column-centrale .card-selects .location-pair .zip-input,
.column-centrale .intervention-card .location-pair .zip-input {
  border-right: 1px solid color-mix(in srgb, var(--input-border) 30%, transparent 70%) !important;
}

/* =============================================================
   RESPONSIVE — STATUS HEADER (narrow screens)
   ============================================================= */
@media (max-width: 1180px) {
  .section-header--status .section-header-tools {
    grid-template-columns: 1fr;
    gap: 0.45rem;
    justify-content: initial;
  }

  .section-header--status .section-header-hospital,
  .section-header--status .section-header-service,
  .section-header--status .section-header-radios {
    justify-content: flex-start;
  }
}
</style>
