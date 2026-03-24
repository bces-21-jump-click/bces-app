<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import type { Profile } from '@/models/profile'
import type { Log } from '@/models/log'

const TYPES_LOG = [
  'INVENTAIRE',
  'COMMANDES',
  'VEHICULES',
  'NOTES DE FRAIS',
  'PASSWORD',
  'ENTREPRISES',
  'ITEMS',
  'UTILISATEURS',
  'FORMATION',
  'RADIOS',
  'Ajout employés',
  'Changement de grade',
  'Suppression employé',
  'Ajout faute',
  'Mise a pied',
  'Retrait de mise a pied',
]

const userStore = useUserStore()
const logsSvc = useCollection<Log>('logs')
const profilesSvc = useCollection<Profile>('profiles')

const allLogs = ref<Log[]>([])
const profiles = ref<Record<string, Profile>>({})
const chargement = ref(false)
const filtreType = ref('')
const filtreUtilisateur = ref<string | null>(null)
const page = ref(1)
const pageSize = 50

const isDev = computed(() => userStore.profile?.permissions?.includes('dev') ?? false)
const userList = computed(() => Object.values(profiles.value))

const logsFiltres = computed(() => {
  let result = allLogs.value
  if (filtreType.value) result = result.filter((l) => l.type === filtreType.value)
  if (filtreUtilisateur.value) result = result.filter((l) => l.user === filtreUtilisateur.value)
  return result.sort((a, b) => {
    const ai = parseInt(a.id ?? '0', 10)
    const bi = parseInt(b.id ?? '0', 10)
    return bi - ai
  })
})

const totalPages = computed(() => Math.min(Math.ceil(logsFiltres.value.length / pageSize) || 1, 10))
const logsPagines = computed(() => {
  const start = (page.value - 1) * pageSize
  return logsFiltres.value.slice(start, start + pageSize)
})

function getUserName(userId: string): string {
  return profiles.value[userId]?.name ?? 'Inconnu'
}

function formatDate(id: string): string {
  const ts = parseInt(id, 10)
  if (isNaN(ts)) return id
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(ts)
}

async function fetchLogs(): Promise<void> {
  chargement.value = true
  page.value = 1
  allLogs.value = await logsSvc.lister().catch(() => [])
  chargement.value = false
}

function onChangeUser(event: Event): void {
  filtreUtilisateur.value = (event.target as HTMLSelectElement).value || null
  onFilterChange()
}

function onChangeType(event: Event): void {
  filtreType.value = (event.target as HTMLSelectElement).value
  onFilterChange()
}

function onFilterChange(): void {
  page.value = 1
  fetchLogs()
}

async function deleteLog(log: Log): Promise<void> {
  if (!log.id) return
  await logsSvc.supprimer(log.id)
  fetchLogs()
}

onMounted(async () => {
  const list = await profilesSvc.lister().catch(() => [])
  const map: Record<string, Profile> = {}
  for (const p of list) if (p.id) map[p.id] = p
  profiles.value = map
  fetchLogs()
})
</script>

