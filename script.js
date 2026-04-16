(function () {
  "use strict";

  const STORE_KEY = "kanban_v3";
  const ORDER_KEY = "kanban_order_v2";
  let tasks = [];
  let intervals = {};
  let dragSource = null;
  let dragOverCard = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      tasks = raw ? JSON.parse(raw) : defaultTasks();
    } catch {
      tasks = defaultTasks();
    }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(tasks));
  }

  function loadOrder() {
    try {
      const saved = localStorage.getItem(ORDER_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { todo: [], wip: [], done: [] };
  }

  function saveOrder(order) {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  }

  function getOrderedTasksForColumn(col) {
    const order = loadOrder();
    const columnOrder = order[col] || [];
    const columnTasks = tasks.filter((t) => t.col === col);
    const ordered = [];
    const taskMap = new Map(columnTasks.map((t) => [t.id, t]));

    for (const id of columnOrder) {
      if (taskMap.has(id)) {
        ordered.push(taskMap.get(id));
        taskMap.delete(id);
      }
    }
    ordered.push(...taskMap.values());
    return ordered;
  }

  function updateOrderForColumn(col, orderedTasks) {
    const order = loadOrder();
    order[col] = orderedTasks.map((t) => t.id);
    saveOrder(order);
  }

  function reorderTaskInSameColumn(taskId, targetId, position) {
    const task = getTask(taskId);
    if (!task) return false;

    const col = task.col;
    const columnTasks = getOrderedTasksForColumn(col);
    const sourceIndex = columnTasks.findIndex((t) => t.id === taskId);
    if (sourceIndex === -1) return false;

    columnTasks.splice(sourceIndex, 1);

    let targetIndex;
    if (targetId === null) {
      targetIndex = position === "after" ? columnTasks.length : 0;
    } else {
      targetIndex = columnTasks.findIndex((t) => t.id === targetId);
      if (targetIndex === -1) return false;
      if (position === "after") targetIndex++;
    }

    const movedTask = tasks.find((t) => t.id === taskId);
    columnTasks.splice(targetIndex, 0, movedTask);
    updateOrderForColumn(col, columnTasks);
    return true;
  }

  function moveToColumn(taskId, newCol, targetId = null, position = null) {
    const task = getTask(taskId);
    if (!task) return;
    const oldCol = task.col;
    task.col = newCol;
    save();

    if (oldCol === newCol && targetId) {
      reorderTaskInSameColumn(taskId, targetId, position);
    } else if (oldCol !== newCol) {
      const oldColTasks = getOrderedTasksForColumn(oldCol);
      const newColTasks = getOrderedTasksForColumn(newCol);
      const newOrder = [...newColTasks];

      if (targetId) {
        const targetIndex = newOrder.findIndex((t) => t.id === targetId);
        if (targetIndex !== -1) {
          const insertAt = position === "after" ? targetIndex + 1 : targetIndex;
          newOrder.splice(insertAt, 0, task);
        } else {
          newOrder.push(task);
        }
      } else {
        newOrder.push(task);
      }

      const filteredOld = oldColTasks.filter((t) => t.id !== taskId);
      updateOrderForColumn(oldCol, filteredOld);
      updateOrderForColumn(newCol, newOrder);
    }
  }

  function defaultTasks() {
    return [
      {
        id: uid(),
        title: "Revisar diseño UI",
        desc: "Feedback del cliente pendiente",
        priority: "alta",
        col: "todo",
        elapsed: 0,
        running: false,
      },
      {
        id: uid(),
        title: "Implementar API REST",
        desc: "Endpoints de autenticación",
        priority: "media",
        col: "wip",
        elapsed: 0,
        running: false,
      },
      {
        id: uid(),
        title: "Configurar CI/CD",
        desc: "",
        priority: "baja",
        col: "done",
        elapsed: 0,
        running: false,
      },
    ];
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  const themeToggle = document.getElementById("themeToggle");
  const iconSun = document.getElementById("iconSun");
  const iconMoon = document.getElementById("iconMoon");
  const themeLabel = document.getElementById("themeLabel");

  function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.querySelector("meta[name=theme-color]").content = dark ? "#0f0f0f" : "#f5f3ee";
    iconSun.style.display = dark ? "none" : "block";
    iconMoon.style.display = dark ? "block" : "none";
    themeLabel.textContent = dark ? "Oscuro" : "Claro";
    localStorage.setItem("kanban_theme", dark ? "dark" : "light");
  }

  function initTheme() {
    const saved = localStorage.getItem("kanban_theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = saved ? saved === "dark" : prefersDark;
    themeToggle.checked = dark;
    applyTheme(dark);
  }
  themeToggle.addEventListener("change", () => applyTheme(themeToggle.checked));

  function fmt(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function startTimer(id) {
    if (intervals[id]) return;
    const t = getTask(id);
    if (!t) return;
    t.running = true;
    save();
    intervals[id] = setInterval(() => {
      const task = getTask(id);
      if (!task) {
        clearInterval(intervals[id]);
        delete intervals[id];
        return;
      }
      task.elapsed++;
      save();
      const el = document.querySelector(`[data-id="${id}"] .timer-display`);
      if (el) {
        el.textContent = fmt(task.elapsed);
        el.classList.add("running");
      }
    }, 1000);
    updateTimerBtns(id);
  }

  function pauseTimer(id) {
    clearInterval(intervals[id]);
    delete intervals[id];
    const t = getTask(id);
    if (t) {
      t.running = false;
      save();
    }
    updateTimerBtns(id);
    const el = document.querySelector(`[data-id="${id}"] .timer-display`);
    if (el) el.classList.remove("running");
  }

  function resetTimer(id) {
    pauseTimer(id);
    const t = getTask(id);
    if (t) {
      t.elapsed = 0;
      save();
    }
    const el = document.querySelector(`[data-id="${id}"] .timer-display`);
    if (el) {
      el.textContent = fmt(0);
      el.classList.remove("running");
    }
    updateTimerBtns(id);
  }

  function updateTimerBtns(id) {
    const card = document.querySelector(`[data-id="${id}"]`);
    if (!card) return;
    const running = !!intervals[id];
    const playBtn = card.querySelector(".t-play");
    const pauseBtn = card.querySelector(".t-pause");
    if (playBtn) playBtn.style.display = running ? "none" : "inline-flex";
    if (pauseBtn) pauseBtn.style.display = running ? "inline-flex" : "none";
  }

  function getTask(id) {
    return tasks.find((t) => t.id === id);
  }

  function svgPlay() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  }
  function svgPause() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  }
  function svgReset() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>`;
  }

  function createCardEl(t) {
    const div = document.createElement("article");
    div.className = "card";
    div.setAttribute("data-id", t.id);
    div.setAttribute("draggable", "true");
    div.setAttribute("role", "listitem");
    div.setAttribute("aria-label", `Tarea: ${t.title}`);

    const running = !!intervals[t.id];
    div.innerHTML = `
      <div class="card-top">
        <p class="card-title">${esc(t.title)}</p>
      </div>
      ${t.desc ? `<p class="card-desc">${esc(t.desc)}</p>` : ""}
      <span class="card-tag tag-${t.priority}" aria-label="Prioridad ${t.priority}">${t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}</span>
      <div class="timer-block" role="group" aria-label="Cronómetro">
        <span class="timer-display${running ? " running" : ""}" aria-live="off" aria-label="Tiempo transcurrido">${fmt(t.elapsed)}</span>
        <button class="timer-btn t-play" aria-label="Iniciar cronómetro" style="display:${running ? "none" : "inline-flex"}">${svgPlay()}</button>
        <button class="timer-btn t-pause" aria-label="Pausar cronómetro" style="display:${running ? "inline-flex" : "none"}">${svgPause()}</button>
        <button class="timer-btn t-reset" aria-label="Reiniciar cronómetro">${svgReset()}</button>
      </div>
      <div class="card-actions">
        <button class="card-act edit-btn" aria-label="Editar tarea">Editar</button>
        <button class="card-act danger delete-btn" aria-label="Eliminar tarea">Eliminar</button>
      </div>
    `;

    div.addEventListener("dragstart", onDragStart);
    div.addEventListener("dragend", onDragEnd);
    div.addEventListener("dragover", onDragOver);
    div.addEventListener("dragleave", onDragLeave);
    div.addEventListener("drop", onDrop);

    div.querySelector(".t-play").addEventListener("click", (e) => {
      e.stopPropagation();
      startTimer(t.id);
    });
    div.querySelector(".t-pause").addEventListener("click", (e) => {
      e.stopPropagation();
      pauseTimer(t.id);
    });
    div.querySelector(".t-reset").addEventListener("click", (e) => {
      e.stopPropagation();
      resetTimer(t.id);
    });
    div.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openEdit(t.id);
    });
    div.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`¿Eliminar "${t.title}"?`)) return;
      pauseTimer(t.id);
      tasks = tasks.filter((x) => x.id !== t.id);
      save();
      render();
    });

    return div;
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function render() {
    ["todo", "wip", "done"].forEach((col) => {
      const body = document.getElementById(`body-${col}`);
      const cnt = document.getElementById(`cnt-${col}`);
      const orderedTasks = getOrderedTasksForColumn(col);
      body.innerHTML = "";
      if (orderedTasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.setAttribute("aria-label", "Sin tareas");
        empty.textContent = "Sin tareas · arrastra aquí o crea una nueva";
        body.appendChild(empty);
      } else {
        orderedTasks.forEach((t) => body.appendChild(createCardEl(t)));
      }
      cnt.textContent = orderedTasks.length;
    });
    tasks.forEach((t) => {
      if (t.running && !intervals[t.id]) startTimer(t.id);
    });
  }

  function onDragStart(e) {
    dragSource = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", this.dataset.id);
  }

  function onDragEnd(e) {
    this.classList.remove("dragging");
    document.querySelectorAll(".card").forEach((card) => {
      card.classList.remove("drag-over-before", "drag-over-after");
    });
    document.querySelectorAll(".column").forEach((col) => {
      col.classList.remove("drag-over");
    });
    dragSource = null;
    dragOverCard = null;
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const targetCard = this;
    if (dragSource === targetCard) return;

    const rect = targetCard.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const isAfter = y > rect.height / 2;

    targetCard.classList.remove("drag-over-before", "drag-over-after");
    if (isAfter) {
      targetCard.classList.add("drag-over-after");
    } else {
      targetCard.classList.add("drag-over-before");
    }
    dragOverCard = { card: targetCard, position: isAfter ? "after" : "before" };
  }

  function onDragLeave(e) {
    this.classList.remove("drag-over-before", "drag-over-after");
    dragOverCard = null;
  }

  function onDrop(e) {
    e.preventDefault();
    this.classList.remove("drag-over-before", "drag-over-after");

    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId) return;

    const targetId = this.dataset.id;
    const sourceTask = getTask(sourceId);
    const targetTask = getTask(targetId);

    if (!sourceTask || !targetTask) return;

    if (sourceTask.col === targetTask.col && dragOverCard) {
      reorderTaskInSameColumn(sourceId, targetId, dragOverCard.position);
    } else if (sourceTask.col !== targetTask.col) {
      moveToColumn(sourceId, targetTask.col, targetId, dragOverCard ? dragOverCard.position : null);
    }

    render();
    dragOverCard = null;
  }

  document.querySelectorAll(".column").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const sourceId = e.dataTransfer.getData("text/plain");
      if (sourceId) {
        moveToColumn(sourceId, col.dataset.col);
        render();
      }
    });
  });

  const addForm = document.getElementById("addForm");
  const openFormBtn = document.getElementById("openFormBtn");
  const cancelBtn = document.getElementById("cancelFormBtn");
  const saveBtn = document.getElementById("saveCardBtn");

  openFormBtn.addEventListener("click", () => {
    const open = addForm.classList.toggle("open");
    openFormBtn.setAttribute("aria-expanded", String(open));
    if (open) document.getElementById("fTitle").focus();
  });
  cancelBtn.addEventListener("click", () => {
    addForm.classList.remove("open");
    openFormBtn.setAttribute("aria-expanded", "false");
  });

  saveBtn.addEventListener("click", addTask);
  document.getElementById("fTitle").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });

  function addTask() {
    const title = document.getElementById("fTitle").value.trim();
    if (!title) {
      document.getElementById("fTitle").focus();
      return;
    }
    const newCol = document.getElementById("fColumn").value;
    const t = {
      id: uid(),
      title,
      desc: document.getElementById("fDesc").value.trim(),
      priority: document.getElementById("fPriority").value,
      col: newCol,
      elapsed: 0,
      running: false,
    };
    tasks.unshift(t);

    const colTasks = getOrderedTasksForColumn(newCol);
    colTasks.unshift(t);
    updateOrderForColumn(newCol, colTasks);

    save();
    render();
    document.getElementById("fTitle").value = "";
    document.getElementById("fDesc").value = "";
    document.getElementById("fTitle").focus();
    addForm.classList.remove("open");
    openFormBtn.setAttribute("aria-expanded", "false");
  }

  const modal = document.getElementById("editModal");
  let editingId = null;

  function openEdit(id) {
    const t = getTask(id);
    if (!t) return;
    editingId = id;
    document.getElementById("eFTitle").value = t.title;
    document.getElementById("eFDesc").value = t.desc;
    document.getElementById("eFPriority").value = t.priority;
    modal.classList.add("open");
    document.getElementById("eFTitle").focus();
  }

  document.getElementById("cancelEditBtn").addEventListener("click", closeEdit);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeEdit();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) closeEdit();
  });

  function closeEdit() {
    modal.classList.remove("open");
    editingId = null;
  }

  document.getElementById("saveEditBtn").addEventListener("click", () => {
    if (!editingId) return;
    const t = getTask(editingId);
    if (!t) return;
    t.title = document.getElementById("eFTitle").value.trim() || t.title;
    t.desc = document.getElementById("eFDesc").value.trim();
    t.priority = document.getElementById("eFPriority").value;
    save();
    render();
    closeEdit();
  });

  initTheme();
  load();
  render();
})();