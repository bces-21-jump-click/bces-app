<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCollection } from '@/composables/useFirestore'
import { useUserStore } from '@/stores/user'
import { drawBodyCanvas, generateReport } from '@/utils/autopsie-manager'
import type { Autopsie, Injury, InjuryPoint } from '@/models/autopsie'
import Swal from 'sweetalert2'

const COLORS = ['orange', 'pink', 'indigo', 'green', 'red', 'cyan']
const COLOR_HEX: Record<string, string> = {
  orange: '#FF9800',
  pink: '#E91E63',
  indigo: '#3F51B5',
  green: '#4CAF50',
  red: '#F44336',
  cyan: '#00BCD4',
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const autopsiesApi = useCollection<Autopsie>('autopsies')

const canvasRef = ref<HTMLCanvasElement | null>(null)
const tool = ref<'add' | 'move' | 'delete'>('add')

const name = ref('')
const cid = ref('')
const doctor = ref('')
const genderIsMale = ref(false)
const legist = ref('')
const injuries = ref<Injury[]>([{ externalAnalysis: '', internalAnalysis: '', points: [] }])
const selectedInjury = ref(0)
const bloodBilan = ref('')
const diagnostic = ref('')
const interventionReport = ref('')
const eventChronology = ref('')
const autopsySummary = ref('')
const autopsyDate = ref(0)
const chargement = ref(false)
const saving = ref(false)

const reportId = ref<string | null>(null)
let draggingPoint: InjuryPoint | null = null

const colors = COLORS

function colorHex(index: number): string {
  return COLOR_HEX[COLORS[index] ?? ''] ?? COLORS[index] ?? '#888'
}

function drawCanvas(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  drawBodyCanvas(canvas, genderIsMale.value, injuries.value)
}

function onGenderChange(val: boolean): void {
  genderIsMale.value = val
  drawCanvas()
}

function getCanvasPosition(evt: MouseEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY }
}

function useTool(evt: MouseEvent): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const { x: posX, y: posY } = getCanvasPosition(evt, canvas)

  switch (tool.value) {
    case 'add':
      if (evt.type === 'mousedown') {
        const list = injuries.value.map((inj) => ({ ...inj, points: [...inj.points] }))
        const target = list[selectedInjury.value]
        if (target) target.points.push({ x: posX, y: posY })
        injuries.value = list
        drawCanvas()
      }
      break
    case 'move':
      if (evt.type === 'mousedown') {
        let closestPoint: InjuryPoint | null = null
        let minDist = 10
        for (const inj of injuries.value) {
          for (const point of inj.points) {
            const d = Math.sqrt((point.x - posX) ** 2 + (point.y - posY) ** 2)
            if (d < minDist) {
              minDist = d
              closestPoint = point
            }
          }
        }
        draggingPoint = closestPoint
      } else if (evt.type === 'mousemove' && draggingPoint) {
        draggingPoint.x = posX
        draggingPoint.y = posY
        drawCanvas()
      } else if (evt.type === 'mouseup' && draggingPoint) {
        draggingPoint.x = posX
        draggingPoint.y = posY
        draggingPoint = null
        drawCanvas()
      }
      break
    case 'delete':
      if (evt.type === 'mousedown') {
        let closestIdx = -1
        let closestInj = -1
        let minD = 10
        injuries.value.forEach((inj, injIdx) => {
          inj.points.forEach((point, idx) => {
            const d = Math.sqrt((point.x - posX) ** 2 + (point.y - posY) ** 2)
            if (d < minD) {
              minD = d
              closestIdx = idx
              closestInj = injIdx
            }
          })
        })
        if (closestIdx !== -1 && closestInj !== -1) {
          const list = injuries.value.map((inj) => ({ ...inj, points: [...inj.points] }))
          list[closestInj]?.points.splice(closestIdx, 1)
          injuries.value = list
          drawCanvas()
        }
      }
      break
  }
}

function addInjury(): void {
  if (injuries.value.length >= COLORS.length) {
    Swal.fire('Erreur', 'Nombre maximum de blessures atteint.', 'error')
    return
  }
  injuries.value = [...injuries.value, { externalAnalysis: '', internalAnalysis: '', points: [] }]
}

