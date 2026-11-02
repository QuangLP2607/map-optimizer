const MIN_MAP_SIZE = 10;
const MAX_MAP_SIZE = 5000;

const DEFAULT_MAP_WIDTH = 300;
const DEFAULT_MAP_HEIGHT = 300;

const CANVAS_SIZE = 650;
const EPSILON = 1e-9;

const STORAGE_KEY = "map-optimizer-data";

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
  "#e11d48",
];

let enemies = [
  {
    id: 1,
    name: "Địch 1",
    x: 250,
    y: 50,
  },
  {
    id: 2,
    name: "Địch 2",
    x: 150,
    y: 250,
  },
];

let nextEnemyId = 3;
let bestPosition = null;

/* =========================================================
   DOM
========================================================= */

const mapWidthInput = document.getElementById("mapWidth");
const mapHeightInput = document.getElementById("mapHeight");

const forcesElement = document.getElementById("forces");
const forceCountElement = document.getElementById("forceCount");

const addForceBtn = document.getElementById("addForceBtn");
const optimizeBtn = document.getElementById("optimizeBtn");

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

const bestPositionElement = document.getElementById("bestPosition");
const bestAreaElement = document.getElementById("bestArea");
const bestPercentElement = document.getElementById("bestPercent");

const legendElement = document.getElementById("legend");
const statusElement = document.getElementById("status");

const mapSizeBadge = document.getElementById("mapSizeBadge");

/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveData() {
  const { width, height } = getMapSize();

  const data = {
    mapWidth: width,
    mapHeight: height,

    enemies: enemies.map((enemy) => ({
      id: enemy.id,
      name: enemy.name,
      x: enemy.x,
      y: enemy.y,
    })),

    nextEnemyId,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Không thể lưu dữ liệu:", error);
  }
}

function loadData() {
  let savedData;

  try {
    savedData = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Không thể đọc dữ liệu:", error);
    return;
  }

  if (!savedData) {
    return;
  }

  try {
    const data = JSON.parse(savedData);

    const width = clamp(
      Number(data.mapWidth) || DEFAULT_MAP_WIDTH,
      MIN_MAP_SIZE,
      MAX_MAP_SIZE,
    );

    const height = clamp(
      Number(data.mapHeight) || DEFAULT_MAP_HEIGHT,
      MIN_MAP_SIZE,
      MAX_MAP_SIZE,
    );

    mapWidthInput.value = width;
    mapHeightInput.value = height;

    if (Array.isArray(data.enemies)) {
      enemies = data.enemies.map((enemy, index) => ({
        id: Number(enemy.id) || index + 1,

        name:
          typeof enemy.name === "string" && enemy.name.trim()
            ? enemy.name
            : `Địch ${index + 1}`,

        x: clamp(Number(enemy.x) || 0, 0, width),

        y: clamp(Number(enemy.y) || 0, 0, height),
      }));
    }

    const maxEnemyId = enemies.reduce(
      (maxId, enemy) => Math.max(maxId, enemy.id),
      0,
    );

    nextEnemyId = Math.max(Number(data.nextEnemyId) || 0, maxEnemyId + 1);

    bestPosition = null;
  } catch (error) {
    console.error("Không thể khôi phục dữ liệu:", error);

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
}

/* =========================================================
   BASIC HELPERS
========================================================= */

function getMapSize() {
  const width = clamp(
    Number.parseInt(mapWidthInput.value, 10) || DEFAULT_MAP_WIDTH,
    MIN_MAP_SIZE,
    MAX_MAP_SIZE,
  );

  const height = clamp(
    Number.parseInt(mapHeightInput.value, 10) || DEFAULT_MAP_HEIGHT,
    MIN_MAP_SIZE,
    MAX_MAP_SIZE,
  );

  return {
    width,
    height,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundNumber(value) {
  return Math.round(value * 100) / 100;
}

function polygonArea(polygon) {
  if (polygon.length < 3) {
    return 0;
  }

  let area = 0;

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];

    area += current.x * next.y;
    area -= next.x * current.y;
  }

  return Math.abs(area) / 2;
}

function isSamePosition(x, y, enemy) {
  return Math.abs(x - enemy.x) < EPSILON && Math.abs(y - enemy.y) < EPSILON;
}

function isCoincidentWithEnemy(x, y, enemiesList) {
  return enemiesList.some((enemy) => isSamePosition(x, y, enemy));
}

/* =========================================================
   POLYGON CLIPPING
========================================================= */

function lineIntersection(p1, p2, A, B, C) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const denominator = A * dx + B * dy;

  if (Math.abs(denominator) < EPSILON) {
    return {
      x: p1.x,
      y: p1.y,
    };
  }

  const t = (C - A * p1.x - B * p1.y) / denominator;

  return {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };
}

