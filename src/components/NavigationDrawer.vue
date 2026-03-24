<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { auth as firebaseAuth } from '@/plugins/firebase'
import { useAuth } from '@/composables/useAuth'
import { useUserStore } from '@/stores/user'
import { NAV_ITEMS, type NavItem, type NavGroupe } from '@/config/navigation.config'

const THEME_STORAGE_KEY = 'bces.theme'

const router = useRouter()
const route = useRoute()
const { deconnexion } = useAuth()
const userStore = useUserStore()

const themeNuit = ref(chargerThemeDepuisStorage())
const menuOuvert = ref(false)
const nomPageActive = ref('Accueil')

const utilisateur = computed(() => userStore.profile)

const navGroupesFiltres = computed<NavGroupe[]>(() => {
  const permsUtilisateur = userStore.profile?.permissions ?? []
  const estPrive = permsUtilisateur.includes('dev') || permsUtilisateur.includes('admin')
  return NAV_ITEMS.map((groupe) =>
    groupe.filter((item) => {
      if (!item.permissions || item.permissions.length === 0) return true
      if (estPrive) return true
      return item.permissions.some((p) => permsUtilisateur.includes(p))
    }),
  ).filter((groupe) => groupe.length > 0)
})

function getBadge(_item: NavItem): number {
  // Les badges seront implémentés à l'étape 4 (NotifManager)
  return 0
}

function toggleTheme() {
  themeNuit.value = !themeNuit.value
  appliquerTheme()
  localStorage.setItem(THEME_STORAGE_KEY, themeNuit.value ? 'dark' : 'light')
}

function toggleMenu() {
  menuOuvert.value = !menuOuvert.value
}

function fermerMenu() {
  menuOuvert.value = false
}

async function handleDeconnexion() {
  await deconnexion()
  fermerMenu()
  await router.push('/connexion')
}

async function changerMotDePasse() {
  const user = firebaseAuth.currentUser
  if (!user) return

  const ancien = prompt('Mot de passe actuel')
  if (!ancien) return
  const nouveau = prompt('Nouveau mot de passe (6 caractères minimum)')
  if (!nouveau) return
  const confirmation = prompt('Confirmer le nouveau mot de passe')
  if (nouveau !== confirmation) {
    alert('Les nouveaux mots de passe ne correspondent pas.')
    return
  }

  try {
    const credential = EmailAuthProvider.credential(user.email!, ancien)
    await reauthenticateWithCredential(user, credential)
    await updatePassword(user, nouveau)
    alert('Le mot de passe a été mis à jour avec succès.')
  } catch (e: unknown) {
    const code = (e as { code?: string }).code
    if (code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') {
      alert("L'ancien mot de passe est incorrect.")
    } else {
      alert('Erreur lors de la mise à jour du mot de passe.')
    }
  }
}

function mettreAJourNomPage(url: string) {
  const propre = nettoyerUrl(url)
  if (propre === '/') {
    nomPageActive.value = 'Accueil'
    document.title = `BCES Accueil`
    return
  }

  const item = NAV_ITEMS.flat().find((nav) => nav.lien === propre)
  if (item) {
    nomPageActive.value = item.titre
    document.title = `BCES ${item.titre}`
    return
  }

  const premierSegment = propre.split('/').filter(Boolean)[0] ?? ''
  nomPageActive.value = formatterSegment(premierSegment)
  document.title = `BCES ${nomPageActive.value}`
}

function nettoyerUrl(url: string): string {
  const sansQuery = url.split('?')[0]?.split('#')[0] ?? '/'
  if (!sansQuery || sansQuery === '/') return '/'
  return sansQuery.endsWith('/') ? sansQuery.slice(0, -1) : sansQuery
}

function formatterSegment(segment: string): string {
  if (!segment) return 'Accueil'
  return segment.charAt(0).toUpperCase() + segment.slice(1).replaceAll('-', ' ')
}

