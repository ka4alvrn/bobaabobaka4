// ==========================================
// BIT TENSEI — ДВИЖОК СУДЬБЫ
// Ветвящиеся сюжетные линии: флаги, условия,
// отложенные последствия через годы.
// ==========================================

// ------------------------------------------------------------------
// Сюжетные линии. Каждая — цепочка узлов, которые открываются по
// условиям, а не по возрасту. Решение игрока ставит флаг, флаг
// открывает следующую сцену — и так до финала.
// ------------------------------------------------------------------
const STORY_LINES = [
  // ================= 1. ДОЛГ ОТЦА =================
  {
    id: "debt",
    title: "💰 Долг отца",
    icon: "💰",
    hint: "Семья заняла деньги, которых не отдала.",
    nodes: [
      {
        id: "debt_1", age: 14, weight: 30,
        title: "Сборщики у ворот",
        text: "Заимодавец не пришёл сам — пришли его люди. «Долг вашего отца — 300 золотых. Отдайте до зимы, иначе мы возьмём вдвое — домом.»",
        choices: [
          { text: "Заплатить из казны (300🪙)", cost: 300, flags: { debt_paid: true }, effect: (p) => { p.coins -= 300; p.reputation += 5; return "Вы отдали долг сполна. Люди ушли молча — но запомнили, что вы платите."; } },
          { text: "Взять долг на себя (позже отдадите 450🪙)", flags: { debt_owned: true }, effect: () => "Вы подписали бумагу своим именем. Долг теперь ваш — и он растёт." },
          { text: "Прогнать их силой", flags: { debt_defied: true }, effect: (p) => { p.reputation -= 10; p.swordGodExp += 15; return "Вы выставили сборщиков за ворота. Соседи одобрили, заимодавец — нет."; } },
          { text: "Взяться за подпольную работу", flags: { debt_underground: true }, effect: (p) => { p.coins += 120; p.reputation -= 15; return "Вы заработали сотню-другую грязным трудом. Долг не закрыт, но отсрочка куплена."; } }
        ]
      },
      {
        id: "debt_2_interest", from: "debt_owned", age: 18, weight: 25,
        title: "Долг растёт",
        text: "Проценты съели вашу отсрочку. «450 золотых. Или подпишите, что отработаете — пять лет на рудниках.»",
        choices: [
          { text: "Отдать 450🪙", cost: 450, flags: { debt_paid: true }, effect: (p) => { p.coins -= 450; p.intellect += 5; return "Вы расплатились и поклялись больше никогда не подписывать бумаг не читая (+5 Знаний)."; } },
          { text: "Пойти на рудники (5 ударов к HP, но честно)", flags: { debt_paid: true, debt_mines: true }, effect: (p) => { p.maxHp = Math.max(20, p.maxHp - 40); p.northGodExp += 40; return "Пять лет под землёй. Долг закрыт, тело изношено, воля — закалена."; } },
          { text: "Сжечь контору заимодавца", flags: { debt_burned: true }, effect: (p) => { p.reputation -= 25; p.northGodExp += 20; return "Огонь забрал и бумаги, и чью-то жизнь. Долга больше нет. Врагов — прибавилось."; } }
        ]
      },
      {
        id: "debt_2_raid", from: "debt_defied", age: 17, weight: 25,
        title: "Ночь расплаты",
        text: "Они подожгли амбар и увели двух лошадей. Старший из них ждёт вас у околицы: «Ты смелый. Откупишься — или будем резать друг друга до последнего?»",
        choices: [
          { text: "Откупиться (400🪙)", cost: 400, flags: { debt_paid: true }, effect: (p) => { p.coins -= 400; p.intellect += 4; return "Вы заплатили вдвое и научились считать врагов заранее (+4 Знаний)."; } },
          { text: "Драться насмерть", flags: { debt_kill: true }, effect: (p) => { p.hp = Math.max(15, p.hp - 40); p.swordGodExp += 45; p.reputation -= 8; return "Вы убили старшего. Остальные разбежались — но у него была родня."; } }
        ]
      },
      {
        id: "debt_2_work", from: "debt_underground", age: 17, weight: 25,
        title: "Хозяин подполья",
        text: "Вас заметили. «Работаешь чисто. Предлагаю другое: не долг отрабатывать, а служить мне. Плачу вдвое, но ты — мой.»",
        choices: [
          { text: "Согласиться", flags: { debt_paid: true, underworld_ties: true }, effect: (p) => { p.coins += 250; p.reputation -= 20; return "Хозяин закрыл ваш долг одним словом. Теперь у вас есть покровитель — и поводок."; } },
          { text: "Отказаться и вернуться к долгу", flags: {}, effect: (p) => { p.reputation += 8; return "Вы отказались. Долг остался, зато спина прямая."; } }
        ]
      },
      {
        id: "debt_3_legacy", from: "debt_kill", age: 26, weight: 22,
        title: "Сын убитого",
        text: "Он вырос. Теперь он старше вас, сильнее — и пришёл не за деньгами. «Мой отец просил прощения перед смертью. Мне не нужно твоё прощение — мне нужна твоя голова.»",
        choices: [
          { text: "Драться", flags: { debt_blood: true }, effect: (p) => { p.hp = Math.max(10, p.hp - 70); p.swordGodExp += 70; p.reputation -= 10; return "Вы победили. Впервые в жизни вам было противно от победы."; } },
          { text: "Предложить мир и золото", cost: 200, flags: { debt_mended: true }, effect: (p) => { p.coins = Math.max(0, p.coins - 200); p.reputation += 15; return "Он долго смотрел на монеты. Потом взял. Вражда рода оборвалась."; } },
          { text: "Сказать правду о своём отце", flags: { debt_mended: true, debt_truth: true }, effect: (p) => { p.intellect += 12; p.reputation += 10; return "Вы рассказали всё: и про отца, и про себя. Он ушёл, но перестал быть врагом."; } }
        ]
      },
      {
        id: "debt_4_paid", from: "debt_paid", age: 30, weight: 15,
        title: "Долг, который вернулся добром",
        text: "Заимодавец постарел. «Ты единственный, кто заплатил без крови. Возьми — это не деньги, это бумага на землю. Твой род будет стоять на ней.»",
        effect: (p) => { p.coins += 350; p.asuraInfluence += 25; p.reputation += 10; return "Вы получили право на землю и доброе имя в глазах старика (+350🪙, +25 влияния)."; }
      }
    ]
  },

  // ================= 2. ПРОПАВШАЯ СЕСТРА =================
  {
    id: "sister",
    title: "🕯️ Пропавшая сестра",
    icon: "🕯️",
    hint: "Катаклизм разбросал семью. Кто-то остался жив.",
    nodes: [
      {
        id: "sis_1", age: 9, weight: 26, reqCalamity: true,
        title: "Имя среди пропавших",
        text: "На обелиске пропавших вы находите знакомое имя — младшая. Ниже, чужой рукой, нацарапано: «видели на юге, с людьми в серых плащах».",
        choices: [
          { text: "Идти по следу", flags: { sis_searching: true }, effect: (p) => { p.northGodExp += 20; p.intellect += 4; return "Вы бросили всё и ушли на юг. След холодный, но он есть."; } },
          { text: "Заплатить искателям (150🪙)", cost: 150, flags: { sis_hired: true }, effect: (p) => { p.coins -= 150; return "Вы наняли людей, которые умеют искать. Они вернутся с ответом — рано или поздно."; } },
          { text: "Отложить: сначала выжить", flags: { sis_delayed: true }, effect: (p) => { p.intellect += 6; return "Вы похоронили надежду в кармане и занялись собой. Она осталась там — ждать."; } }
        ]
      },
      {
        id: "sis_2_camp", from: "sis_searching", age: 15, weight: 24,
        title: "Серые плащи",
        text: "Лагерь в лесу. Двадцать детей, двое надзирателей, и среди них — она. Не узнаёт вас. «Она не помнит, — говорит надзиратель. — Так проще. Уходи, или мы запомним твоё лицо.»",
        choices: [
          { text: "Забрать силой", flags: { sis_rescued: true }, effect: (p) => { p.hp = Math.max(10, p.hp - 50); p.swordGodExp += 40; p.reputation -= 15; return "Вы вынесли сестру на руках. За вами теперь охотятся."; } },
          { text: "Купить её свободу (500🪙)", cost: 500, flags: { sis_bought: true }, effect: (p) => { p.coins -= 500; p.intellect += 8; return "Заплатили и ушли тихо. Она всё ещё не помнит вас — но она жива."; } },
          { text: "Остаться и учить детей", flags: { sis_camp_joined: true }, effect: (p) => { p.intellect += 12; p.reputation += 12; return "Вы остались на год. Дети начали говорить. Она — первая назвала ваше имя."; } }
        ]
      },
      {
        id: "sis_3_truth", from: "sis_rescued", age: 22, weight: 22,
        title: "Она говорит",
        text: "Сестра выросла дикой и молчаливой. Однажды ночью она садится у огня: «Я помню. Всё помню. И то, что они делали. Пойдём и закончим это.»",
        choices: [
          { text: "Вернуться и сжечь лагерь", flags: { sis_vengeance: true }, effect: (p) => { p.hp = Math.max(10, p.hp - 40); p.swordGodExp += 60; p.reputation -= 20; return "Вы вернулись вдвоём. Лагеря больше нет. Её глаза с тех пор другие."; } },
          { text: "Отговорить её", flags: { sis_peace: true }, effect: (p) => { p.intellect += 15; p.reputation += 15; return "Вы держали её за руки всю ночь. Утром она согласилась жить дальше."; } }
        ]
      },
      {
        id: "sis_4_heir", from: "sis_bought", age: 25, weight: 20,
        title: "Та, что помнит",
        text: "Она приходит сама — чистая, в дорогой одежде, с чужим гербом на груди. «Меня забрали в дом. Научили. И я всё вспомнила, когда увидела твоё имя в списке живых.»",
        choices: [
          { text: "Принять её в род", flags: { sis_family: true }, effect: (p) => { p.coins += 200; p.asuraInfluence += 30; p.relations.push({ id: "sister_" + Date.now(), name: "Сестра", gender: "female", race: player ? player.race : "Человек", age: 20, role: "Сестра • Влиятельный дом", cp: 1500, relation: 90, status: "Семья", isFamily: true, isDead: false }); return "Сестра вернулась в род и привела с собой влияние чужого дома (+30 влияния)."; } },
          { text: "Попросить её уйти", flags: { sis_refused: true }, effect: (p) => { p.intellect += 10; return "Вы не смогли простить, что она жила хорошо, пока вы боролись. Она больше не пришла."; } }
        ]
      }
    ]
  },

  // ================= 3. ЕРЕТИК МИЛИСА =================
  {
    id: "heresy",
    title: "⛪ Еретик Милиса",
    icon: "⛪",
    hint: "Инквизиция ищет того, кто лечит без молитвы.",
    nodes: [
      {
        id: "her_1", age: 16, weight: 22, reqRegion: ["milis", "ranoa", "asura"],
        title: "Дверь в подвале",
        text: "В подвале — раненый: старик, весь в ожогах. «Я лечил детей без благословения. Инквизиция называет это ересью. Завтра они будут здесь.»",
        choices: [
          { text: "Спрятать его", flags: { her_hidden: true }, effect: (p) => { p.reputation -= 5; p.magicExp += 20; return "Вы укрыли его. Он провёл с вами зиму и говорил о мане так, как не говорят в храмах."; } },
          { text: "Выдать инквизиции", flags: { her_sold: true }, effect: (p) => { p.coins += 100; p.reputation += 10; return "Вас похвалили. Ночью вы не спали."; } },
          { text: "Вывести его из города", flags: { her_saved: true }, effect: (p) => { p.northGodExp += 15; p.intellect += 5; return "Вы провели его мимо постов. На прощание он оставил вам записную книжку."; } }
        ]
      },
      {
        id: "her_2_trial", from: "her_hidden", age: 20, weight: 22,
        title: "Обвинение",
        text: "Инквизитор приходит с бумагой: «Ты укрывал еретика. Отрекись публично — или пойдёшь рядом с ним.»",
        choices: [
          { text: "Отречься", flags: { her_denied: true }, effect: (p) => { p.reputation += 8; p.intellect += 5; return "Вы сказали то, что от вас хотели. Старик не осудил бы — но вы себя осудили."; } },
          { text: "Встать на его защиту", flags: { her_defended: true }, effect: (p) => { p.hp = Math.max(10, p.hp - 40); p.reputation -= 20; p.intellect += 15; return "Вы говорили час. Половина площади слушала. Вас избили, но не сломали."; } },
          { text: "Подкупить писца (250🪙)", cost: 250, flags: { her_bribed: true }, effect: (p) => { p.coins -= 250; return "Бумага исчезла из архива. Никто ничего не докажет."; } }
        ]
      },
      {
        id: "her_3_miracle", from: "her_defended", age: 27, weight: 20,
        title: "Чудо на площади",
        text: "Эпидемия. Храмы не справляются. Толпа помнит вашу речь и смотрит на вас.",
        choices: [
          { text: "Лечить всех, кто придёт", flags: { her_saint: true }, effect: (p) => { p.hp = Math.max(10, p.hp - 60); p.intellect += 25; p.reputation += 40; return "Вы не спали неделю. Город выжил. Вас стали звать иначе."; } },
          { text: "Лечить за плату", flags: { her_moneyman: true }, effect: (p) => { p.coins += 600; p.reputation -= 25; return "Золото пришло, благодарность — нет."; } },
          { text: "Закрыться и переждать", flags: { her_closed: true }, effect: (p) => { p.intellect += 5; return "Вы выжили. Улица не простила."; } }
        ]
      },
      {
        id: "her_4_book", from: "her_saved", age: 24, weight: 18,
        title: "Книжка старика",
        text: "В записной книжке — не молитвы. Расчёты. Он понял, что ману можно направлять без слов — и умер, не успев доказать.",
        choices: [
          { text: "Довести работу до конца", flags: { her_scholar: true }, effect: (p) => { p.magicExp += 90; p.intellect += 20; return "Вы закончили его труд и подписали своим именем (+90 Магии)."; } },
          { text: "Отдать книгу в Академию", flags: { her_academy: true }, effect: (p) => { p.coins += 300; p.asuraInfluence += 20; return "Академия заплатила и запомнила ваше имя в списке дарителей."; } },
          { text: "Сжечь", flags: { her_burned: true }, effect: (p) => { p.intellect += 5; return "Вы сожгли её ночью. Иногда знание опаснее чумы."; } }
        ]
      }
    ]
  },

  // ================= 4. ПЕЧАТЬ ЛАПЛАСА =================
  {
    id: "laplace",
    title: "🌀 Печать Лапласа",
    icon: "🌀",
    hint: "Кто-то предлагает знание в обмен на память.",
    nodes: [
      {
        id: "lap_1", age: 18, weight: 18,
        title: "Незнакомец без лица",
        text: "Он сидит в вашей комнате, хотя дверь была заперта. «Я могу дать тебе то, чего нет ни у кого. Цена — одно воспоминание. Не самое дорогое. Пока.»",
        choices: [
          { text: "Согласиться", flags: { lap_deal: true }, effect: (p) => { p.magicExp += 70; p.maxMana += 40; p.intellect += 10; return "Вы получили силу, а наутро не смогли вспомнить лицо матери."; } },
          { text: "Отказаться", flags: { lap_refused: true }, effect: (p) => { p.intellect += 12; return "Вы отказались. Он улыбнулся: «Хорошо. Тогда я предложу снова.»"; } },
          { text: "Спросить, кто он", flags: { lap_asked: true }, effect: (p) => { p.intellect += 8; return "«Я — тот, кто помнит всё. Именно поэтому мне так скучно.»"; } }
        ]
      },
      {
        id: "lap_2_price", from: "lap_deal", age: 24, weight: 20,
        title: "Вторая цена",
        text: "«Теперь — воспоминание о первом бое. О том, как ты понял, что можешь убивать.»",
        choices: [
          { text: "Отдать", flags: { lap_deep: true }, effect: (p) => { p.magicExp += 100; p.swordGodExp += 60; p.intellect += 15; return "Вы отдали его и стали сильнее. И перестали бояться крови — это оказалось страшнее."; } },
          { text: "Прекратить сделку", flags: { lap_stopped: true }, effect: (p) => { p.intellect += 20; return "Вы разорвали договор. Он не стал спорить — и это было хуже всего."; } }
        ]
      },
      {
        id: "lap_3_broken", from: "lap_deep", age: 31, weight: 18,
        title: "Пустое место",
        text: "Вы не помните, как звали вашего первого наставника. И была ли сестра. И был ли дом. «Осталось последнее, — говорит он. — Твоё имя.»",
        choices: [
          { text: "Отдать имя", flags: { lap_nameless: true }, effect: (p) => { p.magicExp += 150; p.maxMana += 80; p.reputation = 0; return "Вы стали сильнее всех в роду. И никто больше не может вспомнить, кто вы."; } },
          { text: "Забрать всё назад", flags: { lap_fought: true }, effect: (p) => { p.hp = Math.max(5, p.hp - 80); p.intellect += 25; return "Вы вцепились в него и вырвали свои воспоминания обратно. Часть — навсегда осталась у него."; } }
        ]
      },
      {
        id: "lap_4_offer", from: "lap_refused", age: 26, weight: 16,
        title: "Он вернулся",
        text: "«Ты отказался, когда был моложе и глупее. Теперь ты знаешь цену. Предложение то же — но я добавлю: я скажу тебе, как умирает мир.»",
        choices: [
          { text: "Слушать", flags: { lap_truth: true }, effect: (p) => { p.intellect += 30; p.magicExp += 40; return "Вы узнали то, что знать не следовало: у мира осталось конечное число жизней. Ваших жизней."; } },
          { text: "Прогнать его", flags: { lap_strong: true }, effect: (p) => { p.intellect += 15; p.northGodExp += 30; return "Вы вышвырнули его из своей головы. Впервые кто-то отказал ему дважды."; } }
        ]
      }
    ]
  },

  // ================= 5. ХЛЕБНЫЙ БУНТ =================
  {
    id: "bread",
    title: "🍞 Хлебный бунт",
    icon: "🍞",
    hint: "После Катаклизма цены взбесились, и город на грани.",
    nodes: [
      {
        id: "bread_1", age: 12, weight: 28, reqCalamity: true,
        title: "Очередь за хлебом",
        text: "Очередь длиной в улицу. Пекарь закрывает ставни: «Зерна нет. Кто заплатит втрое — тому есть.» За вашей спиной уже начинают драться.",
        choices: [
          { text: "Заступиться за слабых", flags: { bread_hero: true }, effect: (p) => { p.reputation += 15; p.hp = Math.max(10, p.hp - 15); return "Вы удержали толпу от крови. Вас запомнили на этой улице."; } },
          { text: "Купить хлеб втридорога (60🪙)", cost: 60, flags: { bread_bought: true }, effect: (p) => { p.coins -= 60; p.hp = Math.min(p.maxHp, p.hp + 20); return "Вы наелись. Рядом с вами — нет."; } },
          { text: "Взять силой", flags: { bread_riot: true }, effect: (p) => { p.reputation -= 10; p.coins += 30; p.northGodExp += 10; return "Вы вынесли мешок из разбитой лавки. Он был тяжёлый и почему-то казался чужим."; } }
        ]
      },
      {
        id: "bread_2_leader", from: "bread_hero", age: 19, weight: 24,
        title: "Вас зовут говорить",
        text: "Три улицы выбирают, кто пойдёт к наместнику. Все смотрят на вас.",
        choices: [
          { text: "Идти и требовать", flags: { bread_leader: true }, effect: (p) => { p.reputation += 25; p.asuraInfluence += 20; return "Вы говорили во дворе. Наместник слушал — хотя бы из страха."; } },
          { text: "Организовать подвоз зерна", flags: { bread_logistics: true }, effect: (p) => { p.coins -= 100; p.intellect += 15; p.reputation += 20; return "Вы нашли обоз и сговорились с купцами. Голод отступил на месяц — и этого хватило."; } },
          { text: "Отказаться: это не ваша война", flags: { bread_declined: true }, effect: (p) => { p.intellect += 8; return "Вы ушли. Через неделю наместник прислал солдат. Вас не тронули — вы ведь не участвовали."; } }
        ]
      },
      {
        id: "bread_3_order", from: "bread_leader", age: 24, weight: 20,
        title: "Цена порядка",
        text: "Вас зовут во дворец: «Возглавь городской совет. Будешь решать, кому хлеб, а кому — нет.»",
        choices: [
          { text: "Принять", flags: { bread_ruler: true }, effect: (p) => { p.asuraInfluence += 45; p.nobilityTitle = "citizen"; p.reputation += 10; return "Вы получили кресло и врагов во всех домах, которые раньше решали это сами."; } },
          { text: "Раздать полномочия", flags: { bread_council: true }, effect: (p) => { p.reputation += 25; p.intellect += 12; return "Вы создали совет из девяти человек. Скучно, медленно — и город не голодает."; } },
          { text: "Отказаться от власти", flags: { bread_free: true }, effect: (p) => { p.reputation += 15; p.intellect += 10; return "Вы ушли с площади, оставив им свою долю зерна. Легенда дороже кресла."; } }
        ]
      }
    ]
  },

  // ================= 6. ТЕНЬ ХИТОГАМИ В РОДУ =================
  {
    id: "shadow",
    title: "👁️ Тень Хитогами в роду",
    icon: "👁️",
    hint: "Вашего ребёнка подозревают в апостольстве.",
    nodes: [
      {
        id: "sh_1", age: 30, weight: 20, reqChildren: true,
        title: "Ребёнок, который знает лишнее",
        text: "Дочь рассказывает за завтраком, где вы будете через год. Потом — где умрёте. Она улыбается и просит ещё хлеба.",
        choices: [
          { text: "Скрывать от всех", flags: { sh_hidden: true }, effect: (p) => { p.intellect += 10; return "Слухи поползли сами. Вы заперли их внутри стен — и внутри стен стало тесно."; } },
          { text: "Искать целителя душ", flags: { sh_seeking: true }, effect: (p) => { p.coins -= 150; return "Вы наняли всех, кто хоть что-то знает о Снах. Никто не знал."; } },
          { text: "Принять как есть", flags: { sh_accept: true }, effect: (p) => { p.hitogamiTrust += 20; p.intellect += 8; return "Вы сели рядом и приготовили ей чай. Она заплакала — первый раз за год."; } }
        ]
      },
      {
        id: "sh_2_branch", from: "sh_accept", age: 36, weight: 18,
        title: "Он говорит с ней",
        text: "Она приходит к вам: «Он говорит со мной, папа. Он говорит, что ты умрёшь на войне. Он предлагает мне спасти тебя.»",
        choices: [
          { text: "Запретить ему приближаться", flags: { sh_banned: true }, effect: (p) => { p.hitogamiTrust -= 25; p.intellect += 15; return "Вы запретили. Она слушалась. Год. Потом начала слушать его снова — во сне, куда вы не могли прийти."; } },
          { text: "Позволить и слушать вместе", flags: { sh_bargain: true }, effect: (p) => { p.hitogamiTrust += 30; p.maxMana += 60; return "Вы стали разговаривать с богом через собственного ребёнка. Он дал вам силу. Вы не спросили, что дала она."; } },
          { text: "Отправить её далеко из мира богов", flags: { sh_saved_child: true }, effect: (p) => { p.coins -= 400; p.reputation -= 5; return "Вы отвезли её в лес к травнице. Она перестала слышать Сны. И разучилась вам улыбаться."; } }
        ]
      },
      {
        id: "sh_3_end", from: "sh_hidden", age: 40, weight: 16,
        title: "Инквизиция знает",
        text: "Отряд у ворот: «Отдайте детей. Мы не желаем зла роду — только апостолу.»",
        choices: [
          { text: "Защищать дом", flags: { sh_defended: true }, effect: (p) => { p.hp = Math.max(5, p.hp - 100); p.reputation -= 20; p.hitogamiTrust += 10; return "Вы дрались на пороге своего дома. Дети выжили. Не все слуги — тоже."; } },
          { text: "Отдать и молить о милости", flags: { sh_gave_child: true }, effect: (p) => { p.hitogamiTrust -= 30; p.reputation += 10; p.children.forEach(c => { c.isDead = true; }); return "Вы отдали их. Вас похвалили. Дом стал очень тихим."; } },
          { text: "Обменять свою жизнь на их", flags: { sh_martyr: true }, effect: (p) => { p.hp = Math.max(1, p.hp - 150); p.maxMana = Math.max(10, p.maxMana - 100); p.hitogamiTrust -= 20; p.reputation += 30; return "Вы отдали столько, что жить осталось мало. И этого хватило, чтобы они остались."; } }
        ]
      }
    ]
  },

  // ================= 7. МЯТЕЖ В ПУСТОШАХ =================
  {
    id: "revolt",
    title: "🔥 Мятеж в Багровых Пустошах",
    icon: "🔥",
    hint: "Демоны больше не хотят жить в пустошах.",
    nodes: [
      {
        id: "rev_1", age: 20, weight: 20, reqRegion: ["demon", "begaritt"],
        title: "Гонцы с пылью на лицах",
        text: "Они пришли из пустошей: «Наши дети рождаются без маны. Земля выгорела после Катаклизма. Дайте земли — или мы возьмём сами.»",
        choices: [
          { text: "Пойти к ним и говорить", flags: { rev_talked: true }, effect: (p) => { p.intellect += 12; p.reputation -= 5; return "Вы прожили у них месяц. Они не звери, о которых рассказывают солдаты."; } },
          { text: "Донести во дворец", flags: { rev_reported: true }, effect: (p) => { p.asuraInfluence += 15; p.reputation += 5; return "Дворец выслал наблюдателей. Улица назвала вас соглядатаем."; } },
          { text: "Дать им зерна и уйти", flags: { rev_helped: true }, effect: (p) => { p.coins -= 120; p.reputation += 10; return "Вы отдали половину обоза. Они запомнили вас как единственного человека, который отдал."; } }
        ]
      },
      {
        id: "rev_2_war", from: "rev_talked", age: 26, weight: 20,
        title: "Они идут",
        text: "Двадцатитысячное войско двинулось из пустошей. Корона ищет командира, который знает их обычаи.",
        choices: [
          { text: "Возглавить королевский отряд", flags: { rev_general: true }, effect: (p) => { p.coins += 500; p.asuraInfluence += 40; p.reputation += 20; p.swordGodExp += 50; return "Вы повели армию. Победа была быстрой и мерзкой — вы знали их язык и поэтому били туда, где больно."; } },
          { text: "Стать посредником", flags: { rev_peace: true }, effect: (p) => { p.intellect += 25; p.reputation += 30; p.asuraInfluence += 15; return "Вы остановили войско у реки, не вынув меча. Этот день в летописях назван вашим именем."; } },
          { text: "Уйти с ними", flags: { rev_defected: true }, effect: (p) => { p.reputation -= 40; p.hitogamiTrust += 15; p.swordGodExp += 30; return "Вы ушли с мятежом. Дом отказался от вас — пустоши приняли."; } }
        ]
      }
    ]
  },

  // ================= 8. НАСЛЕДНИК ДРУГОГО ПУТИ =================
  {
    id: "heir_path",
    title: "🎒 Наследник другого пути",
    icon: "🎒",
    hint: "Ребёнок не хочет меч. Он хочет что-то своё.",
    nodes: [
      {
        id: "hp_1", age: 34, weight: 22, reqChildren: true,
        title: "Не хочет клинок",
        text: "Сын возвращается с тренировки с пустыми руками: «Я не буду воином. Я хочу рисовать. Или считать звёзды. Не бей меня больше на полигоне.»",
        choices: [
          { text: "Заставить продолжать", flags: { hp_forced: true }, effect: (p) => { p.swordGodExp += 20; p.children.forEach(c => c.relation = Math.max(0, (c.relation || 80) - 30)); return "Он вернулся на полигон. И перестал с вами разговаривать."; } },
          { text: "Отпустить и нанять учителей", flags: { hp_freed: true }, effect: (p) => { p.coins -= 200; p.children.forEach(c => c.relation = Math.min(100, (c.relation || 80) + 20)); p.intellect += 10; return "Вы наняли ему математика и художника. Он впервые за год улыбнулся за ужином."; } },
          { text: "Учить и мечу, и наукам", flags: { hp_balanced: true }, effect: (p) => { p.children.forEach(c => c.relation = Math.min(100, (c.relation || 80) + 10)); p.castleUpgrades.includes("training_yard") ? p.swordGodExp += 25 : p.intellect += 15; return "Два часа меча, два часа счёта. Он вырос упрямым и умелым — как вы."; } }
        ]
      },
      {
        id: "hp_2_great", from: "hp_freed", age: 42, weight: 18,
        title: "Он сделал то, чего не сделали вы",
        text: "Его чертёж моста через пропасть приняли в Академии. «Отец, я не воин. Но люди пройдут по моему мосту сто лет.»",
        choices: [
          { text: "Гордиться открыто", flags: { hp_proud: true }, effect: (p) => { p.asuraInfluence += 30; p.reputation += 20; p.children.forEach(c => c.relation = 100); return "Вы стояли на площади и хлопали громче всех. В тот день вы поняли, что род силён не только мечом."; } },
          { text: "Сказать, что этого мало", flags: { hp_cold: true }, effect: (p) => { p.intellect += 10; p.children.forEach(c => c.relation = Math.max(0, (c.relation || 80) - 40)); return "Вы сказали правду так, как умеете. Он больше не присылал чертежей."; } }
        ]
      }
    ]
  }
];