function clipPolygon(polygon, A, B, C) {
  if (polygon.length === 0) {
    return [];
  }

  const result = [];

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];

    const currentValue = A * current.x + B * current.y - C;

    const nextValue = A * next.x + B * next.y - C;

    const currentInside = currentValue <= EPSILON;

    const nextInside = nextValue <= EPSILON;

    if (currentInside && nextInside) {
      result.push(next);
      continue;
    }

    if (currentInside && !nextInside) {
      result.push(lineIntersection(current, next, A, B, C));

      continue;
    }

    if (!currentInside && nextInside) {
      result.push(lineIntersection(current, next, A, B, C));

      result.push(next);
    }
  }

  return result;
}

/* =========================================================
   VORONOI CELL
========================================================= */

function getVoronoiCell(current, competitors, mapWidth, mapHeight) {
  let polygon = [
    { x: 0, y: 0 },
    { x: mapWidth, y: 0 },
    { x: mapWidth, y: mapHeight },
    { x: 0, y: mapHeight },
  ];

  for (const enemy of competitors) {
    const dx = enemy.x - current.x;
    const dy = enemy.y - current.y;

    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
      continue;
    }

    /*
      |P - current|² <= |P - enemy|²

      2(enemy - current) . P
        <= |enemy|² - |current|²
    */

    const A = 2 * dx;
    const B = 2 * dy;

    const C =
      enemy.x * enemy.x +
      enemy.y * enemy.y -
      current.x * current.x -
      current.y * current.y;

    polygon = clipPolygon(polygon, A, B, C);

    if (polygon.length === 0) {
      break;
    }
  }

  return polygon;
}

function getControlArea(x, y, enemiesList, mapWidth, mapHeight) {
  if (isCoincidentWithEnemy(x, y, enemiesList)) {
    return -Infinity;
  }

  const cell = getVoronoiCell({ x, y }, enemiesList, mapWidth, mapHeight);

  return polygonArea(cell);
}

function evaluatePosition(x, y, enemiesList, mapWidth, mapHeight) {
  if (x < 0 || x > mapWidth || y < 0 || y > mapHeight) {
    return -Infinity;
  }

  return getControlArea(x, y, enemiesList, mapWidth, mapHeight);
}

/* =========================================================
   CANDIDATES
========================================================= */

function addCandidate(candidates, seen, x, y, mapWidth, mapHeight) {
  x = Math.round(x);
  y = Math.round(y);

  x = clamp(x, 0, mapWidth);
  y = clamp(y, 0, mapHeight);

  const key = `${x},${y}`;

  if (seen.has(key)) {
    return;
  }

  seen.add(key);

  candidates.push({
    x,
    y,
  });
}

