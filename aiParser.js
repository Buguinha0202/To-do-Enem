/**
 * aiParser.js
 * Parser Multi-Formato Tolerante a Falhas (JSON, Markdown Table, CSV/TSV e Texto Livre de IA)
 * + Construtor de Prompt Otimizado para ChatGPT / Claude / Gemini
 */

import { dataService } from './dataService.js';

const SUBMATERIAS_CONHECIDAS = [
  { key: 'fisic', label: 'Física', area: 'Natureza' },
  { key: 'quim', label: 'Química', area: 'Natureza' },
  { key: 'biolog', label: 'Biologia', area: 'Natureza' },
  { key: 'ecolog', label: 'Biologia', area: 'Natureza' },
  { key: 'hist', label: 'História', area: 'Humanas' },
  { key: 'geog', label: 'Geografia', area: 'Humanas' },
  { key: 'filos', label: 'Filosofia', area: 'Humanas' },
  { key: 'sociol', label: 'Sociologia', area: 'Humanas' },
  { key: 'matem', label: 'Matemática', area: 'Matemática' },
  { key: 'geometr', label: 'Geometria', area: 'Matemática' },
  { key: 'estatist', label: 'Estatística', area: 'Matemática' },
  { key: 'portug', label: 'Português', area: 'Linguagens' },
  { key: 'literat', label: 'Literatura', area: 'Linguagens' },
  { key: 'ingl', label: 'Inglês', area: 'Linguagens' },
  { key: 'espanh', label: 'Espanhol', area: 'Linguagens' },
  { key: 'redac', label: 'Redação ENEM', area: 'Redação' },
  { key: 'simula', label: 'Simulado ENEM', area: 'Simulado' }
];

function detectSubmateriaAndArea(text) {
  const norm = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const item of SUBMATERIAS_CONHECIDAS) {
    if (norm.includes(item.key)) {
      return { submateria: item.label, area: item.area };
    }
  }
  return { submateria: '', area: dataService.normalizeArea(text) };
}

/**
 * Extrai horas estimadas de strings como "2h", "1.5 horas", "90 min", "1h30", "2,5"
 */
function parseDurationHours(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0.2, Math.min(24, Math.round(raw * 10) / 10));
  }
  const str = String(raw || '').toLowerCase().trim();
  if (!str) return 1.5;

  // Padrão 1h30 ou 2h15m
  const hmMatch = str.match(/(\d+)\s*h(?:oras?)?\s*(\d+)\s*m?/i);
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10);
    const m = parseInt(hmMatch[2], 10);
    return Math.round((h + m / 60) * 10) / 10;
  }

  // Padrão em minutos: "90 min", "45m"
  const minMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(?:min|minutos|m)\b/i);
  if (minMatch) {
    const mins = parseFloat(minMatch[1].replace(',', '.'));
    return Math.max(0.2, Math.round((mins / 60) * 10) / 10);
  }

  // Padrão em horas: "2.5h", "2,5 horas", "2"
  const hrMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)?/i);
  if (hrMatch) {
    const val = parseFloat(hrMatch[1].replace(',', '.'));
    if (val > 12 && !str.includes('h')) {
      // Provavelmente minutos se alguém escreveu "90"
      return Math.round((val / 60) * 10) / 10;
    }
    return Math.max(0.2, Math.min(24, Math.round(val * 10) / 10));
  }

  return 1.5;
}

/**
 * Camada 1: Tenta extrair JSON mesmo cercado de texto/Markdown da IA
 */