// ------------------------------------------------------------------
// Состояние сюжета хранится в player.story:
//   story.flags     — что уже случилось (решения)
//   story.done      — какие узлы пройдены
//   story.pending   — отложенные последствия { atYear, fn, text }
// ------------------------------------------------------------------
function ensureStoryState() {
  if (!player) return;
  if (!player.story || typeof player.story !== "object") player.story = {};
  if (!player.story.flags) player.story.flags = {};
  if (!player.story.done) player.story.done = [];
  if (!player.story.pending) player.story.pending = [];
  if (!player.story.lineDone) player.story.lineDone = [];
}

function hasStoryFlag(flag) {
  return !!(player?.story?.flags && player.story.flags[flag]);
}

function setStoryFlag(flag) {
  if (!player || !flag) return;
  ensureStoryState();
  player.story.flags[flag] = true;
}

// Условия, при которых узел доступен
function storyNodeAvailable(node) {
  if (!player || !node) return false;
  ensureStoryState();
  if (player.story.done.includes(node.id)) return false;
  if (player.children.filter(c => !c.isDead).length === 0 && node.reqChildren) return false;
  if (node.reqCalamity && !worldState.calamityOccurred) return false;
  if (node.reqRegion && !node.reqRegion.includes(player.currentRegionKey)) return false;
  if (node.from && !hasStoryFlag(node.from)) return false;
  // Узел без `from` — стартовый, открывается по возрасту
  if (!node.from && player.age < (node.age || 0)) return false;
  if (node.from && player.age < (node.age || 0)) return false;
  return true;
}

