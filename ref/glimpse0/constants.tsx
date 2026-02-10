
// Import Phase from types to resolve usage in MOCK_EVENTS
import { Candidate, ClueDirection, Phase } from './types';

export const INITIAL_CANDIDATES: Candidate[] = [
  {
    id: '1',
    name: 'The Legend of Zelda: Skyward Sword',
    icon: 'https://picsum.photos/seed/zelda/100/100',
    totalScore: 92,
    isEliminated: false,
    breakdown: [
      { clueText: 'Cartoon Artstyle', scoreChange: 15, reason: 'Matches cell-shaded aesthetic perfectly.' },
      { clueText: 'Flying Island', scoreChange: 20, reason: 'Skyloft is a primary setting.' },
      { clueText: 'Motion Controls', scoreChange: 25, reason: 'Key gameplay mechanic.' }
    ],
    evidence: [
      { title: 'Skyloft Wiki', summary: 'A floating island above the clouds...', url: '#' },
      { title: 'Release Trailer 2011', summary: 'Shows Link jumping from the sky...', url: '#' }
    ]
  },
  {
    id: '2',
    name: 'Skies of Arcadia',
    icon: 'https://picsum.photos/seed/arcadia/100/100',
    totalScore: 85,
    isEliminated: false,
    breakdown: [
      { clueText: 'Airships', scoreChange: 20, reason: 'Pirate-themed sky exploration.' },
      { clueText: 'Turn-based', scoreChange: 10, reason: 'Strong match for RPG elements.' }
    ],
    evidence: [
      { title: 'Dreamcast Gems', summary: 'One of the best JRPGs on the platform...', url: '#' }
    ]
  },
  {
    id: '3',
    name: 'Bastion',
    icon: 'https://picsum.photos/seed/bastion/100/100',
    totalScore: 78,
    isEliminated: false,
    breakdown: [
      { clueText: 'Floating World', scoreChange: 15, reason: 'World builds as you walk.' },
      { clueText: 'Narrator', scoreChange: 10, reason: 'Iconic storytelling style.' }
    ],
    evidence: [
      { title: 'Supergiant Games Archive', summary: 'Developer insights on Bastion...', url: '#' }
    ]
  },
  {
    id: '4',
    name: 'BioShock Infinite',
    icon: 'https://picsum.photos/seed/bioshock/100/100',
    totalScore: 74,
    isEliminated: false,
    breakdown: [
      { clueText: 'Sky City', scoreChange: 20, reason: 'Columbia is exactly this.' },
      { clueText: 'Action', scoreChange: 5, reason: 'Fits the "vibrant colors" description.' }
    ],
    evidence: [
      { title: 'Columbia Tour', summary: 'A look at the floating city of Columbia...', url: '#' }
    ]
  },
  {
    id: '5',
    name: 'Genshin Impact',
    icon: 'https://picsum.photos/seed/genshin/100/100',
    totalScore: 68,
    isEliminated: false,
    breakdown: [
      { clueText: 'Anime Style', scoreChange: 15, reason: 'Highly consistent with query.' },
      { clueText: 'Exploration', scoreChange: 10, reason: 'Matches open-world vibes.' }
    ],
    evidence: [
      { title: 'Official Site', summary: 'Journey through Teyvat...', url: '#' }
    ]
  },
  { id: '6', name: 'Mario Galaxy', icon: 'https://picsum.photos/seed/mario/100/100', totalScore: 40, isEliminated: true, breakdown: [], evidence: [] },
  { id: '7', name: 'Star Fox', icon: 'https://picsum.photos/seed/starfox/100/100', totalScore: 30, isEliminated: true, breakdown: [], evidence: [] },
  { id: '8', name: 'No Mans Sky', icon: 'https://picsum.photos/seed/nms/100/100', totalScore: 25, isEliminated: true, breakdown: [], evidence: [] },
  { id: '9', name: 'Minecraft', icon: 'https://picsum.photos/seed/mc/100/100', totalScore: 10, isEliminated: true, breakdown: [], evidence: [] },
  { id: '10', name: 'DOOM', icon: 'https://picsum.photos/seed/doom/100/100', totalScore: 5, isEliminated: true, breakdown: [], evidence: [] },
];

export const MOCK_EVENTS = [
  { id: 'e1', title: 'Connecting to GameDB...', description: 'Initial search based on keywords: "Floating", "Airships", "Old school".', phase: Phase.SEARCHING },
  { id: 'e2', title: 'Scraping Forums...', description: 'Detected mentions on Reddit/r/tipofmyjoystick matching "Anime" style.', phase: Phase.SEARCHING },
  { id: 'e3', title: 'Applying Constraints...', description: 'Eliminating dark/gritty games. Focusing on bright color palettes.', phase: Phase.FILTERING },
  { id: 'e4', title: 'Cross-Referencing Memories...', description: 'Comparing your clues with 5,000+ game databases.', phase: Phase.FILTERING },
  { id: 'e5', title: 'AI Reasoning Engine...', description: 'Linking "Motion Controls" with Nintendo platform exclusivity.', phase: Phase.REASONING },
  { id: 'e6', title: 'Finalizing Candidates...', description: 'Top 5 games identified. Preparing Gacha drop!', phase: Phase.GACHA },
];
