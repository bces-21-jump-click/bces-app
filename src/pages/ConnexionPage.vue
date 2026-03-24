<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import type { Profile } from '@/models/profile'

const router = useRouter()
const auth = useAuth()

const mode = ref<'connexion' | 'inscription'>('connexion')
const profileList = ref<Profile[]>([])
const nameList = ref<string[]>([])
const name = ref('')
const prenom = ref('')
const nom = ref('')
const motDePasse = ref('')
const confirmationMotDePasse = ref('')
const erreur = ref('')
const succes = ref('')
const chargement = ref(false)

async function chargerProfils(): Promise<void> {
  try {
    const profils = await auth.listerProfilsActifs()
    profileList.value = profils
    nameList.value = profils.map((p) => p.name)
  } catch (err) {
    erreur.value = extraireErreur(err)
  }
}

function extraireErreur(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Une erreur inattendue est survenue'
}

async function soumettre(): Promise<void> {
  if (mode.value === 'connexion') {
    await connexion()
  } else {
    await inscription()
  }
}

async function connexion(): Promise<void> {
  const selectedProfile = profileList.value.find((p) => p.name === name.value)
  if (!selectedProfile) {
    erreur.value = "Le profil sélectionné n'existe pas."
    return
  }
  if (!motDePasse.value.trim()) {
    erreur.value = 'Le mot de passe est requis.'
    return
  }

  chargement.value = true
  erreur.value = ''
  succes.value = ''
  try {
    await auth.connexion(name.value, motDePasse.value)
    await router.push('/')
  } catch {
    erreur.value = 'Echec de la connexion. Vérifiez votre mot de passe.'
  } finally {
    chargement.value = false
  }
}

async function inscription(): Promise<void> {
  if (!prenom.value.trim()) {
    erreur.value = 'Le prénom est requis.'
    return
  }
  if (!nom.value.trim()) {
    erreur.value = 'Le nom est requis.'
    return
  }
  if (!motDePasse.value.trim() || !confirmationMotDePasse.value.trim()) {
    erreur.value = 'Le mot de passe est requis.'
    return
  }
  if (motDePasse.value.length < 6) {
    erreur.value = 'Le mot de passe doit contenir au moins 6 caractères.'
    return
  }
  if (motDePasse.value !== confirmationMotDePasse.value) {
    erreur.value = 'Les mots de passe ne correspondent pas.'
    return
  }

  chargement.value = true
  erreur.value = ''
  succes.value = ''
  try {
    const detail = await auth.inscription(prenom.value, nom.value, motDePasse.value)
    succes.value = detail
    mode.value = 'connexion'
    motDePasse.value = ''
    confirmationMotDePasse.value = ''
    prenom.value = ''
    nom.value = ''
    await chargerProfils()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('email-already-in-use')) {
      erreur.value = 'Ce profil existe déjà.'
    } else {
      erreur.value = extraireErreur(err)
    }
  } finally {
    chargement.value = false
  }
}

onMounted(async () => {
  await auth.deconnexion()
  await chargerProfils()
})
</script>

<template>
  <div class="connexion-page">
    <div class="login-card auth-shell">
      <img src="/assets/images/logo.png" alt="BCES Logo" class="logo" />
      <h1>BCES</h1>

      <div v-if="erreur" class="erreur" role="alert" aria-live="polite">{{ erreur }}</div>
      <div v-if="succes" class="succes" role="status" aria-live="polite">{{ succes }}</div>

      <template v-if="mode === 'connexion'">
        <label for="champ-nom">
          Nom
          <select id="champ-nom" v-model="name">
            <option value="" disabled>Sélectionner un profil</option>
            <option v-for="n in nameList" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>

        <label for="champ-mdp-connexion">
          Mot de passe
          <input
            id="champ-mdp-connexion"
            v-model="motDePasse"
            type="password"
            placeholder="Mot de passe"
            autocomplete="current-password"
            @keydown.enter="soumettre"
          />
        </label>

        <div class="auth-actions">
          <button class="btn-primary" :disabled="chargement" @click="soumettre">
            {{ chargement ? 'Connexion...' : 'Se connecter' }}
          </button>
          <span class="auth-separator">ou</span>
          <button class="btn-link" type="button" @click="mode = 'inscription'">
            Demande d'accès
          </button>
        </div>
      </template>

      <template v-else>
        <label for="champ-prenom">
          Prénom [RP]
          <input id="champ-prenom" v-model="prenom" type="text" placeholder="Prénom" />
        </label>

        <label for="champ-nom-inscription">
          Nom [RP]
          <input id="champ-nom-inscription" v-model="nom" type="text" placeholder="Nom" />
        </label>

        <label for="champ-mdp-inscription">
          Mot de passe
          <input
            id="champ-mdp-inscription"
            v-model="motDePasse"
            type="password"
            placeholder="Mot de passe"
            autocomplete="new-password"
          />
        </label>

        <label for="champ-confirmation">
          Confirmer le mot de passe
          <input
            id="champ-confirmation"
            v-model="confirmationMotDePasse"
            type="password"
            placeholder="Confirmer le mot de passe"
            autocomplete="new-password"
            @keydown.enter="soumettre"
          />
        </label>

        <div class="auth-actions">
          <button class="btn-primary" :disabled="chargement" @click="soumettre">
            {{ chargement ? 'Envoi...' : "Demande d'accès" }}
          </button>
          <span class="auth-separator">ou</span>
          <button class="btn-link" type="button" @click="mode = 'connexion'">Se connecter</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.connexion-page {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  background: var(--bg) url('/assets/images/Bg.png') center / cover no-repeat;
}

.login-card {
  background: color-mix(in srgb, var(--card-bg) 90%, transparent 10%);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  padding: 2.25rem;
  width: 100%;
  max-width: 430px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  box-shadow: var(--shadow-lg);
  animation: scaleIn 0.25s ease;
}

.logo {
  height: 150px;
  object-fit: contain;
}

h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
}

.erreur {
  width: 100%;
  padding: 0.6rem 0.85rem;
  background: var(--danger-subtle);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 0.85rem;
  text-align: center;
}

.succes {
  width: 100%;
  padding: 0.6rem 0.85rem;
  background: var(--success-subtle);
  border: 1px solid color-mix(in srgb, var(--success) 35%, transparent 65%);
  border-radius: var(--radius-sm);
  color: var(--success);
  font-size: 0.85rem;
  text-align: center;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: 100%;
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;

  input,
  select {
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    color: var(--text-primary);
    font-size: 0.95rem;
    width: 100%;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-subtle);
      outline: none;
    }
  }
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.7rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.25rem;
  transition: all 0.2s;

  &:hover {
    background: var(--accent-hover);
  }

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.auth-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 0.4rem;
  margin-top: 0.25rem;
}

.auth-separator {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.btn-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.35rem 0.6rem;
  border-radius: var(--radius-sm);
  transition:
    color 0.2s,
    background 0.2s;

  &:hover {
    color: var(--accent);
    background: var(--accent-subtle);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 560px) {
  .connexion-page {
    padding: 0.9rem;
  }
  .login-card {
    padding: 1.4rem 1rem;
  }
}
</style>
