<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCollection } from '@/composables/useFirestore'
import { useDispatch } from '@/composables/useDispatch'
import { useLogger } from '@/composables/useLogger'
import { useNotifManager } from '@/composables/useNotifManager'
import { NAV_ITEMS } from '@/config/navigation.config'
import { PERMISSIONS } from '@/config/permissions.config'
import { TRAININGS_CONFIG } from '@/config/trainings.config'
import type { Effectif } from '@/models/effectif'
import type { Specialty } from '@/models/specialty'
import type { Candidature } from '@/models/candidature'

const router = useRouter()
const userStore = useUserStore()
const employeesApi = useCollection<Effectif>('employees')
const specialtiesApi = useCollection<Specialty>('specialties')
const candidaturesApi = useCollection<Candidature>('candidatures')
const { etat, connecte, connecter, deconnecter } = useDispatch()
const { log } = useLogger()
const notif = useNotifManager()

const profile = computed(() => userStore.profile)
const perms = computed(() => profile.value?.permissions ?? [])
const canAction = computed(() => perms.value.some((p) => ['lses', 'dev', 'admin'].includes(p)))

const employees = ref<Effectif[]>([])
const specialties = ref<Specialty[]>([])
const unsubs: (() => void)[] = []

onMounted(() => {
  connecter()
  unsubs.push(
    employeesApi.ecouter(
      (list) => (employees.value = [...list].sort((a, b) => a.name.localeCompare(b.name))),
    ),
  )
  unsubs.push(specialtiesApi.ecouter((list) => (specialties.value = list)))
})

onUnmounted(() => {
  deconnecter()
  unsubs.forEach((u) => u())
})

const currentEmployee = computed(() => {
  const name = profile.value?.name?.toLowerCase().trim()
  if (!name) return null
  return employees.value.find((e) => e.name?.toLowerCase().trim() === name) ?? null
})

const myDispatchPosition = computed(() => {
  const emp = currentEmployee.value
  if (!emp) return null
  const e = etat.value
  const empId = emp.id

  const centraleEffs = e.centrale?.effectifs ?? []
  if (centraleEffs.includes(empId)) {
    return { label: 'Centrale', emoji: '🎧', color: 'blue' }
  }

  for (const slot of e.interventions ?? []) {
    if ((slot.effectifs ?? []).includes(empId)) {
      const interTypes: Record<string, { label: string; emoji: string }> = {
        intervention: { label: 'Intervention', emoji: '🚑' },
        primo_inter: { label: 'Primo Inter', emoji: '🔥' },
        patrouille: { label: 'Patrouille', emoji: '🚔' },
        event: { label: 'Event', emoji: '🎪' },
        rdv: { label: 'Rendez-Vous', emoji: '📅' },
        psy: { label: 'Psy', emoji: '🧠' },
        otage: { label: 'Banque/Bijouterie', emoji: '💰' },
        bureau_admin: { label: 'Bureau/Admin', emoji: '🖥️' },
        formation: { label: 'Formation', emoji: '📚' },
        operation: { label: 'Opération', emoji: '⚙️' },
        vm: { label: 'VM', emoji: '🩺' },
        hopital: { label: "Dans l'hôpital", emoji: '🏥' },
      }
      const meta = interTypes[slot.type] ?? { label: 'Intervention', emoji: '🚑' }
      const loc = slot.lieu ? ` — ${slot.lieu}` : ''
      return { label: meta.label + loc, emoji: meta.emoji, color: 'red' }
    }
  }

  const patate = (e.patates ?? []).find((p) => p.id === empId)
  if (patate) {
    const cats: Record<string, { label: string; emoji: string; color: string }> = {
      en_service: { label: 'En service', emoji: '🟢', color: 'green' },
      astreinte: { label: 'En astreinte', emoji: '⏰', color: 'orange' },
      conges: { label: 'En congés', emoji: '🏖️', color: 'blue' },
      fin_service: { label: 'Fin de service', emoji: '🔴', color: 'red' },
      sans_permis: { label: 'Tout PT / Sans Permis', emoji: '🚶', color: 'grey' },
    }
    const cat = cats[patate.categorie] ?? { label: patate.categorie, emoji: '🥔', color: 'grey' }
    return { label: cat.label, emoji: cat.emoji, color: cat.color }
  }

  return { label: 'Hors service', emoji: '😴', color: 'grey' }
})