function generateGlobalCandidates(mapWidth, mapHeight) {
  const candidates = [];
  const seen = new Set();

  const maxSize = Math.max(mapWidth, mapHeight);

  let step = 8;

  if (maxSize <= 300) {
    step = 8;
  } else if (maxSize <= 600) {
    step = 12;
  } else if (maxSize <= 1200) {
    step = 20;
  } else if (maxSize <= 2500) {
    step = 32;
  } else {
    step = 50;
  }

  for (let x = 0; x <= mapWidth; x += step) {
    for (let y = 0; y <= mapHeight; y += step) {
      addCandidate(candidates, seen, x, y, mapWidth, mapHeight);
    }
  }

  addCandidate(candidates, seen, 0, 0, mapWidth, mapHeight);

  addCandidate(candidates, seen, mapWidth, 0, mapWidth, mapHeight);

  addCandidate(candidates, seen, 0, mapHeight, mapWidth, mapHeight);

  addCandidate(candidates, seen, mapWidth, mapHeight, mapWidth, mapHeight);

  addCandidate(
    candidates,
    seen,
    mapWidth / 2,
    mapHeight / 2,
    mapWidth,
    mapHeight,
  );

  return candidates;
}

function generateEnemyNeighborhoodCandidates(mapWidth, mapHeight, enemiesList) {
  const candidates = [];
  const seen = new Set();

  const distances = [
    1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 50, 64, 80, 100,
  ];

  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  for (const enemy of enemiesList) {
    for (const distance of distances) {
      for (const [dx, dy] of directions) {
        addCandidate(
          candidates,
          seen,
          enemy.x + dx * distance,
          enemy.y + dy * distance,
          mapWidth,
          mapHeight,
        );
      }
    }
  }

  return candidates;
}

function generateBoundaryCandidates(mapWidth, mapHeight) {
  const candidates = [];
  const seen = new Set();

  const distances = [1, 2, 3, 4, 6, 8, 12, 16, 24];

  const points = [
    [0, 0],
    [mapWidth, 0],
    [0, mapHeight],
    [mapWidth, mapHeight],

    [mapWidth / 2, 0],
    [mapWidth / 2, mapHeight],
    [0, mapHeight / 2],
    [mapWidth, mapHeight / 2],
  ];

  for (const [x, y] of points) {
    addCandidate(candidates, seen, x, y, mapWidth, mapHeight);

    for (const distance of distances) {
      addCandidate(
        candidates,
        seen,
        x === 0 ? x + distance : x - distance,
        y,
        mapWidth,
        mapHeight,
      );

      addCandidate(
        candidates,
        seen,
        x,
        y === 0 ? y + distance : y - distance,
        mapWidth,
        mapHeight,
      );
    }
  }

  return candidates;
}

function generateEnemyToBoundaryCandidates(mapWidth, mapHeight, enemiesList) {
  const candidates = [];
  const seen = new Set();

  const boundaryTargets = [
    [0, 0],
    [mapWidth, 0],
    [0, mapHeight],
    [mapWidth, mapHeight],

    [mapWidth / 2, 0],
    [mapWidth / 2, mapHeight],
    [0, mapHeight / 2],
    [mapWidth, mapHeight / 2],
  ];

  const distances = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 80, 100];

  for (const enemy of enemiesList) {
    for (const target of boundaryTargets) {
      const dx = target[0] - enemy.x;
      const dy = target[1] - enemy.y;

      const length = Math.sqrt(dx * dx + dy * dy);

      if (length < EPSILON) {
        continue;
      }

      const ux = dx / length;
      const uy = dy / length;

      for (const distance of distances) {
        const x = enemy.x + ux * distance;

        const y = enemy.y + uy * distance;

        addCandidate(candidates, seen, x, y, mapWidth, mapHeight);
      }
    }
  }

  return candidates;
}

/* =========================================================
   OPTIMIZATION
========================================================= */

function refineCandidate(candidate, mapWidth, mapHeight, enemiesList, radius) {
  let best = {
    x: candidate.x,
    y: candidate.y,

    area: evaluatePosition(
      candidate.x,
      candidate.y,
      enemiesList,
      mapWidth,
      mapHeight,
    ),
  };

  for (let x = candidate.x - radius; x <= candidate.x + radius; x += 2) {
    for (let y = candidate.y - radius; y <= candidate.y + radius; y += 2) {
      const area = evaluatePosition(x, y, enemiesList, mapWidth, mapHeight);

      if (area > best.area) {
        best = {
          x,
          y,
          area,
        };
      }
    }
  }

  for (let x = best.x - 2; x <= best.x + 2; x++) {
    for (let y = best.y - 2; y <= best.y + 2; y++) {
      const area = evaluatePosition(x, y, enemiesList, mapWidth, mapHeight);

      if (area > best.area) {
        best = {
          x,
          y,
          area,
        };
      }
    }
  }

  return best;
}

