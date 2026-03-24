<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useDispatch } from '@/composables/useDispatch'
import {
  SALLES_AVEC_LITS,
  SALLES_SIMPLES,
  SALLES_OPERATION,
  STATUTS_CHAMBRE,
  STATUTS_OPERATION,
  COULEURS_STATUTS_CHAMBRE,
} from '@/config/dispatch.config'
import type { DonneesChambres, FicheChambre, FicheOperation } from '@/models/dispatch'

type SalleAvecLitsId = 'emergency_room' | 'josiah_room' | 'chiliad_room'
type LitId = 'lit_g' | 'lit_m' | 'lit_d'
type SalleSimpleId = 'gordo_room' | 'san_chianki_room'
type SalleOperationId = 'op_1' | 'op_2' | 'op_3'

const admissionSep = ' | '
const { etat, connecte, connecter, deconnecter, envoyerEtat } = useDispatch()

const sallesAvecLits = SALLES_AVEC_LITS
const sallesSimples = SALLES_SIMPLES
const sallesOperation = SALLES_OPERATION
const statutsChambre = STATUTS_CHAMBRE
const statutsOperation = STATUTS_OPERATION

const chambres = computed(() => etat.value.chambres)

onMounted(() => connecter())
onUnmounted(() => deconnecter())

function ficheChambreVide(): FicheChambre {
  return {
    patient: '',
    admission_medecin: '',
    type_prise_en_charge: '',
    fdo: false,
    soins: false,
    statut: '',
  }
}
function ficheOperationVide(): FicheOperation {
  return { patient: '', medecins: '', statut: '', description: '' }
}

function mettreAJourChambres(c: DonneesChambres): void {
  envoyerEtat({ ...etat.value, chambres: c })
}

function lireAdmission(valeur: string): { date: string; medecins: string } {
  const texte = valeur.trim()
  if (!texte) return { date: '', medecins: '' }
  const withPipe = texte.match(/^([^|]+)\|\s*(.*)$/)
  if (withPipe) return { date: (withPipe[1] ?? '').trim(), medecins: (withPipe[2] ?? '').trim() }
  const withDatePrefix = texte.match(/^(\d{2}\/\d{2}\s\d{2}:\d{2})(?:\s*(?:\||-|–)?\s*(.*))?$/)
  if (withDatePrefix)
    return { date: (withDatePrefix[1] ?? '').trim(), medecins: (withDatePrefix[2] ?? '').trim() }
  return { date: '', medecins: texte }
}
function ecrireAdmission(date: string, medecins: string): string {
  const d = date.trim()
  const m = medecins.trim()
  if (!d && !m) return ''
  if (!d) return m
  if (!m) return d
  return `${d}${admissionSep}${m}`
}
function horodatageSansAnnee(): string {
  const now = new Date()
  const j = String(now.getDate()).padStart(2, '0')
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return `${j}/${mo} ${h}:${mi}`
}

function estFicheChambreRemplie(fiche: FicheChambre): boolean {
  return Boolean(
    fiche.patient.trim() ||
    fiche.admission_medecin.trim() ||
    fiche.type_prise_en_charge.trim() ||
    fiche.statut.trim() ||
    fiche.fdo ||
    fiche.soins,
  )
}
function estFicheOperationRemplie(fiche: FicheOperation): boolean {
  return Boolean(
    fiche.patient.trim() ||
    fiche.medecins.trim() ||
    fiche.statut.trim() ||
    fiche.description.trim(),
  )
}

function completerHorodatageAdmissionSiNecessaire(
  fiche: FicheChambre,
  champModifie: keyof FicheChambre,
): FicheChambre {
  const admission = lireAdmission(fiche.admission_medecin)
  if (admission.date) return fiche
  if (!estFicheChambreRemplie(fiche)) return fiche
  const medecins =
    champModifie === 'admission_medecin'
      ? lireAdmission(fiche.admission_medecin).medecins
      : admission.medecins
  return { ...fiche, admission_medecin: ecrireAdmission(horodatageSansAnnee(), medecins) }
}