// Собрать доступные сейчас сюжетные сцены
function getAvailableStoryNodes() {
  if (!player) return [];
  const out = [];
  STORY_LINES.forEach(line => {
    line.nodes.forEach(node => {
      if (storyNodeAvailable(node)) out.push({ line, node });
    });
  });
  return out;
}

// Отложенное последствие: сработает через N лет
function scheduleStoryConsequence(years, text, effectFn) {
  ensureStoryState();
  player.story.pending.push({
    atYear: worldState.currentWorldYear + Math.max(1, years),
    text,
    effect: effectFn ? effectFn.toString() : null
  });
}

// Вызывается каждый год: срабатывают отложенные последствия
function processStoryConsequences() {
  if (!player || !player.story || !Array.isArray(player.story.pending)) return;
  const now = worldState.currentWorldYear;
  const due = player.story.pending.filter(c => c.atYear <= now);
  if (!due.length) return;
  player.story.pending = player.story.pending.filter(c => c.atYear > now);
  due.forEach(c => {
    // Эффекты хранятся строкой, чтобы пережить сохранение
    if (c.effect) {
      try {
        const fn = new Function("p", "ws", "return (" + c.effect + ")(p, ws);");
        const res = fn(player, worldState);
        log(`⏳ <b>Отзвук прошлого:</b> ${c.text}${res ? " — " + res : ""}`);
      } catch (e) {
        console.warn("[BitTensei] Отложенное последствие:", e);
      }
    } else {
      log(`⏳ <b>Отзвук прошлого:</b> ${c.text}`);
    }
  });
}