function deleteInjury(index: number): void {
  if (injuries.value.length <= 1) {
    Swal.fire('Erreur', 'Il doit y avoir au moins une blessure.', 'error')
    return
  }
  injuries.value = injuries.value.filter((_, i) => i !== index)
  if (selectedInjury.value >= injuries.value.length)
    selectedInjury.value = injuries.value.length - 1
  drawCanvas()
}

function updateInjuryField(
  index: number,
  field: 'externalAnalysis' | 'internalAnalysis',
  value: string,
): void {
  const copy = [...injuries.value]
  const target = copy[index]
  if (target) copy[index] = { ...target, [field]: value }
  injuries.value = copy
}

async function saveReport(): Promise<void> {
  saving.value = true
  const data: Record<string, unknown> = {
    name: name.value,
    cid: cid.value,
    genderIsMale: genderIsMale.value,
    doctor: doctor.value,
    legist: legist.value,
    injuries: injuries.value,
    bloodBilan: bloodBilan.value,
    diagnostic: diagnostic.value,
    interventionReport: interventionReport.value,
    eventChronology: eventChronology.value,
    autopsySummary: autopsySummary.value,
    autopsyDate: Date.now(),
  }
  try {
    if (reportId.value) {
      await autopsiesApi.modifier(reportId.value, data)
    } else {
      await autopsiesApi.ajouter(data)
    }
    router.push('/rapports-autopsie')
  } catch {
    Swal.fire('Erreur', 'Impossible de sauvegarder le rapport.', 'error')
  } finally {
    saving.value = false
  }
}

async function genererPdf(): Promise<void> {
  const canvas = canvasRef.value
  if (!canvas) return
  const autopsie: Autopsie = {
    id: reportId.value,
    name: name.value,
    cid: cid.value,
    genderIsMale: genderIsMale.value,
    doctor: doctor.value,
    legist: legist.value,
    injuries: injuries.value,
    bloodBilan: bloodBilan.value,
    diagnostic: diagnostic.value,
    interventionReport: interventionReport.value,
    eventChronology: eventChronology.value,
    autopsySummary: autopsySummary.value,
    autopsyDate: autopsyDate.value || Date.now(),
  }
  await generateReport(autopsie, canvas)
}

function retour(): void {
  router.push('/rapports-autopsie')
}

onMounted(async () => {
  const id = route.params['id'] as string | undefined
  if (id) {
    reportId.value = id
    chargement.value = true
    try {
      const data = await autopsiesApi.lire(id)
      if (data) {
        name.value = data.name
        cid.value = data.cid
        genderIsMale.value = data.genderIsMale
        doctor.value = data.doctor
        legist.value = data.legist
        injuries.value = data.injuries
        bloodBilan.value = data.bloodBilan
        diagnostic.value = data.diagnostic
        interventionReport.value = data.interventionReport
        eventChronology.value = data.eventChronology
        autopsySummary.value = data.autopsySummary
        autopsyDate.value = data.autopsyDate
      }
    } catch {
      Swal.fire('Erreur', 'Rapport introuvable.', 'error')
    } finally {
      chargement.value = false
    }
  } else {
    legist.value = userStore.profile?.name ?? ''
    autopsyDate.value = Date.now()
  }
  await nextTick()
  setTimeout(() => drawCanvas(), 100)
})
</script>

