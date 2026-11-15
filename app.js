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
    race: race.name, raceObj: race, maxAge: isGod ? 999 : race.maxAge,
    regionKey, currentRegionKey: regionKey, origin: origin.name, trait, familyStatus,
    customAvatar: null,
    age: startAge, ap: getMaxAP(startAge), maxAp: getMaxAP(startAge),
    hp: baseHp, maxHp: baseHp, mana: baseMana, maxMana: baseMana,
    magicExp: isGod ? 1500 : (startAge > 5 ? startAge * 4 : 0),
    swordGodExp: isGod ? 1500 : (origin.swordGod || 0) + (trait.swordGod || 0) + (race.bonus.swordGod || 0) + (familyStatus.swordGod || 0) + (startAge > 5 ? startAge * 3 : 0),
    waterGodExp: isGod ? 1500 : (origin.waterGod || 0) + (trait.waterGod || 0) + (startAge > 5 ? startAge * 3 : 0),
    northGodExp: isGod ? 1500 : (origin.northGod || 0) + (trait.northGod || 0) + (race.bonus.northGod || 0) + (familyStatus.northGod || 0) + (startAge > 5 ? startAge * 3 : 0),
    intellect: isGod ? 500 : 10 + (origin.int || 0) + (trait.int || 0) + (race.bonus.int || 0) + (familyStatus.int || 0) + startAge * 2,
    coins: isGod ? 99999 : (origin.coins || 0) + (race.bonus.coins || 0) + (familyStatus.coins || 0),
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
    spouse: null, children: []
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
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  $(`tab-${tabId}`)?.classList.add("active");
  const idx = { character: 0, activities: 1, inventory: 2, guild: 3, relations: 4 }[tabId];
  document.querySelectorAll(".nav-item")[idx]?.classList.add("active");

  if (tabId === "activities") renderActivities();
  if (tabId === "inventory") { renderInventoryTab(); renderForge(); renderTestament(); renderFamilyCastle(); renderEstates(); renderCaravans(); }
  if (tabId === "guild") { renderGuildTab(); renderSquad(); }
  if (tabId === "relations") { renderRelations(); renderTravelTab(); renderChaosBreaker(); renderGreyratBranches(); renderTablets(); renderLanguages(); }
  playSound("click");
}

function setWorldSubTab(sub, btnEl) {
  ["relations", "travel", "perugius", "greyrat", "tablets", "politics", "tree", "languages", "schools"].forEach(t => {
    const el = $(`world-sub-${t}`);
    if (el) el.style.display = t === sub ? "block" : "none";
  });
  btnEl?.parentElement?.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
  btnEl?.classList.add("active");
  ({ relations: renderRelations, travel: renderTravelTab, perugius: renderChaosBreaker, greyrat: renderGreyratBranches, tablets: renderTablets, politics: renderPolitics, tree: renderDynastyTree, languages: renderLanguages, schools: renderSchools })[sub]?.();
  playSound("click");
}

function jumpToWorldMap() {
  switchTab("relations");
  const mapBtn = document.querySelector("#tab-relations .sub-tab-btn:nth-child(2)");
  setWorldSubTab("travel", mapBtn);
}

