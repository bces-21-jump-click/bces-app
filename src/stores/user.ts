import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Profile } from '@/models/profile'

export const useUserStore = defineStore('user', () => {
  const uid = ref<string | null>(null)
  const profile = ref<Profile | null>(null)
  const isLoggedIn = computed(() => profile.value !== null && profile.value.activated)

  const isAdmin = computed(() => {
    const perms = profile.value?.permissions ?? []
    return perms.includes('admin') || perms.includes('dev')
  })

  function hasPermission(permission: string): boolean {
    const perms = profile.value?.permissions ?? []
    if (perms.includes('admin') || perms.includes('dev')) return true
    return perms.includes(permission)
  }

  function $reset() {
    uid.value = null
    profile.value = null
  }

  return { uid, profile, isLoggedIn, isAdmin, hasPermission, $reset }
})