function appliquerTheme() {
  document.documentElement.setAttribute('data-theme', themeNuit.value ? 'dark' : 'light')
}

function chargerThemeDepuisStorage(): boolean {
  const themeSauvegarde = localStorage.getItem(THEME_STORAGE_KEY)
  if (themeSauvegarde === 'dark') return true
  if (themeSauvegarde === 'light') return false
  return true
}

function isActive(lien: string): boolean {
  if (lien === '/') return route.path === '/'
  return route.path.startsWith(lien)
}

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') fermerMenu()
}

onMounted(() => {
  appliquerTheme()
  mettreAJourNomPage(route.path)
  document.addEventListener('keydown', onEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onEscape)
})

watch(
  () => route.path,
  (newPath) => mettreAJourNomPage(newPath),
)
</script>

<template>
  <!-- Top bar -->
  <header class="topbar">
    <RouterLink to="/" class="brand-link">
      <img class="brand-logo" src="/assets/images/logo.png" alt="" aria-hidden="true" />
      <span class="brand-text">BCES {{ nomPageActive }}</span>
    </RouterLink>

    <div class="topbar-actions">
      <button
        class="theme-btn"
        @click="toggleTheme()"
        :aria-label="themeNuit ? 'Mode jour' : 'Mode nuit'"
      >
        {{ themeNuit ? '☀️' : '🌙' }}
      </button>
      <button class="menu-btn" @click="toggleMenu()" aria-label="Ouvrir le menu">☰</button>
    </div>
  </header>

  <!-- Drawer -->
  <Teleport to="body">
    <template v-if="menuOuvert">
      <div class="backdrop" @click="fermerMenu()"></div>
      <nav class="drawer" role="navigation" aria-label="Navigation principale">
        <div class="drawer-header">
          <img class="brand-logo" src="/assets/images/logo.png" alt="" aria-hidden="true" />
          <span class="brand-text">BCES</span>
          <button class="close-btn" @click="fermerMenu()" aria-label="Fermer le menu">✕</button>
        </div>
        <div class="drawer-nav">
          <template v-for="(groupe, groupeIndex) in navGroupesFiltres" :key="groupeIndex">
            <div v-if="groupeIndex > 0" class="nav-divider"></div>
            <RouterLink
              v-for="item in groupe"
              :key="item.lien"
              :to="item.lien"
              class="nav-link"
              :class="{ active: isActive(item.lien) }"
              @click="fermerMenu()"
            >
              <i :class="'fa-solid nav-icon ' + item.icon" aria-hidden="true"></i>
              <span class="nav-text">{{ item.titre }}</span>
              <span v-if="getBadge(item) > 0" class="nav-badge">{{ getBadge(item) }}</span>
            </RouterLink>
          </template>
        </div>

        <div class="drawer-account">
          <template v-if="utilisateur">
            <div class="drawer-account__identity">{{ utilisateur.name }}</div>
            <button class="account-btn" @click="changerMotDePasse()">
              Changer de mot de passe
            </button>
            <button class="account-btn danger" @click="handleDeconnexion()">Se déconnecter</button>
          </template>
        </div>
      </nav>
    </template>
  </Teleport>
</template>

<style scoped lang="scss">
/* ===== TOP BAR ===== */
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 1rem;
  background: color-mix(in srgb, var(--surface) 82%, var(--brand-deep) 18%);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  text-decoration: none;
  color: var(--text-primary);
  min-width: 0;
}

.brand-logo {
  width: 2.5rem;
  height: 2.5rem;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-text {
  font-weight: 800;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
}

.theme-btn,
.menu-btn,
.close-btn {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-elevated) 75%, transparent 25%);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--border);
  }
}

.menu-btn {
  font-size: 1.25rem;
}

.theme-btn,
.close-btn {
  font-size: 1rem;
}

/* ===== BACKDROP ===== */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  animation: fadeInBackdrop 0.2s ease;
}

