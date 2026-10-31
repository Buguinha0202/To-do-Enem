/**
 * app.js
 * Controlador Minimalista — Estado Único (appState), Reordenação Automática
 * de Dias Concluídos para o Final da Lista + View Transitions
 */

import { dataService } from './dataService.js';
import { aiParser } from './aiParser.js';
import { soundEngine } from './soundEngine.js';

const appState = {
  settings: {
    soundEnabled: true,
    groupByDay: true,
    examTarget: 'ENEM Reta Final',
    dailyGoalHours: 4.5
  },
  tasks: [],
  filters: {
    area: 'all',
    day: 'all',
    status: 'all',
    search: ''
  },
  parsedImportPreview: []
};

// Mapa estável para atribuir um view-transition-name único a cada Dia (modern-web-guidance: group-element-transitions)
const dayTransitionIdMap = new Map();
let dayTransitionSeq = 0;

function getDayTransitionName(dayName) {
  if (!dayTransitionIdMap.has(dayName)) {
    dayTransitionSeq += 1;
    dayTransitionIdMap.set(dayName, `day-card-${dayTransitionSeq}`);
  }
  return dayTransitionIdMap.get(dayName);
}

/* ==========================================================================
   UTILITÁRIOS VISUAIS
   ========================================================================== */

function getAreaDotClass(area) {
  const norm = String(area || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('mat')) return 'dot-matematica';
  if (norm.includes('nat')) return 'dot-natureza';
  if (norm.includes('hum')) return 'dot-humanas';
  if (norm.includes('ling')) return 'dot-linguagens';
  if (norm.includes('red')) return 'dot-redacao';
  if (norm.includes('sim')) return 'dot-simulado';
  return 'dot-geral';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2600);
}

/**
 * Fallback obrigatório para <dialog closedby="any"> em navegadores sem suporte nativo
 * (modern-web-guidance: light-dismiss-a-dialog)
 */
function setupDialogLightDismissFallback(dialog) {
  if (!dialog) return;
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialog.close();
    });
  }
}

/**
 * Executa a atualização do DOM dentro de document.startViewTransition quando há reordenação de dias
 * (modern-web-guidance: group-element-transitions)
 */
function renderWithViewTransition(shouldAnimateReorder = false) {
  if (shouldAnimateReorder && typeof document.startViewTransition === 'function') {
    const transition = document.startViewTransition(() => {
      renderApp();
    });
    transition.finished.finally(() => {
      document.getElementById('days-container')?.focus({ preventScroll: true });
    });
  } else {
    renderApp();
  }
}

/* ==========================================================================
   RENDERIZAÇÃO MINIMALISTA & ORDENAÇÃO (DIAS CONCLUÍDOS NO FINAL)
   ========================================================================== */