function majLit(
  salleId: SalleAvecLitsId,
  litId: LitId,
  champ: keyof FicheChambre,
  valeur: string | boolean,
): void {
  const c = chambres.value
  const ficheMaj = completerHorodatageAdmissionSiNecessaire(
    { ...c[salleId][litId], [champ]: valeur },
    champ,
  )
  const salle = { ...c[salleId], [litId]: ficheMaj }
  mettreAJourChambres({ ...c, [salleId]: salle })
}

function majSalleSimple(
  salleId: SalleSimpleId,
  champ: keyof FicheChambre,
  valeur: string | boolean,
): void {
  const c = chambres.value
  const ficheMaj = completerHorodatageAdmissionSiNecessaire(
    { ...c[salleId], [champ]: valeur },
    champ,
  )
  mettreAJourChambres({ ...c, [salleId]: ficheMaj })
}

function majOperation(
  salleId: SalleOperationId,
  champ: keyof FicheOperation,
  valeur: string,
): void {
  const c = chambres.value
  const operations = { ...c.operations, [salleId]: { ...c.operations[salleId], [champ]: valeur } }
  mettreAJourChambres({ ...c, operations })
}

function admissionHorodatage(salleId: SalleAvecLitsId, litId: LitId): string {
  return lireAdmission(chambres.value[salleId][litId].admission_medecin).date
}
function admissionMedecins(salleId: SalleAvecLitsId, litId: LitId): string {
  return lireAdmission(chambres.value[salleId][litId].admission_medecin).medecins
}
function admissionHorodatageSalleSimple(salleId: SalleSimpleId): string {
  return lireAdmission(chambres.value[salleId].admission_medecin).date
}
function admissionMedecinsSalleSimple(salleId: SalleSimpleId): string {
  return lireAdmission(chambres.value[salleId].admission_medecin).medecins
}

function majAdmissionMedecins(salleId: SalleAvecLitsId, litId: LitId, medecins: string): void {
  const courant = lireAdmission(chambres.value[salleId][litId].admission_medecin)
  majLit(salleId, litId, 'admission_medecin', ecrireAdmission(courant.date, medecins))
}
function majAdmissionMedecinsSalleSimple(salleId: SalleSimpleId, medecins: string): void {
  const courant = lireAdmission(chambres.value[salleId].admission_medecin)
  majSalleSimple(salleId, 'admission_medecin', ecrireAdmission(courant.date, medecins))
}

function couleurStatutChambre(statut: string): string {
  const cle = statut.trim()
  if (!cle) return ''
  return COULEURS_STATUTS_CHAMBRE[cle] ?? ''
}
function couleurStatutLit(salleId: SalleAvecLitsId, litId: LitId): string {
  return couleurStatutChambre(chambres.value[salleId][litId].statut)
}
function couleurStatutSalleSimple(salleId: SalleSimpleId): string {
  return couleurStatutChambre(chambres.value[salleId].statut)
}

function viderLit(salleId: SalleAvecLitsId, litId: LitId): void {
  const c = chambres.value
  mettreAJourChambres({ ...c, [salleId]: { ...c[salleId], [litId]: ficheChambreVide() } })
}
function viderSalleSimple(salleId: SalleSimpleId): void {
  const c = chambres.value
  mettreAJourChambres({ ...c, [salleId]: ficheChambreVide() })
}
function viderSalleOperation(salleId: SalleOperationId): void {
  const c = chambres.value
  mettreAJourChambres({ ...c, operations: { ...c.operations, [salleId]: ficheOperationVide() } })
}

function litRempli(salleId: SalleAvecLitsId, litId: LitId): boolean {
  return estFicheChambreRemplie(chambres.value[salleId][litId])
}
function salleSimpleRemplie(salleId: SalleSimpleId): boolean {
  return estFicheChambreRemplie(chambres.value[salleId])
}
function salleOperationRemplie(salleId: SalleOperationId): boolean {
  return estFicheOperationRemplie(chambres.value.operations[salleId])
}
</script>