const myRadio = computed(() => {
  const emp = currentEmployee.value
  if (!emp) return null
  const radios = etat.value.radios ?? []
  return radios.find((r) => r.effectif_id === emp.id) ?? null
})

const filteredNavItems = computed(() => {
  const userPerms = perms.value
  const result: { titre: string; icon: string; lien: string; notif: number }[] = []
  for (const group of NAV_ITEMS) {
    for (const item of group) {
      if (item.lien === '/' || item.lien === router.currentRoute.value.path) continue
      const itemPerms = item.permissions ?? []
      let hasAccess = false
      if (itemPerms.length === 0) hasAccess = true
      else if (userPerms.some((p) => ['dev', 'admin'].includes(p))) hasAccess = true
      else if (itemPerms.some((p) => userPerms.includes(p))) hasAccess = true

      if (item.lien === '/rendez-vous') {
        const emp = currentEmployee.value
        if (!emp) {
          hasAccess = false
        } else if (userPerms.some((p) => ['dev', 'admin'].includes(p))) {
          hasAccess = true
        } else if (['Directeur', 'Directeur Adjoint'].includes(emp.role)) {
          hasAccess = true
        } else {
          const allSpecs = [...(emp.specialties ?? []), ...(emp.chiefSpecialties ?? [])]
          hasAccess = allSpecs.some((s) => {
            const spec = specialties.value.find((sp) => sp.value === s || sp.name === s)
            return spec?.canTakeAppointments ?? false
          })
        }
      }

      if (hasAccess) {
        let notifCount = 0
        if (item.lien === '/utilisateurs') notifCount = notif.waitingUsers.value.length
        if (item.lien === '/notes-frais') notifCount = notif.waitingExpenseNotes.value.length
        if (item.lien === '/commandes')
          notifCount = notif.orders.value.length + notif.alerts.value.length
        if (item.lien === '/inventaire') notifCount = notif.storagesOutdated.value
        if (item.lien === '/garage') notifCount = notif.garageNotif.value
        if (item.lien === '/rh') notifCount = notif.rhNotif.value
        result.push({ titre: item.titre, icon: item.icon, lien: item.lien, notif: notifCount })
      }
    }
  }
  return result
})

const availableTrainings = computed(() => {
  const emp = currentEmployee.value
  if (!emp) return [] as string[]
  const all = TRAININGS_CONFIG.map((t) => t.title)
  return all.filter((t) => !(emp.trainingRequests ?? []).includes(t))
})

function permissionIcon(value: string): string {
  return PERMISSIONS.find((p) => p.value === value)?.icon ?? '❓'
}
function permissionName(value: string): string {
  return PERMISSIONS.find((p) => p.value === value)?.name ?? value
}
function naviguer(lien: string): void {
  router.push(lien)
}

// ── Dialogs ──
const dialogFormation = ref(false)
const selectedTraining = ref(TRAININGS_CONFIG[0]?.title ?? '')
const dialogPromotion = ref(false)
const promotionType = ref<'specialist' | 'rh'>('specialist')
const promotionSpecialty = ref<string | null>(null)
const promotionMotivation = ref('')
const dialogCandidature = ref(false)
const candidatureName = ref('')
const candidaturePhone = ref('555-')
const candidatureEmail = ref('')
const candidatureAvailabilities = ref('')

