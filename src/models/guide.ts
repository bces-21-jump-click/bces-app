export interface GuideStep {
  title: string
  content: string
}

export interface Guide {
  id: string
  title: string
  description: string
  steps: GuideStep[]
}
