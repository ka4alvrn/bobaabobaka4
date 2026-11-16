const START_YEAR = 407;
const CALAMITY_YEAR = 417;

const SWORD_RANKS = ["Нет", "Новичок", "Рядовой 🥉", "Святой 🌟", "Королевский 👑", "Император ⚡", "Бог ⚔️"];
const MAGIC_RANKS = ["Новичок", "Рядовой 🥉", "Святой 🌟", "Королевский 👑", "Император ⚡", "Бог 🔮"];
const ADVENTURER_RANKS = ["F", "E", "D", "C", "B", "A", "S"];
const ADVENTURER_REQ = { F: 0, E: 30, D: 80, C: 180, B: 380, A: 750, S: 1400 };

// Плотная шкала БМ: от 100 у младенца до ~100,000 у Богов и эндгейма
const GENERATION_CP_CAPS = { 1: 8500, 2: 22000, 3: 48000, 4: 80000, 5: 120000 };

const WORLD_ERAS = [
  { maxYear: 416, name: "Мир перед Бурей", desc: "Спокойное десятилетие перед Катаклизмом Маны." },
  { maxYear: 429, name: "Смута Катаклизма", desc: "Последствия телепортации Фитоа и скитания выживших." },
  { maxYear: 499, name: "Эпоха Восстановления", desc: "Расцвет Академии Раноа и тайная борьба Апостолов." },
  { maxYear: 599, name: "VI век: Век Затаившихся Богов", desc: "Скрытые интриги Белого Пространства и передел тронов." },
  { maxYear: 699, name: "VII век: Эпоха Маготехники", desc: "Небесные корабли, древние руны и расцвет магии." },
  { maxYear: 9999, name: "VIII+ век: Хроники Вечных Династий", desc: "Легендарная эра бессмертных родов и архимагов." }
];

const REGION_FAMILY_STATUSES = {
  asura: [
    { id: "asura_slums", name: "Нищие трущоб Арса", coins: 3, hp: 15, northGod: 10, desc: "Выживание на улицах (+15 HP, +10 Севера)." },
    { id: "asura_farmer", name: "Фермеры Фитоа", coins: 15, hp: 25, desc: "Дом среди золотых полей (+25 HP)." },
    { id: "asura_knight", name: "Рыцари Асуры", coins: 50, swordGod: 15, int: 4, desc: "Воинская честь (+50🪙, +15 Мечу)." },
    { id: "asura_high_noble", name: "Высшая знать Асуры", coins: 180, int: 14, influence: 35, desc: "Мраморные залы (+180🪙, +35 влияния, +14 Знаний)." }
  ],
  ranoa: [
    { id: "ranoa_trapper", name: "Охотники Севера", coins: 12, hp: 30, northGod: 12, desc: "Закалка льдом (+30 HP, +12 Севера)." },
    { id: "ranoa_artificer", name: "Артефакторы Шарии", coins: 45, int: 10, manaBonus: 20, desc: "Мастерская (+45🪙, +20 маны)." },
    { id: "ranoa_prof_dynasty", name: "Профессора Академии", coins: 120, int: 18, manaBonus: 45, desc: "Библиотеки (+120🪙, +45 маны)." }
  ],
  demon: [
    { id: "demon_outcast", name: "Парии пустошей", coins: 3, hp: 40, northGod: 15, desc: "Среди монстров (+40 HP, +15 Севера)." },
    { id: "demon_nomad_clan", name: "Кочевой клан демонов", coins: 25, hp: 45, swordGod: 20, desc: "Стойкость (+45 HP, +20 Мечу)." },
    { id: "demon_lord_blood", name: "Потомки Демон-Лордов", coins: 90, hp: 55, manaBonus: 65, desc: "Кровь владык (+65 маны, +55 HP)." }
  ],
  great_forest: [
    { id: "forest_orphan", name: "Лесные подкидыши", coins: 5, hp: 30, northGod: 15, desc: "Жизнь на кронах (+30 HP)." },
    { id: "forest_dorudia_hunter", name: "Стая Дорудиа", coins: 22, hp: 35, swordGod: 22, desc: "Звериное чутьё (+35 HP, +22 Мечу)." },
    { id: "forest_chieftain_family", name: "Род Вождя Леса", coins: 85, hp: 45, swordGod: 30, int: 10, desc: "Потомки зверей (+85🪙, +30 Мечу)." }
  ],
  milis: [
    { id: "milis_pilgrim", name: "Паломники Древа", coins: 10, hp: 20, int: 8, desc: "Молитвы (+20 HP, +8 Знаний)." },
    { id: "milis_merchant_house", name: "Купеческий дом", coins: 95, int: 14, desc: "Торговля (+95🪙, +14 Знаний)." },
    { id: "milis_templar_dynasty", name: "Рыцари Храма", coins: 140, swordGod: 20, waterGod: 20, int: 10, desc: "Белый доспех (+140🪙, +20 Воде и Мечу)." }
  ],
  begaritt: [
    { id: "desert_pariah", name: "Изгои барханов", coins: 5, hp: 35, northGod: 18, desc: "Выживание (+35 HP, +18 Севера)." },
    { id: "desert_nomad_caravan", name: "Кочевники оазисов", coins: 35, hp: 30, northGod: 20, desc: "Караваны (+35🪙, +20 Севера)." },
    { id: "desert_labyrinth_dynasty", name: "Кладоискатели", coins: 110, swordGod: 22, int: 12, manaBonus: 25, desc: "Древние карты (+110🪙, +22 Мечу)." }
  ]
};
const FAMILY_STATUSES = REGION_FAMILY_STATUSES.asura;

const RACES = {
  human: { id: "human", name: "Человек", maxAge: 75, learnMod: 1.35, desc: "Учатся стилям на 35% быстрее всех остальных рас.", bonus: { baseMana: 25, hp: 0, int: 5, coins: 15, manaMod: 1.0 } },
  demon: { id: "demon", name: "Демон", maxAge: 220, learnMod: 1.0, desc: "Огромный сосуд маны и долгий век.", bonus: { baseMana: 65, hp: 35, int: 2, coins: 5, manaMod: 1.5 } },
  beast: { id: "beast", name: "Зверочеловек", maxAge: 95, learnMod: 1.1, desc: "Звериный инстинкт в ближнем бою.", bonus: { baseMana: 20, hp: 25, swordGod: 18, coins: 8, manaMod: 0.9 } },
  elf: { id: "elf", name: "Эльф / Полуэльф", maxAge: 320, learnMod: 0.95, desc: "Долголетие, мудрость и сродство с маной.", bonus: { baseMana: 50, hp: -5, int: 12, coins: 15, manaMod: 1.35 } },
  speld: { id: "speld", name: "Спард", maxAge: 180, learnMod: 1.05, desc: "Алый камень во лбу, прирождённые бойцы.", bonus: { baseMana: 28, hp: 40, swordGod: 24, northGod: 15, coins: 5, manaMod: 1.0 } },
  dwarf: { id: "dwarf", name: "Гном / Дворф", maxAge: 130, learnMod: 1.0, desc: "Крепкое тело и мастерство ковки.", bonus: { baseMana: 15, hp: 38, northGod: 18, coins: 25, manaMod: 0.85 } }
};

const LANGUAGES = {
  human: { id: "human", name: "Человеческий язык", desc: "Общий язык Асуры, Раноа и Милиса." },
  demon: { id: "demon", name: "Демонический язык", desc: "Скидка 20% на рынке Демонического континента + обелиски." },
  beast: { id: "beast", name: "Звериный язык", desc: "+25% к отношениям со зверолюдьми и дипломатия Леса." },
  god_fighter: { id: "god_fighter", name: "Язык Бога Бойцов", desc: "Доступ к древним боевым свиткам и Скрижали." },
  dragon: { id: "dragon", name: "Язык Драконьего Племени", desc: "Руны телепортации и Плита Драконьего Владыки." }
};

const TRAITS = [
  { id: "healthy", name: "Стальное здоровье", rarity: "common", weight: 20, hp: 35, manaBonus: 0, growthMod: 1.0, desc: "+35 HP и стойкость к болезням." },
  { id: "curious", name: "Любознательность", rarity: "common", weight: 20, int: 8, manaBonus: 5, growthMod: 1.1, desc: "+8 Знаний, книги и лекции дают +50% опыта." },
  { id: "water_aff", name: "Сродство с Водой 💧", rarity: "rare", weight: 8, manaBonus: 30, waterGod: 16, growthMod: 1.35, desc: "+30 маны, бонус к стилю Воды." },
  { id: "fire_aff", name: "Сродство с Огнем 🔥", rarity: "rare", weight: 8, manaBonus: 30, swordGod: 16, growthMod: 1.35, desc: "+30 маны, взрывной выпад меча." },
  { id: "silent_cast", name: "Беззвучный каст 🔮", rarity: "epic", weight: 5, manaBonus: 60, growthMod: 1.8, desc: "+60 маны, магия в бою вдвое дешевле и на 30% сильнее!" },
  { id: "laplace_factor", name: "Истинный Фактор Лапласа ✨", rarity: "mythic", weight: 1, manaBonus: 180, growthMod: 2.8, desc: "Огромный сосуд маны. Каналы души не затвердевают после 10 лет!" },
  { id: "miko_strength", name: "🌟 Мико: Чудовищная Сила", rarity: "mythic", weight: 2, hp: 160, swordGod: 45, northGod: 45, manaBonus: -10, growthMod: 1.6, desc: "Стальное тело как у Занобы (+160 HP, +45 к Мечу и Северу)." },
  { id: "miko_memory", name: "🌟 Мико: Взор Памяти", rarity: "mythic", weight: 2, int: 25, manaBonus: 80, growthMod: 1.9, desc: "Абсолютная память души, +80 маны, +25 Знаний." },
  { id: "miko_healing", name: "🌟 Мико: Источник Жизни", rarity: "mythic", weight: 2, hp: 100, manaBonus: 55, waterGod: 30, growthMod: 1.55, desc: "Кровь исцеления: +25 HP регенерации каждый год." },
  { id: "god_mode", name: "⚡ ЧИТ-РЕЖИМ: Истинный Творец", rarity: "mythic", weight: 0, hp: 9999, manaBonus: 9999, swordGod: 1500, waterGod: 1500, northGod: 1500, int: 500, coins: 99999, growthMod: 6.0, desc: "Режим Бога: бесконечная мощь и казна." }
];

const DEMON_EYES = {
  foresight: { id: "foresight", name: "Глаз Предвидения 👁️", color: "#38bdf8", desc: "+35% уклонения в бою, +1,800 БМ.", cp: 1800 },
  mana_sight: { id: "mana_sight", name: "Глаз Маны 🔮", color: "#c084fc", desc: "Иммунитет к ловушкам лабиринтов, +1,500 БМ.", cp: 1500 },
  appraisal: { id: "appraisal", name: "Глаз Оценки 📜", color: "#fbbf24", desc: "+30% урона по слабым местам врага, +1,400 БМ.", cp: 1400 },
  clarity: { id: "clarity", name: "Глаз Дальнего Взора 🎯", color: "#34d399", desc: "+15% крита и 100% точность, +1,200 БМ.", cp: 1200 }
};

const REGIONAL_JOBS = {
  asura: [
    { id: "asura_guard", name: "Королевская Гвардия Асуры", ranks: [
      { title: "Новобранец гарнизона", salary: 10, minAge: 14, minSword: 15, desc: "Патрулирование рынков." },
      { title: "Страж ворот Роа", salary: 22, minAge: 16, minSword: 40, desc: "Охрана ворот." },
      { title: "Рыцарь Первого круга", salary: 55, minAge: 20, minSword: 95, desc: "Эскорт знати." },
      { title: "Капитан Гвардии", salary: 130, minAge: 25, minSword: 220, desc: "Батальон Арса." },
      { title: "Лорд-Командующий Асуры", salary: 280, minAge: 32, minSword: 450, desc: "Высший военный чин." }
    ]},
    { id: "asura_bureaucrat", name: "Королевское Казначейство", ranks: [
      { title: "Переписчик свитков", salary: 12, minAge: 14, minInt: 15, desc: "Налоговые свитки." },
      { title: "Податной инспектор", salary: 28, minAge: 18, minInt: 40, desc: "Сбор податей." },
      { title: "Аудитор Короны", salary: 70, minAge: 24, minInt: 80, desc: "Ревизия имений." },
      { title: "Главный Казначей", salary: 190, minAge: 30, minInt: 150, desc: "Золотой запас." }
    ]},
    { id: "asura_court_mage", name: "Придворная Коллегия Магов", ranks: [
      { title: "Адепт барьеров", salary: 18, minAge: 15, minMagic: 40, desc: "Глифы дворца." },
      { title: "Магистр эскорта", salary: 75, minAge: 21, minMagic: 120, desc: "Стража монархов." },
      { title: "Архимаг Совета", salary: 220, minAge: 28, minMagic: 300, desc: "Верховный маг." }
    ]}
  ],
  ranoa: [
    { id: "ranoa_researcher", name: "Институт Академии Шарии", ranks: [
      { title: "Лаборант алхимика", salary: 14, minAge: 13, minMagic: 25, desc: "Кристаллы маны." },
      { title: "Ассистент кафедры", salary: 35, minAge: 17, minMagic: 60, desc: "Магические круги." },
      { title: "Профессор боевой магии", salary: 90, minAge: 22, minMagic: 150, desc: "Высшие стихии." },
      { title: "Декан Академии Шарии", salary: 250, minAge: 30, minMagic: 340, desc: "Глава коллегии Севера." }
    ]},
    { id: "ranoa_winter_scout", name: "Ледяной Дозор Севера", ranks: [
      { title: "Следопыт снегов", salary: 14, minAge: 14, minNorth: 25, desc: "Патруль буранов." },
      { title: "Охотник на бегемотов", salary: 55, minAge: 19, minSword: 90, desc: "Защита караванов." },
      { title: "Капитан Рубежа", salary: 180, minAge: 27, minSword: 260, desc: "Гарнизоны Севера." }
    ]}
  ],
  milis: [
    { id: "milis_templar", name: "Орден Рыцарей Милиса", ranks: [
      { title: "Послушник Собора", salary: 10, minAge: 13, minInt: 12, desc: "Служба в храме." },
      { title: "Рыцарь-Храмовник", salary: 32, minAge: 17, minSword: 60, desc: "Охрана паломников." },
      { title: "Инквизитор Веры", salary: 85, minAge: 23, minSword: 160, desc: "Охота на еретиков." },
      { title: "Паладин Белого Древа", salary: 230, minAge: 30, minSword: 380, desc: "Верховный меч." }
    ]},
    { id: "milis_healer_seminary", name: "Госпиталь Святого Ранга", ranks: [
      { title: "Брат милосердия", salary: 15, minAge: 13, minMagic: 25, desc: "Уход за ранеными." },
      { title: "Священник-целитель", salary: 55, minAge: 18, minMagic: 95, desc: "Снятие проклятий." },
      { title: "Епископ Исцеления", salary: 195, minAge: 28, minMagic: 280, desc: "Высшее исцеление." }
    ]}
  ],
  demon: [
    { id: "demon_hunter", name: "Охотники Пустошей", ranks: [
      { title: "Сборщик чешуи", salary: 12, minAge: 12, minSword: 12, desc: "Кости чудовищ." },
      { title: "Загонщик виверн", salary: 34, minAge: 16, minSword: 55, desc: "Охота на ящеров." },
      { title: "Охотник Чёрных Руин", salary: 85, minAge: 21, minSword: 140, desc: "Гнёзда демонов." },
      { title: "Палач Пустошей", salary: 210, minAge: 28, minSword: 350, desc: "Легендарный охотник." }
    ]}
  ],
  great_forest: [
    { id: "forest_ranger", name: "Дозор Клана Дорудиа", ranks: [
      { title: "Дозорный ветвей", salary: 11, minAge: 12, minSword: 15, desc: "Охрана крон." },
      { title: "Следопыт чащи", salary: 32, minAge: 16, minSword: 55, desc: "Сезон дождей." },
      { title: "Хранитель Древа", salary: 90, minAge: 22, minSword: 150, desc: "Защита святилищ." },
      { title: "Первый Клинок Леса", salary: 220, minAge: 30, minSword: 380, desc: "Лидер воинов леса." }
    ]}
  ],
  begaritt: [
    { id: "desert_caravan", name: "Гильдия Караван-Баши", ranks: [
      { title: "Погонщик ящеров", salary: 14, minAge: 14, minInt: 12, desc: "Доставка воды." },
      { title: "Страж каравана", salary: 38, minAge: 18, minSword: 70, desc: "Отражение налётов." },
      { title: "Проводник Лабиринтов", salary: 95, minAge: 24, minInt: 80, desc: "Древние залы." },
      { title: "Песчаный Барон", salary: 260, minAge: 32, minInt: 180, desc: "Владелец оазисов." }
    ]}
  ]
};

const UNDERGROUND_JOBS = {
  asura: { id: "underground_asura", name: "🗡️ Теневой Синдикат Роа", ranks: [
    { title: "Карманник трущоб", salary: 22, minAge: 13, minNorth: 15, risk: 0.15 },
    { title: "Скупщик реликвий", salary: 60, minAge: 17, minNorth: 40, risk: 0.22 },
    { title: "Теневой ликвидатор", salary: 160, minAge: 22, minSword: 150, risk: 0.30 },
    { title: "Глава Теней Асуры", salary: 420, minAge: 28, minSword: 320, risk: 0.35 }
  ]},
  ranoa: { id: "underground_ranoa", name: "🔮 Контрабандисты Шарии", ranks: [
    { title: "Курьер чёрного рынка", salary: 24, minAge: 13, minNorth: 15, risk: 0.14 },
    { title: "Сбытчик кристаллов", salary: 65, minAge: 17, minMagic: 50, risk: 0.20 },
    { title: "Фальшивомонетчик", salary: 170, minAge: 22, minInt: 95, risk: 0.28 },
    { title: "Барон Чёрной Магии", salary: 410, minAge: 28, minMagic: 260, risk: 0.35 }
  ]},
  demon: { id: "underground_demon", name: "💀 Мародёры Пустошей", ranks: [
    { title: "Мародёр руин", salary: 20, minAge: 12, minNorth: 15, risk: 0.16 },
    { title: "Пустынный налётчик", salary: 55, minAge: 16, minSword: 55, risk: 0.24 },
    { title: "Главарь перевала", salary: 150, minAge: 21, minSword: 160, risk: 0.32 },
    { title: "Атаман Караванов", salary: 380, minAge: 27, minSword: 330, risk: 0.38 }
  ]},
  great_forest: { id: "underground_forest", name: "🌲 Браконьеры Чащи", ranks: [
    { title: "Капканщик шкур", salary: 22, minAge: 12, minNorth: 18, risk: 0.15 },
    { title: "Браконьер святилищ", salary: 58, minAge: 16, minSword: 60, risk: 0.22 },
    { title: "Теневой ловец", salary: 160, minAge: 21, minSword: 170, risk: 0.34 },
    { title: "Хозяин Подполья Леса", salary: 400, minAge: 28, minSword: 340, risk: 0.38 }
  ]},
  milis: { id: "underground_milis", name: "🩸 Культ Чёрного Древа", ranks: [
    { title: "Тайный святотатец", salary: 26, minAge: 14, minInt: 18, risk: 0.18 },
    { title: "Скупщик реликвий", salary: 70, minAge: 18, minInt: 55, risk: 0.26 },
    { title: "Ересиарх Культа", salary: 180, minAge: 23, minMagic: 150, risk: 0.33 },
    { title: "Патриарх Теней", salary: 450, minAge: 30, minMagic: 300, risk: 0.40 }
  ]},
  begaritt: { id: "underground_begaritt", name: "🏜️ Корсары Барханов", ranks: [
    { title: "Вор колодцев", salary: 24, minAge: 13, minNorth: 18, risk: 0.15 },
    { title: "Налётчик на оазисы", salary: 65, minAge: 17, minSword: 65, risk: 0.25 },
    { title: "Хозяин тайного оазиса", salary: 175, minAge: 22, minSword: 180, risk: 0.32 },
    { title: "Султан Разбойников", salary: 440, minAge: 29, minSword: 360, risk: 0.39 }
  ]}
};

const ASURA_POLITICS = {
  factions: [
    { id: "ariel", name: "Принцесса Ариэль Анемой Асура", icon: "👑", desc: "Реформаторы, союз с Сильфи и Люком." },
    { id: "prince_first", name: "Первый Принц Гравелл", icon: "🦁", desc: "Консерваторы, старая знать и армия." },
    { id: "prince_second", name: "Второй Принц Хальфас", icon: "🐍", desc: "Тайные интриги и гильдии убийц." }
  ],
  nobilityTitles: [
    { id: "citizen", name: "Свободный гражданин", salary: 0, influence: 0 },
    { id: "knight", name: "Пожалованный Рыцарь", salary: 15, influence: 10 },
    { id: "baron", name: "Барон Провинции", salary: 45, influence: 25 },
    { id: "viscount", name: "Виконт Роа", salary: 100, influence: 60 },
    { id: "count", name: "Граф Королевства", salary: 220, influence: 120 },
    { id: "duke", name: "Герцог Асуры", salary: 550, influence: 280 }
  ]
};

// Семь Великих Сил на плотной шкале (20 000 -> 95 000 БМ)
const SEVEN_GREAT_POWERS = [
  { rank: 1, title: "Бог Техники", name: "Неизвестный Владыка", region: "ranoa", cp: 95000, hp: 45000, maxHp: 45000, isDead: false },
  { rank: 2, title: "Бог Драконов", name: "Орстед", region: "asura", cp: 85000, hp: 40000, maxHp: 40000, isDead: false },
  { rank: 3, title: "Бог Бойцов", name: "Бадигади (Золотая Броня)", region: "begaritt", cp: 65000, hp: 32000, maxHp: 32000, isDead: false },
  { rank: 4, title: "Бог Демонов", name: "Лаплас", region: "demon", cp: 48000, hp: 22000, maxHp: 22000, isDead: false },
  { rank: 5, title: "Бог Смерти", name: "Рэндольф Мариан", region: "asura", cp: 35000, hp: 15000, maxHp: 15000, isDead: false },
  { rank: 6, title: "Бог Меча", name: "Гал Фарион", region: "ranoa", cp: 26000, hp: 11000, maxHp: 11000, isDead: false },
  { rank: 7, title: "Бог Севера", name: "Александр (Кальман III)", region: "asura", cp: 20000, hp: 8500, maxHp: 8500, isDead: false }
];