<template>
  <div class="autopsie-page" v-if="!chargement">
    <header class="autopsie-hero">
      <button class="btn-back" @click="retour">
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        Retour
      </button>
      <div class="autopsie-hero__copy">
        <span class="autopsie-kicker">BCES Forensic Lab</span>
        <h1>{{ reportId !== null ? 'Modifier le rapport' : 'Nouvelle autopsie' }}</h1>
        <p>Edition medico-legale, cartographie des blessures et generation du rapport.</p>
      </div>
    </header>

    <!-- Identification -->
    <section class="panel identity-panel">
      <h2>Identification</h2>
      <div class="identity-grid">
        <label
          >Nom du patient
          <input class="field" type="text" v-model="name" />
        </label>
        <label
          >CID
          <input class="field" type="text" v-model="cid" />
        </label>
        <label
          >Medecin intervenant
          <input class="field" type="text" v-model="doctor" />
        </label>
        <label
          >Medecin legiste
          <input class="field" type="text" v-model="legist" />
        </label>
      </div>
      <div class="gender-toggle">
        <button :class="{ active: !genderIsMale }" @click="onGenderChange(false)">
          <i class="fa-solid fa-venus" aria-hidden="true"></i>
          Femme
        </button>
        <button :class="{ active: genderIsMale }" @click="onGenderChange(true)">
          <i class="fa-solid fa-mars" aria-hidden="true"></i>
          Homme
        </button>
      </div>
    </section>

    <!-- Workspace -->
    <section class="workspace">
      <aside class="panel injuries-panel">
        <div class="workspace-head">
          <h2>Blessures</h2>
          <button class="btn-small" @click="addInjury">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Ajouter
          </button>
        </div>
        <div class="injuries-list">
          <div
            v-for="(inj, i) in injuries"
            :key="i"
            class="injury-card"
            :style="{ borderLeftColor: colorHex(i) }"
            :class="{ selected: selectedInjury === i }"
            @click="selectedInjury = i"
          >
            <div class="injury-header">
              <span class="injury-color" :style="{ background: colorHex(i) }">{{ i + 1 }}</span>
              <span>Blessure {{ i + 1 }}</span>
              <button
                class="btn-delete"
                @click.stop="deleteInjury(i)"
                aria-label="Supprimer la blessure"
              >
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <label
              >Analyse externe
              <textarea
                class="field"
                rows="2"
                :value="inj.externalAnalysis"
                @input="
                  updateInjuryField(
                    i,
                    'externalAnalysis',
                    ($event.target as HTMLTextAreaElement).value,
                  )
                "
              ></textarea>
            </label>
            <label
              >Analyse interne
              <textarea
                class="field"
                rows="2"
                :value="inj.internalAnalysis"
                @input="
                  updateInjuryField(
                    i,
                    'internalAnalysis',
                    ($event.target as HTMLTextAreaElement).value,
                  )
                "
              ></textarea>
            </label>
          </div>
          <p v-if="injuries.length === 0" class="empty-msg">
            Aucune blessure. Cliquez sur le schéma pour en ajouter.
          </p>
        </div>
      </aside>

      <div class="panel canvas-panel">
        <div class="workspace-head canvas-head">
          <div>
            <h2>Cartographie</h2>
            <p>Selectionne un outil puis clique sur le schema corporel.</p>
          </div>
        </div>
        <div class="tool-bar">
          <button :class="{ active: tool === 'add' }" @click="tool = 'add'">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
            Ajouter
          </button>
          <button :class="{ active: tool === 'move' }" @click="tool = 'move'">
            <i class="fa-solid fa-hand" aria-hidden="true"></i>
            Deplacer
          </button>
          <button :class="{ active: tool === 'delete' }" @click="tool = 'delete'">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
            Supprimer
          </button>
        </div>
        <div class="canvas-stage">
          <canvas
            ref="canvasRef"
            width="400"
            height="340"
            @mousedown="useTool"
            @mousemove="useTool"
            @mouseup="useTool"
          ></canvas>
        </div>
      </div>
    </section>

    <!-- Rapport -->
    <section class="report-grid">
      <section class="panel form-section">
        <h2>Bilan sanguin</h2>
        <textarea class="field" rows="3" v-model="bloodBilan"></textarea>
      </section>
      <section class="panel form-section">
        <h2>Diagnostic</h2>
        <textarea class="field" rows="3" v-model="diagnostic"></textarea>
      </section>
      <section class="panel form-section">
        <h2>Rapport d'intervention</h2>
        <textarea class="field" rows="3" v-model="interventionReport"></textarea>
      </section>
      <section class="panel form-section">
        <h2>Chronologie des evenements</h2>
        <textarea class="field" rows="3" v-model="eventChronology"></textarea>
      </section>
      <section class="panel form-section report-grid__wide">
        <h2>Resume d'autopsie</h2>
        <textarea class="field" rows="4" v-model="autopsySummary"></textarea>
      </section>
    </section>

    <!-- Actions -->
    <div class="actions-bar">
      <button class="btn btn-save" :disabled="saving" @click="saveReport">
        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
        {{ saving ? 'Sauvegarde...' : 'Sauvegarder' }}
      </button>
      <button class="btn btn-pdf" @click="genererPdf">
        <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
        Generer PDF
      </button>
    </div>
  </div>
  <div v-else class="loading">Chargement...</div>