function hillClimb(candidate, mapWidth, mapHeight, enemiesList) {
  let best = {
    x: candidate.x,
    y: candidate.y,
    area: candidate.area,
  };

  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  let improved = true;

  while (improved) {
    improved = false;

    for (const [dx, dy] of directions) {
      const x = best.x + dx;
      const y = best.y + dy;

      if (x < 0 || x > mapWidth || y < 0 || y > mapHeight) {
        continue;
      }

      const area = evaluatePosition(x, y, enemiesList, mapWidth, mapHeight);

      if (area > best.area + EPSILON) {
        best = {
          x,
          y,
          area,
        };

        improved = true;
      }
    }
  }

  return best;
}

function finalNeighborhoodCheck(candidate, mapWidth, mapHeight, enemiesList) {
  let best = candidate;

  for (let x = candidate.x - 2; x <= candidate.x + 2; x++) {
    for (let y = candidate.y - 2; y <= candidate.y + 2; y++) {
      const area = evaluatePosition(x, y, enemiesList, mapWidth, mapHeight);

      if (area > best.area) {
        best = {
          x,
          y,
          area,
        };
      }
    }
  }

  return best;
}

function findBestPosition(mapWidth, mapHeight, enemiesList) {
  const startedAt = performance.now();

  const candidates = [
    ...generateGlobalCandidates(mapWidth, mapHeight),

    ...generateEnemyNeighborhoodCandidates(mapWidth, mapHeight, enemiesList),

    ...generateBoundaryCandidates(mapWidth, mapHeight),

    ...generateEnemyToBoundaryCandidates(mapWidth, mapHeight, enemiesList),
  ];

  const evaluated = candidates
    .map((candidate) => ({
      ...candidate,

      area: evaluatePosition(
        candidate.x,
        candidate.y,
        enemiesList,
        mapWidth,
        mapHeight,
      ),
    }))
    .filter((candidate) => Number.isFinite(candidate.area))
    .sort((a, b) => b.area - a.area);

  let topK = 30;

  if (Math.max(mapWidth, mapHeight) > 600) {
    topK = 40;
  }

  if (Math.max(mapWidth, mapHeight) > 1200) {
    topK = 50;
  }

  if (Math.max(mapWidth, mapHeight) > 2500) {
    topK = 60;
  }

  const bestCandidates = evaluated.slice(0, topK);

  let best = null;

  for (const candidate of bestCandidates) {
    const refined = refineCandidate(
      candidate,
      mapWidth,
      mapHeight,
      enemiesList,
      Math.max(
        4,
        Math.min(20, Math.round(Math.max(mapWidth, mapHeight) * 0.04)),
      ),
    );

    const climbed = hillClimb(refined, mapWidth, mapHeight, enemiesList);

    const final = finalNeighborhoodCheck(
      climbed,
      mapWidth,
      mapHeight,
      enemiesList,
    );

    if (!best || final.area > best.area) {
      best = final;
    }
  }

  return {
    best,
    candidateCount: candidates.length,
    evaluatedCount: evaluated.length,
    elapsed: performance.now() - startedAt,
  };
}

/* =========================================================
   RENDER FORCE INPUTS
========================================================= */