const REPLACEMENT_MASTERS = {
  1: ["Механический Архонт Зетта", "Хранитель Формул Альвиус", "Искатель Первой Эпохи Крон"],
  2: ["Кровавый Дракон Валхар", "Наследник Золотой Чешуи Игнис", "Рыцарь Дракона Сайрус"],
  3: ["Чемпион Арены Кассандра", "Титан Кулака Бранн", "Король Гладиаторов Рагнар"],
  4: ["Владычица Багровой Маны Селена", "Демонический Лорд Арктур", "Беззвучный Архимаг Валдис"],
  5: ["Тень Жнеца Нокс", "Безымянный Палач Милиса", "Мастер Клинков Туманов Каэль"],
  6: ["Алый Святой Меча Джино", "Принцесса Света Изольда", "Мастер Додзё Севера Торваль"],
  7: ["Странствующий Герой Эльдрик", "Железный Трикстер Леонхард", "Рыцарь Свободной Стали Маркус"]
};

const SEVEN_POWERS_QUESTS = [
  { rank: 7, title: "Поиски Бога Севера Кальмана III", regionKey: "asura", reqCp: 14000, desc: "Расспросить в тавернах Арса о мастере, орудующем мечом в перекате." },
  { rank: 6, title: "Экспедиция на Святую Землю Меча", regionKey: "ranoa", reqCp: 20000, desc: "Подняться на снежные пики додзё Гала Фариона." },
  { rank: 5, title: "Поиски Бога Смерти Рэндольфа", regionKey: "asura", reqCp: 28000, desc: "Найти трактир на окраине королевства, где скрывается великий фехтовальщик." },
  { rank: 4, title: "Гробница Бога Демонов", regionKey: "demon", reqCp: 38000, desc: "Спуститься в жерло чёрного разлома пустоши Некросса." },
  { rank: 3, title: "Алтарь Золотой Брони Бога Бойцов", regionKey: "begaritt", reqCp: 52000, desc: "Вызвать Бадигади на поединок в сердце пустыни." },
  { rank: 2, title: "Вызов Богу Драконов Орстеду", regionKey: "asura", reqCp: 70000, desc: "Встать на пути сильнейшего воина в ущелье Красного Дракона." },
  { rank: 1, title: "Врата Бога Техники", regionKey: "ranoa", reqCp: 82000, desc: "Пробить барьер древнейшей лаборатории Первой Эпохи." }
];

const FACTION_ENDGAMES = {
  orsted: {
    id: "hitogami_void_breach",
    title: "🌌 Прорыв в Белое Пространство: Финал против Хитогами",
    desc: "Вы и Орстед вторгаетесь в измерение Бога Людей! На кону судьба Шестиликого Мира.",
    reqGen: 4, reqCp: 78000, cardClass: "void-rift-card",
    btnText: "⚔️ ВОРВАТЬСЯ В ИЗМЕРЕНИЕ ХИТОГАМИ (ФИНАЛ)",
    boss: { name: "Бог Людей (Хитогами)", cp: 98000, hp: 50000, maxHp: 50000 }
  },
  hitogami: {
    id: "orsted_ambush_finale",
    title: "👁️ Воля Человекобога: Крушение Проклятого Дракона",
    desc: "Ведомый Снами Хитогами, вы заманили Орстеда в ловушку истощения маны! Сокрушите Бога Драконов!",
    reqGen: 4, reqCp: 78000, cardClass: "hitogami-rift-card",
    btnText: "🗡️ СРАЗИТЬ ОРСТЕДА ВО ИМЯ ХИТОГАМИ (ФИНАЛ)",
    boss: { name: "Бог Драконов Орстед (В Ловушке)", cp: 95000, hp: 48000, maxHp: 48000 }
  }
};

const ESTATES = [
  { id: "cottage_buena", name: "🏡 Домик с садом в Буэне", cost: 45, income: 6, hpRegen: 8, desc: "+6🪙/г., +8 HP/г." },
  { id: "townhouse_roa", name: "🏘️ Каменный особняк в Роа", cost: 180, income: 22, hpRegen: 18, desc: "+22🪙/г., +18 HP/г." },
  { id: "milis_manor", name: "⛪ Усадьба в Милисионе", cost: 520, income: 65, hpRegen: 35, desc: "+65🪙/г., +35 HP/г." },
  { id: "sharia_castle", name: "🏰 Замок-резиденция в Шарии", cost: 1400, income: 160, hpRegen: 65, desc: "+160🪙/г., +65 HP/г., +15 маны детям." },
  { id: "asura_palace", name: "👑 Дворец в Асуре", cost: 3500, income: 420, hpRegen: 120, desc: "+420🪙/г., +120 HP/г., +25 к стилям детям." }
];

const CASTLE_UPGRADES = [
  { id: "crypt", name: "🕯️ Фамильный Склеп Предков", cost: 150, desc: "Молитва раз в 5 лет (+20 к Мечу/Магии, 100% сил)." },
  { id: "training_yard", name: "⚔️ Воинский Полигон Меча", cost: 200, desc: "Дети рода получают +25 к Мечу, а тренировки на 25% эффективнее." },
  { id: "alchemy_lab", name: "🧪 Алхимическая Оранжерея", cost: 140, desc: "Ежегодно производит +2 целебных зелья." },
  { id: "grand_vault", name: "🪙 Неприступная Казна", cost: 260, desc: "+15% к прибыли караванов и -5% риска." },
  { id: "trophy_hall", name: "🐉 Зал Трофеев Драконов", cost: 400, desc: "+50 Славы отряда и +1,200 БМ авторитета." }
];

const CARAVAN_ROUTES = [
  { id: "caravan_local", name: "🛒 Местный тракт Фитоа", cost: 35, reward: 65, risk: 0.10, desc: "Доставка зерна (+30🪙)." },
  { id: "caravan_ranoa", name: "❄️ Снежный караван в Шарию", cost: 110, reward: 220, risk: 0.22, desc: "Перевозка мифрила (+110🪙)." },
  { id: "caravan_milis", name: "⛪ Морской конвой в Милис", cost: 280, reward: 540, risk: 0.38, desc: "Шелка и реликвии (+260🪙)." },
  { id: "caravan_begaritt", name: "🏜️ Золотой Караван Бегаритта", cost: 700, reward: 1450, risk: 0.50, desc: "Сквозь пустыню (+750🪙)!" }
];

// Испытания Хаос Брейкера. reqLine — какая сюжетная линия должна быть начата,
// чтобы испытание открылось: путь в крепость идёт через историю, а не через БМ.
const PERUGIUS_TRIALS = [
  { rank: 1, name: "Испытание Первого Духа (Алхор)", reqCp: 5000, line: "pg_spirit",
    reqText: "Начать путь: «🐉 Первый Дух Алхор»",
    rewardText: "Признание рыцарей небес (+80 Знаний, +40 макс. маны)" },
  { rank: 2, name: "Поединок с Золотым Рыцарем Сильфидом", reqCp: 14000, line: "pg_sylph",
    reqText: "Начать путь: «⚔️ Золотой Рыцарь Сильфид»",
    rewardText: "Благословение Дракона (+300 макс. HP, +2,500 БМ)" },
  { rank: 3, name: "Аудиенция у Перугиуса", reqCp: 32000, line: "pg_master",
    reqText: "Начать путь: «👑 Аудиенция у Перугиуса»",
    rewardText: "Драконье Имя и Фактор Лапласа (+1,000🪙, +2 к отношениям Сил)" }
];

// Ветви Грейрат: у каждой свой характер, свой союз и своя цена.
// allyCp — сколько мощи даёт союз, trait — что даёт ветвь, если встать за неё.
const GREYRAT_BRANCHES = [
  { id: "boreas", name: "Северная Ветвь: Бореас Грейрат", region: "Роа", leader: "Саурос Бореас Грейрат",
    desc: "Яростные мечники и крепости. Не прощают трусости и уважают тех, кто выстоял.",
    gift: "sword", giftText: "+25 к опыту Бога Меча", allyCp: 400, line: "grd_boreas" },
  { id: "notos", name: "Южная Ветвь: Нотос Грейрат", region: "Милис/Асура", leader: "Амарант Нотос Грейрат",
    desc: "Богатство и магия воды. Платит вперёд и помнит каждую монету.",
    gift: "water", giftText: "+25 к опыту Бога Воды", allyCp: 250, line: "grd_notos" },
  { id: "zephyrus", name: "Восточная Ветвь: Зефирос Грейрат", region: "Арс", leader: "Филипп Зефирос Грейрат",
    desc: "Шпионаж и тайные договоры. Их союз невидим — и поэтому дороже.",
    gift: "intellect", giftText: "+15 Знаний", allyCp: 200, line: null },
  { id: "euros", name: "Западная Ветвь: Эурос Грейрат", region: "Западные порты", leader: "Гарольд Эурос Грейрат",
    desc: "Торговый флот и верфи. Деньги, которые сами себя считают.",
    gift: "coins", giftText: "+150🪙 каждый год", allyCp: 150, line: null }
];

const FIRST_WAR_TABLETS = [
  { id: "tab_human", name: "Скрижаль Бога Людей", regionKey: "asura", reqLang: "human", desc: "Катакомбы дворца Арс." },
  { id: "tab_demon", name: "Обелиск Бога Демонов", regionKey: "demon", reqLang: "demon", desc: "Пески пустоши Некросса." },
  { id: "tab_dragon", name: "Плита Драконьего Владыки", regionKey: "begaritt", reqLang: "dragon", desc: "Алтарь Лабиринта Бегаритта." },
  { id: "tab_beast", name: "Стела Священного Зверя", regionKey: "great_forest", reqLang: "beast", desc: "Сердце Великого Древа." },
  { id: "tab_fighter", name: "Скрижаль Бога Бойцов", regionKey: "ranoa", reqLang: "god_fighter", desc: "Тайная зала Академии Шарии." }
];

const REGIONS = {
  asura: { mapLabel: "Асура", name: "🏰 Королевство Асура", travelCost: 25, mapX: 165, mapY: 108, color: "#fbbf24", desc: "Сердце мира, столица Арс и плодородные земли Фитоа.", origins: [
    { id: "boreas", name: "Дом Бореас Грейрат", coins: 110, manaBonus: 15, int: 5, swordGod: 12, log: "Вы открыли глаза в крепости Роа ветви Бореас." },
    { id: "notos", name: "Дом Нотос Грейрат", coins: 95, manaBonus: 18, int: 6, waterGod: 12, log: "Мраморные залы юга Асуры." },
    { id: "knight_buena", name: "Рыцари деревни Буэна", coins: 25, manaBonus: 8, swordGod: 10, int: 3, log: "Уютный дом у пшеничных полей." },
    { id: "slums_ars", name: "Трущобы столицы Арс", coins: 4, manaBonus: 5, northGod: 14, int: 2, log: "Суровые переулки столицы." }
  ]},
  ranoa: { mapLabel: "Раноа", name: "❄️ Королевства Раноа", travelCost: 45, mapX: 168, mapY: 42, color: "#38bdf8", desc: "Северные земли, Шария и Святая Земля Меча.", origins: [
    { id: "academy_prof", name: "Семья Профессора", coins: 75, manaBonus: 30, int: 12, log: "Вы выросли среди фолиантов Шарии." },
    { id: "magic_guild", name: "Цех Артефакторов", coins: 45, manaBonus: 20, int: 8, log: "Мастерская кристаллов маны." },
    { id: "winter_hunter", name: "Охотники ледников", coins: 12, manaBonus: 8, northGod: 14, int: 3, log: "Ледяной ветер Севера." }
  ]},
  demon: { mapLabel: "Демон. Континент", name: "🌋 Демонический Континент", travelCost: 75, mapX: 288, mapY: 66, color: "#ef4444", desc: "Багровые пустоши, монстры и Город Ветров.", origins: [
    { id: "migurd_village", name: "Деревня Мигурд", coins: 10, manaBonus: 40, int: 8, log: "Сапфировые волосы и телепатия." },
    { id: "wind_port", name: "Контрабандисты Ветров", coins: 35, manaBonus: 12, northGod: 16, int: 5, log: "Шум портовых таверн." }
  ]},
  great_forest: { mapLabel: "Великий Лес", name: "🌲 Великий Лес", travelCost: 40, mapX: 222, mapY: 145, color: "#10b981", desc: "Вековые кроны, родина клана Дорудиа.", origins: [
    { id: "dorudia", name: "Клан Дорудиа", coins: 18, manaBonus: 12, swordGod: 20, int: 4, log: "Дом среди гигантских ветвей." },
    { id: "scout", name: "Лесные следопыты", coins: 8, manaBonus: 8, northGod: 18, int: 4, log: "Бесшумные прыжки по кронам." }
  ]},
  milis: { mapLabel: "Милис", name: "⛪ Святая Земля Милис", travelCost: 45, mapX: 168, mapY: 178, color: "#e2e8f0", desc: "Белокаменная столица у Священного Древа.", origins: [
    { id: "temple_knight", name: "Рыцари Храма", coins: 60, manaBonus: 15, waterGod: 18, int: 5, log: "Белый плащ Святого Милиса." },
    { id: "merchant", name: "Торговый дом Милиса", coins: 80, manaBonus: 5, int: 8, log: "Шелка, специи и караваны." }
  ]},
  begaritt: { mapLabel: "Бегаритт", name: "🏜️ Континент Бегаритт", travelCost: 90, mapX: 62, mapY: 162, color: "#f59e0b", desc: "Раскалённая пустыня и смертоносные лабиринты.", origins: [
    { id: "dungeon_raider", name: "Искатели Лабиринтов", coins: 55, manaBonus: 18, swordGod: 15, int: 6, log: "Жизнь у входа в лабиринт." },
    { id: "desert_nomad", name: "Кочевники Барханов", coins: 15, manaBonus: 8, northGod: 20, int: 4, log: "Сквозь бури и пески." }
  ]}
};

const MAP_ROUTES = [
  ["ranoa", "asura"], ["asura", "great_forest"], ["great_forest", "milis"],
  ["asura", "milis"], ["ranoa", "demon"], ["milis", "begaritt"], ["asura", "begaritt"]
];

const SHOP_ITEMS = [
  { id: "bronze_dagger", type: "weapon", name: "🗡️ Бронзовый кинжал", cost: 15, cp: 45, desc: "+45 БМ." },
  { id: "iron_sword", type: "weapon", name: "⚔️ Железный палаш", cost: 40, cp: 130, desc: "+130 БМ." },
  { id: "oak_staff", type: "weapon", name: "🪄 Посох из ветви Энта", cost: 65, cp: 210, desc: "+210 БМ." },
  { id: "steel_rapier", type: "weapon", name: "🤺 Асурианская рапира", cost: 120, cp: 380, desc: "+380 БМ." },
  { id: "heavy_claymore", type: "weapon", name: "🪓 Двуручный клеймор севера", cost: 220, cp: 680, desc: "+680 БМ." },
  { id: "dragon_blade", type: "weapon", name: "🗡️ Клинок из кости Дракона", cost: 480, cp: 1400, desc: "+1,400 БМ." },
  { id: "staff_arcane", type: "weapon", name: "🔮 Посох Магического Океана", cost: 850, cp: 2400, desc: "+2,400 БМ." },
  { id: "phoenix_spear", type: "weapon", name: "🔱 Копьё Спардов", cost: 1300, cp: 3500, desc: "+3,500 БМ." },
  { id: "aqua_heartia", type: "weapon", name: "🌟 Посох Водного Океана", cost: 1900, cp: 4800, desc: "+4,800 БМ." },
  { id: "god_slayer_sword", type: "weapon", name: "⚡ Меч Рассекатель Света", cost: 3200, cp: 7500, desc: "Клинок школы Бога (+7,500 БМ)." },
  { id: "apprentice_robe", type: "armor", name: "🧥 Мантия ученика", cost: 12, cp: 35, hp: 10, desc: "+35 БМ, +10 макс. HP." },
  { id: "leather_armor", type: "armor", name: "🛡️ Кожаный доспех", cost: 35, cp: 110, hp: 25, desc: "+110 БМ, +25 макс. HP." },
  { id: "steel_plate", type: "armor", name: "🛡️ Стальной нагрудник", cost: 130, cp: 420, hp: 55, desc: "+420 БМ, +55 макс. HP." },
  { id: "mithril_chain", type: "armor", name: "⛓️ Мифриловая кольчуга", cost: 320, cp: 1000, hp: 100, desc: "+1,000 БМ, +100 макс. HP." },
  { id: "dragon_scale", type: "armor", name: "🐉 Доспех Красного Дракона", cost: 1100, cp: 3200, hp: 220, desc: "+3,200 БМ, +220 макс. HP." },
  { id: "royal_aegis", type: "armor", name: "👑 Королевский Эгид Асуры", cost: 2400, cp: 5800, hp: 380, desc: "+5,800 БМ, +380 макс. HP." },
  { id: "magic_armor", type: "armor", name: "🤖 Магическая Броня «Версия 1»", cost: 4500, cp: 9500, hp: 650, desc: "Экзоскелет титанов (+9,500 БМ, +650 макс. HP)." },
  { id: "ring_mana", type: "accessory", name: "💍 Кольцо Концентрации Маны", cost: 85, cp: 260, desc: "+260 БМ." },
  { id: "boots_wind", type: "accessory", name: "👢 Сапоги Ветроступа", cost: 260, cp: 750, desc: "+750 БМ." },
  { id: "laplace_gem", type: "accessory", name: "💎 Самоцвет Демон-Дракона", cost: 1100, cp: 2800, desc: "+2,800 БМ." },
  { id: "prosthetic_arm", type: "accessory", name: "🦾 Протез из Сплава Зари", cost: 650, cp: 1600, desc: "Снимает штраф за потерю руки (+1,600 БМ)." },
  { id: "heal_potion", type: "potion", name: "🧪 Зелье Исцеления", cost: 15, heal: 60, desc: "+60 HP в бою или вне боя." }
];

const DUNGEONS = [
  { id: "dung_cellar", name: "🕳️ Катакомбы Гоблинов", reqRank: "F", maxFloors: 5, cpBase: 160, dropArtifact: "bronze_dagger", desc: "Сырые норы под деревней Буэна." },
  { id: "dung_ruins", name: "🏛️ Руины Павших Рыцарей", reqRank: "D", maxFloors: 8, cpBase: 650, dropArtifact: "steel_rapier", desc: "Каменные залы с ловушками." },
  { id: "dung_teleport", name: "🌀 Лабиринт Телепортации", reqRank: "B", maxFloors: 12, cpBase: 3500, dropArtifact: "laplace_gem", desc: "Смертоносный лабиринт в Бегаритте." },
  { id: "dung_dragon", name: "🐉 Бездна Драконьего Гребня", reqRank: "S", maxFloors: 15, cpBase: 14000, dropArtifact: "dragon_scale", desc: "Гнездо древних виверн и Короля Драконов." }
];

const ALL_GUILD_QUESTS = [
  { id: "q_f1", rank: "F", name: "🐀 Крысы в амбарах", enemy: "Крыса-мутант", cp: 90, hp: 50, reward: 10, gp: 8 },
  { id: "q_f2", rank: "F", name: "🌿 Травы у волчьих нор", enemy: "Степной волчонок", cp: 120, hp: 60, reward: 14, gp: 10 },
  { id: "q_e1", rank: "E", name: "🐗 Клыкастые Кабаны", enemy: "Клыкастый Вепрь", cp: 260, hp: 110, reward: 25, gp: 15 },
  { id: "q_e2", rank: "E", name: "🍄 Кислотные Слизни", enemy: "Кислотный Слизень", cp: 320, hp: 130, reward: 32, gp: 18 },
  { id: "q_d1", rank: "D", name: "🐺 Двуглавые Волки", enemy: "Вожак Двуглавых", cp: 680, hp: 230, reward: 60, gp: 25 },
  { id: "q_d2", rank: "D", name: "🧌 Набег гоблинов", enemy: "Гоблин-главарь", cp: 880, hp: 280, reward: 78, gp: 30 },
  { id: "q_c1", rank: "C", name: "🐍 Багровые Кобры", enemy: "Багровая Кобра", cp: 1600, hp: 480, reward: 140, gp: 45 },
  { id: "q_c2", rank: "C", name: "🧟 Зачистка склепа", enemy: "Рыцарь-скелет", cp: 2100, hp: 580, reward: 185, gp: 50 },
  { id: "q_b1", rank: "B", name: "🗿 Каменный Энт", enemy: "Каменный Энт", cp: 4200, hp: 1100, reward: 320, gp: 80 },
  { id: "q_b2", rank: "B", name: "🦂 Императорский Скорпион", enemy: "Императорский Скорпион", cp: 5500, hp: 1400, reward: 420, gp: 95 },
  { id: "q_a1", rank: "A", name: "🦅 Ледяная Виверна", enemy: "Ледяная Виверна", cp: 9200, hp: 2600, reward: 680, gp: 150 },
  { id: "q_a2", rank: "A", name: "🦍 Снежный Бегемот", enemy: "Пещерный Бегемот", cp: 11500, hp: 3400, reward: 850, gp: 180 },
  { id: "q_s1", rank: "S", name: "🐉 Красный Дракон", enemy: "Красный Дракон", cp: 16000, hp: 6200, reward: 1400, gp: 300 },
  { id: "q_s2", rank: "S", name: "💀 Архилич Бездны", enemy: "Архилич Бездны", cp: 19500, hp: 8200, reward: 1850, gp: 450 }
];

const CANON_NPCS = [
  { id: "sylphie", name: "Сильфиетта", gender: "female", race: "Эльф / Полуэльф", role: "Подруга детства • Маг без слов", cp: 900, region: "asura", minAge: 4, maxAge: 14, baseChance: 0.25 },
  { id: "roxy", name: "Рокси Мигурдия", gender: "female", race: "Демон", role: "Наставница • Маг Святого Ранга", cp: 2800, region: "asura", minAge: 5, maxAge: 16, baseChance: 0.22 },
  { id: "eris", name: "Эрис Бореас Грейрат", gender: "female", race: "Человек", role: "Леди Бореас • Бешеная мечница", cp: 1800, region: "asura", minAge: 7, maxAge: 18, baseChance: 0.22 },
  { id: "ghislaine", name: "Гилен Дедольдия", gender: "female", race: "Зверочеловек", role: "Король Меча", cp: 9500, region: "asura", minAge: 7, maxAge: 25, baseChance: 0.16 },
  { id: "ruijerd", name: "Руджерд Спардия", gender: "male", race: "Спард", role: "Тупик • Воин сотен битв", cp: 11500, region: "demon", minAge: 10, maxAge: 35, baseChance: 0.22 },
  { id: "cliff", name: "Клифф Гриммор", gender: "male", race: "Человек", role: "Гениальный экзорцист Милиса", cp: 2200, region: "milis", minAge: 10, maxAge: 22, baseChance: 0.20 },
  { id: "zanoba", name: "Заноба Широне", gender: "male", race: "Человек", role: "Мико чудовищной силы", cp: 6800, region: "ranoa", minAge: 12, maxAge: 28, baseChance: 0.20 }
];