@keyframes fadeInBackdrop {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ===== DRAWER ===== */
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(320px, 88vw);
  background: color-mix(in srgb, var(--surface) 90%, var(--brand-deep) 10%);
  border-left: 1px solid var(--border);
  z-index: 201;
  display: flex;
  flex-direction: column;
  box-shadow: -16px 0 32px rgba(0, 0, 0, 0.35);
  animation: slideInRight 0.24s ease;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.drawer-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.95rem 0.9rem;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-elevated) 82%, var(--brand-deep) 18%);

  .brand-text {
    flex: 1;
    font-size: 0.95rem;
    font-weight: 700;
  }
}

.drawer-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.55rem 0.55rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-divider {
  height: 1px;
  background: color-mix(in srgb, var(--border-subtle) 70%, transparent 30%);
  margin: 0.45rem 0.45rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.62rem 0.75rem;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: all 0.15s ease;

  &:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
    border-color: color-mix(in srgb, var(--border) 55%, transparent 45%);
  }

  &.active {
    background: color-mix(in srgb, var(--accent-subtle) 70%, var(--surface-elevated) 30%);
    color: var(--accent-light);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent 55%);

    .nav-icon {
      transform: scale(1.08);
    }
  }
}

.nav-icon {
  font-size: 1.1rem;
  width: 1.35rem;
  text-align: center;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.nav-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-badge {
  min-width: 1.3rem;
  height: 1.3rem;
  padding: 0 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  flex-shrink: 0;
}

/* ===== ACCOUNT ===== */
.drawer-account {
  border-top: 1px solid var(--border-subtle);
  padding: 0.75rem;
  display: grid;
  gap: 0.45rem;
}

.drawer-account__identity {
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.account-btn {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-elevated);
  color: var(--text-primary);
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0.5rem 0.65rem;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--surface-hover);
  }

  &.danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 35%, transparent 65%);
  }
}

/* ===== LIGHT THEME ===== */
[data-theme='light'] .topbar {
  background: linear-gradient(180deg, rgba(255, 252, 245, 0.98), rgba(246, 236, 221, 0.96));
  border-bottom-color: #d4c1a6;
  box-shadow: 0 4px 12px rgba(81, 59, 39, 0.12);
}

[data-theme='light'] .theme-btn,
[data-theme='light'] .menu-btn,
[data-theme='light'] .close-btn {
  background: linear-gradient(180deg, #fffef9, #f3e9da);
  border-color: #cdb99d;
  color: #4c3a2a;

  &:hover {
    background: linear-gradient(180deg, #fffefb, #eadcc7);
    border-color: #b99d79;
  }
}

[data-theme='light'] .drawer {
  background: linear-gradient(180deg, #fffef9, #f6ecde);
  border-left-color: #cfbca1;
  box-shadow: -16px 0 32px rgba(75, 54, 35, 0.2);
}

[data-theme='light'] .drawer-header {
  background: linear-gradient(180deg, #fffefb, #f1e5d3);
  border-bottom-color: #decfb8;
}

[data-theme='light'] .nav-link {
  color: #5a4a39;

  &:hover {
    background: #f3e8d8;
    border-color: #d1bda0;
    color: #2f251b;
  }

  &.active {
    background: linear-gradient(90deg, rgba(15, 118, 110, 0.16), rgba(15, 118, 110, 0.08));
    border-color: rgba(15, 118, 110, 0.45);
    color: #0b5d57;
  }
}

[data-theme='light'] .backdrop {
  background: rgba(58, 42, 27, 0.26);
}

/* ===== RESPONSIVE ===== */
@media (max-width: 640px) {
  .topbar {
    padding: 0.55rem 0.75rem;
    gap: 0.6rem;
  }

  .brand-text {
    font-size: 0.95rem;
  }

  .drawer {
    width: min(300px, 92vw);
  }
}
</style>