function openFormationDialog(): void {
  if (!currentEmployee.value) {
    alert('Impossible de trouver votre dossier employé.')
    return
  }
  selectedTraining.value = availableTrainings.value[0] ?? ''
  dialogFormation.value = true
}
async function saveFormation(): Promise<void> {
  const emp = currentEmployee.value
  const training = selectedTraining.value
  if (!emp || !training) return
  const requests = [...(emp.trainingRequests ?? [])]
  if (requests.includes(training)) {
    alert('Demande déjà existante.')
    return
  }
  requests.push(training)
  await employeesApi.modifier(emp.id, { trainingRequests: requests })
  log(profile.value!.id, 'FORMATION', `Demande de formation "${training}" par ${emp.name}`)
  dialogFormation.value = false
}

function openPromotionDialog(): void {
  if (!currentEmployee.value) {
    alert('Impossible de trouver votre dossier employé.')
    return
  }
  promotionType.value = 'specialist'
  promotionSpecialty.value = null
  promotionMotivation.value = ''
  dialogPromotion.value = true
}
async function savePromotion(): Promise<void> {
  const emp = currentEmployee.value
  if (!emp) return
  if (promotionType.value === 'specialist' && !promotionSpecialty.value) return
  if (!promotionMotivation.value) {
    alert('Les motivations sont obligatoires.')
    return
  }
  if (emp.promotionRequest) {
    alert('Vous avez déjà une demande en cours.')
    return
  }
  const value = promotionType.value === 'rh' ? 'Intégration RH' : promotionSpecialty.value!
  await employeesApi.modifier(emp.id, {
    promotionRequest: { value, motivation: promotionMotivation.value },
  })
  dialogPromotion.value = false
}

function openCandidatureDialog(): void {
  candidatureName.value = ''
  candidaturePhone.value = '555-'
  candidatureEmail.value = ''
  candidatureAvailabilities.value = ''
  dialogCandidature.value = true
}
async function saveCandidature(): Promise<void> {
  const name = candidatureName.value
  const email = candidatureEmail.value
  const phone = candidaturePhone.value
  if (!name || !email || !phone) {
    alert('Veuillez remplir les champs obligatoires.')
    return
  }
  if (!email.endsWith('@discord.gg')) {
    alert("L'email doit se terminer par @discord.gg")
    return
  }
  const cand: Omit<Candidature, 'id'> = {
    name,
    phone,
    email,
    availabilities: candidatureAvailabilities.value,
    status: 'Candidature reçue',
    votes: {},
    answers: {},
  }
  await candidaturesApi.creer(cand)
  dialogCandidature.value = false
}
</script>