function renderForces() {
  forcesElement.innerHTML = "";

  forceCountElement.textContent = `${enemies.length} thế lực`;

  enemies.forEach((enemy, index) => {
    const card = document.createElement("div");

    card.className = "force-card";

    card.innerHTML = `
      <div class="force-card-header">
        <div class="force-name-wrap">
          <span
            class="force-color"
            style="background:${COLORS[index % COLORS.length]}"
          ></span>

          <span class="force-number">
            Thế lực ${index + 1}
          </span>
        </div>

        <button
          class="remove-force"
          type="button"
          title="Xóa thế lực"
          data-remove-id="${enemy.id}"
        >
          ×
        </button>
      </div>

      <div class="force-fields">
        <div class="field">
          <label>Tên thế lực</label>

          <input
            class="input force-name"
            type="text"
            value="${escapeHtml(enemy.name)}"
            data-id="${enemy.id}"
          />
        </div>

        <div class="field">
          <label>X</label>

          <input
            class="input force-x"
            type="number"
            min="0"
            step="1"
            value="${enemy.x}"
            data-id="${enemy.id}"
          />
        </div>

        <div class="field">
          <label>Y</label>

          <input
            class="input force-y"
            type="number"
            min="0"
            step="1"
            value="${enemy.y}"
            data-id="${enemy.id}"
          />
        </div>
      </div>
    `;

    forcesElement.appendChild(card);
  });

  if (enemies.length === 0) {
    forcesElement.innerHTML = `
      <div class="empty-state">
        Chưa có thế lực nào.
      </div>
    `;
  }

  bindForceInputs();
  renderLegend();
}

function clearResult() {
  bestPosition = null;

  bestPositionElement.textContent = "—";
  bestAreaElement.textContent = "—";
  bestPercentElement.textContent = "—";

  statusElement.textContent = "";

  renderLegend();
}

function bindForceInputs() {
  document.querySelectorAll(".force-name").forEach((input) => {
    input.addEventListener("input", (event) => {
      const id = Number(event.target.dataset.id);

      const enemy = enemies.find((item) => item.id === id);

      if (!enemy) {
        return;
      }

      enemy.name = event.target.value || `Địch ${id}`;

      clearResult();
      saveData();

      renderLegend();
      drawCurrentMap();
    });
  });

  document.querySelectorAll(".force-x").forEach((input) => {
    input.addEventListener("input", (event) => {
      const id = Number(event.target.dataset.id);

      const enemy = enemies.find((item) => item.id === id);

      if (!enemy) {
        return;
      }

      const { width } = getMapSize();

      enemy.x = clamp(Number.parseInt(event.target.value, 10) || 0, 0, width);

      clearResult();
      saveData();

      drawCurrentMap();
    });
  });

  document.querySelectorAll(".force-y").forEach((input) => {
    input.addEventListener("input", (event) => {
      const id = Number(event.target.dataset.id);

      const enemy = enemies.find((item) => item.id === id);

      if (!enemy) {
        return;
      }

      const { height } = getMapSize();

      enemy.y = clamp(Number.parseInt(event.target.value, 10) || 0, 0, height);

      clearResult();
      saveData();

      drawCurrentMap();
    });
  });

  document.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.removeId);

      enemies = enemies.filter((enemy) => enemy.id !== id);

      clearResult();
      saveData();

      renderForces();
      drawCurrentMap();
    });
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   LEGEND
========================================================= */

function renderLegend() {
  let html = "";

  if (bestPosition) {
    html += `
      <div class="legend-item">
        <span
          class="legend-dot"
          style="background:#111827"
        ></span>

        Ta — vị trí tối ưu
      </div>
    `;
  }

  enemies.forEach((enemy, index) => {
    html += `
      <div class="legend-item">
        <span
          class="legend-dot"
          style="
            background:${COLORS[index % COLORS.length]}
          "
        ></span>

        ${escapeHtml(enemy.name || `Địch ${index + 1}`)}
      </div>
    `;
  });

  legendElement.innerHTML = html;
}

/* =========================================================
   CANVAS
========================================================= */

function getCanvasScale(mapWidth, mapHeight) {
  const padding = 0;

  return {
    scaleX: (CANVAS_SIZE - padding * 2) / mapWidth,

    scaleY: (CANVAS_SIZE - padding * 2) / mapHeight,
  };
}

