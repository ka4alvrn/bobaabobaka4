const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let worldState = {
  currentWorldYear: START_YEAR,
  calamityOccurred: false,
  sevenPowers: cloneDefaultPowers(),
  teleportNodes: [],
  chronicles: [],
  dynastyHistory: []
};

let player = null;
let dynastyGeneration = 1;
let currentOpenedNpcId = null;
let currentBattle = null;
let currentActivityCategory = "all";
let currentShopCategory = "all";
let creationGender = "male";
let activeDungeon = null;
let confirmCallback = null;
let selectedMapRegion = "asura";
let currentTabId = "character";
let saveTimer = null;
let dunsRested = {};
let logHistory = [];
const MAX_LOG = 120;
const DUNGEON_RESTS_PER_RUN = 2;

function cloneDefaultPowers() {
  return SEVEN_GREAT_POWERS.map(p => ({ ...p, holderType: "npc" }));
}

const $ = (id) => document.getElementById(id);
const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtNum = (n) => Number(n || 0).toLocaleString("ru-RU");
const pluralYears = (n) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return "лет";
  if (b === 1) return "год";
  if (b >= 2 && b <= 4) return "года";
  return "лет";
};

function closeModalIfOpen(id) {
  const el = $(id);
  if (!el) return false;
  const hidden = !el.style.display || el.style.display === "none";
  if (hidden) return false;
  el.style.display = "none";
  return true;
}

// Первый год жизни нового героя: подарок рода начинающим
function grantBirthYearBonus() {
  if (!player) return;
  if (typeof player.birthYear !== "number") player.birthYear = worldState.currentWorldYear - (player.age || 0);
  if (player.birthYearBonus) return;
  player.birthYearBonus = true;
  player.hp = Math.min(player.maxHp, (player.hp || 0) + 40);
  player.mana = Math.min(player.maxMana, (player.mana || 0) + 20);
  player.potionsCount = (player.potionsCount || 0) + 2;
  player.coins = (player.coins || 0) + 30;
  log("🎁 Родня позаботилась о вас: +40 HP, +20 маны, +2 зелья и 30🪙 на первое время.");
}

// Кнопка «Назад» в Telegram: закрывает окно, а не сворачивает всю игру
function syncTelegramBackButton() {
  const bb = tg?.BackButton;
  if (!bb) return;
  const modals = ["story-modal", "destiny-modal", "year-summary-modal", "event-modal", "battle-modal", "dungeon-modal", "action-modal", "confirm-modal", "portrait-modal", "save-modal", "birth-modal"];
  const anyOpen = modals.some(id => $(id) && $(id).style.display && $(id).style.display !== "none");
  try { if (anyOpen) bb.show(); else bb.hide(); } catch (e) { /* Telegram может быть недоступен — не критично */ }
}

function handleTelegramBack() {
  const closers = [
    ["story-modal", closeStoryModal],
    ["destiny-modal", closeDestinyWindow],
    ["year-summary-modal", closeYearSummary],
    ["portrait-modal", closePortraitModal],
    ["save-modal", closeSaveModal],
    ["confirm-modal", closeConfirmModal],
    ["action-modal", closeActionModal],
    ["birth-modal", closeBirthModal]
  ];
  for (const [id, fn] of closers) {
    if (closeModalIfOpen(id)) { fn(); return; }
  }
  if (closeModalIfOpen("event-modal")) { log("Вы отложили решение до следующего года."); updateUI(); return; }
  if (closeModalIfOpen("dungeon-modal")) { closeDungeonModal(); return; }
  if (closeModalIfOpen("battle-modal")) {
    const fled = currentBattle && !currentBattle.isSevenPower && !currentBattle.isEndgame;
    if ($("battle-modal")) $("battle-modal").style.display = "none";
    currentBattle = null;
    log(fled ? "Вы покинули поле боя." : "Из судьбоносной битвы не сбежать — бой прерван.");
    updateUI();
    return;
  }
}

if (tg?.BackButton) {
  try { tg.BackButton.onClick(handleTelegramBack); } catch (e) {}
  const modalIds = ["story-modal", "destiny-modal", "year-summary-modal", "event-modal", "battle-modal", "dungeon-modal", "action-modal", "confirm-modal", "portrait-modal", "save-modal", "birth-modal"];
  try {
    const observer = new MutationObserver(() => syncTelegramBackButton());
    modalIds.forEach(id => { const el = $(id); if (el) observer.observe(el, { attributes: true, attributeFilter: ["style"] }); });
  } catch (e) { /* старые WebView без MutationObserver */ }
  setTimeout(syncTelegramBackButton, 0);
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") handleTelegramBack(); });

function getWorldEra(year) {
  return WORLD_ERAS.find(e => year <= e.maxYear) || WORLD_ERAS[WORLD_ERAS.length - 1];
}

function getTrainingMultiplier(p, exp) {
  let rankMul = 1.0;
  if (exp >= 1200) rankMul = 3.8;
  else if (exp >= 600) rankMul = 2.8;
  else if (exp >= 300) rankMul = 2.1;
  else if (exp >= 120) rankMul = 1.6;
  else if (exp >= 40) rankMul = 1.25;
  return rankMul * (p.raceObj?.learnMod || 1);
}

// =========================================================================
// ЗВУК (ИНТЕГРАЦИЯ С music.js) И TELEGRAM UX
// =========================================================================
function playSound(type) {
  if (typeof audioEngine === "undefined") return;
  const map = { sword: "hit", death: "hit", calamity: "hit", win: "levelup" };
  audioEngine.playSFX(map[type] || type);
}

function toggleSound() {
  if (typeof audioEngine === "undefined") return;
  const muted = audioEngine.toggleMute();
  setText("btn-sound-toggle", muted ? "🔇 Звук: ВЫКЛ" : "🔊 Звук: ВКЛ");
  if (!muted) playSound("click");
}

document.addEventListener("visibilitychange", () => {
  // Главное: не терять прогресс, если игрок свернул Telegram
  if (document.hidden && player) saveGame();
  if (typeof audioEngine === "undefined") return;
  if (document.hidden) audioEngine.stopMusic();
  else if (!audioEngine.isMuted) audioEngine.startMusic();
});

window.addEventListener("pagehide", () => { if (player) saveGame(); });

// =========================================================================
// ПОРТРЕТ ПЕРСОНАЖА (ЖИВОЙ SVG + ЗАГРУЗКА СВОЕГО ФОТО)
// =========================================================================
function buildPortraitHTML(p) {
  if (!p) return "";
  if (p.customAvatar) return `<img class="portrait-img" src="${p.customAvatar}" alt="Герой">`;

  const raceId = p.raceObj?.id || "human";
  const isOld = p.age >= 50, isKid = p.age < 12, isBaby = p.age < 4;
  const skinMap = { human: "#f3c6a5", elf: "#fae1d0", demon: "#cbb8e8", beast: "#e2b89b", speld: "#e8dfd5", dwarf: "#dfb092" };
  const skin = skinMap[raceId] || "#f3c6a5";

  let hair = p.gender === "female" ? "#8b4513" : "#5c3a21";
  if (raceId === "elf") hair = "#d1fae5";
  if (raceId === "demon") hair = "#3b82f6";
  if (raceId === "speld") hair = "#10b981";
  if (isOld) hair = "#cbd5e1";

  const bgGrad = p.dynastyFaction === "orsted" ? "#0f2942"
    : p.dynastyFaction === "hitogami" ? "#3b2c0a"
    : p.currentPowersSeat ? "#3b0d16" : "#1c2033";

  const armor = p.equipment?.armor?.id || "";
  const bodyColor = armor === "magic_armor" ? "#6366f1"
    : armor.includes("dragon") ? "#991b1b"
    : armor.includes("royal") ? "#d97706"
    : armor.includes("robe") ? "#4338ca"
    : armor ? "#475569" : "#334155";

  const leftEye = p.demonEyes?.left?.color || (raceId === "demon" ? "#a855f7" : "#1e293b");
  const rightEye = p.demonEyes?.right?.color || (raceId === "demon" ? "#a855f7" : "#1e293b");

  const ears = raceId === "elf"
    ? `<polygon points="14,34 4,28 15,40" fill="${skin}"/><polygon points="50,34 60,28 49,40" fill="${skin}"/>`
    : raceId === "beast"
    ? `<polygon points="17,24 14,8 27,18" fill="${hair}"/><polygon points="47,24 50,8 37,18" fill="${hair}"/>`
    : `<circle cx="15" cy="36" r="3.5" fill="${skin}"/><circle cx="49" cy="36" r="3.5" fill="${skin}"/>`;

  const horns = raceId === "demon"
    ? `<path d="M21,19 Q16,8 23,12 Z" fill="#4c1d95"/><path d="M43,19 Q48,8 41,12 Z" fill="#4c1d95"/>` : "";
  const gem = raceId === "speld" ? `<polygon points="32,21 35,25 32,29 29,25" fill="#ef4444"/>` : "";
  const hairSvg = isBaby
    ? `<path d="M28,17 Q32,10 35,17" stroke="${hair}" stroke-width="2.5" fill="none"/>`
    : p.gender === "female"
    ? `<path d="M15,36 Q14,12 32,12 Q50,12 49,36 L52,54 L12,54 Z" fill="${hair}"/>`
    : `<path d="M16,32 Q16,13 32,13 Q48,13 48,32 Q42,20 32,21 Q22,20 16,32 Z" fill="${hair}"/>`;

  const beard = (p.gender === "male" && (raceId === "dwarf" || isOld))
    ? `<path d="M22,44 Q32,56 42,44 L38,53 L26,53 Z" fill="${hair}" opacity="0.85"/>` : "";
  const scar = p.injuries?.length ? `<line x1="36" y1="36" x2="43" y2="42" stroke="#dc2626" stroke-width="1.5"/>` : "";
  const headR = isKid ? 15 : 16;
  const visor = armor === "magic_armor" ? `<rect x="18" y="30" width="28" height="7" rx="3" fill="rgba(56,189,248,0.28)" stroke="#38bdf8" stroke-width="1"/>` : "";

  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" fill="${bgGrad}"/>
    <path d="M10,64 Q12,48 32,48 Q52,48 54,64 Z" fill="${bodyColor}"/>
    ${p.gender === "female" ? hairSvg : ""}
    ${ears}
    <circle cx="32" cy="34" r="${headR}" fill="${skin}"/>
    ${p.gender === "male" ? hairSvg : `<path d="M17,30 Q22,14 32,15 Q42,14 47,30 Q39,21 32,22 Q25,21 17,30 Z" fill="${hair}"/>`}
    ${horns}${gem}${beard}${scar}
    <circle cx="25" cy="34" r="${isBaby ? 2.6 : 2.3}" fill="${leftEye}"/>
    <circle cx="39" cy="34" r="${isBaby ? 2.6 : 2.3}" fill="${rightEye}"/>
    ${p.demonEyes?.left ? `<circle cx="25" cy="34" r="4" fill="none" stroke="${leftEye}" stroke-width="1" opacity="0.6"/>` : ""}
    ${p.demonEyes?.right ? `<circle cx="39" cy="34" r="4" fill="none" stroke="${rightEye}" stroke-width="1" opacity="0.6"/>` : ""}
    <path d="M28,42 Q32,45 36,42" stroke="#7c2d12" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    ${visor}
  </svg>`;
}

function updatePortraitUI() {
  if (!player) return;
  const html = buildPortraitHTML(player);
  if ($("char-portrait")) $("char-portrait").innerHTML = html;
  const wrap = $("char-portrait-wrap");
  if (wrap) {
    wrap.className = "char-portrait-wrap";
    if (player.currentPowersSeat) wrap.classList.add("portrait-aura-powers");
    else if (player.dynastyFaction === "orsted") wrap.classList.add("portrait-aura-orsted");
    else if (player.dynastyFaction === "hitogami") wrap.classList.add("portrait-aura-hitogami");
  }
}

function openPortraitModal() {
  if (!player) return;
  const prev = $("portrait-modal-preview");
  if (prev) prev.innerHTML = `<div class="char-portrait-wrap" style="width:96px; height:96px;">${buildPortraitHTML(player)}</div>`;
  if ($("btn-reset-avatar")) $("btn-reset-avatar").style.display = player.customAvatar ? "block" : "none";
  if ($("portrait-modal")) $("portrait-modal").style.display = "flex";
}
function closePortraitModal() { if ($("portrait-modal")) $("portrait-modal").style.display = "none"; }
function triggerAvatarUpload() { $("avatar-upload")?.click(); }
function resetCustomAvatar() {
  if (!player) return;
  player.customAvatar = null;
  updatePortraitUI(); openPortraitModal(); saveGame();
}

function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file || !player) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 140; c.height = 140;
      const ctx = c.getContext("2d");
      const min = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, 140, 140);
      player.customAvatar = c.toDataURL("image/jpeg", 0.72);
      updatePortraitUI(); openPortraitModal(); saveGame();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

// =========================================================================
// УНИВЕРСАЛЬНЫЕ МОДАЛКИ И ЛОГИ
// =========================================================================
function showActionModal(title, text, icon = "⚡") {
  setText("action-modal-icon", icon);
  setText("action-modal-title", title);
  if ($("action-modal-body")) $("action-modal-body").innerHTML = text;
  if ($("action-modal")) $("action-modal").style.display = "flex";
}
function closeActionModal() { if ($("action-modal")) $("action-modal").style.display = "none"; playSound("click"); }
// Показываем актуальную подпись кнопки звука при старте
if (typeof audioEngine !== "undefined") {
  setText("btn-sound-toggle", audioEngine.isMuted ? "🔇 Звук: ВЫКЛ" : "🔊 Звук: ВКЛ");
}

function askConfirm(title, text, onYes) {
  setText("confirm-modal-title", title);
  if ($("confirm-modal-body")) $("confirm-modal-body").innerHTML = text;
  confirmCallback = onYes;
  if ($("confirm-modal-yes")) $("confirm-modal-yes").onclick = () => { closeConfirmModal(); if (confirmCallback) confirmCallback(); };
  if ($("confirm-modal")) $("confirm-modal").style.display = "flex";
}
function closeConfirmModal() { if ($("confirm-modal")) $("confirm-modal").style.display = "none"; }

function showBirthModal() {
  if (!player) return;
  const era = getWorldEra(worldState.currentWorldYear);
  if ($("birth-portrait")) $("birth-portrait").innerHTML = `<div class="char-portrait-wrap" style="width:76px; height:76px;">${buildPortraitHTML(player)}</div>`;
  if ($("birth-card-content")) {
    $("birth-card-content").innerHTML = `
      <div><b>Имя:</b> ${esc(player.name)} (${player.gender === "male" ? "♂️" : "♀️"})</div>
      <div><b>Год и Эпоха:</b> ${worldState.currentWorldYear} г. К.Д. (${era.name})</div>
      <div><b>Раса:</b> ${player.race} (предел жизни ~${player.maxAge} лет)</div>
      <div><b>Регион:</b> ${REGIONS[player.currentRegionKey]?.name}</div>
      <div><b>Сословие и род:</b> ${player.familyStatus.name} • ${player.origin}</div>
      <div><b>Благословение:</b> ${player.trait.name}</div>
      <div><b>Стартовый сосуд маны:</b> ${player.maxMana} • <b>Золото:</b> ${player.coins}🪙</div>
    `;
  }
  if ($("birth-modal")) $("birth-modal").style.display = "flex";
}
function closeBirthModal() { if ($("birth-modal")) $("birth-modal").style.display = "none"; playSound("click"); }

function log(msg) {
  const box = $("logs");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "log-entry";
  el.innerHTML = `<span class="log-year">[${player ? player.age : 0} л. | ${worldState.currentWorldYear} г.]</span> ${msg}`;
  box.appendChild(el);
  // Лог больше не хранится в сейве — держим в памяти последние записи
  if (!Array.isArray(logHistory)) logHistory = [];
  logHistory.push({ age: player ? player.age : 0, year: worldState.currentWorldYear, text: msg });
  if (logHistory.length > MAX_LOG) logHistory.splice(0, logHistory.length - MAX_LOG);
  while (box.children.length > MAX_LOG) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
  try { tg?.HapticFeedback?.impactOccurred("light"); } catch (e) {}
}

// Восстановление ленты событий из сейва (без хранения HTML)
function renderLogHistory() {
  const box = $("logs");
  if (!box) return;
  box.innerHTML = "";
  const items = (logHistory || []).slice(-MAX_LOG);
  for (const it of items) {
    const el = document.createElement("div");
    el.className = "log-entry";
    el.innerHTML = `<span class="log-year">[${it.age} л. | ${it.year} г.]</span> ${it.text}`;
    box.appendChild(el);
  }
  box.scrollTop = box.scrollHeight;
}

// =========================================================================
// КАРМА И ПЛОТНАЯ ФОРМУЛА БМ (100 -> 100,000)
// =========================================================================
function getReincarnationKarma() {
  try { return parseInt(localStorage.getItem("bit_tensei_karma") || "0", 10); } catch { return 0; }
}
function addReincarnationKarma() {
  const k = getReincarnationKarma() + 1;
  try { localStorage.setItem("bit_tensei_karma", String(k)); } catch {}
  return k;
}
function getMaxAP(age) { return age <= 3 ? 5 : age <= 9 ? 8 : age <= 15 ? 10 : 12; }

function getItemPower(item) {
  if (!item) return 0;
  return Math.round((item.cp || 0) * (1 + (item.forgeLevel || 0) * 0.15));
}

function calcCombatPower(p) {
  if (!p) return 0;
  let cp = (p.hp || 0) * 0.6 + (p.maxMana || 0) * 0.9 + (p.magicExp + p.swordGodExp + p.waterGodExp + p.northGodExp) * 2.4 + (p.intellect || 0) * 1.8;
  ["weapon", "armor", "accessory"].forEach(s => { cp += getItemPower(p.equipment?.[s]); });
  if (p.demonEyes?.left) cp += p.demonEyes.left.cp || 0;
  if (p.demonEyes?.right) cp += p.demonEyes.right.cp || 0;
  if (p.castleUpgrades?.includes("trophy_hall")) cp += 1200;
  if (p.perugiusTrials?.includes(2)) cp += 2500;
  if (p.injuries?.some(i => i.id === "lost_arm") && p.equipment?.accessory?.id !== "prosthetic_arm") cp = Math.floor(cp * 0.72);
  const karma = getReincarnationKarma();
  if (karma > 0) {
    const bonus = Math.min(BALANCE.karma.cpBonusMax, karma * BALANCE.karma.cpBonusPerLevel);
    cp = Math.floor(cp * (1 + bonus));
  }
  const cap = p.trait?.id === "god_mode" ? 999999 : (GENERATION_CP_CAPS[p.generation] || 120000);
  return Math.min(cap, Math.floor(cp));
}

function calcSquadCombatPower(p) {
  return !p ? 0 : calcCombatPower(p) + (p.squad || []).reduce((s, m) => s + (m.cp || 400), 0);
}

function calculateRank(exp, list) {
  if (exp >= 1200) return list[6] || list[list.length - 1];
  if (exp >= 600) return list[5] || list[list.length - 1];
  if (exp >= 300) return list[4] || list[list.length - 1];
  if (exp >= 120) return list[3] || list[list.length - 1];
  if (exp >= 40) return list[2] || list[list.length - 1];
  if (exp >= 10) return list[1] || list[0];
  return list[0];
}

function getBardNickname(p, cp) {
  if (p.age <= 3) return cp >= 500 ? "Дитя с аурой легенды" : "Младенец в колыбели";
  if (p.currentPowersSeat) return `Владыка #${p.currentPowersSeat} Семи Сил`;
  if (p.reputation <= -30) return "Тень Шестиликого Мира";
  if (p.trait?.id === "silent_cast" && p.magicExp >= 120) return "Беззвучный Архимаг";
  if (p.swordGodExp >= p.magicExp && p.swordGodExp >= 300) return "Алый Клинок";
  if (p.magicExp >= 300) return "Повелитель Стихий";
  if (cp >= 20000) return "Живая Легенда Эпохи";
  if (cp >= 2500) return "Святой Мастер";
  if (cp >= 600) return "Восходящий Воин";
  return "Юный Путник";
}

// =========================================================================
// СОЗДАНИЕ ПЕРСОНАЖА
// =========================================================================
function setCreationGender(g) {
  creationGender = g;
  $("btn-gender-male")?.classList.toggle("active", g === "male");
  $("btn-gender-female")?.classList.toggle("active", g === "female");
  randomizeNameInputs(); playSound("click");
}

function randomizeNameInputs() {
  const list = SYLLABLES[creationGender];
  const n = list[Math.floor(Math.random() * list.length)] + (Math.random() > 0.45 ? SYLLABLES.suffix[Math.floor(Math.random() * SYLLABLES.suffix.length)] : "");
  const s = SYLLABLES.surnames[Math.floor(Math.random() * SYLLABLES.surnames.length)];
  if ($("input-name")) $("input-name").value = n;
  if ($("input-surname")) $("input-surname").value = s;
}

function updateRaceInfo() {
  const r = RACES[$("select-race")?.value] || RACES.human;
  setText("race-desc", `${r.desc} (Мана: ${r.bonus.baseMana}, Жизнь: ~${r.maxAge} лет)`);
}

function onRegionChange() {
  const key = $("select-region")?.value || "asura";
  const reg = REGIONS[key] || REGIONS.asura;
  if ($("select-origin")) $("select-origin").innerHTML = reg.origins.map(o => `<option value="${o.id}">${o.name}</option>`).join("");
  const statuses = REGION_FAMILY_STATUSES[key] || FAMILY_STATUSES;
  if ($("select-family-status")) $("select-family-status").innerHTML = statuses.map(f => `<option value="${f.id}">${f.name} — ${f.desc}</option>`).join("");
}


/* ══════════════════════════════════════════════════════════
   СЛОЖНОСТЬ
   Одна игра не может быть одинаково интересной всем:
   кому-то нужен вызов, кому-то — история. Три режима,
   и они меняют не только цифры, но и жёсткость мира.
   ══════════════════════════════════════════════════════════ */

const DIFFICULTIES = {
  easy: {
    id: "easy", icon: "🌿", name: "Спокойная",
    desc: "Щедрее золото, добрее враги, медленнее старость.",
    coinsMult: 1.5, enemyMult: 0.8, decayMult: 0.6, eventHarmMult: 0.7,
    ageBonus: 8, xpMult: 1.25, hireCostMult: 0.8
  },
  normal: {
    id: "normal", icon: "⚖️", name: "Обычная",
    desc: "Так, как задумано.",
    coinsMult: 1, enemyMult: 1, decayMult: 1, eventHarmMult: 1,
    ageBonus: 0, xpMult: 1, hireCostMult: 1
  },
  hard: {
    id: "hard", icon: "🔥", name: "Суровая",
    desc: "Меньше золота, злее враги, быстрее старость.",
    coinsMult: 0.65, enemyMult: 1.3, decayMult: 1.5, eventHarmMult: 1.3,
    ageBonus: -8, xpMult: 0.85, hireCostMult: 1.25
  }
};

let chosenDifficulty = "normal";

function currentDifficulty() {
  return DIFFICULTIES[player?.difficulty || chosenDifficulty] || DIFFICULTIES.normal;
}

function setDifficulty(id) {
  if (!DIFFICULTIES[id]) return;
  chosenDifficulty = id;
  document.querySelectorAll(".diff-btn").forEach(b => b.classList.toggle("active", b.dataset.diff === id));
}

// Применяется на старте жизни: предел жизни, стартовое золото
function applyDifficultyToNewLife() {
  const d = DIFFICULTIES[chosenDifficulty] || DIFFICULTIES.normal;
  player.difficulty = d.id;
  player.maxAge = Math.max(30, (player.maxAge || 75) + d.ageBonus);
  return d;
}

function difficultyLabel() {
  const d = currentDifficulty();
  return `<span class="diff-badge" title="${esc(d.desc)}">${d.icon} ${d.name}</span>`;
}

function showCreation() {
  if ($("select-race")) $("select-race").innerHTML = Object.entries(RACES).map(([k, r]) => `<option value="${k}">${r.name}</option>`).join("");
  if ($("select-region")) $("select-region").innerHTML = Object.entries(REGIONS).map(([k, r]) => `<option value="${k}">${r.name}</option>`).join("");
  if ($("select-trait")) $("select-trait").innerHTML = TRAITS.map(t => `<option value="${t.id}">${t.name} (${t.desc})</option>`).join("");

  const era = getWorldEra(worldState.currentWorldYear);
  setText("creation-world-era-hint", `📅 Текущий год мира: ${worldState.currentWorldYear} г. К.Д. • ${era.name}`);
  if ($("btn-creation-reset-world")) $("btn-creation-reset-world").style.display = (worldState.currentWorldYear > START_YEAR || worldState.chronicles.length > 0) ? "block" : "none";

  updateRaceInfo(); onRegionChange(); randomizeNameInputs();
  if ($("creation-overlay")) $("creation-overlay").style.display = "flex";
}

function confirmCreation() {
  const cleanName = (raw, fallback, max) => {
    const v = String(raw || "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
    return v || fallback;
  };
  const fName = cleanName($("input-name")?.value, creationGender === "male" ? "Рудеус" : "Эрис", 16);
  const sName = cleanName($("input-surname")?.value, "Грейрат", 16);
  const race = RACES[$("select-race")?.value] || RACES.human;
  const regKey = $("select-region")?.value || "asura";
  const reg = REGIONS[regKey] || REGIONS.asura;
  const origin = reg.origins.find(o => o.id === $("select-origin")?.value) || reg.origins[0];
  const trait = TRAITS.find(t => t.id === $("select-trait")?.value) || TRAITS[0];
  const famList = REGION_FAMILY_STATUSES[regKey] || FAMILY_STATUSES;
  const famStatus = famList.find(f => f.id === $("select-family-status")?.value) || famList[0];

  initCharacter(fName, sName, creationGender, race, regKey, origin, trait, famStatus, 0);
  if ($("creation-overlay")) $("creation-overlay").style.display = "none";
  playSound("win"); showBirthModal();
}

function randomCreation() {
  creationGender = Math.random() > 0.5 ? "male" : "female";
  $("btn-gender-male")?.classList.toggle("active", creationGender === "male");
  $("btn-gender-female")?.classList.toggle("active", creationGender === "female");
  randomizeNameInputs();
  const rKeys = Object.keys(RACES), regKeys = Object.keys(REGIONS);
  const race = RACES[rKeys[Math.floor(Math.random() * rKeys.length)]];
  const regKey = regKeys[Math.floor(Math.random() * regKeys.length)];
  const origin = REGIONS[regKey].origins[Math.floor(Math.random() * REGIONS[regKey].origins.length)];
  const poolTraits = TRAITS.filter(t => t.id !== "god_mode");
  const trait = poolTraits[Math.floor(Math.random() * poolTraits.length)];
  const famList = REGION_FAMILY_STATUSES[regKey] || FAMILY_STATUSES;
  const fam = famList[Math.floor(Math.random() * famList.length)];
  initCharacter($("input-name")?.value || "Рудеус", $("input-surname")?.value || "Грейрат", creationGender, race, regKey, origin, trait, fam, 0);
  if ($("creation-overlay")) $("creation-overlay").style.display = "none";
  playSound("win"); showBirthModal();
}

function initCharacter(fName, sName, gender, race, regionKey, origin, trait, familyStatus, startAge = 0, customRelations = null) {
  const karma = getReincarnationKarma(), isGod = trait?.id === "god_mode";
  const baseMana = isGod ? 9999 : Math.round(((race.bonus.baseMana || 25) + (origin.manaBonus || 0) + (trait.manaBonus || 0) + (familyStatus.manaBonus || 0) + karma * BALANCE.karma.startManaPerLevel) * (race.bonus.manaMod || 1)) + (startAge > 5 ? Math.min(180, startAge * 6) : 0);
  const baseHp = isGod ? 9999 : 100 + (trait.hp || 0) + (race.bonus.hp || 0) + (familyStatus.hp || 0) + karma * 8;

  const fatherName = SYLLABLES.male[Math.floor(Math.random() * SYLLABLES.male.length)] + " " + sName;
  const motherName = SYLLABLES.female[Math.floor(Math.random() * SYLLABLES.female.length)] + " " + sName;

  player = {
    name: `${fName} ${sName}`, firstName: fName, surname: sName, gender,
    generation: dynastyGeneration,
    birthYear: worldState.currentWorldYear - startAge,
    isFirstEraLife: !worldState.calamityOccurred && dynastyGeneration === 1 && worldState.currentWorldYear <= 425,
    race: race.name, raceObj: race, maxAge: isGod ? 999 : Math.max(30, race.maxAge + (DIFFICULTIES[chosenDifficulty]?.ageBonus || 0)),
    difficulty: chosenDifficulty,
    regionKey, currentRegionKey: regionKey, origin: origin.name, trait, familyStatus,
    customAvatar: null,
    age: startAge, ap: getMaxAP(startAge), maxAp: getMaxAP(startAge),
    hp: baseHp, maxHp: baseHp, mana: baseMana, maxMana: baseMana,
    magicExp: isGod ? 1500 : (startAge > 5 ? startAge * 4 : 0),
    swordGodExp: isGod ? 1500 : (origin.swordGod || 0) + (trait.swordGod || 0) + (race.bonus.swordGod || 0) + (familyStatus.swordGod || 0) + (startAge > 5 ? startAge * 3 : 0),
    waterGodExp: isGod ? 1500 : (origin.waterGod || 0) + (trait.waterGod || 0) + (startAge > 5 ? startAge * 3 : 0),
    northGodExp: isGod ? 1500 : (origin.northGod || 0) + (trait.northGod || 0) + (race.bonus.northGod || 0) + (familyStatus.northGod || 0) + (startAge > 5 ? startAge * 3 : 0),
    intellect: isGod ? 500 : 10 + (origin.int || 0) + (trait.int || 0) + (race.bonus.int || 0) + (familyStatus.int || 0) + startAge * 2,
    coins: isGod ? 99999 : Math.round(((origin.coins || 0) + (race.bonus.coins || 0) + (familyStatus.coins || 0)) * (DIFFICULTIES[chosenDifficulty]?.coinsMult || 1)),
    reputation: 0,
    guildRank: isGod ? "S" : "F", guildExp: 0, guildQuestsThisYear: [], dungeonProgress: {},
    enrolledSchool: null, schoolProgress: 0, graduatedSchools: [],
    squad: [], squadFame: isGod ? 2000 : 0,
    estates: [], familySeat: null, castleUpgrades: [], lastCryptMeditationAge: -10,
    appointedHeirId: null, heirloomSlot: null,
    discoveredSevenPowers: [], currentPowersSeat: null,
    injuries: [], demonEyes: { left: null, right: null },
    languages: ["human"], tabletsDeciphered: [], perugiusTrials: [], greyratAllies: [],
    canonQuestsDone: [],
    currentJob: null, jobRankIndex: 0, currentUndergroundJob: null, undergroundRankIndex: 0,
    nobilityTitle: "citizen", asuraFaction: null, asuraInfluence: familyStatus.influence || 0,
    calamityTriggered: false, storyCompleted: [],
    dynastyFaction: "neutral", factionProgress: 0, hitogamiTrust: 0, hitogamiPricePaid: false,
    pregnancy: null, equipment: { weapon: null, armor: null, accessory: null },
    inventory: [], potionsCount: 2,
    relations: customRelations || [
      { id: "father", name: fatherName, gender: "male", race: race.name, age: startAge + 24, role: "Отец • Глава дома", cp: 650, relation: 85, status: "Семья", isFamily: true, isDead: false },
      { id: "mother", name: motherName, gender: "female", race: race.name, age: startAge + 22, role: "Мать • Хранительница", cp: 450, relation: 95, status: "Семья", isFamily: true, isDead: false }
    ],
    spouse: null, children: [], socialAp: 3
  };

  selectedMapRegion = regionKey;
  ensureStoryState();
  ensureSevenPowersLore();
  generateYearlyGuildQuests();
  if ($("logs")) $("logs").innerHTML = "";
  logHistory = [];
  log(`🌍 Воплощение: <b>${player.race}</b> (${gender === "male" ? "♂️" : "♀️"}) в <b>${REGIONS[regionKey].name}</b> (${worldState.currentWorldYear} г. К.Д.).`);
  log(`🏛️ Семья: <b>${familyStatus.name}</b> • ${origin.log}`);
  if (karma > 0) log(`✨ Карма Сансары ур. ${karma}.`);
  grantBirthYearBonus();
  yearSnapshot = takeYearSnapshot();
  updateUI();
}

// =========================================================================
// ОТРИСОВКА ИНТЕРФЕЙСА
// =========================================================================
function renderUI() {
  if (!player) return;
  const era = getWorldEra(worldState.currentWorldYear);
  updatePortraitUI();

  setText("char-gender-icon", player.gender === "male" ? "♂️" : "♀️");
  setText("char-name", player.name);
  setText("char-region", `${player.race} • ${REGIONS[player.currentRegionKey]?.name} 🗺️`);
  setText("char-family-status-badge", player.familyStatus.name);
  setText("world-year", `${worldState.currentWorldYear} г. К.Д.`);
  setText("world-era-badge", era.name);
  setText("age", `${player.age} лет`);

  const apBadge = $("char-ap");
  if (apBadge) {
    apBadge.innerText = `⚡ ${player.ap}/${player.maxAp} сил`;
    apBadge.style.background = player.ap === 0 ? "rgba(239,68,68,0.2)" : "#312e81";
  }

  const traitEl = $("char-trait");
  if (traitEl) { traitEl.innerText = player.trait.name; traitEl.className = `tag badge-${player.trait.rarity || "common"}`; }

  const cp = calcCombatPower(player);
  setText("char-cp", cp.toLocaleString());
  const cap = player.trait.id === "god_mode" ? 999999 : (GENERATION_CP_CAPS[player.generation] || 120000);
  setText("char-cp-cap-hint", cp >= cap ? `[Предел ${player.generation}-го рода: ${cap.toLocaleString()}]` : `Потолок ${player.generation}-го рода: ${cap.toLocaleString()}`);

  setText("char-guild-badge", player.age >= 10 ? `Ранг ${player.guildRank}` : "Гильдия: с 10 л.");
  const nick = getBardNickname(player, cp);
  setText("char-world-rank", nick);
  setText("bard-fame-text", `Молва бардов: «${player.firstName} — ${nick}» (БМ ${cp.toLocaleString()})`);

  ["left", "right"].forEach(side => {
    const el = $(`eye-${side}`), eye = player.demonEyes?.[side];
    if (el) {
      el.className = eye ? "eye-slot active" : "eye-slot";
      el.innerText = eye ? eye.name : `👁️ ${side === "left" ? "Левый" : "Правый"}: Обычный`;
    }
  });
  setText("char-languages-text", player.languages.map(l => LANGUAGES[l]?.name || l).join(", "));

  const seatObj = ESTATES.find(e => e.id === player.familySeat);
  const regen = (seatObj ? seatObj.hpRegen : 5) + (player.trait.id === "miko_healing" ? 25 : 0);
  setText("hp-regen-hint", `(+${regen} HP/г.)`);
  setText("hp-text", `${player.hp}/${player.maxHp}`);
  if ($("hp-bar")) $("hp-bar").style.width = `${Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))}%`;

  const isLaplace = player.trait.id === "laplace_factor" || player.trait.id === "god_mode";
  setText("mana-status", (player.age <= 10 || isLaplace) ? "(Пластичны ✨)" : "(Затвердели 🔒)");
  setText("mana-text", `${player.mana}/${player.maxMana}`);
  if ($("mana-bar")) $("mana-bar").style.width = `${Math.min(100, (player.mana / player.maxMana) * 100)}%`;

  if ($("injuries-banner")) {
    $("injuries-banner").style.display = player.injuries.length ? "block" : "none";
    $("injuries-banner").innerHTML = player.injuries.map(i => `<span class="badge-mythic" style="margin-right:4px;">⚠️ ${i.name}</span>`).join("");
  }

  if ($("estate-residence-badge")) $("estate-residence-badge").innerHTML = seatObj
    ? `<span class="tag badge-rare">🏰 Замок: ${seatObj.name}</span>`
    : `<span style="font-size:10px; color:var(--muted);">🏡 Нет назначенного замка</span>`;

  if ($("powers-seat-badge")) $("powers-seat-badge").innerHTML = player.currentPowersSeat
    ? `<span class="tag badge-mythic">🏆 Владыка #${player.currentPowersSeat} Семи Сил</span>` : "";

  if ($("job-badge-container")) {
    let html = "";
    if (player.currentJob) {
      const r = getJobDataById(player.currentJob)?.ranks[player.jobRankIndex];
      if (r) html += `<span class="tag badge-rare" style="margin-right:4px;">💼 ${r.title} (+${r.salary}🪙/г.)</span>`;
    }
    if (player.currentUndergroundJob) {
      const ur = UNDERGROUND_JOBS[player.currentRegionKey]?.ranks[player.undergroundRankIndex];
      if (ur) html += `<span class="tag badge-mythic">🗡️ ${ur.title} (+${ur.salary}🪙/г.)</span>`;
    }
    $("job-badge-container").innerHTML = html || `<span style="font-size:10px; color:var(--muted);">💼 Без постоянной службы</span>`;
  }

  const titleObj = ASURA_POLITICS.nobilityTitles.find(t => t.id === player.nobilityTitle) || ASURA_POLITICS.nobilityTitles[0];
  const fMap = { ariel: "Ариэль 👑", prince_first: "1-й Принц 🦁", prince_second: "2-й Принц 🐍" };
  if ($("politics-badge-container")) $("politics-badge-container").innerHTML =
    `<span class="tag badge-epic">👑 ${titleObj.name} • ${fMap[player.asuraFaction] || "Вне политики"} (Влияние: ${player.asuraInfluence})</span>`;

  const facMap = {
    orsted: `<span class="tag badge-rare">🐉 Знамя Орстеда (Прогресс: ${player.factionProgress})</span>`,
    hitogami: `<span class="tag badge-legendary">👁️ Апостол Хитогами (Доверие: ${player.hitogamiTrust})</span>`,
    neutral: `<span style="font-size:10px; color:var(--muted);">⚖️ Сторона Богов: Не выбрана</span>`
  };
  if ($("faction-badge-container")) $("faction-badge-container").innerHTML = facMap[player.dynastyFaction] || facMap.neutral;

  if ($("reputation-badge-container")) {
    const rep = player.reputation || 0;
    const repHtml = rep >= 20 ? `<span class="tag badge-rare">✨ Светлый Герой (+${rep})</span>`
      : rep <= -20 ? `<span class="tag badge-mythic">🩸 Тень Подполья (${rep})</span>`
      : `<span style="font-size:10px; color:var(--muted);">⚖️ Репутация: Нейтральная (${rep})</span>`;
    $("reputation-badge-container").innerHTML = repHtml;
  }

  const lost = player.relations.filter(r => r.isLost);
  if ($("calamity-status-banner")) {
    $("calamity-status-banner").style.display = lost.length ? "block" : "none";
    if (lost.length) $("calamity-status-banner").innerHTML = `<div style="background:#450a0a; border:1px solid #ef4444; border-radius:8px; padding:6px; font-size:11px; color:#fca5a5;">⚡ Пропали: ${lost.map(r => r.name).join(", ")}. Ищите их во вкладке «Мир & Род»!</div>`;
  }

  setText("magic", calculateRank(player.magicExp, MAGIC_RANKS));
  setText("sword-god", calculateRank(player.swordGodExp, SWORD_RANKS));
  setText("water-god", calculateRank(player.waterGodExp, SWORD_RANKS));
  setText("north-god", calculateRank(player.northGodExp, SWORD_RANKS));
  setText("intellect", player.intellect);
  setText("coins", player.coins.toLocaleString());

  const fmtSlot = (it, def) => it ? `${it.name}${it.forgeLevel ? ` [+${it.forgeLevel}]` : ""}` : def;
  setText("slot-weapon", fmtSlot(player.equipment.weapon, "Кулаки"));
  setText("slot-armor", fmtSlot(player.equipment.armor, "Одежда"));
  setText("slot-accessory", fmtSlot(player.equipment.accessory, "Нет"));

  renderLifeStorySection();
  renderSevenPowersQuest();
  renderEndgameFactionSection();
}

function updateUI() {
  if (player) checkGuildRankUp(true);
  renderUI();
  saveGame();
  if (typeof renderTutorialHint === "function") renderTutorialHint();
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  $(`tab-${tabId}`)?.classList.add("active");
  const idx = { character: 0, activities: 1, inventory: 2, guild: 3, relations: 4 }[tabId];
  document.querySelectorAll(".nav-item")[idx]?.classList.add("active");

  if (tabId === "activities") renderActivities();
  if (tabId === "inventory") { renderInventoryTab(); renderForge(); if (typeof renderAlchemy === "function") renderAlchemy(); renderTestament(); renderFamilyCastle(); renderEstates(); renderCaravans(); }
  if (tabId === "guild") { renderGuildTab(); renderSquad(); }
  if (tabId === "relations") { renderRelations(); renderTravelTab(); renderChaosBreaker(); renderGreyratBranches(); renderTablets(); renderLanguages(); }
  playSound("click");
}

function setWorldSubTab(sub, btnEl) {
  ["relations", "travel", "perugius", "greyrat", "tablets", "politics", "tree", "diary", "achieve", "languages", "schools"].forEach(t => {
    const el = $(`world-sub-${t}`);
    if (el) el.style.display = t === sub ? "block" : "none";
  });
  btnEl?.parentElement?.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
  btnEl?.classList.add("active");
  ({ relations: renderRelations, travel: renderTravelTab, perugius: renderChaosBreaker, greyrat: renderGreyratBranches, tablets: renderTablets, politics: renderPolitics, tree: () => { renderTitles(); renderDynastyTree(); }, achieve: renderAchievements, diary: () => { renderCurrentLifeDiary(); renderDynastyDiary(); }, languages: renderLanguages, schools: renderSchools })[sub]?.();
  playSound("click");
}

function jumpToWorldMap() {
  switchTab("relations");
  const mapBtn = document.querySelector("#tab-relations .sub-tab-btn:nth-child(2)");
  setWorldSubTab("travel", mapBtn);
}

// =========================================================================
// СОБЫТИЯ ВЕКА: раз в 30-50 лет мир переворачивается
// =========================================================================
// Это не случайная встреча на дороге. Это событие, которое меняет карту,
// цены, доступные истории и остаётся в памяти поколений.

const CENTURY_EVENTS = [
  {
    id: "great_war", icon: "⚔️", title: "Война Шести Корон",
    minYear: 440, cooldown: 40,
    desc: "Пять королевств и Демонический Континент объявили друг другу войну одновременно. Такого не было со времён Катаклизма.",
    world: "war_all",
    chronicle: "Началась Война Шести Корон — все регионы вступили в войну.",
    choices: [
      { text: "Воевать за корону", effect: (p) => { p.swordGodExp += 120; p.squadFame += 200; p.reputation += 20; return "Вы вернулись с войны с именем и без иллюзий (+120 меча, +200 славы)."; } },
      { text: "Защищать свой дом", effect: (p) => { p.maxHp += 100; p.hp = p.maxHp; (p.estates || []).length; p.reputation += 10; return "Вы не ушли на войну — вы держали ворота. Дом выстоял (+100 HP навсегда)."; } },
      { text: "Продавать оружие обеим сторонам", effect: (p) => { p.coins += 2000; p.reputation -= 25; return "Война кормит тех, кто умеет считать (+2000🪙, −25 репутации)."; } }
    ]
  },
  {
    id: "plague_world", icon: "🦠", title: "Великий мор",
    minYear: 470, cooldown: 45,
    desc: "Болезнь пришла из портов и пошла по трактам. Умирают в каждом втором доме, лекари не спят неделями.",
    world: "plague_all",
    chronicle: "Великий мор прошёл по Шестиликому Миру.",
    choices: [
      { text: "Лечить всех, кто приходит", effect: (p) => { p.intellect += 60; p.reputation += 45; p.hp = Math.max(10, p.hp - 40); return "Вы не спали три месяца. Половина выживших обязана вам жизнью (+45 репутации, −40 HP)."; } },
      { text: "Закрыть дом и переждать", effect: (p) => { p.coins -= 100; return "Вы переждали за стенами. Никто из ваших не умер — и никто из чужих вам этого не забудет."; } },
      { text: "Скупать лекарства и продавать", effect: (p) => { p.coins += 1500; p.reputation -= 40; return "На чужом страхе вы построили состояние (+1500🪙, −40 репутации)."; } }
    ]
  },
  {
    id: "awakening", icon: "🐉", title: "Пробуждение Древнего",
    minYear: 500, cooldown: 50,
    desc: "В Бегаритте проснулось что-то, что спало с начала времён. Песок встал стеной на три дня. Семь Сил выехали все сразу — впервые за двести лет.",
    world: "war_begaritt",
    chronicle: "Древнее пробудилось в Бегаритте. Семь Сил выехали вместе.",
    choices: [
      { text: "Пойти вместе с Силами", effect: (p) => { p.intellect += 40; p.swordGodExp += 60; if (typeof changePowerAttitude === "function") changePowerAttitude(1, 12); return "Вы были там, где решалась судьба мира. Семь Сил запомнили ваше лицо."; } },
      { text: "Укрыть беженцев", effect: (p) => { p.reputation += 50; p.coins -= 300; return "Пока герои дрались, вы кормили тех, кто бежал. Это тоже подвиг, просто без песен."; } },
      { text: "Не приближаться", effect: (p) => { return "Вы остались дома. Мир пережил это без вас — и вы не уверены, что жалеете."; } }
    ]
  },
  {
    id: "fall_crown", icon: "👑", title: "Падение Асурской Короны",
    minYear: 530, cooldown: 55,
    desc: "Династия Асуры прервалась в одну ночь. Трон пуст, четыре дома уже делят корону, а тракты перекрыты.",
    world: "purge_all",
    chronicle: "Асурская корона пала. Четыре дома начали делить власть.",
    choices: [
      { text: "Поддержать один из домов", effect: (p) => { p.asuraInfluence += 60; p.reputation += 15; return "Вы поставили на дом, который выиграл. Влияние в Асуре выросло вдвое."; } },
      { text: "Собирать земли, пока пусто", effect: (p) => { p.coins += 1200; p.reputation -= 15; return "Пока сильные делили корону, вы делили их земли (+1200🪙, −15 репутации)."; } },
      { text: "Держать нейтралитет", effect: (p) => { p.intellect += 30; return "Вы не встали ни на чью сторону — и все четыре дома вам за это благодарны. Пока."; } }
    ]
  },
  {
    id: "old_gods", icon: "⛪", title: "Возвращение Старых Богов",
    minYear: 560, cooldown: 60,
    desc: "В Милисе рухнула главная статуя — под ней нашли другую, старше на тысячу лет. Церковь раскололась за неделю.",
    world: "fair_milis",
    chronicle: "Старые боги вернулись в Милис. Церковь раскололась.",
    choices: [
      { text: "Встать за новую веру", effect: (p) => { p.intellect += 45; p.reputation += 25; return "Вы были среди первых. История запомнит вас в первой строке."; } },
      { text: "Встать за старую церковь", effect: (p) => { p.asuraInfluence += 40; p.reputation += 10; return "Вы остались с тем, что было. Старая церковь не забывает верных."; } },
      { text: "Уехать из Милиса до конца спора", effect: (p) => { p.coins -= 200; return "Вы уехали. Вера — это то, что дороже денег и дешевле крови."; } }
    ]
  }
];

// Когда случается следующее событие века
function nextCenturyEvent() {
  if (!Array.isArray(worldState.centuryDone)) worldState.centuryDone = [];
  const year = worldState.currentWorldYear;
  const available = CENTURY_EVENTS.filter(e =>
    !worldState.centuryDone.includes(e.id) &&
    year >= e.minYear &&
    (!worldState.lastCenturyYear || year - worldState.lastCenturyYear >= (e.cooldown || 40) / 3)
  );
  return available[0] || null;
}

// Запуск события века — это окно с последствиями на весь мир
function triggerCenturyEvent(ev) {
  if (!ev) return false;
  worldState.centuryDone = worldState.centuryDone || [];
  if (worldState.centuryDone.includes(ev.id)) return false;
  worldState.centuryDone.push(ev.id);
  worldState.lastCenturyYear = worldState.currentWorldYear;

  // Меняем состояния регионов по сценарию события
  ensureWorldState();
  const setAll = (stateId, years) => Object.keys(REGIONS).forEach(k => worldState.regionStates[k] = { id: stateId, yearsLeft: years });
  if (ev.world === "war_all") setAll("war", 5);
  else if (ev.world === "plague_all") setAll("plague", 3);
  else if (ev.world === "purge_all") setAll("purge", 4);
  else if (ev.world === "war_begaritt") { setAll("calm", 1); worldState.regionStates.begaritt = { id: "war", yearsLeft: 6 }; }
  else if (ev.world === "fair_milis") { setAll("calm", 1); worldState.regionStates.milis = { id: "fair", yearsLeft: 4 }; }

  if (ev.chronicle) worldState.chronicles.push({ year: worldState.currentWorldYear, text: `🌍 ${ev.chronicle}` });

  // Окно с выбором
  setText("event-icon", ev.icon);
  setText("event-title", ev.title);
  setText("event-desc", `${ev.desc}<br><br><span style="color:#fbbf24; font-size:11px;">Событие века. Оно изменит не только вашу жизнь.</span>`);
  const cBox = $("event-choices"); if (!cBox) return false;
  cBox.innerHTML = "";
  ev.choices.forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "event-choice-btn";
    btn.innerText = ch.text;
    btn.onclick = () => {
      const out = ch.effect(player);
      if ($("event-modal")) $("event-modal").style.display = "none";
      log(`<b>[Событие века]</b> ${out}`);
      worldState.chronicles.push({ year: worldState.currentWorldYear, text: `${player.name}: ${ch.text.toLowerCase()} — ${ev.title}.` });
      queueYearExtra(`${ev.icon} ${ev.title}`, out, ev.icon);
      playSound("win");
      const wasInYear = yearFlowActive || yearReportOpen;
      updateUI();
      finishYearIfActive(wasInYear, ev.title, out, ev.icon);
    };
    cBox.appendChild(btn);
  });
  if ($("event-modal")) $("event-modal").style.display = "flex";
  playSound("calamity");
  return true;
}

// Ближайшее событие века — для подсказки игроку
function upcomingCenturyEvent() {
  if (!Array.isArray(worldState.centuryDone)) worldState.centuryDone = [];
  const left = CENTURY_EVENTS.filter(e => !worldState.centuryDone.includes(e.id));
  if (!left.length) return null;
  const next = left.reduce((a, b) => a.minYear <= b.minYear ? a : b);
  return { ev: next, yearsLeft: Math.max(0, next.minYear - worldState.currentWorldYear) };
}

// =========================================================================
// ЖИВОЙ МИР: у регионов есть состояния, они меняются и дают последствия
// =========================================================================
// Идея: мир не декорация. Каждый регион раз в несколько лет получает
// состояние (голод, чума, война, ярмарка, репрессии, спокойствие).
// Состояния меняют цены, доход, заказы и открывают особые сюжеты.
// Игрок может вмешаться: прислать хлеб, выкупить пленных, наняться.
// Помог — регион это помнит. Ушёл — тоже помнит.

const WORLD_STATES = [
  {
    id: "calm", name: "Спокойствие", icon: "🌤", years: [1, 2], weight: 30,
    desc: "Торговля идёт, поля зреют, стража спит у ворот.",
    color: "#94a3b8",
    effect: { travel: 1, income: 1, prices: 1 }
  },
  {
    id: "famine", name: "Голод", icon: "🌾", years: [2, 4], weight: 20,
    desc: "Третий месяц без дождя. Амбары пусты, цены растут, у ворот стоят чужие.",
    color: "#f59e0b",
    effect: { travel: 1.2, income: 0.7, prices: 1.5 },
    help: {
      cost: 120, label: "🌾 Прислать хлеб", good: "Сытый регион помнит добро: +40 репутации, а на рынке цены вернулись в норму.",
      bad: "Хлеба не хватило на всех. Голод останется ещё год."
    }
  },
  {
    id: "plague", name: "Чума", icon: "🦠", years: [1, 3], weight: 14,
    desc: "По улицам возят дым. Ворота закрыты, лекари спят у постелей.",
    color: "#a855f7",
    effect: { travel: 2, income: 0.5, prices: 1.8 },
    help: {
      cost: 90, label: "🧪 Дать зелья и лекарей", good: "Вы спасли квартал: +40 репутации, +20 к ремеслу, а регион заговорил о вас.",
      bad: "Лекарей не хватило. Морва продолжится без вас."
    }
  },
  {
    id: "war", name: "Война", icon: "⚔️", years: [2, 5], weight: 16,
    desc: "Мобилизация, реквизиции, шёпот в тавернах. Дороги держат отряды.",
    color: "#ef4444",
    effect: { travel: 1.5, income: 0.8, prices: 1.6 },
    help: {
      cost: 0, label: "🛡️ Наняться в отряд", good: "Из боя вы вышли живым и с именем: +60 славы, +25 к мечу, +200🪙.",
      bad: "Отряд потерян. Вы унесли ноги, но и только."
    }
  },
  {
    id: "fair", name: "Ярмарка", icon: "🎪", years: [1, 2], weight: 20,
    desc: "Столичный базар грохочет на тридцать миль. Всё продаётся и всё покупается.",
    color: "#eab308",
    effect: { travel: 0.8, income: 1.3, prices: 0.75 },
    help: {
      cost: 50, label: "🎪 Снять лавку", good: "Товар с переплатой: +350🪙 и знакомство с торговым домом.",
      bad: "Лавка простояла пустой — ярмарка прошла мимо."
    }
  },
  {
    id: "purge", name: "Репрессии", icon: "🔒", years: [1, 3], weight: 12,
    desc: "Корона ищет заговор. Стучат ночью, допрашивают днём, если согласны. Донос — почётная профессия.",
    color: "#db2777",
    effect: { travel: 1.3, income: 0.9, prices: 1.3 },
    help: {
      cost: 150, label: "💰 Выкупить невиновных", good: "Двадцать человек вышли из ямы: +50 репутации, +30 влияния, а доносчики затихли.",
      bad: "Денег хватило на двоих из двадцати."
    }
  }
];

const WORLD_STATE_BY_ID = {};
WORLD_STATES.forEach(s => WORLD_STATE_BY_ID[s.id] = s);

// Создание состояния мира для старого сейва и новой игры
function ensureWorldState() {
  if (!worldState.regionStates || typeof worldState.regionStates !== "object") worldState.regionStates = {};
  if (!worldState.regionOpinion || typeof worldState.regionOpinion !== "object") worldState.regionOpinion = {};
  Object.keys(REGIONS).forEach(k => {
    if (!worldState.regionStates[k]) worldState.regionStates[k] = { id: "calm", yearsLeft: 1 };
    if (typeof worldState.regionOpinion[k] !== "number") worldState.regionOpinion[k] = 0;
  });
  if (!Array.isArray(worldState.worldNews)) worldState.worldNews = [];
}

function currentRegionState(key) {
  ensureWorldState();
  const st = worldState.regionStates[key] || { id: "calm", yearsLeft: 1 };
  return { ...st, def: WORLD_STATE_BY_ID[st.id] || WORLD_STATE_BY_ID.calm };
}

function regionOpinion(key) { ensureWorldState(); return worldState.regionOpinion[key] || 0; }

// Раз в год: старые состояния истекают, иногда рождаются новые
function advanceWorldStates() {
  ensureWorldState();
  const news = [];
  Object.keys(REGIONS).forEach(k => {
    const st = worldState.regionStates[k];
    if (st.id !== "calm") {
      st.yearsLeft--;
      if (st.yearsLeft <= 0) {
        const old = WORLD_STATE_BY_ID[st.id];
        worldState.regionStates[k] = { id: "calm", yearsLeft: 1 };
        news.push({ region: k, text: `${old.icon} <b>${regionShortName(k)}</b>: ${old.name.toLowerCase()} ${({famine:"закончился",plague:"закончилась",war:"закончилась",fair:"закончилась",purge:"закончились"})[old.id] || "закончилась"}. Земля выдохнула.` });
      }
      return;
    }
    // Спокойный регион может впасть в состояние: 35% на регион в год
    if (Math.random() < 0.35) {
      const pool = WORLD_STATES.filter(s => s.id !== "calm");
      const total = pool.reduce((a, s) => a + s.weight, 0);
      let roll = Math.random() * total, picked = pool[0];
      for (const s of pool) { roll -= s.weight; if (roll <= 0) { picked = s; break; } }
      const len = picked.years[0] + Math.floor(Math.random() * (picked.years[1] - picked.years[0] + 1));
      worldState.regionStates[k] = { id: picked.id, yearsLeft: len };
      news.push({ region: k, text: `${picked.icon} <b>${regionShortName(k)}</b> — ${picked.name.toLowerCase()}. ${picked.desc}` });
    }
  });
  // Вестник: не больше трёх новостей в год, иначе окно года превратится в газету
  worldState.worldNews = news.slice(0, 3);
  if (news.length) {
    const list = worldState.worldNews.map(n => `${n.text}`).join("<br>");
    queueYearExtra("Вестник мира", list, "📰");
    worldState.worldNews.forEach(n => worldState.chronicles.push({ year: worldState.currentWorldYear, text: n.text }));
  }
}

function regionShortName(k) {
  const r = REGIONS[k];
  if (!r) return k;
  return r.mapLabel || r.name.replace(/^[^\s]+\s/, "");
}

// Базовый характер экономики региона: где-то ярмарка, где-то всё привозное
const REGION_PRICE_BASE = {
  asura: 1.05,        // столица: на всё наценка
  begaritt: 1.2,      // пустыня: привозное золото
  milishion: 0.9,     // торговые города
  ranoa: 0.95,
  great_forest: 0.92, // свои травы, своя еда
  demon: 1.1,
  north: 1.0
};

// Множители состояния — используются ценами и доходом
function worldPriceMult(key) {
  const st = currentRegionState(key);
  const stateMult = st.def.effect?.prices || 1;
  const base = REGION_PRICE_BASE[key] ?? 1;
  return base * stateMult;
}
function worldTravelMult(key) {
  const st = currentRegionState(key);
  return st.def.effect?.travel || 1;
}

// Вмешательство игрока: помочь региону или пройти мимо
function helpRegion(key) {
  const st = currentRegionState(key);
  if (st.id === "calm") return showActionModal("Живой мир", "В этом регионе сейчас спокойно — помогать некому.", "🌤");
  const h = st.def.help;
  if (!h) return;
  if (player.coins < h.cost) return showActionModal("Живой мир", `Нужно ${h.cost}🪙.`, h.icon || "🪙");
  if (h.cost) player.coins -= h.cost;

  // Война — проверка силой, остальные — деньгами и волей
  let ok = true;
  if (st.id === "war") {
    ok = calcCombatPower(player) >= 2500 || Math.random() < 0.5;
    if (ok) { player.swordGodExp += 25; player.squadFame += 60; player.coins += 200; }
    else { player.hp = Math.max(10, player.hp - 40); }
  } else {
    player.asuraInfluence = (player.asuraInfluence || 0) + 20;
  }

  if (ok) {
    ensureWorldState();
    worldState.regionStates[key] = { id: "calm", yearsLeft: 1 };
    worldState.regionOpinion[key] = regionOpinion(key) + 40;
    worldState.chronicles.push({ year: worldState.currentWorldYear, text: `${player.name} помог ${regionShortName(key)}: ${h.label.replace(/^[^\s]+\s/, "")}.` });
    queueYearExtra("Живой мир", `${REGIONS[key].name}: ${h.good}`, "🌍");
    log(`🌍 ${REGIONS[key].name}: ${h.good}`);
    playSound("win");
    showActionModal(`${st.def.icon} ${st.def.name} — ${regionShortName(key)}`, `<div style="text-align:left; line-height:1.55;">${h.good}</div>`, "🌍");
  } else {
    queueYearExtra("Живой мир", `${REGIONS[key].name}: ${h.bad}`, "🌍");
    log(`🌍 ${REGIONS[key].name}: ${h.bad}`);
    showActionModal(`${st.def.icon} ${st.def.name} — ${regionShortName(key)}`, `<div style="text-align:left; line-height:1.55;">${h.bad}</div>`, "🌍");
  }

  const wasInYear = yearFlowActive || yearReportOpen;
  updateUI(); renderTravelTab();
  finishYearIfActive(wasInYear, "Живой мир", `${regionShortName(key)}: ${ok ? h.good : h.bad}`, "🌍");
}

// Блок «что происходит в мире» на вкладке карты
function renderWorldNews() {
  const box = $("world-news-box");
  if (!box) return;
  ensureWorldState();
  const rows = Object.keys(REGIONS).map(k => {
    const st = currentRegionState(k);
    const op = regionOpinion(k);
    const isHere = player.currentRegionKey === k;
    const price = Math.round(worldPriceMult(k) * 100);
    const travel = Math.round(worldTravelMult(k) * 100);
    return `<div class="world-state-row" style="border-left-color:${st.def.color};">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <div>
          <b style="font-size:12px; ${isHere ? "color:#fde68a;" : ""}">${esc(regionShortName(k))}${isHere ? " 📍" : ""}</b>
          <span style="font-size:11px; color:${st.def.color}; margin-left:5px;">${st.def.icon} ${esc(st.def.name)}</span>
          <span style="font-size:10px; color:var(--muted); margin-left:4px;">${st.id === "calm" ? "" : `ещё ${st.yearsLeft} г.`}</span>
        </div>
        <div style="font-size:10px; color:${op >= 20 ? "#34d399" : op <= -20 ? "#f87171" : "#94a3b8"}; white-space:nowrap;">
          ${op > 0 ? "+" : ""}${op} мнение
        </div>
      </div>
      ${st.id !== "calm" ? `<div style="font-size:10.5px; color:#cbd5e1; margin-top:3px; line-height:1.4;">${esc(st.def.desc)}</div>
        <div style="font-size:10px; color:#94a3b8; margin-top:3px;">Цены ×${(price / 100).toFixed(2)} • Дорога ×${(travel / 100).toFixed(2)}</div>
        <button style="width:100%; margin-top:5px; font-size:11px; background:${st.def.color}; color:#0b0c10; padding:5px;" onclick="helpRegion('${k}')">${esc(st.def.help?.label || "Вмешаться")}${st.def.help?.cost ? ` (${st.def.help.cost}🪙)` : ""}</button>` : ""}
    </div>`;
  }).join("");

  box.innerHTML = `<div class="card" style="margin-bottom:0; background:#0e1622; border-color:rgba(56,189,248,0.25);">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <b style="font-size:12.5px; color:#7dd3fc;">🌍 Что сейчас в мире</b>
      <span style="font-size:10px; color:var(--muted);">состояния меняются каждый год</span>
    </div>
    <div style="margin-top:7px;">${rows}</div>
    ${(() => {
      const up = upcomingCenturyEvent();
      if (!up) return "";
      return `<div style="margin-top:8px; padding-top:7px; border-top:1px solid rgba(148,163,184,0.18); font-size:10.5px; color:#94a3b8; line-height:1.45;">
        ${up.yearsLeft <= 0
          ? `🌍 <b style="color:#fbbf24;">Событие века близко:</b> ${esc(up.ev.title)} — может начаться в любой год.`
          : `🌍 Следующее событие века — <b style="color:#cbd5e1;">${esc(up.ev.title)}</b>, примерно через ${up.yearsLeft} лет.`}
      </div>`;
    })()}
  </div>`;
}

// =========================================================================
// ИНТЕРАКТИВНАЯ КАРТА МИРА И СЕТЬ ТЕЛЕПОРТОВ
// =========================================================================
function renderTravelTab() {
  const mapBox = $("world-map-box"), cardBox = $("map-region-card"), tpBox = $("teleport-network-box");
  if (!mapBox) return;
  ensureWorldState();
  renderWorldNews();

  const tp = worldState.teleportNodes || [];
  const hasHub = tp.length > 0;
  const isTpComplete = tp.length >= 6;

  // --- Дороги между регионами ---
  const routesSvg = MAP_ROUTES.map(([a, b]) => {
    const ra = REGIONS[a], rb = REGIONS[b];
    const bothBuilt = tp.includes(a) && tp.includes(b);
    const oneBuilt = tp.includes(a) || tp.includes(b);
    const col = bothBuilt ? "#22d3ee" : "rgba(148,163,184,0.35)";
    const w = bothBuilt ? 2.2 : 1.4;
    const dash = bothBuilt ? "none" : "5 4";
    const glow = bothBuilt ? `<line x1="${ra.mapX}" y1="${ra.mapY}" x2="${rb.mapX}" y2="${rb.mapY}" stroke="#22d3ee" stroke-width="6" opacity="0.18"/>` : "";
    return `${glow}<line x1="${ra.mapX}" y1="${ra.mapY}" x2="${rb.mapX}" y2="${rb.mapY}" stroke="${col}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
  }).join("");

  // Ближайшая точка прибытия: если кругов нет — обычный путь; если есть — от ближайшего круга
  // --- Точки регионов ---
  const nodesSvg = Object.entries(REGIONS).map(([k, r]) => {
    const isHere = player.currentRegionKey === k, isSel = selectedMapRegion === k;
    const hasPower = worldState.sevenPowers?.some(p => p.region === k && (player.discoveredSevenPowers || []).includes(p.rank) && player.currentPowersSeat !== p.rank);
    const hasTab = (typeof FIRST_WAR_TABLETS !== "undefined" ? FIRST_WAR_TABLETS : []).some(t => t.regionKey === k && !(player.tabletsDeciphered || []).includes(t.id));
    const built = tp.includes(k);
    const shortName = r.mapLabel || r.name.replace(/^[^\s]+\s/, "");

    const icon = hasPower ? "🏆" : hasTab ? "📜" : built ? "🌀" : "";
    return `<g class="map-node ${isHere ? "active" : ""} ${isSel ? "selected" : ""}" onclick="selectMapRegion('${k}')">
      <circle cx="${r.mapX}" cy="${r.mapY}" r="17" fill="${r.color}" opacity="0.10"/>
      ${isHere ? `<circle cx="${r.mapX}" cy="${r.mapY}" r="15" fill="none" stroke="#fde68a" stroke-width="1.8" class="map-pin-pulse"/>` : ""}
      <circle class="map-pin-circle" cx="${r.mapX}" cy="${r.mapY}" r="${isHere ? 9.5 : 7.5}" fill="${r.color}"
        stroke="${isSel ? "#fde68a" : isHere ? "#f59e0b" : "rgba(0,0,0,0.7)"}" stroke-width="${isSel ? 3 : 2}"/>
      <circle cx="${r.mapX - 2}" cy="${r.mapY - 2}" r="2.6" fill="rgba(255,255,255,0.55)"/>
      <text x="${r.mapX}" y="${r.mapY + 22}" text-anchor="middle" fill="#e2e8f0" font-size="9.5" font-weight="700"
        style="paint-order:stroke; stroke:#080c14; stroke-width:3px; stroke-linejoin:round;">${esc(shortName)}</text>
      ${icon ? `<text x="${r.mapX + 11}" y="${r.mapY - 9}" font-size="11" style="paint-order:stroke; stroke:#080c14; stroke-width:3px;">${icon}</text>` : ""}
    </g>`;
  }).join("");

  mapBox.innerHTML = `<svg class="world-map-svg" viewBox="0 0 380 230" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mg-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0d1a2e"/><stop offset="100%" stop-color="#060b14"/>
      </linearGradient>
      <radialGradient id="mg-glow"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
      <filter id="mg-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
    </defs>

    <rect width="380" height="230" fill="url(#mg-sea)"/>
    <!-- сетка меридианов -->
    <g stroke="rgba(125,211,252,0.07)" stroke-width="0.5">
      ${[30,60,90,120,150,180,210,240,270,300,330,360].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="230"/>`).join("")}
      ${[30,60,90,120,150,180,210].map(y=>`<line x1="0" y1="${y}" x2="380" y2="${y}"/>`).join("")}
    </g>
    <!-- береговое свечение -->
    <ellipse cx="180" cy="110" rx="150" ry="95" fill="url(#mg-glow)" opacity="0.5"/>

    <!-- ===== РАНОА: северный континент со снегами ===== -->
    <path d="M118,34 L150,20 L205,16 L248,30 L256,56 L240,78 L206,84 L168,76 L134,66 Z"
      fill="#1b3550" stroke="#3b6d94" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M120,36 L186,22 L236,34 L246,52 L212,60 L172,56 L136,50 Z" fill="#2a5a7d" opacity="0.55"/>
    <path d="M150,20 L205,16 L248,30 L240,38 L196,28 L158,30 Z" fill="#e2f2ff" opacity="0.75" filter="url(#mg-soft)"/>
    <path d="M196,28 L240,38 L236,48 L198,40 Z" fill="#e2f2ff" opacity="0.45" filter="url(#mg-soft)"/>

    <!-- ===== СВЯТАЯ ЗЕМЛЯ МИЛИС: узкий южный берег ===== -->
    <path d="M152,196 L206,190 L262,176 L268,190 L214,206 L156,210 Z"
      fill="#332e40" stroke="#7c7290" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M160,198 L210,193 L256,181 L258,186 L208,199 L164,204 Z" fill="#cbd5e1" opacity="0.18"/>

    <!-- ===== ВЕЛИКИЙ ЛЕС: зелёный остров между ===== -->
    <path d="M212,118 L250,112 L272,130 L266,158 L236,168 L210,152 L204,132 Z"
      fill="#143d2a" stroke="#2f8f5b" stroke-width="1.4" stroke-linejoin="round"/>
    <g fill="#1e6b45" opacity="0.75">
      <path d="M222,136 l5,-9 l5,9 z"/><path d="M236,130 l5,-9 l5,9 z"/><path d="M232,148 l5,-9 l5,9 z"/><path d="M248,140 l5,-9 l5,9 z"/>
    </g>

    <!-- ===== БЕГАРИТТ: западная пустыня ===== -->
    <path d="M18,104 L92,100 L112,132 L104,190 L40,198 L16,158 Z"
      fill="#3b2d15" stroke="#a17326" stroke-width="1.4" stroke-linejoin="round"/>
    <g fill="#5c4519" opacity="0.75">
      <path d="M30,150 q14,-10 28,0 q-14,9 -28,0 z"/>
      <path d="M56,120 q12,-9 24,0 q-12,8 -24,0 z"/>
      <path d="M34,175 q10,-7 20,0 q-10,7 -20,0 z"/>
    </g>

    <!-- ===== ДЕМОНИЧЕСКИЙ КОНТИНЕНТ: восток, багровый ===== -->
    <path d="M268,24 L338,20 L362,54 L354,104 L318,128 L282,110 L264,72 Z"
      fill="#3d1a22" stroke="#a3323f" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M284,38 L336,32 L350,60 L340,92 L312,104 L292,86 Z" fill="#5c2028" opacity="0.6"/>
    <g fill="#7f1d1d" opacity="0.8">
      <path d="M300,72 l6,-12 l6,12 z"/><path d="M318,60 l6,-12 l6,12 z"/>
    </g>
    <circle cx="326" cy="88" r="3" fill="#f97316" opacity="0.85"/>

    <!-- ===== АСУРА: центр, плодородные земли ===== -->
    <path d="M126,86 L178,80 L210,96 L216,120 L196,146 L152,152 L126,132 L118,106 Z"
      fill="#243b1c" stroke="#6d9b45" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M132,92 L176,86 L202,100 L206,118 L190,138 L156,144 L134,128 Z" fill="#33532a" opacity="0.6"/>
    <g stroke="#8fbc6a" stroke-width="0.7" opacity="0.5">
      <path d="M140,110 q16,-14 32,0"/><path d="M150,126 q14,-12 28,0"/>
    </g>

    <!-- подписи морей -->
    <text x="196" y="222" text-anchor="middle" fill="rgba(125,211,252,0.45)" font-size="7" letter-spacing="2.5" font-weight="600">ВЕЛИКИЙ ОКЕАН</text>
    <text x="112" y="46" text-anchor="middle" fill="rgba(125,211,252,0.30)" font-size="6" letter-spacing="2">СЕВЕРНОЕ МОРЕ</text>

    ${routesSvg}
    ${nodesSvg}
  </svg>`;

  const sel = REGIONS[selectedMapRegion] || REGIONS.asura;
  const here = player.currentRegionKey === selectedMapRegion;
  const standAtHub = tp.includes(player.currentRegionKey);
  const canFast = hasHub && !here && standAtHub;
  const fastCost = Math.max(3, Math.round(sel.travelCost * 0.15));
  const cost = isTpComplete ? 0 : canFast ? fastCost : sel.travelCost;
  const instant = isTpComplete || canFast;
  const canGo = !here && player.age >= 8 && player.coins >= cost;

  if (cardBox) {
    cardBox.innerHTML = `<div class="card" style="border-color:${sel.color}; margin-bottom:0; position:relative; overflow:hidden;">
      <div style="position:absolute; inset:0; background:radial-gradient(circle at 90% 10%, ${sel.color}22 0%, transparent 60%); pointer-events:none;"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <b style="font-size:14.5px;">${sel.name}</b>
        <span class="badge-rare" style="white-space:nowrap;">${here ? "Вы здесь 📍" : isTpComplete ? "⚡ бесплатно • мгновенно" : canFast ? `🌀 ${fastCost}🪙 • мгновенно` : `${sel.travelCost}🪙 • 1 год пути`}</span>
      </div>
      <div style="font-size:11px; color:var(--muted); margin:6px 0 8px; line-height:1.5;">${sel.desc}</div>
      ${!here ? `<div style="font-size:10.5px; color:${instant ? "#67e8f9" : "#94a3b8"}; margin-bottom:7px; line-height:1.45;">
        ${isTpComplete
          ? `⚡ Сеть завершена: вы переноситесь в <b>${esc(sel.name.replace(/^[^\s]+\s/, ""))}</b> мгновенно и бесплатно.`
          : canFast
            ? `🌀 Вы стоите у круга. Переход в <b>${esc(sel.name.replace(/^[^\s]+\s/, ""))}</b> займёт день вместо года.`
            : `🌀 Быстрый переход работает из региона с построенным кругом. Кругов: ${tp.length}/6 — постройте круг здесь, и путь перестанет отнимать годы.`}
      </div>` : ""}
      <button ${canGo ? "" : "disabled"} style="width:100%; background:${here ? "#059669" : instant ? "linear-gradient(90deg,#0891b2,#0e7490)" : "#312e81"};" onclick="travelToRegion('${selectedMapRegion}')">
        ${here ? "✓ Текущее местоположение" : player.age < 8 ? "Путешествия с 8 лет" : isTpComplete ? "⚡ Перенестись мгновенно (бесплатно)" : canFast ? `🌀 Быстрый переход (${fastCost}🪙)` : `⛵ Отправиться в путь (${sel.travelCost}🪙)`}
      </button>
    </div>`;
  }

  if (tpBox) {
    const builtHere = tp.includes(player.currentRegionKey);
    const count = tp.length;
    tpBox.innerHTML = `<div class="card" style="background:#10192b; border-color:#0891b2;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="color:#22d3ee; font-size:12.5px;">🌀 Сеть Телепортов</b>
        <span class="badge-rare">${count}/6 кругов</span>
      </div>
      <div style="font-size:11px; color:var(--muted); margin:5px 0; line-height:1.5;">
        ${isTpComplete
          ? "🌟 <b style='color:#67e8f9;'>Сеть завершена!</b> Все шесть кругов держат друг друга — переходы мгновенны и бесплатны."
          : count > 0
            ? `🌀 <b style='color:#67e8f9;'>Быстрый переход работает.</b> Встаньте в регионе с кругом — и сможете прыгать к любому другому кругу за ${Math.round(15)}% цены пути, без потери года. За все шесть кругов — бесплатно.`
            : "Постройте первый круг — и между построенными регионами появится быстрый переход без потери года. Шесть кругов дают бесплатные мгновенные перелёты."}
      </div>
      <div style="display:flex; gap:4px; margin:7px 0;">
        ${Object.keys(REGIONS).map(k => `<div title="${esc(REGIONS[k].name)}" style="flex:1; height:5px; border-radius:3px; background:${tp.includes(k) ? "#22d3ee" : "rgba(148,163,184,0.22)"}; box-shadow:${tp.includes(k) ? "0 0 6px #22d3ee" : "none"};"></div>`).join("")}
      </div>
      <button ${builtHere ? "disabled" : ""} style="width:100%; background:${builtHere ? "#0f766e" : "#0284c7"}; font-size:11px;" onclick="buildTeleportNode()">
        ${builtHere ? "✓ Круг в этом регионе возведён" : "🌀 Возвести круг здесь (180🪙, 40+ Знаний)"}
      </button>
    </div>`;
  }
}

function selectMapRegion(key) { selectedMapRegion = key; renderTravelTab(); playSound("click"); }

function buildTeleportNode() {
  if (player.coins < 180 || player.intellect < 40) return showActionModal("Сеть Телепортов", "Требуется 180🪙 и 40+ Знаний!", "🌀");
  worldState.teleportNodes = worldState.teleportNodes || [];
  if (worldState.teleportNodes.includes(player.currentRegionKey)) return;
  player.coins -= 180;
  worldState.teleportNodes.push(player.currentRegionKey);
  const msg = `🌀 В регионе <b>${REGIONS[player.currentRegionKey].name}</b> возведён Круг Телепортации (${worldState.teleportNodes.length}/6)!`;
  worldState.chronicles.push({ year: worldState.currentWorldYear, text: msg });
  log(msg); playSound("win"); updateUI(); renderTravelTab();
}

function travelToRegion(destKey) {
  const dest = REGIONS[destKey];
  if (!dest) return;
  if (player.age < 8) return showActionModal("Путь", "Путешествия доступны с 8 лет!", "🚢");

  const tp = worldState.teleportNodes || [];
  const isComplete = tp.length >= 6;
  // Быстрый переход: круг работает как выход. Стоите у круга — прыжок в любой
  // регион стоит 15% пути и не съедает год. Нет круга под ногами — идёте обычным путём.
  const fast = !isComplete && tp.length > 0 && tp.includes(player.currentRegionKey);
  const cost = isComplete ? 0 : fast ? Math.max(3, Math.round(dest.travelCost * 0.15)) : dest.travelCost;
  if (player.coins < cost) return showActionModal("Путь", `Нужно ${cost}🪙!`, "🚢");

  player.coins -= cost;
  player.currentRegionKey = destKey;
  selectedMapRegion = destKey;

  if (isComplete || fast) {
    // Мгновенно: год не тратится
    log(isComplete
      ? `⚡ Мгновенный перенос в <b>${esc(dest.name)}</b> через завершённую сеть кругов.`
      : `🌀 Быстрый переход в <b>${esc(dest.name)}</b> (${cost}🪙). Дорога заняла день, а не год.`);
    playSound("magic");
    queueYearExtra?.("Быстрый переход", `Вы перенеслись в ${esc(dest.name)} через круг телепортации.`, "🌀");
    updateUI(); renderTravelTab();
  } else {
    log(`🚢 Вы прибыли в <b>${esc(dest.name)}</b>.`);
    playSound("calamity");
    ageUp(); renderTravelTab();
  }
}

// =========================================================================
// СЮЖЕТНЫЕ ВЕХИ (1-Я ЖИЗНЬ + СЛЕДУЮЩИЕ ВЕКА)
// =========================================================================
// =========================================================================
// СУДЬБА РОДА: единое окно — дневник года, вехи, линии, эхо прошлого
// =========================================================================
let currentDestinyTab = "year";

function getAvailableStories() {
  // Старые «вехи эпохи» оставляем как часть окна судьбы
  return STORY_ACTIVITIES.filter(s => {
    if (player.storyCompleted.includes(s.id) || player.age < s.age) return false;
    if (s.reqFaction && player.dynastyFaction !== s.reqFaction) return false;
    if (s.era === "first") return player.isFirstEraLife;
    if (s.era === "future") {
      if (player.isFirstEraLife && worldState.currentWorldYear < 430) return false;
      if (s.minYear && worldState.currentWorldYear < s.minYear) return false;
      if (s.maxYear && worldState.currentWorldYear > s.maxYear) return false;
      return true;
    }
    return false;
  });
}

function countPendingDestiny() {
  if (!player) return 0;
  ensureStoryState();
  return getAvailableStoryNodes().length + getAvailableStories().length;
}

function updateDestinyBadge() {
  const badge = $("destiny-badge");
  if (!badge) return;
  const n = countPendingDestiny();
  badge.style.display = n ? "inline-block" : "none";
  badge.innerText = n > 1 ? `${n} новых` : "новое";
}

function openDestinyWindow(tab) {
  if (!player) return;
  ensureStoryState();
  ensureSevenPowersLore();
  if (tab) currentDestinyTab = tab;
  renderDestinyWindow();
  if ($("destiny-modal")) $("destiny-modal").style.display = "flex";
  playSound("click");
  syncTelegramBackButton();
}

function closeDestinyWindow() {
  if ($("destiny-modal")) $("destiny-modal").style.display = "none";
  playSound("click");
  syncTelegramBackButton();
}

function setDestinyTab(tab, btnEl) {
  currentDestinyTab = tab;
  document.querySelectorAll(".destiny-tab").forEach(b => b.classList.remove("active"));
  btnEl?.classList.add("active");
  renderDestinyWindow();
  playSound("click");
}

function renderDestinyWindow() {
  const body = $("destiny-body");
  if (!body || !player) return;
  const sub = $("destiny-sub");
  if (sub) sub.innerText = `${player.name} • ${player.age} ${pluralYears(player.age)} • ${worldState.currentWorldYear} г. К.Д.`;

  if (currentDestinyTab === "year") body.innerHTML = renderDestinyYearTab();
  else if (currentDestinyTab === "lines") body.innerHTML = renderDestinyLinesTab();
  else if (currentDestinyTab === "path") body.innerHTML = renderDestinyPathTab();
  else body.innerHTML = renderDestinyPendingTab();
}

// --- вкладка «Год»: последний дневник + сводка жизни ---
function renderDestinyYearTab() {
  let html = "";
  const summary = yearSummary || buildYearSummary();
  html += `<div class="destiny-card"><div class="destiny-line-title">Дневник последнего года</div>`;
  if (summary && summary.lines.length) {
    html += summary.lines.map(l => `<div class="destiny-text" style="margin:3px 0;">${l}</div>`).join("");
    html += `<div class="destiny-muted" style="margin-top:6px;">${summary.verdict}</div>`;
  } else {
    html += `<div class="destiny-muted">Год ещё не прожит — нажмите «Прожить 1 год».</div>`;
  }
  html += `</div>`;

  const cp = calcCombatPower(player);
  html += `<div class="destiny-card"><div class="destiny-line-title">Итог жизни</div>
    <div class="destiny-text">Мощь: <b>${cp.toLocaleString("ru-RU")}</b> • Поколение ${dynastyGeneration} • Золото ${fmtNum(player.coins)}🪙</div>
    <div class="destiny-text">Раса: ${esc(player.race)} • Предел жизни: ${player.maxAge} ${pluralYears(player.maxAge)}</div>
    <div class="destiny-muted" style="margin-top:4px;">${getBardNickname(player, cp)}</div></div>`;

  const flags = Object.keys(player.story?.flags || {});
  if (flags.length) {
    html += `<div class="destiny-card"><div class="destiny-line-title">Ваши решения</div>
      <div class="destiny-muted">${flags.length} памятных выборов в этой жизни</div></div>`;
  }
  return html;
}

// --- вкладка «Линии судьбы»: сюжетные цепочки ---
function renderDestinyLinesTab() {
  const nodes = getAvailableStoryNodes();
  const thisYear = (typeof pickYearStoryNodes === "function") ? pickYearStoryNodes(3) : nodes;
  const later = nodes.filter(n => !thisYear.some(t => t.node.id === n.node.id));
  let html = "";

  if (!nodes.length) {
    html += `<div class="destiny-card"><div class="destiny-muted">Сейчас новых завязок нет — живите, и судьба догонит.</div></div>`;
  } else {
    html += `<div class="destiny-muted" style="margin-bottom:6px;">В этом году выпало: ${thisYear.length} • ждут своего года: ${later.length}</div>`;
    thisYear.forEach(({ line, node }) => {
      html += `<div class="destiny-card story">
        <div class="destiny-line-title">${line.icon} ${esc(node.title)}</div>
        <div class="destiny-muted" style="margin-bottom:5px;">Линия: ${esc(line.title)}</div>
        <div class="destiny-text">${esc(node.text)}</div>
        ${(node.choices || []).map((ch, i) => {
          const affordable = !ch.cost || player.coins >= ch.cost;
          const dis = affordable ? "" : "disabled";
          const dimStyle = affordable ? "" : "opacity:0.45;";
          return `<button class="destiny-choice" ${dis} style="${dimStyle}" onclick="chooseStoryNode('${line.id}','${node.id}',${i})">${esc(ch.text)}</button>`;
        }).join("")}
        ${node.effect ? `<button class="destiny-choice" style="background:#312e81;" onclick="chooseStoryNode('${line.id}','${node.id}',-1)">✨ Принять</button>` : ""}
      </div>`;
    });
  }

  if (later.length) {
    html += `<div class="destiny-muted" style="margin:10px 0 6px;">⏳ Ждут своего года — эти сцены откроются позже</div>`;
    later.forEach(({ line, node }) => {
      html += `<div class="destiny-card"><div class="destiny-line-title" style="color:#94a3b8; font-size:11px;">${line.icon} ${esc(node.title)}</div>
        <div class="destiny-muted">${esc(line.title)} • с ${node.age || 0} лет</div></div>`;
    });
  }

  // старые вехи эпохи
  const legacy = getAvailableStories();
  if (legacy.length) {
    html += `<div class="destiny-muted" style="margin:10px 0 6px;">📖 Вехи эпохи</div>`;
    legacy.forEach(st => {
      html += `<div class="destiny-card">
        <div class="destiny-line-title" style="color:#fbbf24;">${esc(st.name)}</div>
        <div class="destiny-text">${esc(st.desc)}</div>
        <button class="destiny-choice" style="background:#b45309;" onclick="performStoryActivity('${st.id}')">✨ Свершить</button>
      </div>`;
    });
  }

  // завершённые линии
  const doneLines = STORY_LINES.filter(l => l.nodes.every(n => player.story.done.includes(n.id)));
  if (doneLines.length) {
    html += `<div class="destiny-muted" style="margin:10px 0 6px;">Завершённые линии</div>`;
    doneLines.forEach(l => { html += `<div class="destiny-opt">✅ ${l.icon} ${esc(l.title)}</div>`; });
  }
  return html;
}

// --- вкладка «Путь»: Семь Великих Сил как люди ---
function renderDestinyPathTab() {
  ensureSevenPowersLore();
  let html = `<div class="destiny-muted" style="margin-bottom:8px;">Семь Великих Сил — не строчки с числами, а те, кто помнит вас.</div>`;
  worldState.sevenPowers.forEach(pow => {
    const lore = getPowerLore(pow.rank);
    const att = getPowerAttitudeLabel(pow.attitude);
    const isMe = player.currentPowersSeat === pow.rank;
    const pct = Math.round(((Number(pow.attitude) || 0) + 100) / 2);
    html += `<div class="destiny-card destiny-power">
      <div class="destiny-power-name">#${pow.rank} • ${esc(pow.title)} ${isMe ? '<span class="destiny-tag">ВАШ ТРОН</span>' : ""}</div>
      <div class="destiny-muted" style="margin-bottom:4px;">${esc(pow.name)}${lore ? ` — «${esc(lore.epithet)}»` : ""}</div>
      ${lore ? `<div class="destiny-text" style="font-size:11px;">${esc(lore.personality)}</div>
      <div class="destiny-muted" style="margin-top:4px;">Привычка: ${esc(lore.habit)}</div>` : ""}
      <div class="destiny-bar"><i style="width:${pct}%; background:${att.color};"></i></div>
      <div class="destiny-muted">Отношение: <b style="color:${att.color};">${att.text}</b> • БМ ${fmtNum(pow.cp)}</div>
      ${isMe && lore ? `<div class="destiny-muted" style="color:#34d399; margin-top:3px;">${esc(lore.seatText)}</div>` : ""}
      <div style="display:flex; gap:5px; margin-top:6px;">
        <button class="destiny-choice" style="margin-top:0; flex:1; padding:5px 6px;" onclick="giveTributeToPower(${pow.rank})">🎁 Дары (60🪙)</button>
        ${!isMe ? `<button class="destiny-choice" style="margin-top:0; flex:1; padding:5px 6px; background:#4c1d95;" onclick="challengeSevenPower(${pow.rank})">⚔️ Вызов</button>` : ""}
      </div>
    </div>`;
  });
  return html;
}

// --- вкладка «Эхо»: отложенные последствия ---
function renderDestinyPendingTab() {
  ensureStoryState();
  const pending = player.story.pending || [];
  let html = `<div class="destiny-muted" style="margin-bottom:8px;">Решения возвращаются. Здесь видно, что уже в пути.</div>`;
  if (!pending.length) {
    html += `<div class="destiny-card"><div class="destiny-muted">Пока ничего не должно вернуться. Это хороший знак — или вы просто ещё не сделали достаточно глупостей.</div></div>`;
  } else {
    pending.slice().sort((a, b) => a.atYear - b.atYear).forEach(p => {
      const wait = Math.max(0, p.atYear - worldState.currentWorldYear);
      html += `<div class="destiny-card chain">
        <div class="destiny-text">${esc(p.text)}</div>
        <div class="destiny-muted" style="margin-top:4px;">⏳ Сбудется через ${wait} ${pluralYears(wait)}</div>
      </div>`;
    });
  }
  return html;
}

// --- выбор в сюжетной сцене ---
// Применить решение по сцене и вернуть текст результата — без открытия окон.
// Используется очередью сцен: она сама решает, куда показать итог.
function chooseStoryNodeResult(lineId, nodeId, choiceIdx) {
  const line = STORY_LINES.find(l => l.id === lineId);
  const node = line?.nodes.find(n => n.id === nodeId);
  if (!line || !node) return null;
  ensureStoryState();
  if (player.story.done.includes(node.id)) return null;

  if (choiceIdx < 0 || !node.choices) {
    const res = node.effect ? node.effect(player, worldState) : "Судьба сделала шаг.";
    player.story.done.push(node.id);
    log(`📜 <b>${esc(node.title)}</b>: ${res}`);
    playSound("win");
    return res;
  }

  const ch = node.choices[choiceIdx];
  if (!ch) return null;
  if (ch.cost && player.coins < ch.cost) return null;

  const res = ch.effect ? ch.effect(player, worldState) : "Решение принято.";
  player.story.done.push(node.id);
  Object.keys(ch.flags || {}).forEach(f => { if (ch.flags[f]) setStoryFlag(f); else delete player.story.flags[f]; });
  if (ch.consequence) scheduleStoryConsequence(ch.consequence.years, ch.consequence.text, ch.consequence.effect);
  log(`📜 <b>${esc(node.title)}</b>: ${res}`);
  playSound("win");
  return res;
}

function chooseStoryNode(lineId, nodeId, choiceIdx) {
  const line = STORY_LINES.find(l => l.id === lineId);
  const node = line?.nodes.find(n => n.id === nodeId);
  if (!line || !node) return;
  ensureStoryState();
  if (player.story.done.includes(node.id)) return;

  // Узел без выбора
  if (choiceIdx === -1 || !node.choices) {
    const res = node.effect ? node.effect(player, worldState) : "Судьба сделала шаг.";
    player.story.done.push(node.id);
    log(`📜 <b>${esc(node.title)}</b>: ${res}`);
    playSound("win");
    updateUI();
    if (yearFlowActive || yearReportOpen) {
      queueYearExtra(node.title, res, "📜");
      finalizeYear();
      if (isStoryModalOpen()) { advanceStoryScene(); return; }
      showYearSummary();
    } else {
      showActionModal(node.title, res, "📜");
      if ($("destiny-modal") && $("destiny-modal").style.display === "flex") renderDestinyWindow();
    }
    return;
  }

  const ch = node.choices[choiceIdx];
  if (!ch) return;
  if (ch.cost && player.coins < ch.cost) {
    showActionModal("Не хватает золота", `Нужно ${ch.cost}🪙.`, "🪙");
    return;
  }

  const res = ch.effect ? ch.effect(player, worldState) : "Решение принято.";
  player.story.done.push(node.id);
  Object.keys(ch.flags || {}).forEach(f => setStoryFlag(f));
  if (ch.flags) Object.keys(ch.flags).forEach(f => { if (!ch.flags[f]) delete player.story.flags[f]; });

  // Отложенное последствие: решение возвращается через годы
  if (ch.consequence) scheduleStoryConsequence(ch.consequence.years, ch.consequence.text, ch.consequence.effect);

  log(`📜 <b>${esc(node.title)}</b>: ${res}`);
  playSound("win");
  if (yearFlowActive || yearReportOpen) {
    queueYearExtra(node.title, res, "📜");
    finalizeYear();
    if (isStoryModalOpen()) { advanceStoryScene(); return; }
    showYearSummary();
    return;
  }
  showActionModal(node.title, res, "📜");
  updateUI();
  if ($("destiny-modal") && $("destiny-modal").style.display === "flex") renderDestinyWindow();
}

function performStoryActivity(storyId) {
  const st = STORY_ACTIVITIES.find(s => s.id === storyId);
  if (!st || player.storyCompleted.includes(st.id)) return;
  if (st.choices) {
    triggerRandomEvent({
      icon: "📜", title: st.name, desc: st.desc,
      choices: st.choices.map(ch => ({ text: ch.text, action: (p) => { p.storyCompleted.push(st.id); return ch.action(p, worldState); } }))
    });
    return;
  }
  player.storyCompleted.push(st.id);
  const res = st.action(player, worldState);
  log(res); playSound(st.id === "s1_calamity" ? "calamity" : "win");
  const wasInYear = yearFlowActive || yearReportOpen;
  updateUI();
  // Если веха выпала посреди года (например, Катаклизм), год обязан закончиться
  // окном итогов — иначе игрок застревает без возможности прожить следующий год
  finishYearIfActive(wasInYear, st.name, res, "📜");
}

// Год завершается ровно один раз, в какой бы ветке он ни закончился
let yearFinalized = false;

function finalizeYear() {
  if (yearFinalized) return;
  yearFinalized = true;
  applyYearlyGrowth();
  processStoryConsequences();
  if (typeof checkAchievements === "function") { checkAchievements(); if (typeof checkAchievementRewards === "function") checkAchievementRewards(); }
  updateDestinyBadge();
}

// Завершение года после отложенного события: показывает окно итогов
function finishYearIfActive(wasActive, title, text, icon) {
  if (!wasActive) return false;
  if (title) queueYearExtra(title, text, icon);
  finalizeYear();
  playSound("year");
  updateUI();
  startStorySequence(typeof pickYearStoryNodes === "function" ? pickYearStoryNodes(3) : getAvailableStoryNodes());
  return true;
}

// Совместимость со старым кодом: обновляет счётчик новых вех
function renderLifeStorySection() {
  updateDestinyBadge();
}

// =========================================================================
// ДЕЛА, СЛУЖБА И ПОДПОЛЬЕ
// =========================================================================
function setActivityCategory(cat, btnEl) {
  currentActivityCategory = cat;
  btnEl?.parentElement?.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
  btnEl?.classList.add("active");
  renderActivities(); playSound("click");
}

function renderActivities() {
  const container = $("activities-container"); if (!container) return;
  container.innerHTML = "";
  if (currentActivityCategory === "job") return renderJobMarket(container);
  if (currentActivityCategory === "underground") return renderUndergroundMarket(container);

  let list = ACTIVITIES.filter(a => player.age >= a.minAge && player.age <= a.maxAge);
  if (currentActivityCategory !== "all") list = list.filter(a => a.category === currentActivityCategory);

  // Подработка — всегда сверху: способ заработать без боя
  if (currentActivityCategory === "all" || currentActivityCategory === "life") {
    const job = typeof currentOddJob === "function" ? currentOddJob() : null;
    if (job) {
      const repMult = 1 + Math.max(-0.4, Math.min(0.6, (player.reputation || 0) / 200));
      const pay = Math.max(5, Math.round(job.base * repMult));
      container.innerHTML = `<div class="card oddjob-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div><b style="font-size:13px;">${job.icon} ${job.name}</b>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">Тихая работа без риска</div></div>
          <div style="text-align:right;"><div style="color:var(--gold); font-weight:800; font-size:13px;">+${pay}🪙</div>
            <div style="font-size:10px; color:var(--muted);">⚡ 1</div></div>
        </div>
        <button ${player.ap >= 1 ? "" : "disabled"} style="width:100%; margin-top:7px; background:#047857;" onclick="doOddJob()">${player.ap >= 1 ? "Взять работу" : "Нет сил"}</button>
      </div>`;
    }
  }
  if (!list.length) { container.innerHTML = `<div style="color:var(--muted); text-align:center; padding:20px;">Нет дел для возраста ${player.age} лет.</div>`; return; }
  container.innerHTML += list.map(act => `
    <div class="activity-card">
      <div class="act-info">
        <div class="act-title-row"><span class="act-name">${act.name}</span><span class="act-age-badge">${act.minAge}–${act.maxAge} л.</span></div>
        <div class="act-desc">${act.desc}</div>
        <div class="act-req">⚡ ${act.apCost} силы ${act.cost > 0 ? `• ${act.cost}🪙` : ""}</div>
      </div>
      <button class="act-btn" ${player.ap >= act.apCost ? "" : "disabled"} onclick="performActivity('${act.id}')">${player.ap >= act.apCost ? "Делать" : "Устал"}</button>
    </div>`).join("");
}

function performActivity(actId) {
  const act = ACTIVITIES.find(a => a.id === actId); if (!act) return;
  if (player.ap < act.apCost) return showActionModal("Усталость", "Нажмите «Прожить 1 год», чтобы восстановить силы.", "💤");
  if (act.cost && player.coins < act.cost) return showActionModal("Нехватка монет", `Требуется ${act.cost}🪙.`, "🪙");
  player.ap -= act.apCost;
  const msg = act.action(player);
  if (typeof tutorialCheck === "function") tutorialCheck("activity");
  log(msg); playSound(act.category === "combat" ? "sword" : act.category === "magic" ? "magic" : "click");
  showActionModal(act.name, msg, "✨");
  updateUI(); renderActivities();
}

function getJobDataById(id) {
  for (const reg in REGIONAL_JOBS) {
    const j = REGIONAL_JOBS[reg].find(x => x.id === id);
    if (j) return j;
  }
  return null;
}
function meetsJobReq(r) {
  return player.age >= r.minAge && (!r.minSword || player.swordGodExp >= r.minSword) && (!r.minMagic || player.magicExp >= r.minMagic) && (!r.minInt || player.intellect >= r.minInt) && (!r.minNorth || player.northGodExp >= r.minNorth);
}

function renderJobMarket(container) {
  if (player.currentJob) {
    const jData = getJobDataById(player.currentJob);
    const cur = jData?.ranks[player.jobRankIndex], next = jData?.ranks[player.jobRankIndex + 1];
    if (cur) {
      container.innerHTML = `<div class="card" style="background:#131b2e; border-color:#38bdf8;">
        <b style="color:#38bdf8;">💼 ${jData.name}</b>
        <div style="font-size:12px; margin-top:4px;">Чин: <b>${cur.title}</b> (+${cur.salary}🪙/г.)</div>
        ${next ? `<div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">
          <div style="font-size:11px; color:var(--accent-light);">Следующий чин: <b>${next.title}</b> (+${next.salary}🪙)</div>
          <div style="font-size:10px; color:var(--muted);">С ${next.minAge} л. ${next.minSword ? `• Меч ${next.minSword}+` : ""} ${next.minMagic ? `• Магия ${next.minMagic}+` : ""} ${next.minInt ? `• Знания ${next.minInt}+` : ""}</div>
          <button style="margin-top:6px; width:100%; background:#2563eb;" onclick="tryJobPromotion()">🎖️ Повышение</button>
        </div>` : `<div style="color:var(--gold); font-size:11px; margin-top:6px;">🌟 Вершина службы!</div>`}
        <button class="action-danger" style="margin-top:8px; width:100%; font-size:11px;" onclick="quitJob()">Уйти в отставку</button>
      </div>`;
      return;
    }
  }
  const repBlocked = (player.reputation || 0) <= -30;
  const jobs = REGIONAL_JOBS[player.currentRegionKey] || [];
  container.innerHTML = (repBlocked ? `<div style="color:#f87171; font-size:11px; margin-bottom:8px;">⚠️ Дурная слава (${player.reputation}): Рыцари Асуры и Храм Милиса отказывают преступникам!</div>` : "") +
    jobs.map(jb => {
      const r0 = jb.ranks[0], blocked = repBlocked && (jb.id.includes("templar") || jb.id.includes("guard")), ok = !blocked && meetsJobReq(r0);
      return `<div class="job-card"><div><b>${jb.name}</b><div style="font-size:11px; color:var(--muted);">${r0.title} (+${r0.salary}🪙/г.) • с ${r0.minAge} л.</div></div>
        <button ${ok ? "" : "disabled"} style="background:#1d4ed8;" onclick="applyForJob('${jb.id}')">${blocked ? "Запрет" : ok ? "Поступить" : "Не годен"}</button></div>`;
    }).join("");
}

function applyForJob(id) {
  const j = getJobDataById(id); if (!j) return;
  player.currentJob = id; player.jobRankIndex = 0; player.reputation += 5;
  const msg = `Вы приняты на службу: <b>${j.name}</b> (${j.ranks[0].title})!`;
  log(msg); playSound("win"); showActionModal("Служба", msg, "💼"); updateUI(); renderActivities();
}
function tryJobPromotion() {
  const next = getJobDataById(player.currentJob)?.ranks[player.jobRankIndex + 1];
  if (next && meetsJobReq(next)) {
    player.jobRankIndex++; player.reputation += 5;
    const msg = `<b>ПОВЫШЕНИЕ!</b> Новый чин: <b>${next.title}</b> (+${next.salary}🪙/г.)!`;
    log(msg); playSound("win"); showActionModal("Повышение", msg, "🎖️");
  } else showActionModal("Отказ", "Не хватает возраста или навыков!", "❌");
  updateUI(); renderActivities();
}
function quitJob() { player.currentJob = null; player.jobRankIndex = 0; log("Вы ушли со службы."); updateUI(); renderActivities(); }

function renderUndergroundMarket(container) {
  const uJob = UNDERGROUND_JOBS[player.currentRegionKey];
  if (!uJob) return;
  if (player.currentUndergroundJob) {
    const cur = uJob.ranks[player.undergroundRankIndex], next = uJob.ranks[player.undergroundRankIndex + 1];
    container.innerHTML = `<div class="card" style="background:#201115; border-color:#ef4444;">
      <b style="color:#f87171;">🗡️ ${uJob.name}</b>
      <div style="font-size:12px; margin-top:4px;">Роль: <b>${cur.title}</b> (+${cur.salary}🪙/г. • Риск: ${Math.round(cur.risk * 100)}%)</div>
      ${next ? `<button style="margin-top:8px; width:100%; background:#b91c1c;" onclick="tryUndergroundPromotion()">💀 Повыситься: ${next.title} (+${next.salary}🪙)</button>` : `<div style="color:var(--gold); font-size:11px; margin-top:6px;">👑 Владыка подполья!</div>`}
      <button class="action-danger" style="margin-top:8px; width:100%; font-size:11px;" onclick="quitUndergroundJob()">Залечь на дно</button>
    </div>`;
    return;
  }
  const r0 = uJob.ranks[0], ok = player.age >= r0.minAge;
  container.innerHTML = `<div class="job-card" style="border-color:#7f1d1d;">
    <div><b style="color:#f87171;">${uJob.name}</b><div style="font-size:11px; color:var(--muted);">${r0.title} (+${r0.salary}🪙/г.) • Риск ${Math.round(r0.risk * 100)}%</div></div>
    <button ${ok ? "" : "disabled"} style="background:#991b1b;" onclick="applyForUndergroundJob()">${ok ? "Вступить" : "Рано"}</button></div>`;
}

function applyForUndergroundJob() {
  const u = UNDERGROUND_JOBS[player.currentRegionKey];
  player.currentUndergroundJob = u.id; player.undergroundRankIndex = 0; player.reputation -= 15;
  const msg = `Вы вступили в <b>${u.name}</b> (-15 Света)!`;
  log(msg); playSound("death"); showActionModal("Подполье", msg, "🗡️"); updateUI(); renderActivities();
}
function tryUndergroundPromotion() {
  const next = UNDERGROUND_JOBS[player.currentRegionKey]?.ranks[player.undergroundRankIndex + 1];
  if (next && meetsJobReq(next)) {
    player.undergroundRankIndex++; player.reputation -= 10;
    const msg = `💀 Новая ступень в синдикате: <b>${next.title}</b> (+${next.salary}🪙/г.)!`;
    log(msg); playSound("win"); showActionModal("Синдикат", msg, "💀");
  } else showActionModal("Отказ", "Недостаточно опыта или возраста!", "❌");
  updateUI(); renderActivities();
}
function quitUndergroundJob() { player.currentUndergroundJob = null; player.undergroundRankIndex = 0; log("Вы залегли на дно."); updateUI(); renderActivities(); }

// =========================================================================
// КУЗНИЦА, ЗАВЕЩАНИЕ, ЗАМОК, КАРАВАНЫ, РЫНОК
// =========================================================================

/* ══════════════════════════════════════════════════════════
   ЗЕЛЬЕВАРЕНИЕ
   Раньше зелье просто покупалось за 15🪙. Теперь его можно
   варить самому: нужны травы, знания и время. Своё — дешевле
   и лучше покупного.
   ══════════════════════════════════════════════════════════ */

const HERBS = [
  { id: "leaf", icon: "🌿", name: "Подорожник", where: "любой регион", price: 4 },
  { id: "root", icon: "🪵", name: "Корень мандрагоры", where: "Великий Лес", price: 9 },
  { id: "crystal", icon: "💎", name: "Кристалл маны", where: "Раноа", price: 14 },
  { id: "ember", icon: "🔥", name: "Огненный цвет", where: "Бегаритт", price: 12 },
  { id: "shadow", icon: "🌑", name: "Теневая трава", where: "Демонический Континент", price: 11 }
];

const RECIPES = [
  { id: "r_heal", icon: "🧪", name: "Зелье исцеления", herbs: { leaf: 2, root: 1 }, minInt: 0, need: "знания 0+",
    desc: "+60 HP сразу", effect: "heal60" },
  { id: "r_bigheal", icon: "⚗️", name: "Большое зелье", herbs: { leaf: 3, root: 2, crystal: 1 }, minInt: 40, need: "знания 40+",
    desc: "+200 HP сразу", effect: "heal200" },
  { id: "r_mana", icon: "🔵", name: "Эликсир маны", herbs: { crystal: 2, leaf: 1 }, minInt: 25, need: "знания 25+",
    desc: "полная мана", effect: "mana" },
  { id: "r_strength", icon: "🔴", name: "Зелье силы", herbs: { ember: 2, root: 1 }, minInt: 60, need: "знания 60+",
    desc: "+3 к школе Меча навсегда", effect: "sword" },
  { id: "r_clear", icon: "✨", name: "Ясный взгляд", herbs: { shadow: 1, crystal: 1, leaf: 1 }, minInt: 80, need: "знания 80+",
    desc: "+8 Знаний навсегда", effect: "int" }
];

function ensureAlchemy() {
  if (!player.herbs || typeof player.herbs !== "object") player.herbs = {};
  if (!player.potions) player.potions = {};
}

function herbCount(id) { ensureAlchemy(); return player.herbs[id] || 0; }

function gatherHerbs() {
  ensureAlchemy();
  if (player.ap < 1) return showActionModal("Усталость", "Нужна ⚡ 1 сила.", "💤");
  player.ap -= 1;
  const region = player.currentRegionKey;
  const pool = HERBS.filter(h => {
    if (h.id === "root" && region === "great_forest") return true;
    if (h.id === "crystal" && region === "ranoa") return true;
    if (h.id === "ember" && region === "begaritt") return true;
    if (h.id === "shadow" && region === "demon") return true;
    return h.id === "leaf";
  });
  const got = [];
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const h = pool[Math.floor(Math.random() * pool.length)];
    player.herbs[h.id] = (player.herbs[h.id] || 0) + 1;
    got.push(h.icon);
  }
  player.intellect += 1;
  log(`🌿 Сбор трав: ${got.join(" ")} (+1 Знаний).`);
  showActionModal("Сбор трав", `Вы набрали: ${got.join(" ")}\n\nТравы годятся для варки зелий.`, "🌿");
  playSound("click"); updateUI(); renderAlchemy();
}

function brewPotion(recipeId) {
  ensureAlchemy();
  const r = RECIPES.find(x => x.id === recipeId);
  if (!r) return;
  if ((player.intellect || 0) < r.minInt) return showActionModal("Не хватает знаний", `Нужно ${r.minInt} Знаний.`, "📖");
  for (const [h, n] of Object.entries(r.herbs)) {
    if (herbCount(h) < n) {
      const hh = HERBS.find(x => x.id === h);
      return showActionModal("Нет ингредиентов", `Нужно: ${hh.icon} ${hh.name} ×${n}. Соберите травы.`, "🌿");
    }
  }
  for (const [h, n] of Object.entries(r.herbs)) player.herbs[h] -= n;
  player.potions[r.id] = (player.potions[r.id] || 0) + 1;
  log(`⚗️ Сварено: <b>${r.name}</b>.`);
  playSound("win"); updateUI(); renderAlchemy();
  showActionModal(r.icon + " " + r.name, `Готово. ${r.desc}.`, r.icon);
}

function useBrewedPotion(recipeId) {
  ensureAlchemy();
  const r = RECIPES.find(x => x.id === recipeId);
  if (!r || !(player.potions[r.id] > 0)) return;
  player.potions[r.id] -= 1;
  let msg = "";
  switch (r.effect) {
    case "heal60": player.hp = Math.min(player.maxHp, player.hp + 60); msg = "+60 HP"; break;
    case "heal200": player.hp = Math.min(player.maxHp, player.hp + 200); msg = "+200 HP"; break;
    case "mana": player.mana = player.maxMana; msg = "мана восстановлена"; break;
    case "sword": player.swordGodExp += 3; msg = "+3 к школе Меча"; break;
    case "int": player.intellect += 8; msg = "+8 Знаний"; break;
  }
  log(`${r.icon} Выпито: <b>${r.name}</b> (${msg}).`);
  playSound("win"); updateUI(); renderAlchemy();
}

// Докупить травы у торговца — дороже, но без похода
function buyHerb(id) {
  ensureAlchemy();
  const h = HERBS.find(x => x.id === id);
  if (!h) return;
  const price = Math.round(h.price * (typeof reputationPriceMult === "function" ? reputationPriceMult() : 1));
  if (player.coins < price) return showActionModal("Золото", `Нужно ${price}🪙.`, "🪙");
  player.coins -= price;
  player.herbs[h.id] = (player.herbs[h.id] || 0) + 1;
  updateUI(); renderAlchemy();
}

function renderAlchemy() {
  const box = $("alchemy-box");
  if (!box) return;
  ensureAlchemy();
  const herbRow = HERBS.map(h => `<div class="herb-cell${herbCount(h.id) ? "" : " empty"}">
      <span class="herb-icon">${h.icon}</span>
      <span class="herb-n">${herbCount(h.id)}</span>
      <span class="herb-name">${h.name}</span>
      <button class="herb-buy" onclick="buyHerb('${h.id}')">+${h.price}🪙</button>
    </div>`).join("");

  const recipeRows = RECIPES.map(r => {
    const can = (player.intellect || 0) >= r.minInt && Object.entries(r.herbs).every(([h, n]) => herbCount(h) >= n);
    const made = player.potions[r.id] || 0;
    const need = Object.entries(r.herbs).map(([h, n]) => {
      const hh = HERBS.find(x => x.id === h);
      return `${hh.icon}${n}`;
    }).join(" ");
    return `<div class="recipe-row${can ? " can" : ""}">
      <div class="recipe-icon">${r.icon}</div>
      <div class="recipe-body">
        <div class="recipe-name">${r.name}${made ? `<span class="recipe-have">×${made}</span>` : ""}</div>
        <div class="recipe-desc">${r.desc}</div>
        <div class="recipe-need">${need} • ${r.need}</div>
      </div>
      <div class="recipe-actions">
        <button class="recipe-brew" ${can ? "" : "disabled"} onclick="brewPotion('${r.id}')">Варить</button>
        ${made ? `<button class="recipe-use" onclick="useBrewedPotion('${r.id}')">Пить</button>` : ""}
      </div>
    </div>`;
  }).join("");

  box.innerHTML = `<div class="alch-herbs">${herbRow}</div>
    <button class="alch-gather" ${player.ap >= 1 ? "" : "disabled"} onclick="gatherHerbs()">🌿 Собрать травы (⚡ 1)</button>
    <div class="alch-recipes">${recipeRows}</div>`;
}

function renderForge() {
  const cont = $("forge-container"); if (!cont) return;
  const slots = ["weapon", "armor", "accessory"].filter(s => player.equipment[s]);
  if (!slots.length) { cont.innerHTML = `<div style="font-size:11px; color:var(--muted);">Наденьте оружие, броню или реликвию, чтобы закалить их в кузнице.</div>`; return; }
  cont.innerHTML = slots.map(s => {
    const it = player.equipment[s], lvl = it.forgeLevel || 0, cost = Math.round((it.cost * 0.4 + 35) * (lvl + 1));
    return `<div class="shop-item"><div><b>${it.name} ${lvl ? `[+${lvl}]` : ""}</b><div style="font-size:11px; color:var(--muted);">Мощь: ${getItemPower(it).toLocaleString()} БМ (+15% за ур.)</div></div>
      <button ${lvl >= BALANCE.economy.forgeMaxLevel || player.coins < cost ? "disabled" : ""} style="background:#b45309; font-size:11px;" onclick="forgeEquipSlot('${s}')">${lvl >= BALANCE.economy.forgeMaxLevel ? `MAX +${BALANCE.economy.forgeMaxLevel}` : `🔨 +${lvl + 1} (${cost}🪙)`}</button></div>`;
  }).join("");
}

function forgeEquipSlot(slot) {
  const it = player.equipment[slot]; if (!it) return;
  const lvl = it.forgeLevel || 0, cost = Math.round((it.cost * 0.4 + 35) * (lvl + 1));
  if (lvl >= BALANCE.economy.forgeMaxLevel || player.coins < cost) return;
  player.coins -= cost; it.forgeLevel = lvl + 1;
  log(`🔨 <b>${it.name}</b> закалено до <b>+${it.forgeLevel}</b>!`);
  playSound("sword"); updateUI(); renderForge();
}

function renderTestament() {
  const cont = $("testament-container"); if (!cont) return;
  const children = player.children.filter(c => !c.isDead), heir = children.find(c => c.id === player.appointedHeirId);
  const eqButtons = ["weapon", "armor", "accessory"].filter(s => player.equipment[s]).map(s => {
    const isH = player.heirloomSlot === s;
    return `<button style="font-size:10px; padding:5px 8px; background:${isH ? "#d97706" : "#1f2937"};" onclick="setHeirloom('${s}')">${isH ? "✨ Реликвия: " : "Завещать: "}${player.equipment[s].name}</button>`;
  }).join("");

  cont.innerHTML = `<div class="testament-card" style="background:#1b1828; border-color:#c084fc;">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <b style="color:#e9d5ff; font-size:13px;">📜 Завещание и Фамильная Реликвия</b>
      <span class="badge-legendary">${heir ? heir.name : "Не выбран"}</span>
    </div>
    <div style="font-size:11px; color:var(--muted); margin:4px 0;">Наследник получает <b>100% казны</b>, замки, титул Семи Сил и 1 Реликвию (включая заточку)!</div>
    ${children.length ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
      ${children.map(c => `<button style="font-size:10px; padding:5px 8px; background:${player.appointedHeirId === c.id ? "#059669" : "#312e81"};" onclick="appointTestamentHeir('${c.id}')">${player.appointedHeirId === c.id ? "👑 " : ""}${esc(c.name)}</button>`).join("")}
    </div>` : `<div style="font-size:11px; color:#fbbf24;">Заведите ребёнка в браке, чтобы выбрать преемника!</div>`}
    ${eqButtons ? `<div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;"><div style="font-size:10px; color:var(--gold); margin-bottom:4px;">Фамильная Реликвия:</div><div style="display:flex; gap:6px; flex-wrap:wrap;">${eqButtons}</div></div>` : ""}
  </div>`;
}

function appointTestamentHeir(id) { player.appointedHeirId = id; log(`👑 Наследником назначен(а) <b>${player.children.find(x => x.id === id)?.name}</b>.`); playSound("win"); updateUI(); renderTestament(); }
function setHeirloom(slot) { player.heirloomSlot = player.heirloomSlot === slot ? null : slot; if (player.heirloomSlot) log(`✨ <b>${player.equipment[slot].name}</b> объявлена Фамильной Реликвией!`); playSound("coin"); updateUI(); renderTestament(); }

function renderFamilyCastle() {
  const cont = $("family-castle-container"); if (!cont) return;
  if (!player.estates.length) { cont.innerHTML = `<div style="font-size:11px; color:var(--muted);">Купите имение ниже, чтобы сделать его Замком рода.</div>`; return; }
  const seat = ESTATES.find(e => e.id === player.familySeat);
  let html = `<div class="castle-card" style="background:#1e1a2f; border-color:#8b5cf6;">
    <div style="display:flex; justify-content:space-between;"><b style="color:#e9d5ff;">🏰 Родовое Гнездо</b><span class="badge-legendary">${seat ? seat.name : "Не выбрано"}</span></div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
      ${player.estates.map(id => {
        const e = ESTATES.find(x => x.id === id), isS = player.familySeat === id;
        return `<button style="font-size:10px; padding:5px 8px; background:${isS ? "#059669" : "#312e81"};" onclick="setFamilySeat('${id}')">${isS ? "✓ " : "Выбрать: "}${e.name}</button>`;
      }).join("")}
    </div></div>`;
  if (player.familySeat) {
    html += `<div class="section-title">Улучшения Замка</div>` + CASTLE_UPGRADES.map(u => {
      const built = player.castleUpgrades.includes(u.id);
      return `<div class="shop-item"><div><b>${u.name}</b> ${built ? '<span style="color:var(--green); font-size:10px;">✓</span>' : ""}<div style="font-size:11px; color:var(--muted);">${u.desc}</div><div style="font-size:10px; color:var(--gold);">${u.cost}🪙</div></div>
        <button ${built ? "disabled" : ""} style="background:${built ? "#059669" : "#4338ca"};" onclick="buildCastleUpgrade('${u.id}')">${built ? "Готово" : "Возвести"}</button></div>`;
    }).join("");
    if (player.castleUpgrades.includes("crypt")) {
      const cd = 5 - (player.age - player.lastCryptMeditationAge);
      html += `<div class="card" style="background:#181422; border-color:#a855f7; display:flex; justify-content:space-between; align-items:center;">
        <div><b style="color:#f3e8ff; font-size:12px;">🕯️ Склеп Предков</b><div style="font-size:10px; color:var(--muted);">Молитва раз в 5 лет (+20 к Мечу/Магии, 100% сил).</div></div>
        <button ${cd <= 0 ? "" : "disabled"} style="background:#7e22ce; font-size:11px;" onclick="meditateInCrypt()">${cd <= 0 ? "Молиться" : `${cd} л.`}</button></div>`;
    }
  }
  cont.innerHTML = html;
}
function setFamilySeat(id) { player.familySeat = id; log(`🏰 Главным замком назначен: ${ESTATES.find(e => e.id === id)?.name}.`); playSound("win"); updateUI(); renderFamilyCastle(); }
function buildCastleUpgrade(id) {
  const u = CASTLE_UPGRADES.find(x => x.id === id); if (!u || player.coins < u.cost) return showActionModal("Золото", `Нужно ${u?.cost}🪙!`, "🪙");
  player.coins -= u.cost; player.castleUpgrades.push(id);
  log(`🛠️ Возведено: <b>${u.name}</b>!`); playSound("win"); updateUI(); renderFamilyCastle();
}
function meditateInCrypt() {
  player.lastCryptMeditationAge = player.age; player.hp = player.maxHp; player.mana = player.maxMana; player.swordGodExp += 20; player.magicExp += 20;
  const msg = "Духи предков благословили вас (+20 Мечу и Магии, 100% сил)!";
  log(`🕯️ ${msg}`); playSound("magic"); showActionModal("Склеп Предков", msg, "🕯️"); updateUI(); renderFamilyCastle();
}

function renderCaravans() {
  const cont = $("caravans-container"); if (!cont) return;
  cont.innerHTML = CARAVAN_ROUTES.map(r => `
    <div class="caravan-card"><div><b>${r.name}</b><div style="font-size:11px; color:var(--muted);">${r.desc}</div>
      <div style="font-size:10px; color:var(--gold);">Вклад: ${r.cost}🪙 • Возврат: +${r.reward}🪙 • Риск: ${Math.round(r.risk * 100)}%</div></div>
      <button style="background:#0284c7;" onclick="dispatchCaravan('${r.id}')">Отправить</button></div>`).join("");
}
function dispatchCaravan(id) {
  if (player.ap < 1) return showActionModal("Усталость", "Нужно ⚡ 1 сила!", "💤");
  const r = CARAVAN_ROUTES.find(x => x.id === id);
  if (!r || player.coins < r.cost) return showActionModal("Золото", `Нужно ${r?.cost}🪙!`, "🪙");
  player.ap -= 1; player.coins -= r.cost;
  const hasVault = player.castleUpgrades.includes("grand_vault");
  const cfg = BALANCE.caravans;
  const risk = Math.max(0.05, r.risk - (hasVault ? cfg.grandVaultRiskBonus : 0) - (player.squad.length >= 3 ? cfg.squadRiskBonus : 0));
  if (Math.random() < risk) {
    const msg = `⚠️ Засада на пути «${r.name}»! Потеряно ${r.cost}🪙.`;
    log(msg); playSound("death"); showActionModal("Нападение!", msg, "⚔️");
  } else {
    const reward = hasVault ? Math.round(r.reward * (1 + BALANCE.caravans.grandVaultRewardBonus)) : r.reward;
    player.coins += reward;
    const msg = `🎉 Караван прибыл! Получено <b>+${reward}🪙</b>!`;
    log(msg); playSound("coin"); showActionModal("Прибыль!", msg, "🐪");
  }
  updateUI();
}

function renderEstates() {
  const cont = $("estate-container"); if (!cont) return;
  cont.innerHTML = ESTATES.map(e => {
    const owned = player.estates.includes(e.id);
    return `<div class="estate-card"><div><b>${e.name}</b> ${owned ? '<span style="color:var(--green); font-size:11px;">✓</span>' : ""}
      <div style="font-size:11px; color:var(--muted);">${e.desc}</div><div style="font-size:10px; color:var(--gold);">Цена: ${e.cost.toLocaleString()}🪙</div></div>
      <button ${owned ? "disabled" : ""} style="background:${owned ? "#059669" : "#312e81"};" onclick="buyEstate('${e.id}')">${owned ? "Куплено" : "Купить"}</button></div>`;
  }).join("");
}
function buyEstate(id) {
  const e = ESTATES.find(x => x.id === id);
  if (!e || player.coins < e.cost) return showActionModal("Золото", "Недостаточно монет!", "🪙");
  player.coins -= e.cost; player.estates.push(id);
  if (!player.familySeat) player.familySeat = id;
  log(`🏰 Приобретено: <b>${e.name}</b>!`); playSound("win"); updateUI(); renderEstates(); renderFamilyCastle();
}


/* ══════════════════════════════════════════════════════════
   РЕАКЦИЯ МИРА НА ПОСТУПКИ
   Добрый и жестокий путь раньше отличались только цифрой.
   Теперь у мира есть память: слухи, отношение земель, то,
   как с вами говорят и что вам поручают.
   ══════════════════════════════════════════════════════════ */

const MORALITY_TIERS = [
  { min: 120,  id: "saint",    icon: "😇", name: "Святой",        color: "#fde68a",
    rumor: "О вас говорят шёпотом: «Этот не возьмёт и монеты лишней».",
    effect: "Цены ниже, люди сами предлагают помощь, стража смотрит сквозь пальцы." },
  { min: 60,   id: "good",     icon: "🌤", name: "Доброе имя",    color: "#86efac",
    rumor: "В трактирах вас узнают и наливают первым.",
    effect: "Дешевле лечение и снаряжение, больше доверия при знакомстве." },
  { min: 20,   id: "decent",   icon: "⚖️", name: "Честный",       color: "#a5b4c8",
    rumor: "О вас не говорят ничего плохого. Уже неплохо.",
    effect: "Обычные цены, обычное отношение." },
  { min: -19,  id: "gray",     icon: "🌫", name: "Серый",         color: "#94a3b8",
    rumor: "«Кто он такой? Не знаю. И знать не хочу».",
    effect: "Настороженность: часть услуг дороже." },
  { min: -59,  id: "dark",     icon: "🌑", name: "Тёмное имя",    color: "#c084fc",
    rumor: "Вас помнят по делам, о которых не рассказывают детям.",
    effect: "Дороже лечение и торговля, но подполье принимает как своего." },
  { min: -100, id: "monster",  icon: "🩸", name: "Чудовище",      color: "#f87171",
    rumor: "Матери пугают вами детей. И не зря.",
    effect: "Максимальные цены, люди бегут, репутация закрывает многие двери." }
];

function moralityTier(rep) {
  const r = typeof rep === "number" ? rep : (player.reputation || 0);
  return MORALITY_TIERS.find(t => r >= t.min) || MORALITY_TIERS[MORALITY_TIERS.length - 1];
}

// Множитель цен от репутации
function reputationPriceMult() {
  const rep = player.reputation || 0;
  if (rep >= 120) return 0.75;
  if (rep >= 60) return 0.85;
  if (rep >= 20) return 0.95;
  if (rep >= -19) return 1.0;
  if (rep >= -59) return 1.2;
  return 1.45;
}

// Слухи: мир говорит о вас. Возвращает строку или ""
function worldRumor() {
  const rep = player.reputation || 0;
  const tier = moralityTier(rep);
  const pool = [];

  if (rep >= 120) pool.push("В Милисионе вас называют в молитвах.", "Дети играют в «героя с вашим именем».");
  else if (rep >= 60) pool.push("Торговец на площади отказался брать с вас деньги.", "Вас приглашают на деревенский праздник как почётного гостя.");
  else if (rep >= 20) pool.push("Соседи здороваются первыми.", "Слух о вашей честности дошёл до соседнего города.");
  else if (rep >= -19) pool.push("О вас не говорят — и это тоже своего рода слава.");
  else if (rep >= -59) pool.push("В трактире замолчали, когда вы вошли.", "Кто-то плюнул вслед, но не решился сказать в лицо.");
  else pool.push("Ваше имя произносят как ругательство.", "На дверях вашего дома ночью нарисовали кровь.");

  if ((player.wins || 0) >= 25) pool.push("В гильдии говорят о вашей выдержке в бою.");
  if ((player.titles || []).length >= 3) pool.push("Ваше прозвище знают даже там, где не знают лица.");
  if ((player.squad || []).length >= 3) pool.push("Ваш отряд называют в списках тех, кого стоит бояться.");

  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
}

// Отношение земель к вам (используется в цене, найме, диалогах)
function regionWarmth(regionKey) {
  const base = regionOpinion(regionKey);
  const rep = player.reputation || 0;
  return base + Math.round(rep / 6);
}

function regionWarmthLabel(regionKey) {
  const w = regionWarmth(regionKey);
  if (w >= 45) return { text: "Свои", color: "#86efac" };
  if (w >= 15) return { text: "Дружелюбно", color: "#a7f3d0" };
  if (w >= -14) return { text: "Ровно", color: "#cbd5e1" };
  if (w >= -44) return { text: "Холодно", color: "#fca5a5" };
  return { text: "Враждебно", color: "#f87171" };
}

// Сцена-эхо: доброе и злое возвращается разными людьми
const MORALITY_ECHOES = [
  { id: "me_thanks", minRep: 40, icon: "🌻",
    title: "Кто-то пришёл сказать спасибо",
    text: "На пороге стоит женщина с ребёнком. Вы не помните её.\n\n— Вы вытащили его из реки шесть лет назад. Он теперь ходит в школу.\n\nОна держит корзину с хлебом и не знает, куда деть глаза.",
    choices: [
      { text: "Взять хлеб и пригласить в дом", rep: 6, result: "Они сидели у вас до вечера. Ребёнок всё это время смотрел на ваш меч." },
      { text: "Сказать, что это был не вы", rep: -2, result: "Она ушла с корзиной. Вы соврали, и она это поняла." }
    ] },
  { id: "me_fear", maxRep: -20, icon: "🌑",
    title: "В дверь стучат ночью",
    text: "Трое. Вы узнаёте одного — он был при том, что случилось в Роа.\n\n— Мы не по делу. Мы просто хотим знать, что ты нас не тронешь.\n\nОни боятся. Это видно по рукам.",
    choices: [
      { text: "Сказать, что им нечего бояться", rep: 8, result: "Они ушли, оглядываясь. Один из них потом присылал вам вести о том, что творится в трущобах." },
      { text: "Промолчать, закрыв дверь", rep: -4, result: "Дверь закрылась. За ней долго стояла тишина, потом шаги." },
      { text: "Взять с них плату за спокойствие (60🪙)", rep: -8, coins: 60, result: "Они заплатили. Ушли быстро. Через год вы услышали, что один из них пропал." }
    ] },
  { id: "me_offer", minRep: 70, icon: "👑",
    title: "Вам предлагают власть",
    text: "Гонец из столицы привёз печать и грамоту: вас хотят видеть в совете Асуры.\n\nНо в грамоте есть приписка мелким шрифтом — за это придётся голосовать так, как скажут.",
    choices: [
      { text: "Принять с условиями (влияние +30)", rep: 4, influence: 30, result: "Вы приняли место, но оговорили право на своё слово. Вас не любят при дворе. Вас уважают." },
      { text: "Принять и не спорить (влияние +60)", rep: -12, influence: 60, result: "Вы вошли в совет. Первый же голос был против вашей совести." },
      { text: "Отказаться", rep: 10, result: "Вы вернули грамоту. Гонец удивился больше, чем следовало." }
    ] },
  { id: "me_mob", maxRep: -50, icon: "🔥",
    title: "Толпа под вашими окнами",
    text: "Двадцать человек с факелами. Они не кричат — это хуже.\n\nВпереди стоит женщина, у которой вы когда-то забрали всё.",
    choices: [
      { text: "Выйти к ним без оружия", rep: 15, hp: -20, result: "Вас избили. Но не сожгли дом и не тронули семью. Утром кто-то из толпы принёс вам воды." },
      { text: "Разогнать силой", rep: -20, hp: -10, result: "Толпа разбежалась. Двое остались лежать. Ваше имя теперь произносят только с проклятием." },
      { text: "Заплатить всем (300🪙)", rep: 5, coins: -300, result: "Вы выкупили своё имя монетами. Дорого — но этой ночью никто не умер." }
    ] }
];

// Проверка: пора ли миру отозваться
function maybeMoralEcho() {
  if (Math.random() > 0.14) return false;
  const rep = player.reputation || 0;
  const avail = MORALITY_ECHOES.filter(e =>
    (!e.minRep || rep >= e.minRep) && (!e.maxRep || rep <= e.maxRep) &&
    !(player.moralEchoesDone || []).includes(e.id)
  );
  if (!avail.length) return false;
  const e = avail[Math.floor(Math.random() * avail.length)];
  player.moralEchoesDone = player.moralEchoesDone || [];
  player.moralEchoesDone.push(e.id);

  setText("event-icon", e.icon);
  setText("event-title", e.title);
  setText("event-desc", e.text);
  const cBox = $("event-choices");
  cBox.innerHTML = "";
  e.choices.forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "event-choice-btn";
    btn.innerText = ch.text;
    btn.onclick = () => {
      if (ch.rep) player.reputation = Math.max(-100, Math.min(200, (player.reputation || 0) + ch.rep));
      if (ch.coins) player.coins = Math.max(0, player.coins + ch.coins);
      if (ch.hp) player.hp = Math.max(1, player.hp + ch.hp);
      if (ch.influence) player.asuraInfluence = (player.asuraInfluence || 0) + ch.influence;
      if ($("event-modal")) $("event-modal").style.display = "none";
      log(`🌍 <b>${esc(e.title)}</b>: ${esc(ch.result)}`);
      queueYearExtra(e.title, ch.result, e.icon);
      playSound("click");
      updateUI();
    };
    cBox.appendChild(btn);
  });
  if ($("event-modal")) $("event-modal").style.display = "flex";
  return true;
}

function getShopPrice(item) {
  let price = item.cost;
  if (player.currentRegionKey === "demon" && player.languages.includes("demon")) price = Math.floor(price * 0.8);
  // Репутация — не только цифра в бейдже: она меняет цены и отношение
  if (typeof reputationPriceMult === "function") price = Math.floor(price * reputationPriceMult());
  // Регион: в Бегаритте всё привозное, в Милисе ярмарка и дешевле.
  // Война и мор делают цены грабительскими — это часть «живого мира».
  const regionMult = typeof worldPriceMult === "function" ? worldPriceMult(player.currentRegionKey) : 1;
  price = Math.floor(price * regionMult);
  return Math.max(1, price);
}

// Объяснение цены: игрок должен видеть, почему дорого
function priceBreakdown(item) {
  const parts = [];
  const rep = player.reputation || 0;
  if (typeof reputationPriceMult === "function") {
    const m = reputationPriceMult();
    if (m < 1) parts.push(`доброе имя −${Math.round((1 - m) * 100)}%`);
    else if (m > 1) parts.push(`дурная слава +${Math.round((m - 1) * 100)}%`);
  }
  const rm = typeof worldPriceMult === "function" ? worldPriceMult(player.currentRegionKey) : 1;
  if (rm > 1.05) parts.push(`дела в землях +${Math.round((rm - 1) * 100)}%`);
  else if (rm < 0.95) parts.push(`богатый край −${Math.round((1 - rm) * 100)}%`);
  if (player.currentRegionKey === "demon" && player.languages.includes("demon")) parts.push("свой язык −20%");
  return parts.join(" • ");
}

function renderInventoryTab() {
  const inv = $("inventory-list");
  if (inv) {
    let html = "";
    if (player.potionsCount > 0) html += `<div class="shop-item"><div><b>🧪 Зелье Исцеления</b> (${player.potionsCount} шт.)<div style="font-size:11px; color:var(--muted);">+60 HP</div></div><button onclick="usePotionOutOfCombat()">Пить</button></div>`;
    html += player.inventory.map((it, i) => `
      <div class="shop-item"><div><b>${it.name}${it.forgeLevel ? ` [+${it.forgeLevel}]` : ""}</b> (+${getItemPower(it)} БМ)<div style="font-size:11px; color:var(--muted);">${it.desc}</div></div>
      <div class="inv-actions"><button class="inv-btn-equip" onclick="equipItem(${i})">Надеть</button>
      <button class="inv-btn-forge" onclick="forgeInventoryItem(${i})">🔨 Улучшить</button>
      <button class="btn-sell" onclick="sellInventoryItem(${i})">+${sellPriceOf(it)}🪙</button></div></div>`).join("");
    const totalValue = player.inventory.reduce((s, it) => s + sellPriceOf(it), 0);
    if (player.inventory.length > 1) {
      html += `<button class="inv-sell-all" onclick="sellAllJunk()">💰 Продать всё лишнее (+${totalValue}🪙)</button>`;
    }
    inv.innerHTML = html || `<div style="font-size:12px; color:var(--muted);">Рюкзак пуст.</div>`;
  }
  const shop = $("shop-list");
  if (shop) {
    const items = currentShopCategory === "all" ? SHOP_ITEMS : SHOP_ITEMS.filter(i => currentShopCategory === "artifact" ? (i.type === "accessory" || i.type === "potion") : i.type === currentShopCategory);
    shop.innerHTML = items.map(it => {
      const price = getShopPrice(it);
      const bd = priceBreakdown(it);
      return `<div class="shop-item"><div><b>${it.name}</b> <span style="color:var(--gold); font-size:11px;">${price}🪙</span><div style="font-size:11px; color:var(--muted);">${it.desc}</div>
        ${bd ? `<div class="price-note">${bd}${price !== it.cost ? ` (обычно ${it.cost}🪙)` : ""}</div>` : ""}</div>
        <button onclick="buyShopItem('${it.id}')">Купить</button></div>`;
    }).join("");
  }
}

function setShopCategory(cat, btnEl) {
  currentShopCategory = cat;
  btnEl?.parentElement?.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
  btnEl?.classList.add("active");
  renderInventoryTab(); playSound("click");
}
function buyShopItem(id) {
  const it = SHOP_ITEMS.find(i => i.id === id); if (!it) return;
  const price = getShopPrice(it);
  if (player.coins < price) return showActionModal("Золото", `Нужно ${price}🪙!`, "🪙");
  player.coins -= price;
  if (it.type === "potion") player.potionsCount++; else player.inventory.push({ ...it, forgeLevel: 0 });
  if (typeof tutorialCheck === "function") tutorialCheck("shop");
  log(`🛒 Куплено: <b>${it.name}</b> (${price}🪙).`); playSound("coin"); updateUI(); renderInventoryTab();
}
// Цена продажи с учётом репутации и вложенной закалки
function sellPriceOf(it) {
  const base = Math.floor((it.cost || 0) * BALANCE.economy.sellRatio);
  const forged = (it.forgeLevel || 0) * Math.floor((it.cost || 0) * 0.12);
  const repMult = typeof reputationPriceMult === "function" ? (0.85 + (1 - reputationPriceMult()) * 0.5) : 1;
  return Math.max(BALANCE.economy.minSellPrice, Math.round((base + forged) * repMult));
}

// Закалить предмет прямо из рюкзака
function forgeInventoryItem(idx) {
  const it = player.inventory[idx]; if (!it) return;
  const lvl = it.forgeLevel || 0;
  if (lvl >= BALANCE.economy.forgeMaxLevel) return showActionModal("Кузница", "Этот предмет уже закалён до предела.", "🔨");
  const cost = Math.round(((it.cost || 20) * 0.35 + 25) * (lvl + 1));
  if (player.coins < cost) return showActionModal("Кузница", `Нужно ${cost}🪙.`, "🪙");
  player.coins -= cost;
  it.forgeLevel = lvl + 1;
  log(`🔨 <b>${esc(it.name)}</b> закалено до <b>+${it.forgeLevel}</b> (−${cost}🪙).`);
  playSound("sword"); updateUI(); renderInventoryTab();
  showActionModal("Кузница", `${it.name} стал крепче: +${(it.forgeLevel) * 15}% мощи.`, "🔨");
}

// Продать всё, кроме надетого и лучшего в каждом слоте
function sellAllJunk() {
  if (!player.inventory.length) return;
  let total = 0, count = 0;
  // оставляем по одному лучшему предмету каждого типа
  const best = {};
  player.inventory.forEach(it => {
    if (!best[it.type] || getItemPower(it) > getItemPower(best[it.type])) best[it.type] = it;
  });
  const kept = [];
  player.inventory.forEach(it => {
    if (best[it.type] === it) { kept.push(it); return; }
    total += sellPriceOf(it); count++;
  });
  player.inventory = kept;
  player.coins += total;
  log(`💰 Продано ${count} предметов на ${total}🪙.`);
  playSound("coin"); updateUI(); renderInventoryTab();
  showActionModal("Продажа", `Вы продали ${count} ${count === 1 ? "предмет" : "предметов"} на ${total}🪙. Лучшее осталось.`, "💰");
}

function sellInventoryItem(idx) {
  const it = player.inventory[idx]; if (!it) return;
  const val = Math.max(BALANCE.economy.minSellPrice, Math.floor(it.cost * BALANCE.economy.sellRatio));
  player.coins += val; player.inventory.splice(idx, 1);
  log(`🪙 Продано: ${it.name} (+${val}🪙).`); playSound("coin"); updateUI(); renderInventoryTab();
}
function equipItem(idx) {
  const it = player.inventory[idx]; if (!it) return;
  const slot = it.type;
  if (player.equipment[slot]) unequipSlot(slot, true);
  player.equipment[slot] = it;
  if (it.hp) {
    player.maxHp += it.hp; player.hp += it.hp;
    player.maxHpBonus = (player.maxHpBonus || 0) + it.hp;
  }
  player.inventory.splice(idx, 1);
  log(`⚔️ Надето: <b>${it.name}</b>.`); playSound("sword"); updateUI(); renderInventoryTab(); renderForge(); renderTestament();
}
function unequipSlot(slot, silent = false) {
  const it = player.equipment[slot]; if (!it) return;
  // Бонус к максимуму HP не должен «застревать» в организме: запоминаем, сколько именно дал предмет
  if (silent && it.hp && player.maxHpBonus > 0) {
    player.maxHpBonus = Math.max(0, player.maxHpBonus - it.hp);
    player.maxHp = Math.max(20, player.maxHp - it.hp);
    player.hp = Math.min(player.hp, player.maxHp);
  }
  if (player.heirloomSlot === slot) player.heirloomSlot = null;
  player.inventory.push(it); player.equipment[slot] = null;
  if (!silent) { log(`Снято: ${it.name}.`); playSound("click"); updateUI(); renderInventoryTab(); renderForge(); renderTestament(); }
}
function usePotionOutOfCombat() {
  if (player.potionsCount <= 0) return;
  player.potionsCount--; player.hp = Math.min(player.maxHp, player.hp + 60);
  log("🧪 Выпито зелье (+60 HP)."); playSound("coin"); updateUI(); renderInventoryTab();
}

// =========================================================================
// ГИЛЬДИЯ, ОТРЯД, ЛАБИРИНТЫ, 7 СИЛ И БОЙ С ТЕХНИКАМИ
// =========================================================================
function renderGuildTab() {
  setText("guild-status-tag", `Ранг: ${player.guildRank}`);
  const nextRank = ADVENTURER_RANKS[ADVENTURER_RANKS.indexOf(player.guildRank) + 1];
  setText("guild-exp-text", `${player.guildExp} / ${nextRank ? ADVENTURER_REQ[nextRank] : "MAX"} GP`);
  renderPowersMonument(); renderSevenPowersQuest(); renderEndgameFactionSection();

  const dCont = $("dungeon-container");
  if (dCont) {
    const pIdx = ADVENTURER_RANKS.indexOf(player.guildRank);
    dCont.innerHTML = DUNGEONS.map(d => {
      if (typeof refreshDungeonIfNeeded === "function") refreshDungeonIfNeeded(d.id);
      const floor = player.dungeonProgress[d.id] || 1, done = floor > d.maxFloors, ok = player.age >= 10 && pIdx >= ADVENTURER_RANKS.indexOf(d.reqRank);
      const bossInfo = done ? "" : `${dungeonBossOf(d.id).icon} Хозяин: ${dungeonBossOf(d.id).name}`;
      return `<div class="card" style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between;"><b style="font-size:13px;">${d.name}</b><span class="tag badge-rare">Ранг ${d.reqRank}+</span></div>
        <div style="font-size:11px; color:var(--muted); margin:4px 0;">${d.desc}</div>
        <div style="font-size:11px; color:var(--accent-light);">${done ? "👑 Покорён (обновится через годы)" : `Этаж ${floor} из ${d.maxFloors} • ${bossInfo}`}</div>
        <button ${!ok || done ? "disabled" : ""} onclick="openDungeonExploration('${d.id}')" style="margin-top:6px; background:#4338ca; width:100%;">
          ${done ? "✓ Зачищен" : ok ? "Войти в Лабиринт (⚡ 1 сила)" : `Нужен ранг ${d.reqRank} (с 10 л.)`}
        </button></div>`;
    }).join("");
  }

  const qCont = $("guild-quests-list");
  if (qCont) {
    if (player.age < 10) qCont.innerHTML = `<div style="color:var(--muted); text-align:center;">Гильдия открыта с 10 лет!</div>`;
    else if (!player.guildQuestsThisYear.length) qCont.innerHTML = `<div style="color:var(--muted); text-align:center;">Заказы года выполнены!</div>`;
    else qCont.innerHTML = player.guildQuestsThisYear.map(q => `
      <div class="quest-card"><div><span class="tag badge-rare">Ранг ${q.rank}</span> <b style="display:block; margin:2px 0;">${q.name}</b>
        <div style="font-size:11px; color:var(--muted);">${q.enemy} • БМ ${q.cp.toLocaleString()}</div>
        <div style="font-size:11px; color:var(--gold);">+${q.reward}🪙 • +${q.gp} GP • ⚡ 2 силы</div></div>
        <button ${player.ap >= 2 ? "" : "disabled"} style="background:#312e81;" onclick="startGuildBattle('${q.id}')">${player.ap >= 2 ? "В бой" : "Нет сил"}</button></div>`).join("");
  }
}

// ═══ ПОДРАБОТКА ═══
// Раньше золото приходило только от боя: если не драться — его не было вовсе.
// Теперь есть тихая работа: меньше, но без риска и доступна всем.
function currentOddJob() {
  const jobs = [
    { id: "field", icon: "🌾", name: "Помочь на полях", minAge: 8, base: 12, stat: "hp" },
    { id: "carry", icon: "📦", name: "Носить тяжести в порту", minAge: 12, base: 22, stat: "hp" },
    { id: "scribe", icon: "✍️", name: "Переписывать бумаги", minAge: 12, base: 30, stat: "intellect" },
    { id: "guard", icon: "🛡️", name: "Сторожить склад", minAge: 16, base: 45, stat: "swordGodExp" },
    { id: "merchant", icon: "⚖️", name: "Помогать купцу с учётом", minAge: 16, base: 60, stat: "intellect" },
    { id: "teach", icon: "📖", name: "Учить чужих детей", minAge: 25, base: 80, stat: "intellect" },
    { id: "advise", icon: "🧭", name: "Давать советы за деньги", minAge: 40, base: 110, stat: "intellect" }
  ].filter(j => player.age >= j.minAge);
  if (!jobs.length) return null;
  return jobs[jobs.length - 1];
}

function doOddJob() {
  if (player.ap < 1) return showActionModal("Усталость", "Нужна ⚡ 1 сила.", "💤");
  const job = currentOddJob();
  if (!job) return showActionModal("Рано", "В таком возрасте работать не берут. Подрастёте — возьмут.", "👶");
  // В год берут только на одну подработку: это не печатный станок
  if ((player.oddJobsThisYear || 0) >= 1) {
    return showActionModal("Работы больше нет", "В этом году больше никто не нанимает. Идите в гильдию за заказами или подождите следующего года.", "🌾");
  }
  player.ap -= 1;
  // Репутация и ремесло влияют на оплату
  const repMult = typeof moralityTier === "function" ? (1 + Math.max(-0.4, Math.min(0.6, (player.reputation || 0) / 200))) : 1;
  const regionMult = currentRegionState(player.currentRegionKey).def.effect?.income || 1;
  const pay = Math.max(5, Math.round(job.base * repMult * regionMult));
  player.coins += pay;
  player.oddJobsThisYear = (player.oddJobsThisYear || 0) + 1;
  if (job.stat === "intellect") player.intellect += 2;
  else player.hp = Math.max(1, player.hp - 4);
  log(`${job.icon} <b>${job.name}</b>: +${pay}🪙.`);
  showActionModal(job.name, `Вы отработали год: +${pay}🪙. Без славы, зато без риска.`, job.icon);
  playSound("coin"); updateUI();
}

function openDungeonExploration(id) {
  if (player.ap < 1) return showActionModal("Усталость", "Нужно ⚡ 1 сила!", "💤");
  player.ap -= 1;
  if (checkSquadBetrayal()) return;
  if (typeof maybeSquadStory === "function" && maybeSquadStory()) return;
  const d = DUNGEONS.find(x => x.id === id);
  player.dungeonProgress[id] = player.dungeonProgress[id] || 1;
  dunsRested = {};
  activeDungeon = { id, obj: d };
  updateDungeonModalUI("Вы ступили под древние своды лабиринта.");
  if ($("dungeon-modal")) $("dungeon-modal").style.display = "flex";
  playSound("sword");
}


/* ══════════════════════════════════════════════════════════
   ЖИВЫЕ ПОДЗЕМЕЛЬЯ
   Раньше подземелье проходилось один раз и навсегда пустело.
   Теперь оно обновляется, меняет хозяев и приносит выбор:
   сокровище или ловушка, пленник или выход.
   ══════════════════════════════════════════════════════════ */

const DUNGEON_ROOMS = [
  { id: "r_chest", icon: "💎", title: "Запечатанный сундук",
    text: "Сундук стоит в нише, и на крышке — свежая пыль. Кто-то закрыл его недавно.",
    choices: [
      { text: "Открыть", effect: "gold", result: "Внутри монеты и старая печать. Вы взяли и то, и другое." },
      { text: "Проверить на ловушку (Знания 40+)", effect: "safe_gold", result: "Вы нашли иглу в замке и обошли её. Монеты ваши, рука цела." },
      { text: "Не трогать", effect: "nothing", result: "Вы прошли мимо. Через десять шагов услышали, как крышка открылась сама." }
    ] },
  { id: "r_prisoner", icon: "🕯️", title: "Пленник в темноте",
    text: "В клетке сидит человек. Он не просит о помощи — просто смотрит.",
    choices: [
      { text: "Освободить", effect: "freed", result: "Он встал, кивнул и ушёл в темноту. Через год вы найдёте в своём дворе подарок без записки." },
      { text: "Спросить, кто он", effect: "asked", result: "Он назвал имя, которое вы слышали при дворе. Вы ушли, оставив клетку закрытой." },
      { text: "Пройти мимо", effect: "ignore", result: "Он не окликнул. Это было хуже любого крика." }
    ] },
  { id: "r_shrine", icon: "⛩", title: "Алтарь без бога",
    text: "Каменный алтарь, на котором стёрли лицо. В чаше — вода, которой не должно быть здесь.",
    choices: [
      { text: "Выпить", effect: "drink", result: "Вода пахла железом. Вы почувствовали, как тело становится легче." },
      { text: "Положить монету", effect: "offer", result: "Монета исчезла до того, как вы убрали руку." },
      { text: "Разбить чашу", effect: "break", result: "Камень треснул, и из трещины пошёл воздух — тёплый, как дыхание." }
    ] },
  { id: "r_mirror", icon: "🪞", title: "Зеркало в стене",
    text: "В зеркале вы выглядите старше. И там, за вашей спиной, стоит кто-то ещё.",
    choices: [
      { text: "Обернуться", effect: "turn", result: "За спиной никого. Когда вы снова посмотрели в зеркало, оно было обычным." },
      { text: "Смотреть в глаза отражению", effect: "stare", result: "Вы стояли так долго, что перестали понимать, кто из вас двигается первым." },
      { text: "Разбить", effect: "smash", result: "Осколки осыпались, и каждый показывал разное." }
    ] },
  { id: "r_merchant", icon: "🎒", title: "Безумный торговец",
    text: "Он сидит на ящике в глубине лабиринта и торгует. Непонятно, как он сюда попал и как выйдет.",
    choices: [
      { text: "Купить зелье (40🪙)", effect: "buy_potion", result: "Он дал склянку и совет, который оказался важнее склянки." },
      { text: "Спросить дорогу", effect: "ask_way", result: "Он показал вниз. Вы не были уверены, что это помощь." },
      { text: "Отобрать товар", effect: "rob", result: "Он не сопротивлялся. Смотрел, как вы берёте, и улыбался." }
    ] }
];

const DUNGEON_BOSSES = [
  { id: "b_wyrm", name: "Древний Червь", icon: "🐛", coinMult: 1.0 },
  { id: "b_king", name: "Король Глубин", icon: "👑", coinMult: 1.4 },
  { id: "b_twin", name: "Близнецы Бездны", icon: "👥", coinMult: 1.2 },
  { id: "b_silent", name: "Безмолвный Страж", icon: "🗿", coinMult: 1.1 }
];

function dungeonIsCleared(id) {
  return (player.dungeonProgress[id] || 1) > (DUNGEONS.find(d => d.id === id)?.maxFloors || 5);
}

// Обновление подземелья: раз в несколько лет глубины снова наполняются
function refreshDungeonIfNeeded(id) {
  if (!player.dungeonRefresh) player.dungeonRefresh = {};
  const d = DUNGEONS.find(x => x.id === id);
  if (!d) return;
  const clearedYear = player.dungeonRefresh[id];
  const yearsSince = clearedYear ? worldState.currentWorldYear - clearedYear : 999;
  if (dungeonIsCleared(id) && yearsSince >= 6) {
    player.dungeonProgress[id] = 1;
    player.dungeonBoss = player.dungeonBoss || {};
    player.dungeonBoss[id] = DUNGEON_BOSSES[Math.floor(Math.random() * DUNGEON_BOSSES.length)].id;
    delete player.dungeonRefresh[id];
    log(`🕳️ ${d.name} снова наполнился: новые хозяева, новые глубины.`);
    return true;
  }
  if (dungeonIsCleared(id) && !clearedYear) {
    player.dungeonRefresh[id] = worldState.currentWorldYear;
  }
  return false;
}

function dungeonBossOf(id) {
  player.dungeonBoss = player.dungeonBoss || {};
  if (!player.dungeonBoss[id]) {
    player.dungeonBoss[id] = DUNGEON_BOSSES[Math.floor(Math.random() * DUNGEON_BOSSES.length)].id;
  }
  return DUNGEON_BOSSES.find(b => b.id === player.dungeonBoss[id]) || DUNGEON_BOSSES[0];
}

// Особенная комната: встречается на каждом 2–3 этаже
function maybeDungeonRoom() {
  if (!activeDungeon) return false;
  const d = activeDungeon.obj, floor = player.dungeonProgress[d.id];
  if (floor < 2 || floor % 3 !== 0) return false;
  if (Math.random() > 0.55) return false;
  const room = DUNGEON_ROOMS[Math.floor(Math.random() * DUNGEON_ROOMS.length)];
  const box = $("dung-modal-actions");
  if ($("dung-modal-body")) $("dung-modal-body").innerHTML = `<b>${room.icon} ${room.title}</b><br><br>${room.text}`;
  if (box) {
    box.innerHTML = room.choices.map((c, i) =>
      `<button style="background:#4c1d95;" onclick="resolveDungeonRoom('${room.id}', ${i})">${c.text}</button>`).join("")
      + `<button class="action-danger" onclick="closeDungeonModal()">🏃 Выйти наружу</button>`;
  }
  return true;
}

function resolveDungeonRoom(roomId, idx) {
  const room = DUNGEON_ROOMS.find(r => r.id === roomId);
  if (!room) return;
  if (!activeDungeon) return showActionModal("Пусто", "Здесь уже ничего нет.", "🕳️");
  const ch = room.choices[idx];
  let txt = ch.result;
  const floor = activeDungeon ? player.dungeonProgress[activeDungeon.obj.id] : 1;

  switch (ch.effect) {
    case "gold": {
      const g = Math.floor(30 + Math.random() * 60 + floor * 8);
      player.coins += g; txt += ` (+${g}🪙)`;
      if (Math.random() < 0.25) { player.hp -= 12; txt += " Но игла в замке всё-таки достала вас (−12 HP)."; }
      break;
    }
    case "safe_gold": {
      if ((player.intellect || 0) >= 40) { const g = Math.floor(50 + Math.random() * 50 + floor * 10); player.coins += g; txt += ` (+${g}🪙)`; }
      else { player.hp -= 25; txt += " Знаний не хватило: игла вошла в ладонь (−25 HP)."; }
      break;
    }
    case "freed": player.reputation += 8; player.squadFame += 10; break;
    case "asked": player.intellect += 5; break;
    case "ignore": player.reputation -= 3; break;
    case "drink": player.maxHp += 12; player.hp = player.maxHp; txt += " (+12 макс. HP)"; break;
    case "offer": if (player.coins >= 5) { player.coins -= 5; player.maxMana += 10; txt += " (+10 макс. маны)"; } break;
    case "break": player.hp -= 15; player.intellect += 8; txt += " (−15 HP, +8 Знаний)"; break;
    case "turn": player.intellect += 4; break;
    case "stare": player.hp -= 10; player.intellect += 12; txt += " (−10 HP, +12 Знаний)"; break;
    case "smash": player.hp -= 8; player.reputation -= 5; txt += " (−8 HP)"; break;
    case "buy_potion": if (player.coins >= 40) { player.coins -= 40; player.potionsCount++; txt += " (зелье в рюкзаке)"; } else txt += " Но у вас не нашлось сорока монет."; break;
    case "ask_way": player.dungeonProgress[activeDungeon.obj.id]++; txt += " Вы спустились на этаж ниже."; break;
    case "rob": player.coins += 60; player.reputation -= 12; txt += " (+60🪙, −12 репутации)"; break;
  }

  player.dungeonProgress[activeDungeon.obj.id]++;
  if (player.dungeonProgress[activeDungeon.obj.id] > activeDungeon.obj.maxFloors) {
    finishDungeonWithBoss();
    return;
  }
  updateDungeonModalUI(txt); updateUI();
  if (player.hp <= 0) { closeDungeonModal(); handleDeath("Погиб в лабиринте"); }
}

function finishDungeonWithBoss() {
  const d = activeDungeon.obj;
  const boss = dungeonBossOf(d.id);
  const drop = SHOP_ITEMS.find(i => i.id === d.dropArtifact);
  if (drop) player.inventory.push({ ...drop, forgeLevel: 0 });
  const gold = Math.round(320 * boss.coinMult);
  player.coins += gold; player.guildExp += 140; player.squadFame += 120; player.reputation += 15;
  player.dungeonRefresh = player.dungeonRefresh || {};
  player.dungeonRefresh[d.id] = worldState.currentWorldYear;
  const txt = `👑 <b>ПОБЕДА!</b> ${boss.icon} ${boss.name} повержен. ${d.name} зачищен!\n\nНаграда: <b>${drop?.name || "трофей"}</b> (+${gold}🪙, +140 GP).\n\nЧерез несколько лет глубины снова наполнятся.`;
  log(txt); playSound("win");
  if ($("dung-modal-body")) $("dung-modal-body").innerHTML = txt.replace(/\n/g, "<br>");
  if ($("dung-modal-actions")) $("dung-modal-actions").innerHTML = `<button class="btn-main" onclick="closeDungeonModal()">👑 Покинуть лабиринт</button>`;
  updateUI();
}

function updateDungeonModalUI(text) {
  if (!activeDungeon) return;
  const d = activeDungeon.obj, floor = player.dungeonProgress[d.id];
  setText("dung-modal-title", d.name);
  setText("dung-modal-floor-info", floor > d.maxFloors ? "Покорён!" : `Этаж ${floor} из ${d.maxFloors}`);
  setText("dung-hp-text", `${player.hp}/${player.maxHp}`);
  if ($("dung-hp-bar")) $("dung-hp-bar").style.width = `${Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))}%`;
  if ($("dung-modal-body")) $("dung-modal-body").innerHTML = text;
  const box = $("dung-modal-actions"); if (!box) return;
  const restLeft = Math.max(0, DUNGEON_RESTS_PER_RUN - (dunsRested[d.id] || 0));
  box.innerHTML = floor > d.maxFloors
    ? `<button class="btn-main" onclick="closeDungeonModal()">👑 Покинуть лабиринт</button>`
    : `<button style="background:#4338ca;" onclick="dungeonTurn('fight')">⚔️ Пробиваться через этаж</button>
       <button style="background:#1d4ed8;" onclick="dungeonTurn('scout')">👁️ Разведка тайников</button>
       <button style="background:#059669;" onclick="dungeonTurn('rest')">🧪 Привал (+30 HP, +20 маны)${restLeft > 0 ? ` • осталось ${restLeft}` : " • исчерпан"}</button>
       <button class="action-danger" onclick="closeDungeonModal()">🏃 Выйти наружу</button>`;
}

function dungeonTurn(choice) {
  if (!activeDungeon) return;
  const d = activeDungeon.obj, floor = player.dungeonProgress[d.id];
  const hasManaSight = player.demonEyes.left?.id === "mana_sight" || player.demonEyes.right?.id === "mana_sight";
  let txt = "";
  if (choice === "rest") {
    const used = dunsRested[d.id] || 0;
    if (used >= DUNGEON_RESTS_PER_RUN) {
      txt = `⛺ Привал уже был — больше отдохнуть в этом заходе не выйдет (${DUNGEON_RESTS_PER_RUN} из ${DUNGEON_RESTS_PER_RUN}).`;
      playSound("click");
    } else {
      dunsRested[d.id] = used + 1;
      player.hp = Math.min(player.maxHp, player.hp + 30); player.mana = Math.min(player.maxMana, player.mana + 20);
      txt = `Отряд перевёл дух (+30 HP, +20 маны). Осталось привалов: ${DUNGEON_RESTS_PER_RUN - dunsRested[d.id]}.`;
      playSound("magic");
    }
  } else if (choice === "scout") {
    const r = Math.random();
    // Чем глубже этаж, тем чаще ловушки и реже халявный спуск
    const trapChance = 0.25 + Math.min(0.25, floor * 0.02);
    const shortcutChance = Math.max(0.06, 0.28 - floor * 0.02);
    if (r < trapChance && floor > 1) {
      if (hasManaSight) txt = "🔮 <b>Глаз Маны</b> раскрыл ловушку и уберёг отряд!";
      else { const back = Math.min(floor - 1, 2); player.dungeonProgress[d.id] -= back; txt = `🌀 Ловушка отбросила вас на -${back} этажа!`; playSound("calamity"); }
    } else if (r < trapChance + shortcutChance) {
      player.dungeonProgress[d.id]++; txt = `Вы нашли тайный спуск на ${player.dungeonProgress[d.id]} этаж!`; playSound("win");
    } else {
      const gold = Math.floor(Math.random() * 45) + 20; player.coins += gold;
      txt = `💎 В тайнике найден клад (+${gold}🪙)!`; playSound("coin");
    }
  } else {
    // Особенная комната вместо обычной драки — выбор, а не цифра
    if (typeof maybeDungeonRoom === "function" && maybeDungeonRoom()) { updateUI(); return; }
    const mCp = Math.floor(d.cpBase * (1 + floor * 0.42)), dmg = Math.max(6, Math.floor(mCp / (calcSquadCombatPower(player) + 80) * 18) + 8);
    player.hp -= dmg;
    if (dmg > 32 && Math.random() < 0.20 && !player.injuries.some(i => i.id === "lost_arm")) {
      player.injuries.push({ id: "lost_arm", name: "Утрата левой руки" });
      txt = `🩸 <b>ТРАВМА!</b> Вы потеряли руку (-${dmg} HP)! Ищите Протез или Целителя Милиса.`; playSound("death");
    } else { txt = `⚔️ Стражи ${floor} этажа повержены (-${dmg} HP)!`; playSound("sword"); }
    player.dungeonProgress[d.id]++;
  }
  if (player.dungeonProgress[d.id] > d.maxFloors) {
    finishDungeonWithBoss();
    return;
  }
  updateDungeonModalUI(txt); updateUI();
  if (player.hp <= 0) { closeDungeonModal(); handleDeath(`Сгинул в недрах: ${d.name}`); }
}
function closeDungeonModal() { if ($("dungeon-modal")) $("dungeon-modal").style.display = "none"; activeDungeon = null; updateUI(); renderGuildTab(); }

// Год на троне Семи Сил: покровительство Владыки приносит плоды
function applySevenPowerSeatYearly() {
  if (!player.currentPowersSeat) return;
  const lore = getPowerLore(player.currentPowersSeat);
  const bonus = lore?.seatBonus;
  if (!bonus) return;
  const parts = [];
  if (bonus.intellect) { player.intellect += bonus.intellect; parts.push(`+${bonus.intellect} Знаний`); }
  if (bonus.swordGod) { player.swordGodExp += bonus.swordGod; parts.push(`+${bonus.swordGod} Мечу`); }
  if (bonus.magicExp) { player.magicExp += bonus.magicExp; parts.push(`+${bonus.magicExp} Магии`); }
  if (bonus.northGod) { player.northGodExp += bonus.northGod; parts.push(`+${bonus.northGod} Северу`); }
  if (bonus.hpRegen) { player.hp = Math.min(player.maxHp, player.hp + bonus.hpRegen); parts.push(`+${bonus.hpRegen} HP`); }
  if (bonus.reputation) { player.reputation = (player.reputation || 0) + bonus.reputation; parts.push(`${bonus.reputation} репутации`); }
  if (bonus.estateIncomePercent) {
    const inc = (player.estates || []).reduce((sum, id) => sum + (ESTATES.find(e => e.id === id)?.income || 0), 0);
    const extra = Math.floor(inc * bonus.estateIncomePercent / 100);
    if (extra > 0) { player.coins += extra; parts.push(`+${extra}🪙 с имений`); }
  }
  if (parts.length) log(`🏆 Трон #${player.currentPowersSeat} даёт роду: ${parts.join(", ")}.`);
}

// Подарок Владыке: отношение растёт, но золото уходит
function giveTributeToPower(rank) {
  const pow = worldState.sevenPowers.find(p => p.rank === rank);
  if (!pow) return;
  const cost = 60;
  if (player.coins < cost) return showActionModal("Золото", `Нужно ${cost}🪙 на дары.`, "🪙");
  player.coins -= cost;
  changePowerAttitude(rank, 10);
  const att = getPowerAttitudeLabel(pow.attitude);
  const lore = getPowerLore(rank);
  const reply = (Number(pow.attitude) >= 40 && lore) ? lore.respect : (lore ? lore.greet : "«Принято.»");
  log(`🎁 Дары для Владыки #${rank} (${esc(pow.name)}): отношение — ${att.text}.`);
  showActionModal(pow.title, `<div style="color:#c084fc;">${esc(reply)}</div><div class="destiny-muted" style="margin-top:6px;">Отношение: ${att.text} (−${cost}🪙)</div>`, "🎁");
  playSound("coin");
  updateUI();
  renderDestinyWindow();
}

function renderPowersMonument() {
  const cont = $("powers-monument-list"); if (!cont) return;
  cont.innerHTML = worldState.sevenPowers.map(pow => {
    const isMe = player.currentPowersSeat === pow.rank, found = player.discoveredSevenPowers.includes(pow.rank);
    return `<div class="power-row ${isMe ? "power-player" : ""}">
      <div style="display:flex; align-items:center;"><span class="power-rank">#${pow.rank}</span>
        <div><b>${isMe ? `${esc(player.name)} (ВЫ!)` : `${esc(pow.title)} — ${esc(pow.name)}`}</b>
          ${(() => { const lore = getPowerLore(pow.rank); const att = getPowerAttitudeLabel(pow.attitude);
            return lore ? `<div style="font-size:10px; color:var(--muted); margin-top:2px;">«${esc(lore.epithet)}» • ${att.text}</div>` : ""; })()}
        <div style="font-size:10px; color:var(--muted);">${isMe ? `Ваш трон • ${calcCombatPower(player).toLocaleString()} БМ` : `Мощь: ${pow.cp.toLocaleString()} БМ`}</div></div></div>
      <div>${isMe ? `<span class="badge-legendary">ВАШ ТИТУЛ 👑</span>` : `<button class="btn-challenge" ${found ? "" : "disabled"} onclick="challengeSevenPower(${pow.rank})">${found ? "⚔️ Вызов" : "🔒 Не найден"}</button>`}</div>
    </div>`;
  }).join("");
}

function renderSevenPowersQuest() {
  const cont = $("seven-powers-quest-container"), badge = $("seven-powers-notify");
  if (!cont) return;
  const nextQ = SEVEN_POWERS_QUESTS.find(q => player.currentPowersSeat !== q.rank && !player.discoveredSevenPowers.includes(q.rank));
  if (!nextQ) { if (badge) badge.style.display = "none"; cont.innerHTML = `<div style="font-size:11px; color:var(--muted);">Все доступные владыки выслежены!</div>`; return; }
  const myCp = calcCombatPower(player), canTrack = myCp >= nextQ.reqCp, inReg = player.currentRegionKey === nextQ.regionKey;
  if (badge) badge.style.display = canTrack ? "inline-block" : "none";
  cont.innerHTML = `<div class="powers-quest-card">
    <div style="display:flex; justify-content:space-between;"><b style="color:#f59e0b; font-size:13px;">🔍 #${nextQ.rank}: ${nextQ.title}</b><span class="badge-rare">${nextQ.reqCp.toLocaleString()} БМ</span></div>
    <div style="font-size:11px; color:var(--muted); margin:4px 0;">${nextQ.desc} (${REGIONS[nextQ.regionKey].name})</div>
    <button ${canTrack && inReg ? "" : "disabled"} style="background:#d97706; width:100%;" onclick="trackSevenPower(${nextQ.rank})">
      ${!canTrack ? `Нужно ${nextQ.reqCp.toLocaleString()} БМ` : !inReg ? `Прибудьте в ${REGIONS[nextQ.regionKey].name}` : "🧭 Выследить Владыку (⚡ 1 сила)"}
    </button></div>`;
}
function trackSevenPower(rank) {
  if (player.ap < 1) return showActionModal("Усталость", "Нужно ⚡ 1 сила!", "💤");
  player.ap -= 1; player.discoveredSevenPowers.push(rank);
  const pow = worldState.sevenPowers.find(p => p.rank === rank);
  const msg = `🧭 Вы выследили #${rank} ${pow.title} — <b>${pow.name}</b>! Бросайте вызов на Монументе.`;
  log(msg); playSound("win"); showActionModal("Владыка найден!", msg, "🏆"); updateUI(); renderGuildTab();
}

function vacatePowerSeatToWorld(prevHero, reasonText = "пал без преемников") {
  if (!prevHero?.currentPowersSeat) return;
  const pow = worldState.sevenPowers.find(p => p.rank === prevHero.currentPowersSeat);
  if (!pow) return;
  const pool = REPLACEMENT_MASTERS[pow.rank] || ["Безымянный Мастер"];
  const newName = pool[Math.floor(Math.random() * pool.length)];
  pow.name = newName; pow.holderType = "npc"; pow.isDead = false;
  pow.cp = SEVEN_GREAT_POWERS.find(x => x.rank === pow.rank)?.cp || pow.cp;
  pow.hp = pow.maxHp;
  worldState.chronicles.push({ year: worldState.currentWorldYear, text: `🏆 После того как ${prevHero.name} ${reasonText}, трон #${pow.rank} (${pow.title}) занял(а) <b>${newName}</b>!` });
}

function renderEndgameFactionSection() {
  const cont = $("endgame-faction-section"); if (!cont) return;
  const cfg = FACTION_ENDGAMES[player.dynastyFaction];
  if (!cfg || player.generation < cfg.reqGen) { cont.innerHTML = ""; return; }
  const myCp = calcCombatPower(player), ok = myCp >= cfg.reqCp;
  cont.innerHTML = `<div class="${cfg.cardClass}">
    <div style="display:flex; justify-content:space-between;"><b style="color:#fff; font-size:13px;">${cfg.title}</b><span class="badge-mythic">Поколение ${player.generation}/${cfg.reqGen}+</span></div>
    <div style="font-size:11px; color:#e2e8f0; margin:6px 0;">${cfg.desc}</div>
    <button ${ok ? "" : "disabled"} style="background:linear-gradient(135deg,#7c3aed,#4c1d95); width:100%;" onclick="startFactionEndgameRaid()">
      ${ok ? cfg.btnText : `Требуется ${cfg.reqCp.toLocaleString()} БМ`}
    </button></div>`;
}

function getBestBattleTech(p) {
  const best = Math.max(p.swordGodExp, p.waterGodExp, p.northGodExp, p.magicExp);
  if (best < 120) return null;
  if (p.magicExp === best) return { name: "⚡ Электрический Шторм", kind: "magic", stun: true };
  if (p.swordGodExp === best) return { name: "⚔️ Длинный Меч Света", kind: "sword", crit: 2.3 };
  if (p.waterGodExp === best) return { name: "💧 Поток Отражения", kind: "water", block: 0.15 };
  return { name: "🌪️ Финт из Тени", kind: "north", stun: true };
}

function openBattleModal(battleCfg) {
  // Сложность меняет силу врага: на суровой те же твари злее
  const diff = typeof currentDifficulty === "function" ? currentDifficulty() : { enemyMult: 1, coinsMult: 1 };
  if (!battleCfg.skipDifficulty) {
    battleCfg = {
      ...battleCfg,
      enemyHp: Math.round((battleCfg.enemyHp || 100) * diff.enemyMult),
      enemyMaxHp: Math.round((battleCfg.enemyMaxHp || 100) * diff.enemyMult),
      reward: battleCfg.reward ? Math.round(battleCfg.reward * diff.coinsMult) : battleCfg.reward
    };
  }
  currentBattle = { ...battleCfg, techCd: 0, enemyStunned: false };
  setText("battle-enemy-name", battleCfg.enemyName);
  setText("battle-enemy-cp", `БМ: ${battleCfg.enemyCp.toLocaleString()}`);
  if ($("battle-log")) $("battle-log").innerHTML = battleCfg.intro;
  updateBattleBars();
  if ($("battle-modal")) $("battle-modal").style.display = "flex";
}

function updateBattleBars() {
  if (!currentBattle) return;
  setText("battle-enemy-hp-text", `${Math.max(0, currentBattle.enemyHp)}/${currentBattle.enemyMaxHp}`);
  if ($("battle-enemy-hp-bar")) $("battle-enemy-hp-bar").style.width = `${Math.max(0, (currentBattle.enemyHp / currentBattle.enemyMaxHp) * 100)}%`;
  setText("battle-player-hp-text", `${Math.max(0, player.hp)}/${player.maxHp}`);
  if ($("battle-player-hp-bar")) $("battle-player-hp-bar").style.width = `${Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))}%`;
  setText("battle-player-mana-text", `${player.mana}/${player.maxMana}`);
  if ($("battle-player-mana-bar")) $("battle-player-mana-bar").style.width = `${Math.max(0, Math.min(100, (player.mana / player.maxMana) * 100))}%`;

  const techBtn = $("btn-battle-tech"), tech = getBestBattleTech(player);
  if (techBtn) {
    techBtn.disabled = !tech || currentBattle.techCd > 0;
    techBtn.innerText = !tech ? "⚡ Техника (Святой+)" : currentBattle.techCd > 0 ? `⚡ КД: ${currentBattle.techCd}` : tech.name;
  }
}

function startGuildBattle(id) {
  if (player.ap < 2) return showActionModal("Усталость", "Нужно ⚡ 2 силы!", "💤");
  const q = player.guildQuestsThisYear.find(x => x.id === id); if (!q) return;
  player.ap -= 2;
  openBattleModal({ quest: q, enemyName: `${q.enemy} (Ранг ${q.rank})`, enemyHp: q.hp, enemyMaxHp: q.hp, enemyCp: q.cp, intro: `Схватка против <b>${q.enemy}</b> началась!` });
  playSound("sword");
}
function challengeSevenPower(rank) {
  const pow = worldState.sevenPowers.find(p => p.rank === rank); if (!pow) return;
  ensureSevenPowersLore();
  const lore = getPowerLore(rank);
  const att = getPowerAttitudeLabel(pow.attitude);
  const greeting = getPowerGreeting(rank);
  const intro = `
    <div style="color:#c084fc; margin-bottom:6px;">${esc(greeting)}</div>
    <div style="font-size:11px; color:var(--muted); margin-bottom:6px;">${esc(pow.title)} • «${esc(lore?.epithet || "Владыка")}» • отношение к вам: ${att.text}</div>
    ⚡ Вызов за ранг #${pow.rank} Семи Сил!`;
  // Владыка, который вас уважает, даёт фору — и потом это помнит
  if ((Number(pow.attitude) || 0) >= 40) {
    openBattleModal({ isSevenPower: true, powerObj: pow, enemyName: `${pow.title} ${pow.name}`, enemyHp: Math.floor(pow.maxHp * 0.9), enemyMaxHp: pow.maxHp, enemyCp: pow.cp, intro });
  } else {
    openBattleModal({ isSevenPower: true, powerObj: pow, enemyName: `${pow.title} ${pow.name}`, enemyHp: pow.maxHp, enemyMaxHp: pow.maxHp, enemyCp: pow.cp, intro });
  }
  playSound("calamity");
}
function startFactionEndgameRaid() {
  const cfg = FACTION_ENDGAMES[player.dynastyFaction]; if (!cfg) return;
  openBattleModal({ isEndgame: true, endgameFaction: player.dynastyFaction, enemyName: cfg.boss.name, enemyHp: cfg.boss.hp, enemyMaxHp: cfg.boss.maxHp, enemyCp: cfg.boss.cp, intro: `🌌 <b>ФИНАЛЬНАЯ БИТВА ЭПОХИ!</b> Перед вами ${cfg.boss.name}!` });
  playSound("calamity");
}


/* ══════════════════════════════════════════════════════════
   НАЁМНИКИ В БОЮ
   Раньше отряд был просто прибавкой к силе. Теперь каждый
   наёмник — человек со своим характером, который может
   закрыть вас собой или продать за деньги.
   ══════════════════════════════════════════════════════════ */

// Характер решает, как наёмник поведёт себя в опасный момент
function squadMemberMoment(member) {
  const trait = SQUAD_TRAITS.find(t => t.id === member.traitId) || SQUAD_TRAITS[0];
  const roll = Math.random();
  const loyalty = (member.loyalty ?? 50);

  // 1. Может закрыть собой при смертельном ударе
  if (roll < (trait.protect || 0) * (0.5 + loyalty / 100)) {
    return { kind: "protect", trait };
  }
  // 2. Может предать: ударить в спину или забрать долю
  if (roll > 0.93 && Math.random() < (trait.betrayal || 0.1) * (1.6 - loyalty / 100)) {
    return { kind: "betray", trait };
  }
  // 3. Может отличиться — сильный удар
  if (roll > 0.55) return { kind: "hero", trait };
  return { kind: "normal", trait };
}

function applySquadMoment(ally, moment, logBox) {
  const t = moment.trait;
  switch (moment.kind) {
    case "protect": {
      const saved = Math.floor(player.hp * 0.25) + 10;
      player.hp = Math.min(player.maxHp, player.hp + saved);
      ally.loyalty = Math.min(100, (ally.loyalty || 50) + 12);
      if (logBox) logBox.innerHTML += `<div style="color:#34d399;">🛡️ <b>${esc(ally.name)}</b> закрыл(а) вас собой (+${saved} HP)! «${esc(t.protectLine || "Ещё рано умирать.")}»</div>`;
      addSquadStory(ally, "protect");
      return 0;
    }
    case "betray": {
      const dmg = Math.floor((ally.cp || 100) * 0.06) + 8;
      player.hp -= dmg;
      if (logBox) logBox.innerHTML += `<div style="color:#f87171;">🗡️ <b>${esc(ally.name)}</b> ударил(а) в спину (−${dmg} HP)! «${esc(t.betrayLine || "Прости, но твоя доля больше моей.")}»</div>`;
      ally.loyalty = Math.max(0, (ally.loyalty || 50) - 40);
      addSquadStory(ally, "betray");
      return -dmg;
    }
    case "hero": {
      const bonus = Math.floor((ally.cp || 100) * 0.04) + 6;
      if (logBox) logBox.innerHTML += `<div style="color:#fbbf24;">⚡ <b>${esc(ally.name)}</b> отличился и добил(а) врага (+${bonus} урона)!</div>`;
      ally.loyalty = Math.min(100, (ally.loyalty || 50) + 3);
      return bonus;
    }
    default: return 0;
  }
}

function addSquadStory(ally, kind) {
  if (!ally.stories) ally.stories = [];
  const pool = SQUAD_STORIES.filter(s => s.kind === kind);
  if (!pool.length) { if (ally.story) ally.stories.push(ally.story); return; }
  const story = pool[Math.floor(Math.random() * pool.length)];
  if (ally.stories.includes(story.id)) return;
  ally.stories.push(story.id);
}

// После боя: кто-то может уйти, кто-то — стать ближе
function afterBattleSquad() {
  if (!player.squad || !player.squad.length) return;
  const leaving = [];
  player.squad.forEach(m => {
    if ((m.loyalty ?? 50) < 15 && Math.random() < 0.35) leaving.push(m);
  });
  if (leaving.length) {
    player.squad = player.squad.filter(m => !leaving.includes(m));
    leaving.forEach(m => {
      log(`🚶 <b>${esc(m.name)}</b> ушёл из отряда: «${esc(SQUAD_TRAITS.find(t => t.id === m.traitId)?.leaveLine || "Дальше без меня.")}»`);
      queueYearExtra("Отряд", `${m.name} покинул вас.`, "🚶");
    });
    playSound("calamity");
  }
  // Верность растёт у довольных
  player.squad.forEach(m => {
    if ((m.loyalty ?? 50) > 60) m.loyalty = Math.min(100, (m.loyalty ?? 50) + 2);
  });
}

// Наёмники становятся участниками драки: их характер определяет исход
function squadReactionInBattle(logBox) {
  if (!player.squad || !player.squad.length) return;
  const ally = player.squad[Math.floor(Math.random() * player.squad.length)];
  const moment = squadMemberMoment(ally);
  applySquadMoment(ally, moment, logBox);
}

function combatAction(type) {
  if (!currentBattle) return;
  // Враг уже мёртв — кнопки не должны досчитывать удары
  if (currentBattle.enemyHp <= 0) return;
  const logBox = $("battle-log"), squadCp = currentBattle.isDuel ? calcCombatPower(player) : calcSquadCombatPower(player);
  const hasForesight = player.demonEyes.left?.id === "foresight" || player.demonEyes.right?.id === "foresight";
  const hasAppraisal = player.demonEyes.left?.id === "appraisal" || player.demonEyes.right?.id === "appraisal";
  const silentCast = player.trait.id === "silent_cast";

  if (type === "flee") {
    if (currentBattle.isSevenPower || currentBattle.isEndgame) {
      if (logBox) logBox.innerHTML += `<div style="color:var(--hp);">Из судьбоносной битвы не сбежать!</div>`;
      return;
    }
    if ($("battle-modal")) $("battle-modal").style.display = "none";
    currentBattle = null; return;
  }

  let dmgReduction = 1.0, myDmg = 0;
  if (type === "potion") {
    if (player.potionsCount <= 0) { if (logBox) logBox.innerHTML += `<div style="color:var(--hp);">Зелья закончились!</div>`; return; }
    player.potionsCount--; player.hp = Math.min(player.maxHp, player.hp + 60);
    if (logBox) logBox.innerHTML += `<div style="color:var(--green);">🧪 Вы выпили зелье (+60 HP)!</div>`;
    playSound("coin");
  } else if (type === "tech") {
    const tech = getBestBattleTech(player);
    if (!tech || currentBattle.techCd > 0) return;
    currentBattle.techCd = 3;
    const base = Math.floor((Math.max(player.swordGodExp, player.waterGodExp, player.northGodExp, player.magicExp) + 20) * (squadCp / (currentBattle.enemyCp + 80)) * 3.2) + 30;
    myDmg = tech.crit ? Math.floor(base * tech.crit) : base;
    if (tech.block) dmgReduction = tech.block;
    if (tech.stun) currentBattle.enemyStunned = true;
    if (tech.kind === "magic") player.mana = Math.max(0, player.mana - (silentCast ? 8 : 15));
    if (logBox) logBox.innerHTML += `<div style="color:#c084fc;"><b>${tech.name}: -${myDmg} HP!</b>${tech.stun ? " (Враг оглушён!)" : ""}</div>`;
    playSound(tech.kind === "magic" ? "magic" : "sword");
  } else if (type === "parry") {
    const school = BALANCE.schools.water;
    dmgReduction = Math.max(0.2, school.blockBase - (player.waterGodExp / school.blockPerExp));
    myDmg = Math.floor((player.waterGodExp + 20) * (squadCp / (currentBattle.enemyCp + 80)) * school.counterMult) + 10;
    if (logBox) logBox.innerHTML += `<div>💧 Парирование и контрудар: <b>-${myDmg} HP</b>!</div>`;
    playSound("sword");
  } else if (type === "north") {
    // Финт Севера: чуть слабее меча, но даёт шанс уйти от ответного удара
    const school = BALANCE.schools.north;
    const pwr = Math.max(15, player.northGodExp + player.waterGodExp);
    myDmg = Math.floor(pwr * (squadCp / (currentBattle.enemyCp + 80)) * 1.9 * school.dmgMult) + Math.floor(Math.random() * 15) + 10;
    if (hasAppraisal) myDmg = Math.floor(myDmg * 1.2);
    if (logBox) logBox.innerHTML += `<div>🌪️ Стремительный финт: <b>-${myDmg} HP</b>!</div>`;
    playSound("sword");
  } else if (type === "sword") {
    const school = BALANCE.schools.sword;
    const pwr = Math.max(15, player.swordGodExp + player.waterGodExp + player.northGodExp);
    const accuracy = Math.min(1, school.accuracy + (hasAppraisal ? 0.08 : 0));
    if (Math.random() > accuracy) {
      myDmg = 0;
      if (logBox) logBox.innerHTML += `<div style="color:var(--muted);">⚔️ Размашистый удар ушёл в пустоту — промах!</div>`;
      playSound("sword");
    } else {
      myDmg = Math.floor(pwr * (squadCp / (currentBattle.enemyCp + 80)) * 1.9 * school.dmgMult) + Math.floor(Math.random() * 20) + 12;
      if (hasAppraisal) myDmg = Math.floor(myDmg * 1.3);
      if (logBox) logBox.innerHTML += `<div>⚔️ Выпад клинком: <b>-${myDmg} HP</b>!</div>`;
      playSound("sword");
    }
  } else if (type === "magic") {
    const school = BALANCE.schools.magic;
    const manaCost = silentCast ? school.manaCostSilent : school.manaCost;
    if (player.mana < manaCost) {
      myDmg = 8; if (logBox) logBox.innerHTML += `<div style="color:var(--muted);">Мана на нуле (-8 HP)!</div>`;
    } else {
      player.mana -= manaCost;
      myDmg = Math.floor((player.magicExp + 15) * (squadCp / (currentBattle.enemyCp + 80)) * 2.3) + Math.floor(Math.random() * 25) + 18;
      if (silentCast) myDmg = Math.floor(myDmg * 1.3);
      if (hasAppraisal) myDmg = Math.floor(myDmg * 1.3);
      if (logBox) logBox.innerHTML += `<div>🔮 Удар стихией: <b>-${myDmg} HP</b>!</div>`;
      playSound("magic");
    }
  }

  if (type !== "tech" && currentBattle.techCd > 0) currentBattle.techCd--;

  if (!currentBattle.isDuel && player.squad.length > 0 && type !== "potion") {
    const ally = player.squad[Math.floor(Math.random() * player.squad.length)];
    const allyDmg = Math.max(8, Math.floor((ally.cp / (currentBattle.enemyCp + 150)) * 40));
    myDmg += allyDmg;
    if (logBox) logBox.innerHTML += `<div style="color:#a78bfa;">🛡️ ${esc(ally.name)} наносит <b>-${allyDmg} HP</b>!</div>`;
    // Характер наёмника может перевернуть бой
    if (typeof squadReactionInBattle === "function") squadReactionInBattle(logBox);
  }

  currentBattle.enemyHp -= myDmg;

  if (currentBattle.enemyHp <= 0) {
    if (logBox) logBox.innerHTML += `<div style="color:var(--gold); font-weight:700;">🏆 ПОБЕДА!</div>`;
    player.wins = (player.wins || 0) + 1;
    if (typeof afterBattleSquad === "function") afterBattleSquad();
    checkAchievements();
    playSound("win");
    if (currentBattle.isEndgame) {
      const msg = currentBattle.endgameFaction === "hitogami"
        ? `👁️👑 <b>ОРСТЕД ПОВЕРЖЕН!</b> Воля Хитогами восторжествовала! Ваш род вознесён как Высшие Апостолы!`
        : `🌌👑 <b>ХИТОГАМИ ПОВЕРЖЕН!</b> Вы и Орстед разорвали цепи Пустоты и спасли Шестилий Мир!`;
      player.coins += 10000; log(msg);
      worldState.chronicles.push({ year: worldState.currentWorldYear, text: msg });
      showActionModal("ФИНАЛ САГИ", msg, "👑");
    } else if (currentBattle.isSevenPower) {
      const pow = currentBattle.powerObj;
      if (player.currentPowersSeat && player.currentPowersSeat !== pow.rank) vacatePowerSeatToWorld(player, "перешёл на более высокий трон");
      const defeatedLore = getPowerLore(pow.rank);
      const defeatedName = pow.name;
      pow.name = player.name; pow.holderType = "player"; pow.isDead = false; pow.cp = calcCombatPower(player);
      pow.attitude = 0;
      player.currentPowersSeat = pow.rank; player.coins += 1500;
      const defeatedLine = defeatedLore ? `<br><span style="color:#c084fc;">«${esc(defeatedLore.contempt)}» — ${esc(defeatedName)} уходит, унося своё имя.</span>` : "";
      const msg = `👑 <b>ТРИУМФ!</b> Вы заняли ранг #${pow.rank} (${pow.title}) на Монументе Семи Сил!${defeatedLine}<br><span style="color:#34d399;">${esc(defeatedLore?.seatText || "")}</span>`;
      worldState.chronicles.push({ year: worldState.currentWorldYear, text: `🏆 ${player.name} взошёл на трон #${pow.rank} Семи Сил!` });
      log(msg);
    } else if (currentBattle.quest) {
      player.coins += currentBattle.quest.reward; player.guildExp += currentBattle.quest.gp;
      player.squadFame += currentBattle.quest.gp; player.reputation += 5;
      player.swordGodExp += 10; player.magicExp += 10;
      log(`Заказ выполнен (+${currentBattle.quest.reward}🪙, +${currentBattle.quest.gp} GP).`);
      player.guildQuestsThisYear = player.guildQuestsThisYear.filter(q => q.id !== currentBattle.quest.id);
      checkGuildRankUp();
    }
    setTimeout(() => { if ($("battle-modal")) $("battle-modal").style.display = "none"; currentBattle = null; updateUI(); renderGuildTab(); }, 900);
    updateBattleBars(); return;
  }

  if (currentBattle.enemyStunned) {
    currentBattle.enemyStunned = false;
    if (logBox) logBox.innerHTML += `<div style="color:#38bdf8;">💫 Противник оглушён и пропускает атаку!</div>`;
  } else if (hasForesight && Math.random() < 0.35) {
    if (logBox) logBox.innerHTML += `<div style="color:var(--accent-light);">👁️ Вы уклонились от ответного удара!</div>`;
  } else if (type === "north" && Math.random() < BALANCE.schools.north.evadeChance) {
    // Север — стиль уклонения: после финта враг бьёт по пустому месту
    if (logBox) logBox.innerHTML += `<div style="color:#38bdf8;">🌪️ Финт Бога Севера — враг промахнулся!</div>`;
  } else {
    const eDmg = Math.max(4, Math.floor((currentBattle.enemyCp / (squadCp + 50) * 16 + Math.random() * 12 + 6) * dmgReduction));
    player.hp -= eDmg;
    if (logBox) logBox.innerHTML += `<div style="color:var(--hp);">Враг бьёт: <b>-${eDmg} HP</b>!</div>`;
  }
  if (logBox) logBox.scrollTop = logBox.scrollHeight;
  updateBattleBars(); updateUI();

  if (player.hp <= 0) {
    const ctx = currentBattle;
    player.losses = (player.losses || 0) + 1;
    if ($("battle-modal")) $("battle-modal").style.display = "none";
    currentBattle = null;
    const reason = ctx.isEndgame ? `Пал в финальной битве эпохи против ${ctx.enemyName}` : ctx.isSevenPower ? `Пал в дуэли за ранг #${ctx.powerObj.rank} Семи Сил` : `Погиб в схватке с ${ctx.enemyName}`;
    handleDeath(reason);
  }
}

function checkGuildRankUp(force) {
  if (!player) return;
  const next = ADVENTURER_RANKS[ADVENTURER_RANKS.indexOf(player.guildRank) + 1];
  if (next && player.guildExp >= ADVENTURER_REQ[next]) {
    player.guildRank = next;
    const msg = `🌟 Ваш ранг Гильдии повышен до <b>${next}</b>!`;
    log(msg); playSound("win");
    // Во время загрузки не показываем модалки — только пишем в летопись
    if (!force) showActionModal("Ранг Гильдии", msg, "🌟");
  }
}


/* ══════════════════════════════════════════════════════════
   ЖИВОЙ ОТРЯД
   Раньше наёмники были строкой с цифрой БМ. Теперь у каждого
   есть характер, прошлое, мнение о вас — и своя история.
   ══════════════════════════════════════════════════════════ */

const SQUAD_TRAITS = [
  { id: "loyal", icon: "🤝", name: "Верный", desc: "Не предаст никогда. Защитит вас в бою собой.", betrayal: 0, protect: 0.5,
    protectLine: "Ещё рано умирать. Я шёл не за этим.", betrayLine: "Нет. Я так не могу.", leaveLine: "Мне нечего делать среди тех, кто не держит слово." },
  { id: "greedy", icon: "💰", name: "Жадный", desc: "Держится за золото. Может уйти, если платят мало.", betrayal: 0.12, protect: 0.1,
    protectLine: "Ты мне ещё должен, если умрёшь — не отдашь.", betrayLine: "Прости, но твоя доля больше моей.", leaveLine: "Платили мало. Я ухожу туда, где платят." },
  { id: "proud", icon: "🦁", name: "Гордый", desc: "Не терпит приказов и насмешек.", betrayal: 0.16, protect: 0.2,
    protectLine: "Умирать передо мной — моя привилегия.", betrayLine: "Ты меня унизил один раз слишком много.", leaveLine: "Я не слуга. Найди себе другого." },
  { id: "quiet", icon: "🌙", name: "Молчаливый", desc: "Говорит редко, но по делу. Держится ровно.", betrayal: 0.05, protect: 0.3,
    protectLine: "…", betrayLine: "Ты знал, что я умею молчать. Не думал, что умею и это.", leaveLine: "Здесь слишком много слов." },
  { id: "broken", icon: "🩹", name: "Сломленный", desc: "Видел слишком много. Иногда срывается.", betrayal: 0.2, protect: 0.15,
    protectLine: "Я уже видел, как это кончается. Не в этот раз.", betrayLine: "Руки сами. Я не хотел.", leaveLine: "Я слышу то, чего нет. Мне надо уйти." },
  { id: "young", icon: "🌱", name: "Зелёный", desc: "Молод, горяч, хочет доказать. Учится быстро.", betrayal: 0.02, protect: 0.35,
    protectLine: "Я ещё не сделал ничего, о чём стоило бы помнить. Дай мне шанс.", betrayLine: "Мне сказали, что так будет правильно.", leaveLine: "Мне ещё рано умирать в чужих войнах." }
];

const SQUAD_STORIES = [
  { id: "st_debt", kind: "betray", title: "Долг, который не отдал", text: "Он говорит об этом только ночью, у костра.\n\n— Я взял деньги у человека, который не прощает. Теперь он ищет меня, и не один.\n\nОн смотрит на вас, будто спрашивая — но не решаясь спросить.",
    choices: [
      { text: "Заплатить его долг (120🪙)", effect: "pay",
        result: "Вы кладёте кошель на бревно. Он долго молчит. «Я этого не забуду» — и он действительно не забудет." },
      { text: "Сказать: пусть придёт и спросит у вас", effect: "stand",
        result: "Он улыбается впервые за год. «Тогда пусть приходит»." },
      { text: "Ничего не отвечать", effect: "ignore",
        result: "Он кивает, будто и не ждал другого. С той ночи спит отдельно." }
    ] },
  { id: "st_family", kind: "protect", title: "Сестра в чужом городе", text: "Он просит отпуск на месяц — поискать сестру, которую продали в услужение.\n\nОтряд без него слабее. Но он всё равно поедет, с вами или без.",
    choices: [
      { text: "Отпустить и дать денег (80🪙)", effect: "help",
        result: "Он возвращается через месяц — с сестрой. Она остаётся жить при вашем доме." },
      { text: "Поехать вместе", effect: "together",
        result: "Вы нашли её в третьем городе. Он был готов на всё — вы не дали ему убивать." },
      { text: "Отказать: сейчас не время", effect: "refuse",
        result: "Он не спорит. Уходит в тот же день, один, и возвращается другим человеком." }
    ] },
  { id: "st_old", kind: "hero", title: "Он слишком стар для дороги", text: "Ему за пятьдесят, и колено не гнётся по утрам.\n\nОн этого не говорит. Вы видите сами.",
    choices: [
      { text: "Оставить при доме, платить как бойцу", effect: "keep",
        result: "Он чинит крышу и учит молодых. Волосы у него седые, а глаза — спокойные." },
      { text: "Дать золото и отпустить (200🪙)", effect: "retire",
        result: "Он уходит в родную деревню и присылает письмо раз в год. Мелким почерком." },
      { text: "Сказать правду: вы видите, что ему тяжело", effect: "truth",
        result: "Он злится. Потом плачет. Потом остаётся — но уже как наставник, а не как меч." }
    ] },
  { id: "st_drink", kind: "betray", title: "Он пьёт", text: "Третье утро подряд он не встаёт. В таверне уже говорят, что ваш отряд — сброд.\n\nОн не оправдывается. Смотрит в стену.",
    choices: [
      { text: "Выбить дурь силой", effect: "force",
        result: "Драка, кровь, слёзы. Через неделю он трезв. Не благодарит, но и не пьёт." },
      { text: "Поговорить и понять, что случилось", effect: "talk",
        result: "Он рассказывает всё: про жену, про ребёнка, про дом, которого больше нет. Вы слушаете до утра." },
      { text: "Выгнать", effect: "kick",
        result: "Он уходит молча. Через год вы услышите, что он погиб в драке за пару монет." }
    ] },
  { id: "st_gift", kind: "hero", title: "Он принёс вам подарок", text: "Кинжал с костяной рукоятью. Не дорогой, но явно не купленный.\n\n— Это моего отца. Он мне больше не нужен. Пусть будет у тебя.",
    choices: [
      { text: "Принять и поблагодарить", effect: "accept",
        result: "Вы носите его с тех пор. Он замечает это каждый раз и отводит взгляд." },
      { text: "Отказаться: слишком дорогая память", effect: "decline",
        result: "Он кивает. Кинжал исчезает. Больше он ничего вам не дарил." },
      { text: "Принять и подарить что-то в ответ (60🪙)", effect: "return",
        result: "Вы выбрали ему сапоги. Он носил их до дыр и не выбросил." }
    ] }
];

function squadTraitsOf(m) {
  if (!m.trait) {
    const t = SQUAD_TRAITS[Math.floor(Math.random() * SQUAD_TRAITS.length)];
    m.trait = t.id;
    m.trust = 50;
    m.storyDone = false;
    m.joinedYear = worldState.currentWorldYear;
  }
  return SQUAD_TRAITS.find(t => t.id === m.trait) || SQUAD_TRAITS[0];
}

function squadRomanYears(m) {
  const t = squadTraitsOf(m);
  const yrs = Math.max(0, worldState.currentWorldYear - (m.joinedYear || worldState.currentWorldYear));
  return yrs;
}

// личная история отряда
function openSquadStory(idx) {
  const m = player.squad[idx];
  if (!m || m.storyDone) return;
  const t = squadTraitsOf(m);
  const story = SQUAD_STORIES[Math.floor(Math.random() * SQUAD_STORIES.length)];
  m.pendingStory = story.id;
  const box = $("event-modal");
  if (!box) return;
  setText("event-icon", t.icon);
  setText("event-title", `${m.name}: ${story.title}`);
  setText("event-desc", story.text);
  const cBox = $("event-choices");
  cBox.innerHTML = "";
  story.choices.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className = "event-choice-btn";
    btn.innerText = ch.text;
    btn.onclick = () => resolveSquadStory(idx, story, i);
    cBox.appendChild(btn);
  });
  box.style.display = "flex";
}

function resolveSquadStory(idx, story, choiceIdx) {
  const m = player.squad[idx];
  if (!m) return;
  const ch = story.choices[choiceIdx];
  let res = ch.result;
  switch (ch.effect) {
    case "pay":
      if (player.coins >= 120) { player.coins -= 120; m.relation = Math.min(100, m.relation + 25); m.trust = (m.trust || 50) + 30; }
      else res = "У вас не нашлось такой суммы. Он это увидел и всё понял.";
      break;
    case "stand": m.relation = Math.min(100, m.relation + 18); m.trust = (m.trust || 50) + 22; break;
    case "help":
      if (player.coins >= 80) { player.coins -= 80; }
      m.relation = Math.min(100, m.relation + 28); m.trust = (m.trust || 50) + 25;
      break;
    case "together": m.relation = Math.min(100, m.relation + 22); m.trust = (m.trust || 50) + 32; m.cp = (m.cp || 400) + 200; break;
    case "refuse": m.relation = Math.max(0, m.relation - 25); m.trust = (m.trust || 50) - 30; break;
    case "keep": m.trust = (m.trust || 50) + 20; player.squadFame += 10; break;
    case "retire":
      if (player.coins >= 200) { player.coins -= 200; }
      player.squad.splice(idx, 1); showActionModal("Он ушёл", res, "🕯️"); updateUI(); renderSquad(); renderRelations(); return;
    case "truth": m.trust = (m.trust || 50) + 15; m.cp = (m.cp || 400) + 150; break;
    case "force": m.trust = (m.trust || 50) - 5; m.relation = Math.max(0, m.relation - 8); break;
    case "talk": m.trust = (m.trust || 50) + 35; m.relation = Math.min(100, m.relation + 20); break;
    case "kick": player.squad.splice(idx, 1); showActionModal("Он ушёл", res, "🚪"); updateUI(); renderSquad(); renderRelations(); return;
    case "accept": m.trust = (m.trust || 50) + 20; player.squadFame += 8; break;
    case "decline": m.trust = (m.trust || 50) - 12; break;
    case "return": if (player.coins >= 60) { player.coins -= 60; } m.trust = (m.trust || 50) + 28; break;
  }
  m.storyDone = true;
  m.storyTold = story.title;
  if ($("event-modal")) $("event-modal").style.display = "none";
  log(`🛡️ <b>${esc(m.name)}</b>: ${esc(res)}`);
  showActionModal(m.name, res, "🛡️");
  updateUI(); renderSquad(); renderRelations();
}

// Раз в несколько лет — сцена с бойцом, у которого ещё не рассказана история
function maybeSquadStory() {
  if (!player.squad?.length) return false;
  const cand = player.squad.filter(m => !m.storyDone && squadRomanYears(m) >= 2);
  if (!cand.length || Math.random() > 0.22) return false;
  const idx = player.squad.indexOf(cand[Math.floor(Math.random() * cand.length)]);
  openSquadStory(idx);
  return true;
}

// Проверка на предательство с учётом характера
function checkSquadBetrayalNew() {
  for (let i = 0; i < player.squad.length; i++) {
    const m = player.squad[i];
    if (m.isFamily || m.status === "Супруг/Супруга") continue;
    const t = squadTraitsOf(m);
    const trustFactor = ((m.trust ?? 50) / 100);
    const baseRisk = t.betrayal * (1.6 - trustFactor) * (1.4 - (m.relation || 0) / 100);
    if (Math.random() < baseRisk * 0.25) {
      const damage = Math.round(25 + Math.random() * 25);
      player.hp = Math.max(1, player.hp - damage);
      const stolen = Math.min(player.coins, Math.round(20 + Math.random() * 60));
      player.coins -= stolen;
      player.squad.splice(i, 1);
      m.relation = Math.max(0, (m.relation || 50) - 60);
      m.status = "Заклятый враг";
      log(`🗡️ <b>ПРЕДАТЕЛЬСТВО!</b> ${esc(m.name)} (${t.name}) ударил в спину: −${damage} HP, −${stolen}🪙.`);
      queueYearExtra("Предательство", `${m.name} — ${t.name} — ушёл, забрав ${stolen}🪙 и оставив вам рану.`, "🗡️");
      playSound("death");
      return true;
    }
  }
  return false;
}

function renderSquad() {
  setText("squad-count", player.squad.length + 1);
  setText("squad-cp", calcSquadCombatPower(player).toLocaleString());
  setText("squad-fame", player.squadFame);
  const list = $("squad-members-list"); if (!list) return;
  list.innerHTML = player.squad.length ? player.squad.map((m, i) => {
    const t = squadTraitsOf(m);
    const trust = m.trust ?? 50;
    const yrs = squadRomanYears(m);
    const storyReady = !m.storyDone && yrs >= 1;
    return `
    <div class="squad-card">
      <div class="squad-top">
        <div>
          <b>${esc(m.name)}</b>
          <span class="squad-trait">${t.icon} ${t.name}</span>
          <div class="squad-sub">${esc(m.role || m.race)} • в отряде ${yrs} ${pluralYears(yrs)} • БМ ${(m.cp || 0).toLocaleString()}</div>
        </div>
        <button class="squad-out" onclick="removeFromSquad(${i})">Убрать</button>
      </div>
      <div class="squad-trust"><span>Доверие</span><div class="squad-track"><i style="width:${trust}%;"></i></div><span>${trust}%</span></div>
      <div class="squad-desc">${esc(t.desc)}</div>
      ${m.storyTold ? `<div class="squad-story-done">📖 История: ${esc(m.storyTold)}</div>` : ""}
      ${storyReady ? `<button class="squad-story-btn" onclick="openSquadStory(${i})">📖 Поговорить по душам</button>` : ""}
    </div>`;
  }).join("") : `<div style="font-size:11px; color:var(--muted);">Пригласите спутников во вкладке «Мир & Род»!</div>`;
}
function addToSquad(id) {
  if (player.squad.length >= 5) return showActionModal("Отряд", "Максимум 6 бойцов!", "🛡️");
  const npc = player.relations.find(r => r.id === id); if (!npc || npc.relation < 60) return showActionModal("Недоверие", "Нужно 60%+ отношений!", "❌");
  player.squad.push(npc); log(`🛡️ ${npc.name} вступил(а) в отряд!`); playSound("win"); updateUI(); renderRelations(); renderSquad();
}
function removeFromSquad(i) { log(`${player.squad[i].name} покинул отряд.`); player.squad.splice(i, 1); updateUI(); renderSquad(); }

function checkSquadBetrayal() {
  // Используем версию с характерами и доверием, если она доступна
  if (typeof checkSquadBetrayalNew === "function") return checkSquadBetrayalNew();
  for (let i = 0; i < player.squad.length; i++) {
    const m = player.squad[i];
    if (m.isFamily || m.status === "Супруг/Супруга" || m.relation >= 85) continue;
    if (m.relation < 45 || Math.random() < 0.04) {
      player.hp = Math.max(10, player.hp - 30); player.coins = Math.max(0, player.coins - 30);
      player.squad.splice(i, 1); m.relation = 0; m.status = "Заклятый враг";
      log(`🗡️ <b>ПРЕДАТЕЛЬСТВО!</b> ${m.name} ударил в спину!`);
      playSound("death"); showActionModal("Предательство!", `${m.name} предал отряд!`, "🗡️"); updateUI(); return true;
    }
  }
  return false;
}

// =========================================================================
// ШКОЛЫ, ПОЛИТИКА, ХАОС БРЕЙКЕР, ГРЕЙРАТ, СКРИЖАЛИ, ЯЗЫКИ, ХРОНИКИ
// =========================================================================
function renderSchools() {
  const cont = $("schools-list"); if (!cont) return;
  cont.innerHTML = SCHOOLS.map(s => {
    const enr = player.enrolledSchool === s.id, grad = player.graduatedSchools.includes(s.id), ok = player.currentRegionKey === s.regionKey && player.age >= s.minAge && !grad && !player.enrolledSchool;
    return `<div class="school-card"><div class="header"><b>${s.name}</b><span style="color:var(--gold);">${s.cost}🪙</span></div>
      <div style="font-size:11px; color:var(--muted); margin:4px 0;">${s.desc}</div>
      <button ${ok ? "" : "disabled"} style="width:100%; background:${grad ? "#059669" : enr ? "#10b981" : "#312e81"};" onclick="enrollSchool('${s.id}')">
      ${grad ? "✓ Диплом получен" : enr ? `Курс ${player.schoolProgress}/4` : player.currentRegionKey === s.regionKey ? "Поступить" : `Нужен регион: ${s.region}`}</button></div>`;
  }).join("");
}
function enrollSchool(id) {
  const s = SCHOOLS.find(x => x.id === id);
  if (!s || player.coins < s.cost) return showActionModal("Оплата", "Недостаточно золота!", "🪙");
  player.coins -= s.cost; player.enrolledSchool = id; player.schoolProgress = 1;
  log(`🎓 Зачислен в <b>${s.name}</b>!`); playSound("win"); updateUI(); renderSchools();
}

function renderPolitics() {
  const cont = $("politics-container"); if (!cont) return;
  const titles = ASURA_POLITICS.nobilityTitles, idx = titles.findIndex(t => t.id === player.nobilityTitle), next = titles[idx + 1];
  cont.innerHTML = `<div class="card" style="background:#191428; border-color:#9333ea;">
    <b style="color:#e9d5ff;">🏛️ Статус: ${titles[idx]?.name}</b>
    <div style="font-size:11px; color:var(--muted);">Влияние: <b>${player.asuraInfluence}</b></div>
    ${next ? `<button style="margin-top:8px; width:100%; background:#7e22ce; font-size:11px;" onclick="buyNobilityTitle('${next.id}', ${next.influence * 4}, ${next.influence})">👑 Купить патент: ${next.name} (${next.influence * 4}🪙, ${next.influence} вл.)</button>` : `<div style="color:var(--gold); font-size:11px;">👑 Высший титул Герцога!</div>`}
  </div><div class="section-title">Фракции Трона Асуры</div>` + ASURA_POLITICS.factions.map(f => {
    const mine = player.asuraFaction === f.id;
    return `<div class="card"><b>${f.icon} ${f.name}</b> ${mine ? '<span class="badge-legendary">Ваш выбор ✓</span>' : ""}
      <div style="font-size:11px; color:var(--muted); margin:4px 0;">${f.desc}</div>
      ${mine ? `<button style="width:100%; background:#059669; font-size:11px;" onclick="supportFaction(25)">💰 Спонсировать (25🪙, +15 вл.)</button>` : `<button style="width:100%; background:#4338ca; font-size:11px;" onclick="joinAsuraFaction('${f.id}')">Присягнуть</button>`}</div>`;
  }).join("");
}
function joinAsuraFaction(id) { player.asuraFaction = id; log(`👑 Вы поддержали фракцию Асуры.`); playSound("win"); updateUI(); renderPolitics(); }
function supportFaction(cost) { if (player.coins < cost) return; player.coins -= cost; player.asuraInfluence += 15; log(`💰 Влияние +15.`); playSound("coin"); updateUI(); renderPolitics(); }
function buyNobilityTitle(id, cost, reqInf) {
  if (player.coins < cost || player.asuraInfluence < reqInf) return showActionModal("Титул", `Нужно ${cost}🪙 и ${reqInf} влияния!`, "👑");
  player.coins -= cost; player.nobilityTitle = id; log(`👑 Дарован титул!`); playSound("win"); updateUI(); renderPolitics();
}

// =========================================================================
// ТИТУЛЫ И ПРОЗВИЩА
// =========================================================================
// Прозвище не выбирают — его дают. Игрок совершает поступки, а род и мир
// называют его так, как запомнили. Прозвище остаётся в хрониках навсегда:
// в дереве предков, в летописи, в памяти следующего поколения.
//
// Каждое прозвище требует конкретного дела, а не числа в характеристиках.

const TITLES = [
  // --- Деньги и долг ---
  { id: "debtor", name: "Долговой", icon: "💰", cond: (p) => (p.story?.flags?.debt_owned || p.story?.flags?.debt_paid) && p.reputation < 40,
    text: "Ваше имя произносят вместе с суммой." },
  { id: "payer", name: "Платящий", icon: "🪙", cond: (p) => p.story?.flags?.debt_paid && p.reputation >= 40,
    text: "О вас говорят: «С этим можно иметь дело»." },
  { id: "rich", name: "Золотой", icon: "👑", cond: (p) => p.coins >= 12000, text: "Ваш кошель стал громче вашего голоса." },
  { id: "greedy", name: "Скупой", icon: "🪙", cond: (p) => p.coins >= 3000 && (p.reputation || 0) <= 10, text: "Богатство есть, а имени доброго нет." },

  // --- Война и меч ---
  { id: "swordsman", name: "Клинок", icon: "⚔️", cond: (p) => (p.swordGodExp || 0) >= 400, text: "О вас говорят как о мече, а не о человеке." },
  { id: "undefeated", name: "Непобеждённый", icon: "🛡️", cond: (p) => (p.squadFame || 0) >= 300 && (p.hp || 0) >= (p.maxHp || 1) * 0.9,
    text: "Вы уходили из каждой схватки на ногах." },
  { id: "butcher", name: "Мясник", icon: "🩸", cond: (p) => (p.story?.flags?.debt_kill || p.story?.flags?.her_denied) && (p.reputation || 0) < 25,
    text: "За вами идут не потому что верят — потому что боятся." },
  { id: "peacemaker", name: "Миротворец", icon: "🕊️", cond: (p) => p.story?.flags?.bdr_peace || p.story?.flags?.grd_peace,
    text: "Вы останавливали то, что должно было случиться." },

  // --- Магия и знание ---
  { id: "mage", name: "Магистр", icon: "🔮", cond: (p) => (p.magicExp || 0) >= 400, text: "Ваши заклинания обсуждают в Академии." },
  { id: "sage", name: "Мудрый", icon: "📖", cond: (p) => (p.intellect || 0) >= 120, text: "К вам приходят с вопросами, а не с приказами." },
  { id: "silent", name: "Молчаливый", icon: "🤫", cond: (p) => p.story?.flags?.sl_3_use || p.story?.flags?.sl_4_sold, text: "Вы говорили так, что вас слышали." },

  // --- Династия и люди ---
  { id: "father", name: "Отец Рода", icon: "👶", cond: (p) => (p.children || []).length >= 4, text: "Ваш дом шумит детьми и ссорами." },
  { id: "widower", name: "Вдовец", icon: "🕯️", cond: (p) => !!p.widowed && p.widowed.name, text: "Вы пережили того, с кем делили жизнь." },
  { id: "last_child", name: "Последний", icon: "🕯️", cond: (p) => p.story?.flags?.bf_1, text: "На вас может кончиться линия — и вы это знаете." },
  { id: "beloved", name: "Любимый", icon: "🤍", cond: (p) => (p.reputation || 0) >= 100, text: "Вас любят не за титул." },
  { id: "hated", name: "Ненавистный", icon: "🖤", cond: (p) => (p.reputation || 0) <= -40, text: "Ваше имя произносят как проклятие." },

  // --- Мир и власть ---
  { id: "power", name: "Сила Мира", icon: "🏆", cond: (p) => !!p.currentPowersSeat, text: "Ваше место — на Монументе." },
  { id: "greyrat", name: "Единый Грейрат", icon: "🩸", cond: (p) => (p.greyratAllies || []).length >= 4, text: "Вы соединили то, что двести лет было четырьмя домами." },
  { id: "chaos", name: "Поднявшийся", icon: "🐉", cond: (p) => (p.perugiusTrials || []).length >= 3, text: "В крепости есть ваше окно." },
  { id: "traveller", name: "Странник", icon: "🧭", cond: (p) => Object.keys(p.visitedRegions || {}).length >= 6, text: "Вы видели все шесть ликов мира." },
  { id: "settler", name: "Осевший", icon: "🏠", cond: (p) => (p.estates || []).length >= 3 && Object.keys(p.visitedRegions || {}).length <= 2,
    text: "Вы выбрали место, а не дорогу." },

  // --- Характер ---
  { id: "kind", name: "Добрый", icon: "🤗", cond: (p) => (p.regionOpinionSum || 0) >= 80, text: "Регионы помнят вашу помощь." },
  { id: "grim", name: "Хмурый", icon: "🌑", cond: (p) => (p.deaths || 0) >= 6, text: "Вы видели слишком много чужих похорон." }
];

// Считаем сводные показатели, на которые опираются условия
function refreshTitleStats() {
  if (!player) return;
  ensureWorldState();
  player.regionOpinionSum = Object.values(worldState.regionOpinion || {}).reduce((a, b) => a + b, 0);
  player.visitedRegions = player.visitedRegions || {};
  player.visitedRegions[player.currentRegionKey] = true;
}

// Какие прозвища заслужил герой прямо сейчас
function earnedTitles() {
  refreshTitleStats();
  return TITLES.filter(t => {
    try { return !!t.cond(player); } catch (e) { return false; }
  });
}

// Раз в год (и при важных событиях) проверяем: не дали ли новое прозвище
function checkTitles() {
  if (!player) return;
  if (!Array.isArray(player.titles)) player.titles = [];
  const earned = earnedTitles();
  earned.forEach(t => {
    if (!player.titles.includes(t.id)) {
      player.titles.push(t.id);
      // Главным прозвищем становится самое «весомое» из последних
      player.epithetId = t.id;
      log(`${t.icon} Вас стали звать <b>${esc(t.name)}</b>. ${esc(t.text)}`);
      queueYearExtra(`${t.icon} Новое прозвище`, `<b>${esc(t.name)}</b> — ${esc(t.text)}`, "🏷️");
      worldState.chronicles.push({ year: worldState.currentWorldYear, text: `${player.name} получил прозвище «${t.name}».` });
      playSound("win");
    }
  });
}

// Выбор, какое прозвище носить (если их несколько)
function setEpithet(id) {
  if (!player.titles || !player.titles.includes(id)) return;
  player.epithetId = id;
  const t = TITLES.find(x => x.id === id);
  if (t) { log(`🏷️ Вы носите прозвище <b>${esc(t.name)}</b>.`); playSound("click"); }
  renderTitles(); updateUI();
}

// Полное имя героя с прозвищем
function heroFullName(p) {
  const pp = p || player;
  if (!pp) return "";
  const t = TITLES.find(x => x.id === pp.epithetId);
  return t ? `${pp.name} ${t.name}` : pp.name;
}

// Экран прозвищ

/* ══════════════════════════════════════════════════════════
   ДОСТИЖЕНИЯ
   30 целей, которые заставляют переигрывать: они не про цифры,
   а про поступки, которые случаются раз в жизни рода.
   ══════════════════════════════════════════════════════════ */

const ACHIEVEMENTS = [
  { id: "a_first_blood", icon: "🩸", name: "Первая кровь", desc: "Победить в первом бою", group: "Бой" },
  { id: "a_veteran", icon: "⚔️", name: "Ветеран", desc: "Победить в 25 боях", group: "Бой" },
  { id: "a_slayer", icon: "💀", name: "Палач", desc: "Победить 50 врагов", group: "Бой" },
  { id: "a_boss", icon: "👹", name: "Убийца хозяев", desc: "Победить владыку подземелья", group: "Бой" },
  { id: "a_undefeated", icon: "🛡️", name: "Непобеждённый", desc: "Прожить 20 лет без поражений", group: "Бой" },

  { id: "a_first_school", icon: "🗡️", name: "Первый стиль", desc: "Достичь ранга B в любой школе", group: "Мастерство" },
  { id: "a_king", icon: "👑", name: "Мастер", desc: "Достичь ранга S в любой школе", group: "Мастерство" },
  { id: "a_all_styles", icon: "🌟", name: "Три пути", desc: "Ранг A во всех боевых школах", group: "Мастерство" },
  { id: "a_grandmaster", icon: "🔮", name: "Маг Океана", desc: "Достичь Святого ранга магии", group: "Мастерство" },
  { id: "a_perugius", icon: "🐉", name: "Хаос Брейкер", desc: "Пройти все испытания Перугиуса", group: "Мастерство" },

  { id: "a_rich", icon: "💰", name: "Богач", desc: "Накопить 1 000 золота", group: "Богатство" },
  { id: "a_veryrich", icon: "👑", name: "Крез", desc: "Накопить 10 000 золота", group: "Богатство" },
  { id: "a_palace", icon: "🏰", name: "Дворец", desc: "Купить самый большой замок", group: "Богатство" },
  { id: "a_landowner", icon: "🏘️", name: "Землевладелец", desc: "Владеть тремя имениями", group: "Богатство" },
  { id: "a_legendary", icon: "⚡", name: "Легендарное оружие", desc: "Купить предмет за 1 000+ золота", group: "Богатство" },

  { id: "a_family", icon: "💍", name: "Семьянин", desc: "Вступить в брак", group: "Род" },
  { id: "a_parent", icon: "👶", name: "Родитель", desc: "Завести первого ребёнка", group: "Род" },
  { id: "a_many_kids", icon: "👨‍👩‍👧‍👦", name: "Многодетный", desc: "Трое детей", group: "Род" },
  { id: "a_grandparent", icon: "🌳", name: "Дед", desc: "Дожить до внуков", group: "Род" },
  { id: "a_widow", icon: "🕯️", name: "Пережил супруга", desc: "Потерять супруга и жить дальше", group: "Род" },
  { id: "a_dynasty", icon: "🏛️", name: "Три поколения", desc: "Передать жизнь наследнику", group: "Род" },

  { id: "a_generous", icon: "🤝", name: "Щедрый", desc: "Иметь репутацию 50+", group: "Мир" },
  { id: "a_saint", icon: "✨", name: "Святой", desc: "Иметь репутацию 100+", group: "Мир" },
  { id: "a_shadow", icon: "🌑", name: "Тень", desc: "Уйти в минус по репутации", group: "Мир" },
  { id: "a_politics", icon: "👑", name: "При дворе", desc: "Достичь влияния в Асуре 50+", group: "Мир" },
  { id: "a_faction", icon: "🐉", name: "Знамя", desc: "Выбрать сторону Богов", group: "Мир" },
  { id: "a_all_regions", icon: "🗺️", name: "Весь мир", desc: "Побывать во всех шести регионах", group: "Мир" },

  { id: "a_longlife", icon: "🕰️", name: "Долгожитель", desc: "Дожить до 90 лет", group: "Судьба" },
  { id: "a_epic_death", icon: "🔥", name: "Смерть в бою", desc: "Погибнуть с оружием в руках", group: "Судьба" },
  { id: "a_titles", icon: "🏷️", name: "Собрал прозвища", desc: "Получить пять прозвищ за жизнь", group: "Судьба" },
  { id: "a_calamity", icon: "⚡", name: "Пережил Катаклизм", desc: "Выжить в год Катаклизма Маны", group: "Судьба" }
];

function ensureAchievements() {
  if (!player.achievements) player.achievements = [];
}

function unlockAchievement(id) {
  ensureAchievements();
  if (player.achievements.includes(id)) return false;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return false;
  player.achievements.push(id);
  log(`🏆 <b>Достижение:</b> ${a.icon} ${a.name} — ${a.desc}`);
  queueYearExtra(`Достижение: ${a.name}`, a.desc, "🏆");
  playSound("win");
  return true;
}

// Проверка всех условий. Вызывается раз в год и после важных действий.
function checkAchievements() {
  ensureAchievements();
  const cp = calcCombatPower(player);
  const rankIdx = (exp, list) => list.findIndex(r => r === calculateRank(exp, list));

  // бой
  if ((player.wins || 0) >= 1) unlockAchievement("a_first_blood");
  if ((player.wins || 0) >= 25) unlockAchievement("a_veteran");
  if ((player.wins || 0) >= 50) unlockAchievement("a_slayer");
  if ((player.losses || 0) === 0 && player.age >= 20 && (player.wins || 0) >= 10) unlockAchievement("a_undefeated");

  // мастерство
  const swordRank = calculateRank(player.swordGodExp, SWORD_RANKS);
  const magicRank = calculateRank(player.magicExp, MAGIC_RANKS);
  const anyS = [player.swordGodExp, player.waterGodExp, player.northGodExp].some(e => calculateRank(e, SWORD_RANKS) === SWORD_RANKS[6]);
  const anyB = [player.swordGodExp, player.waterGodExp, player.northGodExp, player.magicExp].some(e => {
    const l = SWORD_RANKS[4];
    return e >= 300;
  });
  if (anyB) unlockAchievement("a_first_school");
  if (anyS || magicRank === MAGIC_RANKS[6]) unlockAchievement("a_king");
  if ([player.swordGodExp, player.waterGodExp, player.northGodExp].every(e => e >= 600)) unlockAchievement("a_all_styles");
  if (magicRank === MAGIC_RANKS[6]) unlockAchievement("a_grandmaster");
  if ((player.perugiusTrials || []).length >= 3) unlockAchievement("a_perugius");

  // богатство
  if ((player.coins || 0) >= 1000) unlockAchievement("a_rich");
  if ((player.coins || 0) >= 10000) unlockAchievement("a_veryrich");
  if ((player.estates || []).includes("asura_palace")) unlockAchievement("a_palace");
  if ((player.estates || []).length >= 3) unlockAchievement("a_landowner");
  if ((player.inventory || []).some(i => (i.cost || 0) >= 1000)) unlockAchievement("a_legendary");

  // род
  if (player.spouse) unlockAchievement("a_family");
  if ((player.children || []).length >= 1) unlockAchievement("a_parent");
  if ((player.children || []).length >= 3) unlockAchievement("a_many_kids");
  if ((player.children || []).some(c => (c.children || []).length > 0)) unlockAchievement("a_grandparent");
  if (player.widowed && (player.widowed.was || []).length) unlockAchievement("a_widow");
  if ((dynastyGeneration || 1) >= 3) unlockAchievement("a_dynasty");

  // мир
  if ((player.reputation || 0) >= 50) unlockAchievement("a_generous");
  if ((player.reputation || 0) >= 100) unlockAchievement("a_saint");
  if ((player.reputation || 0) < 0) unlockAchievement("a_shadow");
  if ((player.asuraInfluence || 0) >= 50) unlockAchievement("a_politics");
  if (player.dynastyFaction && player.dynastyFaction !== "neutral") unlockAchievement("a_faction");
  if (Object.keys(player.visitedRegions || {}).length >= 6) unlockAchievement("a_all_regions");

  // судьба
  if (player.age >= 90) unlockAchievement("a_longlife");
  if ((player.titles || []).length >= 5) unlockAchievement("a_titles");
  if (player.survivedCalamity) unlockAchievement("a_calamity");
}


/* ══════════════════════════════════════════════════════════
   ДНЕВНИК РОДА
   Летопись писалась, но читать её было нельзя: она лежала
   строками в общем логе вместе с боями и покупками.
   Теперь это отдельная книга жизни — по поколениям.
   ══════════════════════════════════════════════════════════ */

function renderDynastyDiary() {
  const box = $("diary-box");
  if (!box) return;
  const hist = (worldState.dynastyHistory || []).slice().reverse();
  if (!hist.length) {
    box.innerHTML = `<div class="diary-empty">Здесь будет история вашего рода. Пока написана только первая страница.</div>`;
    return;
  }
  box.innerHTML = hist.map((h, i) => {
    const titles = (h.titles || []).map(id => {
      const t = TITLES.find(x => x.id === id);
      return t ? `<span class="diary-title">${t.icon} ${esc(t.name)}</span>` : "";
    }).filter(Boolean).join(" ");
    return `<div class="diary-entry">
      <div class="diary-gen">${hist.length - i}-е поколение</div>
      <div class="diary-name">${esc(h.name || "Безымянный")}</div>
      <div class="diary-life">${h.race ? esc(h.race) + " • " : ""}прожито ${h.maxAge || h.age || "?"} лет • пик силы ${(h.peakCp || 0).toLocaleString()}</div>
      <div class="diary-death">${esc(h.deathReason || "Судьба неизвестна")}</div>
      ${titles ? `<div class="diary-titles">${titles}</div>` : ""}
      ${h.powersSeat ? `<div class="diary-seat">👑 Трон #${h.powersSeat} Семи Сил</div>` : ""}
    </div>`;
  }).join("");
}

// Живая часть: эта жизнь
function renderCurrentLifeDiary() {
  const box = $("diary-current");
  if (!box || !player) return;
  const cp = calcCombatPower(player);
  const years = player.age;
  const titles = (player.titles || []).map(id => {
    const t = TITLES.find(x => x.id === id);
    return t ? `<span class="diary-title">${t.icon} ${esc(t.name)}</span>` : "";
  }).filter(Boolean).join(" ");
  const ach = (player.achievements || []).length;

  const chapters = [];
  if (years < 6) chapters.push("Детство. Мир пока маленький — двор, дом, чужие лица.");
  else if (years < 13) chapters.push("Отрочество. Первые уроки и первые синяки.");
  else if (years < 20) chapters.push("Юность. Уже можно выбирать, кем быть.");
  else if (years < 35) chapters.push("Лучшие годы. Силы есть, время есть, ошибки дорогие.");
  else if (years < 50) chapters.push("Зрелость. Всё, что построено, начинает держаться само — или рушиться.");
  else if (years < 65) chapters.push("Осень. Дети выросли, тело помнит больше, чем хотело бы.");
  else chapters.push("Поздние годы. Каждый год — подарок, и вы это знаете.");

  const stats = [
    ["Возраст", `${years} из ${player.maxAge}`],
    ["Сила", cp.toLocaleString()],
    ["Золото", `${fmtNum(player.coins)}🪙`],
    ["Репутация", player.reputation > 0 ? `+${player.reputation}` : String(player.reputation)],
    ["Знакомых", (player.relations || []).filter(r => !r.isDead).length],
    ["Детей", (player.children || []).filter(c => !c.isDead).length],
    ["Достижений", `${ach} из ${ACHIEVEMENTS.length}`],
    ["Прозвищ", (player.titles || []).length]
  ];

  box.innerHTML = `<div class="diary-live">
    <div class="diary-gen">Эта жизнь</div>
    <div class="diary-name">${esc(heroFullName ? heroFullName(player) : player.name)}</div>
    <div class="diary-chapter">${esc(chapters[0])}</div>
    ${titles ? `<div class="diary-titles">${titles}</div>` : ""}
    <div class="diary-stats">${stats.map(([k, v]) => `<div class="diary-stat"><span>${k}</span><b>${v}</b></div>`).join("")}</div>
  </div>`;
}


/* ══════════════════════════════════════════════════════════
   НАГРАДЫ ЗА ДОСТИЖЕНИЯ
   Достижение, которое ничего не даёт, — просто галочка.
   Каждые пять — весомая награда, и у каждого своя.
   ══════════════════════════════════════════════════════════ */

const ACHIEVEMENT_REWARDS = [
  { need: 5,  icon: "🪙", title: "Первый успех",   text: "За пять достижений: +500🪙 в казну.", effect: (p) => { p.coins += 500; } },
  { need: 10, icon: "📖", title: "Признание",       text: "За десять: +20 Знаний и +10 репутации.", effect: (p) => { p.intellect += 20; p.reputation += 10; } },
  { need: 15, icon: "🗡️", title: "Мастерство",     text: "За пятнадцать: +60 ко всем боевым школам.", effect: (p) => { p.swordGodExp += 60; p.waterGodExp += 60; p.northGodExp += 60; p.magicExp += 60; } },
  { need: 20, icon: "🏰", title: "Опора рода",     text: "За двадцать: +1 500🪙 и +30 макс. HP.", effect: (p) => { p.coins += 1500; p.maxHp += 30; } },
  { need: 25, icon: "👑", title: "Легенда",         text: "За двадцать пять: +40 репутации и +5 к влиянию в Асуре.", effect: (p) => { p.reputation += 40; p.asuraInfluence = (p.asuraInfluence || 0) + 5; } },
  { need: 31, icon: "🌟", title: "Всё пройдено",   text: "Все достижения: +5 000🪙 и +50 макс. маны.", effect: (p) => { p.coins += 5000; p.maxMana += 50; } }
];

function checkAchievementRewards() {
  ensureAchievements();
  if (!player.achRewardsGiven) player.achRewardsGiven = [];
  const count = player.achievements.length;
  ACHIEVEMENT_REWARDS.forEach(r => {
    if (count >= r.need && !player.achRewardsGiven.includes(r.need)) {
      player.achRewardsGiven.push(r.need);
      r.effect(player);
      log(`🎁 <b>Награда за достижения:</b> ${r.icon} ${r.title} — ${r.text}`);
      queueYearExtra(`Награда: ${r.title}`, r.text, r.icon);
      playSound("win");
    }
  });
}

function nextAchievementReward() {
  ensureAchievements();
  const given = player.achRewardsGiven || [];
  return ACHIEVEMENT_REWARDS.find(r => !given.includes(r.need)) || null;
}

function renderAchievements() {
  const box = $("achievements-box");
  if (!box) return;
  ensureAchievements();
  const total = ACHIEVEMENTS.length, got = player.achievements.length;
  const pct = Math.round((got / total) * 100);
  const groups = [...new Set(ACHIEVEMENTS.map(a => a.group))];

  let html = `<div class="ach-head">
    <div class="ach-count"><b>${got}</b> из ${total}</div>
    <div class="ach-track"><div class="ach-fill" style="width:${pct}%;"></div></div>
    <div class="ach-pct">${pct}%</div>
  </div>`;

  groups.forEach(g => {
    const list = ACHIEVEMENTS.filter(a => a.group === g);
    const done = list.filter(a => player.achievements.includes(a.id)).length;
    html += `<div class="ach-group-title">${g} · ${done}/${list.length}</div>`;
    list.forEach(a => {
      const on = player.achievements.includes(a.id);
      html += `<div class="ach-row${on ? " on" : ""}">
        <div class="ach-icon">${on ? a.icon : "🔒"}</div>
        <div class="ach-body">
          <div class="ach-name">${on ? esc(a.name) : "???"}</div>
          <div class="ach-desc">${esc(a.desc)}</div>
        </div>
      </div>`;
    });
  });

  const next = typeof nextAchievementReward === "function" ? nextAchievementReward() : null;
  if (next) {
    html += `<div class="ach-next">${next.icon} <b>Следующая награда</b> — за ${next.need} достижений: ${esc(next.text)}</div>`;
  } else {
    html += `<div class="ach-next done">🌟 Все награды получены. Дальше — только слава.</div>`;
  }
  html += `<div class="ach-note">Достижения общие для всего рода: они не пропадают при смене поколения.</div>`;
  box.innerHTML = html;
}


/* ══════════════════════════════════════════════════════════
   ОБУЧЕНИЕ
   Первые годы непонятно, за что хвататься: 28 дел, магазин,
   силы, род. Три коротких шага объясняют главное — и уходят.
   ══════════════════════════════════════════════════════════ */

const TUTORIAL_STEPS = [
  { id: "t_year", icon: "🌙", title: "Год — это ход",
    text: "Всё в игре меряется годами. Вы нажимаете «Прожить 1 год» — и проходит двенадцать месяцев: вы растёте, учитесь, случаются события.\n\nСилы (⚡) — это сколько дел вы успеете сделать за год. Потратили — жмите кнопку года снова.",
    hint: "Нажмите «⚡ Прожить 1 год» на вкладке «Жизнь»" },
  { id: "t_acts", icon: "⚡", title: "Дела делают вас сильнее",
    text: "Вкладка «Дела» — ваши тренировки. Магия, три боевые школы, знания, ремесло.\n\nВ детстве доступно мало, но именно эти годы дают основу. Чем выше ранг школы, тем сильнее вы в бою.",
    hint: "Зайдите в «Дела» и сделайте что-нибудь" },
  { id: "t_buy", icon: "🪙", title: "Золото решает",
    text: "Золото приходит от службы, заказов гильдии и имений. Тратится на снаряжение, лечение и замки.\n\nСовет: первым делом купите оружие — оно даёт больше всего силы за монету.",
    hint: "Загляните в «Имущество» → Магазин" },
  { id: "t_rel", icon: "👥", title: "Люди — это сила",
    text: "Знакомые дают помощь, квесты и защиту. Их круг ограничен: чем умнее и известнее вы, тем больше людей можете держать в жизни.\n\nСемья — отдельно. Дети наследуют ваше имущество, когда вы умрёте.",
    hint: "Откройте «Мир & Род» → Связи" }
];

function ensureTutorial() {
  if (!player.tutorialDone) player.tutorialDone = [];
}

function tutorialRemaining() {
  ensureTutorial();
  return TUTORIAL_STEPS.filter(t => !player.tutorialDone.includes(t.id));
}

function renderTutorialHint() {
  const box = $("tutorial-hint");
  if (!box) return;
  ensureTutorial();
  if (player.tutorialHidden) { box.innerHTML = ""; return; }
  const rest = tutorialRemaining();
  if (!rest.length) {
    if (!player.tutorialFinishedShown) {
      player.tutorialFinishedShown = true;
      box.innerHTML = `<div class="tut-done">✅ Основы понятны. Дальше — ваш выбор: род, служба, война или тихая жизнь.</div>`;
      setTimeout(() => { const b = $("tutorial-hint"); if (b) b.innerHTML = ""; }, 9000);
    } else box.innerHTML = "";
    return;
  }
  const step = rest[0];
  box.innerHTML = `<div class="tut-card" onclick="showTutorialStep('${step.id}')">
    <div class="tut-top"><span class="tut-icon">${step.icon}</span>
      <span class="tut-title">${esc(step.title)}</span>
      <span class="tut-count">${player.tutorialDone.length + 1}/${TUTORIAL_STEPS.length}</span>
      <span class="tut-close" onclick="event.stopPropagation(); hideTutorial()">✕</span></div>
    <div class="tut-hint">${esc(step.hint)}</div>
    <div class="tut-more">Нажмите, чтобы прочитать →</div>
  </div>`;
}

function showTutorialStep(id) {
  const step = TUTORIAL_STEPS.find(t => t.id === id);
  if (!step) return;
  showActionModal(`${step.icon} ${step.title}`, step.text);
  ensureTutorial();
  if (!player.tutorialDone.includes(id)) player.tutorialDone.push(id);
  setTimeout(renderTutorialHint, 400);
}

function hideTutorial() {
  player.tutorialHidden = true;
  renderTutorialHint();
}

function showTutorialAgain() {
  player.tutorialHidden = false;
  player.tutorialDone = [];
  player.tutorialFinishedShown = false;
  renderTutorialHint();
  updateUI();
}

// Отмечаем шаги по факту действий
function tutorialCheck(event) {
  ensureTutorial();
  const mark = (id) => { if (!player.tutorialDone.includes(id)) { player.tutorialDone.push(id); renderTutorialHint(); } };
  if (event === "year") mark("t_year");
  if (event === "activity") mark("t_acts");
  if (event === "shop") mark("t_buy");
  if (event === "relations") mark("t_rel");
}

function renderTitles() {
  const box = $("titles-box");
  if (!box || !player) return;
  if (!Array.isArray(player.titles)) player.titles = [];
  const owned = TITLES.filter(t => player.titles.includes(t.id));
  const locked = TITLES.filter(t => !player.titles.includes(t.id));

  let html = `<div class="card" style="border-color:#a855f7; background:#150f24;">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <b style="color:#d8b4fe; font-size:13px;">🏷️ Прозвища рода</b>
      <span style="font-size:11px; color:var(--muted);">${owned.length} / ${TITLES.length}</span>
    </div>
    <div style="font-size:11px; color:var(--muted); margin-top:4px; line-height:1.45;">
      Прозвище не выбирают — его дают за дела. Одно носится сейчас, остальные остаются в истории.
    </div>
  </div>`;

  if (owned.length) {
    html += owned.map(t => `<div class="title-row ${player.epithetId === t.id ? "active" : ""}">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <div><b style="font-size:12px;">${t.icon} ${esc(t.name)}</b>
          ${player.epithetId === t.id ? '<span class="title-current">сейчас</span>' : ""}</div>
        ${player.epithetId === t.id ? "" : `<button style="font-size:10px; padding:3px 8px; background:#4c1d95;" onclick="setEpithet('${t.id}')">Носить</button>`}
      </div>
      <div style="font-size:10.5px; color:#cbd5e1; margin-top:3px;">${esc(t.text)}</div>
    </div>`).join("");
  } else {
    html += `<div class="card" style="text-align:center; color:var(--muted); font-size:11.5px;">Пока у вас нет прозвища. Проживите жизнь — и род придумает, как вас называть.</div>`;
  }

  if (locked.length) {
    html += `<div class="section-title" style="margin-top:12px; font-size:12px;">Ещё не ваше (${locked.length})</div>`;
    html += locked.map(t => `<div class="title-row locked">
      <b style="font-size:11.5px; color:#64748b;">${t.icon} ${esc(t.name)}</b>
      <div style="font-size:10px; color:#475569; margin-top:2px;">За дела, которые вы пока не совершили.</div>
    </div>`).join("");
  }
  box.innerHTML = html;
}

function renderDynastyTree() {
  const cont = $("dynasty-tree-container"); if (!cont) return;
  let html = `<div class="tree-node current"><div class="tree-gen">👑 Поколение ${player.generation} (Сейчас • ${worldState.currentWorldYear} г.)</div>
    <b>${esc(player.name)}</b> (${player.race}) • БМ ${calcCombatPower(player).toLocaleString()}</div>`;
  if (worldState.chronicles.length) {
    html += `<div class="section-title">Летопись Мира</div>` + worldState.chronicles.slice(-8).reverse().map(c => `<div class="tree-node" style="font-size:11px;"><b style="color:var(--gold);">[${c.year} г.]</b> ${esc(c.text)}</div>`).join("");
  }
  html += `<div class="section-title">Зал Славы Предков (${worldState.dynastyHistory.length})</div>`;
  html += worldState.dynastyHistory.length ? worldState.dynastyHistory.slice().reverse().map(a => `
    <div class="tree-node"><div class="tree-gen">📜 Поколение ${a.gen} ${a.powersSeat ? `• #${a.powersSeat} Семи Сил` : ""}</div>
    <b>${esc(a.name)}</b>${a.epithet ? ` <span class="epithet-badge">${a.epithetIcon || "🏷️"} ${esc(a.epithet)}</span>` : ""} (${a.race}) • Пик БМ: ${fmtNum(a.peakCp)} • ${a.maxAge} л.<div style="font-size:10px; color:var(--muted);">${a.deathReason}</div></div>`).join("") : `<div style="color:var(--muted); font-size:11px;">Летопись предков пока пуста.</div>`;
  cont.innerHTML = html;
}

function renderChaosBreaker() {
  const cont = $("perugius-container"); if (!cont) return;
  const myCp = calcCombatPower(player);
  ensureStoryState();
  const done0 = (player.perugiusTrials || []).length;

  let html = `<div class="card" style="background:#191428; border-color:#a855f7;">
    <b style="color:#e9d5ff;">🏰 Хаос Брейкер</b>
    <div style="font-size:11px; color:var(--muted); margin-top:3px;">
      Испытаний пройдено: <b>${done0}/3</b> • Путь открывается сюжетом, а не одной силой.
    </div>
    <div style="font-size:11px; color:var(--muted); margin-top:4px;">
      Каждое испытание — это встреча с тем, кто помнит больше вас. Пропустите историю — не пройдёте.
    </div>
  </div>`;

  PERUGIUS_TRIALS.forEach(t => {
    const done = player.perugiusTrials.includes(t.rank);
    // Открыто, если начата сюжетная линия этого испытания
    const lineStarted = !t.line || (STORY_LINES.find(l => l.id === t.line)?.nodes || [])
      .some(n => player.story.done.includes(n.id));
    const cpOk = myCp >= t.reqCp;
    const canGo = !done && lineStarted && cpOk;
    const reason = done ? "" : !lineStarted ? t.reqText : !cpOk ? `Нужно ${t.reqCp.toLocaleString()} БМ (у вас ${fmtNum(myCp)})` : "";
    html += `<div class="card" style="${done ? "border-color:#059669; opacity:0.85;" : lineStarted ? "border-color:#a855f7;" : "opacity:0.6;"}">
      <b>#${t.rank} ${t.name}</b>
      <div style="font-size:11px; color:var(--muted); margin:4px 0;">${t.rewardText}</div>
      ${reason ? `<div style="font-size:10px; color:#fbbf24; margin-bottom:5px;">${esc(reason)}</div>` : ""}
      <button ${canGo ? "" : "disabled"} style="width:100%; background:${done ? "#059669" : canGo ? "#eab308" : "#374151"}; color:${done || !canGo ? "#fff" : "#000"} !important;" onclick="attemptPerugiusTrial(${t.rank})">${done ? "✓ Пройдено" : canGo ? "Пройти испытание" : "Закрыто"}</button>
    </div>`;
  });

  // Что дал путь целиком
  if (done0 === 3) {
    html += `<div class="card" style="border-color:#eab308; background:rgba(234,179,8,0.08);">
      <b style="color:#fde68a;">🐉 Путь Хаос Брейкера пройден</b>
      <div style="font-size:11px; color:#e5e7eb; margin-top:4px; line-height:1.5;">
        Двенадцать духов знают ваше имя. Перугиус называет вас не «человеком», а «тем, кто поднялся».
        В вашем роду с этого дня говорят: «У нас есть крыло».
      </div>
    </div>`;
  }
  cont.innerHTML = html;
}
function attemptPerugiusTrial(rank) {
  const t = PERUGIUS_TRIALS.find(x => x.rank === rank);
  if (!t || player.perugiusTrials.includes(rank)) return;
  const myCp = calcCombatPower(player);
  if (myCp < t.reqCp) return showActionModal("Слабость", `Нужно ${t.reqCp.toLocaleString()} БМ.`, "🐉");

  player.perugiusTrials.push(rank);
  const wasInYear = yearFlowActive || yearReportOpen;
  let lines = [];

  if (rank === 1) {
    player.intellect += 80; player.maxMana += 40; player.mana = player.maxMana;
    lines.push("Духи признали вас. Они не кланяются — они просто перестают проверять каждый ваш шаг.");
  }
  if (rank === 2) {
    player.maxHp += 300; player.hp = Math.min(player.maxHp, player.hp + 300);
    lines.push("Золотой Рыцарь отдаёт вам свой старый плащ. «Носи. Он видел больше, чем ты.»");
  }
  if (rank === 3) {
    player.coins += 1000;
    player.trait = TRAITS.find(x => x.id === "laplace_factor") || player.trait;
    if (typeof changePowerAttitude === "function") { changePowerAttitude(2, 10); changePowerAttitude(1, 5); }
    lines.push("Перугиус даёт вам Драконье Имя. С этого дня Семь Сил отвечают на ваши письма.");
  }

  // Последствия в мир, а не только в цифры
  worldState.chronicles.push({ year: worldState.currentWorldYear, text: `${player.name} прошёл испытание Хаос Брейкера #${rank}.` });
  if (player.perugiusTrials.length === 3) {
    lines.push("Весь Хаос Брейкер знает ваш род. Отныне в крепости есть ваше окно.");
    queueYearExtra("Хаос Брейкер", "Путь пройден до конца: двенадцать духов знают ваш род по имени.", "🐉");
  }

  log(`🐉 Испытание #${rank} пройдено: ${t.name}.`);
  showActionModal(`🐉 ${t.name}`, `<div style="text-align:left; line-height:1.55;">${lines.join("<br><br>")}</div>`, "🐉");
  playSound("win"); updateUI(); renderChaosBreaker();
  finishYearIfActive(wasInYear, t.name, lines.join(" "), "🐉");
}

function renderGreyratBranches() {
  const cont = $("greyrat-branches-container"); if (!cont) return;
  ensureStoryState();
  const allied = player.greyratAllies || [];
  const total = GREYRAT_BRANCHES.length;

  let html = `<div class="card" style="background:#191428; border-color:#b91c1c;">
    <b style="color:#fecaca;">🩸 Война Четырёх Ветвей</b>
    <div style="font-size:11px; color:var(--muted); margin-top:3px;">
      Союзов: <b>${allied.length}/${total}</b> • Каждая ветвь даёт своё — и требует своего.
    </div>
    <div style="font-size:11px; color:var(--muted); margin-top:4px; line-height:1.5;">
      Союз с одной ветвью — это вражда с другой. Ветви не разговаривают друг с другом сорок лет,
      и любое ваше решение кто-то запомнит.
    </div>
  </div>`;

  GREYRAT_BRANCHES.forEach(b => {
    const isAlly = allied.includes(b.id);
    const started = b.line ? (STORY_LINES.find(l => l.id === b.line)?.nodes || []).some(n => player.story.done.includes(n.id)) : true;
    const rival = isAlly && allied.length > 1 ? true : false;
    html += `<div class="card" style="${isAlly ? "border-color:#059669;" : started ? "border-color:#b91c1c;" : "opacity:0.65;"}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
        <b>${esc(b.name)}</b>
        <span class="badge-mythic" style="font-size:9px;">${isAlly ? "Союз ✓" : esc(b.region)}</span>
      </div>
      <div style="font-size:11px; color:var(--muted); margin:4px 0;">${esc(b.leader)}</div>
      <div style="font-size:11px; color:#e5e7eb; margin-bottom:5px; line-height:1.45;">${esc(b.desc)}</div>
      <div style="font-size:10px; color:#fbbf24; margin-bottom:6px;">Даёт: ${esc(b.giftText)} • Союз +${fmtNum(b.allyCp)} БМ</div>
      ${!isAlly && !started ? `<div style="font-size:10px; color:#94a3b8; margin-bottom:5px;">Сначала нужно начать их историю — иначе вам не поверят.</div>` : ""}
      <button ${isAlly || !started ? "disabled" : ""} style="width:100%; background:${isAlly ? "#059669" : started ? "#b91c1c" : "#374151"};" onclick="negotiateGreyratBranch('${b.id}')">${isAlly ? "Пакт заключён" : "Заключить союз (⚡ 1 сила)"}</button>
    </div>`;
  });

  if (allied.length === total) {
    html += `<div class="card" style="border-color:#eab308; background:rgba(234,179,8,0.08);">
      <b style="color:#fde68a;">🩸 Все четыре ветви под одним именем</b>
      <div style="font-size:11px; color:#e5e7eb; margin-top:4px; line-height:1.5;">
        Впервые за двести лет Грейрат — это не четыре дома, а один род.
        В Асуре шепчутся, что вы сделали то, чего не смог ни один король.
      </div>
    </div>`;
  } else if (allied.length >= 2) {
    html += `<div class="card" style="border-color:#f59e0b;">
      <b style="color:#fcd34d;">⚠️ Вы держите две ветви сразу</b>
      <div style="font-size:11px; color:#e5e7eb; margin-top:4px; line-height:1.5;">
        Обе знают о второй. Пока это союз, но каждая уже считает, что вы должны выбрать.
      </div>
    </div>`;
  }
  cont.innerHTML = html;
}

function negotiateGreyratBranch(id) {
  const b = GREYRAT_BRANCHES.find(x => x.id === id);
  if (!b) return;
  if ((player.greyratAllies || []).includes(id)) return;
  if (player.ap < 1) return showActionModal("Усталость", "Нужно ⚡ 1 сила!", "💤");

  // Порог входа: ветвь смотрит не на золото, а на дела
  const myCp = calcCombatPower(player);
  const ok = player.asuraInfluence >= 30 || player.swordGodExp >= 80 || myCp > 3500;
  if (!ok) return showActionModal("Отказ", "Нужно 30+ влияния, 80+ опыта Меча или 3 500+ БМ.", "📜");

  player.ap -= 1;
  player.greyratAllies = player.greyratAllies || [];
  player.greyratAllies.push(id);
  player.asuraInfluence += 25;

  // Подарок ветви — свой у каждой
  let giftText = "";
  if (b.gift === "sword") { player.swordGodExp += 25; giftText = "+25 к опыту Меча"; }
  if (b.gift === "water") { player.waterGodExp += 25; giftText = "+25 к опыту Воды"; }
  if (b.gift === "intellect") { player.intellect += 15; giftText = "+15 Знаний"; }
  if (b.gift === "coins") { player.coins += 150; giftText = "+150🪙 сразу (и столько же каждый год)"; }

  const wasInYear = yearFlowActive || yearReportOpen;
  log(`🩸 Союз с ветвью ${esc(b.name)} (+25 влияния, ${giftText}).`);
  queueYearExtra("Союз с ветвью Грейрат", `${esc(b.name)}: ${giftText} и +25 влияния.`, "🩸");
  worldState.chronicles.push({ year: worldState.currentWorldYear, text: `${player.name} заключил союз с ветвью Грейрат: ${b.name}.` });

  // Последствие: остальные ветви это заметили
  let extra = "";
  const others = GREYRAT_BRANCHES.filter(x => x.id !== id && !(player.greyratAllies || []).includes(x.id));
  if (others.length === 1) extra = "Осталась одна ветвь — та, что никогда не проигрывала переговоров.";
  else if (others.length) extra = `Остальные ветви уже знают: ${others.map(o => o.name.split(":")[0]).join(", ")}.`;

  showActionModal(`🩸 ${b.name}`, `<div style="text-align:left; line-height:1.55;">
    <div style="color:#fca5a5;">${esc(b.leader)} принимает вас в дом.</div>
    <div style="margin-top:6px;">${giftText} • +25 влияния в Асуре</div>
    ${extra ? `<div style="margin-top:8px; color:#94a3b8; font-size:11px;">${esc(extra)}</div>` : ""}
  </div>`, "🩸");

  playSound("win"); updateUI(); renderGreyratBranches();
  finishYearIfActive(wasInYear, `Союз с ${b.name}`, `${b.giftText}, +25 влияния`, "🩸");
}

// Ежегодный доход от союзов с ветвями — чтобы союз чувствовался в дневнике года
function applyGreyratAllianceYearly() {
  if (!player || !(player.greyratAllies || []).length) return;
  let coins = 0, exp = 0, int = 0;
  player.greyratAllies.forEach(id => {
    const b = GREYRAT_BRANCHES.find(x => x.id === id);
    if (!b) return;
    if (b.gift === "coins") coins += 150;
    if (b.gift === "sword") exp += 8;
    if (b.gift === "water") exp += 8;
    if (b.gift === "intellect") int += 4;
  });
  if (coins) player.coins += coins;
  if (exp) { player.swordGodExp += exp; player.waterGodExp += exp; }
  if (int) player.intellect += int;
  if (coins || exp || int) {
    const parts = [];
    if (coins) parts.push(`+${coins}🪙`);
    if (exp) parts.push(`+${exp} опыта`);
    if (int) parts.push(`+${int} Знаний`);
    queueYearExtra("Союзы Грейрат", `Ветви прислали своё: ${parts.join(", ")}.`, "🩸");
  }
}

function renderTablets() {
  const cont = $("tablets-container"); if (!cont) return;
  cont.innerHTML = `<div class="card" style="border-color:#38bdf8;"><b style="color:#38bdf8;">📜 Расшифровано: ${player.tabletsDeciphered.length}/5</b></div>` +
    FIRST_WAR_TABLETS.map(t => {
      const done = player.tabletsDeciphered.includes(t.id), ok = !done && player.languages.includes(t.reqLang) && player.currentRegionKey === t.regionKey;
      return `<div class="tablet-card"><div><b>${t.name}</b> ${done ? '<span style="color:var(--green);">✓</span>' : ""}
        <div style="font-size:11px; color:var(--muted);">${t.desc}</div><div style="font-size:10px; color:var(--accent-light);">${LANGUAGES[t.reqLang].name} • ${REGIONS[t.regionKey].name}</div></div>
        <button ${ok ? "" : "disabled"} style="background:${done ? "#059669" : "#0284c7"};" onclick="decipherTablet('${t.id}')">${done ? "Готово" : ok ? "Читать" : "Условия"}</button></div>`;
    }).join("");
}
function decipherTablet(id) {
  player.tabletsDeciphered.push(id); player.intellect += 18; player.maxMana += 25;
  let msg = "Скрижаль расшифрована (+18 Знаний, +25 маны)!";
  if (player.tabletsDeciphered.length === 5) { player.maxMana += 120; player.magicExp += 160; msg += " 🌟 Все 5 скрижалей собраны (+160 к Магии)!"; }
  log(msg); playSound("win"); showActionModal("Скрижаль", msg, "📜"); updateUI(); renderTablets();
}

function renderLanguages() {
  const cont = $("languages-container"); if (!cont) return;
  cont.innerHTML = Object.entries(LANGUAGES).map(([k, l]) => {
    const known = player.languages.includes(k);
    return `<div class="lang-card"><div><b>${l.name}</b> ${known ? '<span style="color:var(--green);">✓</span>' : ""}<div style="font-size:11px; color:var(--muted);">${l.desc}</div></div>
      <button ${known ? "disabled" : ""} style="background:${known ? "#059669" : "#312e81"};" onclick="learnLanguage('${k}')">${known ? "Изучено" : "Учить (25🪙, ⚡1)"}</button></div>`;
  }).join("");
}
function learnLanguage(k) {
  if (player.ap < 1 || player.coins < 25) return showActionModal("Язык", "Нужно 25🪙 и ⚡ 1 сила!", "🗣️");
  player.ap -= 1; player.coins -= 25; player.languages.push(k); player.intellect += 8;
  log(`🗣️ Изучен язык: <b>${LANGUAGES[k].name}</b>!`); playSound("win"); updateUI(); renderLanguages();
}

// =========================================================================
// ОТНОШЕНИЯ, КАНОНИЧЕСКИЕ NPC И ИХ ЛИЧНЫЕ КВЕСТЫ
// =========================================================================
function toggleNpcActions(id) { currentOpenedNpcId = currentOpenedNpcId === id ? null : id; renderRelations(); }

// =========================================================================
// СОЦИАЛЬНЫЕ ДЕЙСТВИЯ: отдельный запас на общение, не из общих сил
// =========================================================================
// Почему отдельно: общие силы — про труд и тренировки (12 в год).
// Общение — про людей. Если тратить общие силы, игрок никогда не выберет
// разговор вместо тренировки. Поэтому у общения свой счётчик.
//
// Сколько давать: у героя 19 разных дел на 12 сил, то есть каждый год
// он выбирает, чем заняться. На людей логично оставлять примерно четверть
// времени: 3 действия в год во взрослой жизни, 2 в юности, 4 в старости
// (когда дел меньше, а разговоров больше). Свадьба и ребёнок бесплатны.
const SOCIAL_AP_BY_AGE = (age) => age <= 3 ? 2 : age <= 9 ? 2 : age <= 15 ? 3 : age <= 59 ? 3 : 4;

function getMaxSocialAp() { return SOCIAL_AP_BY_AGE(player?.age || 20); }

function ensureSocialAp() {
  if (!player) return;
  if (typeof player.socialAp !== "number") player.socialAp = getMaxSocialAp();
  const max = getMaxSocialAp();
  if (player.socialAp > max) player.socialAp = max;   // повзрослел — запас подрезается
}

function spendSocialAp(n) {
  ensureSocialAp();
  if (player.socialAp < n) {
    showActionModal("Не о чем говорить", `Осталось ${player.socialAp} из ${getMaxSocialAp()} разговоров. Следующие — после «Прожить 1 год».`, "👥");
    return false;
  }
  player.socialAp -= n;
  return true;
}

// Сколько бесплатных «человеческих» действий стоит у каждого варианта
const SOCIAL_COST = { talk: 1, gift: 1, drink: 1, spar: 1, pocket: 1, story: 1, loan: 1, insult: 1, play: 1, cuddle: 1, confess: 1, marry: 0, child: 0, found: 1 };

// Блок-счётчик под заголовком вкладки «Связи»
function renderSocialCounter() {
  const box = $("social-counter");
  if (!box) return;
  if (!player) { box.innerHTML = ""; return; }
  ensureSocialAp();
  const cur = player.socialAp, max = getMaxSocialAp();
  const pct = max ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  box.innerHTML = `<div class="card social-counter-card">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <b style="font-size:12.5px; color:#fbcfe8;">👥 Разговоры на этот год</b>
      <span style="font-size:12px; font-weight:800; color:${cur ? "#f9a8d4" : "#94a3b8"};">${cur} из ${max}</span>
    </div>
    <div class="social-ap-track"><div class="social-ap-fill" style="width:${pct}%;"></div></div>
    <div style="font-size:10.5px; color:var(--muted); margin-top:5px; line-height:1.45;">
      ${cur > 0
        ? "Беседа, подарок, таверна, спарринг, признание — каждое стоит один разговор. Свадьба и ребёнок — бесплатно. Восстанавливаются после «Прожить 1 год»."
        : "Разговоры на этот год закончились. Люди подождут до следующего года — как и вы."}
    </div>
  </div>`;
}

// Подзаголовок «Искать знакомства» тоже стоит разговор
function searchStrangerCost() { return 1; }

// =========================================================================
// ДЕТИ КАК ПЕРСОНАЖИ: характер, память, просьбы и итог воспитания
// =========================================================================
// У ребёнка есть характер (4 черты), воспоминание о том, как вы с ним
// обошлись, и «нить» — просьба, которая приходит в свой возраст.
// Что вы вложили, то и получите в наследнике: характер определяет
// стартовые навыки, а память — отношение к вам на всю жизнь.

const CHILD_TRAITS = [
  { id: "stubborn", name: "Упрямый", icon: "🔥", desc: "Спорит со всем миром, включая вас. Из него выйдет либо воин, либо мученик.",
    bonus: { swordGodExp: 40 }, flaw: "Учится только через спор — подарки его не смягчают." },
  { id: "kind", name: "Добрый", icon: "🤍", desc: "Первый, кто кормит нищих, и последний, кто вспомнит о себе.",
    bonus: { intellect: 15, reputation: 20 }, flaw: "Слишком легко прощает предательство." },
  { id: "cruel", name: "Жестокий", icon: "🩸", desc: "Не плачет с трёх лет. Не спрашивает разрешения.",
    bonus: { swordGodExp: 60, squadFame: 40 }, flaw: "Отношение падает само каждый год." },
  { id: "dreamer", name: "Мечтатель", icon: "✨", desc: "Смотрит на облака и знает, что за ними есть земля.",
    bonus: { magicExp: 50, maxMana: 20 }, flaw: "Плохо переносит суровые годы." },
  { id: "tactician", name: "Считающий", icon: "♟", desc: "Считает всё: деньги, людей, ошибки отца. Особенно ошибки." ,
    bonus: { intellect: 30, waterGodExp: 30 }, flaw: "Ему нужно объяснять «зачем», иначе он не станет стараться." },
  { id: "wild", name: "Дикий", icon: "🐺", desc: "Вырос с зверями быстрее, чем с людьми.",
    bonus: { northGodExp: 45, maxHp: 60 }, flaw: "С ним трудно говорить о правилах." }
];

function childTraitById(id) { return CHILD_TRAITS.find(t => t.id === id) || null; }

// Характер выбирается при рождении — с намёком на родителей
function rollChildTrait() {
  const pool = CHILD_TRAITS.slice();
  // У жестокого героя чаще жестокие дети — кровь не вода
  if (player.relations.some(r => r.status === "Заклятый враг")) pool.push(CHILD_TRAITS.find(t => t.id === "cruel"));
  if (player.intellect > 60) pool.push(CHILD_TRAITS.find(t => t.id === "tactician"));
  if (player.swordGodExp > 200) pool.push(CHILD_TRAITS.find(t => t.id === "stubborn"));
  return pool[Math.floor(Math.random() * pool.length)];
}

// Просьбы: у каждой черты свой разговор в своём возрасте
const CHILD_REQUESTS = {
  stubborn: [
    { age: 6, text: "«Не буду учиться, пока ты меня не победишь!»", title: "Упрямство",
      choices: [
        { text: "Спорить и победить", cost: 1, effect: "rel+12, sword", result: "Вы выиграли спор — и он впервые вас зауважал." },
        { text: "Разрешить ему решать самому", cost: 0, effect: "rel+6, intellect", result: "Он выбрал сам — и впервые задумался, чего хочет." }
      ] },
    { age: 14, text: "«Я не стану графом. Я уйду в наёмники.»", title: "Уход",
      choices: [
        { text: "Отпустить с миром", cost: 0, effect: "rel+15, fame", result: "Он ушёл с вашим благословением — и вы не пожалели." },
        { text: "Запретить и запереть", cost: 0, effect: "rel-20", result: "Он смирился. Он не забыл." }
      ] }
  ],
  kind: [
    { age: 7, text: "«Можно я отдам свой плащ соседской девочке? Она мёрзнет.»", title: "Жалость",
      choices: [
        { text: "Дать плащ и денег сверху", cost: 1, effect: "rel+14, coins-20", result: "Он вернулся с сияющими глазами. Вы помните этот взгляд." },
        { text: "Объяснить, что сначала — семья", cost: 0, effect: "rel-5, intellect", result: "Он кивнул. Он всё равно отдал плащ." }
      ] },
    { age: 15, text: "«Я хочу уйти в лекари. Не в мечники.»", title: "Выбор пути",
      choices: [
        { text: "Поддержать и оплатить учёбу", cost: 1, effect: "rel+18, coins-80, intellect", result: "Вы оплатили ему дорогу. Он стал тем, кем хотел." },
        { text: "Настоять на службе роду", cost: 0, effect: "rel-18", result: "Он пошёл в стражу. Он больше не пишет." }
      ] }
  ],
  cruel: [
    { age: 8, text: "«Он смеялся надо мной. Я его ударил. Восемь раз.»", title: "Драка",
      choices: [
        { text: "Наказать по-настоящему", cost: 0, effect: "rel-12, hp+5", result: "Он не заплакал. Он запомнил, кто его наказал." },
        { text: "Похвалить, что постоял за себя", cost: 0, effect: "rel+10, sword", result: "Он стал злее — но к вам ближе." }
      ] },
    { age: 16, text: "«Отец, я выгнал слуг. Я снял комнаты с них за прошлый год.»", title: "Жестокость",
      choices: [
        { text: "Вернуть и извиниться перед людьми", cost: 1, effect: "rel-15, reputation", result: "Люди вернулись. Ребёнок — нет." },
        { text: "Молча одобрить", cost: 0, effect: "rel+12, coins-30", result: "Он понял, что так можно. Теперь это его правда." }
      ] }
  ],
  dreamer: [
    { age: 7, text: "«Я видел сон про летающий остров. Он правда есть?»", title: "Сон",
      choices: [
        { text: "Рассказать о Хаос Брейкере", cost: 1, effect: "rel+12, magic", result: "Он слушал всю ночь. Теперь он знает, куда расти." },
        { text: "Молчать, чтобы не вбивать в голову вздор", cost: 0, effect: "rel-4", result: "Он перестал вам рассказывать сны." }
      ] },
    { age: 15, text: "«Я не хочу корону. Я хочу увидеть, что за горизонтом.»", title: "Горизонт",
      choices: [
        { text: "Дать коня и деньги на путь", cost: 1, effect: "rel+16, coins-60, magic", result: "Он обещал вернуться. Вы верите ему." },
        { text: "Сказать, что мир не для мечтателей", cost: 0, effect: "rel-14", result: "Он остался. Он смотрит на север каждый вечер." }
      ] }
  ],
  tactician: [
    { age: 9, text: "«Почему наш род теряет золото? Я посчитал — три года подряд.»", title: "Счёт",
      choices: [
        { text: "Объяснить и показать книги", cost: 1, effect: "rel+13, intellect", result: "Он нашёл ошибку в ваших подсчётах. Вы смеялись." },
        { text: "Сказать: это не его дело", cost: 0, effect: "rel-8", result: "Он больше не спрашивает. Он просто изучает вас." }
      ] },
    { age: 17, text: "«Дай мне управление. Я подниму род за пять лет.»", title: "Власть",
      choices: [
        { text: "Отдать ему дела", cost: 1, effect: "rel+20, coins-40, intellect", result: "Он поднял род. Вы стали вторым." },
        { text: "Оставить всё себе", cost: 0, effect: "rel-15", result: "Он ждёт. Он умеет ждать." }
      ] }
  ],
  wild: [
    { age: 8, text: "«Стая зовёт меня каждую ночь. У них нет стен.»", title: "Стая",
      choices: [
        { text: "Пойти с ним к стае", cost: 1, effect: "rel+15, north", result: "Волки приняли и вас. Вы поняли часть своих детей." },
        { text: "Запретить и запереть двери", cost: 0, effect: "rel-12", result: "Он рычал во сне. Потом перестал рычать вообще." }
      ] },
    { age: 14, text: "«Я хочу уйти к Дорудиа. Там меня поймут.»", title: "Кровь",
      choices: [
        { text: "Отпустить с подарком", cost: 1, effect: "rel+16, coins-50, fame", result: "Он ушёл в лес. Он присылает шкуры раз в год." },
        { text: "Сказать: ты человек, а не зверь", cost: 0, effect: "rel-16", result: "Он согласился. Он больше не охотится." }
      ] }
  ]
};

// Инициализация ребёнка при рождении и для старых сейвов
function initChildTraits() {
  if (!player?.children) return;
  player.children.forEach((c, i) => {
    if (!c.traitId) {
      const roll = rollChildTrait() || CHILD_TRAITS[0];
      c.traitId = roll.id;
    }
    if (typeof c.memory !== "number") c.memory = 0;      // добрые и злые поступки
    if (typeof c.requestDone !== "number") c.requestDone = 0;
    if (!Array.isArray(c.askedAges)) c.askedAges = [];
  });
}

function childAge(c) {
  return Math.max(0, worldState.currentWorldYear - (c.birthYear || worldState.currentWorldYear - 1));
}


/* ══════════════════════════════════════════════════════════
   ВЫРОСШИЕ ДЕТИ
   Раньше после 18 лет ребёнок превращался в строку списка.
   Теперь он выбирает путь, приходит за советом, может уйти
   из дома, погибнуть или стать опорой в старости.
   ══════════════════════════════════════════════════════════ */

const CHILD_PATHS = [
  { id: "sword", icon: "⚔️", name: "Меч", desc: "Стал бойцом: гильдия, дорога, шрамы.",
    stat: "swordGodExp", gain: 320, cp: 900, trait: "боец" },
  { id: "magic", icon: "🔮", name: "Магия", desc: "Пошёл в академию: книги, круги, башня.",
    stat: "magicExp", gain: 320, cp: 850, trait: "маг" },
  { id: "craft", icon: "🔨", name: "Ремесло", desc: "Остался при деле: кузница, деньги, уважение.",
    stat: "intellect", gain: 120, cp: 400, coins: 180, trait: "мастер" },
  { id: "court", icon: "👑", name: "Двор", desc: "Ушёл в столицу: интриги, положение, долги.",
    stat: "intellect", gain: 150, cp: 500, influence: 25, trait: "придворный" },
  { id: "road", icon: "🧭", name: "Дорога", desc: "Уехал искать что-то своё. Пишет редко.",
    stat: "northGodExp", gain: 200, cp: 600, away: true, trait: "странник" },
  { id: "home", icon: "🏠", name: "Дом", desc: "Остался с вами: хозяйство, семья, спокойствие.",
    stat: "hp", gain: 60, cp: 300, stays: true, trait: "хранитель" }
];

// События взрослой жизни ребёнка — по одному раз в несколько лет
const GROWN_CHILD_EVENTS = [
  { id: "cg_ask_money", icon: "🪙", title: "Просит денег",
    text: (c) => `${c.name} стоит в дверях и не сразу говорит, зачем пришёл.\n\n— Мне нужно двести. Я верну. Наверное.\n\nВидно, что врёт про «наверное».`,
    choices: [
      { text: "Дать 200🪙", coins: -200, rel: 15, result: "Он взял и ушёл быстро. Через год вернул — вдвое больше, чем просил." },
      { text: "Спросить, на что", coins: 0, rel: 8, result: "Он рассказал. Вы помогли советом, а не деньгами. Это оказалось лучше." },
      { text: "Отказать", coins: 0, rel: -18, result: "Он ушёл, не простившись. Больше не просил никогда." }
    ] },
  { id: "cg_wedding", icon: "💍", title: "Свадьба",
    text: (c) => `${c.name} привёл(а) кого-то знакомить.\n\nОни держатся за руки и смотрят на вас так, будто ждут разрешения, которого уже не нужно.`,
    choices: [
      { text: "Сыграть свадьбу (250🪙)", coins: -250, rel: 25, result: "Гуляли три дня. Ваш род вырос ещё на одну ветвь." },
      { text: "Благословить скромно", coins: 0, rel: 12, result: "Они уехали на рассвете. Письма приходят дважды в год." },
      { text: "Сказать, что против", coins: 0, rel: -30, result: "Они всё равно поженились. И перестали приезжать." }
    ] },
  { id: "cg_trouble", icon: "⚖️", title: "Попал в беду",
    text: (c) => `Гонец привёз записку от ${c.name}: «Меня держат. Приди сам, иначе будет хуже».\n\nПочерк торопливый.`,
    choices: [
      { text: "Пойти и заплатить (300🪙)", coins: -300, rel: 20, result: "Вы заплатили и забрали его. Он молчал всю дорогу домой." },
      { text: "Пойти и решить силой", hp: -25, rel: 30, result: "Вы разнесли ту комнату. О нём теперь ходят слухи, и они ему нравятся." },
      { text: "Не ехать", rel: -40, result: "Он выбрался сам. И запомнил, что вы не пришли." }
    ] },
  { id: "cg_proud", icon: "🏆", title: "Он добился своего",
    text: (c) => `${c.name} вернулся(ась) с грамотой: его (её) признали.\n\nОн держит её так, будто боится, что вы отберёте.`,
    choices: [
      { text: "Сказать, что гордитесь", rel: 22, result: "Он расплывается в улыбке. Впервые с детства вы видите в нём того ребёнка." },
      { text: "Сказать, что можно и больше", rel: -8, result: "Он кивает. Улыбка гаснет. Вы всегда хотели лучше — и он всегда знал это." }
    ] },
  { id: "cg_grandkid", icon: "👶", title: "Внук",
    text: (c) => `${c.name} кладёт вам на руки свёрток.\n\n— Его назвали в твою честь. Не спорь.`,
    choices: [
      { text: "Взять на руки", rel: 25, hp: 20, result: "Вы держите его и чувствуете, как род идёт дальше, чем вы." },
      { text: "Отшутиться", rel: 5, result: "Вы пошутили. Все смеялись. Что-то важное прошло мимо." }
    ] },
  { id: "cg_farewell", icon: "🕯️", title: "Уезжает навсегда",
    text: (c) => `${c.name} продал(а) дом и берёт только один сундук.\n\n— Я не вернусь. Не потому что не люблю. Потому что здесь я не стану собой.`,
    choices: [
      { text: "Отпустить с миром", rel: 15, result: "Вы обняли его на дороге. Он писал дважды в год — и это было больше, чем вы ждали." },
      { text: "Просить остаться", rel: -12, result: "Он остался. На год. И каждый день был отдалением." }
    ] }
];

function ensureChildAdult(c) {
  if (!c) return false;
  const age = childAge(c);
  if (age < 18 || c.path) return false;
  // Выбор пути — один раз в жизни ребёнка
  c.path = "pending";
  setTimeout(() => openChildPathChoice(c.id), 60);
  return true;
}

function openChildPathChoice(childId) {
  const c = player.children.find(x => x.id === childId);
  if (!c) return;
  // «pending» ставится очередью года, но окно может открыться и раньше
  if (c.path && c.path !== "pending") return;
  c.path = "pending";
  const trait = childTraitById(c.traitId);
  // Характер подталкивает, но не решает за него
  const hinted = { stubborn: "sword", kind: "home", cruel: "road", dreamer: "magic", tactician: "court", quiet: "craft" }[trait?.id] || "sword";
  const html = `<div style="text-align:left;">
    <div style="font-size:12px; color:#94a3b8;">${trait?.icon || "👤"} ${esc(trait?.name || "Характер")} • ${childAge(c)} лет</div>
    <div style="margin:8px 0; line-height:1.55;">${esc(c.name)} вырос(ла) и стоит на пороге. Он(а) сам(а) не решит — точнее, решит, но не без вашего слова.</div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${CHILD_PATHS.map(p => `<button onclick="chooseChildPath('${childId}', '${p.id}')" style="background:${p.id === hinted ? "#4c1d95" : "#1e3a5f"}; text-align:left; padding:9px;">
        <b>${p.icon} ${p.name}</b>${p.id === hinted ? " <span style='font-size:9px; color:#c4b5fd;'>склонность</span>" : ""}<br>
        <span style="font-size:10.5px; color:#c7d2fe;">${esc(p.desc)}</span>
      </button>`).join("")}
    </div>
  </div>`;
  showActionModal(`${c.name} выбирает путь`, html, "🌱");
}

function chooseChildPath(childId, pathId) {
  const c = player.children.find(x => x.id === childId);
  const p = CHILD_PATHS.find(x => x.id === pathId);
  if (!c || !p) return;
  if (c.path && c.path !== "pending") return;
  closeActionModal();
  c.path = p.id;
  c.pathName = p.name;
  c.pathIcon = p.icon;
  c.adultSince = worldState.currentWorldYear;
  c.cp = (c.cp || 400) + p.cp;
  c.rel = c.rel || {};
  if (p.coins) player.coins += p.coins;
  if (p.influence) player.asuraInfluence = (player.asuraInfluence || 0) + p.influence;
  if (p.stat === "hp") { player.maxHp += p.gain; }
  if (p.away) c.isAway = true;
  if (p.stays) c.isHome = true;

  c.relation = Math.min(100, (c.relation || 70) + 10);
  const line = `${p.icon} <b>${esc(c.name)}</b> выбрал(а) путь: ${p.name.toLowerCase()}. ${p.desc}`;
  log(line); queueYearExtra(`${c.name}: путь`, `${p.name} — ${p.desc}`, p.icon);
  playSound("win");
  showActionModal(`${p.icon} ${c.name}`, `${p.desc}\n\n${p.coins ? `Он приносит в дом ${p.coins}🪙 в год. ` : ""}${p.away ? "Он будет писать редко." : p.stays ? "Он остался с вами." : ""}`, p.icon);
  updateUI();
}

// Раз в год: взрослые дети живут своей жизнью
function advanceGrownChildren() {
  if (!player?.children?.length) return null;
  const grown = player.children.filter(c => !c.isDead && c.path && c.path !== "pending");
  if (!grown.length) return null;

  for (const c of grown) {
    const age = childAge(c);
    // доход от детей при доме или ремесле
    if (c.isHome || c.path === "craft") {
      const inc = Math.round(20 + (c.cp || 400) * 0.05);
      player.coins += inc;
      c.contribution = inc;
    }
    // далёкие дети присылают деньги изредка
    if (c.isAway && Math.random() < 0.3) {
      const inc = Math.round(15 + Math.random() * 40);
      player.coins += inc;
      log(`✉️ ${c.name} прислал(а) ${inc}🪙 и короткое письмо.`);
    }
    // дети умирают от старости, если сами уже стары
    if (age > 62 && Math.random() < 0.05) {
      c.isDead = true;
      log(`🕯️ Ваш(а) ${c.name} умер(ла) в возрасте ${age} лет.`);
      queueYearExtra("Утрата", `${c.name} умер(ла) в возрасте ${age} лет. Вы пережили своего ребёнка.`, "🕯️");
      player.reputation -= 0;
      continue;
    }
    // событие взрослой жизни
    if (!c.grownEvents) c.grownEvents = [];
    const avail = GROWN_CHILD_EVENTS.filter(e => !c.grownEvents.includes(e.id));
    if (avail.length && Math.random() < 0.13) {
      const ev = avail[Math.floor(Math.random() * avail.length)];
      c.grownEvents.push(ev.id);
      return { child: c, ev };
    }
  }
  return null;
}

function showGrownChildEvent(childId, evId) {
  const c = player.children.find(x => x.id === childId);
  const ev = GROWN_CHILD_EVENTS.find(e => e.id === evId);
  if (!c || !ev) return;
  const text = typeof ev.text === "function" ? ev.text(c) : ev.text;
  const html = `<div style="text-align:left;">
    <div style="margin:8px 0; line-height:1.55; white-space:pre-line;">${esc(text)}</div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${ev.choices.map((ch, i) => `<button onclick="resolveGrownChildEvent('${childId}','${evId}',${i})" style="background:#1e3a5f; text-align:left; padding:9px;">
        ${esc(ch.text)}${ch.coins && ch.coins > 0 ? "" : ""}
      </button>`).join("")}
    </div>
  </div>`;
  showActionModal(`${ev.icon} ${c.name}: ${ev.title}`, html, ev.icon);
}

function resolveGrownChildEvent(childId, evId, idx) {
  const c = player.children.find(x => x.id === childId);
  const ev = GROWN_CHILD_EVENTS.find(e => e.id === evId);
  if (!c || !ev) return;
  const ch = ev.choices[idx];
  if (ch.coins && ch.coins < 0 && player.coins < -ch.coins) {
    closeActionModal();
    return showActionModal("Нет золота", `Нужно ${-ch.coins}🪙.`, "🪙");
  }
  if (ch.coins) player.coins = Math.max(0, player.coins + ch.coins);
  if (ch.hp) player.hp = Math.max(1, Math.min(player.maxHp, player.hp + ch.hp));
  if (ch.rel) c.relation = Math.max(0, Math.min(100, (c.relation || 70) + ch.rel));
  closeActionModal();
  log(`👨‍👩‍👧 <b>${esc(c.name)}</b>: ${esc(ch.result)}`);
  queueYearExtra(c.name, ch.result, ev.icon);
  showActionModal(c.name, ch.result, ev.icon);
  updateUI();
}

// Раз в год: дети растут, характер сказывается, приходят просьбы
function advanceChildrenYear() {
  if (!player?.children) return;
  initChildTraits();
  player.children.forEach(c => {
    if (c.isDead) return;
    const age = childAge(c);
    const trait = childTraitById(c.traitId);

    // Дело жестокого: отношение тает само
    if (trait?.id === "cruel" && age < 18) c.relation = Math.max(0, (c.relation || 70) - 2);

    // Ребёнок с хорошей памятью находит тёплые слова каждый год
    if ((c.memory || 0) > 20 && age < 18) c.relation = Math.min(100, (c.relation || 70) + 1);

    // Выросший ребёнок выбирает свой путь — один раз и навсегда
    if (age >= 18 && !c.path) {
      if (!c.pathQueued) {
        c.pathQueued = true;
        queueYearExtra(`${c.name} вырос(ла)`, "Пришло время выбрать путь.", "🌱");
        // Показываем сразу после текущего окна, а не внутри него
        setTimeout(() => openChildPathChoice(c.id), 250);
      }
      return;
    }

    // Просьба приходит в свой возраст — и только один раз
    const reqs = (trait && CHILD_REQUESTS[trait.id]) || [];
    const due = reqs.find(r => r.age === age && !c.askedAges.includes(r.age));
    if (due) {
      c.askedAges.push(due.age);
      queueYearExtra(`${trait?.icon || "👶"} ${c.name}`, due.text, "👶");
      // Сразу покажем окно: это не то, что можно отложить
      if (!yearFlowActive && !storyQueue.length) setTimeout(() => showChildRequest(c.id, due.age), 50);
    }
  });
}

// Окно просьбы ребёнка — настоящее решение, а не текст
function showChildRequest(childId, reqAge) {
  const c = player.children.find(x => x.id === childId);
  if (!c) return;
  const trait = childTraitById(c.traitId);
  const req = (CHILD_REQUESTS[trait?.id] || []).find(r => r.age === reqAge);
  if (!req) return;

  const html = `<div style="text-align:left;">
    <div style="font-size:12px; color:#94a3b8;">${trait.icon} ${esc(trait.name)} • ${childAge(c)} лет</div>
    <div style="margin:8px 0; line-height:1.55;">${esc(req.text)}</div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${req.choices.map((ch, i) => `<button onclick="resolveChildRequest('${childId}', ${reqAge}, ${i})" style="background:${ch.cost ? "#7c2d12" : "#1e3a5f"}; text-align:left; padding:9px;">
        ${esc(ch.text)}${ch.cost ? " (1👥)" : ""}
      </button>`).join("")}
    </div>
  </div>`;
  showActionModal(`${trait.icon} ${req.title}`, html, "👶");
}

function resolveChildRequest(childId, reqAge, choiceIdx) {
  const c = player.children.find(x => x.id === childId);
  if (!c) return;
  const trait = childTraitById(c.traitId);
  const req = (CHILD_REQUESTS[trait?.id] || []).find(r => r.age === reqAge);
  if (!req) return;
  const ch = req.choices[choiceIdx];
  if (!ch) return;
  if (ch.cost) { if (!spendSocialAp(ch.cost)) return; }

  const eff = ch.effect || "";
  const relM = eff.match(/rel([+-]\d+)/);
  if (relM) c.relation = Math.max(0, Math.min(100, (c.relation || 70) + parseInt(relM[1])));
  // Добрый поступок остаётся в памяти ребёнка, обида — тоже
  if (relM && relM[1].startsWith("+")) c.memory = (c.memory || 0) + 10;
  if (relM && relM[1].startsWith("-")) c.memory = (c.memory || 0) - 15;
  if (eff.includes("sword")) { c.growthSword = (c.growthSword || 0) + 25; c.cp = (c.cp || 450) + 120; }
  if (eff.includes("magic")) { c.growthMagic = (c.growthMagic || 0) + 25; c.cp = (c.cp || 450) + 100; }
  if (eff.includes("north")) { c.growthNorth = (c.growthNorth || 0) + 25; c.cp = (c.cp || 450) + 120; }
  if (eff.includes("intellect")) { c.growthInt = (c.growthInt || 0) + 12; c.cp = (c.cp || 450) + 80; }
  if (eff.includes("fame")) { player.squadFame += 25; }
  if (eff.includes("reputation")) { player.reputation = (player.reputation || 0) + 20; }
  const coinM = eff.match(/coins-(\d+)/);
  if (coinM) player.coins = Math.max(0, player.coins - parseInt(coinM[1]));

  c.requestDone = (c.requestDone || 0) + 1;
  const msg = `<div style="text-align:left; line-height:1.55;">${esc(ch.result)}</div>
    <div style="margin-top:8px; font-size:11px; color:#94a3b8;">${esc(c.name)}: отношение ${c.relation}%, память ${(c.memory || 0) > 20 ? "добрая" : (c.memory || 0) < -10 ? "тяжёлая" : "ровная"}.</div>`;
  log(`👶 ${esc(c.name)}: ${esc(ch.result)}`);
  showActionModal(`${trait.icon} ${esc(c.name)}`, msg, "👶");
  playSound("click");
  updateUI(); renderRelations(); renderSocialCounter();
}

// Карточка ребёнка в списке связей: характер, память, что из него выйдет
function childTraitBadge(npc) {
  if (!npc.isChild) return "";
  // Выросший ребёнок: показываем выбранный путь
  if (npc.path && npc.path !== "pending") {
    return `<span class="child-path-badge">${npc.pathIcon || "🌱"} ${esc(npc.pathName || "Путь")}</span>`;
  }
  const trait = childTraitById(npc.traitId);
  if (!trait) return "";
  const mem = npc.memory || 0;
  const mood = mem > 20 ? "💚 помнит добро" : mem < -10 ? "🖤 помнит обиду" : "🤍 ровно";
  return `<span class="child-trait-badge" title="${esc(trait.desc)}">${trait.icon} ${esc(trait.name)}</span><span class="child-mem-badge">${mood}</span>`;
}

// Итог воспитания — то, что наследник получит при переходе
function childInheritanceSummary(c) {
  const trait = childTraitById(c.traitId);
  if (!trait) return { text: "", bonus: {} };
  const rel = c.relation || 70, mem = c.memory || 0;
  const bonus = {};
  // Характер даёт основу, отношение и память — поправку
  const scale = (rel / 70) * (mem > 20 ? 1.15 : mem < -10 ? 0.85 : 1);
  Object.entries(trait.bonus).forEach(([k, v]) => { bonus[k] = Math.round(v * scale); });
  const moodWord = rel >= 85 ? "любит вас и продолжит ваше дело" :
                   rel >= 60 ? "уважает вас, но пойдёт своим путём" :
                   rel >= 35 ? "помнит вас редко и неохотно" :
                   "не простил вас и не станет продолжать";
  return {
    text: `${trait.icon} ${trait.name}: ${moodWord}.`,
    bonus
  };
}

// Годы детства ребёнка: маленький отчёт для окна года
function childYearNote(c, age) {
  const trait = childTraitById(c.traitId);
  if (!trait) return null;
  if (age === 3) return { title: `${c.name} — три года`, text: `Стало ясно: растёт ${trait.name.toLowerCase()} ребёнок. ${trait.desc}`, icon: trait.icon };
  if (age === 10) return { title: `${c.name} — десять лет`, text: `${trait.desc} Отношение к вам: ${c.relation}%.`, icon: trait.icon };
  if (age === 18) {
    const inf = childInheritanceSummary(c);
    return { title: `${c.name} вырос`, text: `${inf.text} Наследство навыков: ${Object.entries(inf.bonus).map(([k, v]) => `${v} ${({swordGodExp:"меча",magicExp:"магии",northGodExp:"северного стиля",intellect:"знаний",maxMana:"маны",maxHp:"HP",reputation:"репутации",squadFame:"славы",waterGodExp:"воды"})[k] || k}`).join(", ")}.`, icon: "🎓" };
  }
  return null;
}

function renderRelations() {
  renderSocialCounter();
  const cont = $("relations-list"); if (!cont) return;
  if (!player.relations.length) { cont.innerHTML = `<div style="color:var(--muted); text-align:center;">Знакомых пока нет.</div>`; return; }

  const limit = getRelationLimit(), closeCount = countCloseRelations();
  const limitHtml = `<div class="rel-limit-bar">👥 Круг общения: <b>${closeCount} из ${limit}</b> — растёт от знаний и репутации.
    ${closeCount >= limit ? '<br><span style="color:#fca5a5;">Круг полон: новые люди останутся приятелями.</span>' : ""}</div>`;

  cont.innerHTML = limitHtml + player.relations.map(npc => {
    const cls = npc.isDead ? "status-dead" : npc.relation < 30 ? "status-enemy" : npc.status === "Супруг/Супруга" ? "status-married" : npc.status === "Пара" ? "status-love" : "status-friend";
    const open = currentOpenedNpcId === npc.id && !npc.isDead;
    const inSquad = player.squad.some(m => m.id === npc.id);
    const hasCanonQ = npc.isCanon && npc.relation >= 80 && CANON_QUESTS[npc.id] && !player.canonQuestsDone?.includes(npc.id);
    let actHtml = "";
    if (open) {
      if (npc.isLost) actHtml = `<button class="npc-action-full" style="background:#b45309;" onclick="searchLostFamily('${npc.id}')">🔍 Искать пропавшего (👥 1 разговор)</button>`;
      else if (player.age < 4) actHtml = `<button onclick="npcInteract('${npc.id}','play')">👶 Поиграть (1👥)</button><button onclick="npcInteract('${npc.id}','cuddle')">🍼 На ручки (1👥)</button>`;
      else if (player.age < 10) actHtml = `<button onclick="npcInteract('${npc.id}','story')">📖 Сказка (1👥)</button><button onclick="npcInteract('${npc.id}','gift')">🎁 Подарок (8🪙 • 1👥)</button><button onclick="npcInteract('${npc.id}','spar')">🪵 Урок меча (1👥)</button><button onclick="npcInteract('${npc.id}','pocket')">🪙 На сладости (1👥)</button>`;
      else {
        actHtml = `<button onclick="npcInteract('${npc.id}','talk')">💬 Беседа (1👥)</button><button onclick="npcInteract('${npc.id}','gift')">🎁 Подарок (8🪙 • 1👥)</button>
          <button onclick="npcInteract('${npc.id}','drink')">🍻 Таверна (6🪙 • 1👥)</button><button onclick="npcInteract('${npc.id}','spar')">⚔️ Спарринг (1👥)</button>
          <button onclick="npcInteract('${npc.id}','loan')">🪙 Занять (1👥)</button><button class="action-danger" onclick="npcInteract('${npc.id}','insult')">🤬 Оскорбить (1👥)</button>`;
        if (hasCanonQ) actHtml += `<button class="npc-action-full" style="background:#b45309;" onclick="doCanonQuest('${npc.id}')">⭐ Квест: ${CANON_QUESTS[npc.id].title}</button>`;
        if (player.age >= 16 && !inSquad && !npc.isChild) actHtml += `<button class="npc-action-full" style="background:#312e81;" onclick="addToSquad('${npc.id}')">🛡️ В боевой отряд</button>`;
        if (player.age >= 14 && !npc.isFamily && !npc.isChild && npc.status !== "Пара" && npc.status !== "Супруг/Супруга") actHtml += `<button class="action-love npc-action-full" onclick="npcInteract('${npc.id}','confess')">❤️ Признаться в чувствах</button>`;
        if (player.age >= 16 && npc.status === "Пара" && canMarry(npc)) actHtml += `<button class="action-married npc-action-full" onclick="npcInteract('${npc.id}','marry')">💍 Пожениться</button>`;
        if (npc.status === "Супруг/Супруга" && !npc.isDead) actHtml += `<button class="action-married npc-action-full" ${player.pregnancy ? "disabled" : ""} onclick="npcInteract('${npc.id}','child')">${player.pregnancy ? "⏳ Ожидание малыша" : "👶 Зачать ребенка"}</button>`;
      }
    }
    const tier = relationTier(npc);
    const badges = `<span class="rel-tier rel-tier-${tier.key}">${tier.icon} ${tier.name}</span> ${npc.isCanon ? '<span class="badge-canon">Канон ⭐</span> ' : ""}${npc.isChild ? '<span style="color:#fbbf24;">(Наследник)</span> ' : ""}${childTraitBadge(npc)}${npc.isLost ? '<span class="badge-mythic">Пропал ⚡</span> ' : ""}${inSquad ? '<span class="badge-rare">Отряд 🛡️</span>' : ""}`;
    return `<div class="relation-card"><div class="rel-header" onclick="${npc.isDead ? "" : `toggleNpcActions('${npc.id}')`}" style="cursor:${npc.isDead ? "default" : "pointer"};">
      <div><div class="rel-name">${esc(npc.name)} ${badges}</div><div class="rel-role">${npc.role || npc.race} • ${npc.age} л. • БМ ${(npc.cp || 400).toLocaleString()}</div></div>
      <div style="text-align:right;"><div style="font-size:12px; font-weight:700;"><span class="${cls}">${npc.status}</span> ${npc.isDead ? "" : `(${npc.relation}%)`}</div></div></div>
      ${!npc.isDead ? `<div class="bar-bg"><div class="bar-fill bar-relation" style="width:${npc.relation}%; background:${npc.relation < 30 ? "var(--hp)" : "var(--green)"};"></div></div>` : ""}
      ${actHtml ? `<div class="npc-inline-actions">${actHtml}</div>` : ""}</div>`;
  }).join("");
}

function doCanonQuest(id) {
  const q = CANON_QUESTS[id]; if (!q) return;
  player.canonQuestsDone = player.canonQuestsDone || [];
  if (player.canonQuestsDone.includes(id)) return;
  player.canonQuestsDone.push(id);
  q.action(player);
  log(`⭐ <b>Личный квест:</b> ${q.rewardText}`);
  playSound("win"); showActionModal(q.title, q.rewardText, "⭐");
  updateUI(); renderRelations();
}

// Можно ли вступить в новый брак: не женат, не в трауре, партнёр жив
function canMarry(npc) {
  if (!npc || npc.isDead) return false;
  if (player.spouse && !player.spouse.isDead && player.spouse.id !== npc.id) return false;
  if (player.spouse && player.spouse.id === npc.id) return false;   // уже супруги
  if (player.mourningUntilYear && worldState.currentWorldYear < player.mourningUntilYear) return false;
  return true;
}

// Текст, объясняющий, почему брак сейчас невозможен
function marryBlockReason(npc) {
  if (player.spouse && !player.spouse.isDead && player.spouse.id !== npc.id) return `Вы женаты на ${player.spouse.name}.`;
  if (player.mourningUntilYear && worldState.currentWorldYear < player.mourningUntilYear) return "Траур по умершему супругу — ещё год.";
  return "";
}

function npcInteract(id, act) {
  const npc = player.relations.find(r => r.id === id); if (!npc) return;
  const cost = SOCIAL_COST[act] ?? 1;
  if (cost > 0) {
    if (act === "gift" && player.coins < 8) return showActionModal("Золото", "Нужно 8🪙!", "🪙");
    if (act === "drink" && player.coins < 6) return showActionModal("Золото", "Нужно 6🪙!", "🍻");
    if (!spendSocialAp(cost)) return;
  }
  const beastBoost = (npc.race?.includes("Зверочеловек") && player.languages.includes("beast")) ? 1.25 : 1;
  const gainRel = (v) => { npc.relation = Math.min(100, npc.relation + Math.round(v * beastBoost)); };
  let msg = "";
  if (act === "play" || act === "cuddle") { gainRel(11); if (act === "cuddle") player.hp = Math.min(player.maxHp, player.hp + 10); msg = `Тёплое общение с ${npc.name}!`; playSound("win"); }
  else if (act === "story") { gainRel(8); player.intellect += 2; msg = `${npc.name} рассказал(а) сказку (+2 Знаний)!`; playSound("win"); }
  else if (act === "pocket") { if (npc.relation >= 70) { const g = Math.floor(Math.random() * 4) + 1; player.coins += g; msg = `${npc.name} дал(а) на сладости (+${g}🪙)!`; playSound("coin"); } else msg = `${npc.name} отказал(а).`; }
  else if (act === "talk") { gainRel(8); if (npc.relation >= 60 && npc.status === "Знакомый") npc.status = "Друг"; msg = `Душевная беседа с ${npc.name}.`; playSound("click"); }
  else if (act === "gift") { if (player.coins < 8) return showActionModal("Золото", "Нужно 8🪙!", "🪙"); player.coins -= 8; gainRel(20); msg = `Подарок порадовал ${npc.name} (+20%)!`; playSound("coin"); }
  else if (act === "drink") { if (player.coins < 6) return showActionModal("Золото", "Нужно 6🪙!", "🍻"); player.coins -= 6; gainRel(14); msg = `Отличный вечер в таверне с ${npc.name}!`; playSound("coin"); }
  else if (act === "spar") { player.swordGodExp += 10; npc.cp += 100; msg = `Спарринг с ${npc.name} (+10 Мечу)!`; playSound("sword"); }
  else if (act === "loan") { if (npc.relation >= 75) { const g = Math.floor(Math.random() * 20) + 10; player.coins += g; npc.relation -= 5; msg = `${npc.name} одолжил(а) +${g}🪙.`; playSound("coin"); } else msg = `Мало доверия (нужно 75%+).`; }
  else if (act === "insult") { npc.relation = Math.max(0, npc.relation - 30); if (npc.relation <= 25) npc.status = "Заклятый враг"; msg = `Вы оскорбили ${npc.name}!`; playSound("click"); }
  else if (act === "confess") { if (npc.relation >= 75) { npc.status = "Пара"; msg = `💖 ${npc.name} ответил(а) взаимностью!`; playSound("win"); } else { npc.relation = Math.max(0, npc.relation - 10); msg = `💔 ${npc.name}: "Останемся друзьями..."`; } }
  else if (act === "marry") {
    if (!canMarry(npc)) { msg = marryBlockReason(npc) || "Сейчас брак невозможен."; }
    else if (npc.relation >= 88) {
      // Прошлый супруг (если был и умер) остаётся в памяти, но не в статусе
      const wasWidow = !!player.widowed;
      npc.status = "Супруг/Супруга"; player.spouse = npc;
      if (wasWidow) {
        player.widowed.was = player.widowed.was || [];
        player.widowed.was.push({ name: player.widowed.name, year: player.widowed.year });
        player.widowed = { year: 0, name: "", since: 0, was: player.widowed.was };
        queueYearExtra("Новая семья", `Вы вступили в новый брак с ${esc(npc.name)}. Прежний супруг остался в памяти рода.`, "💍");
      }
      msg = `💍 Вы и ${npc.name} поженились!`; playSound("win");
    } else msg = `Укрепите отношения до 88%+!`;
  }
  else if (act === "child") { player.pregnancy = { partnerName: npc.name, partnerRace: npc.race || "Человек" }; msg = `👶 Вы с ${npc.name} ждёте ребёнка!`; playSound("win"); }
  log(msg); showActionModal("Отношения", msg, "👥"); updateUI(); renderRelations(); renderSocialCounter();
}

function searchLostFamily(id) {
  if (!spendSocialAp(1)) return;
  const npc = player.relations.find(r => r.id === id);
  if (npc && Math.random() < 0.6) { npc.isLost = false; log(`🎉 Вы нашли <b>${npc.name}</b>!`); playSound("win"); showActionModal("Воссоединение!", `Вы нашли <b>${npc.name}</b>!`, "🎉"); }
  else showActionModal("Поиски", "Пока следов нет, ищите дальше!", "🔍");
  updateUI(); renderRelations(); renderSocialCounter();
}

function trySpawnCanonNpc(isSearch = false) {
  const pool = CANON_NPCS.filter(c => c.region === player.currentRegionKey && player.age >= c.minAge && player.age <= c.maxAge && !player.relations.some(r => r.id === c.id));
  if (!pool.length) return null;
  const cand = pool[Math.floor(Math.random() * pool.length)];
  if (Math.random() < (isSearch ? cand.baseChance * 1.6 : cand.baseChance)) {
    const npc = { ...cand, age: player.age + (cand.id === "roxy" || cand.id === "ghislaine" || cand.id === "ruijerd" ? 18 : 0), relation: 55, status: "Знакомый", isCanon: true, isLost: false, isDead: false };
    player.relations.push(npc);
    return npc;
  }
  return null;
}

// ═══ КРУГ ОБЩЕНИЯ ═══
// Раньше знакомых можно было набрать сколько угодно и «дружить» со всеми сразу.
// Теперь круг ограничен: сколько людей вы способны держать в жизни,
// зависит от ума и репутации. Остальные остаются приятелями и постепенно забываются.

function getRelationLimit() {
  const base = 6;
  const byInt = Math.floor((player.intellect || 0) / 60);
  const byRep = Math.floor(Math.max(0, (player.reputation || 0)) / 25);
  return Math.min(22, base + byInt + byRep);
}

// Кто считается «в кругу»: родня, супруг, дети, канон — всегда. Остальные по близости.
function countCloseRelations() {
  return player.relations.filter(r =>
    !r.isDead && !r.isLost && (r.isFamily || r.status === "Супруг/Супруга" || r.isCanon || (r.relation || 0) >= 50)
  ).length;
}

function relationTier(r) {
  if (r.isFamily) return { key: "family", name: "Родня", icon: "🏠" };
  if (r.status === "Супруг/Супруга") return { key: "spouse", name: "Супруг(а)", icon: "💍" };
  const rel = r.relation || 0;
  if (rel >= 85) return { key: "close", name: "Близкий", icon: "💖" };
  if (rel >= 60) return { key: "friend", name: "Друг", icon: "🤝" };
  if (rel >= 35) return { key: "known", name: "Знакомый", icon: "👋" };
  return { key: "distant", name: "Приятель", icon: "·" };
}

function meetStranger() {
  if (!spendSocialAp(1)) return;
  renderSocialCounter();
  const canon = trySpawnCanonNpc(true);
  if (canon) {
    const msg = `⭐ <b>КАНОНИЧЕСКАЯ ВСТРЕЧА!</b> Вы познакомились с <b>${canon.name}</b> (${canon.role})!`;
    log(msg); playSound("win"); showActionModal("Легендарная встреча!", msg, "⭐");
    renderRelations(); updateUI(); return;
  }
  const isM = Math.random() > 0.5, list = SYLLABLES[isM ? "male" : "female"];
  const classes = ["Крестьянин", "Наёмник", "Купец", "Рыцарь", "Магистр", "Аристократ"];
  const cls = classes[Math.floor(Math.random() * classes.length)], cp = Math.floor(Math.random() * 1400) + 250;
  const rKeys = Object.keys(RACES);
  const npc = {
    id: "npc_" + Date.now(), name: `${list[Math.floor(Math.random() * list.length)]} ${SYLLABLES.surnames[Math.floor(Math.random() * SYLLABLES.surnames.length)]}`,
    gender: isM ? "male" : "female", race: RACES[rKeys[Math.floor(Math.random() * rKeys.length)]].name,
    age: Math.max(16, player.age + Math.floor(Math.random() * 8) - 4), role: cls, cp,
    relation: Math.floor(Math.random() * 25) + 35, status: "Знакомый", isDead: false
  };
  if (countCloseRelations() >= getRelationLimit()) {
    // Круг полон: человек остаётся приятелем, но не входит в жизнь
    npc.status = "Приятель";
    npc.relation = Math.min(npc.relation, 20);
    player.relations.push(npc);
    const fullMsg = `Вы встретили <b>${npc.name}</b>, но ваш круг общения полон (${getRelationLimit()}). Он останется приятелем — чтобы подпустить ближе, отпустите кого-то.`;
    log(fullMsg); showActionModal("Круг полон", fullMsg, "👥"); renderRelations(); updateUI();
    return;
  }
  player.relations.push(npc);
  const msg = `Вы встретили <b>${npc.name}</b> (${npc.race}, ${npc.role}, БМ ${cp.toLocaleString()}).`;
  log(msg); playSound("click"); showActionModal("Знакомство", msg, "👥"); renderRelations(); updateUI();
}

// =========================================================================
// ТЕЧЕНИЕ ГОДА (AGE UP)
// =========================================================================
// =========================================================================
// ДНЕВНИК ГОДА: короткая сводка вместо копания в ленте событий
// =========================================================================
let yearSnapshot = null;
let yearSummary = null;

let yearFlowActive = false;   // сейчас проживается год
let yearExtras = [];          // итоги выбора и эхо прошлого — всё в одно окно
let yearReportOpen = false;

// Отложить текст в окно итогов года
function queueYearExtra(title, text, icon) {
  yearExtras.push({ title, text, icon: icon || "✨" });
}

function takeYearSnapshot() {
  if (!player) return null;
  return {
    year: worldState.currentWorldYear,
    age: player.age,
    hp: player.hp, maxHp: player.maxHp,
    mana: player.mana, maxMana: player.maxMana,
    coins: player.coins,
    intellect: player.intellect,
    sword: player.swordGodExp, magic: player.magicExp,
    water: player.waterGodExp, north: player.northGodExp,
    guildExp: player.guildExp, guildRank: player.guildRank,
    reputation: player.reputation,
    relations: (player.relations || []).filter(r => !r.isDead).length,
    estateIncome: (player.estates || []).reduce((sum, id) => sum + (ESTATES.find(e => e.id === id)?.income || 0), 0),
    // Решения и сюжет — чтобы дневник показывал, что изменилось в истории, а не только в числе
    flags: Object.keys(player.story?.flags || {}).length,
    storyDone: (player.story?.done || []).length,
    pending: (player.story?.pending || []).length,
    allies: (player.greyratAllies || []).length,
    trials: (player.perugiusTrials || []).length,
    seat: player.currentPowersSeat || 0
  };
}

function buildYearSummary() {
  if (!player || !yearSnapshot) return null;
  const before = yearSnapshot, now = takeYearSnapshot();
  // Сейв из старой версии мог сохранить снимок без новых полей
  Object.keys(now).forEach(k => { if (typeof before[k] !== "number" && typeof now[k] === "number") before[k] = now[k]; });
  const diff = (now, before) => now - before;
  const lines = [];
  const coinDelta = diff(now.coins, before.coins);
  if (coinDelta) lines.push(`${coinDelta > 0 ? "💰" : "💸"} Золото: ${coinDelta > 0 ? "+" : ""}${fmtNum(coinDelta)}🪙 (всего ${fmtNum(now.coins)})`);
  const expDelta = diff(now.sword, before.sword) + diff(now.magic, before.magic) + diff(now.water, before.water) + diff(now.north, before.north);
  if (expDelta > 0) lines.push(`⚔️ Боевой опыт: +${fmtNum(expDelta)} за год`);
  const intDelta = diff(now.intellect, before.intellect);
  if (intDelta) lines.push(`📚 Знания: ${intDelta > 0 ? "+" : ""}${intDelta} (всего ${fmtNum(now.intellect)})`);
  const hpDelta = now.hp - before.hp;
  if (hpDelta) lines.push(`❤️ Здоровье: ${hpDelta > 0 ? "+" : ""}${fmtNum(hpDelta)} (${now.hp}/${now.maxHp})`);
  if (now.guildRank !== before.guildRank) lines.push(`🌟 Ранг гильдии: ${before.guildRank} → <b>${now.guildRank}</b>`);
  const relDelta = now.relations - before.relations;
  if (relDelta) lines.push(`${relDelta > 0 ? "👥" : "🕯️"} Близких людей: ${relDelta > 0 ? "+" : ""}${relDelta}`);
  if (now.reputation !== before.reputation) lines.push(`⚖️ Репутация: ${now.reputation > before.reputation ? "+" : ""}${now.reputation - before.reputation}`);
  if (now.estateIncome) lines.push(`🏰 Имения приносят ${fmtNum(now.estateIncome)}🪙 в год`);
  if (typeof worldRumor === "function") {
    const rumor = worldRumor();
    if (rumor) {
      const tier = moralityTier();
      lines.push(`${tier.icon} <b>${tier.name}</b>: ${rumor}`);
    }
  }
  const flagDelta = now.flags - before.flags;
  if (flagDelta > 0) lines.push(`📜 Принято решений: +${flagDelta} (всего ${now.flags} памятных)`);
  if (now.seat !== before.seat) lines.push(now.seat ? `👑 Вы заняли трон #${now.seat} Семи Сил` : `👑 Трон Семи Сил потерян`);
  const allyDelta = now.allies - before.allies;
  if (allyDelta > 0) lines.push(`🩸 Новых союзов с ветвями Грейрат: +${allyDelta}`);
  const trialDelta = now.trials - before.trials;
  if (trialDelta > 0) lines.push(`🐉 Испытаний Хаос Брейкера пройдено: +${trialDelta}`);
  const verdict = now.hp / Math.max(1, now.maxHp) > 0.7 ? "Год сложился удачно."
    : now.hp / Math.max(1, now.maxHp) > 0.35 ? "Год был непростым, но вы держитесь."
    : "Вы на последнем издыхании — отдохните и подлечитесь!";
  return { year: now.year, age: now.age, lines, verdict };
}

// Запоминаем состояние перед прожитым годом
const takeYearSnapshotBeforeAgeUp = takeYearSnapshot;

// Главное окно года: сюжетные повороты + эхо прошлого + дневник
// =========================================================================
// СЮЖЕТНЫЕ СЦЕНЫ ОТДЕЛЬНЫМИ ОКНАМИ: одна за другой, окно года — в конце
// =========================================================================
let storyQueue = [];        // [{ line, node }] — что показать в этом году
let storyQueueDone = [];    // уже закрытые сцены (для итога в окне года)
let storyQueueWaiting = 0;  // сколько ещё ждёт своего года

function isStoryModalOpen() {
  return $("story-modal") && $("story-modal").style.display === "flex";
}

// Открыть очередь сцен года. Если сцен нет — сразу окно итогов.
function startStorySequence(nodes) {
  storyQueue = (nodes || []).slice();
  storyQueueDone = [];
  storyQueueWaiting = (typeof countYearStoryWaiting === "function") ? countYearStoryWaiting(3) : 0;
  if (!storyQueue.length) { showYearSummary(); return; }
  renderStoryScene();
}

function renderStoryScene() {
  const el = $("story-modal");
  const box = $("story-choices");
  if (!el || !box) { showYearSummary(); return; }

  if (!storyQueue.length) {
    el.style.display = "none";
    showYearSummary();
    return;
  }

  const { line, node } = storyQueue[0];
  setText("story-icon", line.icon || "📜");
  setText("story-line-name", line.title || "Линия судьбы");
  setText("story-title", node.title);
  setText("story-text", node.text);

  const total = storyQueue.length + storyQueueDone.length;
  const idx = storyQueueDone.length + 1;

  let html = "";
  (node.choices || []).forEach((ch, i) => {
    const poor = ch.cost && player.coins < ch.cost;
    const cost = ch.cost ? `<span class="story-cost">${poor ? "Не хватает" : "Цена"}: ${ch.cost}🪙 (у вас ${fmtNum(player.coins)})</span>` : "";
    html += `<button class="story-choice" ${poor ? "disabled" : ""} data-story-choice="${i}">${esc(ch.text)}${cost}</button>`;
  });
  if (node.effect && !(node.choices || []).length) {
    html += `<button class="story-choice" data-story-choice="-1" style="background:#312e81;">✨ Принять</button>`;
  }
  if (!node.choices && !node.effect) {
    html += `<button class="story-choice" data-story-choice="-1" style="background:#312e81;">Продолжить</button>`;
  }
  // Кнопки, приходящие из текста сцены, тоже должны работать
  html = html.replace(/<button(?![^>]*data-story-choice)/g, '<button data-story-choice="-1"');
  box.innerHTML = html;
  if (!box._storyBound) {
    // Один обработчик на всю доску: кнопки меняются, обработчик остаётся
    box._storyBound = true;
    box.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const entry = storyQueue[0];
      const curNode = entry ? entry.node : null;
      if (!curNode) return;
      if (btn.closest("#story-foot")) return;
      const idx = btn.dataset.storyChoice !== undefined ? parseInt(btn.dataset.storyChoice, 10) : -1;
      resolveStoryScene(curNode, idx);
    });
  }

  const foot = $("story-foot");
  if (foot) {
    foot.innerHTML = `<span class="story-counter">${idx} из ${total}${storyQueueWaiting ? ` • ещё ${storyQueueWaiting} ждут` : ""}</span>` +
      `<button class="btn-secondary" onclick="deferStoryScene()">Позже</button>`;
  }

  el.style.display = "flex";
  syncTelegramBackButton();
}

// Решение принято: применяем последствия и переходим к следующей сцене
function resolveStoryScene(node, idx) {
  const entry = storyQueue[0];
  const line = entry ? entry.line : { id: "?" };
  const lineId = line.id;

  if (idx >= 0) {
    const ch = node.choices ? node.choices[idx] : null;
    if (ch && ch.cost && player.coins < ch.cost) return;
  }

  // Применяем выбор через общий движок (он же ставит флаги и отложенные последствия)
  const before = { coins: player.coins, hp: player.hp };
  let res = "";
  try {
    const r = chooseStoryNodeResult(lineId, node.id, idx);
    res = r || "Решение принято.";
  } catch (e) {
    console.warn("[BitTensei] Сцена:", e);
    res = "Сцена прошла стороной.";
  }

  storyQueue.shift();
  storyQueueDone.push({ title: node.title, line: line.title, text: res, icon: line.icon || "📜" });
  queueYearExtra(node.title, res, line.icon || "📜");

  if (player.hp <= 0) { $("story-modal").style.display = "none"; handleDeath("Пал жертвой роковых событий года"); return; }

  // Показываем итог выбора на секунду и идём дальше
  const box = $("story-choices");
  if (box) box.innerHTML = `<div class="story-result">${res}</div>`;
  const foot = $("story-foot");
  if (foot) foot.innerHTML = `<button class="btn-main" onclick="advanceStoryScene()">Дальше →</button>`;
  playSound("click");
  updateUI();
}

function advanceStoryScene() {
  playSound("click");
  if (storyQueue.length) renderStoryScene();
  else { $("story-modal").style.display = "none"; showYearSummary(); }
}

// «Позже» — сцена остаётся непройденной, год не переносится
function deferStoryScene() {
  playSound("click");
  $("story-modal").style.display = "none";
  storyQueue = [];
  showYearSummary();
}

// Закрытие окна сцены (кнопка «Назад» в Telegram или крестик).
// Год не должен «залипать»: если он ещё идёт — завершаем его окном итогов.
function closeStoryModal() {
  if ($("story-modal")) $("story-modal").style.display = "none";
  const wasInYear = yearFlowActive || storyQueue.length > 0 || storyQueueDone.length > 0;
  storyQueue = [];
  syncTelegramBackButton();
  if (wasInYear) {
    if (!yearFinalized) finalizeYear();
    showYearSummary();
  } else {
    // Год не идёт — просто закрываем окно, но не оставляем «залипших» флагов
    yearFlowActive = false;
  }
}

function showYearSummary() {
  yearFlowActive = false;
  yearFinalized = true;
  storyQueue = [];
  yearSummary = buildYearSummary();
  const box = $("year-summary-body");
  if (!box) return;

  // Сюжетные сцены больше не выводятся здесь: они показываются
  // отдельными окнами ДО окна года (startStorySequence). Здесь — только итог.
  let html = "";

  if (storyQueueDone.length) {
    html += `<div class="year-section-title">📜 Что решилось в этом году</div>`;
    storyQueueDone.forEach(d => {
      html += `<div class="year-twist">
        <div class="year-twist-title">${d.icon} ${esc(d.title)}</div>
        <div class="year-twist-text">${esc(d.text)}</div>
      </div>`;
    });
    if (storyQueueWaiting > 0) {
      html += `<div class="year-waiting">Ещё ${storyQueueWaiting} ${storyQueueWaiting === 1 ? "сцена ждёт" : "сцен ждут"} своего года — мир не стоит на месте.</div>`;
    }
  }

  const milestones = getAvailableStories();
  if (milestones.length) {
    html += `<div class="year-section-title">🏛️ Вехи эпохи</div>`;
    milestones.forEach(st => {
      html += `<div class="year-twist" style="border-color:rgba(56,189,248,0.45); background:rgba(56,189,248,0.06);">
        <div class="year-twist-title" style="color:#7dd3fc;">${esc(st.name)}</div>
        <div class="year-twist-text">${esc(st.desc)}</div>
        <button class="destiny-choice" style="margin-top:5px; background:#0e4a63;" onclick="performStoryActivity('${st.id}')">✨ Свершить</button>
      </div>`;
    });
  }

  if (yearExtras.length) {
    html += `<div class="year-section-title">⏳ Что случилось</div>`;
    html += yearExtras.map(e => `<div class="year-extra"><b>${e.icon} ${esc(e.title)}</b><div>${e.text}</div></div>`).join("");
  }

  html += `<div class="year-section-title">📖 Дневник года</div>`;
  html += (yearSummary && yearSummary.lines.length)
    ? yearSummary.lines.map(l => `<div style="margin:3px 0;">${l}</div>`).join("")
    : `<div style="color:var(--muted);">Год прошёл спокойно, без перемен.</div>`;
  if (yearSummary) {
    html += `<div style="margin-top:8px; color:var(--accent-light); font-size:11px;">${yearSummary.verdict}</div>`;
  }

  box.innerHTML = html;
  setText("year-summary-title", yearSummary
    ? `${yearSummary.year} г. К.Д. • ${yearSummary.age} ${pluralYears(yearSummary.age)}`
    : `${worldState.currentWorldYear} г. К.Д.`);
  if ($("year-summary-modal")) $("year-summary-modal").style.display = "flex";
  yearReportOpen = true;
  yearExtras = [];
  syncTelegramBackButton();
}

function closeYearSummary() {
  if ($("year-summary-modal")) $("year-summary-modal").style.display = "none";
  yearReportOpen = false;
  yearFlowActive = false;
  playSound("click");
  syncTelegramBackButton();
}

// Прожить ещё год прямо из окна итогов
function closeYearSummaryAndNext() {
  closeYearSummary();
  ageUp();
}

function ageUp() {
  if (!player) return;
  if (yearFlowActive) {
    // Защита от двойного клика — но не вечная блокировка:
    // если окно года давно закрыто, значит флаг завис, и его надо снять.
    const anyOpen = ["story-modal", "event-modal", "year-summary-modal", "battle-modal", "dungeon-modal"]
      .some(id => { const el = $(id); return el && el.style.display === "flex"; });
    if (anyOpen) return;
    yearFlowActive = false; yearFinalized = false;
  }
  yearFlowActive = true;
  yearFinalized = false;
  yearReportOpen = false;                  // окно прошлого года больше не открыто
  yearExtras = [];
  yearSnapshot = takeYearSnapshot();       // точка отсчёта для дневника года
  player.age++; worldState.currentWorldYear++;
  if (typeof tutorialCheck === "function") tutorialCheck("year");
  saveGame(); // страховка: год уже прожит, даже если игрок закроет приложение посреди события
  player.maxAp = getMaxAP(player.age); player.ap = player.maxAp; player.mana = player.maxMana;
  player.socialAp = getMaxSocialAp();   // новый год — новые разговоры
  player.oddJobsThisYear = 0;           // и одна новая подработка

  const seatObj = ESTATES.find(e => e.id === player.familySeat);
  const regen = (seatObj ? seatObj.hpRegen : 5) + (player.trait.id === "miko_healing" ? 25 : 0);
  player.hp = Math.min(player.maxHp, player.hp + regen);

  player.relations.forEach(npc => {
    if (!npc.isDead) {
      npc.age = (npc.age || 20) + 1;
      if (npc.race === "Человек" && npc.age > 68 && Math.random() < 0.12) {
        npc.isDead = true; npc.status = "Покойный(ая)";
        log(`🕯️ ${npc.name} скончался(ась) в возрасте ${npc.age} лет.`);
        queueYearExtra("Утрата", `${esc(npc.name)} скончался(ась) в возрасте ${npc.age} лет.`, "🕯️");
        // Вдовство: супруг ушёл, но не остался «занятым» навсегда.
        // Траур — год, потом можно снова связать жизнь с кем-то.
        if (player.spouse && player.spouse.id === npc.id) {
          player.widowed = { year: worldState.currentWorldYear, name: npc.name, since: player.age };
          player.spouse = null;
          player.mourningUntilYear = worldState.currentWorldYear + 1;
          queueYearExtra("Вдовство", `Вы остались без ${esc(npc.name)}. Траур — год, потом жизнь продолжится, если захотите.`, "🕯️");
        }
      }
    }
  });

  generateYearlyGuildQuests();

  if (player.estates.length) {
    // Доход зависит от того, что творится в землях и как к вам там относятся
    const stMult = currentRegionState(player.currentRegionKey).def.effect?.income || 1;
    const opBonus = 1 + Math.min(0.5, Math.max(-0.4, regionOpinion(player.currentRegionKey) / 200));
    const inc = player.estates.reduce((s, id) => s + (ESTATES.find(e => e.id === id)?.income || 0), 0);
    const adjusted = Math.round(inc * stMult * opBonus);
    player.coins += adjusted;
    // Содержание имущества: доход не бесплатный
    const upkeep = Math.floor(adjusted * BALANCE.upkeepPercent);
    if (upkeep > 0 && player.coins >= upkeep) {
      player.coins -= upkeep;
      log(`💰 Имения: +${adjusted}🪙 дохода, −${upkeep}🪙 содержания (итого +${adjusted - upkeep}🪙).`);
    } else if (upkeep > 0) {
      player.coins = 0;
      player.hp = Math.max(1, player.hp - BALANCE.hp.starvationDamage);
      log(`⚠️ На содержание имений не хватило ${upkeep}🪙: слуги разбегаются, замок ветшает (−${BALANCE.hp.starvationDamage} HP).`);
      queueYearExtra("Замок ветшает", `На содержание не хватило ${upkeep}🪙 — слуги разбежались, замок пострадал (−${BALANCE.hp.starvationDamage} HP).`, "⚠️");
    }
  }
  if (player.currentJob) {
    const sal = getJobDataById(player.currentJob)?.ranks[player.jobRankIndex]?.salary || 0;
    if (sal) { player.coins += sal; log(`💼 Жалование: +${sal}🪙.`); }
  }
  if (player.currentUndergroundJob) {
    const ur = UNDERGROUND_JOBS[player.currentRegionKey]?.ranks[player.undergroundRankIndex];
    if (ur) {
      if (Math.random() < ur.risk) {
        const fine = Math.min(player.coins, ur.salary * 2);
        player.coins -= fine; player.hp = Math.max(10, player.hp - 25);
        log(`🚨 <b>ОБЛАВА!</b> Откуп: -${fine}🪙, -25 HP.`); playSound("death");
        queueYearExtra("Облава", `Подполье накрыли: откуп ${fine}🪙 и −25 HP.`, "🚨");
      } else { player.coins += ur.salary; log(`🗡️ Доля подполья: +${ur.salary}🪙.`); }
    }
  }
  if (player.castleUpgrades.includes("alchemy_lab")) { player.potionsCount += 2; log(`🧪 Оранжерея сварила +2 зелья.`); }

  // Плоды трона на Монументе Семи Сил
  applySevenPowerSeatYearly();
  // Союзы с ветвями Грейрат приносят своё каждый год
  applyGreyratAllianceYearly();
  // Живой мир: состояния регионов меняются, вестник пишет новости года
  advanceWorldStates();
  // Прозвища: род и мир решают, как вас называть
  checkTitles();
  // Дети: растут, показывают характер, просят
  advanceChildrenYear();
  (player.children || []).forEach(c => {
    if (c.isDead) return;
    const note = childYearNote(c, childAge(c));
    if (note) queueYearExtra(note.title, note.text, note.icon);
  });

  if (player.pregnancy) {
    const isM = Math.random() > 0.5, list = SYLLABLES[isM ? "male" : "female"];
    let childRace = player.race;
    if (player.pregnancy.partnerRace && player.pregnancy.partnerRace !== player.race) {
      if (player.race.includes("Эльф") || player.pregnancy.partnerRace.includes("Эльф")) childRace = "Эльф / Полуэльф";
      else if (player.race === "Демон" || player.pregnancy.partnerRace === "Демон") childRace = "Демон";
    }
    const trait = rollChildTrait();
    const child = {
      id: "child_" + Date.now(), name: `${list[Math.floor(Math.random() * list.length)]} ${player.surname}`,
      gender: isM ? "male" : "female", race: childRace, age: 0, birthYear: worldState.currentWorldYear,
      cp: 450, role: "Наследник рода",
      relation: 100, status: "Семья", isFamily: true, isChild: true, isDead: false,
      traitId: trait.id, memory: 0, requestDone: 0, askedAges: []
    };
    player.children.push(child); player.relations.push(child);
    if (!player.appointedHeirId) player.appointedHeirId = child.id;
    log(`🎉 Родился ребёнок — <b>${child.name}</b> (${childRace})!`); playSound("win"); player.pregnancy = null;
    queueYearExtra("Пополнение в роду", `Родился(ась) <b>${esc(child.name)}</b> (${esc(childRace)}). Уже видно: ${trait.icon} ${esc(trait.name.toLowerCase())} характер.`, "🎉");
  }

  if (worldState.currentWorldYear === CALAMITY_YEAR && !worldState.calamityOccurred) {
    performStoryActivity("s1_calamity"); return;
  }

  // Событие века: раз в несколько десятилетий мир переворачивается целиком
  const centuryEv = nextCenturyEvent();
  if (centuryEv && triggerCenturyEvent(centuryEv)) return;

  const canon = trySpawnCanonNpc(false);
  if (canon) {
    log(`⭐ На пути вам повстречался канонический герой: <b>${canon.name}</b>!`);
    queueYearExtra("Встреча", `На пути вам повстречался <b>${esc(canon.name)}</b> (${esc(canon.role)}).`, "⭐");
  }

  if (player.currentPowersSeat && Math.random() < 0.14) {
    const seat = player.currentPowersSeat, myCp = calcCombatPower(player), chCp = Math.floor(myCp * (0.8 + Math.random() * 0.4));
    triggerRandomEvent({
      icon: "⚔️", title: `Вызов Владыке #${seat} Семи Сил!`,
      desc: `Претендент (БМ ${chCp.toLocaleString()}) требует ваш трон на Монументе!`,
      choices: [
        { text: "Защитить титул в бою!", action: (p) => {
          if (myCp >= chCp) { p.swordGodExp += 35; p.squadFame += 50; return "Вы разгромили претендента и защитили титул (+35 Мечу, +50 Славы)!"; }
          vacatePowerSeatToWorld(p, "уступил трон в дуэли"); p.currentPowersSeat = null; p.hp = Math.max(15, p.hp - 50);
          return "Вы проиграли дуэль и потеряли место в Семи Силах (-50 HP)!";
        }},
        { text: "Уступить титул без боя", action: (p) => { vacatePowerSeatToWorld(p, "добровольно сложил полномочия"); p.currentPowersSeat = null; return "Вы уступили ранг претенденту."; } }
      ]
    });
    return;
  }

  if (player.age > player.maxAge - BALANCE.hp.oldAgeYears && player.trait.id !== "god_mode") {
    const span = BALANCE.hp.newAgeDecayMax - BALANCE.hp.newAgeDecayMin;
    const decayBase = BALANCE.hp.newAgeDecayMin + Math.floor(Math.random() * (span + 1));
    const decay = Math.max(1, Math.round(decayBase * currentDifficulty().decayMult));
    player.hp -= decay; log(`Старость даёт о себе знать (-${decay} HP).`);
  }
  if (player.hp <= 0 || player.age >= player.maxAge) {
    handleDeath(player.hp <= 0 ? "Смерть от ран и истощения сил" : "Мирная кончина от старости");
    return;
  }

  // Многоступенчатые Сны Хитогами
  if (player.hitogamiTrust >= 30 && !player.hitogamiPricePaid && player.age >= 18 && Math.random() < 0.45) {
    player.hitogamiPricePaid = true;
    const priceEv = RANDOM_EVENTS.find(e => e.id === "hitogami_dream_price");
    if (priceEv) { triggerRandomEvent(priceEv); return; }
  }

  // Страховка: если окно пути закрыли, ребёнок всё равно выберет дорогу сам
  if (player.children) {
    player.children.forEach(c => {
      if (c.isDead || !c.isChild) return;
      if (childAge(c) < 18) return;
      if (c.path && c.path !== "pending") return;
      c.pathWaitYears = (c.pathWaitYears || 0) + 1;
      if (c.pathWaitYears > 1) {
        const fallback = { stubborn: "sword", kind: "home", cruel: "road", dreamer: "magic", tactician: "court", quiet: "craft" }[c.traitId] || "home";
        const p2 = CHILD_PATHS.find(x => x.id === fallback);
        c.path = fallback; c.pathName = p2 ? p2.name : "Свой путь"; c.pathIcon = p2 ? p2.icon : "🌱";
        c.cp = (c.cp || 400) + (p2 ? p2.cp : 100);
        log(`🌱 ${c.name} сам(а) выбрал(а) путь: ${c.pathName}.`);
      }
    });
  }

  // Взрослые дети живут своей жизнью: приходят за деньгами, женятся, попадают в беду
  if (typeof advanceGrownChildren === "function") {
    const grownEv = advanceGrownChildren();
    if (grownEv && !yearFinalized) {
      setTimeout(() => showGrownChildEvent(grownEv.child.id, grownEv.ev.id), 80);
      return;
    }
  }

  if (typeof maybeInheritedBurden === "function" && maybeInheritedBurden()) return;

  if (typeof maybeMoralEcho === "function" && maybeMoralEcho()) return;

  const evPool = RANDOM_EVENTS.filter(e => {
    if (e.id === "hitogami_dream_price" || player.age < e.minAge) return false;
    if (e.id === "hitogami_dream_tempt" && player.dynastyFaction === "orsted") return false;
    const ch = (e.id === "hitogami_dream_tempt" && player.dynastyFaction === "hitogami") ? 0.35 : e.chance;
    return Math.random() < ch;
  });
  if (evPool.length && Math.random() < 0.52) {
    triggerRandomEvent(evPool[Math.floor(Math.random() * evPool.length)]);
    return;
  }

  log(player.age <= 3 ? "Безмятежное детство в кругу семьи (+10 HP)." : "Год прошёл в трудах и тренировках.");
  if (player.age <= 3) player.hp = Math.min(player.maxHp, player.hp + 10);

  // Пассивный рост: годы сами по себе учат героя, иначе первое поколение упирается в потолок.
  // Восстановление стоит после увядания — иначе отдых за год «съедал» эффект старости.
  finalizeYear();
  playSound("year");
  updateUI();
  // Сначала — сюжетные сцены отдельными окнами, окно года идёт последним
  startStorySequence(typeof pickYearStoryNodes === "function" ? pickYearStoryNodes(3) : getAvailableStoryNodes());
}

// Небольшой рост за прожитый год
function applyYearlyGrowth() {
  const g = BALANCE.growth;
  const perExp = Math.round((player.age < 16 ? g.expPerYearUntilAdult : g.expPerYearAfterAdult) * currentDifficulty().xpMult);
  if (perExp > 0) {
    player.magicExp += perExp;
    player.swordGodExp += perExp;
    player.waterGodExp += perExp;
    player.northGodExp += perExp;
  }
  player.intellect += g.intellectPerYear;
  // В старости восстановление слабее, но не исчезает: иначе старость
  // превращается в ожидание смерти, а не в часть игры.
  const isOld = player.age > player.maxAge - BALANCE.hp.oldAgeYears;
  const naturalHeal = isOld ? Math.round(g.freeRestHeal * 0.4) : g.freeRestHeal;
  if (naturalHeal > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + naturalHeal);
  }
  if (g.freeManaRestore) player.mana = player.maxMana;
}

function triggerRandomEvent(ev) {
  setText("event-icon", ev.icon || "⚡");
  setText("event-title", ev.title);
  setText("event-desc", ev.desc);
  const cBox = $("event-choices"); if (!cBox) return;
  cBox.innerHTML = "";
  ev.choices.forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "event-choice-btn"; btn.innerText = ch.text;
    btn.onclick = () => {
      const out = ch.action(player);
      if ($("event-modal")) $("event-modal").style.display = "none";
      log(`<b>[Выбор]</b> ${out}`); playSound("click");
      updateUI();
      if (yearFlowActive || yearReportOpen) {
        queueYearExtra(ev.title, out, ev.icon || "⚡");
        finalizeYear();
        startStorySequence(typeof pickYearStoryNodes === "function" ? pickYearStoryNodes(3) : getAvailableStoryNodes());
      }
      else showActionModal("Итог", out, ev.icon || "⚡");
      if (player.hp <= 0) handleDeath("Пал жертвой роковых событий года");
    };
    cBox.appendChild(btn);
  });
  if ($("event-modal")) $("event-modal").style.display = "flex";
}

// =========================================================================
// СМЕРТЬ, НАСЛЕДОВАНИЕ, ПЕРЕРОЖДЕНИЕ И СБРОС МИРА
// =========================================================================
function handleDeath(reason) {
  yearFlowActive = false;
  yearExtras = [];
  if ($("year-summary-modal")) $("year-summary-modal").style.display = "none";
  playSound("death");
  const finalTitle = TITLES.find(t => t.id === player.epithetId);
  worldState.dynastyHistory.push({
    gen: player.generation, name: player.name, gender: player.gender, race: player.race,
    peakCp: calcCombatPower(player), maxAge: player.age, deathReason: reason, powersSeat: player.currentPowersSeat,
    epithet: finalTitle ? finalTitle.name : null, epithetIcon: finalTitle ? finalTitle.icon : null,
    titles: (player.titles || []).slice()
  });

  if (typeof recordDeathLegacy === "function") recordDeathLegacy(reason);

  // Архив смерти: последняя жизнь героя сохраняется отдельно,
  // чтобы её можно было пережить заново или показать в дневнике рода
  try {
    localStorage.setItem(slotKey(activeSlot()) + "_deatharchive", JSON.stringify({
      name: player.name, age: player.age, years: player.age, gen: dynastyGeneration,
      reason, cp: calcCombatPower(player), year: worldState.currentWorldYear,
      titles: (player.titles || []).slice()
    }));
  } catch {}

  setText("death-reason", `${reason} в возрасте ${player.age} лет.`);
  if ($("death-summary")) $("death-summary").innerHTML = `
    <div>🎖️ <b>${esc(heroFullName(player))}</b> (${player.race}) • Прожито: <b>${player.age} л.</b></div>
    ${(player.titles || []).length ? `<div style="font-size:11px; color:#c4b5fd;">🏷️ ${player.titles.map(id => { const t = TITLES.find(x => x.id === id); return t ? t.icon + " " + esc(t.name) : ""; }).filter(Boolean).join(" • ")}</div>` : ""}
    <div>⚡ Пиковая БМ: <b>${calcCombatPower(player).toLocaleString()}</b> • Золото: <b>${player.coins.toLocaleString()}🪙</b></div>
    ${player.currentPowersSeat ? `<div style="color:var(--gold);">🏆 Титул #${player.currentPowersSeat} Семи Сил (наследуется преемником!)</div>` : ""}`;

  const hList = $("heirs-list"), hBlock = $("heir-selection-block");
  const children = player.children.filter(c => !c.isDead);
  if (hList && hBlock) {
    if (children.length) {
      hBlock.style.display = "block";
      hList.innerHTML = children.map(c => {
        const age = Math.max(1, worldState.currentWorldYear - (c.birthYear || worldState.currentWorldYear - 20));
        const app = player.appointedHeirId === c.id;
        return `<div class="shop-item"><div><b>${esc(c.name)}</b> ${app ? '<span class="badge-legendary">Завещание 👑</span>' : ""}
          <div style="font-size:11px; color:var(--muted);">${c.gender === "male" ? "Сын" : "Дочь"} • ${c.race || player.race} • ${age} л.</div>
          ${(() => { const inf = childInheritanceSummary(c); return inf.text ? `<div style="font-size:10.5px; color:#cbd5e1; margin-top:3px; line-height:1.4;">${esc(inf.text)}</div>` : ""; })()}</div>
          <button style="background:#10b981;" onclick="continueAsHeir('${c.id}', ${age})">Играть 👑</button></div>`;
      }).join("");
    } else {
      hBlock.style.display = "none";
      if (player.currentPowersSeat) vacatePowerSeatToWorld(player, "умер без наследников");
    }
  }
  saveGameNow();
  if ($("death-overlay")) $("death-overlay").style.display = "flex";
}


/* ══════════════════════════════════════════════════════════
   СМЕРТЬ С ПОСЛЕДСТВИЯМИ
   Раньше смерть была экраном и наследником. Теперь остаются
   долги, недосказанное и люди, которые придут к детям
   с тем, что вы не успели закрыть.
   ══════════════════════════════════════════════════════════ */

const INHERITED_BURDENS = [
  { id: "ib_debt", icon: "💰", title: "Долг покойного",
    text: (prev) => `К вам пришли двое с бумагой. На ней почерк вашего ${prev}а.\n\n— Он занял у нас триста. Срок вышел.\n\nБумага настоящая. Вы это видите.`,
    choices: [
      { text: "Заплатить 300🪙", coins: -300, rep: 10, result: "Вы заплатили. Один из них снял шляпу — этого не делают с должниками." },
      { text: "Отказаться: это не мой долг", rep: -12, result: "Они ушли. Через год ваш дом обнесли, и все знали, кто это сделал." },
      { text: "Предложить отработать", hp: -20, rep: 6, result: "Вы работали на них месяц. Долг закрыт потом и кровью — буквально." }
    ] },
  { id: "ib_enemy", icon: "🗡️", title: "Враг, который ждал",
    text: () => `Он ждал смерти вашего предка двадцать лет и дождался.\n\n— Теперь ты за него.\n\nОн не нападает. Он просто стоит и смотрит, давая вам выбор.`,
    choices: [
      { text: "Драться", hp: -45, rep: 15, cp: 200, result: "Вы выстояли. Теперь он уважает род — и это дороже денег." },
      { text: "Попросить прощения за него", rep: 8, result: "Он долго молчал. Потом ушёл. Месть ему больше не нужна." },
      { text: "Заплатить отступные (200🪙)", coins: -200, rep: -5, result: "Он взял деньги. Вражда закончилась там, где началась." }
    ] },
  { id: "ib_promise", icon: "📜", title: "Невыполненное обещание",
    text: () => `В бумагах предка — письмо, которое он не отправил.\n\nВ нём обещание: вернуть землю, которую забрали. Адресат ещё жив.`,
    choices: [
      { text: "Выполнить обещание", coins: -250, rep: 20, influence: 15, result: "Земля вернулась к тем, кому была обещана. Вас запомнят не за то, что вы взяли, а за то, что отдали." },
      { text: "Сжечь письмо", rep: -8, result: "Бумага горела быстро. Вы смотрели в огонь и думали, что так проще." },
      { text: "Найти потомков и объяснить", rep: 10, intellect: 10, result: "Они поняли. Не простили, но поняли — и это оказалось важнее." }
    ] },
  { id: "ib_orphan", icon: "👶", title: "Ребёнок, о котором не знали",
    text: () => `Женщина привела мальчика лет семи и сказала, что он — крови вашего предка.\n\nОна не просит денег. Она просит, чтобы его научили держать меч.`,
    choices: [
      { text: "Взять в дом", rep: 12, family: true, result: "Он остался. Через десять лет он называл вас братом и не помнил другой жизни." },
      { text: "Дать денег и отпустить (150🪙)", coins: -150, rep: 4, result: "Они уехали. Мальчик оглянулся один раз." },
      { text: "Отказать", rep: -15, result: "Она ушла молча. Вы долго не могли уснуть." }
    ] }
];

// При смерти записываем «наследство» — что осталось нерешённым
function recordDeathLegacy(reason) {
  player.deathLegacy = {
    reason,
    debts: (player.coins || 0) < 0 ? Math.abs(player.coins) : 0,
    unpaidTitles: (player.titles || []).length,
    hasBurdens: true,
    year: worldState.currentWorldYear,
    unresolved: []
  };
  // Если игрок кому-то не заплатил или кого-то бросил — это вернётся
  const abandoned = player.relations.filter(r => !r.isDead && (r.relation || 0) < 20).map(r => r.name);
  if (abandoned.length) player.deathLegacy.unresolved.push(...abandoned.slice(0, 2));
}

// Наследник разгребает это в первые годы своей жизни
function maybeInheritedBurden() {
  if (!player.inheritedFrom) return false;
  if (player.inheritedBurdenDone) return false;
  if (worldState.currentWorldYear - (player.inheritedFrom.year || 0) < 3) return false;
  if (Math.random() > 0.3) return false;

  const b = INHERITED_BURDENS[Math.floor(Math.random() * INHERITED_BURDENS.length)];
  player.inheritedBurdenDone = true;
  const text = typeof b.text === "function" ? b.text(player.inheritedFrom.name || "предка") : b.text;
  const html = `<div style="text-align:left;">
    <div style="margin:8px 0; line-height:1.55; white-space:pre-line;">${esc(text)}</div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${b.choices.map((ch, i) => `<button onclick="resolveInheritedBurden('${b.id}',${i})" style="background:#7c2d12; text-align:left; padding:9px;">
        ${esc(ch.text)}
      </button>`).join("")}
    </div>
  </div>`;
  showActionModal(`${b.icon} ${b.title}`, html, b.icon);
  return true;
}

function resolveInheritedBurden(bid, idx) {
  const b = INHERITED_BURDENS.find(x => x.id === bid);
  if (!b) return;
  const ch = b.choices[idx];
  if (ch.coins && ch.coins < 0 && player.coins < -ch.coins) {
    closeActionModal();
    return showActionModal("Нет золота", `Нужно ${-ch.coins}🪙.`, "🪙");
  }
  if (ch.coins) player.coins = Math.max(0, player.coins + ch.coins);
  if (ch.hp) player.hp = Math.max(1, Math.min(player.maxHp, player.hp + ch.hp));
  if (ch.rep) player.reputation = Math.max(-100, Math.min(200, (player.reputation || 0) + ch.rep));
  if (ch.cp) player.swordGodExp += ch.cp;
  if (ch.intellect) player.intellect += ch.intellect;
  if (ch.influence) player.asuraInfluence = (player.asuraInfluence || 0) + ch.influence;
  if (ch.family) {
    player.children = player.children || [];
    player.children.push({ id: "orphan_" + Date.now(), name: "Найдёныш", gender: "male", race: player.race,
      birthYear: worldState.currentWorldYear - 7, relation: 60, cp: 300, isChild: true, isFamily: true,
      traitId: "kind", askedAges: [], grownEvents: [] });
  }
  closeActionModal();
  log(`📜 <b>Долг предка:</b> ${esc(ch.result)}`);
  queueYearExtra("Наследство предка", ch.result, b.icon);
  showActionModal(b.title, ch.result, b.icon);
  updateUI();
}

function continueAsHeir(childId, realAge) {
  const prev = player;
  const child = prev.children.find(c => c.id === childId); if (!child) return;
  dynastyGeneration++;

  const isApp = prev.appointedHeirId === childId;
  const inheritedCoins = isApp ? prev.coins : Math.floor(prev.coins * 0.7);
  const raceObj = Object.values(RACES).find(r => r.name === (child.race || prev.race)) || RACES.human;
  const hasYard = prev.castleUpgrades.includes("training_yard"), hasSharia = prev.estates.includes("sharia_castle"), hasPalace = prev.estates.includes("asura_palace");

  const originMock = {
    name: `Династия ${prev.surname}`,
    manaBonus: Math.floor(prev.maxMana * 0.25) + (hasSharia ? 15 : 0),
    swordGod: Math.floor(prev.swordGodExp * 0.25) + (hasYard ? 25 : 0) + (hasPalace ? 25 : 0),
    waterGod: hasPalace ? 25 : 0, northGod: hasPalace ? 25 : 0,
    coins: inheritedCoins, int: 12,
    log: `Вы продолжили род ${prev.surname}. ${isApp ? "Получено 100% казны!" : "Получено 70% казны."}`
  };

  const familyRels = [{ id: "prev_parent", name: prev.name, gender: prev.gender, race: prev.race, age: prev.age, role: "Предок-правитель", cp: calcCombatPower(prev), relation: 100, status: "Покойный(ая)", isFamily: true, isDead: true }];
  if (prev.spouse && !prev.spouse.isDead) familyRels.push({ ...prev.spouse, role: "Родитель", status: "Семья", isFamily: true });
  prev.children.filter(c => c.id !== childId && !c.isDead).forEach(sib => {
    familyRels.push({ ...sib, age: Math.max(1, worldState.currentWorldYear - (sib.birthYear || worldState.currentWorldYear - 15)), role: sib.gender === "male" ? "Брат" : "Сестра", isChild: false });
  });

  if ($("death-overlay")) $("death-overlay").style.display = "none";
  const heirFirstName = String(child.name).replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim().split(" ")[0] || "Наследник";
  initCharacter(heirFirstName, prev.surname, child.gender, raceObj, prev.currentRegionKey, originMock, prev.trait, prev.familyStatus, realAge, familyRels);
  // Наследство и долги предка переходят вместе с именем
  player.inheritedFrom = { name: prev.firstName || "Предок", year: worldState.currentWorldYear, titles: (prev.titles || []).slice(), cp: calcCombatPower(prev) };
  player.inheritedBurdenDone = false;
  if (prev.deathLegacy) player.deathLegacyOf = prev.deathLegacy;

  // Характер и воспитание переходят в наследника — это его стартовый капитал
  const inherit = childInheritanceSummary(child);
  if (inherit.bonus) {
    Object.entries(inherit.bonus).forEach(([k, v]) => {
      if (typeof player[k] === "number") player[k] = Math.max(0, player[k] + v);
    });
  }
  if (typeof ensureSocialAp === "function") ensureSocialAp();
  player.upbringing = {
    from: prev.name,
    trait: childTraitById(child.traitId)?.name || "неизвестный",
    relationToParent: child.relation || 0,
    memory: child.memory || 0,
    summary: inherit.text
  };
  log(`👶 Воспитание сказалось: ${esc(inherit.text)}`);
  if (typeof queueYearExtra === "function" && yearExtras) queueYearExtra("Что вам передали", inherit.text || "Ровное детство без крайностей.", "🎓");

  player.estates = [...prev.estates];
  player.familySeat = prev.familySeat;
  player.castleUpgrades = [...prev.castleUpgrades];
  player.nobilityTitle = prev.nobilityTitle;
  player.asuraFaction = prev.asuraFaction;
  player.languages = [...prev.languages];
  player.dynastyFaction = prev.dynastyFaction;
  player.factionProgress = prev.factionProgress;
  player.hitogamiTrust = prev.hitogamiTrust;
  player.tabletsDeciphered = [...prev.tabletsDeciphered];
  player.perugiusTrials = [...prev.perugiusTrials];
  player.greyratAllies = [...prev.greyratAllies];
  player.discoveredSevenPowers = [...prev.discoveredSevenPowers];

  if (prev.currentPowersSeat) {
    player.currentPowersSeat = prev.currentPowersSeat;
    const pow = worldState.sevenPowers.find(p => p.rank === prev.currentPowersSeat);
    if (pow) { pow.name = player.name; pow.holderType = "player"; pow.cp = calcCombatPower(player); }
    log(`🏆 По праву крови вы унаследовали титул <b>#${player.currentPowersSeat} Семи Великих Сил</b>!`);
  }

  if (prev.heirloomSlot && prev.equipment[prev.heirloomSlot]) {
    const relic = { ...prev.equipment[prev.heirloomSlot] };
    player.equipment[prev.heirloomSlot] = relic;
    if (relic.hp) { player.maxHp += relic.hp; player.hp += relic.hp; player.maxHpBonus = (player.maxHpBonus || 0) + relic.hp; }
    log(`✨ Вы унаследовали Фамильную Реликвию: <b>${relic.name}${relic.forgeLevel ? ` [+${relic.forgeLevel}]` : ""}</b>!`);
  }

  updateUI();
  saveGameNow(); // важная точка: новое поколение уже должно быть на диске
}

function reincarnateNewSoul() {
  if (player?.currentPowersSeat) vacatePowerSeatToWorld(player, "переродился в новой душе");
  const karma = addReincarnationKarma();
  if ($("death-overlay")) $("death-overlay").style.display = "none";
  dynastyGeneration = 1; player = null;
  saveGameNow();
  showActionModal("Колесо Сансары", `Время мира продолжается (сейчас <b>${worldState.currentWorldYear} г. К.Д.</b>)! Накоплена Карма ур. ${karma}.`, "🔄");
  showCreation();
}

function askNewSoul() {
  askConfirm("Новая душа (время идёт дальше)", `Текущий герой оставит мир в <b>${worldState.currentWorldYear} г. К.Д.</b>, а вы воплотитесь новым персонажем с +1 Кармой. Продолжить?`, reincarnateNewSoul);
}

function askFullWorldReset() {
  askConfirm("Сброс мира к 407 году", "Вы начнёте самую первую жизнь заново в <b>407 г. К.Д.</b>! Все 7 Великих Сил вернутся на свои места, история мира очистится. Продолжить?", fullWorldReset);
}

function fullWorldReset() {
  worldState = { currentWorldYear: START_YEAR, calamityOccurred: false, sevenPowers: cloneDefaultPowers(), teleportNodes: [], chronicles: [], dynastyHistory: [] };
  dynastyGeneration = 1; player = null;
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_BACKUP_KEY); } catch (e) { console.warn("[BitTensei] Сброс мира:", e); }
  if ($("death-overlay")) $("death-overlay").style.display = "none";
  showActionModal("Чистый лист", "Мир возвращён к 407 г. К.Д. Все Семь Великих Сил вновь на своих тронах!", "🌅");
  showCreation();
}

// =========================================================================
// СОХРАНЕНИЯ (LOCALSTORAGE + TELEGRAM CLOUD + ЭКСПОРТ/ИМПОРТ КОДОМ)
// =========================================================================
function generateYearlyGuildQuests() {
  const pIdx = ADVENTURER_RANKS.indexOf(player.guildRank);
  const pool = ALL_GUILD_QUESTS.filter(q => ADVENTURER_RANKS.indexOf(q.rank) <= pIdx + 1);
  player.guildQuestsThisYear = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
}

// Ключ сохранения теперь зависит от выбранного слота (1–3).
// Старое одиночное сохранение автоматически становится слотом 1.
const SAVE_KEY_LEGACY = "bit_tensei_save";
var SAVE_KEY = "bit_tensei_save_s1";
const SAVE_BACKUP_KEY_LEGACY = "bit_tensei_save_backup";
var SAVE_BACKUP_KEY = "bit_tensei_save_s1_backup";

function syncSaveKeys() {
  const n = typeof activeSlot === "function" ? activeSlot() : 1;
  SAVE_KEY = slotKey(n);
  SAVE_BACKUP_KEY = slotBackupKey(n);
}

// Первый запуск новой версии: старое сохранение переезжает в слот 1
function migrateLegacySave() {
  try {
    const legacy = localStorage.getItem(SAVE_KEY_LEGACY);
    if (!legacy) return false;
    if (localStorage.getItem(SAVE_SLOT_KEYS[1])) return false;
    localStorage.setItem(SAVE_SLOT_KEYS[1], legacy);
    const lb = localStorage.getItem(SAVE_BACKUP_KEY_LEGACY);
    if (lb) localStorage.setItem(SAVE_SLOT_KEYS[1] + "_backup", lb);
    setActiveSlot(1);
    console.log("[BitTensei] Старое сохранение перенесено в слот 1.");
    return true;
  } catch { return false; }
}

function buildSavePayload() {
  return JSON.stringify({
    version: 2,
    savedAt: Date.now(),
    player,
    dynastyGeneration,
    worldState,
    logHistory: (logHistory || []).slice(-MAX_LOG)
  });
}

// Немедленная запись на диск (используется на важных точках: смерть, наследование, скрытие вкладки)
function saveGameNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    const json = buildSavePayload();
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev && prev !== json) localStorage.setItem(SAVE_BACKUP_KEY, prev);
    localStorage.setItem(SAVE_KEY, json);
  } catch (e) { console.warn("[BitTensei] Не удалось сохранить игру:", e); }
}

// Обычное сохранение: откладываем запись, чтобы не тормозить на каждом клике
function saveGame() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; saveGameNow(); }, 400);
}

// Приводим старые/битые сохранения к актуальной структуре
function normalizeLoadedData(data) {
  if (!data || typeof data !== "object") return false;

  const ws = data.worldState;
  if (!ws || typeof ws !== "object") return false;

  worldState = ws;
  worldState.currentWorldYear = Number(worldState.currentWorldYear) || START_YEAR;
  worldState.teleportNodes = Array.isArray(worldState.teleportNodes) ? worldState.teleportNodes : [];
  worldState.chronicles = Array.isArray(worldState.chronicles) ? worldState.chronicles : [];
  worldState.dynastyHistory = Array.isArray(worldState.dynastyHistory) ? worldState.dynastyHistory : [];
  if (!Array.isArray(worldState.sevenPowers) || !worldState.sevenPowers.length) {
    worldState.sevenPowers = cloneDefaultPowers();
  }
  worldState.calamityOccurred = !!worldState.calamityOccurred;

  dynastyGeneration = Number(data.dynastyGeneration) || 1;
  player = data.player || null;
  if (!player) return false;

  // Значения по умолчанию для полей, которых могло не быть в старых сейвах
  const arr = (v) => (Array.isArray(v) ? v : []);
  const defaults = {
    relations: [], squad: [], estates: [], castleUpgrades: [], injuries: [],
    languages: ["human"], tabletsDeciphered: [], perugiusTrials: [], greyratAllies: [],
    discoveredSevenPowers: [], canonQuestsDone: [], storyCompleted: [],
    inventory: [], children: [], graduatedSchools: [],
    equipment: { weapon: null, armor: null, accessory: null },
    demonEyes: { left: null, right: null },
    dungeonProgress: {}, guildQuestsThisYear: []
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (Array.isArray(v)) player[k] = arr(player[k]);
    else if (player[k] == null || typeof player[k] !== "object") player[k] = v;
  }
  // Запас разговоров: в старых сейвах его нет — выдаём полный на этот год
  if (typeof player.socialAp !== "number") player.socialAp = getMaxSocialAp();
  // Дети из старых сейвов получают характер задним числом
  if (typeof initChildTraits === "function") initChildTraits();
  if (!Array.isArray(player.titles)) player.titles = [];
  if (typeof player.visitedRegions !== "object" || player.visitedRegions === null) player.visitedRegions = {};
  if (!Array.isArray(worldState.centuryDone)) worldState.centuryDone = [];
  // Старый сейв с умершим супругом: место освобождаем, траур уже прошёл
  if (player.spouse && player.spouse.isDead) {
    player.widowed = player.widowed || { year: worldState.currentWorldYear - 2, name: player.spouse.name, since: 0 };
    player.spouse = null;
    if (!player.mourningUntilYear || player.mourningUntilYear > worldState.currentWorldYear) {
      player.mourningUntilYear = worldState.currentWorldYear;
    }
  }
  // Объект экипировки мог частично потеряться
  if (typeof player.equipment !== "object" || player.equipment === null) {
    player.equipment = { weapon: null, armor: null, accessory: null };
  } else {
    ["weapon", "armor", "accessory"].forEach(slot => {
      if (!(slot in player.equipment)) player.equipment[slot] = null;
    });
  }
  if (typeof player.demonEyes !== "object" || player.demonEyes === null) {
    player.demonEyes = { left: null, right: null };
  }

  const num = { age: 0, hp: 100, maxHp: 100, mana: 30, maxMana: 30, coins: 0, ap: 6, maxAp: 8,
                magicExp: 0, swordGodExp: 0, waterGodExp: 0, northGodExp: 0, intellect: 10,
                reputation: 0, guildExp: 0, squadFame: 0, potionsCount: 0, asuraInfluence: 0,
                factionProgress: 0, hitogamiTrust: 0, generation: dynastyGeneration, maxAge: 80,
                jobRankIndex: 0, undergroundRankIndex: 0, schoolProgress: 0, lastCryptMeditationAge: -10 };
  for (const [k, v] of Object.entries(num)) {
    const parsed = Number(player[k]);
    player[k] = Number.isFinite(parsed) ? parsed : v;
  }
  if (!player.name) player.name = `Безымянный ${dynastyGeneration}`;
  if (!player.firstName) player.firstName = String(player.name).split(" ")[0];
  if (!player.gender) player.gender = "male";
  if (!player.race) player.race = "Человек";
  if (!player.currentRegionKey || !REGIONS[player.currentRegionKey]) player.currentRegionKey = player.regionKey || "asura";
  if (!REGIONS[player.currentRegionKey]) player.currentRegionKey = "asura";
  if (!player.familyStatus || typeof player.familyStatus !== "object") {
    player.familyStatus = { id: "unknown", name: "Безымянная семья" };
  }
  if (!player.trait || typeof player.trait !== "object" || !player.trait.id) {
    player.trait = { id: "healthy", name: "Стальное здоровье", rarity: "common" };
  }
  if (!player.guildRank || !ADVENTURER_RANKS.includes(player.guildRank)) player.guildRank = "F";
  player.maxHpBonus = Math.max(0, Number(player.maxHpBonus) || 0);
  if (!player.story || typeof player.story !== "object") player.story = {};
  player.story.flags = (player.story.flags && typeof player.story.flags === "object") ? player.story.flags : {};
  player.story.done = Array.isArray(player.story.done) ? player.story.done : [];
  player.story.pending = Array.isArray(player.story.pending) ? player.story.pending.filter(c => c && typeof c.atYear === "number") : [];
  player.story.lineDone = Array.isArray(player.story.lineDone) ? player.story.lineDone : [];
  player.birthYearBonus = !!player.birthYearBonus;
  if (!player.nobilityTitle) player.nobilityTitle = "citizen";
  player.maxHp = Math.max(20, player.maxHp);
  player.maxMana = Math.max(1, player.maxMana);
  player.hp = Math.min(player.maxHp, Math.max(1, player.hp));
  player.mana = Math.min(player.maxMana, player.mana);
  player.maxAp = Math.max(1, Number(player.maxAp) || getMaxAP(player.age));
  player.ap = Math.min(player.maxAp, Math.max(0, player.ap));

  logHistory = arr(data.logHistory);
  if (!logHistory.length && typeof data.logsHtml === "string") {
    logHistory = [{ age: player.age, year: worldState.currentWorldYear, text: "Летопись восстановлена из прежнего сохранения." }];
  }
  return true;
}

function applyLoadedData(data) {
  if (!normalizeLoadedData(data)) return false;
  selectedMapRegion = player.currentRegionKey || "asura";
  ensureStoryState();
  ensureSevenPowersLore();
  ensureWorldState();
  if ($("creation-overlay")) $("creation-overlay").style.display = "none";
  if ($("death-overlay")) $("death-overlay").style.display = "none";
  renderLogHistory();
  try {
    renderUI();
  } catch (e) {
    console.error("[BitTensei] Ошибка отрисовки загруженного героя:", e);
    return false;
  }
  return true;
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    try {
      if (applyLoadedData(JSON.parse(raw))) return true;
      console.warn("[BitTensei] Сохранение повреждено — пробуем запасную копию.");
    } catch (e) {
      console.warn("[BitTensei] Сохранение повреждено — пробуем запасную копию.", e);
    }
  }
  const backup = localStorage.getItem(SAVE_BACKUP_KEY);
  if (backup) {
    try {
      if (applyLoadedData(JSON.parse(backup))) {
        log("⚠️ Основное сохранение было повреждено — загружена запасная копия.");
        return true;
      }
    } catch (e) {
      console.warn("[BitTensei] Запасная копия тоже повреждена.", e);
    }
  }
  return false;
}


/* ══════════════════════════════════════════════════════════
   ТРИ СЛОТА СОХРАНЕНИЙ
   Раньше было одно сохранение: сломалось — и весь род пропал.
   Теперь три независимых слота и автосейв смерти.
   ══════════════════════════════════════════════════════════ */

const SAVE_SLOTS = [1, 2, 3];
const SAVE_SLOT_KEYS = { 1: "bit_tensei_save_s1", 2: "bit_tensei_save_s2", 3: "bit_tensei_save_s3" };
const SAVE_SLOT_META = "bit_tensei_slots_meta";

function activeSlot() {
  const s = Number(localStorage.getItem("bit_tensei_active_slot") || 1);
  return SAVE_SLOTS.includes(s) ? s : 1;
}
function setActiveSlot(n) {
  if (!SAVE_SLOTS.includes(Number(n))) return;
  localStorage.setItem("bit_tensei_active_slot", String(Number(n)));
}
function slotKey(n) { return SAVE_SLOT_KEYS[n] || SAVE_SLOT_KEYS[1]; }
function slotBackupKey(n) { return slotKey(n) + "_backup"; }

// Метаданные слота для экрана выбора: кто, сколько лет, какое поколение
function readSlotInfo(n) {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return null;
    const d = JSON.parse(raw);
    const p = d.player || {};
    return {
      slot: n,
      name: p.name || "Безымянный",
      age: p.age || 0,
      gen: d.dynastyGeneration || 1,
      year: d.worldState?.currentWorldYear || START_YEAR,
      coins: p.coins || 0,
      cp: p.cp || 0,
      savedAt: d.savedAt || 0,
      dead: !!p.isDead
    };
  } catch { return null; }
}

function allSlotInfos() {
  return SAVE_SLOTS.map(n => ({ slot: n, info: readSlotInfo(n) }));
}

function deleteSlot(n) {
  try {
    localStorage.removeItem(slotKey(n));
    localStorage.removeItem(slotBackupKey(n));
  } catch {}
}

function copySlot(from, to) {
  try {
    const raw = localStorage.getItem(slotKey(from));
    if (!raw) return false;
    localStorage.setItem(slotKey(to), raw);
    return true;
  } catch { return false; }
}

function fmtSaveDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `сегодня, ${hm}` : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}, ${hm}`;
}

// Экран выбора слота
function openSlotScreen(mode) {
  const box = $("slot-list");
  if (!box) return;
  currentSlotMode = mode || "load";
  const title = $("slot-screen-title");
  if (title) title.textContent = currentSlotMode === "new" ? "Где начать новую жизнь?" : "Чью историю продолжить?";
  const sub = $("slot-screen-sub");
  if (sub) sub.textContent = currentSlotMode === "new"
    ? "Каждый слот — отдельный род. Их можно вести параллельно."
    : "Выберите сохранение. Слоты не мешают друг другу.";

  const active = activeSlot();
  box.innerHTML = allSlotInfos().map(({ slot, info }) => {
    if (!info) {
      return `<div class="slot-card empty" onclick="pickSlot(${slot})">
        <div class="slot-num">${slot}</div>
        <div class="slot-body">
          <div class="slot-name">Пустой слот</div>
          <div class="slot-sub">Начать здесь новую жизнь</div>
        </div>
        <div class="slot-active-mark">${slot === active ? "●" : ""}</div>
      </div>`;
    }
    return `<div class="slot-card${slot === active ? " current" : ""}" onclick="pickSlot(${slot})">
      <div class="slot-num">${slot}</div>
      <div class="slot-body">
        <div class="slot-name">${esc(info.name)}</div>
        <div class="slot-sub">${info.age} лет • ${info.gen}-е поколение • ${info.year} г. К.Д.</div>
        <div class="slot-sub2">${fmtNum(info.coins)}🪙 • ${fmtSaveDate(info.savedAt)}</div>
      </div>
      <div class="slot-actions">
        <button class="slot-mini" onclick="event.stopPropagation(); exportSlot(${slot})" title="Экспорт">📤</button>
        <button class="slot-mini danger" onclick="event.stopPropagation(); confirmDeleteSlot(${slot})" title="Удалить">🗑</button>
      </div>
    </div>`;
  }).join("");

  if ($("slot-screen")) $("slot-screen").style.display = "flex";
  const nav = document.querySelector(".bottom-nav");
  if (nav) nav.style.display = "none";
}

function closeSlotScreen() {
  if ($("slot-screen")) $("slot-screen").style.display = "none";
}

function confirmDeleteSlot(n) {
  askConfirm(`Удалить слот ${n}?`, "Сохранение будет стёрто безвозвратно.", () => {
    deleteSlot(n);
    openSlotScreen(currentSlotMode);
    showActionModal("Удалено", `Слот ${n} очищен.`, "🗑");
  });
}

function exportSlot(n) {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return;
    const b64 = btoa(unescape(encodeURIComponent(raw)));
    navigator.clipboard?.writeText(b64);
    showActionModal("Экспорт", "Код сохранения скопирован. Сохраните его в надёжном месте.", "📤");
  } catch { showActionModal("Экспорт", "Не удалось скопировать код.", "❌"); }
}

function pickSlot(n) {
  setActiveSlot(n);
  if (currentSlotMode === "new") {
    closeSlotScreen();
    if (typeof menuFreeModeNew === "function") menuFreeModeNew();
    return;
  }
  // загрузка
  closeSlotScreen();
  if (loadGame()) { menuOpen ? menuOpen(null) : null; }
  else {
    showActionModal("Пустой слот", "Здесь пока никто не жил. Начните новую жизнь.", "📖");
    if (typeof menuFreeModeNew === "function") menuFreeModeNew();
  }
}

// Переключение слота при игре: сохраняем текущий и предлагаем выбрать другой
function switchSlot() {
  saveGameNow();
  openSlotScreen("load");
}

let currentSlotMode = "load";

function openSaveModal() {
  try {
    const b64 = btoa(unescape(encodeURIComponent(buildSavePayload())));
    if ($("save-export-text")) $("save-export-text").value = b64;
  } catch {}
  if ($("save-modal")) $("save-modal").style.display = "flex";
}
function closeSaveModal() { if ($("save-modal")) $("save-modal").style.display = "none"; }

function copySaveCode() {
  const txt = $("save-export-text")?.value;
  if (!txt) return;
  navigator.clipboard?.writeText(txt).then(() => showActionModal("Скопировано", "Код сохранения скопирован в буфер!", "📋"));
}

function importSaveCode() {
  try {
    const code = $("save-import-text")?.value.trim();
    if (!code) return;
    const json = decodeURIComponent(escape(atob(code)));
    if (applyLoadedData(JSON.parse(json))) {
      saveGame(); closeSaveModal();
      showActionModal("Загружено!", "Прогресс мира успешно восстановлен!", "💾");
    }
  } catch { showActionModal("Ошибка", "Неверный код сохранения!", "❌"); }
}


/* ══════════════════════════════════════════════════════════
   СЮЖЕТНЫЙ РЕЖИМ: меню, выбор рождения, запуск кампании.
   Свободный режим не затрагивается: он живёт по своим ключам.
   ══════════════════════════════════════════════════════════ */

const STORY_SAVE_KEY = "bit_tensei_story_save";

// Три судьбы. Один мир, один год — разный взгляд.
const STORY_ORIGINS = [
  {
    id: "buena",
    icon: "🏡",
    name: "Дитя деревни Буэна",
    place: "Земли Фитоа, Королевство Асура",
    tone: "Тёплое начало, магия, приключение — и катастрофа, которая всё ломает.",
    text: "Семья мелкого дворянина в провинции, где все друг друга знают, а главное событие года — приезд торговца. Вы живёте в трёх днях пути от дома, где растёт другой перерождённый. Вы встретите его раньше, чем кто-либо.",
    question: "Что делает обычный человек, когда история проходит через его двор?",
    tags: ["Магия", "Дорога", "Поиски"],
    region: "asura",
    surname: "Грейрат",
    name: "Рудеус"
  },
  {
    id: "ars",
    icon: "👑",
    name: "Дитя столицы Арс",
    place: "Королевство Асура, дворец и дома знати",
    tone: "Холодное начало: интриги, шёпот за спиной, вежливые улыбки и ножи в них.",
    text: "Вы не принц и не слуга — вы между. Дети знатных домов играют в то же, за что их отцы убивают. Трон шатается, и принцесса, которую вы знали ребёнком, однажды попросит вас о том, за что вешают.",
    question: "Сколько себя можно потратить, чтобы посадить на трон правильного человека?",
    tags: ["Интриги", "Власть", "Война"],
    region: "asura",
    surname: "Анемой",
    name: "Люк"
  },
  {
    id: "demon",
    icon: "🌋",
    name: "Дитя Рикариса",
    place: "Демонический Континент, пустошь",
    tone: "Жёсткое начало: голод, драки, свобода, купленная шрамами.",
    text: "Демоническая кровь — из тех, кому в остальном мире не подают руку. Пустошь, где сила решает всё, а жалость считается глупостью. Ни имени, ни рода, ни защиты: всё, что у вас будет, вы возьмёте сами — или не будете.",
    question: "Можно ли стать кем-то, если с рождения ты — никто?",
    tags: ["Сила", "Свобода", "Свои"],
    region: "demon",
    surname: "",
    name: "Риен"
  }
];

let storyOrigin = null;      // выбранное рождение
let storyGender = "male";
let storyStarted = false;    // сюжетный режим включён (не свободный)

function menuOpen(id) {
  ["main-menu", "origin-screen", "naming-screen"].forEach(x => {
    const el = $(x); if (el) el.style.display = (x === id ? "flex" : "none");
  });
  const nav = document.querySelector(".bottom-nav");
  if (nav) nav.style.display = (id ? "none" : "");
}

function backToMenu() { menuOpen("main-menu"); }
function backToOrigins() { menuOpen("origin-screen"); }

function menuStoryMode() {
  renderOriginList();
  menuOpen("origin-screen");
}

// «Продолжить» — если есть незакрытая глава кампании
function menuResume() {
  const saved = loadCampaign();
  if (!saved) { menuStoryMode(); return; }
  campaign = saved;
  storyShowScene(saved.sceneId);
}

function refreshResumeButton() {
  const choiceBox = document.querySelector("#main-menu .mm-choice");
  if (!choiceBox) return;
  const old = document.getElementById("mm-resume");
  if (old) old.remove();
  const saved = loadCampaign();
  if (!saved) return;
  const o = STORY_ORIGINS.find(x => x.id === saved.originId);
  const btn = document.createElement("button");
  btn.id = "mm-resume";
  btn.className = "mm-start";
  btn.style.margin = "0 0 14px";
  btn.textContent = `▶ Продолжить — ${o ? o.name : "история"}`;
  btn.onclick = menuResume;
  choiceBox.parentNode.insertBefore(btn, choiceBox);
}

// Вход в песочницу теперь через выбор слота
function menuFreeMode() {
  openSlotScreen("load");
}

// Новая жизнь в выбранном слоте
function menuFreeModeNew() {
  menuOpen(null);
  syncSaveKeys();
  showCreation();
}

function menuSettings() {
  showActionModal("⚙️ Настройки", "Звук и музыку можно выключить кнопкой 🔔 в правом верхнем углу. Сброс прогресса — в окне «Данные» на вкладке персонажа.", "⚙️");
}

function menuCredits() {
  showActionModal("✦ Bit Tensei",
    "История о Шестиликом Мире, перерождении и о том, что остаётся после нас.\n\n" +
    "Сюжетный режим — одна жизнь от рождения до конца: три судьбы, семь глав, десять развязок.\n" +
    "Свободный режим — род на века, без сюжетных рамок.", "✦");
}

function renderOriginList() {
  const box = $("origin-list");
  if (!box) return;
  box.innerHTML = STORY_ORIGINS.map(o => `
    <div class="origin-card${storyOrigin && storyOrigin.id === o.id ? " picked" : ""}" onclick="pickOrigin('${o.id}')">
      <div class="origin-top">
        <div class="origin-icon">${o.icon}</div>
        <div>
          <div class="origin-name">${esc(o.name)}</div>
          <div class="origin-place">${esc(o.place)}</div>
        </div>
      </div>
      <div class="origin-tone">${esc(o.tone)}</div>
      <div class="origin-text">${esc(o.text)}</div>
      <div class="origin-tags">${o.tags.map(t => `<span class="origin-tag">${esc(t)}</span>`).join("")}</div>
    </div>`).join("");
}

function pickOrigin(id) {
  storyOrigin = STORY_ORIGINS.find(o => o.id === id) || null;
  renderOriginList();
  setTimeout(() => {
    if (!storyOrigin) return;
    renderNamingScreen();
    menuOpen("naming-screen");
  }, 180);
}

function renderNamingScreen() {
  const o = storyOrigin; if (!o) return;
  const line = $("naming-origin-line");
  if (line) line.textContent = `${o.icon} ${o.name} • ${o.place}`;
  const n = $("story-name"), s = $("story-surname");
  if (n) n.value = o.name;
  if (s) s.value = o.surname;
  setStoryGender("male");
}

function setStoryGender(g) {
  storyGender = g;
  const m = $("gbtn-male"), f = $("gbtn-female");
  if (m) m.classList.toggle("active", g === "male");
  if (f) f.classList.toggle("active", g === "female");
}

function beginStory() {
  const o = storyOrigin; if (!o) return;
  const name = ($("story-name")?.value || o.name).trim() || o.name;
  const surname = ($("story-surname")?.value || "").trim();
  const raceKey = o.id === "demon" ? "demon" : "human";
  const race = RACES[raceKey] || RACES.human;
  const region = REGIONS[o.region] || REGIONS.asura;
  const origin = (region.origins && region.origins[0]) || "Неизвестно";
  const trait = TRAITS[0];
  const fam = FAMILY_STATUSES[o.id === "ars" ? 1 : 0] || FAMILY_STATUSES[0];

  storyStarted = true;
  menuOpen(null);
  initCharacter(name, surname, storyGender, race, o.region, origin, trait, fam, 0);
  storyBeginCampaign(o);
}


/* ══════════════════════════════════════════════════════════
   ДВИЖОК КАМПАНИИ
   Главы → сцены → выборы → последствия.
   Ветки сходятся, но помнят: флаги, доверие, кто жив.
   ══════════════════════════════════════════════════════════ */

const CAMPAIGN_SAVE_KEY = "bit_tensei_campaign_save";

// Состояние кампании — отдельно от песочницы
let campaign = {
  on: false,
  originId: null,
  chapter: 0,          // номер текущей главы (0 = пролог)
  sceneId: null,       // текущая сцена
  flags: {},           // памятные выборы
  trust: {}            // доверие к персонажам
};

function storyBeginCampaign(origin) {
  campaign = {
    on: true,
    originId: origin.id,
    chapter: 0,
    sceneId: origin.id + "_p1",
    flags: {},
    trust: {}
  };
  saveCampaign();
  storyShowScene(campaign.sceneId);
}

// Найти сцену по id во всех главах кампании
function campaignFindScene(id) {
  if (typeof CAMPAIGN_SCENES === "undefined" || !id) return null;
  return CAMPAIGN_SCENES[id] || null;
}

function storyFlag(name) { return !!campaign.flags[name]; }
function storyTrust(who) { return Number(campaign.trust[who] || 0); }
function addTrust(who, delta) {
  campaign.trust[who] = Math.max(-100, Math.min(100, storyTrust(who) + delta));
}

// Показать сцену кампании
function storyShowScene(id) {
  const sc = campaignFindScene(id);
  if (!sc) {
    showActionModal("Конец главы", "Дальше этой точки сюжет пока не написан. Глава будет продолжена в следующей порции.", "📖");
    return;
  }
  campaign.sceneId = id;
  saveCampaign();

  const modal = $("story-modal");
  const title = $("story-title"), desc = $("story-text"), choices = $("story-choices"), foot = $("story-foot");
  const lineName = $("story-line-name"), icon = $("story-icon");
  if (!modal) return;

  if (title) title.textContent = sc.title || "История";
  if (lineName) lineName.textContent = sc.chapter || "История";
  if (icon) icon.textContent = sc.icon || "📖";
  if (desc) desc.innerHTML = String(sc.text || "").split("\n\n").map(p => `<p>${p}</p>`).join("");
  if (choices) {
    choices.innerHTML = (sc.choices || []).map((c, i) =>
      `<button class="story-choice-btn" onclick="storyPickChoice(${i})">${esc(c.text)}</button>`).join("");
  }
  if (foot) foot.innerHTML = "";
  modal.style.display = "flex";
}

// Выбор в сцене кампании
function storyPickChoice(idx) {
  const sc = campaignFindScene(campaign.sceneId);
  if (!sc || !sc.choices || !sc.choices[idx]) return;
  const ch = sc.choices[idx];

  // памятные флаги
  Object.keys(ch.flags || {}).forEach(f => { campaign.flags[f] = ch.flags[f]; });
  // доверие
  Object.keys(ch.trust || {}).forEach(who => addTrust(who, ch.trust[who]));

  const next = typeof ch.next === "function" ? ch.next(campaign) : ch.next;

  // показать последствие выбора, если оно есть
  if (ch.result) {
    const desc = $("story-text"), choices = $("story-choices");
    if (desc) desc.innerHTML = `<p class="story-result">${esc(ch.result)}</p>`;
    if (choices) {
      choices.innerHTML = `<button class="story-choice-btn" onclick="storyContinueTo('${next || ""}')">Далее →</button>`;
    }
    campaign.pendingNext = next;
    campaign.sceneId = next || campaign.sceneId;
    saveCampaign();
    return;
  }
  storyContinueTo(next);
}

function storyContinueTo(nextId) {
  const id = nextId || campaign.pendingNext;
  campaign.pendingNext = null;
  if (!id) { storyShowScene(campaign.sceneId); return; }
  saveCampaign();
  storyShowScene(id);
}

function saveCampaign() {
  try { localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(campaign)); } catch {}
}

function loadCampaign() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.sceneId ? data : null;
  } catch { return null; }
}

// Титульный экран: меню или сразу в игру
function startAtMenu() {
  migrateLegacySave();
  setActiveSlot(activeSlot());
  syncSaveKeys();
  const nav = document.querySelector(".bottom-nav");
  if (nav) nav.style.display = "none";
  menuOpen("main-menu");
  refreshResumeButton();
}

if (typeof startAtMenu === "function") startAtMenu();
