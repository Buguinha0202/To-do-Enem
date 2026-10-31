/**
 * dataService.js
 * Camada de persistência desacoplada (Padrão saas-ui + save-systems)
 * Persistência offline em localStorage com versionamento e backup atômico (.bak)
 */

const STORAGE_KEY = 'enem_sprint_state_v1';
const BACKUP_KEY = 'enem_sprint_state_bak';

const DEFAULT_TASKS = [
  {
    id: 'task-enem-1',
    dia: 'Dia 01 • Segunda',
    materia: 'Matemática',
    submateria: 'Matemática Básica & Funções',
    assunto: 'Razão, Proporção, Escalas e Porcentagem (Foco TRI)',
    horasEstimadas: 2.0,
    prioridade: 'alta',
    tipo: 'exercicios',
    concluida: true,
    concluidaEm: '2026-10-30T14:20:00.000Z'
  },
  {
    id: 'task-enem-2',
    dia: 'Dia 01 • Segunda',
    materia: 'Natureza',
    submateria: 'Biologia',
    assunto: 'Ecologia: Ciclos Biogeoquímicos, Cadeias e Impactos Ambientais',
    horasEstimadas: 1.5,
    prioridade: 'alta',
    tipo: 'revisao',
    concluida: false,
    concluidaEm: null
  },
  {
    id: 'task-enem-3',
    dia: 'Dia 01 • Segunda',
    materia: 'Redação',
    submateria: 'Estrutura & Repertório',
    assunto: 'Redação Modelo ENEM + Revisão de Conectivos Interparágrafos',
    horasEstimadas: 1.5,
    prioridade: 'alta',
    tipo: 'redacao',
    concluida: false,
    concluidaEm: null
  },
  {
    id: 'task-enem-4',
    dia: 'Dia 02 • Terça',
    materia: 'Humanas',
    submateria: 'História do Brasil',
    assunto: 'Era Vargas, República Populista e Cidadania no Brasil',
    horasEstimadas: 1.5,
    prioridade: 'media',
    tipo: 'revisao',
    concluida: false,
    concluidaEm: null
  },
  {
    id: 'task-enem-5',
    dia: 'Dia 02 • Terça',
    materia: 'Natureza',
    submateria: 'Física',
    assunto: 'Eletrodinâmica: Associação de Resistores, Potência e Consumo (kWh)',
    horasEstimadas: 2.0,
    prioridade: 'alta',
    tipo: 'exercicios',
    concluida: false,
    concluidaEm: null
  },
  {
    id: 'task-enem-6',
    dia: 'Dia 02 • Terça',
    materia: 'Linguagens',
    submateria: 'Interpretação & Gêneros',
    assunto: 'Funções da Linguagem, Variação Linguística e Textos Publicitários',
    horasEstimadas: 1.0,
    prioridade: 'media',
    tipo: 'exercicios',
    concluida: false,
    concluidaEm: null
  },
  {
    id: 'task-enem-7',
    dia: 'Dia 03 • Quarta',
    materia: 'Matemática',
    submateria: 'Geometria & Estatística',
    assunto: 'Geometria Espacial (Cilindros/Prismas) + Média, Moda e Mediana',
    horasEstimadas: 2.5,
    prioridade: 'alta',
    tipo: 'exercicios',
    concluida: false,
    concluidaEm: null
  },
  {
    id: 'task-enem-8',
    dia: 'Dia 03 • Quarta',
    materia: 'Natureza',
    submateria: 'Química',
    assunto: 'Química Orgânica: Funções Orgânicas, Polaridade e Interações',
    horasEstimadas: 1.5,
    prioridade: 'alta',
    tipo: 'revisao',
    concluida: false,
    concluidaEm: null
  },
  {
    id: 'task-enem-9',
    dia: 'Dia 04 • Quinta',
    materia: 'Simulado',
    submateria: 'Prova Antiga Cronometrada',
    assunto: 'Mini-Simulado 45 Questões (Matemática + Natureza) + Correção de Lacunas',
    horasEstimadas: 3.0,
    prioridade: 'alta',
    tipo: 'simulado',
    concluida: false,
    concluidaEm: null
  }
];

const INITIAL_STATE = {
  version: 1,
  settings: {
    soundEnabled: true,
    groupByDay: true,
    examTarget: 'ENEM Reta Final',
    dailyGoalHours: 4.5
  },
  tasks: DEFAULT_TASKS
};

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
}

