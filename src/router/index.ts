import { createRouter, createWebHistory } from 'vue-router'
import { authGuard } from './authGuard'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/connexion',
      name: 'connexion',
      component: () => import('@/pages/ConnexionPage.vue'),
    },
    {
      path: '/',
      name: 'accueil',
      component: () => import('@/pages/AccueilPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: [] },
    },
    {
      path: '/dispatch',
      name: 'dispatch',
      component: () => import('@/pages/DispatchPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: [] },
    },
    {
      path: '/chambres',
      name: 'chambres',
      component: () => import('@/pages/ChambresPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: [] },
    },
    {
      path: '/morgue',
      name: 'morgue',
      component: () => import('@/pages/MorguePage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: [] },
    },
    {
      path: '/inventaire',
      name: 'inventaire',
      component: () => import('@/pages/InventairePage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['bces'] },
    },
    {
      path: '/commandes',
      name: 'commandes',
      component: () => import('@/pages/CommandesPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['bces'] },
    },
    {
      path: '/notes-frais',
      name: 'notes-frais',
      component: () => import('@/pages/NotesFraisPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['bces'] },
    },
    {
      path: '/garage',
      name: 'garage',
      component: () => import('@/pages/GaragePage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['bces'] },
    },
    {
      path: '/rapports-autopsie',
      name: 'rapports-autopsie',
      component: () => import('@/pages/RapportsAutopsiePage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['legist'] },
    },
    {
      path: '/autopsie',
      name: 'autopsie',
      component: () => import('@/pages/AutopsiePage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['legist'] },
    },
    {
      path: '/autopsie/:id',
      name: 'autopsie-detail',
      component: () => import('@/pages/AutopsiePage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['legist'] },
    },
    {
      path: '/stocks',
      name: 'stocks',
      component: () => import('@/pages/StocksPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['stock'] },
    },
    {
      path: '/rh',
      name: 'rh',
      component: () => import('@/pages/RhPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['rh'] },
    },
    {
      path: '/formation',
      name: 'formation',
      component: () => import('@/pages/FormationPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['trainer', 'restricted_trainer'] },
    },
    {
      path: '/utilisateurs',
      name: 'utilisateurs',
      component: () => import('@/pages/UtilisateursPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['user'] },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/pages/LogsPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['logs'] },
    },
    {
      path: '/rendez-vous',
      name: 'rendez-vous',
      component: () => import('@/pages/RendezVousPage.vue'),
      beforeEnter: authGuard,
      meta: { permissions: ['bces'] },
    },
    {
      path: '/maintenance',
      name: 'maintenance',
      component: () => import('@/pages/MaintenancePage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