<template>
  <div class="accueil-page">
    <!-- Profil -->
    <section v-if="profile" class="profile-card">
      <h2 class="profile-name">{{ profile.name }}</h2>

      <!-- Dispatch info -->
      <div v-if="myDispatchPosition" class="dispatch-info">
        <span class="dispatch-chip" :data-color="myDispatchPosition.color">
          {{ myDispatchPosition.emoji }} {{ myDispatchPosition.label }}
        </span>
        <span v-if="myRadio" class="dispatch-chip" :data-color="myRadio.actif ? 'green' : 'red'">
          📻 Radio {{ myRadio.serie || '—' }} · {{ myRadio.actif ? 'ON' : 'OFF' }}
        </span>
        <span v-else class="dispatch-chip" data-color="grey">📻 Pas de radio</span>
      </div>

      <div class="profile-permissions">
        <span class="permissions-label">Permissions :</span>
        <template v-if="profile.permissions && profile.permissions.length > 0">
          <span
            v-for="perm in profile.permissions"
            :key="perm"
            class="permission-icon"
            :title="permissionName(perm)"
            >{{ permissionIcon(perm) }}</span
          >
        </template>
        <span v-else class="vide">Aucune</span>
      </div>
    </section>

    <!-- Accès rapide -->
    <section v-if="filteredNavItems.length > 0" class="quick-access">
      <h2 class="section-label">⚡ Accès rapide</h2>
      <div class="cards-grid">
        <button
          v-for="item in filteredNavItems"
          :key="item.lien"
          class="quick-card"
          @click="naviguer(item.lien)"
        >
          <span v-if="item.notif > 0" class="card-badge">{{ item.notif }}</span>
          <span class="quick-card-emoji" aria-hidden="true">
            <i :class="'fa-solid ' + item.icon"></i>
          </span>
          <span class="quick-card-label">{{ item.titre }}</span>
        </button>
      </div>
    </section>

    <!-- Actions -->
    <section v-if="canAction" class="actions-section">
      <h2 class="section-label">🖱️ Actions</h2>
      <div class="actions-row">
        <button class="btn-action primary" @click="openFormationDialog()">
          🎓 Demande de formation
        </button>
        <button class="btn-action purple" @click="openCandidatureDialog()">👤 Candidature</button>
        <button class="btn-action amber" @click="openPromotionDialog()">
          🏅 Demande de promotion
        </button>
      </div>
    </section>

    <!-- Dialog Formation -->
    <Teleport to="body">
      <div v-if="dialogFormation" class="overlay" @click="dialogFormation = false">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title primary">Demande de formation</h3>
          <div class="dialog-body">
            <p>
              Demandeur : <strong>{{ profile?.name }}</strong>
            </p>
            <div class="form-group">
              <label for="training-select">Formation demandée</label>
              <select id="training-select" v-model="selectedTraining">
                <option v-for="t in availableTrainings" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>
          <div class="dialog-actions">
            <button class="btn-secondary" @click="dialogFormation = false">Annuler</button>
            <button class="btn-primary" @click="saveFormation()">Enregistrer</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Dialog Promotion -->
    <Teleport to="body">
      <div v-if="dialogPromotion" class="overlay" @click="dialogPromotion = false">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title amber">Demande de promotion</h3>
          <div class="dialog-body">
            <p>
              Demandeur : <strong>{{ profile?.name }}</strong>
            </p>
            <div class="form-group">
              <label>Type</label>
              <div class="radio-group">
                <label>
                  <input
                    type="radio"
                    name="promo-type"
                    value="specialist"
                    v-model="promotionType"
                  />
                  Devenir Responsable de pôle
                </label>
                <label>
                  <input type="radio" name="promo-type" value="rh" v-model="promotionType" />
                  Intégrer les RH
                </label>
              </div>
            </div>
            <div v-if="promotionType === 'specialist'" class="form-group">
              <label for="specialty-select">Spécialité visée</label>
              <select id="specialty-select" v-model="promotionSpecialty">
                <option :value="null">-- Sélectionner --</option>
                <option v-for="s in specialties" :key="s.value" :value="s.value">
                  {{ s.icon }} {{ s.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label for="motivation-ta">Motivations</label>
              <textarea id="motivation-ta" v-model="promotionMotivation" rows="3"></textarea>
            </div>
          </div>
          <div class="dialog-actions">
            <button class="btn-secondary" @click="dialogPromotion = false">Annuler</button>
            <button class="btn-primary amber" @click="savePromotion()">Envoyer</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Dialog Candidature -->
    <Teleport to="body">
      <div v-if="dialogCandidature" class="overlay" @click="dialogCandidature = false">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title purple">Nouvelle Candidature</h3>
          <div class="dialog-body">
            <div class="form-row">
              <div class="form-group">
                <label for="cand-name">Nom complet</label>
                <input id="cand-name" v-model="candidatureName" type="text" />
              </div>
              <div class="form-group">
                <label for="cand-phone">Téléphone</label>
                <input id="cand-phone" v-model="candidaturePhone" type="text" />
              </div>
            </div>
            <div class="form-group">
              <label for="cand-email">Email (@discord.gg)</label>
              <input id="cand-email" v-model="candidatureEmail" type="text" />
            </div>
            <div class="form-group">
              <label for="cand-avail">Disponibilités</label>
              <textarea id="cand-avail" v-model="candidatureAvailabilities" rows="3"></textarea>
            </div>
          </div>
          <div class="dialog-actions">
            <button class="btn-secondary" @click="dialogCandidature = false">Annuler</button>
            <button class="btn-primary purple" @click="saveCandidature()">Sauvegarder</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.accueil-page {
  position: relative;
  box-sizing: border-box;
  min-height: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  isolation: isolate;
  animation: accueilFadeIn 0.26s ease;
}

.accueil-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -3;
  background: url('/assets/images/Bg.png') center / cover no-repeat;
  filter: blur(3px);
  transform: scale(1.03);
}

.accueil-page::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  background:
    linear-gradient(180deg, rgba(6, 17, 28, 0.34), rgba(6, 17, 28, 0.52)),
    radial-gradient(circle at top right, rgba(98, 175, 245, 0.18), transparent 24%),
    radial-gradient(circle at bottom left, rgba(255, 196, 94, 0.12), transparent 22%);
  pointer-events: none;
}