export const dataService = {
  /**
   * Carrega o estado salvo ou inicializa o padrão com fallback defensivo
   */
  async loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        await this.saveState(INITIAL_STATE, false);
        return structuredClone(INITIAL_STATE);
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tasks)) {
        throw new Error('Schema inválido');
      }
      return {
        version: 1,
        settings: { ...INITIAL_STATE.settings, ...(parsed.settings || {}) },
        tasks: parsed.tasks.map(t => this.normalizeTask(t))
      };
    } catch (err) {
      console.warn('Falha ao ler estado principal, tentando backup .bak:', err);
      const bak = localStorage.getItem(BACKUP_KEY);
      if (bak) {
        try {
          const parsedBak = JSON.parse(bak);
          if (parsedBak && Array.isArray(parsedBak.tasks)) {
            return parsedBak;
          }
        } catch (_) {
          // ignore
        }
      }
      return structuredClone(INITIAL_STATE);
    }
  },

  /**
   * Salva o estado no localStorage, opcionalmente criando snapshot .bak
   */
  async saveState(state, createBackup = false) {
    if (createBackup) {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) {
        localStorage.setItem(BACKUP_KEY, current);
      }
    }
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      settings: state.settings,
      tasks: state.tasks
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  },

  /**
   * Verifica se há um backup disponível para desfazer importação/limpeza
   */
  hasBackup() {
    return Boolean(localStorage.getItem(BACKUP_KEY));
  },

  /**
   * Restaura o último backup .bak
   */
  async restoreBackup() {
    const bak = localStorage.getItem(BACKUP_KEY);
    if (!bak) return null;
    const current = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, bak);
    if (current) {
      localStorage.setItem(BACKUP_KEY, current);
    }
    return this.loadState();
  },

  /**
   * Garante integridade de todos os campos de uma tarefa
   */
  normalizeTask(raw) {
    const horas = parseFloat(String(raw.horasEstimadas ?? raw.horas ?? raw.duration ?? 1).replace(',', '.'));
    const horasValidas = Number.isFinite(horas) && horas > 0 ? Math.min(Math.round(horas * 10) / 10, 24) : 1.0;

    const prioRaw = String(raw.prioridade || raw.priority || 'media').toLowerCase().trim();
    let prioridade = 'media';
    if (prioRaw.includes('alt') || prioRaw.includes('urg') || prioRaw.includes('high') || prioRaw === '1') {
      prioridade = 'alta';
    } else if (prioRaw.includes('baix') || prioRaw.includes('low') || prioRaw === '3') {
      prioridade = 'baixa';
    }

    const tipoRaw = String(raw.tipo || raw.type || 'estudo').toLowerCase().trim();
    let tipo = 'teoria';
    if (tipoRaw.includes('exerc') || tipoRaw.includes('quest') || tipoRaw.includes('prát') || tipoRaw.includes('prat')) {
      tipo = 'exercicios';
    } else if (tipoRaw.includes('rev')) {
      tipo = 'revisao';
    } else if (tipoRaw.includes('simu') || tipoRaw.includes('prov')) {
      tipo = 'simulado';
    } else if (tipoRaw.includes('reda')) {
      tipo = 'redacao';
    }

    return {
      id: raw.id || generateId(),
      dia: String(raw.dia || raw.data || raw.day || 'Geral').trim() || 'Geral',
      materia: this.normalizeArea(raw.materia || raw.area || raw.disciplina || 'Geral'),
      submateria: String(raw.submateria || raw.disciplinaEspecifica || raw.materiaOriginal || '').trim(),
      assunto: String(raw.assunto || raw.titulo || raw.topico || raw.tarefa || 'Bloco de Estudo').trim(),
      horasEstimadas: horasValidas,
      prioridade,
      tipo,
      concluida: Boolean(raw.concluida ?? raw.done ?? raw.completed ?? false),
      concluidaEm: raw.concluidaEm || null
    };
  },

  /**
   * Mapeia qualquer matéria do Ensino Médio/ENEM para as grandes áreas com cor semântica
   */
  normalizeArea(input) {
    const str = String(input || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (str.includes('mat') || str.includes('geometr') || str.includes('algebr') || str.includes('estatist')) {
      return 'Matemática';
    }
    if (
      str.includes('nat') ||
      str.includes('fisic') ||
      str.includes('quim') ||
      str.includes('biolog') ||
      str.includes('ecolog') ||
      str.includes('genet')
    ) {
      return 'Natureza';
    }
    if (
      str.includes('hum') ||
      str.includes('hist') ||
      str.includes('geog') ||
      str.includes('filos') ||
      str.includes('sociol') ||
      str.includes('atualid')
    ) {
      return 'Humanas';
    }
    if (
      str.includes('ling') ||
      str.includes('portug') ||
      str.includes('literat') ||
      str.includes('ingl') ||
      str.includes('espanh') ||
      str.includes('arte') ||
      str.includes('gramat')
    ) {
      return 'Linguagens';
    }
    if (str.includes('reda') || str.includes('dissert') || str.includes('repertor')) {
      return 'Redação';
    }
    if (str.includes('simu') || str.includes('prova') || str.includes('tri')) {
      return 'Simulado';
    }
    return 'Revisão Geral';
  },

  /**
   * Calcula todas as estatísticas derivadas em tempo real (Padrão RPG / Save-Systems: zero duplicação de estado)
   */
  computeStats(tasks) {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.concluida).length;
    const pendingTasks = totalTasks - completedTasks;

    const totalHours = Math.round(tasks.reduce((acc, t) => acc + (Number(t.horasEstimadas) || 0), 0) * 10) / 10;
    const completedHours = Math.round(
      tasks.filter(t => t.concluida).reduce((acc, t) => acc + (Number(t.horasEstimadas) || 0), 0) * 10
    ) / 10;
    const remainingHours = Math.max(0, Math.round((totalHours - completedHours) * 10) / 10);

    const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const hoursPercent = totalHours > 0 ? Math.round((completedHours / totalHours) * 100) : 0;

    // Cálculo de XP (Alta = 1.5x, Média = 1.0x, Baixa = 0.75x)
    const xpTotal = tasks
      .filter(t => t.concluida)
      .reduce((acc, t) => {
        const mult = t.prioridade === 'alta' ? 1.5 : t.prioridade === 'baixa' ? 0.75 : 1.0;
        return acc + Math.round((Number(t.horasEstimadas) || 1) * 100 * mult);
      }, 0);

    // Níveis de aprovação ENEM
    const levels = [
      { level: 1, title: 'Aquecimento ENEM', minXp: 0, nextXp: 300 },
      { level: 2, title: 'Foco no Básico (TRI)', minXp: 300, nextXp: 750 },
      { level: 3, title: 'Caçador de Questões', minXp: 750, nextXp: 1400 },
      { level: 4, title: 'Estrategista 800+', minXp: 1400, nextXp: 2200 },
      { level: 5, title: 'Mestre da Reta Final', minXp: 2200, nextXp: 3500 },
      { level: 6, title: 'Aprovado Elite 900+', minXp: 3500, nextXp: 99999 }
    ];

    let currentLevel = levels[0];
    for (const lvl of levels) {
      if (xpTotal >= lvl.minXp) {
        currentLevel = lvl;
      }
    }
    const levelSpan = Math.max(1, currentLevel.nextXp - currentLevel.minXp);
    const levelProgress = Math.min(100, Math.round(((xpTotal - currentLevel.minXp) / levelSpan) * 100));

    // Agrupamento único de dias na ordem em que aparecem
    const daysMap = new Map();
    for (const t of tasks) {
      const d = t.dia || 'Geral';
      if (!daysMap.has(d)) {
        daysMap.set(d, { dia: d, total: 0, concluidas: 0, horasTotais: 0, horasConcluidas: 0 });
      }
      const entry = daysMap.get(d);
      entry.total += 1;
      entry.horasTotais = Math.round((entry.horasTotais + (Number(t.horasEstimadas) || 0)) * 10) / 10;
      if (t.concluida) {
        entry.concluidas += 1;
        entry.horasConcluidas = Math.round((entry.horasConcluidas + (Number(t.horasEstimadas) || 0)) * 10) / 10;
      }
    }

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      totalHours,
      completedHours,
      remainingHours,
      completionPercent,
      hoursPercent,
      xpTotal,
      currentLevel,
      levelProgress,
      daysSummary: Array.from(daysMap.values())
    };
  },

  getDefaultTasks() {
    return structuredClone(DEFAULT_TASKS);
  }
};
