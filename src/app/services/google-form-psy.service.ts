const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzQ27eQvA0bAHxoirED6MrVb6sWakoHXKgnlkCFwkCzDIbZXeIhFyOto29ckX-UOhZX-A/exec';

export interface PsyFormRequest {
  _sheetRowNumber: number;
  createdAt: number;
  horodateur: string;
  patientName: string;
  patientPhone: string;
  specialty: string;
  category: string;
  availability: string;
  reason: string;
  notes: string;
}

export async function fetchPsyFormResponses(): Promise<PsyFormRequest[]> {
  const response = await fetch(SCRIPT_URL);
  if (!response.ok) throw new Error('Erreur lors de la récupération des réponses Google Forms Psy');

  const data = await response.json();
  const recentData = (data as Record<string, string>[]).slice(-15);

  return recentData.map((row) => {
    const horodateur = row['horodateur'];
    const createdAt = horodateur ? new Date(horodateur).getTime() : Date.now();

    return {
      _sheetRowNumber: Number(row['_sheetRowNumber']),
      createdAt,
      horodateur: horodateur || '',
      patientName: (row['patientName'] || '').trim(),
      patientPhone: (row['patientPhone'] || '').trim(),
      specialty: 'Psychologie',
      category: (row['category'] || '').trim(),
      availability: (row['availability'] || '').trim(),
      reason: (row['reason'] || '').trim(),
      notes: (row['notes'] || '').trim(),
    };
  });
}

export async function markPsyRowAsImported(rowNumber: number): Promise<void> {
  if (!rowNumber) return;
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'markImported', rowNumber }),
    });
  } catch (e) {
    console.warn('Impossible de marquer la ligne Psy comme importée dans Google Sheets', e);
  }
}