.profile-card,
.quick-access,
.actions-section {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(198, 220, 237, 0.16);
  background: rgba(9, 20, 31, 0.58);
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 40px -30px rgba(0, 0, 0, 0.78);
}

.profile-card {
  padding: 1.5rem;
}

.profile-card::before,
.quick-access::before,
.actions-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 26%);
  pointer-events: none;
}

.profile-name {
  margin: 0 0 1rem;
  color: #f5fbff;
  font-size: clamp(1.6rem, 1.15rem + 1vw, 2.1rem);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
}

.dispatch-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 1rem;
}

.dispatch-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.15rem;
  padding: 0.42rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(190, 214, 232, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #eef7ff;
  font-size: 0.81rem;
  font-weight: 700;

  &[data-color='green'] {
    background: rgba(18, 103, 56, 0.32);
    border-color: rgba(106, 227, 149, 0.22);
    color: #8ef0b5;
  }
  &[data-color='red'] {
    background: rgba(116, 27, 46, 0.32);
    border-color: rgba(249, 126, 143, 0.22);
    color: #ffb3bd;
  }
  &[data-color='blue'] {
    background: rgba(22, 79, 126, 0.3);
    border-color: rgba(116, 193, 255, 0.22);
    color: #99dbff;
  }
  &[data-color='orange'] {
    background: rgba(117, 75, 19, 0.32);
    border-color: rgba(255, 200, 99, 0.22);
    color: #ffd791;
  }
  &[data-color='grey'] {
    color: #d5e2ee;
  }
}

.profile-permissions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  padding-top: 0.9rem;
  border-top: 1px solid rgba(190, 214, 232, 0.12);
}

.permissions-label {
  color: #9ec0db;
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.permission-icon {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(194, 217, 234, 0.14);
  background: rgba(255, 255, 255, 0.08);
  font-size: 1rem;
}

.vide {
  color: #b2c3d0;
  font-size: 0.8rem;
}

.quick-access,
.actions-section {
  padding: 1.25rem;
}

.section-label {
  margin: 0 0 0.9rem;
  color: #a3c3dd;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.8rem;
}

.quick-card {
  position: relative;
  min-height: 152px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid rgba(194, 217, 234, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: #f5fbff;
  text-align: center;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-3px);
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(111, 190, 255, 0.28);
    box-shadow: 0 18px 28px -24px rgba(70, 146, 214, 0.7);
  }
}

.card-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  min-width: 1.5rem;
  height: 1.5rem;
  display: inline-grid;
  place-items: center;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #e04a60, #ba2940);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
}

.quick-card-emoji {
  width: 3.1rem;
  height: 3.1rem;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(194, 217, 234, 0.12);
  font-size: 1.35rem;
  line-height: 1;

  i {
    display: block;
  }
}

.quick-card-label {
  color: #deecf8;
  font-size: 0.84rem;
  font-weight: 800;
  line-height: 1.2;
  max-width: 12ch;
}

