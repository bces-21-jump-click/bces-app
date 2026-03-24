import type { NavigationGuardWithThis } from 'vue-router'
import { authReady } from '@/composables/useAuth'
import { useUserStore } from '@/stores/user'

export const authGuard: NavigationGuardWithThis<undefined> = async (to) => {
  await authReady

  const userStore = useUserStore()

  if (!userStore.isLoggedIn) {
    return { path: '/connexion' }
  }

  const requiredPermissions = (to.meta.permissions as string[] | undefined) ?? []
  if (requiredPermissions.length === 0) {
    return true
  }

  const userPerms = userStore.profile?.permissions ?? []
  if (userPerms.includes('dev') || userPerms.includes('admin')) {
    return true
  }

  const hasPermission = requiredPermissions.some((p) => userPerms.includes(p))
  if (hasPermission) {
    return true
  }

  return { path: '/' }
}
