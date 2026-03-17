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

export const RH_CHECKLISTS: RhChecklist[] = [
  {
    id: 'hiring',
    title: 'Embauche',
    icon: '➕',
    steps: [
      { header: "Avant l'embauche" },
      "Valider la candidature de l'agent",
      { header: 'Contrat' },
      "Récupérer l'extrait de casier judiciaire vierge de la personne et le placer dans son dossier",
      "Vérifier que la personne a bien fait sa Visite Médicale au BCES (Si non, l'envoyer la faire)",
      'Faire un rappel sur le cursus de formation',
      { header: 'Embauche' },
      "Engager et donner le badge (nécessite une feuille de papier). La recrue doit l'accepter.",
      "Vérifier l'accès à la messagerie entreprise (Si besoin, dites-lui de faire une sieste)",
      {
        text: 'Envoyer par mail l\'accès à l\'intranet "Service public"',
        link: { text: 'Lien intranet', url: 'https://discord.gg/nU2MsMqrZR' },
      },
      'Lui faire changer son nom sur l\'intranet "Service public"',
      {
        text: 'Faire signer le contrat dans le canal',
        link: {
          text: 'Contrat',
          url: 'https://discord.com/channels/751385237220491295/1151555485141573804',
        },
      },
      'Faire le message de bienvenu dans "🗂️Promotion - Formation"',
      { header: 'Accès Intranet de la ville' },
      {
        text: "Ouvrir le profil de l'agent & donner les accès de lecture à 21 Cloud et tous les accès aux rapports médicaux",
        link: {
          text: 'Intranet',
          url: 'https://intra.21jumpclick.fr/enterprise/modules/user',
        },
      },
      {
        text: 'Attribuer le rôle "Basique" & le rang "Interne" à l\'agent (pour donner le salaire)',
        link: { text: 'Intranet', url: 'https://intra.21jumpclick.fr/enterprise/members' },
      },
      { header: 'Accès tous les Documents' },
      'Demander l\'adresse mail de la personne (format "gmail.com")',
      {
        text: "Faire créer un compte LSES-Inventory à l'agent",
        link: { text: 'LSES-Inventory', url: 'https://lses-inventory.web.app/login' },
      },
      {
        text: 'Aller dans "21-LSES-Interne-Résident-Médecin" et ajouter l\'adresse mail (accès ancien dispatch).',
        link: {
          text: 'Groupes',
          url: 'https://groups.google.com/g/21-lses-interne-resident-medecin/members',
        },
      },
      {
        text: 'Donner le lien du dispatch',
        link: { text: 'Dispatch', url: 'https://lses-inventory.web.app/dispatch' },
      },
      {
        text: "Donner le lien de l'ancien dispatch (au cas où)",
        link: {
          text: 'Dispatch',
          url: 'https://docs.google.com/spreadsheets/d/1Vho76MbebIo4d1RgpVL0wGFqbMjeK1e3HcirZV_C7Uk/edit?gid=180456797#gid=180456797',
        },
      },
      { header: 'Mettre à jour tous les documents RH' },
      {
        link: {
          text: 'Trombinoscope',
          url: 'https://www.canva.com/design/DAGzQCSaqAY/ASNs1-k_xRGAXdlg_oL1xw/edit',
        },
      },
      {
        link: {
          text: 'Annuaire',
          url: 'https://www.canva.com/design/DAGzivD6iCM/IAypIsutJJhUXMjhxitILw/edit',
        },
      },
    ],
  },
  {
    id: 'promotion',
    title: 'Promotion',
    icon: '⬆️',
    steps: [
      { header: 'Résident' },
      'Demander à un membre de la direction de lui mettre le grade discord et vérifier les accès',
      'Écrire le message de promotion',
      'Mettre à jour le suivi effectif (ne pas oublier la date de signature du CDI)',
      {
        text: "Modifier le trombinoscope et l'envoyer dans LSES Infos",
        link: {
          text: 'Trombinoscope',
          url: 'https://www.canva.com/design/DAGzQCSaqAY/ASNs1-k_xRGAXdlg_oL1xw/edit',
        },
      },
      {
        text: "Modifier l'annuaire et l'envoyer dans LSES Infos",
        link: {
          text: 'Annuaire',
          url: 'https://www.canva.com/design/DAGzivD6iCM/IAypIsutJJhUXMjhxitILw/edit',
        },
      },
      'Màj salaire intra 21',
      { header: 'Titulaire' },
      'Écrire le message de promotion',
      'Mettre à jour le suivi effectif',
      'Màj salaire intra 21',
      { header: 'Spécialiste' },
      'Écrire le message de promotion',
      'Mettre à jour le suivi effectif',
      {
        text: "Modifier le trombinoscope et l'envoyer dans LSES Infos",
        link: {
          text: 'Trombinoscope',
          url: 'https://www.canva.com/design/DAGzQCSaqAY/ASNs1-k_xRGAXdlg_oL1xw/edit',
        },
      },
      {
        text: "Modifier l'annuaire et l'envoyer dans LSES Infos",
        link: {
          text: 'Annuaire',
          url: 'https://www.canva.com/design/DAGzivD6iCM/IAypIsutJJhUXMjhxitILw/edit',
        },
      },
      "Mettre à jour le grade dans l'intranet discord et vérifier les accès",
      {
        text: 'L\'ajouter au groupe "Pôles - 21-LSES-Specialités"',
        link: {
          text: 'Groupe 21',
          url: 'https://groups.google.com/u/3/g/21-lses-spe/members',
        },
      },
      "L'ajouter au groupe du pôle s'il existe",
      'Màj salaire intra 21',
      { header: 'Responsable de service' },
      'Expliquer le canal "Commission-médecins" et les attentes qu\'on a d\'un responsable de service',
      'Écrire le message de promotion',
      'Mettre à jour le suivi effectif',
      {
        text: "Modifier le trombinoscope et l'envoyer dans LSES Infos",
        link: {
          text: 'Trombinoscope',
          url: 'https://www.canva.com/design/DAGzQCSaqAY/ASNs1-k_xRGAXdlg_oL1xw/edit',
        },
      },
      {
        text: "Modifier l'annuaire et l'envoyer dans LSES Infos",
        link: {
          text: 'Annuaire',
          url: 'https://www.canva.com/design/DAGzivD6iCM/IAypIsutJJhUXMjhxitILw/edit',
        },
      },
      "Vérifier les accès et les rôles sur l'intranet Discord",
      'Màj salaire intra 21',
    ],
  },
  {
    id: 'termination',
    title: 'Licenciement / Départ',
    icon: '➖',
    steps: [
      { header: 'Abandon de poste' },
      {
        text: 'Faire une copie du modèle de notification de licenciement',
        link: {
          text: 'Modèle',
          url: 'https://drive.google.com/drive/u/0/folders/1zPfTt7ER2cfO_5gZGjX18xn4ihYRL0hP',
        },
      },
      "Modifier la copie avec les informations de l'agent et les raisons du licenciement",
      'Passer le document en format PDF & supprimer la version éditable',
      "Envoyer le document à l'agent (PDF) et le placer dans son dossier",
      {
        text: 'Le licencier via le module "employés" de l\'intra 21',
        link: { text: 'Intranet', url: 'https://intra.21jumpclick.fr/enterprise/members' },
      },
      { header: 'Licenciement' },
      {
        text: 'Faire une copie du modèle de notification de licenciement',
        link: {
          text: 'Modèle',
          url: 'https://drive.google.com/drive/u/0/folders/1zPfTt7ER2cfO_5gZGjX18xn4ihYRL0hP',
        },
      },
      "Modifier la copie avec les informations de l'agent et les raisons du licenciement",
      'Passer le document en format PDF & supprimer la version éditable',
      "Envoyer le document à l'agent (PDF) et le placer dans son dossier",
      "Le licencier via l'intranet 21, onglet employés (si non présent)",
      'Faire un message dans le canal RH et représentants employés (ou demander à un membre de la direction)',
      'Récupérer son badge et son matériel (si présent)',
      { header: 'Démission' },
      'Lui demander de faire un mail à la direction pour signaler sa démission',
      "Récupérer son matériel et le fouiller pour vérifier qu'il ne lui reste rien (faire le message dans matériel et stock)",
      "Le laisser mettre son message en discussion. S'il ne souhaite pas en faire, faire un message dans le canal RH et représentants employés",
      'Récupérer son badge',
      { header: 'Dans tous les cas' },
      'Penser à mettre la lettre dans le fil agent',
      {
        text: 'Mettre à jour les groupes',
        link: {
          text: 'Groupe Google',
          url: 'https://groups.google.com/g/21-lses-interne-resident-medecin/members',
        },
      },
      'Clôturer son fil de formation (si interne)',
      {
        text: "Modifier le trombinoscope et l'envoyer dans LSES Infos",
        link: {
          text: 'Trombinoscope',
          url: 'https://www.canva.com/design/DAGzQCSaqAY/ASNs1-k_xRGAXdlg_oL1xw/edit',
        },
      },
      {
        text: "Modifier l'annuaire et l'envoyer dans LSES Infos",
        link: {
          text: 'Annuaire',
          url: 'https://www.canva.com/design/DAGzivD6iCM/IAypIsutJJhUXMjhxitILw/edit',
        },
      },
      "Mettre à jour le LSES inventory (Supprimer l'employé)",
      {
        text: "Supprimer les réactions et la signature dans le canal 🌐-contrat sur l'intra discord",
        link: {
          text: 'Canal contrat',
          url: 'https://discord.com/channels/751385237220491295/1151555485141573804',
        },
      },
    ],
  },
];