function tryParseJson(input) {
  const cleaned = input
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  const candidates = [];
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(cleaned.slice(firstBracket, lastBracket + 1));
  }
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      // Remove vírgulas penduradas antes de } ou ]
      const sanitized = candidate.replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(sanitized);

      let list = null;
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        list =
          parsed.tasks ||
          parsed.tarefas ||
          parsed.cronograma ||
          parsed.schedule ||
          parsed.itens ||
          parsed.dias ||
          null;

        // Caso seja objeto agrupado por dias: { "Segunda": [...], "Terça": [...] }
        if (!list) {
          const flattened = [];
          for (const [dayKey, dayVal] of Object.entries(parsed)) {
            if (Array.isArray(dayVal)) {
              for (const item of dayVal) {
                flattened.push({ ...item, dia: item.dia || dayKey });
              }
            }
          }
          if (flattened.length > 0) list = flattened;
        }
      }

      if (Array.isArray(list) && list.length > 0) {
        // Verifica se é array de dias com sub-array de tarefas
        const unpacked = [];
        for (const entry of list) {
          if (entry && Array.isArray(entry.tarefas || entry.tasks || entry.blocos)) {
            const subList = entry.tarefas || entry.tasks || entry.blocos;
            const dayName = entry.dia || entry.data || entry.day || 'Geral';
            for (const sub of subList) {
              unpacked.push({ ...sub, dia: sub.dia || dayName });
            }
          } else if (entry && typeof entry === 'object') {
            unpacked.push(entry);
          }
        }

        if (unpacked.length > 0) {
          return unpacked.map(raw => {
            const rawMateria = raw.materia || raw.disciplina || raw.area || raw.subject || '';
            const detected = detectSubmateriaAndArea(rawMateria + ' ' + (raw.submateria || '') + ' ' + (raw.assunto || ''));
            return dataService.normalizeTask({
              dia: raw.dia || raw.data || raw.day || raw.semana || 'Dia 01',
              materia: raw.area ? dataService.normalizeArea(raw.area) : detected.area,
              submateria: raw.submateria || raw.disciplina || detected.submateria || rawMateria,
              assunto: raw.assunto || raw.topico || raw.conteudo || raw.titulo || raw.tarefa || raw.task || 'Estudo Direcionado',
              horasEstimadas: parseDurationHours(raw.horasEstimadas ?? raw.horas ?? raw.duracao ?? raw.tempo ?? 1.5),
              prioridade: raw.prioridade || raw.priority || raw.peso || 'media',
              tipo: raw.tipo || raw.type || raw.modalidade || 'exercicios',
              concluida: Boolean(raw.concluida ?? raw.done ?? false)
            });
          });
        }
      }
    } catch (_) {
      // Continua para o próximo formato
    }
  }
  return null;
}

/**
 * Camada 2: Tenta extrair Tabela Markdown (| Dia | Matéria | Assunto | Horas |)
 */
function tryParseMarkdownTable(input) {
  const lines = input
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.includes('|'));

  if (lines.length < 2) return null;

  // Filtra linhas separadoras |---|---|
  const contentLines = lines.filter(l => !/^\|?[\s\-:|]+\|?$/.test(l));
  if (contentLines.length < 2) return null;

  const splitCells = line =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim().replace(/\*\*/g, ''));

  const headers = splitCells(contentLines[0]).map(h =>
    h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  );

  const idxDia = headers.findIndex(h => h.includes('dia') || h.includes('data') || h.includes('seman'));
  const idxMat = headers.findIndex(h => h.includes('mater') || h.includes('discip') || h.includes('area'));
  const idxAssunto = headers.findIndex(
    h => h.includes('assunt') || h.includes('topic') || h.includes('conteud') || h.includes('taref') || h.includes('foco')
  );
  const idxHoras = headers.findIndex(
    h => h.includes('hor') || h.includes('temp') || h.includes('durac') || h.includes('estim')
  );
  const idxPrio = headers.findIndex(h => h.includes('prior') || h.includes('pes') || h.includes('import'));
  const idxTipo = headers.findIndex(h => h.includes('tip') || h.includes('modalid') || h.includes('format'));

  if (idxMat === -1 && idxAssunto === -1) return null;

  const tasks = [];
  for (let i = 1; i < contentLines.length; i++) {
    const cells = splitCells(contentLines[i]);
    if (cells.length < 2) continue;

    const diaVal = idxDia !== -1 ? cells[idxDia] : 'Dia 01';
    const matVal = idxMat !== -1 ? cells[idxMat] : '';
    const assuntoVal = idxAssunto !== -1 ? cells[idxAssunto] : cells[1] || cells[0];
    const horasVal = idxHoras !== -1 ? cells[idxHoras] : '1.5h';
    const prioVal = idxPrio !== -1 ? cells[idxPrio] : 'media';
    const tipoVal = idxTipo !== -1 ? cells[idxTipo] : 'exercicios';

    if (!assuntoVal && !matVal) continue;

    const detected = detectSubmateriaAndArea(matVal + ' ' + assuntoVal);
    tasks.push(
      dataService.normalizeTask({
        dia: diaVal || 'Geral',
        materia: detected.area,
        submateria: detected.submateria || matVal,
        assunto: assuntoVal || matVal,
        horasEstimadas: parseDurationHours(horasVal),
        prioridade: prioVal,
        tipo: tipoVal
      })
    );
  }

  return tasks.length > 0 ? tasks : null;
}

