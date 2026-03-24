const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwcOpU_adYSja6z6ioF4o-1qxwhepArMQavbtsa3NN_-_hHfLqWa1TB3Ww1gSkw4Mbo/exec'

export interface FormRequest {
  _sheetRowNumber: number
  createdAt: number
  horodateur: string
  patientName: string
  patientPhone: string
  specialty: string
  availability: string
  notes: string
  reason: string
  sheetComment: string
}

export async function fetchFormResponses(): Promise<FormRequest[]> {
  const response = await fetch(SCRIPT_URL)
  if (!response.ok) throw new Error('Erreur lors de la récupération des réponses Google Forms')

  const data = await response.json()
  const recentData = (data as Record<string, string>[]).slice(-15)

  return recentData.map((row) => {
    const horodateur = row['Horodateur']
    const createdAt = horodateur ? new Date(horodateur).getTime() : Date.now()

    return {
      _sheetRowNumber: Number(row['_sheetRowNumber']),
      createdAt,
      horodateur: horodateur || '',
      patientName: (row['Votre nom et prénom'] || '').trim(),
      patientPhone: String(row['Votre n° de téléphone'] || '').trim(),
      specialty: (row['Vous avez besoin de quel spécialiste ?'] || '').trim(),
      availability: (
        row[
          'Quelles sont vos disponibilités pour le RDV ?\nPréciser créneaux horaires et jours.'
        ] || ''
      ).trim(),
      notes: (row['Divers (préférence, information complémentaire, ...)'] || '').trim(),
      reason: (row['Pourquoi demandez-vous une consultation ?'] || '').trim(),
      sheetComment: (
        row[
          'sans couleur - Rendez-vous à effectuer\nJaune - Rendez-vous planifié\nVert - Rendez-vous effectué\nRouge - Rendez-vous annulé\n\n✏️ - Commentaire'
        ] || ''
      ).trim(),
    }
  })
}

export async function markRowAsImported(rowNumber: number): Promise<void> {
  if (!rowNumber) return
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'markImported', rowNumber }),
    })
  } catch (e) {
    console.warn('Impossible de marquer la ligne comme importée dans Google Sheets', e)
  }
}
