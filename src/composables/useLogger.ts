import { useFirestore } from '@/composables/useFirestore'

/**
 * Composable de logging — enregistre les actions utilisateur
 * dans la collection Firestore `logs`.
 */
export function useLogger() {
  const { creer } = useFirestore()

  async function log(user: string, type: string, description: string): Promise<void> {
    const id = Date.now().toString()
    await creer('logs', { user, type, description }, id)
  }

  return { log }
}