<template>
  <div class="logs-page">
    <div class="page-header">
      <h1>📋 Logs</h1>
      <div class="filtres">
        <select
          :value="filtreUtilisateur"
          @change="onChangeUser($event)"
          aria-label="Filtrer par utilisateur"
        >
          <option :value="null">Tous les utilisateurs</option>
          <option v-for="u in userList" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
        <select :value="filtreType" @change="onChangeType($event)" aria-label="Filtrer par type">
          <option value="">Tous les types</option>
          <option v-for="t in TYPES_LOG" :key="t" :value="t">{{ t }}</option>
        </select>
        <button class="btn-refresh" @click="fetchLogs()" aria-label="Rafraîchir">🔄</button>
      </div>
    </div>

    <div v-if="chargement" class="loading-dots"><span></span><span></span><span></span></div>
    <template v-else>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Type</th>
              <th>Description</th>
              <th v-if="isDev">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, idx) in logsPagines" :key="l.id ?? idx">
              <td class="date-cell">{{ formatDate(l.id ?? '') }}</td>
              <td>{{ getUserName(l.user) }}</td>
              <td>
                <span class="type-badge">{{ l.type }}</span>
              </td>
              <td>{{ l.description }}</td>
              <td v-if="isDev">
                <button class="btn-delete" @click="deleteLog(l)" aria-label="Supprimer ce log">
                  🗑️
                </button>
              </td>
            </tr>
            <tr v-if="logsPagines.length === 0">
              <td :colspan="isDev ? 5 : 4" class="empty">Aucun log</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button
          v-for="p in totalPages"
          :key="p"
          class="page-btn"
          :class="{ active: page === p }"
          @click="page = p"
        >
          {{ p }}
        </button>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.logs-page {
  max-width: 1360px;
  margin: 0 auto;
  padding: 1.25rem;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: fadeIn 0.24s ease;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1.1rem 1.2rem;
  border-radius: 22px;
  border: 1px solid rgba(198, 220, 237, 0.14);
  background: rgba(10, 22, 34, 0.72);
  backdrop-filter: blur(12px);
  h1 {
    margin: 0;
    font-size: clamp(1.3rem, 1.05rem + 0.9vw, 1.9rem);
    font-weight: 900;
    letter-spacing: -0.04em;
    color: var(--text-primary);
  }
}
.filtres {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  select {
    min-width: 190px;
    min-height: 2.75rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid rgba(194, 217, 234, 0.12);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-primary);
    font-size: 0.84rem;
  }
}
.btn-refresh {
  min-width: 2.75rem;
  min-height: 2.75rem;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgba(194, 217, 234, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  font-size: 0.95rem;
  cursor: pointer;
  &:hover {
    transform: translateY(-1px);
    border-color: rgba(116, 193, 255, 0.24);
    background: rgba(255, 255, 255, 0.11);
  }
}
.table-container {
  flex: 1;
  overflow: auto;
  border-radius: 24px;
  border: 1px solid rgba(198, 220, 237, 0.14);
  background: rgba(10, 22, 34, 0.74);
  backdrop-filter: blur(12px);
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
  th,
  td {
    padding: 0.8rem 0.95rem;
    text-align: left;
    border-bottom: 1px solid rgba(198, 220, 237, 0.09);
  }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: rgba(14, 31, 47, 0.94);
    color: #9fc4dc;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  tbody tr {
    transition: background 0.16s ease;
    &:hover {
      background: rgba(255, 255, 255, 0.04);
    }
  }
}
.date-cell {
  font-family: 'Consolas', 'SF Mono', monospace;
  font-size: 0.76rem;
  white-space: nowrap;
  color: var(--text-secondary);
}
.type-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(194, 217, 234, 0.14);
  background: rgba(255, 255, 255, 0.07);
  color: #d9edf9;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}
.btn-delete {
  min-height: 2rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid rgba(240, 109, 129, 0.16);
  border-radius: 12px;
  background: rgba(153, 27, 47, 0.16);
  color: #ffd2d8;
  font-size: 0.8rem;
  cursor: pointer;
  &:hover {
    transform: translateY(-1px);
    background: rgba(190, 31, 57, 0.2);
    border-color: rgba(240, 109, 129, 0.24);
  }
}
.pagination {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.page-btn {
  min-width: 2.45rem;
  height: 2.45rem;
  border: 1px solid rgba(194, 217, 234, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
  }
  &.active {
    background: linear-gradient(135deg, rgba(35, 107, 186, 0.92), rgba(55, 146, 230, 0.74));
    color: #fff;
    border-color: rgba(111, 190, 255, 0.32);
  }
}
.empty {
  text-align: center;
  padding: 2.8rem 1rem !important;
  color: var(--text-muted);
}
.loading-dots {
  display: flex;
  justify-content: center;
  gap: 0.45rem;
  padding: 2.2rem;
  border-radius: 22px;
  border: 1px solid rgba(198, 220, 237, 0.14);
  background: rgba(10, 22, 34, 0.68);
  span {
    width: 0.55rem;
    height: 0.55rem;
    background: var(--accent-light, #86dcff);
    border-radius: 50%;
    animation: bounce 1.2s infinite ease-in-out;
    &:nth-child(2) {
      animation-delay: 0.2s;
    }
    &:nth-child(3) {
      animation-delay: 0.4s;
    }
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
@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}
@media (max-width: 900px) {
  .logs-page {
    padding: 1rem;
  }
  .page-header {
    padding: 1rem;
    border-radius: 18px;
  }
  .table-container {
    border-radius: 18px;
  }
}
</style>