function renderApp() {
  const stats = dataService.computeStats(appState.tasks);

  // 1. Atualiza Resumo Minimalista
  const pendingDaysCount = stats.daysSummary.filter(d => d.concluidas < d.total).length;
  const completedDaysCount = stats.daysSummary.filter(d => d.total > 0 && d.concluidas === d.total).length;

  const inlineSummary = document.getElementById('summary-inline-text');
  if (inlineSummary) {
    if (stats.totalTasks === 0) {
      inlineSummary.textContent = 'Nenhum bloco cadastrado';
    } else if (pendingDaysCount === 0) {
      inlineSummary.textContent = `Todos os ${completedDaysCount} dias concluídos`;
    } else {
      inlineSummary.textContent = `${pendingDaysCount} dia(s) pendente(s)${completedDaysCount > 0 ? ` · ${completedDaysCount} concluído(s)` : ''}`;
    }
  }

  document.getElementById('kpi-tasks-done').textContent = `${stats.completedTasks}/${stats.totalTasks}`;
  document.getElementById('kpi-hours-done').textContent = `${stats.completedHours}h`;
  document.getElementById('kpi-hours-total').textContent = `de ${stats.totalHours}h`;
  document.getElementById('kpi-hours-remaining').textContent = `${stats.remainingHours}h restantes`;
  document.getElementById('kpi-percent-badge').textContent = `${stats.completionPercent}%`;
  document.getElementById('kpi-tasks-bar').style.width = `${stats.completionPercent}%`;
  document.getElementById('kpi-tasks-progressbar').setAttribute('aria-valuenow', String(stats.completionPercent));

  // Botão de desfazer backup
  const btnUndo = document.getElementById('btn-undo-backup');
  if (btnUndo) {
    btnUndo.hidden = !dataService.hasBackup();
  }

  // Ícone de som
  const soundWrap = document.getElementById('sound-icon-wrap');
  if (soundWrap) {
    soundWrap.textContent = appState.settings.soundEnabled ? '🔊' : '🔇';
  }

  // 2. Atualiza Select de Dias mantendo seleção se ainda existir
  const daySelect = document.getElementById('filter-day');
  if (daySelect) {
    const currentDayFilter = appState.filters.day;
    const uniqueDays = stats.daysSummary.map(d => d.dia);
    daySelect.innerHTML = `<option value="all">Todos os dias (${uniqueDays.length})</option>`;
    for (const dayName of uniqueDays) {
      const opt = document.createElement('option');
      opt.value = dayName;
      opt.textContent = dayName;
      if (dayName === currentDayFilter) opt.selected = true;
      daySelect.appendChild(opt);
    }
    if (currentDayFilter !== 'all' && !uniqueDays.includes(currentDayFilter)) {
      appState.filters.day = 'all';
    }
  }

  // Sugere o primeiro dia pendente no input de Adição Rápida
  const qaDiaInput = document.getElementById('qa-dia');
  if (qaDiaInput && !qaDiaInput.value) {
    const firstPendingDay =
      stats.daysSummary.find(d => d.concluidas < d.total)?.dia ||
      stats.daysSummary[0]?.dia ||
      'Dia 01 • Segunda';
    qaDiaInput.value = firstPendingDay;
  }

  // 3. Filtra tarefas
  const searchNorm = appState.filters.search.toLowerCase().trim();
  const filteredTasks = appState.tasks.filter(task => {
    if (appState.filters.area !== 'all' && task.materia !== appState.filters.area) return false;
    if (appState.filters.day !== 'all' && task.dia !== appState.filters.day) return false;
    if (appState.filters.status === 'pending' && task.concluida) return false;
    if (appState.filters.status === 'done' && !task.concluida) return false;
    if (searchNorm) {
      const hay = `${task.dia} ${task.materia} ${task.submateria} ${task.assunto}`.toLowerCase();
      if (!hay.includes(searchNorm)) return false;
    }
    return true;
  });

  // 4. Agrupa por Dia e Ordena: Dias Pendentes no Topo -> Dias 100% Concluídos no Final
  const container = document.getElementById('days-container');
  container.innerHTML = '';

  if (filteredTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Nenhuma tarefa encontrada. Use <strong>Importar da IA</strong> para colar seu cronograma.
      </div>
    `;
    return;
  }

  // Verifica no estado global se um dia inteiro está 100% concluído (para não jogar pro final só por causa de um filtro parcial)
  const globalDayDoneMap = new Map();
  for (const d of stats.daysSummary) {
    globalDayDoneMap.set(d.dia, d.total > 0 && d.concluidas === d.total);
  }

  const grouped = new Map();
  for (const t of filteredTasks) {
    const dayKey = t.dia || 'Geral';
    if (!grouped.has(dayKey)) grouped.set(dayKey, []);
    grouped.get(dayKey).push(t);
  }

  const pendingDayEntries = [];
  const completedDayEntries = [];

  for (const [dayName, dayTasks] of grouped.entries()) {
    const isFullDayComplete = Boolean(globalDayDoneMap.get(dayName));
    if (isFullDayComplete) {
      completedDayEntries.push([dayName, dayTasks, true]);
    } else {
      pendingDayEntries.push([dayName, dayTasks, false]);
    }
  }

  const orderedEntries = [...pendingDayEntries, ...completedDayEntries];
  let insertedCompletedDivider = false;

  for (const [dayName, dayTasks, isFullDayComplete] of orderedEntries) {
    if (isFullDayComplete && !insertedCompletedDivider && pendingDayEntries.length > 0) {
      insertedCompletedDivider = true;
      const divider = document.createElement('div');
      divider.className = 'completed-days-divider';
      divider.textContent = `Dias concluídos (${completedDayEntries.length})`;
      container.appendChild(divider);
    }

    const totalDayTasks = dayTasks.length;
    const doneDayTasks = dayTasks.filter(t => t.concluida).length;
    const totalDayHours = Math.round(dayTasks.reduce((a, b) => a + (Number(b.horasEstimadas) || 0), 0) * 10) / 10;
    const doneDayHours = Math.round(
      dayTasks.filter(t => t.concluida).reduce((a, b) => a + (Number(b.horasEstimadas) || 0), 0) * 10
    ) / 10;
    const isSomeDone = doneDayTasks > 0 && doneDayTasks < totalDayTasks;

    const section = document.createElement('article');
    section.className = `day-group ${isFullDayComplete ? 'day-complete' : ''}`;
    section.dataset.day = dayName;
    section.style.viewTransitionName = getDayTransitionName(dayName);

    const header = document.createElement('header');
    header.className = 'day-header';
    header.innerHTML = `
      <div class="day-title-wrap">
        <label class="task-check-label" style="min-block-size: 32px; gap: 0.6rem;" title="Marcar ou desmarcar todo o dia">
          <input
            type="checkbox"
            class="checkbox-custom day-master-checkbox"
            data-day="${escapeHtml(dayName)}"
            ${isFullDayComplete ? 'checked' : ''}
            aria-label="Marcar todos os blocos de ${escapeHtml(dayName)}"
          />
          <h2 class="day-title">${escapeHtml(dayName)}</h2>
        </label>
        ${isFullDayComplete ? '<span class="badge-done-day">✓ concluído</span>' : ''}
      </div>
      <div class="day-meta">
        <span>${doneDayTasks}/${totalDayTasks}</span>
        <span>·</span>
        <span>${doneDayHours}h / ${totalDayHours}h</span>
      </div>
    `;

    const masterCheckbox = header.querySelector('.day-master-checkbox');
    if (masterCheckbox && isSomeDone) {
      masterCheckbox.indeterminate = true;
    }

    const listEl = document.createElement('div');
    listEl.className = 'task-list';

    for (const task of dayTasks) {
      const row = document.createElement('div');
      row.className = 'task-item';
      row.dataset.taskId = task.id;

      const dotClass = getAreaDotClass(task.materia);
      const labelMateria =
        task.submateria && task.submateria.toLowerCase() !== task.materia.toLowerCase()
          ? task.submateria
          : task.materia;

      row.innerHTML = `
        <label class="task-check-label">
          <input
            type="checkbox"
            class="checkbox-custom task-item-checkbox"
            data-task-id="${escapeHtml(task.id)}"
            ${task.concluida ? 'checked' : ''}
          />
          <div class="task-line-content">
            <span class="area-dot ${dotClass}" aria-hidden="true"></span>
            <span class="task-area-label">${escapeHtml(labelMateria)}</span>
            <span class="task-subject-title">${escapeHtml(task.assunto)}</span>
          </div>
        </label>

        <div class="task-right">
          ${task.prioridade === 'alta' ? '<span class="prio-high-indicator" title="Prioridade Alta">alta</span>' : ''}
          <span class="hours-text" title="Horas estimadas">${task.horasEstimadas}h</span>
          <button
            type="button"
            class="btn btn-ghost btn-delete-task"
            data-task-id="${escapeHtml(task.id)}"
            title="Remover tarefa"
            aria-label="Remover ${escapeHtml(task.assunto)}"
          >
            ✕
          </button>
        </div>
      `;

      listEl.appendChild(row);
    }

    section.appendChild(header);
    section.appendChild(listEl);
    container.appendChild(section);
  }
}

/* ==========================================================================
   AÇÕES DE MUTAÇÃO DE TAREFAS
   ========================================================================== */

async function toggleTask(taskId) {
  const task = appState.tasks.find(t => t.id === taskId);
  if (!task) return;

  const dayTasks = appState.tasks.filter(t => t.dia === task.dia);
  const wasDayComplete = dayTasks.length > 0 && dayTasks.every(t => t.concluida);

  task.concluida = !task.concluida;
  task.concluidaEm = task.concluida ? new Date().toISOString() : null;

  const isNowDayComplete = dayTasks.length > 0 && dayTasks.every(t => t.concluida);
  const dayCompletionChanged = wasDayComplete !== isNowDayComplete;

  if (task.concluida) {
    if (isNowDayComplete) {
      soundEngine.playSuccessFanfare();
      showToast(`${task.dia} concluído e movido para o final.`);
    } else {
      soundEngine.playCheck();
    }
  } else {
    soundEngine.playUncheck();
  }

  await dataService.saveState(appState, false);
  renderWithViewTransition(dayCompletionChanged);
}

async function toggleDayBatch(dayName, shouldCheck) {
  const dayTasks = appState.tasks.filter(t => t.dia === dayName);
  if (dayTasks.length === 0) return;

  for (const t of dayTasks) {
    t.concluida = shouldCheck;
    t.concluidaEm = shouldCheck ? new Date().toISOString() : null;
  }

  if (shouldCheck) {
    soundEngine.playSuccessFanfare();
    showToast(`${dayName} concluído e movido para o final.`);
  } else {
    soundEngine.playUncheck();
  }

  await dataService.saveState(appState, false);
  renderWithViewTransition(true);
}

async function deleteTask(taskId) {
  const idx = appState.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;
  appState.tasks.splice(idx, 1);

  soundEngine.playClick();
  await dataService.saveState(appState, false);
  renderApp();
}

/* ==========================================================================
   FLUXO DE IMPORTAÇÃO DA IA & GERADOR DE PROMPT
   ========================================================================== */

const SAMPLE_AI_SCHEDULE = `[
  {
    "dia": "Segunda-feira • Reta Final",
    "materia": "Matemática",
    "submateria": "Geometria Espacial",
    "assunto": "Volume de Cilindros, Cones e Esferas + Projeção Ortogonal",
    "horasEstimadas": 2.0,
    "prioridade": "alta",
    "tipo": "exercicios"
  },
  {
    "dia": "Segunda-feira • Reta Final",
    "materia": "Natureza",
    "submateria": "Química",
    "assunto": "Eletroquímica: Pilhas, Potencial de Redução e Eletrólise",
    "horasEstimadas": 1.5,
    "prioridade": "alta",
    "tipo": "revisao"
  },
  {
    "dia": "Segunda-feira • Reta Final",
    "materia": "Redação",
    "submateria": "Proposta de Intervenção",
    "assunto": "Redação Cronometrada (Tema Eixo Ambiental) + 5 Elementos C5",
    "horasEstimadas": 1.5,
    "prioridade": "alta",
    "tipo": "redacao"
  },
  {
    "dia": "Terça-feira • Reta Final",
    "materia": "Natureza",
    "submateria": "Física",
    "assunto": "Ondulatória: Fenômenos Ondulatórios, Acústica e Equação Fundamental",
    "horasEstimadas": 2.0,
    "prioridade": "alta",
    "tipo": "exercicios"
  },
  {
    "dia": "Terça-feira • Reta Final",
    "materia": "Humanas",
    "submateria": "Geografia",
    "assunto": "Geografia Agrária, Fronteira Agrícola, Climas e Domínios Morfoclimáticos",
    "horasEstimadas": 1.5,
    "prioridade": "media",
    "tipo": "revisao"
  },
  {
    "dia": "Quarta-feira • Reta Final",
    "materia": "Matemática",
    "submateria": "Estatística e Probabilidade",
    "assunto": "Análise Combinatória, Probabilidade Condicional e Gráficos ENEM",
    "horasEstimadas": 2.5,
    "prioridade": "alta",
    "tipo": "exercicios"
  }
]`;

function updateImportPreview() {
  const textarea = document.getElementById('import-textarea');
  const statusEl = document.getElementById('import-preview-status');
  const detailsEl = document.getElementById('import-preview-details');
  const badgeEl = document.getElementById('import-format-badge');
  const confirmBtn = document.getElementById('btn-confirm-import');

  const raw = textarea.value;
  const result = aiParser.parseScheduleInput(raw);
  appState.parsedImportPreview = result.tasks;

  if (result.tasks.length === 0) {
    statusEl.textContent = 'Aguardando colar o cronograma...';
    detailsEl.textContent = 'Reconhece horas estimadas, dias, matérias e prioridades automaticamente.';
    badgeEl.style.display = 'none';
    confirmBtn.disabled = true;
    return;
  }

  statusEl.textContent = `${result.tasks.length} blocos identificados`;
  detailsEl.textContent = `${result.totalHours}h totais em ${result.daysCount} dia(s).`;
  badgeEl.textContent = result.format;
  badgeEl.style.display = 'inline-block';
  confirmBtn.disabled = false;
}

function updateGeneratedPrompt() {
  const dias = document.getElementById('prompt-dias').value || 7;
  const horasPorDia = document.getElementById('prompt-horas').value || 4.5;
  const focoCurso = document.getElementById('prompt-foco').value;
  const conteudosBrutos = document.getElementById('prompt-rascunho').value;

  const promptText = aiParser.buildPromptForAI({
    dias,
    horasPorDia,
    focoCurso,
    conteudosBrutos
  });

  document.getElementById('prompt-output').value = promptText;
}

/* ==========================================================================
   INICIALIZAÇÃO E EVENTOS
   ========================================================================== */

async function initApp() {
  const loaded = await dataService.loadState();
  appState.settings = loaded.settings;
  appState.tasks = loaded.tasks;
  soundEngine.setEnabled(appState.settings.soundEnabled);

  const dialogImport = document.getElementById('dialog-import');
  const dialogPrompt = document.getElementById('dialog-prompt');
  setupDialogLightDismissFallback(dialogImport);
  setupDialogLightDismissFallback(dialogPrompt);

  // Abrir Modal de Importação IA
  document.getElementById('btn-open-import').addEventListener('click', () => {
    soundEngine.playClick();
    updateImportPreview();
    dialogImport.showModal();
  });

  // Abrir Modal de Prompt IA
  document.getElementById('btn-open-prompt').addEventListener('click', () => {
    soundEngine.playClick();
    updateGeneratedPrompt();
    dialogPrompt.showModal();
  });

  // Alternar formulário de Adição Rápida
  const btnQuickAdd = document.getElementById('btn-toggle-quick-add');
  const cardQuickAdd = document.getElementById('quick-add-card');
  btnQuickAdd.addEventListener('click', () => {
    soundEngine.playClick();
    const isHidden = cardQuickAdd.hidden;
    cardQuickAdd.hidden = !isHidden;
    btnQuickAdd.setAttribute('aria-expanded', String(isHidden));
    if (isHidden) {
      document.getElementById('qa-assunto').focus();
    }
  });

  // Inputs do Gerador de Prompt
  ['prompt-dias', 'prompt-horas', 'prompt-foco', 'prompt-rascunho'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateGeneratedPrompt);
  });

  // Copiar Prompt
  document.getElementById('btn-copy-prompt').addEventListener('click', async () => {
    const output = document.getElementById('prompt-output');
    try {
      await navigator.clipboard.writeText(output.value);
      soundEngine.playCheck();
      showToast('Prompt copiado.');
    } catch (_) {
      output.select();
      document.execCommand('copy');
      showToast('Prompt copiado.');
    }
  });

  // Preencher Exemplo no Importador
  document.getElementById('btn-fill-sample').addEventListener('click', () => {
    soundEngine.playClick();
    const textarea = document.getElementById('import-textarea');
    textarea.value = SAMPLE_AI_SCHEDULE;
    updateImportPreview();
  });

  // Preview em tempo real
  document.getElementById('import-textarea').addEventListener('input', updateImportPreview);

  // Confirmar Importação da IA
  document.getElementById('btn-confirm-import').addEventListener('click', async () => {
    if (!appState.parsedImportPreview || appState.parsedImportPreview.length === 0) return;

    const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'replace';
    const count = appState.parsedImportPreview.length;

    if (mode === 'replace') {
      appState.tasks = structuredClone(appState.parsedImportPreview);
    } else {
      appState.tasks = [...appState.tasks, ...structuredClone(appState.parsedImportPreview)];
    }

    appState.filters.area = 'all';
    appState.filters.day = 'all';
    appState.filters.status = 'all';
    appState.filters.search = '';
    document.querySelectorAll('.pill-btn').forEach(b => b.classList.toggle('active', b.dataset.area === 'all'));

    await dataService.saveState(appState, true);
    soundEngine.playSuccessFanfare();
    dialogImport.close();
    document.getElementById('import-textarea').value = '';
    updateImportPreview();
    renderApp();
    showToast(`${count} blocos importados.`);
  });

  // Desfazer (.bak)
  document.getElementById('btn-undo-backup').addEventListener('click', async () => {
    const restored = await dataService.restoreBackup();
    if (restored) {
      appState.tasks = restored.tasks;
      soundEngine.playCheck();
      renderApp();
      showToast('Cronograma anterior restaurado.');
    }
  });

  // Alternar Som
  document.getElementById('btn-toggle-sound').addEventListener('click', async () => {
    appState.settings.soundEnabled = !appState.settings.soundEnabled;
    soundEngine.setEnabled(appState.settings.soundEnabled);
    if (appState.settings.soundEnabled) soundEngine.playClick();
    await dataService.saveState(appState, false);
    renderApp();
  });

  // Adição Rápida Manual
  document.getElementById('quick-add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const dia = document.getElementById('qa-dia').value.trim() || 'Dia 01';
    const materia = document.getElementById('qa-materia').value;
    const assunto = document.getElementById('qa-assunto').value.trim();
    const horas = parseFloat(document.getElementById('qa-horas').value) || 1.5;
    const prioridade = document.getElementById('qa-prioridade').value;

    if (!assunto) return;

    const newTask = dataService.normalizeTask({
      dia,
      materia,
      submateria: materia,
      assunto,
      horasEstimadas: horas,
      prioridade,
      concluida: false
    });

    appState.tasks.push(newTask);
    await dataService.saveState(appState, false);
    soundEngine.playCheck();
    document.getElementById('qa-assunto').value = '';
    renderApp();
    showToast(`Adicionado em ${dia}.`);
  });

  // Filtros
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      soundEngine.playClick();
      appState.filters.area = btn.dataset.area;
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderApp();
    });
  });

  document.getElementById('filter-day').addEventListener('change', e => {
    soundEngine.playClick();
    appState.filters.day = e.target.value;
    renderApp();
  });

  document.getElementById('filter-status').addEventListener('change', e => {
    soundEngine.playClick();
    appState.filters.status = e.target.value;
    renderApp();
  });

  document.getElementById('filter-search').addEventListener('input', e => {
    appState.filters.search = e.target.value;
    renderApp();
  });

  // Limpar Concluídas
  document.getElementById('btn-clear-done').addEventListener('click', async () => {
    const doneCount = appState.tasks.filter(t => t.concluida).length;
    if (doneCount === 0) return;
    appState.tasks = appState.tasks.filter(t => !t.concluida);
    await dataService.saveState(appState, true);
    soundEngine.playClick();
    renderApp();
    showToast(`${doneCount} concluída(s) removida(s).`);
  });

  // Delegação de Eventos na Lista
  document.getElementById('days-container').addEventListener('change', e => {
    const target = e.target;
    if (target.classList.contains('task-item-checkbox')) {
      toggleTask(target.dataset.taskId);
    } else if (target.classList.contains('day-master-checkbox')) {
      toggleDayBatch(target.dataset.day, target.checked);
    }
  });

  document.getElementById('days-container').addEventListener('click', e => {
    const delBtn = e.target.closest('.btn-delete-task');
    if (delBtn) {
      deleteTask(delBtn.dataset.taskId);
    }
  });

  renderApp();
}

document.addEventListener('DOMContentLoaded', initApp);
