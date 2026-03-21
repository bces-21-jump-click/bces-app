export interface RhChecklistStep {
  header?: string;
  text?: string;
  link?: { text: string; url: string };
}

export type RhChecklistItem = string | RhChecklistStep;

export interface RhChecklist {
  id: string;
  title: string;
  icon: string;
  steps: RhChecklistItem[];
}

export const RH_CHECKLISTS: RhChecklist[] = [];