.actions-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.btn-action {
  min-height: 3.2rem;
  padding: 0.8rem 1rem;
  border: 1px solid rgba(194, 217, 234, 0.12);
  border-radius: 16px;
  color: #f5fbff;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    filter 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    filter: brightness(1.04);
  }
  &.primary {
    background: linear-gradient(135deg, rgba(35, 107, 186, 0.88), rgba(55, 146, 230, 0.62));
  }
  &.purple {
    background: linear-gradient(135deg, rgba(129, 62, 179, 0.88), rgba(182, 115, 228, 0.6));
  }
  &.amber {
    background: linear-gradient(135deg, rgba(178, 119, 31, 0.88), rgba(236, 183, 78, 0.6));
    color: #fffaf1;
  }
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(3, 10, 18, 0.7);
  backdrop-filter: blur(8px);
}

.dialog {
  width: min(92vw, 540px);
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 22px;
  border: 1px solid rgba(194, 217, 234, 0.14);
  background: linear-gradient(180deg, rgba(16, 35, 53, 0.98), rgba(11, 24, 38, 0.96));
  box-shadow: 0 28px 58px -34px rgba(0, 0, 0, 0.88);
  animation: dialogSlideUp 0.24s ease;
}

.dialog-title {
  margin: 0;
  padding: 1.1rem 1.2rem 0.95rem;
  border-bottom: 1px solid rgba(194, 217, 234, 0.12);
  font-size: 1.02rem;
  font-weight: 900;
  letter-spacing: -0.02em;

  &.primary {
    color: #95d9ff;
  }
  &.amber {
    color: #ffd691;
  }
  &.purple {
    color: #dcb2ff;
  }
}

.dialog-body {
  padding: 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.95rem;

  p {
    margin: 0;
    color: #adc2d4;
  }
  strong {
    color: #f4fbff;
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 0.95rem 1.2rem 1.15rem;
  border-top: 1px solid rgba(194, 217, 234, 0.12);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;

  > label {
    color: #9dbbd3;
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  select,
  input,
  textarea {
    width: 100%;
    padding: 0.72rem 0.82rem;
    border: 1px solid rgba(194, 217, 234, 0.14);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.08);
    color: #f3fbff;
    font-size: 0.88rem;
    font-family: inherit;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;

    &::placeholder {
      color: #809bb1;
    }
    &:focus {
      outline: none;
      border-color: rgba(111, 190, 255, 0.42);
      background: rgba(255, 255, 255, 0.1);
      box-shadow: 0 0 0 4px rgba(71, 149, 216, 0.12);
    }
  }

  textarea {
    min-height: 104px;
    resize: vertical;
  }
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.radio-group {
  display: grid;
  gap: 0.55rem;

  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.82rem 0.9rem;
    border-radius: 14px;
    border: 1px solid rgba(194, 217, 234, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: #e6f0f8;
    font-size: 0.86rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
  }
}

.btn-primary,
.btn-secondary {
  min-height: 2.65rem;
  padding: 0.52rem 1rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, #1c73c8, #3791e5);
  color: #fff;
  &.amber {
    background: linear-gradient(135deg, #d28a22, #efbe60);
    color: #251704;
  }
  &.purple {
    background: linear-gradient(135deg, #8a45bf, #bc82ef);
  }
}

.btn-secondary {
  border-color: rgba(194, 217, 234, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #d8e7f3;
}

@keyframes accueilFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes dialogSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .actions-row {
    grid-template-columns: 1fr;
  }
  .cards-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .accueil-page {
    padding: 1rem;
  }
  .profile-card,
  .quick-access,
  .actions-section {
    padding: 1rem;
    border-radius: 18px;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
  .dialog-actions {
    flex-direction: column;
  }
  .dialog-actions button {
    width: 100%;
  }
}

.quick-card:focus-visible,
.btn-action:focus-visible,
.btn-primary:focus-visible,
.btn-secondary:focus-visible,
.form-group select:focus-visible,
.form-group input:focus-visible,
.form-group textarea:focus-visible,
.radio-group input:focus-visible {
  outline: 2px solid rgba(111, 190, 255, 0.84);
  outline-offset: 2px;
}
</style>