/**
 * Camada 3: Parser Heurístico de Texto Livre / Listas da IA
 * Reconhece cabeçalhos de Dia ("Segunda-feira:", "### Dia 1", etc.) e linhas de tarefas
 */
function tryParseFreeText(input) {
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  let currentDay = 'Dia 01';
  const tasks = [];

  const dayHeaderRegex = /^(?:#+\s*|\*\*|▶\s*)?(?:(dia\s*\d+[^\n:]*|segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado|domingo|semana\s*\d+[^\n:]*))(?:\*\*|:)?$/i;

  for (const rawLine of lines) {
    const cleanLine = rawLine.replace(/\*\*/g, '').trim();

    // Ignora linhas puramente conversacionais da IA
    if (
      /^(aqui est[aá]|claro!|com certeza|espero que ajude|observa[cç][aã]o|dica extra)/i.test(cleanLine) &&
      cleanLine.length < 90
    ) {
      continue;
    }

    // Verifica se a linha é apenas um título de Dia
    const headerMatch = cleanLine.match(dayHeaderRegex);
    if (headerMatch) {
      currentDay = headerMatch[1].trim();
      continue;
    }

    // Verifica se a linha começa com um dia inline: "Segunda-feira: Matemática - Funções (2h)"
    let workingLine = cleanLine.replace(/^[-*•+]\s*|\d+[.)]\s*|\[\s*[xX ]?\s*\]\s*/, '').trim();
    if (!workingLine || workingLine.length < 4) continue;

    const inlineDayMatch = workingLine.match(
      /^(dia\s*\d+|segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado|domingo)\s*[:\-–—]\s*(.+)$/i
    );
    if (inlineDayMatch) {
      currentDay = inlineDayMatch[1].trim();
      workingLine = inlineDayMatch[2].trim();
    }

    // Extrai duração se houver ("2h", "1.5 horas", "90 min")
    let duration = 1.5;
    const durMatch = workingLine.match(/(?:\(|\[|-\s*|\b)(\d+(?:[.,]\d+)?\s*(?:h(?:oras?)?\s*\d*\s*m?|h|hr|hrs|horas?|min|minutos))\b(?:\)|\])?/i);
    if (durMatch) {
      duration = parseDurationHours(durMatch[1]);
      workingLine = workingLine.replace(durMatch[0], ' ').trim();
    }

    // Extrai prioridade se houver ("Alta", "Prioridade Alta", "Urgente", "Baixa")
    let prioridade = 'media';
    if (/\b(prioridade\s*alta|alta\s*prioridade|peso\s*alto|urgente|cr[ií]tica|foco\s*m[aá]ximo|\[alta\]|\(alta\))\b/i.test(workingLine)) {
      prioridade = 'alta';
      workingLine = workingLine.replace(/\b(prioridade\s*alta|alta\s*prioridade|peso\s*alto|urgente|cr[ií]tica|foco\s*m[aá]ximo|\[alta\]|\(alta\))\b/gi, '').trim();
    } else if (/\b(prioridade\s*baixa|baixa\s*prioridade|peso\s*baixo|\[baixa\]|\(baixa\))\b/i.test(workingLine)) {
      prioridade = 'baixa';
      workingLine = workingLine.replace(/\b(prioridade\s*baixa|baixa\s*prioridade|peso\s*baixo|\[baixa\]|\(baixa\))\b/gi, '').trim();
    }

    // Limpa pontuação residual nas pontas
    workingLine = workingLine.replace(/^[\s\-–—:|•]+|[\s\-–—:|•()[\]]+$/g, '').trim();
    if (!workingLine) continue;

    // Separa Matéria e Assunto se houver ":" ou " - "
    let rawMat = '';
    let assunto = workingLine;
    const bracketMat = workingLine.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (bracketMat) {
      rawMat = bracketMat[1].trim();
      assunto = bracketMat[2].trim();
    } else {
      const splitMat = workingLine.split(/\s*[:\-–—]\s*/);
      if (splitMat.length >= 2 && splitMat[0].length <= 28) {
        rawMat = splitMat[0].trim();
        assunto = splitMat.slice(1).join(' — ').trim();
      }
    }

    const detected = detectSubmateriaAndArea(rawMat + ' ' + assunto);
    tasks.push(
      dataService.normalizeTask({
        dia: currentDay,
        materia: detected.area,
        submateria: detected.submateria || rawMat,
        assunto: assunto || workingLine,
        horasEstimadas: duration,
        prioridade,
        tipo: workingLine
      })
    );
  }

  return tasks;
}