const SEVEN_POWERS_LORE = {
  1: {
    epithet: "Тот, Кого Нет",
    personality: "Никто не видел его лица. Говорят, он меняет тела, как перчатки, и оставляет после себя только чертежи машин.",
    habit: "Раз в столетие присылает в Академию Раноа посылку с механизмом, который никто не может собрать.",
    temper: "Холоден. Не злится и не хвалит — просто оценивает.",
    attitudeStart: 0,
    greet: "«Ты пришёл за троном, которого не видно. Любопытно. Покажи, что умеешь.»",
    respect: "«Ты собран, как хороший механизм. Это редкость. Трон твой.»",
    contempt: "«Ты шумишь. Механизмы не шумят.»",
    tribute: "Древние чертежи дают роду +3 Знаний каждый год.",
    seatBonus: { intellect: 3 },
    seatText: "Чертёжный зал Первой Эпохи открыт для вашего рода (+3 Знаний в год)."
  },
  2: {
    epithet: "Проклятый Дракон",
    personality: "Самый сильный воин мира и самый одинокий. Все, кого он любил, умерли. Он помнит каждую из этих смертей.",
    habit: "Появляется там, где начинается большая война — и заканчивает её за один вечер.",
    temper: "Спокоен до жути. Говорит короткими фразами.",
    attitudeStart: -10,
    greet: "«Ещё один, кто хочет проверить себя. Хорошо. Проверяй.»",
    respect: "«Ты не сломался. Значит, у мира есть шанс.»",
    contempt: "«Ты слаб. Как и все.»",
    tribute: "Драконье покровительство: +2 к Мечу и +2 к Магии в год.",
    seatBonus: { swordGod: 2, magicExp: 2 },
    seatText: "Дракон признал ваш род: +2 Мечу и +2 Магии в год."
  },
  3: {
    epithet: "Золотая Броня",
    personality: "Бадигади не снимает броню уже триста лет. Под ней — ни лица, ни имени, только голод по достойному противнику.",
    habit: "Держит арену в пустыне Бегаритта, куда стекаются бойцы со всего мира.",
    temper: "Весёлый. Смеётся, ломая кости.",
    attitudeStart: 10,
    greet: "«Наконец-то кто-то с огнём в глазах! Ну, иди сюда — покажи, из чего ты сделан!»",
    respect: "«Ха! Вот это удар! Пей со мной, воин, — ты заслужил.»",
    contempt: "«Ты даже не разогрелся. Иди тренируйся.»",
    tribute: "Арена Бегаритта: +2 к Мечу, +2 к Северу в год.",
    seatBonus: { swordGod: 2, northGod: 2 },
    seatText: "Арена Бегаритта платит вашему роду дань уважения (+2 Мечу, +2 Северу в год)."
  },
  4: {
    epithet: "Бог Демонов",
    personality: "Лаплас расколот на две половины — одна строит, другая разрушает. Он сам не помнит, какая из них сейчас говорит.",
    habit: "Меняет облик и проверяет смертных загадками. Кто ответил неверно — не возвращается.",
    temper: "Непредсказуем. Может убить за дерзость и наградить за неё же.",
    attitudeStart: -20,
    greet: "«Загадка: я строю и ломаю одним движением. Кто я? ...Неверно. Но за попытку дам тебе бой.»",
    respect: "«Ты ответил не словами, а делом. Лаплас запомнит.»",
    contempt: "«Пустота. Ты — пустота.»",
    tribute: "Багровая мана: +3 к Магии в год, но репутация у людей падает.",
    seatBonus: { magicExp: 3, reputation: -1 },
    seatText: "Багровая мана течёт в ваш род (+3 Магии в год), но люди сторонятся (-1 репутации)."
  },
  5: {
    epithet: "Вежливый Жнец",
    personality: "Рэндольф убивает без злобы, извиняясь. Он считает, что смерть — это услуга, и обижается, когда её не ценят.",
    habit: "Сидит в трактире на окраине и платит за всех. Никто не знает, откуда деньги.",
    temper: "Безупречно вежлив. От этого страшнее.",
    attitudeStart: 0,
    greet: "«Прошу прощения за беспокойство. Вы позволите?»",
    respect: "«Благодарю за достойный бой. Я редко встречаю таких, как вы.»",
    contempt: "«Мне жаль. Правда жаль.»",
    tribute: "Милосердие Жнеца: раны вашего рода заживают быстрее.",
    seatBonus: { hpRegen: 15 },
    seatText: "Жнец отступил от вашего рода: +15 HP восстановления каждый год."
  },
  6: {
    epithet: "Святой Клинок",
    personality: "Гал Фарион когда-то был разбойником, а теперь учит детей держать меч. Он до сих пор не верит, что стал святым.",
    habit: "Каждую зиму спускается с гор и ищет одного ученика, которого возьмёт в додзё.",
    temper: "Добродушен, но вспыльчив в бою.",
    attitudeStart: 5,
    greet: "«Не люблю драться с теми, кто моложе. Но меч есть меч — начинай.»",
    respect: "«Хороший удар. Я бы взял тебя в ученики.»",
    contempt: "«Техника без сердца. Так не победишь.»",
    tribute: "Додзё Севера: +3 к Мечу в год.",
    seatBonus: { swordGod: 3 },
    seatText: "Додзё Гала Фариона принимает детей вашего рода (+3 Мечу в год)."
  },
  7: {
    epithet: "Король-Трикстер",
    personality: "Александр правит Асурой и скучает. Интриги для него — не политика, а развлечение. Он уважает только тех, кто его переиграл.",
    habit: "Присылает во дворец шутов, которые задают неудобные вопросы.",
    temper: "Обаятелен и опасен. Улыбается, когда задумал худшее.",
    attitudeStart: 0,
    greet: "«Ну наконец-то! Двор выродился, шуты обленились. Ты будешь поинтереснее.»",
    respect: "«Ты переиграл меня. Знаешь, сколько людей это смогли? Двое. Ты третий.»",
    contempt: "«Скучно. Уберите его.»",
    tribute: "Королевская казна: +40% к доходу имений.",
    seatBonus: { estateIncomePercent: 40 },
    seatText: "Казна Асуры открыта роду: +40% к доходу имений."
  }
};

