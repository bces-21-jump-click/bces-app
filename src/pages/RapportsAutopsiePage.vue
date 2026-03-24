<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCollection } from '@/composables/useFirestore'
import { useAuth } from '@/composables/useAuth'
import { drawBodyCanvas, generateReport } from '@/utils/autopsie-manager'
import type { Autopsie } from '@/models/autopsie'
import type { Profile } from '@/models/profile'
import Swal from 'sweetalert2'

const WHEEL_COLORS = [
  '#E91E63',
  '#9C27B0',
  '#3F51B5',
  '#2196F3',
  '#00BCD4',
  '#4CAF50',
  '#CDDC39',
  '#FF9800',
  '#FF5722',
  '#795548',
  '#607D8B',
  '#F44336',
]

const router = useRouter()
const auth = useAuth()
const autopsiesApi = useCollection<Autopsie>('autopsies')

const reports = ref<Autopsie[]>([])
const search = ref('')
let unsub: (() => void) | null = null

const filteredReports = computed(() => {
  const s = search.value.toLowerCase()
  if (!s) return reports.value
  return reports.value.filter(
    (r) =>
      r.name.toLowerCase().includes(s) ||
      r.cid.toLowerCase().includes(s) ||
      r.doctor.toLowerCase().includes(s) ||
      r.legist.toLowerCase().includes(s),
  )
})

// Randomizer
const randomizerOpen = ref(false)
const randomizerStep = ref<1 | 2>(1)
const legistes = ref<Profile[]>([])
const selectedLegistes = ref<string[]>([])
const legistesLoading = ref(false)
const isSpinning = ref(false)
const wheelResult = ref<string | null>(null)
const wheelCanvasRef = ref<HTMLCanvasElement | null>(null)

let currentRotation = 0
let animFrame: number | null = null

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return (
    d.toLocaleDateString('fr-FR') +
    ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  )
}

function voirRapport(r: Autopsie): void {
  router.push('/autopsie/' + (r.id ?? ''))
}
function nouveauRapport(): void {
  router.push('/autopsie')
}

async function downloadPdf(report: Autopsie): Promise<void> {
  const canvas = document.createElement('canvas')
  await drawBodyCanvas(canvas, report.genderIsMale, report.injuries)
  await generateReport(report, canvas)
}

async function deleteReport(r: Autopsie): Promise<void> {
  const result = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: 'Vous ne pourrez pas revenir en arrière !',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Oui, supprimer !',
    cancelButtonText: 'Annuler',
  })
  if (!result.isConfirmed || !r.id) return
  try {
    await autopsiesApi.supprimer(r.id)
    Swal.fire('Supprimé !', 'Le rapport a été supprimé.', 'success')
  } catch {
    Swal.fire('Erreur', 'Une erreur est survenue lors de la suppression.', 'error')
  }
}

// ---- Randomizer ----
async function openRandomizer(): Promise<void> {
  randomizerOpen.value = true
  randomizerStep.value = 1
  wheelResult.value = null
  legistesLoading.value = true
  try {
    const profiles = await auth.listerProfils()
    const l = profiles.filter(
      (p: Profile) =>
        p.activated && Array.isArray(p.permissions) && p.permissions.includes('legist'),
    )
    legistes.value = l
    selectedLegistes.value = l.map((p) => p.id)
  } finally {
    legistesLoading.value = false
  }
}

function toggleLegiste(id: string): void {
  const list = selectedLegistes.value
  selectedLegistes.value = list.includes(id) ? list.filter((l) => l !== id) : [...list, id]
}

const selectedLegistesNames = computed(() =>
  legistes.value.filter((l) => selectedLegistes.value.includes(l.id)).map((l) => l.name),
)

function goToWheel(): void {
  randomizerStep.value = 2
  currentRotation = 0
  wheelResult.value = null
  setTimeout(() => drawWheel(), 50)
}

