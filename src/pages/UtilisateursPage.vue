<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '@/composables/useAuth'
import { useLogger } from '@/composables/useLogger'
import { useUserStore } from '@/stores/user'
import { functions } from '@/plugins/firebase'
import { PERMISSIONS } from '@/config/permissions.config'
import type { Profile } from '@/models/profile'
import Swal from 'sweetalert2'

const auth = useAuth()
const userStore = useUserStore()
const logger = useLogger()

const utilisateurs = ref<Profile[]>([])
const demandes = ref<Profile[]>([])
const onglet = ref<'utilisateurs' | 'demandes'>('utilisateurs')
const dialogOuvert = ref(false)
const utilisateurEdite = ref<Profile | null>(null)
const permissionsEditees = ref<string[]>([])

const nbDemandes = computed(() => demandes.value.length)
const estAdmin = computed(() => {
  const p = userStore.profile?.permissions ?? []
  return p.includes('dev') || p.includes('admin')
})
const mesPermissions = computed(() => {
  const perms = userStore.profile?.permissions ?? []
  if (perms.includes('dev') || perms.includes('admin')) return PERMISSIONS
  return PERMISSIONS.filter((p) => perms.includes(p.value))
})
const adminUsersCount = computed(
  () =>
    utilisateurs.value.filter((u) => u.permissions.some((p) => p === 'dev' || p === 'admin'))
      .length,
)
const usersWithPermissionsCount = computed(
  () => utilisateurs.value.filter((u) => u.permissions.length > 0).length,
)

function permissionIcon(value: string): string {
  return PERMISSIONS.find((p) => p.value === value)?.icon ?? '❓'
}
function permissionName(value: string): string {
  return PERMISSIONS.find((p) => p.value === value)?.name ?? value
}

function ouvrirEdition(u: Profile): void {
  utilisateurEdite.value = u
  permissionsEditees.value = [...u.permissions]
  dialogOuvert.value = true
}
function fermerEdition(): void {
  dialogOuvert.value = false
  utilisateurEdite.value = null
}
function togglePermission(value: string): void {
  const idx = permissionsEditees.value.indexOf(value)
  if (idx >= 0) {
    permissionsEditees.value.splice(idx, 1)
  } else {
    permissionsEditees.value.push(value)
  }
}

async function enregistrerPermissions(): Promise<void> {
  const profil = utilisateurEdite.value
  if (!profil) return
  const sorted = [...permissionsEditees.value].sort((a, b) => {
    const ia = PERMISSIONS.findIndex((p) => p.value === a)
    const ib = PERMISSIONS.findIndex((p) => p.value === b)
    return ia - ib
  })
  await auth.mettreAJourPermissions(profil.id, sorted)

  const permString =
    sorted.length > 0
      ? sorted.map((p) => PERMISSIONS.find((pp) => pp.value === p)?.icon ?? '').join(' ')
      : 'Aucune'

  await logger.log(
    userStore.profile?.id ?? '',
    'UTILISATEURS',
    `Modification des permissions de l'utilisateur ${profil.name} (${permString})`,
  )

  fermerEdition()
  Swal.fire({
    icon: 'success',
    title: 'Succès',
    text: 'Utilisateur sauvegardé avec succès.',
    timer: 3000,
  })
}