/*
  Hệ tọa độ của Map Optimizer:

        Y
        ↑
        |
        |
        |
        +────────────→ X
       (0,0)

  Canvas lại có Y tăng từ trên xuống.

  Vì vậy:
      canvasY = (mapHeight - y) * scaleY
*/

function mapToCanvas(x, y, mapWidth, mapHeight) {
  const { scaleX, scaleY } = getCanvasScale(mapWidth, mapHeight);

  return {
    x: x * scaleX,

    y: (mapHeight - y) * scaleY,
  };
}

function drawBackground(mapWidth, mapHeight) {
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  gradient.addColorStop(0, "#f8fafc");

  gradient.addColorStop(1, "#eef2f7");

  ctx.fillStyle = gradient;

  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function drawGrid(mapWidth, mapHeight) {
  const { scaleX, scaleY } = getCanvasScale(mapWidth, mapHeight);

  const maxSize = Math.max(mapWidth, mapHeight);

  let gridStep = 25;

  if (maxSize <= 150) {
    gridStep = 10;
  } else if (maxSize <= 500) {
    gridStep = 25;
  } else if (maxSize <= 1000) {
    gridStep = 50;
  } else {
    gridStep = 100;
  }

  ctx.save();

  ctx.strokeStyle = "rgba(100, 116, 139, 0.14)";

  ctx.lineWidth = 1;

  /* Vertical grid lines */

  for (let x = 0; x <= mapWidth; x += gridStep) {
    const canvasX = x * scaleX;

    ctx.beginPath();

    ctx.moveTo(canvasX, 0);

    ctx.lineTo(canvasX, CANVAS_SIZE);

    ctx.stroke();
  }

  /* Horizontal grid lines */

  for (let y = 0; y <= mapHeight; y += gridStep) {
    /*
      Quan trọng:

      y của bản đồ tăng từ dưới lên,
      nên phải đảo Y khi vẽ Canvas.
    */
    const canvasY = (mapHeight - y) * scaleY;

    ctx.beginPath();

    ctx.moveTo(0, canvasY);

    ctx.lineTo(CANVAS_SIZE, canvasY);

    ctx.stroke();
  }

  ctx.restore();
}

function drawPolygon(polygon, mapWidth, mapHeight, color) {
  if (polygon.length < 3) {
    return;
  }

  ctx.beginPath();

  polygon.forEach((point, index) => {
    const canvasPoint = mapToCanvas(point.x, point.y, mapWidth, mapHeight);

    if (index === 0) {
      ctx.moveTo(canvasPoint.x, canvasPoint.y);
    } else {
      ctx.lineTo(canvasPoint.x, canvasPoint.y);
    }
  });

  ctx.closePath();

  ctx.fillStyle = color;

  ctx.globalAlpha = 0.18;

  ctx.fill();

  ctx.globalAlpha = 1;

  ctx.strokeStyle = color;

  ctx.lineWidth = 1.4;

  ctx.stroke();
}

function drawPoint(x, y, mapWidth, mapHeight, color, label, isTa = false) {
  const point = mapToCanvas(x, y, mapWidth, mapHeight);

  ctx.save();

  /* Shadow */

  ctx.beginPath();

  ctx.arc(point.x, point.y + 2, isTa ? 9 : 7, 0, Math.PI * 2);

  ctx.fillStyle = "rgba(15, 23, 42, 0.18)";

  ctx.fill();

  /* Outer ring */

  ctx.beginPath();

  ctx.arc(point.x, point.y, isTa ? 9 : 7, 0, Math.PI * 2);

  ctx.fillStyle = "#fff";

  ctx.fill();

  /* Main dot */

  ctx.beginPath();

  ctx.arc(point.x, point.y, isTa ? 6 : 5, 0, Math.PI * 2);

  ctx.fillStyle = color;

  ctx.fill();

  if (isTa) {
    ctx.strokeStyle = "#111827";

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.arc(point.x, point.y, 11, 0, Math.PI * 2);

    ctx.stroke();
  }

  /* Label */

  if (label) {
    const text = label;

    ctx.font = "600 12px Inter, sans-serif";

    const textWidth = ctx.measureText(text).width;

    const boxWidth = textWidth + 14;

    const boxHeight = 23;

    /*
      Nếu point nằm sát phía trên,
      label sẽ được đẩy xuống.
    */
    let boxX = point.x - boxWidth / 2;

    let boxY = point.y - 34;

    if (boxY < 4) {
      boxY = point.y + 12;
    }

    boxX = clamp(boxX, 4, CANVAS_SIZE - boxWidth - 4);

    ctx.fillStyle = "rgba(255,255,255,0.94)";

    ctx.strokeStyle = "rgba(148,163,184,0.45)";

    ctx.lineWidth = 1;

    roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 7);

    ctx.fill();

    ctx.stroke();

    ctx.fillStyle = "#0f172a";

    ctx.textAlign = "center";

    ctx.textBaseline = "middle";

    ctx.fillText(text, boxX + boxWidth / 2, boxY + boxHeight / 2);
  }

  ctx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();

  context.moveTo(x + radius, y);

  context.lineTo(x + width - radius, y);

  context.quadraticCurveTo(x + width, y, x + width, y + radius);

  context.lineTo(x + width, y + height - radius);

  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );

  context.lineTo(x + radius, y + height);

  context.quadraticCurveTo(x, y + height, x, y + height - radius);

  context.lineTo(x, y + radius);

  context.quadraticCurveTo(x, y, x + radius, y);

  context.closePath();
}