function drawWheel(): void {
  const canvas = wheelCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  const cx = W / 2
  const cy = H / 2
  const radius = Math.min(cx, cy) - 8
  const names = selectedLegistesNames.value
  const n = names.length
  if (n === 0) return
  const seg = (2 * Math.PI) / n
  ctx.clearRect(0, 0, W, H)
  for (let i = 0; i < n; i++) {
    const start = i * seg + currentRotation
    const end = start + seg
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, start, end)
    ctx.closePath()
    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length] ?? '#888'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(start + seg / 2)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'white'
    const fontSize = Math.max(10, Math.min(14, Math.floor(120 / n) + 6))
    ctx.font = `bold ${fontSize}px Arial, sans-serif`
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 3
    const edgePad = 12
    const centerPad = 24
    const maxW = radius - edgePad - centerPad
    const words = (names[i] ?? '').split(' ')
    const lines: string[] = []
    let currentLine = words[0] ?? ''
    for (let w = 1; w < words.length; w++) {
      const testLine = currentLine + ' ' + (words[w] ?? '')
      if (ctx.measureText(testLine).width <= maxW) currentLine = testLine
      else {
        lines.push(currentLine)
        currentLine = words[w] ?? ''
      }
    }
    lines.push(currentLine)
    const lh = fontSize * 1.2
    const totalHeight = (lines.length - 1) * lh
    const startY = -totalHeight / 2 + fontSize * 0.35
    lines.forEach((line, li) => {
      ctx.fillText(line, radius - edgePad, startY + li * lh)
    })
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(cx, cy, 18, 0, 2 * Math.PI)
  ctx.fillStyle = '#212121'
  ctx.fill()
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 2
  ctx.stroke()
}