<template>
  <div class="chambres-page">
    <!-- Section 1 – Emergency Room (3 lits) + Josiah Room (3 lits) -->
    <section class="sheet-block">
      <div
        class="sheet-grid"
        style="grid-template-columns: max-content repeat(6, minmax(130px, 1fr))"
      >
        <div class="corner-cell corner-cell--double" aria-hidden="true"></div>
        <div class="group-head" style="grid-column: span 3">Emergency Room</div>
        <div class="group-head" style="grid-column: span 3">Josiah Room</div>

        <template v-for="salle in [sallesAvecLits[0]!, sallesAvecLits[1]!]" :key="salle.id">
          <div v-for="lit in salle.lits" :key="lit.id" class="column-head">
            <span>{{ lit.label }}</span>
            <button
              v-if="litRempli(salle.id, lit.id)"
              class="btn-clear"
              type="button"
              @click="viderLit(salle.id, lit.id)"
            >
              ✕
            </button>
          </div>
        </template>

        <!-- Patient -->
        <div class="row-label">Patient (Nom Prénom)</div>
        <template
          v-for="salle in [sallesAvecLits[0]!, sallesAvecLits[1]!]"
          :key="'pat-' + salle.id"
        >
          <div
            v-for="lit in salle.lits"
            :key="lit.id"
            class="sheet-cell chambre-tone"
            :style="{ '--chambre-couleur': couleurStatutLit(salle.id, lit.id) }"
          >
            <input
              type="text"
              :value="chambres[salle.id][lit.id].patient"
              @blur="majLit(salle.id, lit.id, 'patient', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </template>

        <!-- Admission / Médecin(s) -->
        <div class="row-label">Date d'admission / Médecin(s)</div>
        <template
          v-for="salle in [sallesAvecLits[0]!, sallesAvecLits[1]!]"
          :key="'adm-' + salle.id"
        >
          <div
            v-for="lit in salle.lits"
            :key="lit.id"
            class="sheet-cell chambre-tone"
            :style="{ '--chambre-couleur': couleurStatutLit(salle.id, lit.id) }"
          >
            <div class="admission-split">
              <div class="admission-block admission-block--stamp">
                <input
                  class="stamp-input"
                  type="text"
                  readonly
                  :value="admissionHorodatage(salle.id, lit.id)"
                />
              </div>
              <div class="admission-block">
                <input
                  type="text"
                  placeholder="Médecin(s)"
                  :value="admissionMedecins(salle.id, lit.id)"
                  @blur="
                    majAdmissionMedecins(
                      salle.id,
                      lit.id,
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </div>
            </div>
          </div>
        </template>

        <!-- Type de prise en charge -->
        <div class="row-label">Type de prise en charge</div>
        <template
          v-for="salle in [sallesAvecLits[0]!, sallesAvecLits[1]!]"
          :key="'typ-' + salle.id"
        >
          <div
            v-for="lit in salle.lits"
            :key="lit.id"
            class="sheet-cell chambre-tone"
            :style="{ '--chambre-couleur': couleurStatutLit(salle.id, lit.id) }"
          >
            <input
              type="text"
              :value="chambres[salle.id][lit.id].type_prise_en_charge"
              @blur="
                majLit(
                  salle.id,
                  lit.id,
                  'type_prise_en_charge',
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
          </div>
        </template>

        <!-- FdO / Soins -->
        <div class="row-label">FdO / Soins</div>
        <template
          v-for="salle in [sallesAvecLits[0]!, sallesAvecLits[1]!]"
          :key="'fdo-' + salle.id"
        >
          <div
            v-for="lit in salle.lits"
            :key="lit.id"
            class="sheet-cell chambre-tone"
            :style="{ '--chambre-couleur': couleurStatutLit(salle.id, lit.id) }"
          >
            <div class="checks">
              <div
                class="check-block"
                :class="{ 'check-block--fdo': chambres[salle.id][lit.id].fdo }"
              >
                <input
                  type="checkbox"
                  :checked="chambres[salle.id][lit.id].fdo"
                  @change="
                    majLit(salle.id, lit.id, 'fdo', ($event.target as HTMLInputElement).checked)
                  "
                />
              </div>
              <div
                class="check-block"
                :class="{
                  'check-block--soins-ok': chambres[salle.id][lit.id].soins,
                  'check-block--soins-alert':
                    !chambres[salle.id][lit.id].soins && !!chambres[salle.id][lit.id].patient,
                }"
              >
                <input
                  type="checkbox"
                  :checked="chambres[salle.id][lit.id].soins"
                  @change="
                    majLit(salle.id, lit.id, 'soins', ($event.target as HTMLInputElement).checked)
                  "
                />
              </div>
            </div>
          </div>
        </template>

        <!-- Statut -->
        <div class="row-label">Statut</div>
        <template
          v-for="salle in [sallesAvecLits[0]!, sallesAvecLits[1]!]"
          :key="'sta-' + salle.id"
        >
          <div
            v-for="lit in salle.lits"
            :key="lit.id"
            class="sheet-cell chambre-tone"
            :style="{ '--chambre-couleur': couleurStatutLit(salle.id, lit.id) }"
          >
            <select
              class="statut-chambre-select"
              :value="chambres[salle.id][lit.id].statut"
              :style="{ '--statut-couleur': couleurStatutLit(salle.id, lit.id) }"
              @change="
                majLit(salle.id, lit.id, 'statut', ($event.target as HTMLSelectElement).value)
              "
            >
              <option value="">—</option>
              <option v-for="s in statutsChambre" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </template>
      </div>
    </section>

    <!-- Section 2 – Chiliad Room (3 lits) + Gordo Room + San Chianki Room -->
    <section class="sheet-block">
      <div
        class="sheet-grid"
        style="grid-template-columns: max-content repeat(5, minmax(130px, 1fr))"
      >
        <div class="corner-cell corner-cell--double" aria-hidden="true"></div>
        <div class="group-head" style="grid-column: span 3">Chiliad Room</div>
        <div class="corner-cell" style="grid-column: span 2" aria-hidden="true"></div>

        <!-- Column headers: 3 lits Chiliad + 2 salles simples -->
        <div v-for="lit in sallesAvecLits[2]!.lits" :key="lit.id" class="column-head">
          <span>{{ lit.label }}</span>
          <button
            v-if="litRempli('chiliad_room', lit.id)"
            class="btn-clear"
            type="button"
            @click="viderLit('chiliad_room', lit.id)"
          >
            ✕
          </button>
        </div>
        <div v-for="salle in sallesSimples" :key="salle.id" class="column-head">
          <span>{{ salle.label }}</span>
          <button
            v-if="salleSimpleRemplie(salle.id)"
            class="btn-clear"
            type="button"
            @click="viderSalleSimple(salle.id)"
          >
            ✕
          </button>
        </div>

        <!-- Patient -->
        <div class="row-label">Patient (Nom Prénom)</div>
        <div
          v-for="lit in sallesAvecLits[2]!.lits"
          :key="'pat-ch-' + lit.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutLit('chiliad_room', lit.id) }"
        >
          <input
            type="text"
            :value="chambres.chiliad_room[lit.id].patient"
            @blur="
              majLit('chiliad_room', lit.id, 'patient', ($event.target as HTMLInputElement).value)
            "
          />
        </div>
        <div
          v-for="salle in sallesSimples"
          :key="'pat-ss-' + salle.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutSalleSimple(salle.id) }"
        >
          <input
            type="text"
            :value="chambres[salle.id].patient"
            @blur="majSalleSimple(salle.id, 'patient', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <!-- Admission / Médecin(s) -->
        <div class="row-label">Date d'admission / Médecin(s)</div>
        <div
          v-for="lit in sallesAvecLits[2]!.lits"
          :key="'adm-ch-' + lit.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutLit('chiliad_room', lit.id) }"
        >
          <div class="admission-split">
            <div class="admission-block admission-block--stamp">
              <input
                class="stamp-input"
                type="text"
                readonly
                :value="admissionHorodatage('chiliad_room', lit.id)"
              />
            </div>
            <div class="admission-block">
              <input
                type="text"
                placeholder="Médecin(s)"
                :value="admissionMedecins('chiliad_room', lit.id)"
                @blur="
                  majAdmissionMedecins(
                    'chiliad_room',
                    lit.id,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </div>
          </div>
        </div>
        <div
          v-for="salle in sallesSimples"
          :key="'adm-ss-' + salle.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutSalleSimple(salle.id) }"
        >
          <div class="admission-split">
            <div class="admission-block admission-block--stamp">
              <input
                class="stamp-input"
                type="text"
                readonly
                :value="admissionHorodatageSalleSimple(salle.id)"
              />
            </div>
            <div class="admission-block">
              <input
                type="text"
                placeholder="Médecin(s)"
                :value="admissionMedecinsSalleSimple(salle.id)"
                @blur="
                  majAdmissionMedecinsSalleSimple(
                    salle.id,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </div>
          </div>
        </div>

        <!-- Type de prise en charge -->
        <div class="row-label">Type de prise en charge</div>
        <div
          v-for="lit in sallesAvecLits[2]!.lits"
          :key="'typ-ch-' + lit.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutLit('chiliad_room', lit.id) }"
        >
          <input
            type="text"
            :value="chambres.chiliad_room[lit.id].type_prise_en_charge"
            @blur="
              majLit(
                'chiliad_room',
                lit.id,
                'type_prise_en_charge',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </div>
        <div
          v-for="salle in sallesSimples"
          :key="'typ-ss-' + salle.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutSalleSimple(salle.id) }"
        >
          <input
            type="text"
            :value="chambres[salle.id].type_prise_en_charge"
            @blur="
              majSalleSimple(
                salle.id,
                'type_prise_en_charge',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </div>

        <!-- FdO / Soins -->
        <div class="row-label">FdO / Soins</div>
        <div
          v-for="lit in sallesAvecLits[2]!.lits"
          :key="'fdo-ch-' + lit.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutLit('chiliad_room', lit.id) }"
        >
          <div class="checks">
            <div
              class="check-block"
              :class="{ 'check-block--fdo': chambres.chiliad_room[lit.id].fdo }"
            >
              <input
                type="checkbox"
                :checked="chambres.chiliad_room[lit.id].fdo"
                @change="
                  majLit('chiliad_room', lit.id, 'fdo', ($event.target as HTMLInputElement).checked)
                "
              />
            </div>
            <div
              class="check-block"
              :class="{
                'check-block--soins-ok': chambres.chiliad_room[lit.id].soins,
                'check-block--soins-alert':
                  !chambres.chiliad_room[lit.id].soins && !!chambres.chiliad_room[lit.id].patient,
              }"
            >
              <input
                type="checkbox"
                :checked="chambres.chiliad_room[lit.id].soins"
                @change="
                  majLit(
                    'chiliad_room',
                    lit.id,
                    'soins',
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
            </div>
          </div>
        </div>
        <div
          v-for="salle in sallesSimples"
          :key="'fdo-ss-' + salle.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutSalleSimple(salle.id) }"
        >
          <div class="checks">
            <div class="check-block" :class="{ 'check-block--fdo': chambres[salle.id].fdo }">
              <input
                type="checkbox"
                :checked="chambres[salle.id].fdo"
                @change="
                  majSalleSimple(salle.id, 'fdo', ($event.target as HTMLInputElement).checked)
                "
              />
            </div>
            <div
              class="check-block"
              :class="{
                'check-block--soins-ok': chambres[salle.id].soins,
                'check-block--soins-alert':
                  !chambres[salle.id].soins && !!chambres[salle.id].patient,
              }"
            >
              <input
                type="checkbox"
                :checked="chambres[salle.id].soins"
                @change="
                  majSalleSimple(salle.id, 'soins', ($event.target as HTMLInputElement).checked)
                "
              />
            </div>
          </div>
        </div>

        <!-- Statut -->
        <div class="row-label">Statut</div>
        <div
          v-for="lit in sallesAvecLits[2]!.lits"
          :key="'sta-ch-' + lit.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutLit('chiliad_room', lit.id) }"
        >
          <select
            class="statut-chambre-select"
            :value="chambres.chiliad_room[lit.id].statut"
            :style="{ '--statut-couleur': couleurStatutLit('chiliad_room', lit.id) }"
            @change="
              majLit('chiliad_room', lit.id, 'statut', ($event.target as HTMLSelectElement).value)
            "
          >
            <option value="">—</option>
            <option v-for="s in statutsChambre" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div
          v-for="salle in sallesSimples"
          :key="'sta-ss-' + salle.id"
          class="sheet-cell chambre-tone"
          :style="{ '--chambre-couleur': couleurStatutSalleSimple(salle.id) }"
        >
          <select
            class="statut-chambre-select"
            :value="chambres[salle.id].statut"
            :style="{ '--statut-couleur': couleurStatutSalleSimple(salle.id) }"
            @change="majSalleSimple(salle.id, 'statut', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option v-for="s in statutsChambre" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>
    </section>

    <!-- Section 3 – Salles d'opération -->
    <section class="sheet-block">
      <div
        class="sheet-grid sheet-grid--ops"
        style="grid-template-columns: max-content repeat(3, minmax(130px, 1fr))"
      >
        <div class="corner-cell" aria-hidden="true"></div>
        <div v-for="op in sallesOperation" :key="op.id" class="column-head column-head--top">
          <span>{{ op.label }}</span>
          <button
            v-if="salleOperationRemplie(op.id)"
            class="btn-clear"
            type="button"
            @click="viderSalleOperation(op.id)"
          >
            ✕
          </button>
        </div>

        <!-- Patient -->
        <div class="row-label">Patient</div>
        <div v-for="op in sallesOperation" :key="'pat-op-' + op.id" class="sheet-cell">
          <input
            type="text"
            :value="chambres.operations[op.id].patient"
            @blur="majOperation(op.id, 'patient', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <!-- Médecins -->
        <div class="row-label">Médecins</div>
        <div v-for="op in sallesOperation" :key="'med-op-' + op.id" class="sheet-cell">
          <input
            type="text"
            :value="chambres.operations[op.id].medecins"
            @blur="majOperation(op.id, 'medecins', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <!-- Statut -->
        <div class="row-label">Statut</div>
        <div v-for="op in sallesOperation" :key="'sta-op-' + op.id" class="sheet-cell">
          <select
            :value="chambres.operations[op.id].statut"
            @change="majOperation(op.id, 'statut', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option v-for="s in statutsOperation" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <!-- Description -->
        <div class="row-label">Description</div>
        <div v-for="op in sallesOperation" :key="'desc-op-' + op.id" class="sheet-cell">
          <textarea
            rows="2"
            :value="chambres.operations[op.id].description"
            @blur="majOperation(op.id, 'description', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.chambres-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 0.45rem;
  gap: 0.5rem;
  animation: fadeIn 0.28s ease;
}

/* ── Sheet block ─────────────────────────────── */
.sheet-block {
  overflow-x: auto;
  border: 1px solid var(--dispatch-zone-border);
  border-radius: 8px;
  background: var(--dispatch-zone-bg);
  box-shadow:
    0 2px 8px var(--theme-shadow-soft),
    0 0 0 1px var(--dispatch-card-border);
}

.sheet-grid {
  display: grid;
  width: max-content;
  min-width: 100%;
}

/* ── Header / label cells ────────────────────── */
.corner-cell,
.group-head,
.column-head,
.row-label,
.sheet-cell {
  min-height: 36px;
  box-sizing: border-box;
  font-size: 0.71rem;
  color: var(--text-primary);
}

.corner-cell {
  border: 0;
  background: transparent;
}

.corner-cell--double {
  grid-row: span 2;
}

.group-head,
.column-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.38rem 0.85rem;
  border: 1px solid var(--dispatch-zone-border);
  background: var(--dispatch-col-header);
  color: var(--dispatch-col-header-text);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  box-shadow: 0 2px 6px var(--theme-shadow-medium);
}

.row-label {
  display: flex;
  align-items: center;
  padding: 0.28rem 0.55rem;
  border: 1px solid var(--dispatch-card-border);
  background: color-mix(in srgb, var(--dispatch-card-bg) 86%, black 14%);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: var(--text-secondary);
}

/* ── Data cells ──────────────────────────────── */
.sheet-cell {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--dispatch-card-border);
  background: var(--dispatch-card-bg);
  padding: 0.22rem 0.28rem;
}

.chambre-tone {
  border-color: color-mix(
    in srgb,
    var(--chambre-couleur, transparent) 45%,
    var(--dispatch-card-border) 55%
  );
  background: color-mix(
    in srgb,
    var(--chambre-couleur, transparent) 18%,
    var(--dispatch-card-bg) 82%
  );
}

/* ── Inputs / selects ────────────────────────── */
input,
select,
textarea {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.68rem;
  padding: 0.14rem 0.2rem;
  box-sizing: border-box;
  outline: none;
}

select {
  background: color-mix(in srgb, var(--dispatch-card-bg) 88%, black 12%);
}

select option {
  background: var(--surface-elevated);
  color: var(--text-primary);
}

input:focus,
select:focus,
textarea:focus {
  border: 1px solid var(--accent);
  background: var(--accent-subtle);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}

/* ── Admission split ─────────────────────────── */
.admission-split {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: stretch;
  width: calc(100% + 0.56rem);
  margin: -0.22rem -0.28rem;
}

.admission-block {
  min-height: 30px;
  display: flex;
  align-items: center;

  &:first-child {
    border-right: 1px solid var(--dispatch-card-border);
    background: color-mix(in srgb, var(--dispatch-card-bg) 92%, black 8%);
  }

  input {
    border: 0;
    border-radius: 0;
    min-height: 30px;
    padding: 0.18rem 0.24rem;
  }
}

.chambre-tone .admission-block:first-child {
  border-right-color: color-mix(
    in srgb,
    var(--chambre-couleur, transparent) 45%,
    var(--dispatch-zone-border) 55%
  );
  background: color-mix(
    in srgb,
    var(--chambre-couleur, transparent) 18%,
    var(--dispatch-card-bg) 82%
  );
}

.admission-block--stamp {
  justify-content: center;
  padding: 0.18rem 0.24rem;
  white-space: nowrap;
}

.stamp-input {
  text-align: center;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
}

.stamp-input:focus {
  border: 0;
  background: transparent;
}

/* ── Checks (FdO / Soins) ───────────────────── */
.checks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: stretch;
  width: calc(100% + 0.56rem);
  margin: -0.22rem -0.28rem;

  .check-block {
    min-height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:first-child {
      border-right: 1px solid color-mix(in srgb, var(--dispatch-zone-border) 76%, transparent 24%);
    }
  }

  input[type='checkbox'] {
    width: auto;
    margin: 0;
    accent-color: var(--accent);
  }

  .check-block--fdo {
    background-color: rgba(239, 68, 68, 0.55);
    box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.8);
  }

  .check-block--soins-ok {
    background-color: rgba(34, 197, 94, 0.5);
    box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.8);
  }

  .check-block--soins-alert {
    background-color: rgba(239, 68, 68, 0.55);
    box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.8);
  }
}

.chambre-tone .checks .check-block:first-child {
  border-right-color: color-mix(
    in srgb,
    var(--chambre-couleur, transparent) 42%,
    var(--dispatch-zone-border) 58%
  );
}

/* ── Statut select ───────────────────────────── */
.statut-chambre-select {
  --statut-couleur: #d3d6dc;
  border-left: 0;
  font-weight: 700;
}

/* ── Clear button ────────────────────────────── */
.btn-clear {
  margin-left: 0.22rem;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
  color: var(--dispatch-col-header-text);
  font-size: 0.64rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  vertical-align: middle;

  &:hover {
    background: rgba(239, 68, 68, 0.22);
    border-color: rgba(239, 68, 68, 0.5);
  }
}

/* ── Responsive ──────────────────────────────── */
@media (max-width: 860px) {
  .chambres-page {
    padding: 0.45rem;
  }

  .sheet-grid {
    min-width: max-content;
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
</style>