/* =========================================================
   COORDINATES
========================================================= */

function drawCoordinates(mapWidth, mapHeight) {
  ctx.save();

  ctx.font = "500 10px Inter, sans-serif";

  ctx.fillStyle = "rgba(71,85,105,0.75)";

  /*
    GÓC DƯỚI TRÁI
    = (0, 0)
  */
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";

  ctx.fillText("0, 0", 6, CANVAS_SIZE - 6);

  /*
    GÓC DƯỚI PHẢI
    = (mapWidth, 0)
  */
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  ctx.fillText(`${mapWidth}, 0`, CANVAS_SIZE - 6, CANVAS_SIZE - 6);

  /*
    GÓC TRÊN TRÁI
    = (0, mapHeight)
  */
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillText(`0, ${mapHeight}`, 6, 6);

  /*
    GÓC TRÊN PHẢI
    = (mapWidth, mapHeight)
  */
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  ctx.fillText(`${mapWidth}, ${mapHeight}`, CANVAS_SIZE - 6, 6);

  ctx.restore();
}

/* =========================================================
   MAP BORDER
========================================================= */

function drawMapBorder() {
  ctx.save();

  ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";

  ctx.lineWidth = 2;

  ctx.strokeRect(1, 1, CANVAS_SIZE - 2, CANVAS_SIZE - 2);

  ctx.restore();
}

/* =========================================================
   VORONOI RENDER
========================================================= */

function drawAllVoronoiCells(mapWidth, mapHeight) {
  if (bestPosition) {
    const taCell = getVoronoiCell(bestPosition, enemies, mapWidth, mapHeight);

    drawPolygon(taCell, mapWidth, mapHeight, "#111827");
  }

  enemies.forEach((enemy, index) => {
    const competitors = [
      bestPosition,
      ...enemies.filter((item) => item.id !== enemy.id),
    ].filter(Boolean);

    const cell = getVoronoiCell(enemy, competitors, mapWidth, mapHeight);

    drawPolygon(cell, mapWidth, mapHeight, COLORS[index % COLORS.length]);
  });
}