// Личные квесты канонических спутников (открываются при дружбе >= 80%)
const CANON_QUESTS = {
  roxy: { title: "Тайна Святого Водяного Круга", rewardText: "Рокси подарила вам Посох Водного Океана и обучила Святой магии!", action: (p) => {
    const st = SHOP_ITEMS.find(i => i.id === "aqua_heartia");
    if (st) p.inventory.push({ ...st });
    p.magicExp += 80;
  }},
  sylphie: { title: "Секрет Беззвучного Каста", rewardText: "Сильфи научила вас тончайшему контролю маны (+60 Магии, +45 макс. маны)!", action: (p) => { p.magicExp += 60; p.maxMana += 45; } },
  eris: { title: "Спарринг Бешеного Пса", rewardText: "Эрис выбила из вас весь страх в дуэли (+90 к Мечу, +30 HP)!", action: (p) => { p.swordGodExp += 90; p.maxHp += 30; } },
  ghislaine: { title: "Урок Короля Меча", rewardText: "Гилен показала стойку Меча Света (+110 к Мечу)!", action: (p) => { p.swordGodExp += 110; } },
  ruijerd: { title: "Клятва Воина-Спарда", rewardText: "Руджерд передал боевые приёмы (+80 Севера, +80 Славы отряда)!", action: (p) => { p.northGodExp += 80; p.squadFame += 80; } },
  cliff: { title: "Благословение Экзорциста", rewardText: "Клифф снял все ваши проклятия и излечил любые травмы (+40 Знаний)!", action: (p) => { p.injuries = []; p.hp = p.maxHp; p.intellect += 40; } },
  zanoba: { title: "Чертёж Магической Брони", rewardText: "Заноба подарил вам уникальную броню-прототип (+150 HP, +300🪙)!", action: (p) => { p.maxHp += 150; p.coins += 300; } }
};

const SCHOOLS = [
  { id: "ranoa_academy", name: "🎓 Магическая Академия Раноа", regionKey: "ranoa", region: "Раноа (Шария)", minAge: 13, cost: 120, desc: "Центр высшей магии и беззвучного каста." },
  { id: "asura_academy", name: "🏰 Королевская Академия Асуры", regionKey: "asura", region: "Асура (Арс)", minAge: 12, cost: 160, desc: "Элитное заведение знати и рыцарей." },
  { id: "sword_sanctuary", name: "🗡️ Святая Земля Меча", regionKey: "ranoa", region: "Раноа (Север)", minAge: 10, cost: 80, desc: "Тренировки в снежных пиках у Бога Меча." },
  { id: "milis_seminary", name: "⛪ Семинария Святого Милиса", regionKey: "milis", region: "Милис (Милисион)", minAge: 11, cost: 90, desc: "Священная магия лечения и барьеры." }
];

const STORY_ACTIVITIES = [
  // --- 1-Я ЖИЗНЬ / ЭПОХА КАТАКЛИЗМА (20 ВЕХ) ---
  { id: "s1_awakening", era: "first", age: 1, name: "📖 1. Пробуждение памяти прошлой жизни", desc: "Осознать себя в новом мире и ощутить потоки маны.",
    action: (p) => { p.intellect += 3; p.maxMana += 12; return "Вы вспомнили прошлый мир и начали расширять сосуд души (+3 Знаний, +12 макс. маны)!"; } },
  { id: "s1_books", era: "first", age: 3, name: "📖 2. Тайное чтение фолиантов отца", desc: "Добраться до запертого шкафа с трактатами по магии.",
    action: (p) => { p.intellect += 5; p.magicExp += 12; return "Вы освоили грамматику и азы заклинаний (+5 Знаний, +12 Магии)!"; } },
  { id: "s1_waterball", era: "first", age: 5, name: "📖 3. Первый беззвучный Водяной Шар", desc: "Сотворить магию силой воображения без слов во дворе.",
    action: (p) => { p.magicExp += 22; p.maxMana += 25; return "Водяной шар разнёс стену двора! Родители в шоке (+22 Магии, +25 макс. маны)!"; } },
  { id: "s1_mentor", era: "first", age: 6, name: "📖 4. Приезд странствующей наставницы", desc: "Демон-маг или ветеран меча стучится в двери дома.",
    action: (p) => { p.magicExp += 18; p.swordGodExp += 10; p.intellect += 5; return "Наставник открыл секреты стихий и дисциплины (+18 Магии, +10 Мечу, +5 Знаний)!"; } },
  { id: "s1_roa", era: "first", age: 7, name: "📖 5. Путь в крепость Роа (Служба гувернёром)", desc: "Отправиться в земли Бореас для обучения строптивой наследницы.",
    action: (p) => { p.coins += 45; p.swordGodExp += 15; p.asuraInfluence += 10; return "Походный плащ, монеты и уважение дома Бореас (+45🪙, +15 Мечу, +10 влияния)!"; } },
  { id: "s1_red_omen", era: "first", age: 9, name: "🔴 6. Багровое знамение в небе Фитоа", desc: "Огромный вихрь маны сгущается над облаками.",
    action: (p) => { p.maxMana += 18; p.intellect += 5; return "Вы зарисовали аномалию в дневник (+18 макс. маны, +5 Знаний)!"; } },
  { id: "s1_calamity", era: "first", age: 10, name: "⚡ 7. КАТАКЛИЗМ МАНЫ ФИТОА", desc: "Ослепительная вспышка разорвала небо и смела целую провинцию!",
    action: (p, ws) => {
      p.calamityTriggered = true;
      if (ws) ws.calamityOccurred = true;
      const targets = ["demon", "begaritt", "great_forest"];
      const newReg = targets[Math.floor(Math.random() * targets.length)];
      p.currentRegionKey = newReg;
      p.relations.forEach(r => { if (r.isFamily) r.isLost = true; });
      return `💥 <b>КАТАКЛИЗМ МАНЫ!</b> Вас выбросило на <b>${REGIONS[newReg].name}</b>! Семья рассеяна по свету!`;
    }
  },
  { id: "s1_hitogami_first_dream", era: "first", age: 11, name: "👁️ 8. Первый Сон Белого Пространства", desc: "Во сне возник безликий силуэт: «Я — Бог Людей Хитогами...»",
    choices: [
      { text: "Прислушаться к совету Хитогами (+55🪙, +15 Магии)", action: (p) => {
        p.hitogamiTrust += 15; p.coins += 55; p.magicExp += 15;
        return "Вы последовали голосу из сна и нашли схрон (+55🪙, +15 Магии, Доверие Хитогами +15)!";
      }},
      { text: "Отказать снам (+10 Знаний, +15 Севера)", action: (p) => {
        p.hitogamiTrust -= 10; p.intellect += 10; p.northGodExp += 15;
        return "Хитогами усмехнулся и исчез. Вы пробились сами (+10 Знаний, +15 Севера)!";
      }}
    ]
  },
  { id: "s1_demon_continent", era: "first", age: 12, name: "🌋 9. Переход через Багровые Пустоши", desc: "Выжить среди монстров и встретить воина-Спарда.",
    action: (p) => { p.swordGodExp += 22; p.northGodExp += 18; p.maxHp += 20; return "Суровые бои на пустошах закалили тело (+22 Мечу, +18 Севера, +20 HP)!"; } },
  { id: "s1_ocean_crossing", era: "first", age: 13, name: "🚢 10. Переправа в Милисион", desc: "Добраться до порта Ветров и переплыть океан.",
    action: (p) => {
      let found = p.relations.find(r => r.isLost);
      if (found) { found.isLost = false; return `🎉 В лагере Милиса вы чудом нашли <b>${found.name}</b>!`; }
      p.coins += 40; return "Вы переплыли океан, подрабатывая на судне (+40🪙).";
    }
  },
  { id: "s1_orsted_clash", era: "first", age: 14, name: "🐉 11. Встреча в Ущелье Красного Дракона", desc: "Перед вами возникает Бог Драконов Орстед. Проклятие душит вас!",
    choices: [
      { text: "Упасть на колени и промолчать (-20 HP, +8 Знаний)", action: (p) => { p.hp = Math.max(10, p.hp - 20); p.intellect += 8; return "Вы пережили ледяной взгляд Орстеда."; } },
      { text: "Упомянуть Хитогами! (-70 HP, +25 маны)", action: (p) => { p.hp = Math.max(5, p.hp - 70); p.maxMana += 25; return "Орстед пробил вам грудь, но пощадил в последний миг!"; } }
    ]
  },
  { id: "s1_fitoa_truth", era: "first", age: 15, name: "🏚️ 12. Руины родины и обелиск пропавших", desc: "Вернуться на пепелище Фитоа и прочесть списки погибших.",
    action: (p) => { p.intellect += 10; p.coins += 25; return "Вы дали клятву защищать оставшихся близких (+10 Знаний, +25🪙)."; } },
  { id: "s1_god_crossroads", era: "first", age: 16, name: "⚖️ 13. РАСПУТЬЕ БОГОВ: Орстед или Хитогами?", desc: "Сон Хитогами и тень Проклятого Дракона требуют выбора стороны!",
    choices: [
      { text: "🐉 Встать под знамя Орстеда (Союзник Дракона, Свет)", action: (p) => {
        p.dynastyFaction = "orsted"; p.factionProgress += 20; p.reputation += 20; p.swordGodExp += 25; p.magicExp += 25;
        return "Вы избрали путь союзника Бога Драконов! (+25 Мечу и Магии, +20 Света)!";
      }},
      { text: "👁️ Принять Сны Хитогами (Апостол Снов, +200🪙, +40 маны)", action: (p) => {
        p.dynastyFaction = "hitogami"; p.hitogamiTrust += 40; p.reputation -= 15; p.coins += 200; p.maxMana += 40;
        return "Вы стали Апостолом Снов! Хитогами раскрыл тайные клады (+200🪙, +40 макс. маны)!";
      }}
    ]
  },
  { id: "s1_academy_years", era: "first", age: 18, name: "🎓 14. Триумф в Академии Шарии", desc: "Дуэль со зверолюдьми и признание особого статуса студента.",
    action: (p) => { p.magicExp += 30; p.intellect += 15; p.squadFame += 30; return "Вы покорили Академию (+30 Магии, +15 Знаний, +30 Славы)!"; } },
  { id: "s1_begaritt_letter", era: "first", age: 21, name: "🏜️ 15. Письмо о беде в Лабиринте Бегаритта", desc: "Родные в ловушке пустыни! Пора идти через телепорт.",
    action: (p) => { p.dungeonProgress["dung_teleport"] = Math.max(p.dungeonProgress["dung_teleport"] || 1, 5); p.swordGodExp += 25; return "Вы пробились вглубь Лабиринта (+25 Мечу)!"; } },
  { id: "s1_labyrinth_guardian", era: "first", age: 23, name: "💎 16. Падение Магической Гидры", desc: "Решающая схватка в сердце лабиринта ради спасения семьи.",
    action: (p) => {
      let lost = p.relations.find(r => r.isLost);
      if (lost) lost.isLost = false;
      p.coins += 240; p.magicExp += 35;
      return "Гидра повержена! Вы спасли родных и вынесли сокровища (+240🪙, +35 Магии)!";
    }
  },
  { id: "s1_asura_throne", era: "first", age: 26, name: "👑 17. Битва за Трон Асуры", desc: "Столкновение клинков в столице Арс и политический переворот.",
    action: (p) => { p.asuraInfluence += 40; p.coins += 180; p.swordGodExp += 30; return "Ключевая роль в королевском перевороте (+40 влияния, +180🪙, +30 Мечу)!"; } },
  { id: "s1_apostle_clash", era: "first", age: 29, name: "🌑 18. Ночь Теней: Удар Апостола", desc: "Враждебный Бог подослал убийцу, чтобы переломить вашу судьбу.",
    action: (p) => {
      if (p.dynastyFaction === "hitogami") { p.coins += 220; p.northGodExp += 35; return "По Сну Хитогами вы перебили лазутчиков Орстеда (+220🪙, +35 Севера)!"; }
      p.swordGodExp += 35; p.magicExp += 35; return "Вы отбили ночную засаду Апостола (+35 Мечу и Магии)!";
    }
  },
  { id: "s1_magic_armor", era: "first", age: 34, name: "🤖 19. Чертежи Магической Брони", desc: "Соединить гномью инженерию и мана-кристаллы.",
    action: (p) => { p.intellect += 25; p.maxMana += 55; p.maxHp += 50; return "Чертежи боевой брони вписаны в архивы Шарии (+25 Знаний, +55 маны, +50 HP)!"; } },
  { id: "s1_elder_legacy", era: "first", age: 50, name: "📜 20. Завет Основателя Династии", desc: "Заложить фундамент влияния рода на грядущие столетия.",
    action: (p) => { p.asuraInfluence += 45; p.squadFame += 70; p.intellect += 20; return "Летописи рода запечатаны: потомки не забудут ваш путь (+45 влияния, +70 Славы)!"; } },

  // --- БУДУЩИЕ ЖИЗНИ И ВЕКА ВПЕРЁД (430 - 800+ ГГ., БЕЗ ВОЙНЫ С ЛАПЛАСОМ) ---
  { id: "f_child_archives", era: "future", minYear: 430, age: 4, name: "📚 Наследие: Дневники первых героев", desc: "В родовом сундуке хранятся записи времён Катаклизма Фитоа.",
    action: (p) => { p.intellect += 10; p.maxMana += 18; return "Вы изучили опыт прошлого поколения (+10 Знаний, +18 маны)!"; } },
  { id: "f_hitogami_whisper", era: "future", minYear: 430, age: 12, name: "👁️ Сон Хитогами: Зов Нового Поколения", desc: "Человекобог вновь пробирается в сны смертных: «Твои предки оставили след...»",
    choices: [
      { text: "Присягнуть Снам Хитогами (+220🪙, +40 маны)", action: (p) => {
        p.dynastyFaction = "hitogami"; p.hitogamiTrust += 35; p.reputation -= 15; p.coins += 220; p.maxMana += 40;
        return "Вы вступили в круг Апостолов Хитогами (+220🪙, +40 маны)!";
      }},
      { text: "Встать под знамя Орстеда (+30 Мечу и Магии)", action: (p) => {
        p.dynastyFaction = "orsted"; p.factionProgress += 25; p.reputation += 20; p.swordGodExp += 30; p.magicExp += 30;
        return "Вы отвергли Сны Пустоты и принесли клятву Орстеду (+30 Мечу и Магии)!";
      }}
    ]
  },
  { id: "f_fitoa_rebuild", era: "future", minYear: 430, maxYear: 520, age: 18, name: "🌾 Возрождение Провинции Фитоа", desc: "Отстройка разрушенных земель и зачистка бродячих чудовищ.",
    action: (p) => { p.coins += 160; p.asuraInfluence += 25; p.reputation += 15; return "Выросли новые города (+160🪙, +25 влияния, +15 Света)!"; } },
  { id: "f_orsted_network", era: "future", minYear: 440, reqFaction: "orsted", age: 24, name: "🐉 Тайная сеть Орстеда в Милисе", desc: "Охота на теневых агентов Белого Пространства.",
    action: (p) => { p.factionProgress += 30; p.intellect += 20; p.coins += 180; return "Ячейка Апостолов раскрыта (+180🪙, +20 Знаний)!"; } },
  { id: "f_hitogami_sabotage", era: "future", minYear: 440, reqFaction: "hitogami", age: 24, name: "👁️ Диверсия по Сну Хитогами", desc: "Человекобог указал на уязвимость союзников Орстеда.",
    action: (p) => { p.hitogamiTrust += 30; p.reputation -= 15; p.coins += 320; p.northGodExp += 35; return "Операция прошла бесшумно (+320🪙, +35 Севера)!"; } },
  { id: "f_c5_skyships", era: "future", minYear: 500, maxYear: 620, age: 20, name: "⛵ VI век: Магические Баржи", desc: "Учёные Шарии запустили первые воздушные суда на мана-кристаллах.",
    action: (p) => { p.intellect += 25; p.maxMana += 45; return "Освоена навигация небесных судов (+25 Знаний, +45 маны)!"; } },
  { id: "f_c5_powers_audit", era: "future", minYear: 500, age: 30, name: "🏆 Передел Монумента Семи Сил", desc: "Имена на каменной плите вызывают трепет. Пора вписать своё!",
    action: (p) => { p.swordGodExp += 50; p.squadFame += 90; return "Мастера мира следят за вашим ростом (+50 Мечу, +90 Славы)!"; } },
  { id: "f_c6_mana_crisis", era: "future", minYear: 600, maxYear: 720, age: 22, name: "❄️ VII век: Истощение Жил Севера", desc: "Кристаллы Раноа гаснут — нужно спуститься в глубины за сердцем земли.",
    action: (p) => { p.maxMana += 80; p.magicExp += 55; return "Вы стабилизировали северные жилы (+80 макс. маны, +55 Магии)!"; } },
  { id: "f_c6_hitogami_prophet", era: "future", minYear: 600, reqFaction: "hitogami", age: 35, name: "👁️ Пророк Седьмого Столетия", desc: "Сны Хитогами переписывают политическую карту континентов.",
    action: (p) => { p.asuraInfluence += 65; p.coins += 750; return "Короли и архимаги слушаются ваших предсказаний (+65 влияния, +750🪙)!"; } },
  { id: "f_c6_orsted_relics", era: "future", minYear: 600, reqFaction: "orsted", age: 35, name: "🐉 Архив Первого Бога Драконов", desc: "Орстед доверил вам часть древних рун защиты мира.",
    action: (p) => { p.swordGodExp += 60; p.waterGodExp += 60; p.maxHp += 120; return "Древнее искусство Драконов (+60 к стилям, +120 HP)!"; } },
  { id: "f_c7_eternal_dynasty", era: "future", minYear: 700, age: 28, name: "🏛️ VIII+ век: Бессмертный Род", desc: "Ваша фамилия известна от Асуры до пустошей Бегаритта.",
    action: (p) => { p.coins += 1200; p.squadFame += 150; p.maxMana += 100; return "Дома мира присылают дары (+1,200🪙, +150 Славы, +100 маны)!"; } },
  { id: "f_c7_void_echo", era: "future", minYear: 700, age: 42, name: "🌌 Отголосок Белого Пространства", desc: "Спустя столетия после Катаклизма барьер между мирами истончился.",
    action: (p) => { p.magicExp += 80; p.swordGodExp += 80; p.intellect += 40; return "Вы заглянули за грань мироздания (+80 Магии и Мечу, +40 Знаний)!"; } }
];

const ACTIVITIES = [
  { id: "baby_crawl", category: "childhood", name: "👶 Ползать и изучать комнаты", minAge: 0, maxAge: 3, cost: 0, apCost: 1, desc: "Развивает восприятие мира.", action: (p) => { p.intellect += 1; return "Вы изучали комнаты дома (+1 Знаний)."; } },
  { id: "baby_peekaboo", category: "childhood", name: "🍼 Играть с родителями", minAge: 0, maxAge: 2, cost: 0, apCost: 1, desc: "Укрепляет здоровье и покой.", action: (p) => { p.hp = Math.min(p.maxHp, p.hp + 15); return "Тепло родного дома восстановило силы (+15 HP)."; } },
  { id: "listen_parents", category: "childhood", name: "🗣️ Слушать сказки и разговоры", minAge: 1, maxAge: 5, cost: 0, apCost: 1, desc: "Азы речи и истории мира.", action: (p) => { p.intellect += 2; return "Сказки о героях расширили кругозор (+2 Знаний)."; } },
  { id: "toddler_mana", category: "magic", name: "🔮 Концентрация и расширение маны", minAge: 1, maxAge: 100, cost: 0, apCost: 1, desc: "До 10 лет сосуд растёт стремительно; после 10 — каналы твердеют (кроме Фактора Лапласа).", action: (p) => {
    const isLaplace = p.trait.id === "laplace_factor" || p.trait.id === "god_mode";
    const agePenalty = (p.age > 10 && !isLaplace) ? 0.25 : 1.0;
    const mod = (p.trait.growthMod || 1) * (p.raceObj.bonus.manaMod || 1) * agePenalty;
    const gain = Math.max(1, Math.round(6 * mod));
    p.maxMana += gain; p.mana = p.maxMana;
    p.magicExp += Math.round(6 * (p.raceObj.learnMod || 1));
    return `Сосуд маны расширился на <b>+${gain} макс. маны</b>${agePenalty < 1 ? " (каналы взрослого твердеют)" : ""}!`;
  }},
  { id: "wooden_stick_play", category: "childhood", name: "🪵 Тренировка с палкой", minAge: 3, maxAge: 6, cost: 0, apCost: 1, desc: "Первые замахи клинком.", action: (p) => { p.swordGodExp += 6; return "Вы сбивали крапиву палкой (+6 Мечу)."; } },
  { id: "catch_insects", category: "childhood", name: "🦗 Ловля сверчков", minAge: 3, maxAge: 7, cost: 0, apCost: 1, desc: "Реакция глаз и ловкость.", action: (p) => { p.northGodExp += 6; return "Вы перехватывали жуков (+6 Севера)."; } },
  { id: "read_scrolls", category: "life", name: "📜 Изучение свитков и летописей", minAge: 4, maxAge: 100, cost: 3, apCost: 1, desc: "Книги дают Знания (удваивается у Любознательных).", action: (p) => {
    const bonus = p.trait.id === "curious" ? 10 : 6;
    p.coins -= 3; p.intellect += bonus;
    return `Вы изучили древние трактаты (+${bonus} Знаний).`;
  }},
  { id: "magic_circle_study", category: "magic", name: "✨ Изучение магических кругов", minAge: 7, maxAge: 100, cost: 0, apCost: 1, desc: "Формулы стихий и призыва.", action: (p) => {
    const gain = Math.round(12 * getTrainingMultiplier(p, p.magicExp));
    p.magicExp += gain; p.intellect += 3;
    return `Вы вычерчивали руны призыва (+${gain} Магии, +3 Знаний).`;
  }},
  { id: "sword_practice", category: "combat", name: "🗡️ Стойка Бога Меча", minAge: 7, maxAge: 100, cost: 0, apCost: 1, desc: "Молниеносный выпад (ускоряется рангом и полигоном).", action: (p) => {
    const gain = Math.round(14 * getTrainingMultiplier(p, p.swordGodExp) * (p.castleUpgrades.includes("training_yard") ? 1.25 : 1));
    p.swordGodExp += gain; return `Клинок рассекает воздух (+${gain} Мечу).`;
  }},
  { id: "water_parry", category: "combat", name: "💧 Стойка Бога Воды", minAge: 7, maxAge: 100, cost: 0, apCost: 1, desc: "Идеальное парирование.", action: (p) => {
    const gain = Math.round(14 * getTrainingMultiplier(p, p.waterGodExp));
    p.waterGodExp += gain; return `Вы гасили встречные выпады (+${gain} Воды).`;
  }},
  { id: "north_tricks", category: "combat", name: "🌪️ Стойка Бога Севера", minAge: 7, maxAge: 100, cost: 0, apCost: 1, desc: "Финты, перекаты и уловки.", action: (p) => {
    const gain = Math.round(14 * getTrainingMultiplier(p, p.northGodExp));
    p.northGodExp += gain; return `Вы освоили выпад из переката (+${gain} Севера).`;
  }},
  { id: "gather_herbs", category: "life", name: "🌿 Сбор редких трав", minAge: 6, maxAge: 100, cost: 0, apCost: 1, desc: "Подработка для аптекаря.", action: (p) => { const e = Math.floor(Math.random() * 8) + 4; p.coins += e; return `Вы сдали корзину трав (+${e}🪙).`; } },
  { id: "school_lesson", category: "school", name: "🎓 Посетить академическую лекцию", minAge: 10, maxAge: 100, cost: 0, apCost: 1, desc: "Прогресс в зачисленной Академии.", action: (p) => {
    if (!p.enrolledSchool) return "Вы не зачислены в Академию! Поступите во вкладке «Мир & Род».";
    const intGain = p.trait.id === "curious" ? 10 : 6;
    p.schoolProgress = p.schoolProgress || 1;
    p.intellect += intGain; p.magicExp += Math.round(16 * (p.raceObj.learnMod || 1));
    if (Math.random() > 0.52) {
      p.schoolProgress++;
      if (p.schoolProgress > 4) {
        p.graduatedSchools.push(p.enrolledSchool);
        p.enrolledSchool = null; p.coins += 120;
        return `🏆 <b>ВЫПУСК!</b> Вы с отличием окончили Академию (+120🪙)!`;
      }
      return `📜 Экзамен сдан! Текущий курс: ${p.schoolProgress}/4.`;
    }
    return `Вы конспектировали лекцию магистра (+16 Магии, +${intGain} Знаний).`;
  }},
  { id: "street_sparring", category: "youth", name: "🥊 Уличные дуэли", minAge: 11, maxAge: 17, cost: 0, apCost: 1, desc: "Опыт уличных стычек.", action: (p) => { p.swordGodExp += 10; p.northGodExp += 10; return "Поединок на окраине (+10 Мечу и Севера)."; } },
  { id: "youth_debate", category: "youth", name: "📚 Диспуты о природе маны", minAge: 12, maxAge: 25, cost: 0, apCost: 1, desc: "Споры об устройстве мира.", action: (p) => { p.intellect += 8; return "Вы блестяще отстояли тезисы (+8 Знаний)."; } },
  { id: "tavern_rest", category: "life", name: "🛌 Отдых в таверне (100% HP)", minAge: 6, maxAge: 100, cost: 6, apCost: 1, desc: "Снять комнату и восстановить HP.", action: (p) => { p.coins -= 6; p.hp = p.maxHp; return "Горячий ужин и сон полностью восстановили здоровье!"; } },
  { id: "high_society_ball", category: "life", name: "🎭 Дворянский бал", minAge: 16, maxAge: 100, cost: 18, apCost: 1, desc: "Связи среди знати Асуры.", action: (p) => { p.coins -= 18; p.asuraInfluence += 12; return "Полезные знакомства (+12 влияния)."; } },
  { id: "write_memoirs", category: "elder", name: "✍️ Родовые хроники", minAge: 45, maxAge: 100, cost: 0, apCost: 1, desc: "Мудрость для потомков.", action: (p) => { p.intellect += 12; return "Мемуары занесены в архив (+12 Знаний)."; } },
  { id: "mentor_young", category: "elder", name: "🥋 Наставлять учеников", minAge: 40, maxAge: 100, cost: 0, apCost: 1, desc: "Передача секретов клинка.", action: (p) => { p.squadFame += 20; p.coins += 25; return "Ученики внимали урокам (+20 Славы, +25🪙)."; } }
];