</template>

<style lang="scss" scoped>
.autopsie-page {
  padding: 1.25rem 1.35rem 1.6rem;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: fadeIn 0.28s ease;
}

.autopsie-hero {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 1.15rem 1.2rem;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 58%, transparent 42%);
  background:
    radial-gradient(circle at top right, rgba(68, 160, 255, 0.16), transparent 35%),
    linear-gradient(135deg, #0f2031, #13293d 52%, #173956);
}

.autopsie-hero__copy h1 {
  margin: 0.08rem 0 0;
  color: #f4f9ff;
  font-size: 1.62rem;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.autopsie-hero__copy p {
  margin: 0.25rem 0 0;
  color: #a9c7e2;
  font-size: 0.9rem;
}

.autopsie-kicker {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  padding: 0.24rem 0.58rem;
  border-radius: 999px;
  border: 1px solid rgba(116, 177, 227, 0.26);
  background: rgba(255, 255, 255, 0.05);
  color: #d4edff;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.btn-back {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  padding: 0.44rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(164, 205, 238, 0.28);
  background: color-mix(in srgb, #101f34 70%, #ffffff 30%);
  color: #d8ecff;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
}

.panel {
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--dispatch-card-border) 52%, transparent 48%);
  background: #10263b;
  box-shadow: 0 8px 22px rgba(3, 9, 18, 0.16);
}

.identity-panel {
  padding: 0.9rem;
}

.identity-panel h2 {
  margin: 0;
  font-size: 1rem;
}

.identity-grid {
  margin-top: 0.7rem;
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
}

.field {
  width: 100%;
  padding: 0.5rem 0.64rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 56%, transparent 44%);
  background: #071c2d;
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  resize: vertical;
}

.gender-toggle {
  margin-top: 0.68rem;
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.gender-toggle button,
.tool-bar button,
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 0.74rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 48%, transparent 52%);
  background: color-mix(in srgb, var(--surface-elevated) 88%, transparent 12%);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.gender-toggle button.active,
.tool-bar button.active,
.btn-save {
  background: linear-gradient(135deg, #1b6ec2, #2f8de2);
  color: #fff;
  border-color: transparent;
}

.workspace {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 0.9rem;
  align-items: start;
}

.workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.workspace-head h2 {
  margin: 0;
  font-size: 1rem;
}

.canvas-head p {
  margin: 0.18rem 0 0;
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.injuries-panel {
  padding: 0.8rem;
}

.injuries-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.injury-card {
  background: #112b44;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 50%, transparent 50%);
  border-left: 4px solid #ef4444;
  border-radius: 12px;
  padding: 0.72rem;
}

.injury-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.84rem;
  font-weight: 700;
}

.injury-color {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
}

.btn-delete {
  margin-left: auto;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: var(--danger);
  color: #fff;
  cursor: pointer;
}

.canvas-panel {
  padding: 0.8rem;
  min-width: 0;
}

.tool-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.canvas-stage {
  margin-top: 0.6rem;
  min-height: 360px;
  display: grid;
  place-items: center;
  padding: 0.8rem;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 48%, transparent 52%);
  background: #0f2a41;
  overflow: hidden;
}

.canvas-stage canvas {
  display: block;
  width: min(560px, 100%);
  height: auto;
  max-height: 560px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 55%, transparent 45%);
  background: #071c2d;
  cursor: crosshair;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.report-grid__wide {
  grid-column: 1 / -1;
}

.form-section {
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-section h2 {
  margin: 0;
  font-size: 1rem;
}

.form-section textarea {
  min-height: 110px;
  resize: vertical;
}

.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.empty-msg {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .canvas-stage {
    min-height: 320px;
  }
}

@media (max-width: 900px) {
  .identity-grid,
  .report-grid {
    grid-template-columns: 1fr;
  }

  .report-grid__wide {
    grid-column: auto;
  }
}

@media (max-width: 768px) {
  .autopsie-page {
    padding: 1rem;
  }

  .actions-bar {
    justify-content: stretch;
  }

  .actions-bar .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