function drawCurrentMap() {
  const { width: mapWidth, height: mapHeight } = getMapSize();

  mapSizeBadge.textContent = `${mapWidth} × ${mapHeight}`;

  drawBackground(mapWidth, mapHeight);

  drawAllVoronoiCells(mapWidth, mapHeight);

  drawGrid(mapWidth, mapHeight);

  if (bestPosition) {
    drawPoint(
      bestPosition.x,
      bestPosition.y,
      mapWidth,
      mapHeight,
      "#111827",
      "Ta",
      true,
    );
  }

  enemies.forEach((enemy, index) => {
    drawPoint(
      enemy.x,
      enemy.y,
      mapWidth,
      mapHeight,
      COLORS[index % COLORS.length],
      enemy.name || `Địch ${index + 1}`,
    );
  });

  drawCoordinates(mapWidth, mapHeight);

  drawMapBorder();
}

/* =========================================================
   RESULT
========================================================= */

function renderResult(result, mapWidth, mapHeight) {
  if (!result || !result.best) {
    bestPositionElement.textContent = "Không tìm thấy";

    bestAreaElement.textContent = "—";

    bestPercentElement.textContent = "—";

    return;
  }

  const best = result.best;

  const totalArea = mapWidth * mapHeight;

  const percentage = (best.area / totalArea) * 100;

  bestPositionElement.textContent = `(${best.x}, ${best.y})`;

  bestAreaElement.textContent = `${roundNumber(best.area).toLocaleString(
    "vi-VN",
  )}`;

  bestPercentElement.textContent = `${roundNumber(percentage)}%`;

  statusElement.textContent = `Đã kiểm tra ${result.evaluatedCount.toLocaleString(
    "vi-VN",
  )} vị trí ứng viên trong ${Math.round(result.elapsed)} ms.`;
}

/* =========================================================
   EVENTS
========================================================= */

addForceBtn.addEventListener("click", () => {
  const { width, height } = getMapSize();

  const id = nextEnemyId++;

  enemies.push({
    id,
    name: `Địch ${id}`,
    x: Math.round(width / 2),
    y: Math.round(height / 2),
  });

  clearResult();

  saveData();

  renderForces();
  drawCurrentMap();
});

mapWidthInput.addEventListener("change", () => {
  const { width, height } = getMapSize();

  mapWidthInput.value = width;

  enemies.forEach((enemy) => {
    enemy.x = clamp(enemy.x, 0, width);
  });

  clearResult();

  saveData();

  mapSizeBadge.textContent = `${width} × ${height}`;

  drawCurrentMap();
});

mapHeightInput.addEventListener("change", () => {
  const { width, height } = getMapSize();

  mapHeightInput.value = height;

  enemies.forEach((enemy) => {
    enemy.y = clamp(enemy.y, 0, height);
  });

  clearResult();

  saveData();

  mapSizeBadge.textContent = `${width} × ${height}`;

  drawCurrentMap();
});

optimizeBtn.addEventListener("click", () => {
  const { width, height } = getMapSize();

  if (enemies.length === 0) {
    alert("Cần ít nhất 1 thế lực địch.");

    return;
  }

  /*
      Clamp enemy coordinates
    */

  enemies.forEach((enemy) => {
    enemy.x = clamp(Number(enemy.x) || 0, 0, width);

    enemy.y = clamp(Number(enemy.y) || 0, 0, height);
  });

  saveData();

  optimizeBtn.disabled = true;

  optimizeBtn.textContent = "Đang tìm vị trí...";

  statusElement.textContent = "Đang tính toán vùng kiểm soát...";

  /*
      Cho browser render trạng thái
      loading trước khi chạy thuật toán.
    */

  requestAnimationFrame(() => {
    setTimeout(() => {
      const result = findBestPosition(width, height, enemies);

      bestPosition = result.best;

      renderResult(result, width, height);

      renderLegend();

      drawCurrentMap();

      optimizeBtn.disabled = false;

      optimizeBtn.textContent = "Tìm vị trí tối ưu";
    }, 20);
  });
});

/* =========================================================
   INITIALIZE
========================================================= */

loadData();

renderForces();

renderLegend();

drawCurrentMap();