const RANDOM_EVENTS = [
  { id: "hitogami_dream_tempt", minAge: 12, chance: 0.22, icon: "👁️", title: "Сон Белого Пространства (Хитогами)",
    desc: "Среди ночи туман расступается, и безликий Бог Людей улыбается вам: «Послушай мой совет — забери сундук в старой часовне до рассвета...»",
    choices: [
      { text: "Последовать совету Хитогами (+120🪙, +18 Магии, Доверие +20)", action: (p) => {
        p.coins += 120; p.magicExp += 18; p.hitogamiTrust += 20; p.reputation -= 10;
        if (p.dynastyFaction === "neutral" && p.hitogamiTrust >= 35) {
          p.dynastyFaction = "hitogami";
          return "Вы забрали золото! Сны Хитогами подчинили вашу судьбу — вы стали его Апостолом (+120🪙, +18 Магии)!";
        }
        return "В часовне действительно ждал забытый сундук (+120🪙, +18 Магии)!";
      }},
      { text: "Отвергнуть шёпот Пустоты (+8 Знаний, +10 Света)", action: (p) => {
        p.hitogamiTrust -= 10; p.intellect += 8; p.reputation += 10;
        return "Вы проснулись в холодном поту, но сохранили ясность разума (+8 Знаний, +10 Света).";
      }}
    ]
  },
  { id: "hitogami_dream_price", minAge: 18, chance: 0.25, icon: "🩸", title: "Цена Белого Пространства (Сон Хитогами)",
    desc: "Хитогами усмехается шире прежнего: «Ты получил мои дары. Теперь уничтожь тайник союзников Орстеда и подставь одного из знакомых ради моей цели!»",
    choices: [
      { text: "Исполнить волю Хитогами (+400🪙, +40 ко всем стилям, -30 Тень)", action: (p) => {
        p.coins += 400; p.swordGodExp += 40; p.magicExp += 40; p.hitogamiTrust += 35; p.reputation -= 30;
        const victim = p.relations.find(r => !r.isDead && !r.isFamily);
        if (victim) { victim.relation = Math.max(0, victim.relation - 50); victim.status = "Заклятый враг"; }
        return `Задание выполнено ценой предательства${victim ? ` (${victim.name} проклял вас)` : ""}! (+400🪙, +40 к стилям)`;
      }},
      { text: "Разорвать сделку! (Отказ: бой или удар Апостола!)", action: (p) => {
        p.dynastyFaction = "orsted"; p.hitogamiTrust = 0; p.hp = Math.max(10, p.hp - 55); p.reputation += 25;
        return "Разъярённый Хитогами наслал на вас наёмников! Вы чудом отбились (-55 HP) и перешли к Орстеду!";
      }}
    ]
  },
  { id: "milis_saint_healer", minAge: 14, chance: 0.25, icon: "✨", title: "Архиепископ Исцеления Милиса",
    desc: "Странствующий мастер Святой Магии способен срастить кости и вырастить утраченную руку!",
    choices: [
      { text: "Оплатить ритуал (300🪙 — лечит все травмы и 100% HP)", action: (p) => {
        if (p.coins < 300) return "У вас нет 300 монет на священные реагенты!";
        p.coins -= 300; p.injuries = []; p.hp = p.maxHp;
        return "Ослепительный свет восстановил ваше тело полностью!";
      }},
      { text: "Простое благословение (+20 HP)", action: (p) => { p.hp = Math.min(p.maxHp, p.hp + 20); return "Мягкое сияние согрело душу (+20 HP)."; } }
    ]
  },
  { id: "fame_challenger_duel", minAge: 14, chance: 0.20, icon: "⚔️", title: "Вызов от Искателя Славы!",
    desc: "Странствующий мечник узнал вас по балладам бардов: «Скрести со мной клинок!»",
    choices: [
      { text: "Принять бой и сокрушить наглеца!", action: (p) => {
        const myCp = calcCombatPower(p);
        if (myCp > myCp * (0.55 + Math.random() * 0.45)) { p.swordGodExp += 25; p.squadFame += 25; return "Наглец повержен (+25 Мечу, +25 Славы)!"; }
        p.hp = Math.max(10, p.hp - 30); return "Схватка вышла суровой (-30 HP), но победа за вами!";
      }},
      { text: "Пройти мимо", action: () => "Вы хладнокровно проигнорировали крикуна." }
    ]
  },
  { id: "noble_matchmaking", minAge: 16, chance: 0.16, icon: "💍", title: "Сватовство Дворянского Дома!",
    desc: "К дому прибыла карета знатного рода. Лорд предлагает брак с солидным приданым!",
    choices: [
      { text: "Принять предложение (+150🪙, +25 влияния)", action: (p) => {
        if (p.spouse) return "Вы уже в браке! Сваты удалились.";
        p.coins += 150; p.asuraInfluence += 25;
        const sName = p.gender === "male" ? "Леди Элеонора де Арс" : "Лорд Годфри де Роа";
        const sp = { id: "spouse_" + Date.now(), name: sName, gender: p.gender === "male" ? "female" : "male", race: "Человек", age: p.age + 1, role: "Дворянский супруг", cp: 800, relation: 80, status: "Супруг/Супруга", isFamily: false, isDead: false };
        p.spouse = sp; p.relations.push(sp);
        return `Вы заключили союз с <b>${sName}</b>! Приданое: +150🪙 и +25 влияния!`;
      }},
      { text: "Вежливо отказать", action: () => "Вы ответили, что сердце пока свободно." }
    ]
  },
  { id: "canon_kishirika", isRare: true, minAge: 8, chance: 0.08, icon: "👁️", title: "Императрица Демонов Киширика!",
    desc: "В пыли сидит голодная коротышка с рогами: «Ху-ха-ха! Накорми Киширику за 35 монет, и я подарю тебе Демонический Глаз!»",
    choices: [
      { text: "Отдать 35 монет за Демонический Глаз", action: (p) => {
        if (p.coins < 35) return "Нет 35 монет! Киширика обиженно сбежала.";
        p.coins -= 35;
        const keys = Object.keys(DEMON_EYES);
        const eye = DEMON_EYES[keys[Math.floor(Math.random() * keys.length)]];
        p.demonEyes = p.demonEyes || { left: null, right: null };
        if (!p.demonEyes.left) { p.demonEyes.left = eye; return `👁️ В левую глазницу вживлён <b>${eye.name}</b>!`; }
        if (!p.demonEyes.right) { p.demonEyes.right = eye; return `👁️ В правую глазницу вживлён <b>${eye.name}</b>!`; }
        p.swordGodExp += 30; p.magicExp += 30;
        return "У вас уже оба глаза демона! Киширика поделилась маной (+30 ко всем стилям).";
      }},
      { text: "Пройти мимо", action: () => "Вы не стали связываться со странной девчонкой." }
    ]
  },
  { id: "wandering_bard", minAge: 7, chance: 0.18, icon: "🪕", title: "Песнь Странствующего Барда",
    desc: "В таверне бард поёт баллады о героях прошлых лет.",
    choices: [
      { text: "Угостить элем (3🪙) и расспросить о слухах", action: (p) => { if (p.coins < 3) return "Не хватило монет."; p.coins -= 3; p.intellect += 6; return "Бард раскрыл древние легенды (+6 Знаний)."; } },
      { text: "Просто послушать музыку (+10 HP)", action: (p) => { p.hp = Math.min(p.maxHp, p.hp + 10); return "Мелодия успокоила сердце (+10 HP)."; } }
    ]
  },
  { id: "stolen_wallet", minAge: 10, chance: 0.18, icon: "👝", title: "Вор на базарной площади!",
    desc: "Карманник срезал кошель у купца и несётся прямо на вас!",
    choices: [
      { text: "Поставить подножку (+25🪙, +10 Севера, +8 Света)", action: (p) => {
        if (p.northGodExp >= 12 || Math.random() > 0.3) { p.coins += 25; p.northGodExp += 10; p.reputation += 8; return "Купец наградил вас за помощь (+25🪙, +10 Севера)!"; }
        p.hp = Math.max(5, p.hp - 15); return "Вор полоснул ножом и сбежал (-15 HP).";
      }},
      { text: "Сбить заклинанием (+12 Магии, +8 Света)", action: (p) => { p.magicExp += 12; p.reputation += 8; return "Вор задержан стражей (+12 Магии)."; } },
      { text: "Отойти в сторону", action: () => "Вы не стали вмешиваться." }
    ]
  },
  { id: "canon_orsted", isRare: true, minAge: 16, chance: 0.05, icon: "🐉", title: "Встреча: Бог Драконов Орстед!",
    desc: "В ущелье вы натыкаетесь на мужчину в белом чешуйчатом плаще. Проклятие ужаса сковывает грудь!",
    choices: [
      { text: "Упасть на колени и отвести взгляд", action: (p) => { p.hp = Math.max(10, p.hp - 15); return "Орстед окинул вас ледяным взглядом и прошёл мимо (-15 HP)."; } },
      { text: "Заговорить о Хитогами", action: (p) => {
        if (p.dynastyFaction === "orsted") { p.factionProgress += 15; return "Орстед коротко кивнул: «Действуй по плану, союзник» (+15 прогресса Орстеда)."; }
        p.hp = Math.max(5, p.hp - 70); return "Орстед нанёс сокрушительный удар! Вы чудом выжили (-70 HP)!";
      }}
    ]
  },
  // ===== НОВЫЕ СЛУЧАЙНЫЕ СОБЫТИЯ (191) =====
  { id: "kid_dog", minAge: 3, chance: 0.14, icon: "🐕", title: "Собака во дворе",
    desc: "Во дворе сидит огромный пёс и смотрит на вас так, будто знает ваше имя.",
    choices: [
      { text: "Погладить (+8 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+8);return "Пёс оказался теплее, чем казался (+8 HP).";} },
      { text: "Дать хлеба (2🪙)", action: (p)=>{if(p.coins<2)return "Хлеба нет.";p.coins-=2;p.reputation+=4;return "С этого дня он провожает вас до ворот.";} },
      { text: "Прогнать", action: ()=>"Пёс ушёл и больше не вернулся." },
    ] },
  { id: "kid_rain", minAge: 4, chance: 0.13, icon: "🌧", title: "Гроза над крышей",
    desc: "Впервые в жизни вы слышите гром так близко, что дом вздрагивает.",
    choices: [
      { text: "Спрятаться под одеяло", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+6);return "К утру гроза ушла, а страх остался маленьким.";} },
      { text: "Смотреть в окно (+2 Знаний)", action: (p)=>{p.intellect+=2;return "Вы видели, как молния бьёт в поле. Это было красиво (+2 Знаний).";} },
      { text: "Позвать взрослых", action: ()=>"Взрослые сказали, что гроза — это просто погода." },
    ] },
  { id: "kid_sibling_fight", minAge: 6, chance: 0.15, icon: "🥊", title: "Ссора с братом",
    desc: "Старший забрал вашу вещь и смеётся. Он сильнее, но вы злее.",
    choices: [
      { text: "Драться (+6 Меча, -5 HP)", action: (p)=>{p.swordGodExp+=6;p.hp=Math.max(1,p.hp-5);return "Вы проиграли, но в следующий раз не отступите.";} },
      { text: "Пожаловаться родителям", action: (p)=>{p.reputation+=3;return "Вещь вернули. Уважения не прибавилось.";} },
      { text: "Придумать месть (+4 Знаний)", action: (p)=>{p.intellect+=4;return "Вы придумали план. Он сработал идеально.";} },
    ] },
  { id: "kid_lost", minAge: 7, chance: 0.12, icon: "🌫", title: "Заблудился в тумане",
    desc: "Туман поднялся на поле, и дом исчез в двух шагах.",
    choices: [
      { text: "Идти по памяти (+4 Севера)", action: (p)=>{p.northGodExp+=4;return "Вы вышли к мельнице. Взрослые не поверили, что вы нашли дорогу сами.";} },
      { text: "Стоять и кричать", action: (p)=>{p.hp=Math.max(1,p.hp-10);return "Вас нашли к вечеру, продрогшего и злого (-10 HP).";} },
      { text: "Залезть на дерево и смотреть", action: (p)=>{p.intellect+=5;return "Сверху вы увидели дорогу и запомнили её навсегда.";} },
    ] },
  { id: "kid_treasure", minAge: 8, chance: 0.11, icon: "🪙", title: "Железная коробка в реке",
    desc: "В воде у моста блеснуло что-то тяжёлое.",
    choices: [
      { text: "Достать (+40🪙)", action: (p)=>{p.coins+=40;return "В коробке оказались старые монеты (+40🪙).";} },
      { text: "Позвать взрослых", action: (p)=>{p.reputation+=8;return "Взрослые поделили находку с вами и запомнили, что вы честны.";} },
      { text: "Не трогать", action: ()=>"Вы ушли. Коробка осталась ждать кого-то другого." },
    ] },
  { id: "kid_liar", minAge: 8, chance: 0.13, icon: "🤥", title: "Чужая ложь",
    desc: "Вы видели, кто разбил окно. Он говорит, что это вы.",
    choices: [
      { text: "Сказать правду (+10 репутации)", action: (p)=>{p.reputation+=10;return "Взрослые поверили. Виноватый перестал с вами разговаривать.";} },
      { text: "Промолчать", action: (p)=>{p.reputation-=6;return "Вам не поверили. Это запомнили.";} },
      { text: "Соврать в ответ (+3 Знаний)", action: (p)=>{p.intellect+=3;p.reputation-=2;return "Вы соврали лучше него — но и вам теперь не верят.";} },
    ] },
  { id: "kid_sword_toy", minAge: 9, chance: 0.14, icon: "🗡", title: "Деревянный меч",
    desc: "Отец вырезал вам меч из ветки. Он кривой и слишком лёгкий, но это ваш.",
    choices: [
      { text: "Тренироваться каждый день (+12 Меча)", action: (p)=>{p.swordGodExp+=12;return "Через год вы уже не махали, а били (+12 Меча).";} },
      { text: "Повесить на стену", action: (p)=>{p.reputation+=4;return "Он висит там до сих пор.";} },
    ] },
  { id: "kid_fever", minAge: 7, chance: 0.11, icon: "🤒", title: "Жар в три ночи",
    desc: "Вы просыпаетесь от того, что простыни мокрые, а перед глазами плывёт.",
    choices: [
      { text: "Терпеть до утра", action: (p)=>{p.hp=Math.max(1,p.hp-20);return "К утру жар спал, но вы ослабли (-20 HP).";} },
      { text: "Разбудить мать (+15 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+15);return "Она сидела рядом до рассвета (+15 HP).";} },
    ] },
  { id: "kid_friend_leave", minAge: 9, chance: 0.12, icon: "👋", title: "Друг уезжает",
    desc: "Семья вашего друга уезжает в другой регион. Он обещает писать.",
    choices: [
      { text: "Дать ему свою вещь", action: (p)=>{p.reputation+=10;return "Он увёз ваш подарок и написал через год.";} },
      { text: "Не приходить на проводы", action: (p)=>{p.reputation-=3;return "Вы не пришли. Он не написал.";} },
    ] },
  { id: "teen_crush", minAge: 12, chance: 0.16, icon: "💗", title: "Первое чувство",
    desc: "Вы понимаете, что слишком долго смотрите на одного человека. Он это тоже понимает.",
    choices: [
      { text: "Признаться", action: (p)=>{p.reputation+=6;return Math.random()>0.5?"Вам ответили взаимностью. Вы весь год ходили счастливым.":"Вам ответили отказом. Вы пережили.";} },
      { text: "Молчать", action: ()=>"Вы промолчали. Через годы об этом будете жалеть больше, чем о любой драке." },
    ] },
  { id: "teen_bully", minAge: 11, chance: 0.15, icon: "😠", title: "Двое против одного",
    desc: "Старшие прижали младшего у стены. Все смотрят в сторону.",
    choices: [
      { text: "Вмешаться (+10 Меча, -10 HP)", action: (p)=>{p.swordGodExp+=10;p.hp=Math.max(1,p.hp-10);p.reputation+=12;return "Вы получили по лицу, но младший запомнил ваше имя.";} },
      { text: "Позвать стражу (+8 репутации)", action: (p)=>{p.reputation+=8;return "Стража пришла. Драка не началась.";} },
      { text: "Пройти мимо", action: (p)=>{p.reputation-=5;return "Вы прошли мимо. Кто-то видел.";} },
    ] },
  { id: "teen_apprentice", minAge: 13, chance: 0.14, icon: "🔨", title: "Кузнец ищет ученика",
    desc: "В кузнице у дороги висит бумага: «Нужен мальчишка с руками».",
    choices: [
      { text: "Наняться (+20 Меча, +30🪙)", action: (p)=>{p.swordGodExp+=20;p.coins+=30;return "Полгода у горна научили вас больше, чем двор (+20 Меча).";} },
      { text: "Пройти мимо", action: ()=>"Вы не пошли. Кузнец взял другого." },
    ] },
  { id: "teen_first_coin", minAge: 12, chance: 0.13, icon: "🪙", title: "Первая работа",
    desc: "Вам предложили разгрузить воз за три монеты. Воз огромный.",
    choices: [
      { text: "Разгрузить весь (+6🪙, +5 HP)", action: (p)=>{p.coins+=6;p.maxHp+=5;return "Вы разгрузили и получили три монеты и острую спину.";} },
      { text: "Бросить на середине", action: (p)=>{p.reputation-=4;return "Вам не заплатили, и хозяин запомнил.";} },
    ] },
  { id: "teen_book", minAge: 13, chance: 0.12, icon: "📖", title: "Книга под скамьёй",
    desc: "В школе под скамьёй лежит чужая книга без названия.",
    choices: [
      { text: "Прочесть всю (+10 Знаний)", action: (p)=>{p.intellect+=10;return "Это был трактат о магии воды. Вы не всё поняли, но запомнили (+10 Знаний).";} },
      { text: "Отдать хозяину (+6 репутации)", action: (p)=>{p.reputation+=6;return "Хозяин книги стал вашим первым учителем.";} },
    ] },
  { id: "teen_gamble", minAge: 15, chance: 0.13, icon: "🎲", title: "Кости на бочке",
    desc: "В таверне играют в кости. Ставки небольшие, но глаза у всех горят.",
    choices: [
      { text: "Играть (+60🪙 или -40🪙)", action: (p)=>{if(Math.random()>0.55){p.coins+=60;return "Вы выиграли и вышли (+60🪙).";}p.coins=Math.max(0,p.coins-40);return "Вы проиграли и остались (-40🪙).";} },
      { text: "Смотреть и учиться (+4 Знаний)", action: (p)=>{p.intellect+=4;return "Вы поняли, как они считают. Это пригодится.";} },
      { text: "Уйти", action: ()=>"Вы ушли трезвым." },
    ] },
  { id: "teen_duel_challenge", minAge: 14, chance: 0.12, icon: "⚔️", title: "Вызов от ровесника",
    desc: "Сын соседа говорит, что ваш род ничего не стоит, и бросает вам перчатку.",
    choices: [
      { text: "Принять бой (+15 Меча)", action: (p)=>{if(p.swordGodExp>20){p.swordGodExp+=15;p.reputation+=10;return "Вы победили. Он больше не заговаривает первым.";}p.hp=Math.max(1,p.hp-25);p.reputation-=5;return "Вы проиграли на глазах у всех (-25 HP).";} },
      { text: "Отказаться", action: (p)=>{p.reputation-=8;return "Вы отказались. Это будут вспоминать.";} },
    ] },
  { id: "teen_theft", minAge: 15, chance: 0.11, icon: "🏃", title: "Хлеб на рынке",
    desc: " Вы видите, как мальчишка крадёт хлеб у торговки. Он очень голоден.",
    choices: [
      { text: "Заплатить за него (+10 репутации, -5🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-5);p.reputation+=10;return "Торговка взяла деньги и промолчала. Мальчишка запомнил вас.";} },
      { text: "Схватить его (+5 Севера)", action: (p)=>{p.northGodExp+=5;return "Вы его поймали. Торговка вас похвалила.";} },
      { text: "Отвернуться", action: ()=>"Вы отвернулись. Это было проще." },
    ] },
  { id: "teen_sick_parent", minAge: 13, chance: 0.12, icon: "🕯️", title: "Болезнь в доме",
    desc: "Кто-то из домашних слег и не встаёт третью неделю.",
    choices: [
      { text: "Ухаживать (+15 HP, +10 репутации)", action: (p)=>{p.maxHp+=15;p.reputation+=10;return "Вы не спали месяц. Он встал — и запомнил.";} },
      { text: "Позвать лекаря (-60🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-60);p.reputation+=8;return "Лекарь пришёл и помог.";} },
      { text: "Уйти из дома", action: (p)=>{p.reputation-=10;return "Вы ушли. Вернулись, когда всё закончилось.";} },
    ] },
  { id: "teen_horse", minAge: 14, chance: 0.11, icon: "🐎", title: "Дикая лошадь",
    desc: "На выгоне стоит лошадь, которую никто не может объездить.",
    choices: [
      { text: "Объездить (+20 Севера, +5 HP)", action: (p)=>{if(p.northGodExp>25||Math.random()>0.5){p.northGodExp+=20;p.maxHp+=10;return "Вы удержались. Теперь она ваша.";}p.hp=Math.max(1,p.hp-30);return "Она сбросила вас три раза (-30 HP).";} },
      { text: "Не рисковать", action: ()=>"Вы не стали. Кто-то другой попробовал и сломал руку." },
    ] },
  { id: "teen_secret", minAge: 15, chance: 0.12, icon: "🤫", title: "Тайна взрослых",
    desc: "Вы случайно услышали разговор, который не для ваших ушей.",
    choices: [
      { text: "Запомнить (+8 Знаний)", action: (p)=>{p.intellect+=8;return "Вы запомнили всё. Однажды это спасёт вас или убьёт.";} },
      { text: "Рассказать", action: (p)=>{p.reputation-=12;return "Вас попросили молчать. Вы не смогли.";} },
    ] },
  { id: "teen_rain_fields", minAge: 12, chance: 0.12, icon: "🌾", title: "Работа в поле",
    desc: "Урожай собирают все, включая детей. Спина отваливается через час.",
    choices: [
      { text: "Работать до конца (+4🪙, +10 HP)", action: (p)=>{p.coins+=4;p.maxHp+=10;return "Вы работали со всеми и получили свою долю.";} },
      { text: "Сбежать в лес", action: (p)=>{p.reputation-=4;p.northGodExp+=4;return "В лесу вы нашли тропу, которой нет на карте.";} },
    ] },
  { id: "ad_tax", minAge: 18, chance: 0.14, icon: "📜", title: "Сборщик налогов",
    desc: "Чиновник с бумагой утверждает, что ваш род задолжал за три года вперёд.",
    choices: [
      { text: "Заплатить (-80🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-80);return "Вы заплатили. Бумага исчезла.";} },
      { text: "Оспорить (-1 год, +8 Знаний)", action: (p)=>{p.intellect+=8;return "Вы нашли ошибку в бумаге. Чиновник ушёл красным.";} },
      { text: "Выгнать", action: (p)=>{p.reputation-=10;return "Он ушёл. Придёт с солдатами.";} },
    ] },
  { id: "ad_wedding_invite", minAge: 19, chance: 0.13, icon: "💍", title: "Чужая свадьба",
    desc: "Вас пригласили на свадьбу соседнего дома. Вы почти никого там не знаете.",
    choices: [
      { text: "Пойти с подарком (-30🪙, +12 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-30);p.reputation+=12;return "Вы познакомились с тремя домами за один вечер.";} },
      { text: "Не пойти", action: ()=>"Вы не пошли. О вас не подумали ничего." },
    ] },
  { id: "ad_fire", minAge: 22, chance: 0.12, icon: "🔥", title: "Пожар на улице",
    desc: "Горит дом через дорогу. Внутри кто-то кричит.",
    choices: [
      { text: "Броситься внутрь (+25 репутации, -30 HP)", action: (p)=>{p.reputation+=25;p.maxHp+=10;p.hp=Math.max(1,p.hp-30);return "Вы вынесли ребёнка. Вас запомнил весь квартал.";} },
      { text: "Организовать цепочку воды (+15 репутации)", action: (p)=>{p.reputation+=15;return "Дом сгорел, но люди спаслись.";} },
      { text: "Смотреть", action: (p)=>{p.reputation-=8;return "Вы смотрели. Кто-то смотрел на вас.";} },
    ] },
  { id: "ad_debt_collector", minAge: 24, chance: 0.12, icon: "💀", title: "Долг всплыл",
    desc: "Пришли люди с бумагой, которую подписал кто-то из вашей семьи.",
    choices: [
      { text: "Заплатить (-120🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-120);return "Вы заплатили чужой долг. Семья этого не забудет.";} },
      { text: "Отказаться", action: (p)=>{p.hp=Math.max(1,p.hp-20);return "Они ушли, но оставили двоих у ворот (-20 HP).";} },
      { text: "Договориться (+8 Знаний)", action: (p)=>{p.intellect+=8;return "Вы выторговали половину. Это тоже победа.";} },
    ] },
  { id: "ad_merchant", minAge: 26, chance: 0.13, icon: "🐫", title: "Купец с караваном",
    desc: "Караван идёт через ваш регион и ищет охрану.",
    choices: [
      { text: "Наняться охраной (+90🪙, +10 Меча)", action: (p)=>{p.coins+=90;p.swordGodExp+=10;return "Дорога была спокойной, деньги — настоящими.";} },
      { text: "Вложиться в товар (+150🪙 или -100🪙)", action: (p)=>{if(Math.random()>0.45){p.coins+=150;return "Товар дошёл, вы получили долю (+150🪙).";}p.coins=Math.max(0,p.coins-100);return "Караван разграбили. Ваши деньги тоже (-100🪙).";} },
      { text: "Отказаться", action: ()=>"Караван ушёл без вас." },
    ] },
  { id: "ad_duel_noble", minAge: 27, chance: 0.11, icon: "⚜️", title: "Оскорбление от аристократа",
    desc: "Он сказал это громко, чтобы слышали все.",
    choices: [
      { text: "Вызвать на дуэль (+20 репутации)", action: (p)=>{if(p.swordGodExp>150){p.reputation+=20;p.squadFame+=30;return "Вы победили. Дом замолчал.";}p.hp=Math.max(1,p.hp-40);p.reputation-=10;return "Вы проиграли. Вас запомнили слабым (-40 HP).";} },
      { text: "Ответить шуткой (+8 Знаний)", action: (p)=>{p.intellect+=8;p.reputation+=5;return "Зал засмеялся. Он — нет.";} },
      { text: "Промолчать", action: (p)=>{p.reputation-=6;return "Вы промолчали. Это сочли за слабость.";} },
    ] },
  { id: "ad_orphan_road", minAge: 25, chance: 0.12, icon: "👶", title: "Ребёнок на дороге",
    desc: "У обочины сидит ребёнок. Никого рядом. Он не плачет, просто смотрит.",
    choices: [
      { text: "Забрать в дом (+15 репутации, -40🪙)", action: (p)=>{p.reputation+=15;p.coins=Math.max(0,p.coins-40);return "Вы взяли его. Он оказался не обузой.";} },
      { text: "Отвести к жрецам (-10🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-10);p.reputation+=6;return "Жрецы взяли его и записали ваше имя.";} },
      { text: "Пройти мимо", action: (p)=>{p.reputation-=12;return "Вы прошли. Он смотрел вам вслед.";} },
    ] },
  { id: "ad_illness", minAge: 28, chance: 0.11, icon: "🦠", title: "Болезнь в городе",
    desc: "По улицам расклеили приказ: не выходить без нужды.",
    choices: [
      { text: "Сидеть дома", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+15);return "Вы переждали. Скучно и целы.";} },
      { text: "Помогать лекарям (+20 репутации, -25 HP)", action: (p)=>{p.reputation+=20;p.hp=Math.max(1,p.hp-25);return "Вы были нужны, и вы были там.";} },
    ] },
  { id: "ad_lost_letter", minAge: 23, chance: 0.11, icon: "✉️", title: "Письмо без адреса",
    desc: "В таверне забыли письмо. На нём только имя — знакомое.",
    choices: [
      { text: "Отнести лично (+10 репутации)", action: (p)=>{p.reputation+=10;return "Вы отнесли. Это оказалось важнее, чем вы думали.";} },
      { text: "Прочесть (+6 Знаний, -4 репутации)", action: (p)=>{p.intellect+=6;return "Вы прочли. Теперь вы знаете то, что не должны.";} },
      { text: "Оставить", action: ()=>"Письмо осталось лежать." },
    ] },
  { id: "ad_ambush", minAge: 21, chance: 0.12, icon: "🗡️", title: "Засада на тракте",
    desc: "Трое вышли из кустов и перекрыли дорогу.",
    choices: [
      { text: "Драться (+20 Меча, -30 HP)", action: (p)=>{if(p.swordGodExp>80||p.northGodExp>60){p.swordGodExp+=20;p.coins+=50;return "Вы отбились и забрали их кошели (+50🪙).";}p.hp=Math.max(1,p.hp-30);p.coins=Math.max(0,p.coins-60);return "Вас обобрали (-60🪙, -30 HP).";} },
      { text: "Отдать кошель (-50🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-50);return "Вы отдали и остались целы.";} },
      { text: "Бежать (+6 Севера)", action: (p)=>{p.northGodExp+=6;return "Вы ушли. Это не трусость, это ноги.";} },
    ] },
  { id: "ad_harvest", minAge: 20, chance: 0.12, icon: "🌾", title: "Урожайный год",
    desc: "Поля дали вдвое больше обычного. Все считают, кому достанется.",
    choices: [
      { text: "Продать дорого (+180🪙, -10 репутации)", action: (p)=>{p.coins+=180;p.reputation-=10;return "Вы продали на пике (+180🪙).";} },
      { text: "Раздать часть (+25 репутации)", action: (p)=>{p.reputation+=25;return "Вы раздали. Это вернётся.";} },
    ] },
  { id: "ad_old_friend", minAge: 24, chance: 0.12, icon: "🤝", title: "Старый знакомый",
    desc: "На рынке вас окликает тот, кого вы не видели десять лет.",
    choices: [
      { text: "Выпить вместе (-10🪙, +10 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-10);p.reputation+=10;return "Он рассказал вам всё, что случилось без вас.";} },
      { text: "Сделать вид, что не узнали", action: (p)=>{p.reputation-=4;return "Он понял. Он не подошёл больше.";} },
    ] },
  { id: "ad_market_crash", minAge: 26, chance: 0.1, icon: "📉", title: "Цены рухнули",
    desc: "Товар, который вы держали, упал в цене вдвое.",
    choices: [
      { text: "Продать сейчас (-80🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-80);return "Вы спасли остальное.";} },
      { text: "Ждать (+200🪙 или -150🪙)", action: (p)=>{if(Math.random()>0.5){p.coins+=200;return "Следующей весной цена выросла (+200🪙).";}p.coins=Math.max(0,p.coins-150);return "Цена не вернулась (-150🪙).";} },
    ] },
  { id: "ad_brawl", minAge: 22, chance: 0.12, icon: "🍺", title: "Драка в таверне",
    desc: "Кто-то толкнул не того человека. Через миг дерутся все.",
    choices: [
      { text: "Ввязаться (+15 Меча, -15 HP)", action: (p)=>{p.swordGodExp+=15;p.hp=Math.max(1,p.hp-15);p.squadFame+=15;return "Вы вышли победителем — или просто вышли (+15 Меча).";} },
      { text: "Вытащить своего", action: (p)=>{p.reputation+=10;return "Вы вытащили его из свалки. Он этого не забудет.";} },
      { text: "Уйти под шумок", action: ()=>"Вы ушли, пока не началось." },
    ] },
  { id: "ad_wedding_offer", minAge: 29, chance: 0.11, icon: "💐", title: "Сватовство",
    desc: "К вам пришли сваты от чужого дома. Условия хорошие.",
    choices: [
      { text: "Согласиться (+30 репутации, +100🪙)", action: (p)=>{p.reputation+=30;p.coins+=100;return "Союз заключён. Вы получили и деньги, и родню.";} },
      { text: "Отказать", action: (p)=>{p.reputation-=5;return "Вы отказали. Это записали.";} },
    ] },
  { id: "ad_betrayal", minAge: 27, chance: 0.1, icon: "🖤", title: "Предательство друга",
    desc: "Тот, кому вы доверяли, сделал дело за вашей спиной.",
    choices: [
      { text: "Поговорить (+10 Знаний)", action: (p)=>{p.intellect+=10;return "Вы поговорили и поняли, что он был прав хотя бы наполовину.";} },
      { text: "Разорвать всё (-15 HP, +10 Меча)", action: (p)=>{p.maxHp+=10;p.reputation-=5;return "Вы разорвали. Осталась злость, которая пригодится.";} },
    ] },
  { id: "ad_guild_offer", minAge: 28, chance: 0.11, icon: "🏆", title: "Предложение гильдии",
    desc: "Гильдия предлагает вам дело, которое пахнет неприятностями.",
    choices: [
      { text: "Взяться (+200🪙, риск)", action: (p)=>{if(Math.random()>0.4){p.coins+=200;p.guildExp+=15;return "Дело вышло грязным, но вы получили награду (+200🪙).";}p.hp=Math.max(1,p.hp-40);return "Дело провалено, вы ранены (-40 HP).";} },
      { text: "Отказаться", action: (p)=>{p.guildExp+=5;return "Вы отказались. Гильдия уважает тех, кто умеет считать риск.";} },
    ] },
  { id: "m_war_rumor", minAge: 31, chance: 0.12, icon: "⚔️", title: "Слух о войне",
    desc: "На рынке говорят, что через год начнётся война. Никто не знает с кем.",
    choices: [
      { text: "Готовиться (+200🪙 расходов, +30 HP)", action: (p)=>{p.maxHp+=30;p.coins=Math.max(0,p.coins-50);return "Вы закупили припасы и укрепили дом.";} },
      { text: "Ничего не делать", action: ()=>"Вы решили, что слухи есть слухи." },
    ] },
  { id: "m_child_school", minAge: 33, chance: 0.12, icon: "🎓", title: "Школа для ребёнка",
    desc: "Ваш ребёнок подрос, и его пора учить. Учителя стоят дорого.",
    choices: [
      { text: "Заплатить за обучение (-150🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-150);p.intellect+=10;return "Он вернулся с книгами и вопросами.";} },
      { text: "Учить самому (+15 HP)", action: (p)=>{p.maxHp+=15;p.reputation+=8;return "Вы учили его сами. Это сблизило вас больше, чем книги.";} },
    ] },
  { id: "m_inheritance", minAge: 36, chance: 0.11, icon: "📜", title: "Спор о наследстве",
    desc: "Родственник умер и не оставил завещания.",
    choices: [
      { text: "Судиться (-100🪙, +150🪙 если выиграть)", action: (p)=>{p.coins=Math.max(0,p.coins-100);if(Math.random()>0.4){p.coins+=150;return "Суд был ваш. Вы получили свою долю.";}return "Суд проигран. Деньги ушли.";} },
      { text: "Уступить родне", action: (p)=>{p.reputation+=15;return "Вы уступили. Вас назвали порядочным — и это дороже.";} },
    ] },
  { id: "m_old_soldier", minAge: 34, chance: 0.12, icon: "🎖️", title: "Старый солдат у ворот",
    desc: "Он стоит и просит воды. На его груди — знак войны, о которой вы читали.",
    choices: [
      { text: "Позвать в дом (+10 Знаний)", action: (p)=>{p.intellect+=10;p.reputation+=10;return "Он рассказал вам то, чего нет в книгах.";} },
      { text: "Дать воды и закрыть", action: ()=>"Он выпил и ушёл." },
    ] },
  { id: "m_land_dispute", minAge: 38, chance: 0.11, icon: "🌾", title: "Спор о меже",
    desc: "Сосед передвинул забор на два шага. Эти два шага — ваши.",
    choices: [
      { text: "Вернуть силой (-20 HP)", action: (p)=>{p.hp=Math.max(1,p.hp-20);p.reputation-=5;return "Вы вернули. Сосед запомнил.";} },
      { text: "Решить по закону (+8 Знаний)", action: (p)=>{p.intellect+=8;return "Писцы разобрались. Забор на месте.";} },
      { text: "Уступить два шага", action: (p)=>{p.reputation+=8;return "Вы уступили. Он этого не забыл — и это окупится.";} },
    ] },
  { id: "m_masterwork", minAge: 40, chance: 0.11, icon: "🔨", title: "Мастерская работа",
    desc: "Вас просят сделать вещь, которой хватит на сто лет.",
    choices: [
      { text: "Взяться (+50 Меча, +80🪙)", action: (p)=>{p.swordGodExp+=50;p.coins+=80;return "Вы сделали. Ваша работа будет жить дольше вас.";} },
      { text: "Отказаться", action: (p)=>{p.intellect+=5;return "Вы отказались — и сэкономили себе три месяца.";} },
    ] },
  { id: "m_debt_son", minAge: 42, chance: 0.11, icon: "💰", title: "Долги ребёнка",
    desc: "Ваш сын наделал долгов, и к вам пришли кредиторы.",
    choices: [
      { text: "Заплатить (-200🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-200);p.reputation+=5;return "Вы заплатили. Он не сказал спасибо.";} },
      { text: "Пусть отвечает сам", action: (p)=>{p.reputation-=10;return "Он справился. Но вас запомнили как того, кто не помог.";} },
    ] },
  { id: "m_old_flame", minAge: 44, chance: 0.1, icon: "💗", title: "Старая любовь",
    desc: "Вы встречаете того, с кем могли бы прожить жизнь. Он не женат. Вы — да.",
    choices: [
      { text: "Заговорить (+10 HP)", action: (p)=>{p.maxHp+=10;return "Вы поговорили час. Этого хватило, чтобы понять — всё было правильно.";} },
      { text: "Пройти мимо", action: ()=>"Вы прошли. Вы будете думать об этом до старости." },
    ] },
  { id: "m_funeral", minAge: 39, chance: 0.12, icon: "🕯️", title: "Чужие похороны",
    desc: "Хоронят того, кого вы знали молодым.",
    choices: [
      { text: "Пойти", action: (p)=>{p.reputation+=10;p.intellect+=6;return "Вы стояли в толпе и поняли, что стареете.";} },
      { text: "Не идти", action: ()=>"Вы не пошли. Гроб понесли без вас." },
    ] },
  { id: "m_council", minAge: 35, chance: 0.12, icon: "🏛️", title: "Совет города",
    desc: "Вас зовут на совет решать, где строить новый колодец.",
    choices: [
      { text: "Предложить своё место (+15 репутации)", action: (p)=>{p.reputation+=15;p.asuraInfluence+=10;return "Колодец вырыли у вас. Теперь тут останавливаются караваны.";} },
      { text: "Сказать, что всё равно", action: (p)=>{return "Совет решил без вас. Колодец вырыли далеко.";} },
    ] },
  { id: "m_wounded", minAge: 37, chance: 0.11, icon: "🩸", title: "Раненый в дверях",
    desc: "В дверь стучат. На пороге человек с ножом в боку.",
    choices: [
      { text: "Впустить и лечить (-30🪙, +20 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-30);p.reputation+=20;return "Он выжил. Он оказался из хорошей семьи.";} },
      { text: "Прогнать", action: (p)=>{p.reputation-=10;return "Вы закрыли дверь. Он ушёл и, возможно, умер.";} },
    ] },
  { id: "m_road_block", minAge: 41, chance: 0.1, icon: "🪨", title: "Обвал на тракте",
    desc: "Дорога завалена камнями. Караваны стоят.",
    choices: [
      { text: "Организовать разбор (+30 репутации)", action: (p)=>{p.reputation+=30;p.coins+=60;return "Пробили за три дня. Купцы собрали вам деньги.";} },
      { text: "Объезжать", action: ()=>"Вы объехали. Дорога осталась стоять." },
    ] },
  { id: "m_son_trial", minAge: 46, chance: 0.1, icon: "⚖️", title: "Суд над сыном",
    desc: "Вашего ребёнка обвиняют в том, чего он, возможно, не делал.",
    choices: [
      { text: "Защищать (-100🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-100);p.reputation+=15;return "Вы наняли лучшего писца. Дело закрыли.";} },
      { text: "Пусть отвечает", action: (p)=>{p.reputation-=12;return "Его приговорили. Вы остались стоять.";} },
    ] },
  { id: "m_garden", minAge: 43, chance: 0.11, icon: "🌱", title: "Сад, который расцвёл",
    desc: "Впервые за годы ваш сад выглядит как на старых картинках.",
    choices: [
      { text: "Устроить праздник (-50🪙, +20 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-50);p.reputation+=20;return "Соседи пришли. Это запомнят.";} },
      { text: "Просто сесть и смотреть (+15 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+15);p.maxHp+=5;return "Вы сидели весь вечер. Это было лучшее за год.";} },
    ] },
  { id: "m_letter_crown", minAge: 47, chance: 0.1, icon: "👑", title: "Письмо из Асуры",
    desc: "Корона просит вас приехать. В письме не сказано зачем.",
    choices: [
      { text: "Поехать (+15 влияния)", action: (p)=>{p.asuraInfluence+=15;p.reputation+=10;return "Вас спросили о том, что вы знали. Это была не просьба.";} },
      { text: "Не отвечать", action: (p)=>{p.asuraInfluence-=5;return "Вы не ответили. Корона это запомнила.";} },
    ] },
  { id: "m_apprentice", minAge: 45, chance: 0.1, icon: "🔧", title: "Ученик",
    desc: "К вам пришёл подросток и просит взять его в ученики.",
    choices: [
      { text: "Взять (+10 репутации, +1 к славе)", action: (p)=>{p.reputation+=10;p.squadFame+=10;return "Он оказался лучше, чем вы думали.";} },
      { text: "Отказать", action: ()=>"Он ушёл. Через годы вы увидели его имя в чужом доме." },
    ] },
  { id: "m_old_wound", minAge: 48, chance: 0.1, icon: "🩹", title: "Старая рана",
    desc: "Рана, полученная в юности, снова даёт о себе знать.",
    choices: [
      { text: "Лечиться (-70🪙, +10 HP)", action: (p)=>{p.coins=Math.max(0,p.coins-70);p.maxHp+=10;return "Лекарь сказал, что вы легко отделались.";} },
      { text: "Терпеть", action: (p)=>{p.hp=Math.max(1,p.hp-25);return "Вы терпели. Иногда это всё, что можно.";} },
    ] },
  { id: "m_big_choice", minAge: 32, chance: 0.11, icon: "🌍", title: "Дальняя дорога",
    desc: "Вам предлагают уехать в другой регион. Здесь всё налажено. Там — неизвестно.",
    choices: [
      { text: "Уехать (-1 год, новое начало)", action: (p)=>{p.intellect+=15;return "Вы уехали. Первый год был тяжёлым, второй — лучшим.";} },
      { text: "Остаться", action: (p)=>{p.reputation+=10;return "Вы остались. Здесь ваш дом.";} },
    ] },
  { id: "e_grandchild", minAge: 55, chance: 0.12, icon: "👶", title: "Внук на руках",
    desc: "Ваш внук смотрит на вас так, как вы когда-то смотрели на деда.",
    choices: [
      { text: "Рассказать ему историю рода (+10 Знаний)", action: (p)=>{p.intellect+=10;p.reputation+=8;return "Он запомнит. Вы это знаете.";} },
      { text: "Не успеть — дела", action: ()=>"Вы отложили. Потом он вырос." },
    ] },
  { id: "e_old_friend_death", minAge: 57, chance: 0.12, icon: "🕯️", title: "Ушёл ровесник",
    desc: "Умер тот, с кем вы выросли. Теперь вы старший из всех, кто помнит вас молодым.",
    choices: [
      { text: "Пойти на похороны (+10 HP)", action: (p)=>{p.maxHp+=10;return "Вы стояли и думали о своём.";} },
      { text: "Остаться дома", action: (p)=>{p.hp=Math.max(1,p.hp-10);return "Вы остались. Весь день было тихо.";} },
    ] },
  { id: "e_memory", minAge: 59, chance: 0.11, icon: "🧠", title: "Забытое имя",
    desc: "Вы пытаетесь вспомнить имя человека, которого знали всю жизнь. Не выходит.",
    choices: [
      { text: "Записать всё, что помните (+8 Знаний)", action: (p)=>{p.intellect+=8;return "Вы начали писать. Оказалось, помните больше, чем думали.";} },
      { text: "Смириться", action: ()=>"Вы смирились. Это случится ещё не раз." },
    ] },
  { id: "e_legacy", minAge: 61, chance: 0.11, icon: "📜", title: "Кому оставить",
    desc: "Пора решать, кому достанется дом. Дети уже взрослые и смотрят друг на друга.",
    choices: [
      { text: "Отдать старшему (+10 репутации)", action: (p)=>{p.reputation+=10;return "Старший получил дом. Младший перестал приезжать.";} },
      { text: "Разделить поровну", action: (p)=>{p.reputation+=15;return "Вы разделили. Дом стал двумя домами.";} },
      { text: "Отдать тому, кто заслужил", action: (p)=>{p.intellect+=10;return "Вы отдали не по праву, а по делу. Это вызвало спор, но не ссору.";} },
    ] },
  { id: "e_winter_old", minAge: 63, chance: 0.11, icon: "❄️", title: "Холод в костях",
    desc: "Зима пришла рано, и вы чувствуете её глубже, чем раньше.",
    choices: [
      { text: "Сидеть у огня (+10 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+10);return "Вы сидели у огня весь месяц.";} },
      { text: "Всё равно выйти во двор (+4 HP, +5 репутации)", action: (p)=>{p.maxHp+=5;p.reputation+=5;return "Вы вышли. Соседи видели и уважили.";} },
    ] },
  { id: "e_old_story", minAge: 58, chance: 0.12, icon: "📖", title: "Вас просят рассказать",
    desc: "В школе дети хотят услышать про времена, когда вы были молоды.",
    choices: [
      { text: "Рассказать правду (+15 репутации)", action: (p)=>{p.reputation+=15;p.intellect+=6;return "Вы рассказали так, как было. Дети слушали три часа.";} },
      { text: "Приукрасить (+25 репутации)", action: (p)=>{p.reputation+=25;return "Вы приукрасили. Теперь в книгах будет неправда — ваша.";} },
    ] },
  { id: "e_last_wish", minAge: 65, chance: 0.1, icon: "🕯️", title: "Последняя просьба",
    desc: "Старый слуга просит выполнить его последнюю просьбу.",
    choices: [
      { text: "Выполнить (-40🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-40);p.reputation+=20;return "Вы выполнили. Он умер спокойно.";} },
      { text: "Сказать, что не сможете", action: (p)=>{p.reputation-=8;return "Он кивнул. Он не обиделся — и это хуже.";} },
    ] },
  { id: "e_hands", minAge: 60, chance: 0.11, icon: "🤲", title: "Руки не слушаются",
    desc: "Вы не можете удержать чашку так, как раньше.",
    choices: [
      { text: "Признать и нанять помощь (-60🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-60);p.hp=Math.min(p.maxHp,p.hp+10);return "Вы наняли человека. Стало легче.";} },
      { text: "Скрывать", action: (p)=>{p.hp=Math.max(1,p.hp-10);return "Вы скрывали. Уронили чашку при всех.";} },
    ] },
  { id: "e_old_debt", minAge: 62, chance: 0.1, icon: "💰", title: "Забытый долг",
    desc: "В старых бумагах нашлось обязательство, о котором все забыли.",
    choices: [
      { text: "Заплатить (+15 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-90);p.reputation+=15;return "Вы заплатили спустя сорок лет. Это оценили.";} },
      { text: "Сжечь бумагу", action: (p)=>{p.reputation-=5;return "Вы сожгли. Никто не узнает — кроме вас.";} },
    ] },
  { id: "e_last_journey", minAge: 67, chance: 0.1, icon: "🧭", title: "Последняя дорога",
    desc: "Есть место, куда вы всегда хотели попасть и не попадали.",
    choices: [
      { text: "Поехать (-1 год, +20 Знаний)", action: (p)=>{p.intellect+=20;p.maxHp+=10;return "Вы доехали. Оно оказалось меньше, чем в мечтах, и это было хорошо.";} },
      { text: "Остаться", action: ()=>"Вы остались. И вы знаете, что не пожалеете об этом." },
    ] },
  { id: "e_heir_talk", minAge: 64, chance: 0.11, icon: "👑", title: "Разговор с наследником",
    desc: "Он пришёл спросить то, что не решался спросить двадцать лет.",
    choices: [
      { text: "Сказать правду (+20 HP)", action: (p)=>{p.maxHp+=20;p.reputation+=10;return "Вы сказали всё. Он ушёл другим человеком.";} },
      { text: "Уйти от ответа", action: (p)=>{p.reputation-=6;return "Вы не ответили. Он больше не спросит.";} },
    ] },
  { id: "e_village_help", minAge: 56, chance: 0.11, icon: "🏘️", title: "Деревня просит",
    desc: "Соседняя деревня просит денег на мост.",
    choices: [
      { text: "Дать (-100🪙, +25 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-100);p.reputation+=25;return "Мост построили. На нём доска с вашим именем.";} },
      { text: "Отказать", action: (p)=>{p.reputation-=8;return "Вы отказали. Мост построили через десять лет.";} },
    ] },
  { id: "e_old_rival", minAge: 66, chance: 0.1, icon: "🤝", title: "Встреча с соперником",
    desc: "Тот, с кем вы враждовали всю жизнь, сидит у стены и греется.",
    choices: [
      { text: "Подойти и поговорить (+15 HP)", action: (p)=>{p.maxHp+=15;return "Вы проговорили до темноты. Вражда оказалась недоразумением.";} },
      { text: "Пройти мимо", action: ()=>"Вы прошли. Он умер через месяц." },
    ] },
  { id: "e_grave_visit", minAge: 60, chance: 0.12, icon: "🪦", title: "На кладбище",
    desc: "Вы пришли к тем, кого больше нет.",
    choices: [
      { text: "Убрать могилы (+10 репутации)", action: (p)=>{p.reputation+=10;p.intellect+=5;return "Вы убрали всё. Стало легче.";} },
      { text: "Просто постоять (+10 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+10);return "Вы стояли час. Никто не видел.";} },
    ] },
  { id: "e_will", minAge: 68, chance: 0.1, icon: "📝", title: "Завещание",
    desc: "Писец ждёт, что вы скажете.",
    choices: [
      { text: "Написать всё подробно (+10 Знаний)", action: (p)=>{p.intellect+=10;return "Вы написали сорок страниц. Наследники будут читать три вечера.";} },
      { text: "Три строки", action: ()=>"Вы сказали три строки. Писец записал и ушёл." },
    ] },
  { id: "e_summer", minAge: 70, chance: 0.1, icon: "☀️", title: "Хороший день",
    desc: "Ничего не происходит. Погода тёплая, все живы, хлеб есть.",
    choices: [
      { text: "Выйти и посидеть (+15 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+15);return "Вы сидели на крыльце весь день. Это было счастье.";} },
      { text: "Работать, как обычно", action: ()=>"Вы работали. День прошёл." },
    ] },
  { id: "e_boy_asks", minAge: 54, chance: 0.11, icon: "❓", title: "Мальчик с вопросом",
    desc: "Сын соседа спрашивает: «А страшно умирать?»",
    choices: [
      { text: "Ответить честно (+10 Знаний)", action: (p)=>{p.intellect+=10;p.reputation+=8;return "Вы ответили. Он запомнил это на всю жизнь.";} },
      { text: "Сказать, что не страшно", action: (p)=>{p.reputation+=4;return "Вы соврали. Он понял.";} },
    ] },
  { id: "e_library_gift", minAge: 69, chance: 0.1, icon: "📚", title: "Книги в дар",
    desc: "У вас есть книги, которые больше никто не откроет.",
    choices: [
      { text: "Отдать в академию (+20 репутации)", action: (p)=>{p.reputation+=20;p.intellect+=10;return "Их поставили в отдельный шкаф с вашим именем.";} },
      { text: "Оставить дома", action: ()=>"Они остались на полке." },
    ] },
  { id: "k_mirror", minAge: 5, chance: 0.11, icon: "🪞", title: "Зеркало в коридоре",
    desc: "В старом зеркале на миг отразилось не ваше лицо.",
    choices: [
      { text: "Отойти", action: ()=>"Вы отошли. Больше это не повторялось." },
      { text: "Смотреть ещё раз (+5 Знаний)", action: (p)=>{p.intellect+=5;return "Вы смотрели долго. Ничего. Но вы запомнили.";} },
    ] },
  { id: "k_kitchen", minAge: 4, chance: 0.11, icon: "🍲", title: "Кухня и огонь",
    desc: "Вы обожгли руку о котелок.",
    choices: [
      { text: "Терпеть и не плакать (+5 HP)", action: (p)=>{p.maxHp+=5;return "Вы не заплакали. Это была первая победа.";} },
      { text: "Заплакать и позвать (+4 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+4);return "Вас пожалели и перевязали.";} },
    ] },
  { id: "k_cat", minAge: 6, chance: 0.11, icon: "🐈", title: "Кот на крыше",
    desc: "Кот не спускается третий день.",
    choices: [
      { text: "Лезть за ним (+6 Севера)", action: (p)=>{p.northGodExp+=6;return "Вы залезли и сняли его. Крыша запомнила ваш вес.";} },
      { text: "Оставить еду внизу", action: (p)=>{p.reputation+=3;return "Он спустился ночью и стал вашим.";} },
    ] },
  { id: "k_chalk", minAge: 7, chance: 0.11, icon: "✏️", title: "Мел на стене",
    desc: "Вы нарисовали на стене то, что видели во сне.",
    choices: [
      { text: "Показать взрослым (+5 Знаний)", action: (p)=>{p.intellect+=5;return "Они долго молчали. Потом стёрли рисунок.";} },
      { text: "Стереть самому", action: ()=>"Вы стёрли. Сон остался." },
    ] },
  { id: "k_dice", minAge: 9, chance: 0.11, icon: "🎲", title: "Кости на спор",
    desc: "Старшие предложили сыграть на желание.",
    choices: [
      { text: "Играть (+4 Знаний, риск)", action: (p)=>{if(Math.random()>0.5){p.intellect+=4;return "Вы выиграли и загадали то, что нужно.";}p.reputation-=4;return "Вы проиграли. Желание было глупым.";} },
      { text: "Отказаться", action: ()=>"Вы отказались. Это было правильно." },
    ] },
  { id: "t_forge", minAge: 13, chance: 0.11, icon: "🔥", title: "Угли в горне",
    desc: "Вы обожгли ладонь о горячий металл.",
    choices: [
      { text: "Продолжать работу (+10 Меча, -8 HP)", action: (p)=>{p.swordGodExp+=10;p.hp=Math.max(1,p.hp-8);return "Вы работали с обожжённой рукой. Мастер это заметил.";} },
      { text: "Перевязать и уйти", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+5);return "Вы ушли. Рука зажила.";} },
    ] },
  { id: "t_wall", minAge: 14, chance: 0.11, icon: "🧱", title: "Стена и надпись",
    desc: "На старой стене вы нашли надпись, оставленную школьниками тридцать лет назад.",
    choices: [
      { text: "Дописать своё (+4 Знаний)", action: (p)=>{p.intellect+=4;return "Теперь вы часть стены.";} },
      { text: "Стереть чужое", action: (p)=>{p.reputation-=3;return "Вы стёрли. Кто-то расстроится через тридцать лет.";} },
    ] },
  { id: "t_market_girl", minAge: 15, chance: 0.11, icon: "🌹", title: "Девушка с цветами",
    desc: "Продавщица предлагает цветок за монету.",
    choices: [
      { text: "Купить (-1🪙, +6 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-1);p.reputation+=6;return "Вы отдали цветок матери. Она заплакала.";} },
      { text: "Отказаться", action: ()=>"Вы отказались. Она не обиделась." },
    ] },
  { id: "t_dog_hurt", minAge: 12, chance: 0.11, icon: "🐕", title: "Раненая собака",
    desc: "У дороги лежит собака с перебитой лапой.",
    choices: [
      { text: "Перевязать (-5🪙, +10 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-5);p.reputation+=10;return "Она выжила и ходила за вами год.";} },
      { text: "Пройти мимо", action: (p)=>{p.reputation-=4;return "Вы прошли. Она смотрела.";} },
    ] },
  { id: "t_storm", minAge: 13, chance: 0.11, icon: "⛈", title: "Буря на поле",
    desc: "Гроза застала вас в поле без укрытия.",
    choices: [
      { text: "Бежать домой (+5 Севера, -5 HP)", action: (p)=>{p.northGodExp+=5;p.hp=Math.max(1,p.hp-5);return "Вы добежали мокрым и живым.";} },
      { text: "Спрятаться под стог (+8 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+8);return "Вы просидели до утра. Было тепло.";} },
    ] },
  { id: "t_first_blood", minAge: 15, chance: 0.11, icon: "🩸", title: "Первая кровь",
    desc: "На охоте вы впервые убили живое.",
    choices: [
      { text: "Принять (+15 Меча)", action: (p)=>{p.swordGodExp+=15;return "Вы не отвернулись. Это осталось с вами.";} },
      { text: "Бросить нож", action: (p)=>{p.intellect+=8;return "Вы бросили. Вы поняли о себе что-то важное.";} },
    ] },
  { id: "t_teacher", minAge: 14, chance: 0.11, icon: "🧑‍🏫", title: "Учитель уезжает",
    desc: "Единственный человек, который вас понимал, уезжает.",
    choices: [
      { text: "Попросить остаться (+10 Знаний)", action: (p)=>{p.intellect+=10;return "Он оставил вам книгу и уехал.";} },
      { text: "Промолчать", action: (p)=>{p.hp=Math.max(1,p.hp-5);return "Вы промолчали. Он не узнал, что был нужен.";} },
    ] },
  { id: "a_moneylender", minAge: 20, chance: 0.11, icon: "🏦", title: "Ростовщик",
    desc: "Вам предлагают деньги под проценты.",
    choices: [
      { text: "Взять 200🪙 (долг 300)", action: (p)=>{p.coins+=200;p.debtOwed=(p.debtOwed||0)+300;return "Вы взяли. Теперь вы должны.";} },
      { text: "Отказаться", action: ()=>"Вы отказались. Жить стало беднее, но спокойнее." },
    ] },
  { id: "a_ruins", minAge: 22, chance: 0.11, icon: "🏚️", title: "Развалины за стеной",
    desc: "В старых развалинах кто-то шевелится.",
    choices: [
      { text: "Проверить (+15 Знаний, риск)", action: (p)=>{if(Math.random()>0.35){p.intellect+=15;p.coins+=40;return "Там был тайник (+40🪙).";}p.hp=Math.max(1,p.hp-25);return "Там были крысы размером с собаку (-25 HP).";} },
      { text: "Уйти", action: ()=>"Вы ушли. Развалины остались." },
    ] },
  { id: "a_wedding_crash", minAge: 23, chance: 0.11, icon: "🎉", title: "Чужая свадьба без приглашения",
    desc: "Вас случайно занесло на чужой праздник.",
    choices: [
      { text: "Остаться (+8 репутации)", action: (p)=>{p.reputation+=8;return "Вас приняли за родню и напоили.";} },
      { text: "Уйти", action: ()=>"Вы ушли тихо." },
    ] },
  { id: "a_grain", minAge: 25, chance: 0.11, icon: "🌾", title: "Зерно на продажу",
    desc: "Урожай есть, но цена низкая.",
    choices: [
      { text: "Ждать зимы (+120🪙 или -60🪙)", action: (p)=>{if(Math.random()>0.45){p.coins+=120;return "Зимой цена выросла (+120🪙).";}p.coins=Math.max(0,p.coins-60);return "Зерно попортилось (-60🪙).";} },
      { text: "Продать сейчас (+50🪙)", action: (p)=>{p.coins+=50;return "Вы продали и не гадали.";} },
    ] },
  { id: "a_soldier_return", minAge: 27, chance: 0.11, icon: "🎖️", title: "Вернулся с войны",
    desc: "Сосед вернулся с войны без руки.",
    choices: [
      { text: "Помочь (+15 репутации, -20🪙)", action: (p)=>{p.reputation+=15;p.coins=Math.max(0,p.coins-20);return "Вы наняли его в дом. Он работал лучше здорового.";} },
      { text: "Не вмешиваться", action: ()=>"Вы не вмешались." },
    ] },
  { id: "a_temple", minAge: 24, chance: 0.11, icon: "⛪", title: "Пожертвование",
    desc: "Жрец просит на новый алтарь.",
    choices: [
      { text: "Дать (-40🪙, +15 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-40);p.reputation+=15;return "Вас записали в книгу дарителей.";} },
      { text: "Отказать", action: ()=>"Жрец кивнул и пошёл дальше." },
    ] },
  { id: "a_hunt", minAge: 21, chance: 0.11, icon: "🏹", title: "Охота в лесу",
    desc: "Вы нашли следы крупного зверя.",
    choices: [
      { text: "Идти по следу (+60🪙, риск)", action: (p)=>{if(p.northGodExp>40||Math.random()>0.4){p.coins+=60;p.northGodExp+=10;return "Вы взяли его. Мясо и шкура (+60🪙).";}p.hp=Math.max(1,p.hp-35);return "Он оказался быстрее (-35 HP).";} },
      { text: "Вернуться", action: ()=>"Вы вернулись с пустыми руками." },
    ] },
  { id: "a_beggar", minAge: 26, chance: 0.11, icon: "🥣", title: "Нищий у моста",
    desc: "Он сидит тут годами. Сегодня он не поднял головы.",
    choices: [
      { text: "Дать еды (-3🪙, +6 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-3);p.reputation+=6;return "Он поднял голову и назвал ваше имя.";} },
      { text: "Пройти", action: ()=>"Вы прошли." },
    ] },
  { id: "a_letter_old", minAge: 29, chance: 0.11, icon: "📜", title: "Письмо от родителя",
    desc: "Отец написал вам письмо, которое вы нашли через год после его смерти.",
    choices: [
      { text: "Прочесть (+10 Знаний, +10 HP)", action: (p)=>{p.intellect+=10;p.maxHp+=10;return "Он написал то, что не говорил вслух.";} },
      { text: "Сжечь не читая", action: (p)=>{p.hp=Math.max(1,p.hp-10);return "Вы сожгли. И будете думать об этом всю жизнь.";} },
    ] },
  { id: "a_bar_fight2", minAge: 28, chance: 0.11, icon: "🍻", title: "Чужой долг за столом",
    desc: "Кто-то ушёл, не заплатив, и хозяин смотрит на вас.",
    choices: [
      { text: "Заплатить (-15🪙, +8 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-15);p.reputation+=8;return "Хозяин запомнил. Здесь вам всегда рады.";} },
      { text: "Сказать, что это не вы", action: (p)=>{p.reputation-=5;return "Он не поверил, но спорить не стал.";} },
    ] },
  { id: "m_caravan_join", minAge: 33, chance: 0.11, icon: "🐫", title: "Караван предлагает долю",
    desc: "Купец предлагает вложиться в дальний рейс.",
    choices: [
      { text: "Вложить 150🪙 (+350 или -150)", action: (p)=>{if(Math.random()>0.5){p.coins+=200;return "Рейс удался (+200🪙 сверх вложения).";}return "Караван погиб. Вы потеряли всё.";} },
      { text: "Отказаться", action: ()=>"Вы не стали рисковать." },
    ] },
  { id: "m_old_house", minAge: 35, chance: 0.11, icon: "🏠", title: "Старый дом продаётся",
    desc: "Дом, в котором вы выросли, продают.",
    choices: [
      { text: "Купить (-250🪙, +15 репутации)", action: (p)=>{if(p.coins>=250){p.coins-=250;p.reputation+=15;return "Вы вернули дом. Он пахнет детством.";}return "Денег не хватило.";} },
      { text: "Не покупать", action: (p)=>{p.hp=Math.max(1,p.hp-8);return "Вы смотрели, как его покупают другие.";} },
    ] },
  { id: "m_arena", minAge: 37, chance: 0.11, icon: "🏟️", title: "Арена",
    desc: "Вас зовут на арену за деньги.",
    choices: [
      { text: "Выйти на бой (+120🪙, риск)", action: (p)=>{if(p.swordGodExp>200){p.coins+=120;p.squadFame+=60;return "Вы выиграли три боя (+120🪙, +60 славы).";}p.hp=Math.max(1,p.hp-45);return "Вы проиграли второй бой (-45 HP).";} },
      { text: "Отказаться", action: ()=>"Вы отказались. Арена была полна." },
    ] },
  { id: "m_theft_house", minAge: 39, chance: 0.11, icon: "🕵️", title: "Кража в доме",
    desc: "Из дома пропала вещь. Все смотрят на слуг.",
    choices: [
      { text: "Искать правду (+8 Знаний)", action: (p)=>{p.intellect+=8;return "Вы нашли настоящего вора. Им был гость.";} },
      { text: "Выгнать первого попавшегося", action: (p)=>{p.reputation-=15;return "Вы выгнали невиновного. Это запомнили все слуги.";} },
    ] },
  { id: "m_plague2", minAge: 41, chance: 0.11, icon: "🦠", title: "Мор в соседнем городе",
    desc: "В город рядом пришла болезнь.",
    choices: [
      { text: "Закрыть ворота", action: (p)=>{p.reputation-=8;p.hp=Math.min(p.maxHp,p.hp+10);return "Вы закрыли ворота. Ваши живы.";} },
      { text: "Отправить помощь (-80🪙, +20 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-80);p.reputation+=20;return "Вы отправили хлеб и лекаря. Город выжил.";} },
    ] },
  { id: "m_son_sword", minAge: 43, chance: 0.11, icon: "⚔️", title: "Сын берёт меч",
    desc: "Ваш ребёнок впервые взял оружие в руки.",
    choices: [
      { text: "Учить самому (+15 репутации)", action: (p)=>{p.reputation+=15;p.swordGodExp+=10;return "Вы учили его весь год. Он оказался способным.";} },
      { text: "Отдать в академию (-150🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-150);return "Он вернулся через три года и знал больше вас.";} },
    ] },
  { id: "m_old_map", minAge: 45, chance: 0.11, icon: "🗺️", title: "Карта в переплёте",
    desc: "В старом переплёте нашлась карта с пометкой.",
    choices: [
      { text: "Поехать по ней (-1 год, +25 Знаний)", action: (p)=>{p.intellect+=25;return "Вы нашли место. Оно было пустым, но это было настоящее путешествие.";} },
      { text: "Оставить в книге", action: ()=>"Карта осталась лежать." },
    ] },
  { id: "m_tax_rise", minAge: 47, chance: 0.11, icon: "📜", title: "Новый налог",
    desc: "Корона подняла налог на землю.",
    choices: [
      { text: "Заплатить (-120🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-120);return "Вы заплатили.";} },
      { text: "Скрыть часть дохода (-10 репутации)", action: (p)=>{p.reputation-=10;p.coins+=40;return "Вы скрыли. Писцы пока не нашли.";} },
    ] },
  { id: "m_old_teacher", minAge: 49, chance: 0.11, icon: "🧑‍🏫", title: "Учитель при смерти",
    desc: "Тот, кто вас учил, больше не встаёт.",
    choices: [
      { text: "Быть рядом (+10 HP)", action: (p)=>{p.maxHp+=10;return "Вы держали его руку до конца.";} },
      { text: "Приехать позже", action: (p)=>{p.hp=Math.max(1,p.hp-12);return "Вы опоздали на день.";} },
    ] },
  { id: "e_morning", minAge: 62, chance: 0.11, icon: "🌅", title: "Утро без дел",
    desc: "Впервые за годы у вас нет срочных дел.",
    choices: [
      { text: "Пройтись по городу (+12 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+12);p.reputation+=5;return "Вы прошлись. Вас узнавали.";} },
      { text: "Сидеть дома", action: ()=>"Вы сидели. День прошёл." },
    ] },
  { id: "e_old_rival2", minAge: 61, chance: 0.11, icon: "🗡️", title: "Старый враг слаб",
    desc: "Тот, кто был вашим врагом, теперь стар и беспомощен.",
    choices: [
      { text: "Помочь (+20 репутации)", action: (p)=>{p.reputation+=20;return "Вы помогли. Он не понял почему. Вы тоже.";} },
      { text: "Напомнить ему всё", action: (p)=>{p.reputation-=10;p.hp=Math.max(1,p.hp-5);return "Вы сказали всё. Легче не стало.";} },
    ] },
  { id: "e_grandkid_gift", minAge: 63, chance: 0.11, icon: "🎁", title: "Подарок внуку",
    desc: "Внук просит вашу старую вещь.",
    choices: [
      { text: "Отдать (+15 HP)", action: (p)=>{p.maxHp+=15;p.reputation+=8;return "Он носит её до сих пор.";} },
      { text: "Оставить себе", action: ()=>"Вы оставили. Он не обиделся." },
    ] },
  { id: "e_quiet_year", minAge: 65, chance: 0.11, icon: "🍃", title: "Тихий год",
    desc: "Ничего не случилось. Совсем ничего.",
    choices: [
      { text: "Отдохнуть (+20 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+20);return "Вы отдохнули впервые за жизнь.";} },
      { text: "Начать новое дело (+10 Знаний)", action: (p)=>{p.intellect+=10;return "Вы начали. Не закончили, но начали.";} },
    ] },
  { id: "e_last_words", minAge: 68, chance: 0.11, icon: "🌙", title: "Слова на ночь",
    desc: "Вы понимаете, что многое не сказали тем, кто рядом.",
    choices: [
      { text: "Сказать сейчас (+20 HP)", action: (p)=>{p.maxHp+=20;return "Вы сказали. Это оказалось легче, чем вы думали.";} },
      { text: "Оставить как есть", action: ()=>"Вы промолчали. Так тоже бывает." },
    ] },
  { id: "e_harvest_old", minAge: 70, chance: 0.11, icon: "🌾", title: "Последняя жатва",
    desc: "Вы вышли посмотреть, как убирают поле.",
    choices: [
      { text: "Помочь (+5 HP, +10 репутации)", action: (p)=>{p.maxHp+=5;p.reputation+=10;return "Вы связали три снопа. Вам это стоило дня, но было нужно.";} },
      { text: "Смотреть с крыльца", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+8);return "Вы смотрели. Это была ваша земля.";} },
    ] },
  { id: "e_name_call", minAge: 72, chance: 0.11, icon: "📣", title: "Вас окликнули",
    desc: "Кто-то на улице зовёт вас по имени, которое вы не слышали двадцать лет.",
    choices: [
      { text: "Обернуться (+10 HP)", action: (p)=>{p.maxHp+=10;return "Это был тот, кого вы считали мёртвым.";} },
      { text: "Идти дальше", action: ()=>"Вы не обернулись. Голос остался позади." },
    ] },
  { id: "r_begaritt_sand", minAge: 18, chance: 0.11, icon: "🏜️", title: "Песчаная буря",
    desc: "Стена песка идёт с запада.",
    choices: [
      { text: "Укрыться в доме (+5 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+5);return "Вы переждали под крышей.";} },
      { text: "Идти дальше (+10 Севера, -15 HP)", action: (p)=>{p.northGodExp+=10;p.hp=Math.max(1,p.hp-15);return "Вы шли сквозь бурю. Мало кто так может.";} },
    ] },
  { id: "r_rano_snow", minAge: 16, chance: 0.11, icon: "❄️", title: "Метель на перевале",
    desc: "Дорогу замело за ночь.",
    choices: [
      { text: "Переждать (-1 год)", action: (p)=>{p.intellect+=5;return "Вы ждали три дня и изучали горы.";} },
      { text: "Пробиваться (+15 Севера, -20 HP)", action: (p)=>{p.northGodExp+=15;p.hp=Math.max(1,p.hp-20);return "Вы прошли. Это запомнили в Шарии.";} },
    ] },
  { id: "r_forest_beast", minAge: 20, chance: 0.11, icon: "🌲", title: "Зверь в лесу",
    desc: "Великий Лес не любит чужих.",
    choices: [
      { text: "Драться (+20 Меча, риск)", action: (p)=>{if(p.northGodExp>50){p.swordGodExp+=20;return "Вы победили. Лес пропустил вас.";}p.hp=Math.max(1,p.hp-30);return "Вы еле ушли (-30 HP).";} },
      { text: "Уйти тихо", action: ()=>"Вы ушли, не разбудив его." },
    ] },
  { id: "r_demon_road", minAge: 22, chance: 0.11, icon: "🔥", title: "Дорога в Багровых Пустошах",
    desc: "Впереди горит что-то, что не должно гореть.",
    choices: [
      { text: "Проверить (+20 Знаний)", action: (p)=>{p.intellect+=20;p.hp=Math.max(1,p.hp-10);return "Это был старый магический круг. Он ещё работал.";} },
      { text: "Обойти", action: ()=>"Вы обошли. Огонь остался гореть." },
    ] },
  { id: "r_milis_pilgrim", minAge: 19, chance: 0.11, icon: "⛪", title: "Паломник",
    desc: "По дороге идёт паломник без денег.",
    choices: [
      { text: "Дать еды (+12 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-5);p.reputation+=12;return "Он благословил ваш дом. Вы не верите, но стало теплее.";} },
      { text: "Пройти мимо", action: ()=>"Вы прошли мимо." },
    ] },
  { id: "r_asura_noble", minAge: 24, chance: 0.11, icon: "🏰", title: "Знатный сосед",
    desc: "Сосед-аристократ приглашает на охоту.",
    choices: [
      { text: "Поехать (+10 репутации)", action: (p)=>{p.reputation+=10;p.swordGodExp+=8;return "Вы были лучшим в тот день. Он это запомнил.";} },
      { text: "Отказаться", action: (p)=>{p.reputation-=4;return "Он счёл это оскорблением.";} },
    ] },
  { id: "r_prisoner", minAge: 21, chance: 0.11, icon: "🔒", title: "Пленный",
    desc: "На рынке продают пленного.",
    choices: [
      { text: "Выкупить (-90🪙, +20 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-90);p.reputation+=20;return "Он остался с вами и работал как трое.";} },
      { text: "Отвернуться", action: (p)=>{p.reputation-=6;return "Вы отвернулись.";} },
    ] },
  { id: "r_smuggle", minAge: 26, chance: 0.11, icon: "📦", title: "Товар без печати",
    desc: "Вам предлагают провезти груз без пошлины.",
    choices: [
      { text: "Согласиться (+180🪙, риск)", action: (p)=>{if(Math.random()>0.35){p.coins+=180;return "Прошло гладко (+180🪙).";}p.coins=Math.max(0,p.coins-120);return "Стража нашла груз (-120🪙).";} },
      { text: "Отказаться", action: ()=>"Вы отказались. Он нашёл другого." },
    ] },
  { id: "r_old_mine", minAge: 28, chance: 0.11, icon: "⛏", title: "Старая шахта",
    desc: "В шахте нашли новую жилу.",
    choices: [
      { text: "Вложиться (-120🪙, +300🪙 если повезёт)", action: (p)=>{if(Math.random()>0.5){p.coins+=180;return "Жила оказалась богатой (+180 сверх вложений).";}return "Жила оказалась пустой.";} },
      { text: "Не вкладываться", action: ()=>"Вы не стали. Шахта закрылась через год." },
    ] },
  { id: "r_wedding_rich", minAge: 30, chance: 0.11, icon: "💒", title: "Богатая свадьба",
    desc: "Вас позвали на свадьбу дома, с которым вы не дружите.",
    choices: [
      { text: "Прийти с подарком (-80🪙, +15 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-80);p.reputation+=15;return "Вас заметили и запомнили.";} },
      { text: "Не прийти", action: (p)=>{p.reputation-=8;return "Это сочли вызовом.";} },
    ] },
  { id: "r_ship", minAge: 32, chance: 0.11, icon: "⛵", title: "Корабль ищет команду",
    desc: "В порту набирают команду на дальний рейс.",
    choices: [
      { text: "Наняться (+150🪙, риск)", action: (p)=>{if(Math.random()>0.3){p.coins+=150;p.intellect+=10;return "Вы вернулись с деньгами и историями.";}p.hp=Math.max(1,p.hp-50);return "Шторм был страшный (-50 HP).";} },
      { text: "Остаться на берегу", action: ()=>"Корабль ушёл без вас." },
    ] },
  { id: "r_ruin_find", minAge: 34, chance: 0.11, icon: "🏺", title: "Находка в земле",
    desc: "При копке колодца нашли что-то твёрдое.",
    choices: [
      { text: "Копать дальше (+15 Знаний, +80🪙)", action: (p)=>{p.intellect+=15;p.coins+=80;return "Старая утварь. Продали за 80🪙.";} },
      { text: "Закопать обратно", action: (p)=>{p.reputation+=5;return "Вы закопали. Кто-то другой найдёт.";} },
    ] },
  { id: "r_old_bridge", minAge: 36, chance: 0.11, icon: "🌉", title: "Старый мост",
    desc: "Мост рушится, а через него идёт вся торговля.",
    choices: [
      { text: "Починить (-100🪙, +30 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-100);p.reputation+=30;return "Мост стоит. По нему ходят и поминают вас.";} },
      { text: "Не трогать", action: (p)=>{p.reputation-=10;return "Мост упал через год.";} },
    ] },
  { id: "r_guild_call", minAge: 38, chance: 0.11, icon: "🏆", title: "Гильдия зовёт",
    desc: "Гильдия предлагает ранг выше.",
    choices: [
      { text: "Пройти испытание (+25 славы)", action: (p)=>{if(calcCombatPower&&calcCombatPower(p)>1000){p.squadFame+=25;p.guildExp+=20;return "Вы прошли испытание и получили ранг.";}return "Вы не прошли. Остались где были.";} },
      { text: "Отказаться", action: ()=>"Вы остались при своём." },
    ] },
  { id: "r_old_books", minAge: 40, chance: 0.11, icon: "📚", title: "Старые книги",
    desc: "В заброшенном доме остались книги.",
    choices: [
      { text: "Забрать (+15 Знаний)", action: (p)=>{p.intellect+=15;return "Вы читали их всю зиму.";} },
      { text: "Оставить", action: ()=>"Вы оставили. Их съели мыши." },
    ] },
  { id: "r_orphanage", minAge: 42, chance: 0.11, icon: "🏠", title: "Приют",
    desc: "Приюту нужны деньги на зиму.",
    choices: [
      { text: "Дать (-150🪙, +25 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-150);p.reputation+=25;return "Они пережили зиму. Вы получили письмо от каждого.";} },
      { text: "Дать немного (-30🪙, +8 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-30);p.reputation+=8;return "Вы дали, сколько смогли.";} },
      { text: "Отказать", action: (p)=>{p.reputation-=12;return "Вы отказали. Кто-то запомнил.";} },
    ] },
  { id: "r_old_debt2", minAge: 44, chance: 0.11, icon: "💀", title: "Старый должник",
    desc: "Человек, который вам должен, вернулся через двадцать лет.",
    choices: [
      { text: "Простить (+20 репутации)", action: (p)=>{p.reputation+=20;return "Вы простили. Он заплакал.";} },
      { text: "Забрать с процентами (+150🪙)", action: (p)=>{p.coins+=150;p.reputation-=10;return "Вы забрали всё до последней монеты.";} },
    ] },
  { id: "r_wall_old", minAge: 46, chance: 0.11, icon: "🧱", title: "Городская стена",
    desc: "Стену надо чинить, а денег нет.",
    choices: [
      { text: "Дать свои (-200🪙, +40 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-200);p.reputation+=40;return "Ваше имя выбили на камне у ворот.";} },
      { text: "Пусть решает совет", action: ()=>"Совет решил, что стена подождёт." },
    ] },
  { id: "r_old_feast", minAge: 48, chance: 0.11, icon: "🍖", title: "Пир в честь урожая",
    desc: "Вас зовут на общий пир.",
    choices: [
      { text: "Прийти (-20🪙, +12 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-20);p.reputation+=12;return "Вы сидели во главе стола. Вам это шло.";} },
      { text: "Не прийти", action: ()=>"Пир прошёл без вас." },
    ] },
  { id: "r_relief", minAge: 50, chance: 0.11, icon: "🌊", title: "Наводнение",
    desc: "Река вышла из берегов.",
    choices: [
      { text: "Спасать людей (+25 репутации, -20 HP)", action: (p)=>{p.reputation+=25;p.maxHp+=10;p.hp=Math.max(1,p.hp-20);return "Вы вытащили одиннадцать человек из воды.";} },
      { text: "Держать свой дом", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+5);return "Ваш дом устоял. Чужие — не все.";} },
    ] },
  { id: "d_old_friend3", minAge: 30, chance: 0.11, icon: "🕯️", title: "Похороны друга",
    desc: "Умер тот, с кем вы делили всё.",
    choices: [
      { text: "Пойти (+10 HP)", action: (p)=>{p.maxHp+=10;return "Вы шли за гробом до конца.";} },
      { text: "Закрыться дома", action: (p)=>{p.hp=Math.max(1,p.hp-15);return "Вы не пошли. Это было хуже.";} },
    ] },
  { id: "d_child_ill", minAge: 34, chance: 0.11, icon: "🤒", title: "Болезнь ребёнка",
    desc: "Ваш ребёнок горит в жару.",
    choices: [
      { text: "Искать лекаря (-120🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-120);p.reputation+=10;return "Лекарь приехал ночью. Ребёнок выжил.";} },
      { text: "Лечить самому (+10 Знаний, риск)", action: (p)=>{if(Math.random()>0.3){p.intellect+=10;return "Вы справились сами. Земля слухом полнится.";}p.hp=Math.max(1,p.hp-20);return "Вы едва справились (-20 HP от усталости).";} },
    ] },
  { id: "d_house_roof", minAge: 31, chance: 0.11, icon: "🏠", title: "Крыша течёт",
    desc: "После дождей надо менять крышу.",
    choices: [
      { text: "Починить (-90🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-90);return "Крыша новая. Дом сухой.";} },
      { text: "Подставить тазы", action: (p)=>{p.hp=Math.max(1,p.hp-5);return "Вы жили с тазами всю зиму.";} },
    ] },
  { id: "d_gold_found", minAge: 33, chance: 0.11, icon: "💰", title: "Находка в поле",
    desc: "Вы нашли кошель с деньгами.",
    choices: [
      { text: "Взять (+120🪙)", action: (p)=>{p.coins+=120;p.reputation-=5;return "Вы взяли. Хозяин не найдётся.";} },
      { text: "Искать хозяина (+20 репутации)", action: (p)=>{p.reputation+=20;return "Хозяином был купец. Он дал вам торговое знакомство.";} },
    ] },
  { id: "d_betray_wife", minAge: 36, chance: 0.11, icon: "🖤", title: "Разговор в доме",
    desc: "Кто-то из близких сказал то, что не надо было.",
    choices: [
      { text: "Поговорить прямо (+10 HP)", action: (p)=>{p.maxHp+=10;return "Вы поговорили. Стало проще.";} },
      { text: "Молчать годами", action: (p)=>{p.hp=Math.max(1,p.hp-20);return "Вы молчали. Это съело годы.";} },
    ] },
  { id: "d_new_trade", minAge: 38, chance: 0.11, icon: "🐫", title: "Новое дело",
    desc: "Вам предлагают вложиться в мастерскую.",
    choices: [
      { text: "Вложить 200🪙 (+60🪙/год)", action: (p)=>{if(p.coins>=200){p.coins-=200;p.estatePassive=(p.estatePassive||0)+60;return "Мастерская даёт 60🪙 в год.";}return "Денег не хватило.";} },
      { text: "Отказаться", action: ()=>"Вы не стали." },
    ] },
  { id: "d_old_wound2", minAge: 40, chance: 0.11, icon: "🩹", title: "Старая травма",
    desc: "Колено напоминает о давней драке.",
    choices: [
      { text: "Лечиться (-80🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-80);p.maxHp+=10;return "Лекарь поправил. Ходить легче.";} },
      { text: "Терпеть", action: (p)=>{p.hp=Math.max(1,p.hp-15);return "Вы хромали весь год.";} },
    ] },
  { id: "d_letter_heir", minAge: 42, chance: 0.11, icon: "✉️", title: "Письмо от наследника",
    desc: "Ваш ребёнок написал вам из другого региона.",
    choices: [
      { text: "Ответить (+10 HP)", action: (p)=>{p.maxHp+=10;p.reputation+=5;return "Вы писали три страницы. Он ответил через месяц.";} },
      { text: "Не отвечать", action: (p)=>{p.hp=Math.max(1,p.hp-8);return "Вы не ответили.";} },
    ] },
  { id: "d_fire_home", minAge: 44, chance: 0.11, icon: "🔥", title: "Пожар в доме",
    desc: "Ночью загорелась крыша.",
    choices: [
      { text: "Тушить всем (+20 репутации, -30 HP)", action: (p)=>{p.reputation+=20;p.hp=Math.max(1,p.hp-30);return "Дом отстояли. Все живы.";} },
      { text: "Спасать вещи", action: (p)=>{p.coins+=40;p.hp=Math.max(1,p.hp-20);return "Вы спасли сундук и обожглись.";} },
    ] },
  { id: "d_old_promise", minAge: 46, chance: 0.11, icon: "🤝", title: "Старое обещание",
    desc: "Вы обещали кому-то то, что забыли.",
    choices: [
      { text: "Выполнить (-60🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-60);p.reputation+=20;return "Вы выполнили спустя двадцать лет. Это оценили.";} },
      { text: "Забыть окончательно", action: (p)=>{p.reputation-=10;return "Вы забыли. Кто-то помнил.";} },
    ] },
  { id: "d_summer_fest", minAge: 48, chance: 0.11, icon: "🎪", title: "Праздник",
    desc: "Город устраивает праздник.",
    choices: [
      { text: "Устроить своё (-70🪙, +20 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-70);p.reputation+=20;return "Ваш стол был лучшим.";} },
      { text: "Смотреть", action: ()=>"Вы смотрели из толпы." },
    ] },
  { id: "x_1", minAge: 12, chance: 0.11, icon: "🕯️", title: "Свеча в окне",
    desc: "В окне соседнего дома горит одна свеча всю ночь.",
    choices: [
      { text: "Постучать (+8 репутации)", action: (p)=>{p.reputation+=8;return "Там был больной. Вы помогли.";} },
      { text: "Не вмешиваться", action: ()=>"Свеча погасла к утру." },
    ] },
  { id: "x_2", minAge: 15, chance: 0.11, icon: "🎒", title: "Котомка на дороге",
    desc: "Кто-то оставил котомку у развилки.",
    choices: [
      { text: "Открыть (+60🪙 или ничего)", action: (p)=>{if(Math.random()>0.4){p.coins+=60;return "Внутри были монеты и письмо (+60🪙).";}return "Внутри был хлеб и ничего больше.";} },
      { text: "Оставить", action: ()=>"Вы оставили её у камня." },
    ] },
  { id: "x_3", minAge: 18, chance: 0.11, icon: "🎭", title: "Уличный актёр",
    desc: "На площади показывают пьесу о вас. Не очень лестную.",
    choices: [
      { text: "Смотреть до конца (+6 Знаний)", action: (p)=>{p.intellect+=6;return "Вы досмотрели. Актёр был талантлив.";} },
      { text: "Уйти", action: (p)=>{p.reputation-=3;return "Вы ушли. Толпа заметила.";} },
    ] },
  { id: "x_4", minAge: 21, chance: 0.11, icon: "⚖️", title: "Свидетель",
    desc: "Вас зовут свидетелем в суде.",
    choices: [
      { text: "Сказать правду (+15 репутации)", action: (p)=>{p.reputation+=15;return "Вы сказали правду. Кто-то остался недоволен.";} },
      { text: "Соврать (+40🪙, -10 репутации)", action: (p)=>{p.coins+=40;p.reputation-=10;return "Вам заплатили за ложь.";} },
    ] },
  { id: "x_5", minAge: 24, chance: 0.11, icon: "🐴", title: "Лошадь без хозяина",
    desc: "На дороге стоит осёдланная лошадь без всадника.",
    choices: [
      { text: "Взять себе (+35🪙)", action: (p)=>{p.coins+=35;return "Вы продали её на рынке.";} },
      { text: "Искать хозяина (+12 репутации)", action: (p)=>{p.reputation+=12;return "Хозяин был ранен в кустах. Вы спасли и его, и лошадь.";} },
    ] },
  { id: "x_6", minAge: 27, chance: 0.11, icon: "🍞", title: "Пекарь и цена",
    desc: "Пекарь поднял цену на хлеб.",
    choices: [
      { text: "Платить (+2 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+2);return "Хлеб был хорош.";} },
      { text: "Купить у другого (+1 репутации)", action: (p)=>{p.reputation+=1;return "Вы нашли дешевле.";} },
    ] },
  { id: "x_7", minAge: 30, chance: 0.11, icon: "🎯", title: "Состязание лучников",
    desc: "В городе состязание. Приз — 100 монет.",
    choices: [
      { text: "Участвовать (+100🪙 или ничего)", action: (p)=>{if(p.northGodExp>30||Math.random()>0.5){p.coins+=100;p.squadFame+=20;return "Вы попали в десятку (+100🪙).";}p.reputation-=4;return "Вы промахнулись.";} },
      { text: "Смотреть", action: ()=>"Вы смотрели, как стреляют другие." },
    ] },
  { id: "x_8", minAge: 33, chance: 0.11, icon: "🌧", title: "Дождь три недели",
    desc: "Дождь не кончается, поля тонут.",
    choices: [
      { text: "Помочь с водоотводом (+15 репутации)", action: (p)=>{p.reputation+=15;return "Вы спасли урожай у трёх дворов.";} },
      { text: "Ждать", action: (p)=>{p.coins=Math.max(0,p.coins-20);return "Урожай погиб. Цены выросли.";} },
    ] },
  { id: "x_9", minAge: 36, chance: 0.11, icon: "🕊️", title: "Мир после ссоры",
    desc: "Два дома, которые враждовали, готовы помириться.",
    choices: [
      { text: "Помочь (-40🪙, +20 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-40);p.reputation+=20;return "Вы устроили общий обед. Вражда кончилась.";} },
      { text: "Не лезть", action: ()=>"Они помирились без вас." },
    ] },
  { id: "x_10", minAge: 39, chance: 0.11, icon: "🪙", title: "Странная монета",
    desc: "В кошеле оказалась монета, которой не должно существовать.",
    choices: [
      { text: "Изучать (+12 Знаний)", action: (p)=>{p.intellect+=12;return "Монета из времён до Катаклизма. Вы сохранили её.";} },
      { text: "Потратить (+1🪙)", action: (p)=>{p.coins+=1;return "Трактирщик взял её и потом долго рассматривал.";} },
    ] },
  { id: "x_11", minAge: 42, chance: 0.11, icon: "👨‍⚖️", title: "Спор о воде",
    desc: "Два двора спорят о колодце.",
    choices: [
      { text: "Рассудить (+12 репутации)", action: (p)=>{p.reputation+=12;return "Вы решили, чтобы вода была общая.";} },
      { text: "Взять сторону", action: (p)=>{p.reputation-=5;p.coins+=20;return "Вы поддержали того, кто заплатил.";} },
    ] },
  { id: "x_12", minAge: 45, chance: 0.11, icon: "🧵", title: "Старое платье",
    desc: "В сундуке нашли платье, которое носили три поколения.",
    choices: [
      { text: "Сберечь (+8 HP)", action: (p)=>{p.maxHp+=8;return "Вы повесили его в шкаф. Оно висит до сих пор.";} },
      { text: "Продать (+50🪙)", action: (p)=>{p.coins+=50;return "Купец дал хорошую цену.";} },
    ] },
  { id: "x_13", minAge: 48, chance: 0.11, icon: "🌻", title: "Соседский сад",
    desc: "Соседи уехали, сад остался.",
    choices: [
      { text: "Ухаживать (+10 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+10);return "Сад цветёт. Возвращаться они не собираются.";} },
      { text: "Бросить", action: ()=>"Сад зарос." },
    ] },
  { id: "x_14", minAge: 51, chance: 0.11, icon: "🕰", title: "Старые часы",
    desc: "Часы в доме остановились.",
    choices: [
      { text: "Починить (-20🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-20);p.intellect+=5;return "Часы идут. Вы слышите время.";} },
      { text: "Оставить", action: ()=>"Они стоят на том же часе." },
    ] },
  { id: "x_15", minAge: 54, chance: 0.11, icon: "🎵", title: "Песня о вас",
    desc: "На рынке поют песню, где вы — герой.",
    choices: [
      { text: "Слушать (+8 HP)", action: (p)=>{p.maxHp+=8;return "В песне вы лучше, чем в жизни. Приятно.";} },
      { text: "Поправить певца", action: (p)=>{p.intellect+=5;return "Вы рассказали, как было. Он не поверил.";} },
    ] },
  { id: "x_16", minAge: 57, chance: 0.11, icon: "🐔", title: "Куры ушли",
    desc: "Куры пропали ночью.",
    choices: [
      { text: "Искать (найдёте и лису)", action: (p)=>{if(Math.random()>0.5){p.coins+=15;return "Вы нашли и кур, и лису. Лису продали.";}return "Кур не нашли.";} },
      { text: "Махнуть рукой", action: ()=>"Вы махнули рукой." },
    ] },
  { id: "x_17", minAge: 60, chance: 0.11, icon: "🌙", title: "Бессонница",
    desc: "Вы не спите третью ночь.",
    choices: [
      { text: "Выйти на воздух (+10 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+10);return "Вы сидели под звёздами до утра.";} },
      { text: "Лежать", action: (p)=>{p.hp=Math.max(1,p.hp-10);return "Вы лежали и думали о всех, кого нет.";} },
    ] },
  { id: "x_18", minAge: 63, chance: 0.11, icon: "🪑", title: "Пустой стул",
    desc: "За столом стоит стул, за которым никто не сидит.",
    choices: [
      { text: "Поставить свечу (+8 HP)", action: (p)=>{p.maxHp+=8;return "Вы поставили. Так делали ваши предки.";} },
      { text: "Убрать стул", action: (p)=>{p.hp=Math.max(1,p.hp-5);return "Вы убрали. Стало просторнее и пустее.";} },
    ] },
  { id: "x_19", minAge: 66, chance: 0.11, icon: "📜", title: "Старая грамота",
    desc: "В бумагах нашлась грамота с правом на землю.",
    choices: [
      { text: "Пойти к писцам (+20 репутации)", action: (p)=>{p.intellect+=10;p.reputation+=20;return "Право подтвердили. Земля ваша по закону.";} },
      { text: "Положить обратно", action: ()=>"Грамота осталась лежать." },
    ] },
  { id: "x_20", minAge: 68, chance: 0.11, icon: "🕯️", title: "Последняя свеча",
    desc: "Свеча догорела, а новая не зажигается.",
    choices: [
      { text: "Зажечь от очага (+5 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+5);return "Загорелась с третьей попытки.";} },
      { text: "Посмотреть в темноту", action: (p)=>{p.intellect+=8;return "В темноте вы подумали о хорошем.";} },
    ] },
  { id: "big_child_wed", minAge: 52, chance: 0.11, icon: "💍", title: "Свадьба ребёнка",
    desc: "Ваш ребёнок женится. Решать вам, каким будет праздник.",
    choices: [
      { text: "Сыграть большую свадьбу (-250🪙, +30 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-250);p.reputation+=30;return "Гуляли три дня. Помнят до сих пор.";} },
      { text: "Скромно (-40🪙, +10 репутации)", action: (p)=>{p.coins=Math.max(0,p.coins-40);p.reputation+=10;return "Было тихо и по-семейному.";} },
      { text: "Не приходить", action: (p)=>{p.reputation-=20;return "Вы не пришли. Это запомнят и он, и все остальные.";} },
    ] },
  { id: "big_grandborn", minAge: 55, chance: 0.11, icon: "👶", title: "Родился внук",
    desc: "В доме снова пахнет молоком и пелёнками.",
    choices: [
      { text: "Взять на руки (+20 HP)", action: (p)=>{p.maxHp+=20;return "Вы держали его и думали, что род идёт дальше.";} },
      { text: "Оставить молодым", action: ()=>"Вы не мешали." },
    ] },
  { id: "big_old_battle", minAge: 30, chance: 0.11, icon: "⚔️", title: "Большая драка",
    desc: "В таверне дерутся двое, и один из них сейчас получит нож.",
    choices: [
      { text: "Перехватить нож (+20 репутации, -10 HP)", action: (p)=>{p.reputation+=20;p.hp=Math.max(1,p.hp-10);return "Вы спасли ему жизнь. Он об этом не знает.";} },
      { text: "Крикнуть стражу (+8 репутации)", action: (p)=>{p.reputation+=8;return "Стража пришла до крови.";} },
      { text: "Смотреть", action: (p)=>{p.reputation-=10;return "Вы видели, как он упал.";} },
    ] },
  { id: "f_1", minAge: 10, chance: 0.11, icon: "🐦", title: "Птица в доме",
    desc: "В окно влетела птица.",
    choices: [
      { text: "Выпустить (+4 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+4);return "Она улетела. Считается к удаче.";} },
      { text: "Поймать и оставить", action: (p)=>{p.reputation-=2;return "Она умерла к вечеру.";} },
    ] },
  { id: "f_2", minAge: 13, chance: 0.11, icon: "🧺", title: "Стирка на реке",
    desc: "Вы стираете с остальными и слышите разговоры взрослых.",
    choices: [
      { text: "Слушать (+6 Знаний)", action: (p)=>{p.intellect+=6;return "Вы узнали то, что не для детей.";} },
      { text: "Не слушать", action: ()=>"Вы не слушали." },
    ] },
  { id: "f_3", minAge: 16, chance: 0.11, icon: "🥊", title: "Спарринг",
    desc: "Вас вызвал тот, кто сильнее.",
    choices: [
      { text: "Драться (+12 Меча, -12 HP)", action: (p)=>{p.swordGodExp+=12;p.hp=Math.max(1,p.hp-12);return "Вы продержались дольше, чем он ждал.";} },
      { text: "Отказаться", action: (p)=>{p.reputation-=5;return "Он назвал вас трусом при всех.";} },
    ] },
  { id: "f_4", minAge: 19, chance: 0.11, icon: "🛏", title: "Ночлег на постоялом дворе",
    desc: "Мест нет, кроме одной комнаты с незнакомцем.",
    choices: [
      { text: "Делать вид, что вы заодно", action: ()=>"Вы переночевали и ушли до рассвета." },
      { text: "Спать у конюшни (+5 HP)", action: (p)=>{p.maxHp+=5;return "Сено оказалось теплее кровати.";} },
    ] },
  { id: "f_5", minAge: 22, chance: 0.11, icon: "🏹", title: "Браконьер",
    desc: "В лесу стоит человек с чужой дичью.",
    choices: [
      { text: "Сдать страже (+20🪙)", action: (p)=>{p.coins+=20;p.reputation-=5;return "Вам заплатили за сдачу.";} },
      { text: "Промолчать (+10 репутации)", action: (p)=>{p.reputation+=10;return "Он запомнил и потом помог вам.";} },
    ] },
  { id: "f_6", minAge: 25, chance: 0.11, icon: "🍺", title: "Пивная кружка",
    desc: "Вам налили лишнего.",
    choices: [
      { text: "Пить (+4 HP, -3🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-3);p.hp=Math.min(p.maxHp,p.hp+4);return "Вечер был хорош.";} },
      { text: "Уйти трезвым", action: ()=>"Вы ушли трезвым и утром были правы." },
    ] },
  { id: "f_7", minAge: 28, chance: 0.11, icon: "🕳", title: "Яма на дороге",
    desc: "В яме застряла повозка купца.",
    choices: [
      { text: "Помочь (+12 репутации)", action: (p)=>{p.reputation+=12;p.coins+=20;return "Купец заплатил и записал ваше имя.";} },
      { text: "Обойти", action: ()=>"Вы обошли. Купец нанял других." },
    ] },
  { id: "f_8", minAge: 31, chance: 0.11, icon: "🧭", title: "Развилка",
    desc: "На развилке указатель стёрт.",
    choices: [
      { text: "Пойти вправо (+5 Знаний)", action: (p)=>{p.intellect+=5;return "Вы нашли короткую дорогу.";} },
      { text: "Пойти влево (+5 Севера)", action: (p)=>{p.northGodExp+=5;return "Вы прошли через холмы. Оказалось красиво.";} },
    ] },
  { id: "f_9", minAge: 34, chance: 0.11, icon: "🎣", title: "Рыбалка",
    desc: "Утренний клёв хорош.",
    choices: [
      { text: "Ловить (+15🪙)", action: (p)=>{p.coins+=15;return "Вы продали рыбу на рынке.";} },
      { text: "Отпустить всё (+8 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+8);return "Вы сидели с удочкой и ни о чём не думали.";} },
    ] },
  { id: "f_10", minAge: 37, chance: 0.11, icon: "📯", title: "Гонец",
    desc: "Мимо мчится гонец с приказом.",
    choices: [
      { text: "Подвезти (+10 репутации)", action: (p)=>{p.reputation+=10;return "Он запомнил вас и передал благодарность от короны.";} },
      { text: "Не вмешиваться", action: ()=>"Он проехал." },
    ] },
  { id: "f_11", minAge: 40, chance: 0.11, icon: "🧱", title: "Кладка стены",
    desc: "Вы помогаете класть стену нового дома.",
    choices: [
      { text: "Работать (+10 HP, +8 репутации)", action: (p)=>{p.maxHp+=10;p.reputation+=8;return "Стена стоит ровно. Вы положили первый камень.";} },
      { text: "Отказаться", action: ()=>"Вы не помогали." },
    ] },
  { id: "f_12", minAge: 43, chance: 0.11, icon: "🕯️", title: "Поминовение",
    desc: "Годовщина чьей-то смерти.",
    choices: [
      { text: "Пойти (+8 HP)", action: (p)=>{p.maxHp+=8;return "Вы поставили свечу.";} },
      { text: "Не идти", action: (p)=>{p.hp=Math.max(1,p.hp-5);return "Вы не пошли. Весь день было тяжело.";} },
    ] },
  { id: "f_13", minAge: 46, chance: 0.11, icon: "🐐", title: "Коза соседа",
    desc: "Коза съела ваш урожай.",
    choices: [
      { text: "Требовать плату (+20🪙)", action: (p)=>{p.coins+=20;p.reputation-=5;return "Сосед заплатил и перестал здороваться.";} },
      { text: "Махнуть рукой (+10 репутации)", action: (p)=>{p.reputation+=10;return "Сосед принёс мёд. Так и живут.";} },
    ] },
  { id: "f_14", minAge: 49, chance: 0.11, icon: "🎨", title: "Художник",
    desc: "Художник просит разрешения написать ваш портрет.",
    choices: [
      { text: "Согласиться (+15 репутации)", action: (p)=>{p.reputation+=15;return "Портрет повесили в ратуше.";} },
      { text: "Отказаться", action: ()=>"Он написал кого-то другого." },
    ] },
  { id: "f_15", minAge: 52, chance: 0.11, icon: "🌊", title: "Колодец высох",
    desc: "Колодец дал песок вместо воды.",
    choices: [
      { text: "Копать глубже (-60🪙)", action: (p)=>{p.coins=Math.max(0,p.coins-60);p.reputation+=15;return "Вода вернулась. Вся улица пила из вашего колодца.";} },
      { text: "Ходить к реке", action: (p)=>{p.hp=Math.max(1,p.hp-5);return "Вы носили воду вёдрами весь год.";} },
    ] },
  { id: "f_16", minAge: 55, chance: 0.11, icon: "📿", title: "Обет",
    desc: "Вы дали обещание, о котором никто не знает.",
    choices: [
      { text: "Выполнить (+15 HP)", action: (p)=>{p.maxHp+=15;return "Вы выполнили. Легче стало.";} },
      { text: "Забыть", action: (p)=>{p.hp=Math.max(1,p.hp-10);return "Вы забыли. Это осталось где-то внутри.";} },
    ] },
  { id: "f_17", minAge: 58, chance: 0.11, icon: "🕯️", title: "Ночной гость",
    desc: "Кто-то стучал в дверь и ушёл до того, как вы открыли.",
    choices: [
      { text: "Искать (+5 Знаний)", action: (p)=>{p.intellect+=5;return "На крыльце осталась монета.";} },
      { text: "Забыть", action: ()=>"Вы вернулись в постель." },
    ] },
  { id: "f_18", minAge: 61, chance: 0.11, icon: "🍂", title: "Осенние листья",
    desc: "Двор засыпало листвой.",
    choices: [
      { text: "Убрать (+5 HP)", action: (p)=>{p.maxHp+=5;return "Вы убрали всё. Стало чисто и грустно.";} },
      { text: "Оставить", action: ()=>"Листва лежала до весны." },
    ] },
  { id: "f_19", minAge: 64, chance: 0.11, icon: "🪞", title: "Портрет в зале",
    desc: "Вы смотрите на портрет и не узнаёте себя.",
    choices: [
      { text: "Признать (+8 Знаний)", action: (p)=>{p.intellect+=8;return "Вы изменились. Это нормально.";} },
      { text: "Отвернуться", action: (p)=>{p.hp=Math.max(1,p.hp-5);return "Вы отвернулись.";} },
    ] },
  { id: "f_20", minAge: 67, chance: 0.11, icon: "🕰", title: "Время идёт быстрее",
    desc: "Год прошёл, а вы не заметили.",
    choices: [
      { text: "Записывать дни (+10 Знаний)", action: (p)=>{p.intellect+=10;return "Вы начали вести дневник. Он поможет потомкам.";} },
      { text: "Жить как идёт (+10 HP)", action: (p)=>{p.hp=Math.min(p.maxHp,p.hp+10);return "Вы перестали считать. Стало легче.";} },
    ] },
  { id: "f_21", minAge: 70, chance: 0.11, icon: "🌟", title: "Звёздная ночь",
    desc: "Вы вышли ночью и увидели небо без облаков.",
    choices: [
      { text: "Смотреть (+12 HP)", action: (p)=>{p.maxHp+=12;return "Вы смотрели час. Ничего не болело.";} },
      { text: "Вернуться в дом", action: ()=>"Вы вернулись." },
    ] },
  { id: "f_22", minAge: 73, chance: 0.11, icon: "🕯️", title: "Последняя уборка",
    desc: "Вы разбираете вещи, которые копились всю жизнь.",
    choices: [
      { text: "Раздать (+20 репутации)", action: (p)=>{p.reputation+=20;return "Вы раздали всё, что можно. Легче стало.";} },
      { text: "Оставить как есть", action: ()=>"Всё осталось на местах." },
    ] },
  { id: "f_23", minAge: 20, chance: 0.11, icon: "🐺", title: "Волк у овец",
    desc: "Волк задрал овцу у соседа.",
    choices: [
      { text: "Гнать волка (+10 Меча, +8 репутации)", action: (p)=>{p.swordGodExp+=10;p.reputation+=8;return "Вы прогнали его. Сосед запомнил.";} },
      { text: "Не лезть", action: ()=>"Волк вернулся ночью." },
    ] },
  { id: "f_24", minAge: 45, chance: 0.11, icon: "🏆", title: "Награда",
    desc: "Вас хотят наградить за что-то, чего вы не совершали.",
    choices: [
      { text: "Принять (+20 репутации, -5 совести)", action: (p)=>{p.reputation+=20;return "Вам вручили грамоту. Кто-то в толпе знал правду.";} },
      { text: "Отказаться (+15 совести)", action: (p)=>{p.reputation+=8;p.intellect+=5;return "Вы отказались. Это оказалось громче награды.";} },
    ] },
  { id: "f_25", minAge: 62, chance: 0.11, icon: "🌿", title: "Травы знахарки",
    desc: "Старуха даёт вам пучок трав.",
    choices: [
      { text: "Принять (+10 HP)", action: (p)=>{p.maxHp+=10;return "Она сказала пить отвар каждый вечер. Вы пьёте.";} },
      { text: "Отказаться", action: (p)=>{return "Вы отказались. Она не обиделась.";} },
    ] },
];

const SYLLABLES = {
  male: ["Вал", "Сед", "Лео", "Клод", "Жан", "Огюст", "Филипп", "Рей", "Люк", "Марк", "Ден", "Эд", "Рудеус", "Пол", "Клифф", "Арси", "Клайв", "Заноба"],
  female: ["Аме", "Селе", "Хиль", "Эле", "Клэр", "Роза", "Диа", "Лиза", "София", "Жанна", "Али", "Сильфи", "Эрис", "Рокси", "Зенит", "Норн", "Айша"],
  suffix: ["рик", "берт", "ион", "ард", "ель", "ис", "дар", "монт", "валь", "ус", "етта", "ин"],
  surnames: ["Грейрат", "де Роа", "де Арс", "Блэквуд", "Фрост", "Клемент", "Дорудиа", "Мигурдия", "Спардия", "Шевалье"]
};
