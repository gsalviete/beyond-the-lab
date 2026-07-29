export type Module = {
  id: number
  title: string
  topics: string[]
}

// Conteúdo em inglês por decisão editorial — é o vocabulário que a aluna vai
// encontrar no laboratório. Não traduzir.
export const modules: Module[] = [
  {
    id: 1,
    title: 'Introduction to Lab English',
    topics: [
      'Basic lab vocabulary',
      'Laboratory routine',
      'Equipment and materials',
      'Pronunciation of common scientific terms',
      'Everyday communication inside the lab',
    ],
  },
  {
    id: 2,
    title: 'Human Reproduction Basics',
    topics: [
      'Female and male reproductive system terminology',
      'Hormones and menstrual cycle vocabulary',
      'Common fertility-related terms',
    ],
  },
  {
    id: 3,
    title: 'Semen Analysis & Andrology',
    topics: [
      'Spermiogram vocabulary',
      'Sperm concentration, motility and morphology',
      'Sample collection and preparation',
      'Common expressions used in andrology labs',
    ],
  },
  {
    id: 4,
    title: 'Culture Media & Laboratory Environment',
    topics: [
      'Types of culture media',
      'Incubators and laboratory conditions',
      'pH, temperature and gas conditions',
      'Lab safety and quality control vocabulary',
    ],
  },
  {
    id: 5,
    title: 'Oocyte Retrieval & Handling',
    topics: [
      'Follicular aspiration vocabulary',
      'Oocyte identification',
      'Denudation process',
      'Communication during procedures',
    ],
  },
  {
    id: 6,
    title: 'Fertilization & Embryology Basics',
    topics: [
      'IVF and ICSI terminology',
      'Fertilization assessment',
      'Embryo development stages',
      'Embryo grading vocabulary',
    ],
  },
  {
    id: 7,
    title: 'Cryopreservation',
    topics: [
      'Vitrification and warming terminology',
      'Cryotop and cryostorage vocabulary',
      'Step-by-step communication during freezing procedures',
    ],
  },
  {
    id: 8,
    title: 'Communication in Reproductive Medicine',
    topics: [
      'Presenting yourself professionally',
      'Explaining laboratory procedures',
      'Asking and answering questions in English',
      'Common phrases used in international environments',
    ],
  },
  {
    id: 9,
    title: 'Introduction to Scientific Articles',
    topics: [
      'How scientific articles are structured',
      'Understanding abstracts and conclusions',
      'Scientific vocabulary essentials',
    ],
  },
  {
    id: 10,
    title: 'Reading Scientific Papers',
    topics: [
      'Embryology-related articles',
      'Andrology-related articles',
      'Interpreting results and discussions',
      'Learning how scientists communicate',
    ],
  },
  {
    id: 11,
    title: 'Discussion & Critical Thinking',
    topics: [
      'Expressing opinions in English',
      'Discussing scientific results',
      'Agreeing and disagreeing professionally',
      'Scientific conversation practice',
    ],
  },
  {
    id: 12,
    title: 'International Communication',
    topics: [
      'Congress and networking vocabulary',
      'Communicating with international professionals',
      'Scientific presentation basics',
      'Final interactive discussions with guest professionals',
    ],
  },
]

export default modules
