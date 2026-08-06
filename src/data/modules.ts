export type Idioma = 'en' | 'pt'

/** Um texto que existe nos dois idiomas do seletor da página de conteúdo. */
export type Bilingue = { en: string; pt: string }

export type Module = {
  id: number
  title: Bilingue
  topics: { en: string; pt: string }[]
}

// O `en` é o ORIGINAL e a fonte de verdade do conteúdo: é o vocabulário que a
// aluna vai encontrar no laboratório, e é dele que o `pt` deriva — nunca o
// contrário. (O comentário antigo dizia "não traduzir"; o que ele protegia era
// a existência do inglês, e ela segue intacta.)
//
// O `pt` é o que a página mostra por padrão, decisão editorial registrada em
// `IDIOMA_PADRAO`, no SyllabusPage: quem chega pela landing lê tudo em
// português até aqui, e doze títulos em inglês na primeira dobra filtram
// exatamente quem o curso quer atender. O inglês fica a um clique.
//
// ⚠️ RASCUNHO DE TRADUÇÃO — escrito por agente, pendente de revisão editorial.
// Os termos técnicos foram mantidos na forma consagrada do laboratório
// brasileiro (FIV, ICSI, espermograma, Cryotop, oócito), que é justamente a
// forma que a aluna já ouve na bancada. Ao revisar, apague esta nota.
export const modules: Module[] = [
  {
    id: 1,
    title: { en: 'Introduction to Lab English', pt: 'Introdução ao inglês de laboratório' },
    topics: [
      { en: 'Basic lab vocabulary', pt: 'Vocabulário básico de laboratório' },
      { en: 'Laboratory routine', pt: 'Rotina do laboratório' },
      { en: 'Equipment and materials', pt: 'Equipamentos e materiais' },
      {
        en: 'Pronunciation of common scientific terms',
        pt: 'Pronúncia de termos científicos comuns',
      },
      {
        en: 'Everyday communication inside the lab',
        pt: 'Comunicação do dia a dia dentro do laboratório',
      },
    ],
  },
  {
    id: 2,
    title: { en: 'Human Reproduction Basics', pt: 'Fundamentos da reprodução humana' },
    topics: [
      {
        en: 'Female and male reproductive system terminology',
        pt: 'Terminologia dos sistemas reprodutores feminino e masculino',
      },
      {
        en: 'Hormones and menstrual cycle vocabulary',
        pt: 'Vocabulário de hormônios e ciclo menstrual',
      },
      { en: 'Common fertility-related terms', pt: 'Termos comuns relacionados à fertilidade' },
    ],
  },
  {
    id: 3,
    title: { en: 'Semen Analysis & Andrology', pt: 'Análise seminal e andrologia' },
    topics: [
      { en: 'Spermiogram vocabulary', pt: 'Vocabulário do espermograma' },
      {
        en: 'Sperm concentration, motility and morphology',
        pt: 'Concentração, motilidade e morfologia espermática',
      },
      { en: 'Sample collection and preparation', pt: 'Coleta e preparo da amostra' },
      {
        en: 'Common expressions used in andrology labs',
        pt: 'Expressões comuns em laboratórios de andrologia',
      },
    ],
  },
  {
    id: 4,
    title: {
      en: 'Culture Media & Laboratory Environment',
      pt: 'Meios de cultura e ambiente de laboratório',
    },
    topics: [
      { en: 'Types of culture media', pt: 'Tipos de meio de cultura' },
      { en: 'Incubators and laboratory conditions', pt: 'Incubadoras e condições do laboratório' },
      { en: 'pH, temperature and gas conditions', pt: 'Condições de pH, temperatura e gases' },
      {
        en: 'Lab safety and quality control vocabulary',
        pt: 'Vocabulário de biossegurança e controle de qualidade',
      },
    ],
  },
  {
    id: 5,
    title: { en: 'Oocyte Retrieval & Handling', pt: 'Captação e manipulação de oócitos' },
    topics: [
      { en: 'Follicular aspiration vocabulary', pt: 'Vocabulário da aspiração folicular' },
      { en: 'Oocyte identification', pt: 'Identificação de oócitos' },
      { en: 'Denudation process', pt: 'Processo de desnudação' },
      { en: 'Communication during procedures', pt: 'Comunicação durante os procedimentos' },
    ],
  },
  {
    id: 6,
    title: {
      en: 'Fertilization & Embryology Basics',
      pt: 'Fertilização e fundamentos de embriologia',
    },
    topics: [
      { en: 'IVF and ICSI terminology', pt: 'Terminologia de FIV e ICSI' },
      { en: 'Fertilization assessment', pt: 'Avaliação da fertilização' },
      { en: 'Embryo development stages', pt: 'Estágios do desenvolvimento embrionário' },
      { en: 'Embryo grading vocabulary', pt: 'Vocabulário de classificação embrionária' },
    ],
  },
  {
    id: 7,
    title: { en: 'Cryopreservation', pt: 'Criopreservação' },
    topics: [
      {
        en: 'Vitrification and warming terminology',
        pt: 'Terminologia de vitrificação e aquecimento',
      },
      {
        en: 'Cryotop and cryostorage vocabulary',
        pt: 'Vocabulário de Cryotop e armazenamento criogênico',
      },
      {
        en: 'Step-by-step communication during freezing procedures',
        pt: 'Comunicação passo a passo durante os procedimentos de congelamento',
      },
    ],
  },
  {
    id: 8,
    title: {
      en: 'Communication in Reproductive Medicine',
      pt: 'Comunicação em medicina reprodutiva',
    },
    topics: [
      { en: 'Presenting yourself professionally', pt: 'Apresentar-se profissionalmente' },
      { en: 'Explaining laboratory procedures', pt: 'Explicar procedimentos laboratoriais' },
      {
        en: 'Asking and answering questions in English',
        pt: 'Perguntar e responder perguntas em inglês',
      },
      {
        en: 'Common phrases used in international environments',
        pt: 'Frases comuns em ambientes internacionais',
      },
    ],
  },
  {
    id: 9,
    title: { en: 'Introduction to Scientific Articles', pt: 'Introdução aos artigos científicos' },
    topics: [
      {
        en: 'How scientific articles are structured',
        pt: 'Como um artigo científico é estruturado',
      },
      {
        en: 'Understanding abstracts and conclusions',
        pt: 'Entender abstracts e conclusões',
      },
      { en: 'Scientific vocabulary essentials', pt: 'Vocabulário científico essencial' },
    ],
  },
  {
    id: 10,
    title: { en: 'Reading Scientific Papers', pt: 'Leitura de artigos científicos' },
    topics: [
      { en: 'Embryology-related articles', pt: 'Artigos de embriologia' },
      { en: 'Andrology-related articles', pt: 'Artigos de andrologia' },
      {
        en: 'Interpreting results and discussions',
        pt: 'Interpretação de resultados e discussões',
      },
      { en: 'Learning how scientists communicate', pt: 'Como os cientistas se comunicam' },
    ],
  },
  {
    id: 11,
    title: { en: 'Discussion & Critical Thinking', pt: 'Discussão e pensamento crítico' },
    topics: [
      { en: 'Expressing opinions in English', pt: 'Expressar opiniões em inglês' },
      { en: 'Discussing scientific results', pt: 'Discutir resultados científicos' },
      { en: 'Agreeing and disagreeing professionally', pt: 'Concordar e discordar profissionalmente' },
      { en: 'Scientific conversation practice', pt: 'Prática de conversação científica' },
    ],
  },
  {
    id: 12,
    title: { en: 'International Communication', pt: 'Comunicação internacional' },
    topics: [
      { en: 'Congress and networking vocabulary', pt: 'Vocabulário de congressos e networking' },
      {
        en: 'Communicating with international professionals',
        pt: 'Comunicação com profissionais internacionais',
      },
      { en: 'Scientific presentation basics', pt: 'Fundamentos de apresentação científica' },
      {
        en: 'Final interactive discussions with guest professionals',
        pt: 'Discussões interativas finais com profissionais convidados',
      },
    ],
  },
]

export default modules