export const aiParser = {
  /**
   * Analisa qualquer entrada colada da IA e retorna { format, tasks, totalHours, daysCount }
   */
  parseScheduleInput(rawText) {
    const text = String(rawText || '').trim();
    if (!text) {
      return { format: 'empty', tasks: [], totalHours: 0, daysCount: 0 };
    }

    let format = 'JSON Estruturado';
    let tasks = tryParseJson(text);

    if (!tasks || tasks.length === 0) {
      format = 'Tabela Markdown';
      tasks = tryParseMarkdownTable(text);
    }

    if (!tasks || tasks.length === 0) {
      format = 'Texto Livre / Lista Inteligente';
      tasks = tryParseFreeText(text);
    }

    const validTasks = (tasks || []).filter(t => t && t.assunto);
    const totalHours = Math.round(validTasks.reduce((acc, t) => acc + (Number(t.horasEstimadas) || 0), 0) * 10) / 10;
    const uniqueDays = new Set(validTasks.map(t => t.dia)).size;

    return {
      format,
      tasks: validTasks,
      totalHours,
      daysCount: uniqueDays
    };
  },

  /**
   * Gera o prompt sob medida para o estudante copiar e mandar para o ChatGPT, Claude ou Gemini
   */
  buildPromptForAI({ dias = 7, horasPorDia = 4, focoCurso = 'Geral / TRI Equilibrado', conteudosBrutos = '' }) {
    const rascunhoSection = conteudosBrutos.trim()
      ? `\nMEU RASCUNHO / CONTEÚDOS QUE PRECISO ESTUDAR:\n"""\n${conteudosBrutos.trim()}\n"""\n`
      : `\nMonte a seleção com os tópicos mais recorrentes e de maior valor na TRI do ENEM para essa reta final.\n`;

    return `Atue como um estrategista especialista em aprovação na Reta Final do ENEM e otimização de nota pela TRI (Teoria de Resposta ao Item).

Organize meu cronograma de estudos para os próximos ${dias} dias, considerando que tenho cerca de ${horasPorDia} horas disponíveis por dia.
Meu foco de curso/pesos: ${focoCurso}.${rascunhoSection}
REGRAS OBRIGATÓRIAS DE SAÍDA:
Responda EXCLUSIVAMENTE com um bloco JSON válido (um array de objetos), sem texto extra fora do JSON, seguindo exatamente este modelo para que meu site importe automaticamente:

\`\`\`json
[
  {
    "dia": "Dia 01 • Segunda",
    "materia": "Matemática",
    "submateria": "Matemática Básica",
    "assunto": "Razão, Proporção, Escalas e Porcentagem (Questões Padrão ENEM)",
    "horasEstimadas": 2.0,
    "prioridade": "alta",
    "tipo": "exercicios"
  },
  {
    "dia": "Dia 01 • Segunda",
    "materia": "Natureza",
    "submateria": "Biologia",
    "assunto": "Ecologia: Fluxo de Energia e Ciclos Biogeoquímicos",
    "horasEstimadas": 1.5,
    "prioridade": "alta",
    "tipo": "revisao"
  }
]
\`\`\`

Valores aceitos para os campos:
- "materia": "Matemática" | "Natureza" | "Humanas" | "Linguagens" | "Redação" | "Simulado"
- "horasEstimadas": número decimal em horas (ex: 1.0, 1.5, 2.0, 2.5)
- "prioridade": "alta" | "media" | "baixa"
- "tipo": "teoria" | "exercicios" | "revisao" | "redacao" | "simulado"`;
  }
};