// ------------------------------------------------------------------
// Отношение Владык к игроку
// ------------------------------------------------------------------
function ensureSevenPowersLore() {
  if (!worldState?.sevenPowers) return;
  worldState.sevenPowers.forEach(pow => {
    if (typeof pow.attitude !== "number") {
      const lore = SEVEN_POWERS_LORE[pow.rank];
      pow.attitude = lore ? lore.attitudeStart : 0;
    }
  });
}

function getPowerLore(rank) {
  return SEVEN_POWERS_LORE[rank] || null;
}

function getPowerAttitudeLabel(attitude) {
  const a = Number(attitude) || 0;
  if (a >= 40) return { text: "уважает вас", color: "#34d399" };
  if (a >= 10) return { text: "благосклонен", color: "#a3e635" };
  if (a > -10) return { text: "нейтрален", color: "#fbbf24" };
  if (a > -40) return { text: "недоволен", color: "#fb923c" };
  return { text: "ждёт вашего падения", color: "#f87171" };
}

function changePowerAttitude(rank, delta) {
  const pow = worldState?.sevenPowers?.find(p => p.rank === rank);
  if (!pow) return;
  pow.attitude = Math.max(-100, Math.min(100, (Number(pow.attitude) || 0) + delta));
}

// Реплика Владыки при встрече — зависит от его отношения
function getPowerGreeting(rank) {
  const lore = getPowerLore(rank);
  const pow = worldState?.sevenPowers?.find(p => p.rank === rank);
  if (!lore) return "«Начнём.»";
  const a = Number(pow?.attitude) || 0;
  if (a >= 40) return lore.respect;
  if (a <= -40) return lore.contempt;
  return lore.greet;
}