// =========================================================================
// ИНТЕРАКТИВНАЯ КАРТА МИРА И СЕТЬ ТЕЛЕПОРТОВ
// =========================================================================
function renderTravelTab() {
  const mapBox = $("world-map-box"), cardBox = $("map-region-card"), tpBox = $("teleport-network-box");
  if (!mapBox) return;

  const isTpComplete = (worldState.teleportNodes?.length || 0) >= 6;
  const routesSvg = MAP_ROUTES.map(([a, b]) => {
    const ra = REGIONS[a], rb = REGIONS[b];
    const hasTp = worldState.teleportNodes?.includes(a) && worldState.teleportNodes?.includes(b);
    return `<line x1="${ra.mapX}" y1="${ra.mapY}" x2="${rb.mapX}" y2="${rb.mapY}" stroke="${hasTp ? "#38bdf8" : "rgba(251,191,36,0.35)"}" stroke-width="${hasTp ? 2 : 1.3}" stroke-dasharray="${hasTp ? "none" : "4 3"}"/>`;
  }).join("");

  const nodesSvg = Object.entries(REGIONS).map(([k, r]) => {
    const isHere = player.currentRegionKey === k, isSel = selectedMapRegion === k;
    const hasLost = player.relations.some(x => x.isLost);
    const hasPower = worldState.sevenPowers.some(p => p.region === k && player.discoveredSevenPowers.includes(p.rank) && player.currentPowersSeat !== p.rank);
    const hasTab = FIRST_WAR_TABLETS.some(t => t.regionKey === k && !player.tabletsDeciphered.includes(t.id));
    const hasTp = worldState.teleportNodes?.includes(k);

    let markerIcon = "";
    if (hasPower) markerIcon += "🏆";
    if (hasTab) markerIcon += "📜";
    if (hasLost && !isHere) markerIcon += "⚡";

    return `<g class="map-node ${isHere ? "active" : ""} ${isSel ? "selected" : ""}" onclick="selectMapRegion('${k}')">
      ${isHere ? `<circle cx="${r.mapX}" cy="${r.mapY}" r="12" fill="none" stroke="#fbbf24" stroke-width="2" class="map-pin-pulse"/>` : ""}
      <circle class="map-pin-circle" cx="${r.mapX}" cy="${r.mapY}" r="${isHere ? 9 : 7.5}" fill="${r.color}" stroke="${isSel ? "#fbbf24" : "#0b0c10"}" stroke-width="2"/>
      ${hasTp ? `<circle cx="${r.mapX}" cy="${r.mapY}" r="3" fill="#38bdf8"/>` : ""}
      <text x="${r.mapX}" y="${r.mapY + 18}" text-anchor="middle" fill="#e5e7eb" font-size="8.5" font-weight="700">${r.name.replace(/^[^\s]+\s/, "")}</text>
      ${markerIcon ? `<text x="${r.mapX + 10}" y="${r.mapY - 6}" font-size="9">${markerIcon}</text>` : ""}
    </g>`;
  }).join("");

  mapBox.innerHTML = `<svg class="world-map-svg" viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg">
    <rect width="360" height="220" fill="#0b1322"/>
    <!-- Континенты Шестиликого Мира -->
    <path d="M120,18 L215,16 L228,62 L210,128 L175,148 L125,130 L118,65 Z" fill="#1e293b" stroke="#334155" stroke-width="1.2"/>
    <path d="M135,18 L210,18 L215,58 L130,62 Z" fill="#1e3a5f" opacity="0.65"/>
    <path d="M192,126 L252,122 L256,162 L205,168 Z" fill="#143628" stroke="#1e4d3a" stroke-width="1"/>
    <path d="M135,154 L205,156 L195,202 L140,198 Z" fill="#283044" stroke="#475569" stroke-width="1"/>
    <path d="M250,28 L338,24 L344,104 L268,112 L244,75 Z" fill="#3b1920" stroke="#7f1d1d" stroke-width="1.2"/>
    <path d="M20,118 L104,122 L110,198 L24,195 Z" fill="#3b2b13" stroke="#92400e" stroke-width="1.2"/>
    ${routesSvg}
    ${nodesSvg}
  </svg>`;

  const sel = REGIONS[selectedMapRegion] || REGIONS.asura;
  const here = player.currentRegionKey === selectedMapRegion;
  const cost = isTpComplete ? 0 : sel.travelCost;
  const canGo = !here && player.age >= 8 && player.coins >= cost;
  if (cardBox) {
    cardBox.innerHTML = `<div class="card" style="border-color:${sel.color}; margin-bottom:0;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="font-size:14px;">${sel.name}</b>
        <span class="badge-rare">${here ? "Вы здесь 📍" : isTpComplete ? "⚡ Мгновенный Телепорт (0🪙)" : `${cost}🪙 • 1 год пути`}</span>
      </div>
      <div style="font-size:11px; color:var(--muted); margin:5px 0;">${sel.desc}</div>
      <button ${canGo ? "" : "disabled"} style="width:100%; background:${here ? "#059669" : "#312e81"};" onclick="travelToRegion('${selectedMapRegion}')">
        ${here ? "✓ Текущее местоположение" : player.age < 8 ? "Путешествия с 8 лет" : isTpComplete ? "⚡ Перенестись Телепортом" : `⛵ Отправиться в путь (${cost}🪙)`}
      </button>
    </div>`;
  }

  if (tpBox) {
    const builtHere = worldState.teleportNodes?.includes(player.currentRegionKey);
    const count = worldState.teleportNodes?.length || 0;
    tpBox.innerHTML = `<div class="card" style="background:#10192b; border-color:#38bdf8;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="color:#38bdf8; font-size:12.5px;">🌀 Проект Династии: Сеть Телепортов</b>
        <span class="badge-rare">${count}/6 кругов</span>
      </div>
      <div style="font-size:11px; color:var(--muted); margin:4px 0;">
        ${isTpComplete ? "🌟 Сеть завершена! Все переходы между континентами бесплатны и мгновенны!" : "Воздвигните рунный круг в каждом из 6 регионов через поколения — перелёты станут бесплатными и займут 0 лет."}
      </div>
      ${!isTpComplete ? `<button ${builtHere ? "disabled" : ""} style="width:100%; background:#0284c7; font-size:11px;" onclick="buildTeleportNode()">
        ${builtHere ? "✓ Круг в этом регионе возведён" : "🌀 Возвести круг здесь (180🪙, нужно 40+ Знаний)"}
      </button>` : ""}
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
  const isTp = (worldState.teleportNodes?.length || 0) >= 6;
  const cost = isTp ? 0 : dest.travelCost;
  if (player.age < 8 || !dest || player.coins < cost) return showActionModal("Путь", `Нужно ${cost}🪙 и возраст 8+!`, "🚢");
  player.coins -= cost; player.currentRegionKey = destKey; selectedMapRegion = destKey;
  if (isTp) {
    log(`⚡ Мгновенный перенос в <b>${dest.name}</b>!`); playSound("magic");
    updateUI(); renderTravelTab();
  } else {
    log(`🚢 Вы прибыли в <b>${dest.name}</b>.`); playSound("calamity");
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
  if (!list.length) { container.innerHTML = `<div style="color:var(--muted); text-align:center; padding:20px;">Нет дел для возраста ${player.age} лет.</div>`; return; }
  container.innerHTML = list.map(act => `
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

function getShopPrice(item) {
  let price = item.cost;
  if (player.currentRegionKey === "demon" && player.languages.includes("demon")) price = Math.floor(price * 0.8);
  if ((player.reputation || 0) >= 25) price = Math.floor(price * 0.9);
  return Math.max(1, price);
}

function renderInventoryTab() {
  const inv = $("inventory-list");
  if (inv) {
    let html = "";
    if (player.potionsCount > 0) html += `<div class="shop-item"><div><b>🧪 Зелье Исцеления</b> (${player.potionsCount} шт.)<div style="font-size:11px; color:var(--muted);">+60 HP</div></div><button onclick="usePotionOutOfCombat()">Пить</button></div>`;
    html += player.inventory.map((it, i) => `
      <div class="shop-item"><div><b>${it.name}${it.forgeLevel ? ` [+${it.forgeLevel}]` : ""}</b> (+${getItemPower(it)} БМ)<div style="font-size:11px; color:var(--muted);">${it.desc}</div></div>
      <div style="display:flex; gap:5px;"><button style="background:#4338ca; padding:6px 9px; font-size:11px;" onclick="equipItem(${i})">Надеть</button>
      <button class="btn-sell" onclick="sellInventoryItem(${i})">+${Math.max(BALANCE.economy.minSellPrice, Math.floor(it.cost * BALANCE.economy.sellRatio))}🪙</button></div></div>`).join("");
    inv.innerHTML = html || `<div style="font-size:12px; color:var(--muted);">Рюкзак пуст.</div>`;
  }
  const shop = $("shop-list");
  if (shop) {
    const items = currentShopCategory === "all" ? SHOP_ITEMS : SHOP_ITEMS.filter(i => currentShopCategory === "artifact" ? (i.type === "accessory" || i.type === "potion") : i.type === currentShopCategory);
    shop.innerHTML = items.map(it => {
      const price = getShopPrice(it);
      return `<div class="shop-item"><div><b>${it.name}</b> <span style="color:var(--gold); font-size:11px;">${price}🪙</span><div style="font-size:11px; color:var(--muted);">${it.desc}</div></div>
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
  log(`🛒 Куплено: <b>${it.name}</b> (${price}🪙).`); playSound("coin"); updateUI(); renderInventoryTab();
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
      const floor = player.dungeonProgress[d.id] || 1, done = floor > d.maxFloors, ok = player.age >= 10 && pIdx >= ADVENTURER_RANKS.indexOf(d.reqRank);
      return `<div class="card" style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between;"><b style="font-size:13px;">${d.name}</b><span class="tag badge-rare">Ранг ${d.reqRank}+</span></div>
        <div style="font-size:11px; color:var(--muted); margin:4px 0;">${d.desc}</div>
        <div style="font-size:11px; color:var(--accent-light);">${done ? "👑 Покорён!" : `Этаж ${floor} из ${d.maxFloors}`}</div>
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

function openDungeonExploration(id) {
  if (player.ap < 1) return showActionModal("Усталость", "Нужно ⚡ 1 сила!", "💤");
  player.ap -= 1;
  if (checkSquadBetrayal()) return;
  const d = DUNGEONS.find(x => x.id === id);
  player.dungeonProgress[id] = player.dungeonProgress[id] || 1;
  dunsRested = {};
  activeDungeon = { id, obj: d };
  updateDungeonModalUI("Вы ступили под древние своды лабиринта.");
  if ($("dungeon-modal")) $("dungeon-modal").style.display = "flex";
  playSound("sword");
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
    const mCp = Math.floor(d.cpBase * (1 + floor * 0.42)), dmg = Math.max(6, Math.floor(mCp / (calcSquadCombatPower(player) + 80) * 18) + 8);
    player.hp -= dmg;
    if (dmg > 32 && Math.random() < 0.20 && !player.injuries.some(i => i.id === "lost_arm")) {
      player.injuries.push({ id: "lost_arm", name: "Утрата левой руки" });
      txt = `🩸 <b>ТРАВМА!</b> Вы потеряли руку (-${dmg} HP)! Ищите Протез или Целителя Милиса.`; playSound("death");
    } else { txt = `⚔️ Стражи ${floor} этажа повержены (-${dmg} HP)!`; playSound("sword"); }
    player.dungeonProgress[d.id]++;
  }
  if (player.dungeonProgress[d.id] > d.maxFloors) {
    const drop = SHOP_ITEMS.find(i => i.id === d.dropArtifact);
    if (drop) player.inventory.push({ ...drop, forgeLevel: 0 });
    player.coins += 320; player.guildExp += 140; player.squadFame += 120; player.reputation += 15;
    txt = `👑 <b>ПОБЕДА!</b> ${d.name} зачищен! Награда: <b>${drop?.name}</b> (+320🪙, +140 GP)!`;
    log(txt); playSound("win");
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

function combatAction(type) {
  if (!currentBattle) return;
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
    if (logBox) logBox.innerHTML += `<div style="color:#a78bfa;">🛡️ ${ally.name} наносит <b>-${allyDmg} HP</b>!</div>`;
  }

  currentBattle.enemyHp -= myDmg;

  if (currentBattle.enemyHp <= 0) {
    if (logBox) logBox.innerHTML += `<div style="color:var(--gold); font-weight:700;">🏆 ПОБЕДА!</div>`;
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

function renderSquad() {
  setText("squad-count", player.squad.length + 1);
  setText("squad-cp", calcSquadCombatPower(player).toLocaleString());
  setText("squad-fame", player.squadFame);
  const list = $("squad-members-list"); if (!list) return;
  list.innerHTML = player.squad.length ? player.squad.map((m, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#12141c; padding:6px 10px; border-radius:8px; margin-bottom:4px; font-size:12px;">
      <div><b>${m.name}</b> <span style="font-size:10px; color:var(--muted);">(${m.role || m.race})</span><div style="font-size:10px; color:#c7d2fe;">БМ: ${m.cp.toLocaleString()}</div></div>
      <button style="padding:4px 8px; font-size:10px; background:#ef4444;" onclick="removeFromSquad(${i})">Убрать</button>
    </div>`).join("") : `<div style="font-size:11px; color:var(--muted);">Пригласите спутников во вкладке «Мир & Род»!</div>`;
}
function addToSquad(id) {
  if (player.squad.length >= 5) return showActionModal("Отряд", "Максимум 6 бойцов!", "🛡️");
  const npc = player.relations.find(r => r.id === id); if (!npc || npc.relation < 60) return showActionModal("Недоверие", "Нужно 60%+ отношений!", "❌");
  player.squad.push(npc); log(`🛡️ ${npc.name} вступил(а) в отряд!`); playSound("win"); updateUI(); renderRelations(); renderSquad();
}
function removeFromSquad(i) { log(`${player.squad[i].name} покинул отряд.`); player.squad.splice(i, 1); updateUI(); renderSquad(); }

function checkSquadBetrayal() {
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
    <b>${esc(a.name)}</b> (${a.race}) • Пик БМ: ${fmtNum(a.peakCp)} • ${a.maxAge} л.<div style="font-size:10px; color:var(--muted);">${a.deathReason}</div></div>`).join("") : `<div style="color:var(--muted); font-size:11px;">Летопись предков пока пуста.</div>`;
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

function renderRelations() {
  const cont = $("relations-list"); if (!cont) return;
  if (!player.relations.length) { cont.innerHTML = `<div style="color:var(--muted); text-align:center;">Знакомых пока нет.</div>`; return; }
  cont.innerHTML = player.relations.map(npc => {
    const cls = npc.isDead ? "status-dead" : npc.relation < 30 ? "status-enemy" : npc.status === "Супруг/Супруга" ? "status-married" : npc.status === "Пара" ? "status-love" : "status-friend";
    const open = currentOpenedNpcId === npc.id && !npc.isDead;
    const inSquad = player.squad.some(m => m.id === npc.id);
    const hasCanonQ = npc.isCanon && npc.relation >= 80 && CANON_QUESTS[npc.id] && !player.canonQuestsDone?.includes(npc.id);
    let actHtml = "";
    if (open) {
      if (npc.isLost) actHtml = `<button class="npc-action-full" style="background:#b45309;" onclick="searchLostFamily('${npc.id}')">🔍 Искать пропавшего (⚡ 1 сила)</button>`;
      else if (player.age < 4) actHtml = `<button onclick="npcInteract('${npc.id}','play')">👶 Поиграть</button><button onclick="npcInteract('${npc.id}','cuddle')">🍼 На ручки</button>`;
      else if (player.age < 10) actHtml = `<button onclick="npcInteract('${npc.id}','story')">📖 Сказка</button><button onclick="npcInteract('${npc.id}','gift')">🎁 Подарок (8🪙)</button><button onclick="npcInteract('${npc.id}','spar')">🪵 Урок меча</button><button onclick="npcInteract('${npc.id}','pocket')">🪙 На сладости</button>`;
      else {
        actHtml = `<button onclick="npcInteract('${npc.id}','talk')">💬 Беседа</button><button onclick="npcInteract('${npc.id}','gift')">🎁 Подарок (8🪙)</button>
          <button onclick="npcInteract('${npc.id}','drink')">🍻 Таверна (6🪙)</button><button onclick="npcInteract('${npc.id}','spar')">⚔️ Спарринг</button>
          <button onclick="npcInteract('${npc.id}','loan')">🪙 Занять</button><button class="action-danger" onclick="npcInteract('${npc.id}','insult')">🤬 Оскорбить</button>`;
        if (hasCanonQ) actHtml += `<button class="npc-action-full" style="background:#b45309;" onclick="doCanonQuest('${npc.id}')">⭐ Квест: ${CANON_QUESTS[npc.id].title}</button>`;
        if (player.age >= 16 && !inSquad && !npc.isChild) actHtml += `<button class="npc-action-full" style="background:#312e81;" onclick="addToSquad('${npc.id}')">🛡️ В боевой отряд</button>`;
        if (player.age >= 14 && !npc.isFamily && !npc.isChild && npc.status !== "Пара" && npc.status !== "Супруг/Супруга") actHtml += `<button class="action-love npc-action-full" onclick="npcInteract('${npc.id}','confess')">❤️ Признаться в чувствах</button>`;
        if (player.age >= 16 && npc.status === "Пара" && !player.spouse) actHtml += `<button class="action-married npc-action-full" onclick="npcInteract('${npc.id}','marry')">💍 Пожениться</button>`;
        if (npc.status === "Супруг/Супруга") actHtml += `<button class="action-married npc-action-full" ${player.pregnancy ? "disabled" : ""} onclick="npcInteract('${npc.id}','child')">${player.pregnancy ? "⏳ Ожидание малыша" : "👶 Зачать ребенка"}</button>`;
      }
    }
    const badges = `${npc.isCanon ? '<span class="badge-canon">Канон ⭐</span> ' : ""}${npc.isChild ? '<span style="color:#fbbf24;">(Наследник)</span> ' : ""}${npc.isLost ? '<span class="badge-mythic">Пропал ⚡</span> ' : ""}${inSquad ? '<span class="badge-rare">Отряд 🛡️</span>' : ""}`;
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

function npcInteract(id, act) {
  const npc = player.relations.find(r => r.id === id); if (!npc) return;
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
  else if (act === "marry") { if (npc.relation >= 88) { npc.status = "Супруг/Супруга"; player.spouse = npc; msg = `💍 Вы и ${npc.name} поженились!`; playSound("win"); } else msg = `Укрепите отношения до 88%+!`; }
  else if (act === "child") { player.pregnancy = { partnerName: npc.name, partnerRace: npc.race || "Человек" }; msg = `👶 Вы с ${npc.name} ждёте ребёнка!`; playSound("win"); }
  log(msg); showActionModal("Отношения", msg, "👥"); updateUI(); renderRelations();
}

function searchLostFamily(id) {
  if (player.ap < 1) return showActionModal("Усталость", "Нужно ⚡ 1 сила!", "💤");
  player.ap -= 1;
  const npc = player.relations.find(r => r.id === id);
  if (npc && Math.random() < 0.6) { npc.isLost = false; log(`🎉 Вы нашли <b>${npc.name}</b>!`); playSound("win"); showActionModal("Воссоединение!", `Вы нашли <b>${npc.name}</b>!`, "🎉"); }
  else showActionModal("Поиски", "Пока следов нет, ищите дальше!", "🔍");
  updateUI(); renderRelations();
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

function meetStranger() {
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
  box.innerHTML = html;
  box.querySelectorAll("[data-story-choice]").forEach(btn => {
    btn.onclick = () => resolveStoryScene(node, parseInt(btn.dataset.storyChoice, 10));
  });

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
  }
}

function showYearSummary() {
  yearFlowActive = false;
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
  if (yearFlowActive) return;              // защита от двойного клика
  yearFlowActive = true;
  yearFinalized = false;
  yearReportOpen = false;                  // окно прошлого года больше не открыто
  yearExtras = [];
  yearSnapshot = takeYearSnapshot();       // точка отсчёта для дневника года
  player.age++; worldState.currentWorldYear++;
  saveGame(); // страховка: год уже прожит, даже если игрок закроет приложение посреди события
  player.maxAp = getMaxAP(player.age); player.ap = player.maxAp; player.mana = player.maxMana;

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
      }
    }
  });

  generateYearlyGuildQuests();

  if (player.estates.length) {
    const inc = player.estates.reduce((s, id) => s + (ESTATES.find(e => e.id === id)?.income || 0), 0);
    player.coins += inc;
    // Содержание имущества: доход не бесплатный
    const upkeep = Math.floor(inc * BALANCE.upkeepPercent);
    if (upkeep > 0 && player.coins >= upkeep) {
      player.coins -= upkeep;
      log(`💰 Имения: +${inc}🪙 дохода, −${upkeep}🪙 содержания (итого +${inc - upkeep}🪙).`);
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

  if (player.pregnancy) {
    const isM = Math.random() > 0.5, list = SYLLABLES[isM ? "male" : "female"];
    let childRace = player.race;
    if (player.pregnancy.partnerRace && player.pregnancy.partnerRace !== player.race) {
      if (player.race.includes("Эльф") || player.pregnancy.partnerRace.includes("Эльф")) childRace = "Эльф / Полуэльф";
      else if (player.race === "Демон" || player.pregnancy.partnerRace === "Демон") childRace = "Демон";
    }
    const child = {
      id: "child_" + Date.now(), name: `${list[Math.floor(Math.random() * list.length)]} ${player.surname}`,
      gender: isM ? "male" : "female", race: childRace, age: 0, birthYear: worldState.currentWorldYear,
      cp: 450, role: "Наследник рода",
      relation: 100, status: "Семья", isFamily: true, isChild: true, isDead: false
    };
    player.children.push(child); player.relations.push(child);
    if (!player.appointedHeirId) player.appointedHeirId = child.id;
    log(`🎉 Родился ребёнок — <b>${child.name}</b> (${childRace})!`); playSound("win"); player.pregnancy = null;
    queueYearExtra("Пополнение в роду", `Родился(ась) <b>${esc(child.name)}</b> (${esc(childRace)}).`, "🎉");
  }

  if (worldState.currentWorldYear === CALAMITY_YEAR && !worldState.calamityOccurred) {
    performStoryActivity("s1_calamity"); return;
  }

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
    const decay = BALANCE.hp.newAgeDecayMin + Math.floor(Math.random() * (span + 1));
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
  const perExp = player.age < 16 ? g.expPerYearUntilAdult : g.expPerYearAfterAdult;
  if (perExp > 0) {
    player.magicExp += perExp;
    player.swordGodExp += perExp;
    player.waterGodExp += perExp;
    player.northGodExp += perExp;
  }
  player.intellect += g.intellectPerYear;
  // В старости силы уже не восстанавливаются сами — иначе увядание незаметно
  const isOld = player.age > player.maxAge - BALANCE.hp.oldAgeYears;
  const naturalHeal = isOld ? 0 : g.freeRestHeal;
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
  worldState.dynastyHistory.push({
    gen: player.generation, name: player.name, gender: player.gender, race: player.race,
    peakCp: calcCombatPower(player), maxAge: player.age, deathReason: reason, powersSeat: player.currentPowersSeat
  });

  setText("death-reason", `${reason} в возрасте ${player.age} лет.`);
  if ($("death-summary")) $("death-summary").innerHTML = `
    <div>🎖️ <b>${esc(player.name)}</b> (${player.race}) • Прожито: <b>${player.age} л.</b></div>
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
          <div style="font-size:11px; color:var(--muted);">${c.gender === "male" ? "Сын" : "Дочь"} • ${c.race || player.race} • ${age} л.</div></div>
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

const SAVE_KEY = "bit_tensei_save";
const SAVE_BACKUP_KEY = "bit_tensei_save_backup";

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

if (!loadGame()) showCreation();