async function supprimerUtilisateur(profil: Profile): Promise<void> {
  const result = await Swal.fire({
    title: 'Confirmer la suppression',
    text: `Êtes-vous sûr de vouloir supprimer l'utilisateur "${profil.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed) return
  await auth.supprimerProfil(profil.id)
  logger.log(
    userStore.profile?.id ?? '',
    'UTILISATEURS',
    `Suppression de l'utilisateur "${profil.name}"`,
  )
  fermerEdition()
  Swal.fire({
    icon: 'success',
    title: 'Succès',
    text: 'Utilisateur supprimé avec succès.',
    timer: 3000,
  })
}

async function resetPassword(profil: Profile): Promise<void> {
  const result = await Swal.fire({
    title: 'Confirmer la réinitialisation',
    text: `Êtes-vous sûr de vouloir réinitialiser le mot de passe de "${profil.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed) return

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let password = ''
  for (let i = 0; i < 24; i++) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }

  try {
    await httpsCallable(
      functions,
      'changePassword',
    )({
      userId: profil.id,
      hash: btoa(password),
    })

    await Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: `Mot de passe réinitialisé avec succès. Nouveau mot de passe temporaire : ${password} (En validant, il sera copié dans votre presse-papier.)`,
    })

    await logger.log(
      userStore.profile?.id ?? '',
      'PASSWORD',
      `Réinitialisation du mot de passe pour l'utilisateur ${profil.name}`,
    )
    await navigator.clipboard.writeText(password)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Une erreur est survenue.'
    Swal.fire({ icon: 'error', title: 'Erreur', text: message, timer: 3000 })
  }
}

async function approuver(profil: Profile): Promise<void> {
  const result = await Swal.fire({
    title: "Confirmer l'acceptation",
    text: `Êtes-vous sûr de vouloir accepter la demande de "${profil.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui, accepter',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed) return
  await auth.approuverDemande(profil.id)
  await logger.log(
    userStore.profile?.id ?? '',
    'UTILISATEURS',
    `Acceptation de la demande de l'utilisateur ${profil.name}`,
  )
  Swal.fire({
    icon: 'success',
    title: 'Succès',
    text: 'Utilisateur accepté avec succès.',
    timer: 3000,
  })
}

async function refuser(profil: Profile): Promise<void> {
  const result = await Swal.fire({
    title: 'Confirmer le rejet',
    text: `Êtes-vous sûr de vouloir rejeter la demande de "${profil.name}" ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui, rejeter',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed) return
  await auth.refuserDemande(profil.id)
  await logger.log(
    userStore.profile?.id ?? '',
    'UTILISATEURS',
    `Rejet de la demande de l'utilisateur ${profil.name}`,
  )
  Swal.fire({
    icon: 'success',
    title: 'Succès',
    text: 'Utilisateur rejeté avec succès.',
    timer: 3000,
  })
}

let unsubUtilisateurs: (() => void) | null = null
let unsubDemandes: (() => void) | null = null

onMounted(() => {
  unsubUtilisateurs = auth.ecouterProfilsActifs((profils) => {
    utilisateurs.value = profils.sort((a, b) => a.name.localeCompare(b.name))
  })
  unsubDemandes = auth.ecouterDemandes((profils) => {
    demandes.value = profils.sort((a, b) => a.name.localeCompare(b.name))
  })
})

onUnmounted(() => {
  unsubUtilisateurs?.()
  unsubDemandes?.()
})
</script>

<template>
  <div class="utilisateurs-page">
    <div class="page-header utilisateurs-hero">
      <div class="utilisateurs-hero__copy">
        <span class="utilisateurs-kicker">BCES IAM Control</span>
        <h1>Utilisateurs</h1>
        <p>Gestion des profils, des permissions et validation des accès en attente.</p>
      </div>
      <div class="utilisateurs-hero__stats">
        <article class="utilisateurs-stat-card">
          <span class="utilisateurs-stat-card__label">Profils actifs</span>
          <strong class="utilisateurs-stat-card__value">{{ utilisateurs.length }}</strong>
        </article>
        <article class="utilisateurs-stat-card utilisateurs-stat-card--warn">
          <span class="utilisateurs-stat-card__label">Demandes en attente</span>
          <strong class="utilisateurs-stat-card__value">{{ nbDemandes }}</strong>
        </article>
        <article class="utilisateurs-stat-card utilisateurs-stat-card--accent">
          <span class="utilisateurs-stat-card__label">Admins/Dev</span>
          <strong class="utilisateurs-stat-card__value">{{ adminUsersCount }}</strong>
        </article>
        <article class="utilisateurs-stat-card utilisateurs-stat-card--soft">
          <span class="utilisateurs-stat-card__label">Permissions configurées</span>
          <strong class="utilisateurs-stat-card__value">{{ usersWithPermissionsCount }}</strong>
        </article>
      </div>
    </div>

    <section class="utilisateurs-shell">
      <div class="tabs utilisateurs-tabs">
        <button :class="{ active: onglet === 'utilisateurs' }" @click="onglet = 'utilisateurs'">
          <i class="fa-solid fa-users" aria-hidden="true"></i>
          Utilisateurs
        </button>
        <button :class="{ active: onglet === 'demandes' }" @click="onglet = 'demandes'">
          <i class="fa-solid fa-user-clock" aria-hidden="true"></i>
          Demandes en attente
          <span v-if="nbDemandes > 0" class="badge">{{ nbDemandes }}</span>
        </button>
      </div>

      <div v-if="onglet === 'utilisateurs'" class="tab-content utilisateurs-panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Permissions</th>
              <th class="text-end"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in utilisateurs" :key="u.id">
              <td>{{ u.name }}</td>
              <td>
                <template v-if="u.permissions && u.permissions.length > 0">
                  <span
                    v-for="perm in u.permissions"
                    :key="perm"
                    class="perm-chip"
                    :title="permissionName(perm)"
                    >{{ permissionIcon(perm) }}</span
                  >
                </template>
                <span v-else class="perm-none">Aucune</span>
              </td>
              <td class="text-end actions-cell">
                <button
                  v-if="estAdmin"
                  class="btn-icon"
                  title="Réinitialiser le mot de passe"
                  aria-label="Réinitialiser le mot de passe"
                  @click="resetPassword(u)"
                >
                  <i class="fa-solid fa-key" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon"
                  title="Modifier"
                  aria-label="Modifier utilisateur"
                  @click="ouvrirEdition(u)"
                >
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
            <tr v-if="utilisateurs.length === 0">
              <td colspan="3" class="empty">Aucun utilisateur</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="onglet === 'demandes'" class="tab-content utilisateurs-panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th class="text-end"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in demandes" :key="d.id">
              <td>{{ d.name }}</td>
              <td class="text-end actions-cell">
                <button
                  class="btn-icon btn-icon--accept"
                  title="Accepter"
                  aria-label="Accepter demande"
                  @click="approuver(d)"
                >
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon btn-icon--reject"
                  title="Refuser"
                  aria-label="Refuser demande"
                  @click="refuser(d)"
                >
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
            <tr v-if="demandes.length === 0">
              <td colspan="2" class="empty">Aucune demande en attente</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="dialogOuvert && utilisateurEdite" class="overlay" @click="fermerEdition">
        <div class="dialog" @click.stop>
          <h3 class="dialog-title">Modifier un utilisateur</h3>
          <h4 class="dialog-username">{{ utilisateurEdite.name }}</h4>

          <div class="permissions-section">
            <label>Permissions</label>
            <div class="permissions-grid">
              <button
                v-for="perm in mesPermissions"
                :key="perm.value"
                type="button"
                class="perm-toggle"
                :class="{ active: permissionsEditees.includes(perm.value) }"
                @click="togglePermission(perm.value)"
              >
                <span class="perm-toggle__icon">{{ perm.icon }}</span>
                <span class="perm-toggle__label">{{ perm.name }}</span>
              </button>
            </div>
          </div>

          <button class="btn btn-delete-user" @click="supprimerUtilisateur(utilisateurEdite)">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            Supprimer cet utilisateur
          </button>

          <div class="dialog-actions">
            <button class="btn btn-primary" @click="enregistrerPermissions">Modifier</button>
            <button class="btn btn-danger" @click="fermerEdition">Annuler</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.utilisateurs-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: fadeIn 0.28s ease;
}

.utilisateurs-hero {
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

.utilisateurs-kicker {
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

.utilisateurs-hero__copy h1 {
  margin: 0.1rem 0 0.35rem;
  color: #f4f9ff;
  font-size: 1.72rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.utilisateurs-hero__copy p {
  margin: 0;
  max-width: 56ch;
  color: #a9c7e2;
  font-size: 0.92rem;
  line-height: 1.5;
}

.utilisateurs-hero__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.utilisateurs-stat-card {
  padding: 0.82rem 0.88rem;
  border-radius: 16px;
  border: 1px solid rgba(116, 177, 227, 0.15);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.utilisateurs-stat-card__label {
  display: block;
  color: #9fbad4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.utilisateurs-stat-card__value {
  display: block;
  margin-top: 0.25rem;
  color: #ffffff;
  font-size: 1.36rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.utilisateurs-stat-card--warn .utilisateurs-stat-card__value {
  color: #ffbe7a;
}
.utilisateurs-stat-card--accent .utilisateurs-stat-card__value {
  color: #86dcff;
}
.utilisateurs-stat-card--soft .utilisateurs-stat-card__value {
  color: #f3d2ff;
}

.utilisateurs-shell {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.tabs.utilisateurs-tabs {
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
    gap: 0.42rem;
    transition:
      background 0.16s ease,
      color 0.16s ease;

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

.badge {
  background: linear-gradient(135deg, #d83d52, #b31f36);
  color: #fff;
  font-size: 0.68rem;
  padding: 0.1rem 0.36rem;
  border-radius: 999px;
  min-width: 1.1rem;
  text-align: center;
}

.utilisateurs-panel {
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
    letter-spacing: 0.08em;
  }
  tbody tr {
    transition: background 0.14s ease;
    &:hover {
      background: color-mix(in srgb, var(--surface-hover) 78%, var(--accent-subtle) 22%);
    }
  }
}

.text-end {
  text-align: right;
}
.actions-cell {
  white-space: nowrap;
}
.perm-chip {
  font-size: 1.05rem;
  margin-right: 0.24rem;
  cursor: default;
}
.perm-none {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-style: italic;
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 2rem !important;
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
  font-size: 0.95rem;
  padding: 0;
  line-height: 1;

  &:hover {
    background: color-mix(in srgb, var(--surface-hover) 78%, transparent 22%);
  }
  &.btn-icon--accept {
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.45);
    background: rgba(21, 128, 91, 0.16);
  }
  &.btn-icon--reject {
    color: #fb7185;
    border-color: rgba(251, 113, 133, 0.45);
    background: rgba(159, 18, 57, 0.16);
  }

  i {
    display: block;
    line-height: 1;
    font-size: 0.88rem;
    text-align: center;
  }
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
}

.dialog {
  background: linear-gradient(180deg, #112235, #0e1b2d);
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 56%, transparent 44%);
  border-radius: 18px;
  padding: 1.25rem;
  width: min(92vw, 540px);
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.36);
  animation: dialogSlideUp 0.24s ease;
}

.dialog-title {
  margin: 0;
  color: #f4f9ff;
  font-size: 1.02rem;
  font-weight: 800;
}
.dialog-username {
  margin: 0;
  color: #a7bdd6;
}

.permissions-section label {
  font-size: 0.82rem;
  color: #bfd0e6;
  display: block;
  margin-bottom: 0.45rem;
}

.permissions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.35rem;
}

.perm-toggle {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.42rem 0.62rem;
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent 8%);
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 48%, transparent 52%);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;

  &:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--dispatch-zone-border) 55%);
  }
  &.active {
    border-color: color-mix(in srgb, var(--accent) 68%, #ffffff 32%);
    background: color-mix(in srgb, var(--accent-subtle) 84%, transparent 16%);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 52%, #ffffff 48%);
  }
}

.perm-toggle__icon {
  font-size: 1rem;
  flex-shrink: 0;
}
.perm-toggle__label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary);
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
}

.btn-primary {
  background: linear-gradient(135deg, #1976d2, #1e88e5);
  color: #fff;
}
.btn-danger {
  background: linear-gradient(135deg, #b32740, #d33f5a);
  color: #fff;
}

.btn-delete-user {
  width: 100%;
  background: transparent;
  border: 1px solid rgba(244, 67, 54, 0.38);
  color: #fb7185;
  &:hover {
    background: rgba(159, 18, 57, 0.16);
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

@keyframes fadeIn {
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

@media (max-width: 920px) {
  .utilisateurs-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .utilisateurs-page {
    padding: 1rem;
  }
  .utilisateurs-hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tabs.utilisateurs-tabs {
    width: 100%;
    overflow-x: auto;
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
  .utilisateurs-hero__stats {
    grid-template-columns: 1fr;
  }
  .permissions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