function spinWheel(): void {
  if (isSpinning.value) return
  isSpinning.value = true
  wheelResult.value = null
  const names = selectedLegistesNames.value
  const n = names.length
  const seg = (2 * Math.PI) / n
  const targetIndex = Math.floor(Math.random() * n)
  const targetFinal = -Math.PI / 2 - (targetIndex * seg + seg / 2)
  let delta = (((targetFinal - currentRotation) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (delta < 0.1) delta += 2 * Math.PI
  const extraSpins = (6 + Math.floor(Math.random() * 5)) * 2 * Math.PI
  const totalDelta = delta + extraSpins
  const startRotation = currentRotation
  const duration = 5000
  const startTime = performance.now()
  const animate = (ts: number) => {
    const t = Math.min((ts - startTime) / duration, 1)
    const eased = 1 - Math.pow(1 - t, 4)
    currentRotation = startRotation + totalDelta * eased
    drawWheel()
    if (t < 1) {
      animFrame = requestAnimationFrame(animate)
    } else {
      currentRotation = startRotation + totalDelta
      isSpinning.value = false
      wheelResult.value = names[targetIndex] ?? null
      drawWheel()
    }
  }
  animFrame = requestAnimationFrame(animate)
}

function closeRandomizer(): void {
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = null
  }
  randomizerOpen.value = false
  randomizerStep.value = 1
  isSpinning.value = false
  currentRotation = 0
  wheelResult.value = null
}

onMounted(() => {
  unsub = autopsiesApi.ecouter((list) => {
    reports.value = list.sort((a, b) => b.autopsyDate - a.autopsyDate)
  })
})
onUnmounted(() => {
  unsub?.()
  if (animFrame) cancelAnimationFrame(animFrame)
})
</script>

<template>
  <div class="rapports-page">
    <div class="page-header rapports-hero">
      <div class="rapports-hero__copy">
        <span class="rapports-kicker">BCES Forensic Reports</span>
        <h1>Rapports d'autopsie</h1>
        <p>Consultation, création et export des dossiers d'autopsie.</p>
      </div>
    </div>

    <section class="rapports-shell">
      <div class="page-header rapports-toolbar">
        <div class="header-actions">
          <input type="text" class="field search-field" placeholder="Rechercher" v-model="search" />
          <button class="btn" @click="openRandomizer()">
            <i class="fa-solid fa-dice" aria-hidden="true"></i>
            Randomizer
          </button>
          <button class="btn accent" @click="nouveauRapport()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Nouvelle autopsie
          </button>
        </div>
      </div>

      <div class="table-container rapports-panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Nom</th>
              <th>CID</th>
              <th>Médecin intervenant</th>
              <th>Médecin légiste</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, idx) in filteredReports" :key="r.id ?? idx">
              <td>{{ formatDate(r.autopsyDate) }}</td>
              <td>{{ r.name }}</td>
              <td>{{ r.cid }}</td>
              <td>{{ r.doctor }}</td>
              <td>{{ r.legist }}</td>
              <td class="actions-cell">
                <button
                  class="btn-icon"
                  @click="voirRapport(r)"
                  title="Consulter"
                  aria-label="Consulter"
                >
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                </button>
                <button
                  class="btn-icon danger"
                  @click="deleteReport(r)"
                  title="Supprimer"
                  aria-label="Supprimer"
                >
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
            <tr v-if="filteredReports.length === 0">
              <td colspan="6" class="empty">Aucun rapport</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="randomizerOpen" class="overlay" @click="closeRandomizer">
        <div class="dialog dialog-randomizer" @click.stop>
          <h3 class="dialog-title">
            <i class="fa-solid fa-dice" aria-hidden="true"></i> Randomizer Légiste
          </h3>

          <template v-if="randomizerStep === 1">
            <p class="dialog-desc">Sélectionnez les légistes à inclure dans la roue :</p>
            <p v-if="legistesLoading" class="loading">Chargement...</p>
            <template v-else>
              <div class="legiste-list">
                <label v-for="l in legistes" :key="l.id" class="legiste-item">
                  <input
                    type="checkbox"
                    :checked="selectedLegistes.includes(l.id)"
                    @change="toggleLegiste(l.id)"
                  />
                  {{ l.name }}
                </label>
                <p v-if="legistes.length === 0" class="empty">Aucun légiste trouvé.</p>
              </div>
              <div class="dialog-actions">
                <button class="btn" @click="closeRandomizer">Annuler</button>
                <button
                  class="btn accent"
                  :disabled="selectedLegistes.length === 0"
                  @click="goToWheel"
                >
                  Lancer la roue
                </button>
              </div>
            </template>
          </template>

          <template v-else>
            <div class="wheel-wrapper">
              <div class="wheel-pointer"></div>
              <div class="wheel-placeholder">🎡</div>
            </div>
            <p v-if="wheelResult" class="wheel-result">
              <i class="fa-solid fa-trophy" aria-hidden="true"></i> {{ wheelResult }}
            </p>
            <div class="dialog-actions">
              <button class="btn" :disabled="isSpinning" @click="randomizerStep = 1">Retour</button>
              <button class="btn accent" :disabled="isSpinning" @click="spinWheel">
                <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                {{ isSpinning ? 'En cours...' : 'Tourner !' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.rapports-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  animation: fadeIn 0.28s ease;
}

.rapports-hero {
  display: block;
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

.rapports-kicker {
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

.rapports-hero__copy h1 {
  margin: 0.1rem 0 0.35rem;
  color: #f4f9ff;
  font-size: 1.72rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.rapports-hero__copy p {
  margin: 0;
  max-width: 56ch;
  color: #a9c7e2;
  font-size: 0.92rem;
  line-height: 1.5;
}

.rapports-shell {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.rapports-toolbar {
  padding: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.search-field {
  min-width: 240px;
}

.rapports-panel {
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
  }

  tbody tr:hover {
    background: color-mix(in srgb, var(--surface-hover) 78%, var(--accent-subtle) 22%);
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem;
  }
}

.actions-cell {
  display: flex;
  gap: 0.25rem;
  justify-content: flex-end;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
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

  &.accent {
    background: linear-gradient(135deg, #1976d2, #1e88e5);
    color: #fff;
  }

  &.success {
    background: linear-gradient(135deg, #109e78, #17b88e);
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

.btn-icon i {
  display: block;
  line-height: 1;
  font-size: 0.9rem;
  text-align: center;
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

.dialog-randomizer {
  max-width: 560px;
  width: 100%;
}

.dialog-title {
  font-size: 1.02rem;
  font-weight: 800;
  margin: 0 0 1rem;
  color: #f4f9ff;

  i {
    margin-right: 0.35rem;
  }
}

.dialog-desc {
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.legiste-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 260px;
  overflow-y: auto;
  margin-bottom: 1rem;
}

.legiste-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 42%, transparent 58%);
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent 8%);
  font-size: 0.85rem;
  cursor: pointer;

  input[type='checkbox'] {
    accent-color: var(--accent);
  }
}

.wheel-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 1rem 0;
}

.wheel-pointer {
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 13px solid transparent;
  border-right: 13px solid transparent;
  border-top: 26px solid #d33f5a;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}

.wheel-placeholder {
  font-size: 6rem;
  animation: spin 2s linear infinite;
}

.wheel-result {
  text-align: center;
  font-size: 1.02rem;
  font-weight: 800;
  color: #86dcff;
  margin: 0.5rem 0;

  i {
    margin-right: 0.3rem;
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

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 920px) {
  .rapports-hero {
    display: block;
  }
}

@media (max-width: 768px) {
  .rapports-page {
    padding: 1rem;
  }

  .header-actions {
    width: 100%;
  }

  .search-field {
    min-width: 0;
    width: 100%;
  }

  .dialog-actions {
    flex-direction: column;
  }

  .dialog-actions .btn {
    width: 100%;
  }
}
</style>
