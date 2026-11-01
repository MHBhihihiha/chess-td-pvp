/* =============================================================================
 * 10x10 棋类 + 塔防 融合对战游戏 —— 逻辑层（无 DOM 依赖）
 * -----------------------------------------------------------------------------
 * 设计原则：本文件只算规则，不碰画面。将来移植微信小游戏时，本文件可以原样使用，
 * 只需要重写渲染层（view.js）。
 *
 * 坐标约定（绝对坐标，不随视角变化）：
 *   行(row)  1..10  从屏幕上方往下数；行 1..5 = 红方（敌方）半场
 *                                     行 6..10 = 蓝方（己方）半场
 *   列(col)  1..10  从屏幕左侧往右数
 *   行A = 行0 = 红方棋盘外出兵通道（在行1上方，红方单位在此并行、找空列向下进入）
 *   行B = 行11 = 蓝方棋盘外出兵通道（在行10下方，蓝方单位在此并行、找空列向上进入）
 *
 * 单位朝向：蓝方 targetRow = +1（向下→朝行号大的方向打红方），红方 targetRow = -1
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node
  root.GameCore = api;                                                   // 浏览器
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- 常量 */
  var ROWS = 10, COLS = 10;
  var RED = 'red', BLUE = 'blue';
  var TEAMS = [RED, BLUE];
  var OPP = { red: BLUE, blue: RED };
  var DIR = { red: -1, blue: 1 };          // 本单位向前推进的行方向
  var CHANNEL_ROW = { red: 0, blue: ROWS + 1 }; // 行A / 行B
  /* 大本营自带防御的射程：2 格（切比雪夫）。
   * 注意：从大本营**角格**算 2 格，实际覆盖的是「大本营外围一圈 5×5」，
   * 旧注释写的 4×4 是错的（那是 range=1.5 才会有的结果）。数值未改，只改注释。 */
  var BASE_DEF_RANGE = 2;
  var BASE_RECT = {
    red:  { r1: 1, r2: 2, c1: 5, c2: 6 },
    blue: { r1: 9, r2: 10, c1: 5, c2: 6 }
  };
  var HALF = { red: [1, 5], blue: [6, 10] };   // 可建造的半场
  var TILE = { EMPTY: 0, CHANNEL: 1 };         // 格子地形
  var TICK_HZ = 20;
  var DT = 1 / TICK_HZ;
  var UNIT_CAP = 80;                            // 每方单位上限（性能保护）
  var RESERVE_CAP = 8;                          // 每方待命区（棋盘外）容量
  var CHANNEL_CAP = 4;                          // 同一通道格最多堆几个兵
  var MAX_SIM_SECONDS = 60 * 60;

  /* ------------------------------------------------------------ 配置表 */
  /* 想调数值只改这里。数值故意先给一套偏保守的初稿，等试玩手感再定。 */
  var DATA = {
    /* 大本营：可以一直升到 6 级（每级解锁一个法术、提高固定收入）
     * selfHeal：不受攻击时每秒回血；selfHealDelay：停火多少秒后才开始自愈 */
    baseLevels: [
      { level: 1, hp: 3200, income: 3, upgradeCost: 320 },
      { level: 2, hp: 4200, income: 4, upgradeCost: 550 },
      { level: 3, hp: 5400, income: 5, upgradeCost: 850 },
      { level: 4, hp: 6800, income: 6, upgradeCost: 1250 },
      { level: 5, hp: 8400, income: 7, upgradeCost: 1750 },
      { level: 6, hp: 10400, income: 9, upgradeCost: null }
    ],
    baseDefenseRange: BASE_DEF_RANGE,   // 大本营防御射程 = 2 格（覆盖外围 5×5）
    selfHeal: { perSecond: 0.01, delay: 8 },   // 8 秒没挨打后，按最大血量的 1%/秒 自愈
    // 其他建筑的自愈速度是大本营的一半
    buildingSelfHeal: { perSecond: 0.005, delay: 8 },

    buildings: {
      mine: {
        key: 'mine', name: '金矿', glyph: '金', color: '#d8a125', size: [1, 1],
        cost: 150, hp: 600, armor: 2, tier: 1, maxLevel: 5,
        /* 产出曲线（v18：3→4 级改成 +2）：
         *   L1 2 → L2 3 (+1) → L3 4 (+1) → L4 6 (+2) → L5 8 (+2)
         * 玩家原话「金矿三级升四级改为加2产出其他不变」——
         * 只动 3→4 这一跳，1→2 / 2→3 / 4→5 都保持原值，
         * 于是 L4 变成「值得先垫一级」的中间档，而不是必须一口气憋到 L5。
         * 副作用（已知并接受）：4→5 的相对跳幅从 +60% 降到 +33%。 */
        income: 2, incomeByLevel: [2, 3, 4, 6, 8],
        desc: '金币加成：随等级提升产出（L4 起 +2/级，4→5 级一跃成为终极金矿）'
      },
      cannon: {
        key: 'cannon', name: '炮塔', glyph: '炮', color: '#6f8fd6', size: [1, 1],
        cost: 70, hp: 760, armor: 6, tier: 1,
        atk: 14, atkInterval: 0.6, range: 1.0, targets: 'ground', mode: 'single',
        hpBonus: 0.10, atkBonus: 0.10, desc: '便宜、血较低；对地单体、攻速较快、伤害较低；射程 3×3'
      },
      arrow: {
        key: 'arrow', name: '箭塔', glyph: '箭', color: '#5aab6a', size: [1, 1],
        cost: 110, hp: 900, armor: 6, tier: 1,
        atk: 16, atkInterval: 0.45, range: 2.0, targets: 'both', mode: 'single',
        hpBonus: 0.10, atkBonus: 0.10, desc: '较便宜、血中；对地对空单体、攻速快、伤害低；射程 5×5'
      },
      mage: {
        key: 'mage', name: '法师塔', glyph: '法', color: '#9a6fd0', size: [1, 1],
        cost: 160, hp: 1000, armor: 6, tier: 1,
        atk: 34, atkInterval: 1.1, range: 1.0, targets: 'both', mode: 'single',
        hpBonus: 0.10, atkBonus: 0.10, desc: '价格中、血较高；对地对空单体、攻速中、伤害中；射程 3×3'
      },
      mortar: {
        key: 'mortar', name: '迫击炮塔', glyph: '迫', color: '#a86a9c', size: [1, 1],
        cost: 220, hp: 1100, armor: 7, tier: 1,
        atk: 78, atkInterval: 2.4, range: 2.0, targets: 'ground', mode: 'group',
        /* 溅射：重炮砸下来对周围一圈也造成伤害（玩家要求"对群造成伤害"）。
         * 1 = 目标格 + 上下左右 + 斜角，共 3×3。 */
        splash: 1,
        hpBonus: 0.10, atkBonus: 0.10, desc: '价格较高、血较高；对地群攻、攻速慢、伤害高；射程 5×5'
      },
      tesla: {
        key: 'tesla', name: '特斯拉电塔', glyph: '电', color: '#59b39a', size: [1, 1],
        cost: 280, hp: 1400, armor: 8, tier: 1,
        /* 玩家要求：特斯拉电塔从「群攻」改成「对空对地单体」。
         * 群攻的职责交给它的分支「脉冲塔」（扩散电磁波）。 */
        atk: 46, atkInterval: 1.6, range: 2.0, targets: 'both', mode: 'single',
        hpBonus: 0.10, atkBonus: 0.10, desc: '价格高、血高；对地对空**单体**、攻速较慢、伤害较高；射程 5×5'
      },
      ward: {
        key: 'ward', name: '防御塔', glyph: '御', color: '#d8b04a', size: [1, 1],
        cost: 200, hp: 2400, armor: 8, tier: 1,
        aura: { radius: 1.0, dr: 0.10, drPerLevel: 0.02, drStep: 0.04, drFinal: 0.10 },
        hpBonus: 0.10,
        /* ★ v14：原文案写「保护范围 3×3，随等级提升」，但范围（aura.radius）在
         * 分支之前是不变的，随等级成长的只有减伤 —— 会被玩家当成数值标错。 */
        desc: '不能攻击，只给周围己方建筑减伤；保护范围 3×3，减伤随等级提升（血量为同档最高）'
      }
    },

    /* ---------------------------------------------------------------- 建筑升级总规则
     * 等级 1-4：每级 攻击/生命 +10%
     * 等级 5  ：分支二选一（两个方向各有自己的加成）
     * 等级 5-9：每级 攻击/生命 +30%
     * 等级 10 ：攻击/生命 +60%（终极形态）
     * 升级费用：越贵的建筑升级越贵（基础造价 × 系数^等级） */
    upgrade: {
      maxLevel: 10,
      branchLevel: 4,          // 4 级升 5 级时出现分支
      costFactor: 0.35,        // 升级费用 ≈ 基础造价 × (1 + 0.35×等级) × 1.22^等级
      costRound: 5
    },

    /* 分支形态：commitAt = 第几级时把这个分支的加成一次性生效 */
    branches: {
      /* 炮塔 */
      twin:    { key: 'twin',    name: '双管炮塔', parent: 'cannon', color: '#7fa8f0', commitAt: 5,
                 mods: { atkInterval: 0.5 }, hpMul: 1, atkMul: 1, desc: '攻速翻倍' },
      bigcannon: { key: 'bigcannon', name: '大炮塔', parent: 'cannon', color: '#8f7fe0', commitAt: 5,
                 mods: {}, atkMul: 2, hpMul: 1, desc: '伤害翻两倍' },
      /* 箭塔 */
      rapid:   { key: 'rapid',   name: '速射塔', parent: 'arrow', color: '#71c47f', commitAt: 5,
                 mods: { atkInterval: 0.5 }, atkMul: 1, desc: '攻速翻倍' },
      crossbow: { key: 'crossbow', name: '弩塔', parent: 'arrow', color: '#4f9e8a', commitAt: 5,
                 mods: {}, atkMul: 2, desc: '伤害翻两倍' },
      /* 法师塔 */
      white:   { key: 'white',   name: '白魔法塔', parent: 'mage', color: '#e8e8ff', commitAt: 5,
                 mods: { mode: 'line', lineLen: 3 }, atkMul: 1, desc: '群攻：单次攻击沿方向贯穿 3 格' },
      black:   { key: 'black',   name: '黑魔法塔', parent: 'mage', color: '#6a4fa0', commitAt: 5,
                 mods: { atkInterval: 1.6667 }, atkMul: 5, desc: '伤害翻五倍，但攻速减慢 40%' },
      /* 迫击炮塔 */
      bigmortar: { key: 'bigmortar', name: '大迫击炮塔', parent: 'mortar', color: '#b877a8', commitAt: 5,
                 mods: {}, atkMul: 2, desc: '伤害翻两倍' },
      missile: { key: 'missile', name: '导弹塔', parent: 'mortar', color: '#c98a6a', commitAt: 5,
                 mods: { range: 3.0, splash: 3.0 }, atkMul: 1, desc: '射程扩大到 7×7' },
      /* 特斯拉电塔 */
      pulse:   { key: 'pulse',   name: '脉冲塔', parent: 'tesla', color: '#6fd3c4', commitAt: 5,
                 mods: { mode: 'wave' }, atkMul: 1, desc: '自塔顶向外扩散一圈电磁波，波前扫到的敌人受伤' },
      bigtesla: { key: 'bigtesla', name: '大电塔', parent: 'tesla', color: '#4fc4d8', commitAt: 5,
                 mods: { mode: 'multi3', maxTargets: 3 }, atkMul: 4, desc: '伤害翻四倍，最多同时打 3 个目标' },
      /* 防御塔 */
      /* ★ v14 修正：水晶塔的 desc 原来写「减伤 +40%」，但它的 mods 里只有
       * auraRadius（范围翻倍），减伤其实走通用成长（L5 = 20%、满级 = 50%）——
       * 这就是玩家看到的「防御塔升级为水晶塔界面的数值标错」。
       * 两个分支的真数值（实测）：L5 水晶 5×5/20%、碉堡 3×3/40%；
       * 满级 水晶 5×5/50%、碉堡 3×3/60%。范围换减伤，别写成一样。 */
      /* ★ v16：满级必须是 40%（玩家要求），原来走基础曲线会在 L10 多吃一个 drFinal(+10%) → 50%。
       * 现在显式给 auraDR: 0.20 作为分支基础值，之后每级 +drStep(4%)：
       *   L5 20% → L6 24% → … → L10 40%（不再叠 drFinal）。 */
      crystal: { key: 'crystal', name: '水晶塔', parent: 'ward', color: '#8fd8f0', commitAt: 5,
                 mods: { auraRadius: 2.0, auraDR: 0.20 }, hpMul: 1,
                 desc: '保护范围扩大到 5×5，但减伤偏低（L5 20% → 满级 40%）' },
      bunker:  { key: 'bunker',  name: '碉堡塔', parent: 'ward', color: '#c8a44a', commitAt: 5,
                 mods: { auraDR: 0.40 }, hpMul: 1,
                 desc: '保护范围仍是 3×3，但减伤高（L5 40% → 满级 60%）' }
    },

    /* ---------------------------------------------------------------- 法术
     * 随大本营等级逐级解锁，每个法术独立冷却。
     * 范围用「格距离」表示：aoe = 允许的最大格距离（切比雪夫，斜角也算 1）
     *   落点格四周 aoe 格以内全部命中 → 实际覆盖是 (2·aoe+1)²：
     *     aoe 0 → 1×1（只有落点那一格）
     *     aoe 1 → 3×3        aoe 2 → 5×5
     *   ⚠ v18 更正：历史上 desc 里写的是「1×1 / 2×2 / 3×3」，那是**错的**
     *     （把 aoe 直接当成了边长）。select 时 hint 用的是 (aoe*2+1)²，
     *     所以同一个法术在两处显示的覆盖范围互相打架 —— 现在按 hint 的口径统一。 */
    /*
     * ★ 伤害的两个方向（v14 平衡性调整）★
     *   dmg 是「基准值」，真正落地时按目标类型分两路乘：
     *     对士兵   × SPELL_UNIT_MUL  (1.2)
     *     对建筑   × SPELL_BUILD_MUL (0.5)  —— 塔、大本营、金矿、其它建筑一律算建筑
     *   意图（玩家原话）：法术砸大本营非常低效，砸塔性价比也不高；
     *   砸兵性价比最高；砸后排金矿仍「有一定效果」（矿只有 600 血，减半后一发火箭
     *   仍能打掉 210，约三分之一），砸其它建筑就没那么划算了。
     * 所以这里的数值可以放心按「基准」理解，不要去乘 1.5/0.5。 */
    spells: [
      { key: 'arrowRain', name: '箭雨', glyph: '雨', color: '#8fd3f4', unlockBaseLevel: 1,
        cooldown: 22, aoe: 2, dmg: 90, affects: 'enemy',
        desc: '5×5 范围；对士兵 108 伤害，对建筑/塔只有 45（清兵为主，拆家极低效）' },
      { key: 'fireball', name: '火球', glyph: '火', color: '#ff9a4a', unlockBaseLevel: 2,
        cooldown: 26, aoe: 1, dmg: 200, affects: 'enemy',
        desc: '3×3 范围；对士兵 240 伤害，对建筑/塔 100（打兵堆最划算）' },
      { key: 'rocket', name: '火箭', glyph: '箭', color: '#ff6a6a', unlockBaseLevel: 3,
        cooldown: 30, aoe: 0, dmg: 420, affects: 'enemy',
        desc: '1×1 范围（只有落点那一格）；对士兵 504，对建筑/塔 210（砸金矿仍有效）' },
      { key: 'rage', name: '狂暴', glyph: '怒', color: '#ffd479', unlockBaseLevel: 4,
        cooldown: 40, aoe: 1, dmg: 0, affects: 'ally', atkSpeedMul: 2, duration: 8,
        desc: '3×3 范围，己方部队与建筑攻速 +100%，持续 8 秒' },
      { key: 'freeze', name: '冰冻', glyph: '冰', color: '#9fe8ff', unlockBaseLevel: 5,
        cooldown: 45, aoe: 1, dmg: 0, affects: 'enemy', frozen: 4,
        desc: '3×3 范围，敌人与建筑停止攻击 4 秒' },
      { key: 'weaken', name: '弱化', glyph: '弱', color: '#c9a0d8', unlockBaseLevel: 6,
        cooldown: 42, aoe: 1, dmg: 0, affects: 'enemy', weakenMul: 0.2, duration: 5,
        desc: '3×3 范围，敌人与建筑伤害降低 80%，持续 5 秒' }
    ],

    /* 兵种：priority 决定打谁 ——
     *   'field'：只打敌兵 → 大本营，不打建筑
     *   'siege'：只打建筑 → 大本营，完全不打敌兵（所以敌兵拦不住它）
     *   targets: 'ground' 只对地 / 'both' 对地对空
     *   地面兵在棋盘内只沿本列推进；飞行兵（air:true）无视建筑直线飞。
     *   range：近战 1.0；弓箭手 3.0；气球兵 1.5。
   *   注意：格距离判定是**整数**曼哈顿距离，所以 1.5 → 1 格。判定一律走 unitReach(def)，
   *   不要直接读 range —— 它会把小数部分带进比较，看起来能打 1.5 格其实只能打 1 格。
     *   数值分档（相对这 8 种兵）：
     *     价格 低 步兵/攻城兵 · 中 弓箭手/攻城车 · 高 气球兵/飞艇/重甲/飞龙
     *     血量 低 弓箭手 · 中 步兵/攻城兵/气球兵/飞艇 · 高 攻城车/重甲/飞龙
     *     移速 慢 重甲/弓箭手 · 中 飞龙/步兵/气球兵/攻城兵 · 快 攻城飞艇/攻城车
     *     攻击 低 飞龙/攻城车 · 中 步兵/攻城兵/弓箭手/气球兵/飞艇 · 高 重甲 */
    units: {
      infantry: {
        key: 'infantry', name: '步兵', glyph: '步', color: '#3d7fd6', air: false,
        cost: 75, deployCd: 5.0, hp: 220, armor: 2, atk: 28, atkInterval: 0.8, range: 1.0,
        speed: 0.90, priority: 'field', targets: 'ground',
        desc: '便宜、血中、速度中、攻中；只对地，只打兵和大本营'
      },
      heavy: {
        key: 'heavy', name: '重甲兵', glyph: '甲', color: '#6b7f9e', air: false,
        /* v17：生命 660 → 860（玩家指定），与攻城飞艇同血但护甲更高（6 vs 3）、
         * 移速更慢（0.5 vs 1.08）、还只对地 —— 定位仍是「慢速肉盾」，不是飞行拆迁。 */
        cost: 280, deployCd: 14.0, hp: 860, armor: 6, atk: 68, atkInterval: 1.0, range: 1.0,
        speed: 0.50, priority: 'field', targets: 'ground',
        desc: '贵、血高、速度慢、攻强；只对地，只打兵和大本营'
      },
      siege: {
        key: 'siege', name: '攻城兵', glyph: '攻', color: '#c2703c', air: false,
        /* v19：平衡调整（玩家指定）攻击 36 → 42（+6）。仍是「拆建筑」主力输出。
         * v19b：移速 1.15 → 1.0（玩家指定），让攻城车(1.1)能走在它前面当肉盾。 */
        cost: 120, deployCd: 6.0, hp: 280, armor: 3, atk: 42, atkInterval: 1.1, range: 1.0,
        speed: 1.0, priority: 'siege', targets: 'ground',
        desc: '较便宜、血中、速度中、攻中；只对地，只拆建筑和大本营'
      },
      ram: {
        key: 'ram', name: '攻城车', glyph: '车', color: '#8c6a4a', air: false,
        /* v19：平衡调整（玩家指定）——
         * 攻击 92 → 32（−60，DPS 65.7 → 22.9，−65%）；血量 1680 → 1480（−200）。
         * 注意：攻城车是「只拆建筑」单位（priority=siege，对建筑 ×1.4），
         * 削后拆建筑 DPS 仅 32/秒，已低于攻城兵（42×1.4/1.1 ≈ 53.5/秒）。
         * 因此它从「拆迁主力」退化为「耐揍的开路肉盾」（靠 1480 血 + 5 甲扛塔火），
         * 拆迁交给攻城兵。图鉴相应改为「攻击较低」。
         * v19b：移速 0.85 → 1.1（玩家指定）。定位明确为「攻城前排肉盾」，
         * 提速到比攻城兵(1.0)还快，才能字面意义上顶在攻城兵前面扛塔火。 */
        cost: 270, deployCd: 13.0, hp: 1480, armor: 5, atk: 32, atkInterval: 1.4, range: 1.0,
        speed: 1.1, priority: 'siege', targets: 'ground',
        desc: '较贵、血高、速度快、攻击较低；只对地，只拆建筑和大本营'
      },
      archer: {
        key: 'archer', name: '弓箭手', glyph: '弓', color: '#5aab6a', air: false,
        /* 射程 3 格（上下左右）。
         * 注：v14 一度试过 3.5 —— 但棋盘距离是**整数**曼哈顿距离，3.5 与 3.0 判定等价，
         * 真要生效只能靠额外的 reach 字段强行凑成 4 格，那实际是 +1 格，玩家要的不是这个。
         * 所以按玩家要求回到 3 格；`unitReach()` 仍保留 reach 覆盖能力以备将来。 */
        cost: 180, deployCd: 9.0, hp: 100, armor: 1, atk: 36, atkInterval: 0.9, range: 3.0,
        speed: 0.70, priority: 'field', targets: 'both',
        desc: '价格中、血低、速度中、攻中；可对地对空，只打兵和大本营（射程 3 格，按上下左右算）'
      },
      balloon: {
        key: 'balloon', name: '气球兵', glyph: '球', color: '#d98cc4', air: true,
        cost: 260, deployCd: 12.0, hp: 300, armor: 2, atk: 44, atkInterval: 0.8, range: 1.5,
        speed: 1.00, priority: 'field', targets: 'both',
        desc: '飞行、较贵、血中、速度较快、攻中；可对地对空，只打兵和大本营（射程 1.5 格，按上下左右算）'
      },
      airship: {
        key: 'airship', name: '攻城飞艇', glyph: '艇', color: '#8a7fb8', air: true,
        /* ★ v16 平衡：血 320 → 860，攻击 40 → 48（+20%）。
         * 它是「只拆建筑」的空中单位，320 血飞过去基本是一次性的 ——
         * 加厚到 860 之后它才有第二次投弹的机会（仍然低于攻城车/飞龙的 1680）。 */
        /* v17：造价 240 → 320（玩家指定）。血量/攻击沿用 v16 的 860 / 48。
         * v18：冷却 12.0 → 14.5（玩家指定）。
         * 原因：涨价到 320 之后它还保持 12 秒冷却，比 280 金的攻城车(13)/重甲(14)
         * 都短 —— 「越贵冷却越久」的单调性被破坏，玩家一眼能看出不协调。
         * 改到 14.5 之后整张表重新单调：
         *   75/5 · 120/6 · 180/9 · 260/12 · 270/13 · 280/14 · 320/14.5 · 420/18 */
        cost: 320, deployCd: 14.5, hp: 860, armor: 3, atk: 48, atkInterval: 1.0, range: 1.0,
        speed: 1.08, priority: 'siege', targets: 'ground',
        desc: '飞行、较贵、血高、速度较快、攻中；只对地，只拆建筑和大本营'
      },
      dragon: {
        key: 'dragon', name: '飞龙', glyph: '龙', color: '#b0613a', air: true,
        cost: 420, deployCd: 18.0, hp: 1680, armor: 5, atk: 24, atkInterval: 1.2, range: 1.0,
        speed: 0.80, priority: 'field', targets: 'ground',
        desc: '飞行、贵、血高、速度中、攻低；只对地，只打兵和大本营'
      }
    },

    /* ---------------------------------------------------------------- 总体升级（全局科技）
     * 五项，各自 1-10 级，只影响己方：
     *   建筑攻击 / 建筑生命：1-4 级每级 +10%，5-9 级每级 +20%
     *   士兵攻击 / 士兵生命：1-4 级每级 +15%，5-9 级每级 +30%
     *   派兵冷却（v14 新增）：每级 -10%，满级 10 级 = 冷却归零（线性，不用乘法）
     *
     * 注意「派兵冷却」与前四项的语义不同：前四项是**增益倍率**（globalMulOf 连乘），
     * 这一项是**缩减**（1 - 0.10×lv），到 10 级恰好为 0。所以它不能套 globalMulOf，
     * 倍率统一由 globalBonus().deployCdMul 提供，唯一使用点在 deployUnit。 */
    globalUpgrades: {
      bAtk: { key: 'bAtk', name: '建筑攻击', glyph: '攻', color: '#ff8a5c', baseCost: 260,
        desc: '所有己方建筑攻击力提升',
        effectLabel: function (lv) { return '+' + Math.round((globalMulOf(lv, 0.10, 0.20) - 1) * 100) + '%'; } },
      bHp: { key: 'bHp', name: '建筑生命', glyph: '盾', color: '#7ec8ff', baseCost: 260,
        desc: '所有己方建筑生命值提升',
        effectLabel: function (lv) { return '+' + Math.round((globalMulOf(lv, 0.10, 0.20) - 1) * 100) + '%'; } },
      uAtk: { key: 'uAtk', name: '士兵攻击', glyph: '剑', color: '#ffd479', baseCost: 220,
        desc: '所有己方士兵攻击力提升',
        effectLabel: function (lv) { return '+' + Math.round((globalMulOf(lv, 0.15, 0.30) - 1) * 100) + '%'; } },
      uHp: { key: 'uHp', name: '士兵生命', glyph: '心', color: '#7ef0a0', baseCost: 220,
        desc: '所有己方士兵生命值提升',
        effectLabel: function (lv) { return '+' + Math.round((globalMulOf(lv, 0.15, 0.30) - 1) * 100) + '%'; } },
      cdReduce: { key: 'cdReduce', name: '派兵冷却', glyph: '冷', color: '#9fc8ff', baseCost: 240,
        desc: '所有兵种的派兵冷却时间缩短（每级 -10%，满级归零）',
        effectLabel: function (lv) {
          if (!lv) return '—';
          if (lv >= 10) return '冷却归零';
          return '-' + (lv * 10) + '%';
        } }
    },

    /* AI 参数 */
    ai: { thinkEvery: 1.2, deployMinReserve: 1, pushMinUnits: 3 },

    /* 普通建筑的升级规则：等级 1..maxLevel
     *   每级：血量 ×hpMul、攻击 ×atkMul、射程 +rangeAdd、收入 ×incMul、产兵间隔 ÷prodMul
     *   升级费用 = 基础造价 × costMul^(当前等级-1)（四舍五入到 5） */
    buildingUpgrade: {
      maxLevel: 5,
      costMul: 1.7,
      hpMul: 1.30,
      atkMul: 1.22,
      rangeAdd: 0.2,
      incMul: 1.35,
      prodMul: 1.18
    }
  };

  /* ============================================================================
   * 建筑等级系统
   *   1-4 级：每级 攻击/生命 ×1.10
   *   4→5 级：二选一分支（一次性加成，比如攻速翻倍 / 伤害翻两倍 / 范围扩大）
   *   5-9 级：每级 攻击/生命 ×1.30
   *   9→10 级：攻击/生命 ×1.60（终极形态）
   * 所有建筑一开始都能建造（没有 tier 限制）。
   * ========================================================================== */
  function levelMultipliers(level, branchKey) {
    var U = DATA.upgrade;
    level = Math.max(1, Math.min(U.maxLevel, level || 1));
    var hpMul = 1, atkMul = 1;
    for (var lv = 2; lv <= level; lv++) {
      var step = (lv <= U.branchLevel) ? 0.10 : (lv < U.maxLevel ? 0.30 : 0.60);
      hpMul *= (1 + step);
      atkMul *= (1 + step);
    }
    // 分支的自带倍率（在 commitAt 那一级生效一次）
    var br = branchKey ? DATA.branches[branchKey] : null;
    if (br && level >= br.commitAt) {
      atkMul *= (br.atkMul || 1);
      hpMul *= (br.hpMul || 1);
    }
    return { hpMul: hpMul, atkMul: atkMul, branch: br };
  }

  /* 金矿专用：金币加成按等级跃升（1-4 级每级 +30%，4→5 级 +60%） */
  function incomeMultiplier(level) {
    level = Math.max(1, Math.min(DATA.upgrade.maxLevel, level || 1));
    var mul = 1;
    for (var lv = 2; lv <= level; lv++) mul *= (1 + (lv === 5 ? 0.60 : 0.30));
    return mul;
  }

  /* 把「基础配置 + 等级 + 分支」合成一份实际数值 */
  function statsForLevel(def, level, branchKey) {
    var m = levelMultipliers(level, branchKey);
    var br = m.branch;
    var mods = (br && modsActive(br, level)) ? br.mods : {};
    var mode = mods.mode || def.mode || 'single';
    var out = {
      hp: Math.round(def.hp * m.hpMul),
      armor: def.armor,
      atk: def.atk ? +(def.atk * m.atkMul).toFixed(1) : null,
      atkInterval: def.atkInterval ? +(def.atkInterval * (mods.atkInterval || 1)).toFixed(3) : null,
      range: (mods.range != null ? mods.range : (def.range || null)),
      targets: def.targets || null,
      mode: mode,
      maxTargets: mods.maxTargets || 0,
      lineLen: mods.lineLen || 0,
      /* 溅射：分支可以覆盖，否则取建筑基础值（迫击炮基础就有 1 格溅射） */
      splash: (mods.splash != null ? mods.splash : (def.splash || 0)),
      auraRadius: mods.auraRadius != null ? mods.auraRadius : (def.aura ? def.aura.radius : null),
      auraDR: null,
      // 金币产出取整（避免 UI 上出现 2.6/s 这种碎数字）
      income: def.income ? (def.incomeByLevel ? def.incomeByLevel[Math.min(level, def.incomeByLevel.length) - 1] : Math.round(def.income * incomeMultiplier(level))) : null,
      branch: br ? br.key : null,
      branchName: br ? br.name : null
    };
    // 防御塔减伤：基础 + 每级成长（分支可能直接给一个固定值）
    if (def.aura) {
      if (mods.auraDR != null) {
        out.auraDR = Math.min(0.75, mods.auraDR + Math.max(0, level - DATA.upgrade.branchLevel - 1) * def.aura.drStep);
      } else {
        var a = def.aura;
        var dr = a.dr + Math.max(0, Math.min(level, DATA.upgrade.branchLevel) - 1) * a.drPerLevel;
        if (level > DATA.upgrade.branchLevel) {
          dr += (level - DATA.upgrade.branchLevel) * a.drStep;
          if (level >= DATA.upgrade.maxLevel) dr += a.drFinal;
        }
        out.auraDR = Math.min(0.75, dr);
      }
    }
    return out;
  }
  function modsActive(br, level) { return !br || level >= br.commitAt; }

  /* 建筑升到下一级要多少钱：越贵的建筑越贵，且逐级递增 */
  function buildingUpgradeCost(b) {
    if (!b) return null;
    if (b.def && b.def.isBase) {
      var lv0 = b.level || 1;
      var cur = DATA.baseLevels[lv0 - 1];
      return (cur && cur.upgradeCost != null) ? cur.upgradeCost : null;
    }
    var U = DATA.upgrade;
    var lv = b.level || 1;
    if (lv >= (b.def.maxLevel || U.maxLevel)) return null;
    var base = b.def.cost || 100;
    var raw = base * (1 + U.costFactor * lv) * Math.pow(1.22, lv);
    return Math.round(raw / U.costRound) * U.costRound;
  }

  /* 某个建筑在下一级可选的升级分支（只有 4 级升 5 级时有；没分支返回空数组） */
  function branchesFor(b) {
    if (!b || !b.def || b.def.isBase) return [];
    if ((b.level || 1) !== DATA.upgrade.branchLevel) return [];
    if (b.branch) return [];
    var out = [];
    Object.keys(DATA.branches).forEach(function (k) {
      if (DATA.branches[k].parent === b.def.key) out.push(DATA.branches[k]);
    });
    return out;
  }

  /* 「升到 lv 级」的累计倍率：1-4 级每级用 lowStep，第 5 级起每级用 highStep */
  function globalMulOf(lv, lowStep, highStep) {
    lv = Math.max(0, Math.min(10, lv || 0));
    var m = 1;
    for (var l = 1; l <= lv; l++) m *= (1 + (l <= 4 ? lowStep : highStep));
    return m;
  }

  /* ------------------------------------------------------------ 工具函数 */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rowInGrid(r) { return r >= 1 && r <= ROWS; }
  function inGrid(r, c) { return r >= 1 && r <= ROWS && c >= 1 && c <= COLS; }
  function toRef(r, c) { return 'r' + r + 'c' + c; }
  function fromRef(ref) {
    var m = /^r(\d+)c(\d+)$/.exec(ref);
    return m ? { r: +m[1], c: +m[2] } : null;
  }
  function forEachCell(rect, fn) {
    for (var r = rect.r1; r <= rect.r2; r++) for (var c = rect.c1; c <= rect.c2; c++) fn(r, c);
  }
  function rectCells(rect) {
    var out = [];
    forEachCell(rect, function (r, c) { out.push([r, c]); });
    return out;
  }
  function rectCenter(rect) {
    return { row: (rect.r1 + rect.r2) / 2, col: (rect.c1 + rect.c2) / 2 };
  }
  function dist(a, b) {
    var dr = a.row - b.row, dc = a.col - b.col;
    return Math.sqrt(dr * dr + dc * dc);
  }
  /* 棋盘上的「格距离」（切比雪夫距离）：斜着相邻也算 1 格。 */
  function gridDist(a, b) {
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  }
  /* 士兵的攻击范围用「上下左右四格」＝曼哈顿距离（斜角打不到） */
  function cardinalDist(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  }
  /* 兵种的**实际够得到的格数**（整数）。
   * range 允许带小数（1.5 表示「上下左右 1 格」的历史语义），但棋盘距离是整数，
   * 直接拿 1.5 去比和拿 1.0 去比结果一样 —— 统一在这里向下取整，语义才清楚。
   * def.reach 是逃生口：将来若真要做「半格真生效」，就在该兵种上写 reach（整数格）。
   * 弓箭手曾经用过 reach=4（3.5 格落地成 4 格），后按玩家要求回到 3 格，现已无人使用。
   * 建筑走 statsForLevel().range，不经过这里。 */
  function unitReach(def) {
    if (!def) return 1;
    if (def.reach != null) return def.reach;
    return def.range != null ? Math.floor(def.range) : 1;
  }
  function inHalf(team, r, c) {
    var h = HALF[team];
    return r >= h[0] && r <= h[1] && c >= 1 && c <= COLS;
  }

  /* 单位/建筑的「中心点」——用于距离与射程计算 */
  function centerOf(e) {
    if (e.kind === 'building') {
      var x = e.def.size[0], y = e.def.size[1];
      return { row: e.row + (x - 1) / 2, col: e.col + (y - 1) / 2 };
    }
    return { row: e.row, col: e.col };
  }
  /* 目标命中范围：大本营 2x2 取「离攻击者最近的格子」更符合直觉（体积大更好打） */
  function nearestCellOf(e, from) {
    if (e.kind !== 'building' || (e.def.size[0] === 1 && e.def.size[1] === 1)) {
      return { row: e.row, col: e.col };
    }
    var r2 = e.row + e.def.size[0] - 1, c2 = e.col + e.def.size[1] - 1;
    return { row: clamp(Math.round(from.row), e.row, r2), col: clamp(Math.round(from.col), e.col, c2) };
  }

  /* ------------------------------------------------------------ 状态创建 */
  function createState(opts) {
    opts = opts || {};
    var state = {
      data: DATA,
      tick: 0,
      time: 0,
      over: false,
      winner: null,
      events: [],
      nextId: 1,
      buildings: [],
      units: [],
      projectiles: [],
      waves: [],           // 脉冲塔的扩散电磁波（波前伤害，见 spawnWave）
      byRef: { red: {}, blue: {} },
      grid: [],            // grid[r][c] = null | building
      res: {},             // 当前金币
      reserve: { red: {}, blue: {} },   // 备用（旧版待命区，保留字段避免外部代码报错）
      unitCd: { red: {}, blue: {} },    // 每个兵种自己的冷却（士兵时间冷却制）
      globalUp: { red: {}, blue: {} },  // 总体升级（全局科技）等级
      spellCd: { red: {}, blue: {} },   // 每个法术自己的冷却
      deployCd: { red: [], blue: [] },  // 每列的派兵冷却（下标 0..COLS-1，对应 列1..列10）
      baseLevel: {},       // 大本营等级
      baseHp: {},          // 大本营当前血量（取自建筑实体）
      field: {},           // 每方「打兵型」单位的路线图（含通道行）
      fieldSiege: {},      // 每方「拆建筑型」单位的路线图（会把敌方建筑当目标）
      entryField: {},      // 每方的「让位图」：同格多个兵时谁先进棋盘
      stats: {
        red: { spent: 0, income: 0, kills: 0, produced: 0 },
        blue: { spent: 0, income: 0, kills: 0, produced: 0 }
      },
      ai: { timer: { red: 0, blue: 0 } },   // 每方独立的思考计时器（初值见 createState）
      /* 主攻列热力图（P-C 基础件）：
       * aiHeat[我方][列] = 「敌方单位最近常待在这一列」的强度（会随时间衰减）。
       * 只用公开信息（敌方单位在棋盘上的格子坐标，玩家本来就看得见），
       * 每个 tick 累加、按 0.98/秒 淡出，见 updateHeat / hotLanes。 */
      aiHeat: { red: new Array(COLS + 2).fill(0), blue: new Array(COLS + 2).fill(0) },
      /* 敌方画像（P-D 对手建模）：见 makeFoeProfile / updateFoeProfile。
       * 每方各一份，只统计**公开信息**（敌方建筑位置/类型/等级、敌方场上单位）。 */
      aiFoe: { red: makeFoeProfile(), blue: makeFoeProfile() },
      /* 进攻主攻列的记忆（P-D）：连续几波打同一列（成建制），玩家补齐防御才换列。 */
      aiFocus: { red: { col: 0, until: 0 }, blue: { col: 0, until: 0 } },
      aiPreset: { red: 'hard', blue: 'hard' },   // 电脑难度
      aiTeam: 'red',                             // 哪一方是电脑（玩家侧不做难度特判）
      buildCooldown: { red: 0, blue: 0 },
      seed: opts.seed == null ? 12345 : opts.seed,
      rngState: 0,
      capWarned: false,
      /* 闯关模式的对手强度倍率。null = 普通对局（双方对称）。
       * { team: 'red', income: 1.2, hp: 1.1, atk: 1.1 } 这种形状；
       * team 指明只作用在哪一方 —— 玩家那一侧永远是 1，不然「加强 AI」会连自己一起加强。 */
      boost: opts.boost || null
    };
    state.rngState = state.seed >>> 0;
    var diff = opts.difficulty || 'hard';
    state.aiPreset.red = diff; state.aiPreset.blue = diff;

    for (var r = 0; r <= ROWS + 1; r++) {
      state.grid[r] = [];
      for (var c = 0; c <= COLS + 1; c++) {
        state.grid[r][c] = null;
        if (c === 0 || c === COLS + 1) state.grid[r][c] = { terrain: -1, block: true }; // 棋盘左右边界外
      }
    }
    state.res.red = 260; state.res.blue = 260;
    state.baseLevel.red = 1; state.baseLevel.blue = 1;
    state.reserve.red = {}; state.reserve.blue = {};
    TEAMS.forEach(function (t) {
      state.deployCd[t] = new Array(COLS + 1).fill(0);
      state.unitCd[t] = {};
      state.spellCd[t] = {};
      DATA.units && Object.keys(DATA.units).forEach(function (k) {
        state.reserve[t][k] = 0;
        state.unitCd[t][k] = 0;         // 开局所有兵种都能立刻派
      });
      DATA.spells.forEach(function (s) { state.spellCd[t][s.key] = 0; });
    });

    TEAMS.forEach(function (team) { addBase(state, team); });
    rebuildFields(state);
    return state;
  }

  /* 闯关模式的强度倍率查询。kind ∈ { income, hp, atk }。
   *
   * 为什么做成「每次现查」而不是「创建时烘进属性」：
   *   血量还有个 hpMax 落点可以烘，但攻击力是每帧从 def.atk 现算的
   *   （def 是所有同类建筑/单位共享的那份），改 def 就等于把玩家也一起加强了。
   * 所以统一在「真正取值的那一行」乘一次，语义最直白，也不会漏掉升级/新建的路径。 */
  function boostOf(state, team, kind) {
    var b = state && state.boost;
    if (!b) return 1;
    if (b.team && b.team !== team) return 1;     // 只加强指定阵营
    var v = b[kind];
    return (typeof v === 'number' && v > 0) ? v : 1;
  }

  function rand(state) { // 确定性随机（xorshift）
    var x = state.rngState;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    state.rngState = x;
    return x / 4294967296;
  }

  function addBase(state, team) {
    var rect = BASE_RECT[team];
    var lv = state.baseLevel[team];
    // 大本营自带防御：单体攻击、对地对空，攻击力与「同级别法师塔」相同
    var mageAtk = DATA.buildings.mage.atk;
    /* 大本营血量也要吃倍率：闯关后期 AI 大本营更硬，否则「推家」的难度不随关卡上升。 */
    var baseHp = Math.round(DATA.baseLevels[lv - 1].hp * boostOf(state, team, 'hp'));
    var def = {
      key: 'base', name: '大本营', glyph: '营', color: team === RED ? '#d9534f' : '#3d7fd6',
      size: [2, 2], cost: 0, hp: baseHp, armor: 10, tier: 1,
      isBase: true, maxLevel: DATA.baseLevels.length,
      atk: mageAtk, atkInterval: DATA.buildings.mage.atkInterval,
      range: DATA.buildings.mage.range, targets: 'both', mode: 'single',
      desc: '收入随等级提升；自带防御（对地对空单体，攻击力=同级别法师塔）；被摧毁即失败'
    };
    var b = {
      id: state.nextId++, kind: 'building', team: team, def: def, key: 'base',
      row: rect.r1, col: rect.c1, refs: rectCells(rect).map(function (p) { return toRef(p[0], p[1]); }),
      hp: def.hp, hpMax: def.hp, armor: def.armor, level: lv, invested: 0,
      prodTimer: 0, atkTimer: 0, justDamaged: 0, spawnIdx: 0
    };
    state.buildings.push(b);
    b.refs.forEach(function (ref) {
      state.byRef[team][ref] = b;
      var p = fromRef(ref); state.grid[p.r][p.c] = b;
    });
    return b;
  }

  /* ------------------------------------------------------------ 查询工具 */
  /* 阻挡规则：对 team 而言，只有【敌方建筑】是墙；己方建筑可通行；通道行永远可通行。 */
  function blockingBuildingAt(state, team, r, c) {
    if (r < 0 || r > ROWS + 1 || c < 1 || c > COLS) return null;
    if (!rowInGrid(r)) return null;                    // 行A/行B 是通道，永不被建筑阻挡
    var b = state.grid[r][c];
    if (b && (b.team !== team || b.def.isBase)) return b; // 敌方建筑＝墙；大本营自身永远不可进入
    return null;
  }
  /* 空中兵用：只要求「在棋盘内 / 自己的通道行 / 不是大本营格」，建筑一律无视 */
  function airPassable(state, team, r, c) {
    if (c < 1 || c > COLS) return false;
    if (!rowInGrid(r)) return r === CHANNEL_ROW[team];
    return !isBaseCell(BASE_RECT[OPP[team]], r, c);
  }
  /* 某格上是否有「敌军的普通建筑」（= 可以打的墙） */
  function wallAtTeam(state, team, r, c) {
    if (!rowInGrid(r) || c < 1 || c > COLS) return null;
    var b = state.grid[r][c];
    if (b && b.team !== team && !b.def.isBase) return b;
    return null;
  }
  function isPassable(state, team, r, c) {
    if (c < 1 || c > COLS) return false;
    if (r < 0 || r > ROWS + 1) return false;
    return !blockingBuildingAt(state, team, r, c);
  }
  function enemyBase(state, team) {
    var foe = OPP[team], rect = BASE_RECT[foe];
    return state.byRef[foe][toRef(rect.r1, rect.c1)];
  }
  function ownBase(state, team) { return state.byRef[team][toRef(BASE_RECT[team].r1, BASE_RECT[team].c1)]; }
  function unitsOf(state, team) { return state.units.filter(function (u) { return u.team === team; }); }
  function baseLevelOf(state, team) { return state.baseLevel[team]; }

  /* --------------------------------------------------- 行进路线图 (Flow Field)
   * 规则（按玩家设计）：
   *   · 地面兵在棋盘内**只沿本列直线推进**，不在棋盘内横移；
   *   · 横移只发生在棋盘外的通道行（行A/行B）：「正上方被遮挡 → 沿通道行去就近空列」；
   *   · 因此「建筑是否挡路」是**按列**判断的：一列里只要有一个敌方建筑，
   *     这条列从该建筑往后就都上不去了；敌兵会停在建筑前开打（这就是「堵」）。
   *
   * 实现上不需要通用 BFS：对每一列分别算「该列每格到敌方大本营的纵向距离」即可，
   * 再让通道行允许左右走。这样天然保证「整行被填满 ⇒ 谁也过不去」，也保证
   * 「棋盘内不可能绕开墙」。箭头为 null = 该列已被堵死（会原地开打）。
   * ------------------------------------------------------------------------ */
  function computeField(state, team, mode) {
    var N = ROWS + 2;                        // 行 0..11
    var W = COLS;
    var INF = 1e9;
    var goal = BASE_RECT[OPP[team]];
    var step = DIR[team];                    // 本方推进方向：蓝 +1（向下），红 -1（向上）
    var chan = CHANNEL_ROW[team];

    var dists = [], dirs = [], block = [];
    for (var i = 0; i < N; i++) {
      dists.push(new Array(W + 1).fill(INF));
      dirs.push(new Array(W + 1).fill(null));
      block.push(new Array(W + 1).fill(false));
    }
    for (var r0 = 0; r0 <= ROWS + 1; r0++) {
      for (var c0 = 1; c0 <= COLS; c0++) {
        if (rowInGrid(r0) && blockingBuildingAt(state, team, r0, c0)) block[r0][c0] = true;
        else if (!rowInGrid(r0) && r0 !== chan) block[r0][c0] = true;   // 敌方通道不算路
      }
    }

    // 可通行判定：敌方建筑与大本营挡路；己方建筑不挡路；只有自己的通道行可走
    function laneOpen(r, c) {
      if (r < 0 || r > ROWS + 1 || c < 1 || c > COLS) return false;
      if (!rowInGrid(r)) return r === chan;
      if (isBaseCell(goal, r, c)) return false;
      return !blockingBuildingAt(state, team, r, c);
    }
    // 「这里是敌军的建筑（不是大本营）」= 可以打的目标
    function wallAt(r, c) {
      if (!rowInGrid(r) || c < 1 || c > COLS) return null;
      var b = blockingBuildingAt(state, team, r, c);
      return (b && !b.def.isBase) ? b : null;
    }
    // 棋盘内只允许纵向（朝敌方推进或原路退回）；通道行允许左右走 —— 这就是「整行堵死谁都过不去」
    // 目标 = 敌方大本营。0 距离 = 「贴着大本营、射程内能打到它」的那些格子。
    // 打兵型：眼里没有建筑（建筑=障碍），所以它们会自己绕路。
    // 拆建筑型（siege）：把敌方建筑也当成 0 距离目标，所以会一路去拆墙。
    var siegeSide = (mode === 'siege');

    /* 上下左右四格邻居 —— 这就是「可以左拐右拐、前进后退」 */
    function neighbors(r, c) {
      return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    }

    /* 这一格能不能站。
     * 规则：建筑不能踩 —— **但进场行例外**（见 stepTo 的说明）。
     *   · 敌方建筑：打兵型的兵当障碍绕开；拆建筑型的兵当目标去拆
     *   · 己方建筑：障碍，兵绕过去
     *   · 己方进场行上的建筑：**可以穿过**（那是地面兵唯一的入口，
     *     整排盖满时必须能从中穿过，否则兵永远出不来） */
    function canStand(r, c) {
      if (!rowInGrid(r) || c < 1 || c > COLS) return false;
      if (isBaseCell(goal, r, c)) return false;          // 敌方大本营本身不能站
      var b = blockingBuildingAt(state, team, r, c);      // 敌方建筑 / 大本营
      if (b) return siegeSide;                            // 拆建筑型把敌方建筑当目标
      if (state.grid[r][c]) {
        // 己方进场行：允许穿过（只对地面兵有意义，空中兵本来就飞越）
        if (!siegeSide && r === entryRowOf(team) && state.grid[r][c].team === team) return true;
        return false;                                     // 其它建筑不能踩
      }
      return laneOpen(r, c);
    }

    /* 站在 (r,c) 上，按「格距离」能不能打到敌方大本营（2×2 大本营取最近一格） */
    function canHitBase(r, c) {
      if (!rowInGrid(r)) return false;
      var rr = Math.min(Math.max(r, goal.r1), goal.r2);
      var cc = Math.min(Math.max(c, goal.c1), goal.c2);
      return Math.max(Math.abs(r - rr), Math.abs(c - cc)) <= 1;   // 紧贴大本营的一圈
    }

    /* 站在 (r,c) 上，能不能用「上下左右」的射程打到目标建筑（取其离自己最近的那一格）。
     * 士兵的射程都是 1 格（近战），所以就是「正上下左右贴着」。 */
    function canHitAt(r, c, target) {
      if (!rowInGrid(r)) return false;
      var rr = Math.min(Math.max(r, target.row), target.row + target.def.size[0] - 1);
      var cc = Math.min(Math.max(c, target.col), target.col + target.def.size[1] - 1);
      return Math.abs(r - rr) + Math.abs(c - cc) <= 1;
    }

    var queue = [], head = 0;
    // 起点 = 所有「真正能用上下左右 1 格打到敌方大本营」的位置，
    //   也就是大本营的**正上下左右**那一圈（不含斜角）。
    //   为什么不能把斜角也算进去：士兵攻击范围是上下左右 1 格，
    //   站在大本营斜下方其实打不到它，兵会傻站着被打（玩家实测到的问题）。
    var baseAsTarget = { row: goal.r1, col: goal.c1, def: { size: [goal.r2 - goal.r1 + 1, goal.c2 - goal.c1 + 1], isBase: true } };
    for (var br = 1; br <= ROWS; br++) {
      for (var bc = 1; bc <= COLS; bc++) {
        if (isBaseCell(goal, br, bc)) continue;          // 大本营本身不能站
        if (wallAt(br, bc)) continue;                    // 建筑格不作起点（下面单独当目标处理）
        if (!laneOpen(br, bc)) continue;
        if (!canHitAt(br, bc, baseAsTarget)) continue;    // 必须真的够得着
        dists[br][bc] = 0;
        queue.push(br * 100 + bc);
      }
    }
    // 拆建筑型：敌方建筑本身也是 0 距离目标（要打的东西）
    if (siegeSide) {
      state.buildings.forEach(function (b) {
        if (b.team === team || b.def.isBase) return;
        b.refs.forEach(function (ref) {
          var p = fromRef(ref);
          if (dists[p.r][p.c] !== 0) { dists[p.r][p.c] = 0; queue.push(p.r * 100 + p.c); }
        });
      });
    }

    // 四向 BFS：从大本营那一圈向外扩散，绕开建筑（打兵型）
    while (head < queue.length) {
      var cur = queue[head++], r = Math.floor(cur / 100), c = cur % 100;
      if (wallAt(r, c) && !siegeSide) continue;
      var nb = neighbors(r, c);
      for (var k = 0; k < nb.length; k++) {
        var nr = nb[k][0], nc = nb[k][1];
        if (!canStand(nr, nc)) continue;
        if (dists[nr][nc] === 0) continue;
        if (dists[nr][nc] <= dists[r][c] + 1) continue;
        dists[nr][nc] = dists[r][c] + 1;
        queue.push(nr * 100 + nc);
      }
    }

    /* 方向：走向「距离更小的四邻」；同距离时优先朝敌方那一侧（显得是往前推而不是乱绕） */
    function dirFor(r4, c4) {
      var d4 = dists[r4][c4];
      if (d4 === 0 || d4 >= 1e9) return null;
      var best4 = null, bestD4 = d4, bestBias = 1e9;
      var cands = neighbors(r4, c4);
      for (var ci = 0; ci < cands.length; ci++) {
        var ar = cands[ci][0], ac = cands[ci][1];
        if (!rowInGrid(ar) || ac < 1 || ac > COLS) continue;
        var av;
        if (siegeSide && wallAt(ar, ac)) av = 0;         // 拆建筑型：前面的墙就是目标
        else {
          if (!canStand(ar, ac)) continue;
          av = dists[ar][ac];
        }
        if (av >= bestD4) continue;
        // 同距离时，越「朝敌方推进」的越优先（避免左右横跳）
        var bias = (ar - r4) * DIR[team] * -1;           // 朝敌方走 → bias 更小
        if (av < bestD4 || bias < bestBias) {
          if (av < bestD4 || best4 === null) { bestD4 = av; bestBias = bias; best4 = { r: ar, c: ac }; }
          else if (bias < bestBias) { bestBias = bias; best4 = { r: ar, c: ac }; }
        }
      }
      return best4;
    }
    for (var r4 = 1; r4 <= ROWS; r4++) {
      for (var c4 = 1; c4 <= COLS; c4++) {
        if (!laneOpen(r4, c4)) continue;
        dirs[r4][c4] = dirFor(r4, c4);
      }
    }
    /* 通道行（行A/行B）：先看能不能直接进场；本列进不去就沿通道横移到「能进场的列」。
     * 能进场的列 = 那一格不是建筑（**大本营也不行！**）、而且从它有路能走到敌方大本营。 */
    var myBaseRect = BASE_RECT[team];
    function notBuilding(r, c) {
      if (!rowInGrid(r) || c < 1 || c > COLS) return false;
      if (isBaseCell(myBaseRect, r, c)) return false;   // ★ 己方大本营格不能作为进场格
      if (isBaseCell(goal, r, c)) return false;         //   敌方大本营格也不行
      /* 己方进场行上的建筑：地面兵可以穿过去（玩家要在这一行自由布局），
       * 所以允许把它当成进场格。其它建筑一律不行。 */
      var b = state.grid[r][c];
      if (b) {
        if (b.team === team && r === entryRowOf(team) && !siegeSide) return true;
        return false;
      }
      return true;
    }
    for (var c5 = 1; c5 <= COLS; c5++) {
      var direct = null;
      var ent = [[chan + step, c5], [chan - step, c5]];   // 进场行 / 棋盘边缘
      for (var m = 0; m < ent.length; m++) {
        var ar2 = ent[m][0], ac2 = ent[m][1];
        if (!notBuilding(ar2, ac2)) continue;
        if (!laneOpen(ar2, ac2)) continue;
        if (dists[ar2][ac2] >= 1e9) continue;
        direct = { r: ar2, c: ac2 };
        break;
      }
      if (direct) { dirs[chan][c5] = direct; continue; }
      // 本列进不去 → 左右找一列能进的，走过去
      var pick = null, pickD = null;
      for (var cc3 = 1; cc3 <= COLS; cc3++) {
        if (cc3 === c5) continue;
        var e2 = [[chan + step, cc3], [chan - step, cc3]];
        var usable = false;
        for (var m2 = 0; m2 < e2.length; m2++) {
          var r3 = e2[m2][0], c3 = e2[m2][1];
          if (!notBuilding(r3, c3)) continue;
          if (!laneOpen(r3, c3)) continue;
          if (dists[r3][c3] >= 1e9) continue;
          usable = true; break;
        }
        if (!usable) continue;
        var dd4 = Math.abs(cc3 - c5);
        if (pickD === null || dd4 < pickD) { pickD = dd4; pick = cc3; }
      }
      dirs[chan][c5] = (pick === null) ? null : { r: chan, c: pick };
    }
    return { dist: dists, dir: dirs, goal: goal, block: block };
  }

  function isBaseCell(rect, r, c) { return r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2; }

  /* 让位图：同一格里多个地面兵时，谁先进入棋盘。避免「一堆兵同时挤一个入口都进不去」。 */
  function computeEntryField(state, team) {
    var W = COLS, INF = 1e9, dists = [];
    for (var i = 0; i <= ROWS + 1; i++) dists.push(new Array(W + 1).fill(INF));
    var queue = [], head = 0;
    for (var c = 1; c <= COLS; c++) {
      var r = DIR[team] > 0 ? ROWS : 1;          // 己方半场最靠近前线的行
      if (!blockingBuildingAt(state, team, r, c)) {
        dists[r][c] = 0; queue.push((r - 1) * W + (c - 1));
      }
    }
    while (head < queue.length) {
      var idx = queue[head++], r2 = Math.floor(idx / W) + 1, c2 = (idx % W) + 1;
      var nb = [[r2 - 1, c2], [r2 + 1, c2], [r2, c2 - 1], [r2, c2 + 1]];
      for (var k = 0; k < 4; k++) {
        var nr = nb[k][0], nc = nb[k][1];
        if (nr < 0 || nr > ROWS + 1 || nc < 1 || nc > COLS) continue;
        if (dists[nr][nc] !== INF) continue;
        if (blockingBuildingAt(state, team, nr, nc)) continue;
        dists[nr][nc] = dists[r2][c2] + 1;
        queue.push((nr - 1) * W + (nc - 1));
      }
    }
    return dists;
  }

  function rebuildFields(state) {
    TEAMS.forEach(function (team) {
      // 两套路线图：field = 只打兵和大本营的兵走的路；siege = 会拆墙的兵走的路
      state.field[team] = computeField(state, team, 'field');
      state.fieldSiege[team] = computeField(state, team, 'siege');
      state.entryField[team] = computeEntryField(state, team);
    });
  }

  /* 取某个单位该走哪张路线图 */
  function fieldFor(state, u) {
    return (u.def && u.def.priority === 'siege') ? state.fieldSiege[u.team] : state.field[u.team];
  }

  /* 某格的「让位优先度」：值越小越先走 */
  function priorityAt(state, team, r, c) {
    var d = state.entryField[team][r][c];
    return d === 1e9 ? 9999 : d;
  }

  /* ------------------------------------------------------------ 建造/升级 */
  function canPlace(state, team, key, row, col) {
    var def = DATA.buildings[key];
    if (state.over) return { ok: false, why: '对局已结束' };
    if (!def) return { ok: false, why: '未知建筑' };
    if (!inGrid(row, col)) return { ok: false, why: '超出棋盘' };
    if (!inHalf(team, row, col) || !inHalf(team, row + def.size[0] - 1, col + def.size[1] - 1))
      return { ok: false, why: '只能建在自己半场' };
    /* 进场行 = 自己这一侧最靠近通道的那一行（蓝方行10 / 红方行1）。
     * 这一行**允许建造**（玩家的初衷就是在这里自由布局）。
     * 为了不让"整排盖满"把地面兵永久锁死，移动层做了特殊处理：
     * 地面兵在进场行上可以"穿过"建筑（见 stepUnit 的进场行通行规则），
     * 所以布局自由和"兵出得来"两者不冲突。 */
    // 大本营占位检查
    var rect = BASE_RECT[team];
    for (var r = row; r < row + def.size[0]; r++) {
      for (var c = col; c < col + def.size[1]; c++) {
        if (state.grid[r][c]) return { ok: false, why: '该格已被占用' };
        if (r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2) return { ok: false, why: '该格已被占用' };
        // 不能盖在「任何单位」头顶上（自己人也不行）——
        // 否则那个兵就"卡在建筑里"了。玩家的铁律：地面部队不能站在建筑上。
        var unitOnIt = state.units.some(function (o) {
          return o.row === r && o.col === c;
        });
        if (unitOnIt) return { ok: false, why: '该格上有单位，先把它调走' };
      }
    }
    if (state.res[team] < def.cost) return { ok: false, why: '金币不足（需要 ' + def.cost + '）' };
    return { ok: true };
  }

  function placeBuilding(state, team, key, row, col) {
    var chk = canPlace(state, team, key, row, col);
    if (!chk.ok) return chk;
    var def = DATA.buildings[key];
    var st = statsForLevel(def, 1);
    var hp0 = Math.round(st.hp * boostOf(state, team, 'hp'));
    var b = {
      id: state.nextId++, kind: 'building', team: team, def: def, key: key,
      row: row, col: col, hp: hp0, hpMax: hp0, armor: st.armor, level: 1,
      invested: def.cost || 0,
      prodTimer: 0, atkTimer: 0, justDamaged: 0, spawnIdx: 0,
      refs: rectCells({ r1: row, r2: row + def.size[0] - 1, c1: col, c2: col + def.size[1] - 1 })
        .map(function (p) { return toRef(p[0], p[1]); })
    };
if (state.aiSpendDebug) state.aiSpendDebug.push({ t: Math.round(state.time*10)/10, fn: 'place', cost: def.cost, res: Math.round(state.res[team]) });
        state.res[team] -= def.cost;
    state.stats[team].spent += def.cost;
    b.refs.forEach(function (ref) {
      state.byRef[team][ref] = b;
      var p = fromRef(ref); state.grid[p.r][p.c] = b;
    });
    state.buildings.push(b);
    rebuildFields(state);
    reloadNeighbors(state);     // 新建筑可能落进防御塔的保护范围
    emit(state, 'build', { team: team, key: key, row: row, col: col });
    return { ok: true, building: b };
  }

  /* 「点击建筑就能升级」
   * 关键规则（按你的要求）：升级**不回血**，只把「升级前后血量的差值」加到当前血量上。
   * 例：血量 400/500 升到 600 → 血量变成 400+(600-500)=500。 */
  function upgradeBuilding(state, b, branchKey) {
    if (state.over) return { ok: false, why: '对局已结束' };
    if (!b || !b.def) return { ok: false, why: '没有这个建筑' };
    if (b.def.isBase) return upgradeBase(state, b.team);
    var U = DATA.upgrade;
    var lv = b.level || 1;
    var cap = b.def.maxLevel || U.maxLevel;
    if (lv >= cap) return { ok: false, why: '已达最高等级（' + cap + ' 级）' };

    // 4→5 级：必须选一个分支
    var opts = branchesFor(b);
    if (opts.length > 0) {
      if (!branchKey) return { ok: false, why: '需要选择升级方向', branches: opts.map(function (o) { return o.key; }) };
      var found = null;
      opts.forEach(function (o) { if (o.key === branchKey) found = o; });
      if (!found) return { ok: false, why: '没有这个升级方向：' + branchKey };
    } else if (branchKey) {
      return { ok: false, why: '这一级不需要选方向' };
    }

    var cost = buildingUpgradeCost(b);
    if (cost === null) return { ok: false, why: '已达最高等级' };
    if (state.res[b.team] < cost) return { ok: false, why: '金币不足（需要 ' + cost + '）' };

if (state.aiSpendDebug) state.aiSpendDebug.push({ t: Math.round(state.time*10)/10, fn: 'upBuild', cost: cost, res: Math.round(state.res[b.team]) });
        state.res[b.team] -= cost;
    state.stats[b.team].spent += cost;
    b.invested = (b.invested || 0) + cost;   // 记进累计投入（拆除时按比例返还）

    var oldMax = b.hpMax;
    b.level = lv + 1;
    if (branchKey) b.branch = branchKey;
    var st = statsForLevel(b.def, b.level, b.branch);
    b.hpMax = Math.round(st.hp * boostOf(state, b.team, 'hp'));
    // 不回血：只补「最大血量的增量」
    b.hp = Math.min(b.hpMax, Math.max(1, b.hp + Math.max(0, b.hpMax - oldMax)));
    reloadNeighbors(state);
    emit(state, 'upgradeBuilding', {
      team: b.team, key: b.key, level: b.level, branch: b.branch || null, row: b.row, col: b.col
    });
    return { ok: true, level: b.level, branch: b.branch || null, building: b };
  }

  /* 给 UI 用：一次拿到某建筑的全部展示信息（含下一级的数值预览与可选分支） */
  function buildingInfo(state, b) {
    var def = b.def;
    var lvl = b.level || 1;
    var maxLv = def.isBase ? DATA.baseLevels.length : (def.maxLevel || DATA.upgrade.maxLevel);
    var st = def.isBase ? null : statsForLevel(def, lvl, b.branch);
    var nxt = null;
    if (!def.isBase && lvl < maxLv) nxt = statsForLevel(def, lvl + 1, b.branch);
    var out = {
      name: def.name, glyph: def.glyph, desc: def.desc || '',
      team: b.team, isBase: !!def.isBase, level: lvl, maxLevel: maxLv,
      hp: Math.max(0, Math.ceil(b.hp)), hpMax: b.hpMax, armor: b.armor,
      upgradeCost: buildingUpgradeCost(b),
      branchName: st && st.branchName ? st.branchName : null,
      branches: branchesFor(b).map(function (o) { return { key: o.key, name: o.name, desc: o.desc, color: o.color }; })
    };
    if (def.isBase) {
      var cur2 = DATA.baseLevels[lvl - 1];
      var nx2 = DATA.baseLevels[lvl];
      out.income = cur2.income;
      out.upgradeCost = (cur2 && cur2.upgradeCost != null) ? cur2.upgradeCost : null;
      out.nextIncome = nx2 ? nx2.income : null;
      out.nextHp = nx2 ? nx2.hp : null;
      out.note = '被摧毁即失败；不受攻击时会自我修复血量';
      out.spells = DATA.spells.filter(function (s) { return s.unlockBaseLevel <= lvl; })
        .map(function (s) { return s.name; });
    } else {
      out.atk = st.atk; out.range = st.range; out.income = st.income;
      out.atkInterval = st.atkInterval; out.targets = st.targets; out.mode = st.mode;
      out.auraDR = st.auraDR; out.auraRadius = st.auraRadius;
      out.next = nxt;
      if (nxt && nxt.branchName) out.nextBranchName = nxt.branchName;
    }
    return out;
  }

  function upgradeCost(state, team) {
    var lv = baseLevelOf(state, team);
    var cur = DATA.baseLevels[lv - 1];       // 升到 lv+1 的费用记在当前等级那一行
    return (cur && cur.upgradeCost != null) ? cur.upgradeCost : null;
  }

  function upgradeBase(state, team) {
    if (state.over) return { ok: false, why: '对局已结束' };
    var lv = baseLevelOf(state, team);
    if (lv >= DATA.baseLevels.length) return { ok: false, why: '已达最高等级' };
    // 升到 lv+1 的费用记在 baseLevels[lv-1].upgradeCost 上（与 buildingUpgradeCost 保持一致）
    var cur = DATA.baseLevels[lv - 1];
    var cost = cur ? cur.upgradeCost : null;
    if (cost == null) return { ok: false, why: '已达最高等级' };
    if (state.res[team] < cost) return { ok: false, why: '金币不足（需要 ' + cost + '）' };
if (state.aiSpendDebug) state.aiSpendDebug.push({ t: Math.round(state.time*10)/10, fn: 'upBase', cost: cost, res: Math.round(state.res[team]) });
        state.res[team] -= cost;
    state.stats[team].spent += cost;
    state.baseLevel[team] = lv + 1;
    var base = ownBase(state, team);
    var newHp = Math.round(DATA.baseLevels[lv].hp * boostOf(state, team, 'hp'));   // 新等级的血量
    var ratio = base.hp / base.hpMax;
    base.def = Object.assign({}, base.def, { hp: newHp });
    base.hpMax = newHp;
    base.hp = Math.min(newHp, Math.max(base.hp, newHp * ratio)); // 升级补血到至少原比例
    base.level = lv + 1;
    emit(state, 'upgrade', { team: team, level: lv + 1 });
    return { ok: true, level: lv + 1 };
  }

  /* ---------------------------------------------------------------- 拆除建筑
   * 返还公式（玩家指定）：
   *   返还 = 建造+升级累计花费 × 0.8 × (当前血量 / 总血量)
   * 大本营不能拆。 */
  function demolishRefund(b) {
    if (!b || !b.def) return 0;
    var hpRatio = b.hpMax > 0 ? Math.max(0, Math.min(1, b.hp / b.hpMax)) : 0;
    return Math.round((b.invested || b.def.cost || 0) * 0.8 * hpRatio);
  }
  function canDemolish(state, b) {
    if (state.over) return { ok: false, why: '对局已结束' };
    if (!b || !b.def) return { ok: false, why: '没有这个建筑' };
    if (b.def.isBase) return { ok: false, why: '大本营不能拆除' };
    return { ok: true };
  }
  function demolishBuilding(state, b) {
    var chk = canDemolish(state, b);
    if (!chk.ok) return chk;
    var refund = demolishRefund(b);
    var team = b.team, key = b.key;
    state.res[team] += refund;
    state.stats[team].spent = Math.max(0, state.stats[team].spent - refund);
    removeBuilding(state, b, { silent: true });
    emit(state, 'demolish', { team: team, key: key, refund: refund });
    return { ok: true, refund: refund };
  }

  /* ------------------------------------------------------------ 总体升级（全局加成）
   * 五项全局科技，每种 1-10 级：
   *   1-4 级：每级 +10%（士兵类的两种是 +15%）
   *   5-9 级：每级 +20%（士兵类的两种是 +30%）
   *   10 级  ：同样按上面那一档累加
   * 派兵冷却：每级 -10%，线性，满级归零（deployCdMul 直接是 0）
   * 只影响**己方**的建筑/士兵。 */
  function globalBonus(state, team) {
    var g = (state.globalUp[team]) || {};
    function mul(key, lowStep, highStep) {
      var lv = Math.max(0, Math.min(10, g[key] || 0));
      var m = 1;
      for (var l = 1; l <= lv; l++) m *= (1 + (l <= 4 ? lowStep : highStep));
      return m;
    }
    var cdLv = Math.max(0, Math.min(10, g.cdReduce || 0));
    return {
      buildingAtk: mul('bAtk', 0.10, 0.20),
      buildingHp: mul('bHp', 0.10, 0.20),
      unitAtk: mul('uAtk', 0.15, 0.30),
      unitHp: mul('uHp', 0.15, 0.30),
      /* 派兵冷却倍率：1 → 0（10 级归零）。deployUnit 里乘在 def.deployCd 上。 */
      deployCdMul: Math.max(0, 1 - 0.10 * cdLv),
      deployCdLv: cdLv
    };
  }
  function globalUpgradeCost(state, team, key) {
    var def = DATA.globalUpgrades[key];
    if (!def) return null;
    var lv = (state.globalUp[team] && state.globalUp[team][key]) || 0;
    if (lv >= 10) return null;
    return Math.round(def.baseCost * Math.pow(1.45, lv) / 5) * 5;
  }
  function upgradeGlobal(state, team, key) {
    if (state.over) return { ok: false, why: '对局已结束' };
    var def = DATA.globalUpgrades[key];
    if (!def) return { ok: false, why: '未知的总体升级' };
    var lv = (state.globalUp[team] && state.globalUp[team][key]) || 0;
    if (lv >= 10) return { ok: false, why: '已满级' };
    var cost = globalUpgradeCost(state, team, key);
    if (state.res[team] < cost) return { ok: false, why: '金币不足（需要 ' + cost + '）' };
if (state.aiSpendDebug) state.aiSpendDebug.push({ t: Math.round(state.time*10)/10, fn: 'upTech', cost: cost, res: Math.round(state.res[team]) });
        state.res[team] -= cost;
    state.stats[team].spent += cost;
    state.globalUp[team][key] = lv + 1;
    // 建筑血量上限会变 → 同步现有建筑的上限（当前血量按比例跟上，不额外回血）
    if (key === 'bHp') {
      var m = globalBonus(state, team).buildingHp;
      /* 这里也要乘 boost：它是**重算**上限，不是「加一层」。
       * 少了这一项，闯关里 AI 一买建筑血量科技，倍率就被整个抹掉 ——
       * 实测第 5 关大本营 4800 → 3520，花了钱反而更脆。 */
      var bm = boostOf(state, team, 'hp');
      state.buildings.forEach(function (b) {
        if (b.team !== team) return;
        var baseHp = (b.def.isBase ? DATA.baseLevels[(b.level || 1) - 1].hp
                                   : statsForLevel(b.def, b.level || 1, b.branch).hp);
        var newMax = Math.round(baseHp * m * bm);
        var ratio = b.hpMax > 0 ? b.hp / b.hpMax : 1;
        b.hpMax = newMax;
        b.hp = Math.min(newMax, Math.max(1, newMax * ratio));
      });
    }
    emit(state, 'globalUpgrade', { team: team, key: key, level: lv + 1 });
    return { ok: true, level: lv + 1, cost: cost };
  }
  /* 给 UI 用：四种总体升级的当前状态 */
  function globalUpgradeStatus(state, team) {
    var out = [];
    Object.keys(DATA.globalUpgrades).forEach(function (k) {
      var d = DATA.globalUpgrades[k];
      var lv = (state.globalUp[team] && state.globalUp[team][k]) || 0;
      out.push({
        key: k, name: d.name, glyph: d.glyph, color: d.color, desc: d.desc,
        level: lv, maxLevel: 10,
        cost: globalUpgradeCost(state, team, k),
        effect: d.effectLabel(lv),
        nextEffect: lv < 10 ? d.effectLabel(lv + 1) : null
      });
    });
    return out;
  }
  /* ---------------------------------------------------- 防御塔光环（护盾型）
   * 防御塔给「保护范围内的己方建筑物」减伤。重叠时取**数值最大的那个**（不叠加）。
   * 每次建筑增删/升级后重算一遍（棋盘只有 100 格，开销可忽略）。 */
  function reloadNeighbors(state) {
    state.buildings.forEach(function (b) { b.dr = 0; });
    var wards = state.buildings.filter(function (b) { return b.def.aura; });
    for (var i = 0; i < wards.length; i++) {
      var w = wards[i];
      var st = statsForLevel(w.def, w.level || 1, w.branch);
      var radius = st.auraRadius != null ? st.auraRadius : 1.5;
      var dr = st.auraDR || 0;
      if (dr <= 0) continue;
      for (var j = 0; j < state.buildings.length; j++) {
        var t = state.buildings[j];
        if (t === w || t.team !== w.team) continue;
        if (dist(centerOf(w), centerOf(t)) > radius + 0.85) continue;   // 按格心距离判定
        if (dr > (t.dr || 0)) t.dr = dr;
      }
    }
    return state;
  }

  /* ------------------------------------------------------------ 伤害结算 */
  /* 减伤公式：护甲越高减伤越多，但攻击力足够高时能打穿。与护甲量级无关的特性
   * 保证了「高攻单位打低甲高伤、低攻单位打高甲几乎无效」的直觉。
   * 目标若有防御塔光环（b.dr），先按百分比减伤再算护甲。 */
  function mitigate(atk, armor) {
    return atk * (1 - armor / (armor + 20));
  }

  /* 伤害结算：兵打建筑有额外折扣（否则便宜兵能轻松啃掉贵建筑，防守方毫无优势）。
   * 攻城类的兵对建筑伤害高，普通兵对建筑伤害低。 */
  /* 士兵对建筑的伤害倍率。
   * 拆建筑型（攻城兵 / 攻城飞艇 / 攻城车）拿 1.4 的高倍率，
   * 打兵型（步兵 / 弓箭手 / 飞龙 / 气球兵）拿 0.3~0.5 的低倍率。
   * 注意：攻城车改成拆建筑型之后，倍率也要跟着给它 1.4，
   *      否则「只拆建筑」的兵反而拆不动建筑（实测到的 bug）。 */
  function unitBuildingMul(u) {
    var m = { siege: 1.4, airship: 1.4, ram: 1.4, heavy: 0.5, infantry: 0.35,
              archer: 0.3, balloon: 0.5, dragon: 0.5 };
    return m[u.key] != null ? m[u.key] : 0.5;
  }

  function damageBuilding(state, b, atk, attacker) {
    var eff = atk * (1 - (b.dr || 0));
    if (attacker && attacker.kind === 'unit') eff *= unitBuildingMul(attacker);
    // 大本营不吃护甲减伤：否则「谁先摧毁对方大本营」这条核心胜负条件几乎打不出来
    var armor = b.def.isBase ? 0 : b.armor;
    b.hp -= mitigate(eff, armor);
    b.justDamaged = state.time;
    if (b.hp <= 0) {
      removeBuilding(state, b);
      return true;
    }
    return false;
  }

  function removeBuilding(state, b, opts) {
    opts = opts || {};
    b.refs.forEach(function (ref) {
      delete state.byRef[b.team][ref];
      var p = fromRef(ref);
      if (state.grid[p.r][p.c] === b) state.grid[p.r][p.c] = null;
    });
    var i = state.buildings.indexOf(b);
    if (i >= 0) state.buildings.splice(i, 1);
    if (b.def.isBase) {
      // 双方大本营可能在同一帧里一起被打掉（例如决胜时刻同时烧血）。
      // 这时以「先被记录的那一方为败者」，后面的不再覆盖，避免出现
      // 「winner 是红方、但红方大本营也已经没了」这种自相矛盾的结果。
      if (!state.over) {
        state.over = true;
        state.winner = OPP[b.team];
        state.loser = b.team;
        emit(state, 'gameover', { winner: state.winner, loser: b.team });
      } else {
        emit(state, 'destroy', { team: b.team, key: b.key, row: b.row, col: b.col });
      }
    } else {
      emit(state, 'destroy', { team: b.team, key: b.key, row: b.row, col: b.col });
    }
    rebuildFields(state);
    reloadNeighbors(state);     // 防御塔没了，别的建筑就失去减伤
  }

  function damageUnit(state, u, atk) {
    u.hp -= mitigate(atk, u.armor);
    u.justDamaged = state.time;
    if (u.hp <= 0) {
      var owner = OPP[u.team];
      state.stats[owner].kills++;
      var i = state.units.indexOf(u);
      if (i >= 0) state.units.splice(i, 1);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ 出兵 */
  function spawnUnit(state, team, unitKey, row, col) {
    var def = DATA.units[unitKey];
    if (!def) return null;
    if (unitsOf(state, team).length >= UNIT_CAP) return null;
    // 出生血量带上「士兵生命」总体升级的加成
    var unitHp = Math.round(def.hp * globalBonus(state, team).unitHp * boostOf(state, team, 'hp'));
    var u = {
      id: state.nextId++, kind: 'unit', team: team, def: def, key: unitKey,
      row: row, col: col, hp: unitHp, hpMax: unitHp, armor: def.armor,
      moveAcc: 0, moveProg: 0, nextStep: null, atkTimer: 0, justDamaged: 0, spawnOrder: state.nextId,
      targetBuilding: null, lastAttackAt: -99
    };
    state.units.push(u);
    state.stats[team].produced++;
    return u;
  }

  /* 待命区 +1（兵营产出的兵先进待命区，等玩家/电脑手动派上场） */
  function addReserve(state, team, unitKey, n) {
    n = n || 1;
    if (!state.reserve[team]) state.reserve[team] = {};
    var cur = state.reserve[team][unitKey] || 0;
    var room = RESERVE_CAP - reserveCount(state, team);
    if (room <= 0) return 0;
    var add = Math.min(n, room);
    state.reserve[team][unitKey] = cur + add;
    return add;
  }

  function reserveCount(state, team) {
    var t = 0, r = state.reserve[team] || {};
    Object.keys(r).forEach(function (k) { t += r[k]; });
    return t;
  }

  /* -------------------------------------------------- 派兵：士兵时间冷却制
   * 按你的要求（参考植物大战僵尸）：士兵不再由建筑训练、也没有待命区，
   * 而是每种兵各自有一个**冷却时间**（步兵 5 秒，越贵越久）。
   * 冷却好了 + 金币够 → 就能派一个；派完这个兵种重新开始冷却。
   * 地面兵从棋盘外的行A/行B 出场，空中兵同样从通道行出场。
   * ------------------------------------------------------------------------ */
  function channelRow(team) { return CHANNEL_ROW[team]; }

  /* 冷却是否已经走完（浮点累减会留下 1e-14 这种残渣，所以留一点容差） */
  function isUnitReady(state, team, unitKey) {
    return (state.unitCd[team][unitKey] || 0) <= 0.001;
  }

  function canDeploy(state, team, unitKey, col) {
    var def = DATA.units[unitKey];
    if (!def) return { ok: false, why: '未知兵种' };
    if (state.over) return { ok: false, why: '对局已结束' };
    if (col < 1 || col > COLS) return { ok: false, why: '列超出棋盘' };
    var cd = state.unitCd[team][unitKey] || 0;
    if (cd > 0.001) return { ok: false, why: def.name + ' 冷却中（还有 ' + cd.toFixed(1) + ' 秒）' };
    if (state.res[team] < def.cost) return { ok: false, why: '金币不足（需要 ' + def.cost + '）' };
    if (state.deployCd[team][col] > 0) return { ok: false, why: '该列刚派过兵，冷却中' };
    var at = state.units.filter(function (u) {
      return u.team === team && !rowInGrid(u.row) && u.col === col;
    }).length;
    if (at >= CHANNEL_CAP) return { ok: false, why: '该列通道已满（' + CHANNEL_CAP + '）' };
    return { ok: true };
  }

  function deployUnit(state, team, unitKey, col) {
    var chk = canDeploy(state, team, unitKey, col);
    if (!chk.ok) return chk;
    var def = DATA.units[unitKey];
    if (state.aiSpendDebug) state.aiSpendDebug.push({ t: Math.round(state.time*10)/10, fn: 'deploy', key: unitKey, cost: def.cost, res: Math.round(state.res[team]) });
    state.res[team] -= def.cost;
    state.stats[team].spent += def.cost;
    /* 冷却 = 兵种基础值 × 总体升级「派兵冷却」的缩减系数。
     * 满级 10 级时系数为 0 → 冷却直接归零（玩家要求）。
     * 仍然保留 state.deployCd[col]=0.4 的同列短冷却、通道容量上限和金币门槛，
     * 否则一列会被瞬间灌满（那不是"冷却归零"，那是刷兵）。 */
    var cdMul = globalBonus(state, team).deployCdMul;
    state.unitCd[team][unitKey] = def.deployCd * cdMul;   // 开始冷却
    state.deployCd[team][col] = 0.4;                      // 同一列短冷却，防止一格瞬间堆满
    var u = spawnUnit(state, team, unitKey, channelRow(team), col);
    if (!u) return { ok: false, why: '场上单位已达上限' };
    emit(state, 'deploy', { team: team, key: unitKey, col: col });
    return { ok: true, unit: u };
  }

  /* ------------------------------------------------------------ 法术系统
   * 随大本营等级逐级解锁：1 级箭雨、2 级火球、3 级火箭、4 级狂暴、5 级冰冻、6 级弱化。
   * 每个法术独立冷却；选中后点地图上的格子决定落点（范围以格为单位）。
   * 影响范围：以落点格为中心的半径内，所有格子的单位/建筑。
   *
   * ★ v14 平衡性调整：伤害法术对「士兵」和「建筑」分成两路 ★
   *   历史问题：castSpell 里 hit.units 和 hit.buildings 共用同一个 spell.dmg，
   *   于是「火箭 420」对一格兵和对一座大本营是同一个数 —— 而大本营血量是几千，
   *   砸家几乎不掉血，玩家却因为「看起来伤害很高」一直在砸家。
   *   现在：基准值 ×SPELL_UNIT_MUL 打兵、×SPELL_BUILD_MUL 打建筑，
   *   数值定义留在 DATA.spells[].dmg 里保持可读（基准值），乘数只在这两个常量。
   *   金矿走「建筑」这一路（-50%），但它只有 600 血，一发火箭仍能打掉 210，
   *   所以「用法术打后排金矿」依然是有效战术 —— 与玩家人设的意图一致。
   * ------------------------------------------------------------------------ */
  /* 对士兵：+20%。
   * 历史：初版是 1.0（与建筑同值）→ v14 拆两路时给到 1.5（+50%）→ 玩家实测觉得
   * 「对士兵伤害有点太高」，在此基础再降 20%（1.5 × 0.8 = 1.2）。
   * 建筑那一路（0.5）没有动。 */
  var SPELL_UNIT_MUL = 1.2;
  var SPELL_BUILD_MUL = 0.5;   // 对建筑（塔 / 大本营 / 金矿 / 其它）：-50%

  /* 某个伤害法术落在「士兵」/「建筑」身上的实际伤害（UI 提示与测试都从这里取） */
  function spellDamageOf(spell, kind) {
    if (!spell || !(spell.dmg > 0)) return 0;
    return spell.dmg * (kind === 'building' ? SPELL_BUILD_MUL : SPELL_UNIT_MUL);
  }

  function spellsAvailable(state, team) {
    var lv = baseLevelOf(state, team);
    return DATA.spells.filter(function (s) { return s.unlockBaseLevel <= lv; });
  }

  /* 单位此刻「占着哪几格」—— 法术命中判定专用（v18）
   *
   * ★ 修掉的真 bug：小火球/火箭打移动中的兵「好像没作用」★
   *   渲染层画的位置 = 当前格 + (nextStep − 当前格) × moveProg（index.html lerpPos），
   *   所以一个正在走的兵，**画面上已经滑到两格中间、甚至压住了下一格**；
   *   但逻辑层的 u.row/u.col 要等 moveProg 累计到 1 才更新。
   *   玩家照着画面点「火箭」（aoe=0，只有落点那一格），落点=nextStep，
   *   逻辑判的却是出发格 → 格距离 1 → 打空（实测 hits=0，目标血量一点没掉）。
   *   箭雨 aoe=2（5×5）范围大，怎么点都罩得住，所以感觉「只有范围大的法术有用」。
   *
   * 修法：把「出发格」和「正在进入的那一格」都算作占用格 ——
   *   这两格正是玩家在画面上看到的两个位置，不多给也不少给。
   *   只在真的在途中（moveProg > 0.02）时才算 nextStep，
   *   免得站着不动的兵被「下一格」白吃一发。
   */
  function unitCells(u) {
    var cells = [{ row: u.row, col: u.col }];
    if (u.nextStep && (u.moveProg || 0) > 0.02) {
      cells.push({ row: u.nextStep.r, col: u.nextStep.c });
    }
    return cells;
  }

  /* 落点范围内命中的目标（敌人或自己人，看法术的 affects） */
  function spellTargets(state, team, spell, row, col) {
    var foe = OPP[team];
    var wantTeam = spell.affects === 'ally' ? team : foe;
    var inRange = function (t) {
      // 法术范围是「正方形」：aoe = 允许的最大格距离（1×1→0，2×2→1，3×3→2）
      var d = gridDist({ row: t.row, col: t.col }, { row: row, col: col });
      return d <= (spell.aoe || 0) + 0.001;
    };
    var units = state.units.filter(function (u) {
      if (u.team !== wantTeam) return false;
      var cs = unitCells(u);                      // 出发格 + 正在进入的格
      for (var i = 0; i < cs.length; i++) if (inRange(cs[i])) return true;
      return false;
    });
    // 大本营也算「建筑」
    var builds = state.buildings.filter(function (b) { return b.team === wantTeam && inRange(b); });
    return { units: units, buildings: builds };
  }

  function canCastSpell(state, team, spellKey, row, col) {
    var spell = null;
    DATA.spells.forEach(function (s) { if (s.key === spellKey) spell = s; });
    if (!spell) return { ok: false, why: '未知法术' };
    if (state.over) return { ok: false, why: '对局已结束' };
    if (baseLevelOf(state, team) < spell.unlockBaseLevel)
      return { ok: false, why: '需要大本营 ' + spell.unlockBaseLevel + ' 级' };
    if ((state.spellCd[team][spellKey] || 0) > 0)
      return { ok: false, why: spell.name + ' 冷却中（还有 ' + state.spellCd[team][spellKey].toFixed(1) + ' 秒）' };
    if (!inGrid(row, col)) return { ok: false, why: '落点必须在棋盘内' };
    return { ok: true, spell: spell };
  }

  function castSpell(state, team, spellKey, row, col) {
    var chk = canCastSpell(state, team, spellKey, row, col);
    if (!chk.ok) return chk;
    var spell = chk.spell;
    if (state.aiSpendDebug) state.aiSpendDebug.push({ t: Math.round(state.time*10)/10, fn: 'spell', key: spellKey, cost: spell.cost || 0, res: Math.round(state.res[team]) });
    var hit = spellTargets(state, team, spell, row, col);
    var hits = 0;
    if (spell.dmg > 0) {
      // 分两路结算：建筑吃 -50%，士兵吃 +20%（见 SPELL_UNIT_MUL / SPELL_BUILD_MUL 注释）
      var dmgU = spellDamageOf(spell, 'unit');
      var dmgB = spellDamageOf(spell, 'building');
      hit.units.forEach(function (u) { damageUnit(state, u, dmgU); hits++; });
      hit.buildings.forEach(function (b) {
        /* ★ v16：防御塔 / 水晶塔 / 碉堡塔的光环（b.dr）现在也**减免法术伤害**。
         * 玩家要求「防御塔类也能帮周围建筑减伤法术」—— 原来法术是 b.hp -= dmg 直接扣，
         * 完全绕过 b.dr，于是光环对法术一点用都没有（物理攻击才吃）。
         * 减伤比例与物理攻击同一套（取范围内最强的那座塔，不叠加，见 reloadNeighbors）。 */
        b.hp -= dmgB * (1 - (b.dr || 0));
        b.justDamaged = state.time;      // 挨打了，重置自愈计时
        if (b.hp <= 0) removeBuilding(state, b);
        hits++;
      });
    }
    if (spell.frozen) {
      hit.units.forEach(function (u) { u.frozenUntil = state.time + spell.frozen; hits++; });
      hit.buildings.forEach(function (b) { b.frozenUntil = state.time + spell.frozen; hits++; });
    }
    if (spell.atkSpeedMul) {
      hit.units.forEach(function (u) { u.rageUntil = state.time + (spell.duration || 8); hits++; });
      hit.buildings.forEach(function (b) { b.rageUntil = state.time + (spell.duration || 8); hits++; });
    }
    if (spell.weakenMul) {
      hit.units.forEach(function (u) { u.weakenUntil = state.time + (spell.duration || 5); u.weakenMul = spell.weakenMul; hits++; });
      hit.buildings.forEach(function (b) { b.weakenUntil = state.time + (spell.duration || 5); b.weakenMul = spell.weakenMul; hits++; });
    }
    state.spellCd[team][spellKey] = spell.cooldown;
    state.events.push({
      type: 'spell', t: state.time, team: team, key: spell.key,
      row: row, col: col, hits: hits, radius: spell.aoe || 0
    });
    return { ok: true, spell: spell, hits: hits };
  }

  /* 给 UI 用：法术栏状态 */
  function spellStatus(state, team) {
    var lv = baseLevelOf(state, team);
    return DATA.spells.map(function (s) {
      return {
        key: s.key, name: s.name, glyph: s.glyph, color: s.color, desc: s.desc,
        radius: s.radius, cooldown: s.cooldown,
        /* 分路伤害：UI 不必自己算 1.5/0.5 */
        dmgUnit: spellDamageOf(s, 'unit'),
        dmgBuilding: spellDamageOf(s, 'building'),
        unlockBaseLevel: s.unlockBaseLevel,
        unlocked: lv >= s.unlockBaseLevel,
        cd: Math.max(0, state.spellCd[team][s.key] || 0),
        ready: lv >= s.unlockBaseLevel && (state.spellCd[team][s.key] || 0) <= 0
      };
    });
  }
  /* ---------------------------------------------------------- 目标选择 */
  /* 本单位「该打谁」：按 priority 分组（射程过滤交给 pickFromGroups）。
   *   siege → 只列敌方建筑，再大本营
   *   field → 只列敌兵（受对空限制），再大本营
   * 注意：这两组都不含「挡路的墙」—— 墙由 pickTarget 里的 blockedBy 单独处理。 */
  function candidateSets(state, u) {
    var enemy = OPP[u.team];
    var canHitAir = u.def.targets === 'both';
    var foeUnits = state.units.filter(function (o) {
      if (o.team !== enemy) return false;
      if (o.def.air && !canHitAir) return false;
      return true;
    });
    var foeBuildings = state.buildings.filter(function (b) { return b.team === enemy && !b.def.isBase; });
    var foeBase = enemyBase(state, u.team);
    if (u.def.priority === 'siege') {
      return { groups: [foeBuildings, [foeBase]] };
    }
    return { groups: [foeUnits, [foeBase]] };
  }

  /* 射程内、且属于自己该打的目标 —— 返回最近的一个 */
  function pickFromGroups(state, u, sets, from) {
    for (var g = 0; g < sets.groups.length; g++) {
      var list = sets.groups[g], best = null, bestScore = null;
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (!t || (t.hp !== undefined && t.hp <= 0)) continue;
        var cell = nearestCellOf(t, from);
        // 士兵的攻击范围 = 「上下左右四格」（曼哈顿距离），斜角打不到
        var d = cardinalDist(from, cell);
        if (d > unitReach(u.def) + 0.001) continue;
        var score = d * 1000 + t.hp * 0.001 + t.id * 1e-6; // 近的优先，其次血少的
        if (bestScore === null || score < bestScore) { bestScore = score; best = t; }
      }
      if (best) return best;
    }
    return null;
  }

  /* 目标选择：优先「挡在前进路上的那面墙」，其次打自己该打的目标。
   * 注意：**只有攻城类（siege）会拆墙** —— 按你的规格，步兵/重甲/弓箭手这类
   * "只打士兵和大本营"的兵遇到建筑就是被挡住，不会去拆它（拆墙是攻城兵的活）。 */
  function pickTarget(state, u) {
    var from = centerOf(u);
    if (u.blockedBy && u.def.priority === 'siege') {
      var wall = u.blockedBy;
      if (wall.hp > 0 && state.buildings.indexOf(wall) >= 0) {
        if (gridDist(from, nearestCellOf(wall, from)) <= unitReach(u.def) + 0.001) return wall;
      }
    }
    return pickFromGroups(state, u, candidateSets(state, u), from);
  }

  /* 「附近有没有要打的东西」——比射程宽 2 格。
   * 用途：满足「有目标才前进、没目标就停下」这条规则，同时不会让兵站在场中央发愣：
   * 附近没有敌人、建筑或大本营时就不再往前走，直接在原地待命。 */
  function hasTargetNear(state, u, pad) {
    pad = pad == null ? 2 : pad;
    var enemy = OPP[u.team];
    var canHitAir = u.def.targets === 'both';
    var from = centerOf(u);
    var reach = unitReach(u.def) + pad;
    var inR = function (t) { return gridDist(from, nearestCellOf(t, from)) <= reach + 0.001; };
    var foes = state.units.filter(function (o) {
      if (o.team !== enemy) return false;
      if (o.def.air && !canHitAir) return false;
      return inR(o);
    });
    if (foes.length) return true;
    var builds = state.buildings.filter(function (b) {
      if (b.team !== enemy) return false;
      if (b.def.isBase && u.def.priority !== 'siege' && u.def.priority !== 'field') return false;
      return inR(b);
    });
    return builds.length > 0;
  }

  /* 「贴着敌方大本营的那一行」（打击行）与「这一行上能不能直接打到它」 */
  function strikeRowOf(team) {
    var goal = BASE_RECT[OPP[team]];
    var step = DIR[team];
    return (step > 0 ? goal.r2 : goal.r1) + step;
  }
  function adjacentToBaseOf(team, r, c) {
    var goal = BASE_RECT[OPP[team]];
    if (r !== strikeRowOf(team)) return false;
    return c >= goal.c1 - 1 && c <= goal.c2 + 1;
  }

  /* 「贴着本单位、射程内的敌方建筑」——空中拆建筑兵用它决定什么时候停下拆楼 */
  function adjacentWallOf(state, u) {
    var enemy = OPP[u.team];
    var from = { row: u.row, col: u.col };
    var best = null, bestD = null;
    state.buildings.forEach(function (b) {
      if (b.team !== enemy || b.def.isBase) return;
      var d = cardinalDist(from, nearestCellOf(b, from));
      if (d > unitReach(u.def) + 0.001) return;
      if (bestD === null || d < bestD) { bestD = d; best = b; }
    });
    return best;
  }

  /* 「进入棋盘的第一行」：通道行往场内走一格（红方 0→1，蓝方 11→10） */
  function entryRowOf(team) { return CHANNEL_ROW[team] - DIR[team]; }

  /* ------------------------------------------------------------------ 移动唯一入口
   * 地面兵的所有位移都必须经过这里。
   * 铁律：建筑不能踩进去 —— **但有一条例外**：
   *
   *   ★ 进场行（蓝行10 / 红行1）允许穿过 ★
   *
   * 为什么必须开这个例外：
   *   · 玩家的初衷就是要在自己半场自由布局，包括进场行
   *   · 而进场行是地面兵唯一的入口。如果它被盖满就视为"不可通行"，
   *     路线图会整片断开，所有地面兵永久锁在通道里（实测到的死锁）
   *   · 唯一自洽的解法：进场行当成"己方的通道"——兵可以从中穿过，
   *     但不会停在那里（一进场就继续往场内走）
   *
   * 返回 true = 真的移动了。 */
  function inEntryRow(team, r) { return r === entryRowOf(team); }

  function stepTo(state, u, toRow, toCol) {
    if (toRow === u.row && toCol === u.col) return false;
    if (rowInGrid(toRow)) {
      var b = state.grid[toRow][toCol];
      // 进场行上的建筑：只允许「地面兵穿过」，其他建筑一律拒绝
      if (b && !(u.def && !u.def.air && inEntryRow(u.team, toRow))) return false;
      if (isBaseCell(BASE_RECT[OPP[u.team]], toRow, toCol)) return false;   // 敌方大本营
    } else if (toRow !== CHANNEL_ROW[u.team]) {
      return false;                                               // 棋盘外只允许自己的通道行
    }
    if (toCol < 1 || toCol > COLS) return false;
    u.row = toRow; u.col = toCol;
    return true;
  }

  /* 某个兵站在 (r,c) 时，正前方那一格是不是敌方建筑（＝要拆的墙）。
   * 方向必须用 DIR[team]（红方 -1 → 往行号减小…… 等等：红方的 DIR 表示"朝敌方推进"，
   * 但红方在行0、大本营在行9，所以红方实际是往行号【增大】走。
   * 统一用 computeField 里的约定：向前 = r + DIR[team]。 */
  function wallAheadOf(state, u, r, c) {
    if (!rowInGrid(r)) return null;
    var ahead = r + DIR[u.team];
    if (!rowInGrid(ahead)) return null;
    return wallAtTeam(state, u.team, ahead, c);
  }

  /* 「有没有该打的目标在射程内」—— 决定这个兵该停下还是继续推进 */
  function hasAnyTarget(state, u) {
    if (pickTarget(state, u)) return true;
    if (u.blockedBy && u.def.priority === 'siege' && u.blockedBy.hp > 0 &&
        state.buildings.indexOf(u.blockedBy) >= 0) {
      var d = gridDist(centerOf(u), nearestCellOf(u.blockedBy, centerOf(u)));
      if (d <= unitReach(u.def) + 0.001) return true;
    }
    return false;
  }

  /* 有没有「除大本营之外」的目标（敌方士兵或建筑）在射程内。
   * 用途：决定通道行上的兵要不要真的进场 —— 按玩家规则，对面没目标就在行A/行B 屯兵，
   * 否则所有兵都会无脑冲去啃大本营，行A/行B 永远空着。 */
  function hasNonBaseTarget(state, u) {
    var enemy = OPP[u.team];
    var canHitAir = u.def.targets === 'both';
    var from = centerOf(u);
    var inR = function (t) { return gridDist(from, nearestCellOf(t, from)) <= unitReach(u.def) + 0.001; };
    var foes = state.units.filter(function (o) {
      if (o.team !== enemy) return false;
      if (o.def.air && !canHitAir) return false;
      return inR(o);
    });
    if (foes.length) return true;
    if (u.def.priority === 'siege') {
      var walls = state.buildings.filter(function (b) {
        return b.team === enemy && !b.def.isBase && inR(b);
      });
      if (walls.length) return true;
    }
    return false;
  }

  /* 攻城兵 / 被墙挡住的兵：优先打「挡在前进路上的那面墙」，其次打自己该打的目标。
   * （实现见上面的 pickTarget / hasAnyTarget，此处不再重复定义。） */

  /* 一个建筑的「战斗数值」：普通塔走等级/分支表；
   * 大本营的防御力定义为「同级别法师塔的伤害 + 2 格（5×5）的射程」。 */
  function combatStatsOf(b) {
    if (b.def && b.def.isBase) {
      var m = statsForLevel(DATA.buildings.mage, b.level || 1);
      return { atk: m.atk, atkInterval: m.atkInterval,
               range: DATA.baseDefenseRange,   // 4×4
               targets: 'both', mode: 'single', maxTargets: 0, lineLen: 0, splash: 0 };
    }
    return statsForLevel(b.def, b.level || 1, b.branch);
  }

  /* 塔的候选目标（射程内、且对空/对地允许） */
  function towerCandidates(state, b) {
    var enemy = OPP[b.team];
    var from = { row: b.row, col: b.col };   // 用塔自己的格子（大本营 2×2 的中心点在 9.5 行，不好算距离）
    var st = combatStatsOf(b);
    var range = st.range || 1;
    return state.units.filter(function (o) {
      if (o.team !== enemy) return false;
      if (st.targets === 'air' && !o.def.air) return false;
      if (st.targets === 'ground' && o.def.air) return false;
      // 用「目标离塔最近的那一格」判距离：大本营 2×2，体积大也该更好打，
      // 不能因为中心点在 9.5 行就把它旁边贴脸的单位算成 1.5 格。
      return gridDist(from, nearestCellOf(o, from)) <= range + 0.001;
    });
  }

  /* 按攻击模式结算「这一次攻击打到了谁」。
   *   single     ：一个目标
   *   multi3     ：最多 3 个目标（大电塔）
   *   group      ：群攻 —— 打到目标所在格子里的所有敌人（迫击炮/特斯拉）
   *   line       ：白魔法塔 —— 沿攻击方向贯穿 3 格
   *   allInRange ：脉冲塔 —— 射程内所有敌人
   */
  /* ---------------------------------------------------------------- 电磁波（脉冲塔）
   * 玩家要求：不是「一次打中范围内所有人」，而是从塔顶向外扩散的一圈波，
   * 敌人被波前**碰到**才受伤。
   *
   * 实现关键：用 prevR / radius 卡出一层「薄环」，只有落在这层环里的单位才吃伤害。
   *   · 波前扫过的敌人不会补伤（站得巧就躲得掉）
   *   · 波过去之后才走进来的敌人也不会补伤
   * 这比"瞬间全屏伤害"更讲站位，也让画面和伤害真的对得上。 */
  var WAVE_SPEED = 6.0;         // 格/秒；射程 2 格时约 0.42 秒扫完

  function spawnWave(state, b, st, atk, pst) {
    if (!state.waves) state.waves = [];
    var c = centerOf(b);
    state.waves.push({
      id: state.nextId++, team: b.team, fromId: b.id,
      row: c.row, col: c.col,
      radius: 0, prevR: 0,
      maxR: (st.range || 1) + 0.55,
      speed: WAVE_SPEED, atk: atk, born: state.time,
      color: (pst && pst.color) || '#8ff0e0',
      hit: {}                     // 已被这圈波扫过的单位
    });
  }

  function updateWaves(state, dt) {
    if (!state.waves || !state.waves.length) return;
    for (var i = state.waves.length - 1; i >= 0; i--) {
      var w = state.waves[i];
      w.prevR = w.radius;
      w.radius = Math.min(w.maxR, w.radius + w.speed * dt);
      var lo = w.prevR, hi = w.radius;
      /* 倒序遍历：damageUnit 会把单位从 state.units 里删掉，正序会漏检 */
      for (var j = state.units.length - 1; j >= 0; j--) {
        var u = state.units[j];
        if (u.team === w.team || u.hp <= 0) continue;
        if (w.hit[u.id]) continue;
        var wdr = u.row - w.row, wdc = u.col - w.col;
        var wd = Math.sqrt(wdr * wdr + wdc * wdc);
        if (wd > lo && wd <= hi) { w.hit[u.id] = 1; damageUnit(state, u, w.atk); }
      }
      if (w.radius >= w.maxR) state.waves.splice(i, 1);
    }
  }

  function towerHitList(state, b, st, primary) {
    var from = centerOf(b);
    var cands = towerCandidates(state, b);
    var mode = st.mode || 'single';
    /* 波状攻击不产生"直接命中"：伤害由扩散的波前在 updateWaves 里结算 */
    if (mode === 'wave') return [];
    if (mode === 'allInRange') return cands;
    if (mode === 'multi3') {
      /* 锁定目标必须排第一（也必然在名单里）—— 否则「射程内最近的 3 个」会把它挤掉，
       * 等于大电塔完全无视锁定规则。其余目标按距离补齐。 */
      var rest = cands.filter(function (o) { return o !== primary; })
        .sort(function (x, y) { return dist(from, centerOf(x)) - dist(from, centerOf(y)); });
      return [primary].concat(rest).slice(0, st.maxTargets || 3);
    }
    if (mode === 'group' || mode === 'line') {
      var list = [];
      var fr = Math.round(from.row), fc = Math.round(from.col);
      if (mode === 'group') {
        // 群攻：同一格子里的敌人全都挨打；另外按「格距离」给周围一圈溅射
        var splash = st.splash || 0;
        cands.forEach(function (o) {
          if (o.row === primary.row && o.col === primary.col) { list.push(o); return; }
          /* 溅射用**格距离**（切比雪夫），不是欧氏距离：
           * 欧氏下斜角是 1.414，splash=1 会漏掉四个斜方向，
           * 看起来像"3×3 只打了十字"。 */
          if (splash > 0 && gridDist({ row: o.row, col: o.col },
                                     { row: primary.row, col: primary.col }) <= splash) list.push(o);
        });
      } else {
        // 直线贯穿：从塔出发、朝目标方向连续的 3 格
        var dr = Math.sign(primary.row - fr), dc = Math.sign(primary.col - fc);
        if (dr === 0 && dc === 0) dc = 1;
        if (dr !== 0 && dc !== 0) { if (Math.abs(primary.row - fr) >= Math.abs(primary.col - fc)) dc = 0; else dr = 0; }
        var steps = st.lineLen || 3;
        for (var s = 1; s <= steps; s++) {
          var rr = fr + dr * s, cc = fc + dc * s;
          cands.forEach(function (o) { if (o.row === rr && o.col === cc) list.push(o); });
        }
      }
      if (list.indexOf(primary) < 0) list.push(primary);
      return list;
    }
    return [primary];
  }

  /* ---------------------------------------------------------- 建筑索敌（锁定）
   * 玩家要求：建筑/大本营**锁住第一个进入射程的敌人**之后，只要它还活着、还在射程内，
   * 就一直打它；不许「打到一半换人」。
   *
   * 旧实现每帧都挑「最近的敌人」（score = 距离优先）→ 两个后果：
   *   ① 炮口在两个敌人之间来回跳（渲染层每帧拿到的 aim 目标不同）；
   *   ② 伤害被摊薄：两个残血兵交错走位，塔每发都打「此刻最近的」，
   *      结果两边都打成半血，谁也打不死（玩家看到的"东打一下西打一下"）。
   *
   * 锁存在 `b.targetId` 上，**只有两种情况会解锁**：
   *   ① 目标死亡（或已从 state.units 移除）；
   *   ② 目标离开射程（含对空/对地类型不再可打）。
   * 解锁的同一帧立刻挑最近的补上，不会出现"空窗一帧不打"。
   *
   * 注意：本函数每帧都会被调用（渲染层靠它算炮口朝向），
   * 所以「第一个进入射程」的分辨率就是 1 帧（1/20 秒），足够细。 */
  function pickTowerTarget(state, b) {
    var cands = towerCandidates(state, b);
    // ① 锁定还成立吗
    if (b.targetId) {
      for (var k = 0; k < cands.length; k++) {
        if (cands[k].id === b.targetId) return cands[k];
      }
      b.targetId = 0;                 // 死了 / 走远了 / 变成打不到的类型 → 解锁
    }
    // ② 没锁定：挑最近的，并立刻锁住
    var from = centerOf(b);
    var best = null, bestScore = null;
    for (var i = 0; i < cands.length; i++) {
      var u = cands[i];
      var score = dist(from, centerOf(u)) * 1000 + u.hp * 0.001 + u.id * 1e-6;
      if (bestScore === null || score < bestScore) { bestScore = score; best = u; }
    }
    b.targetId = best ? best.id : 0;
    return best;
  }

  /* 被冰冻：冻结期间不能移动、不能攻击。
   * 冰冻法术的时长写在法术的 frozen 字段里（4 秒），统一用 frozenUntil 判定。 */
  function isFrozen(state, e) {
    return !!(e && e.frozenUntil && state.time < e.frozenUntil);
  }

  /* ================================ 平滑移动 ================================
   * 地面兵/空中兵的位移统一走这里，保证「速度均匀」。
   *
   * 以前的做法：moveAcc 攒满 1 格才 commit 一次位移 → 视觉上「走一格停一下」。
   * 现在的做法：
   *   · 目标格一旦确定就记在 u.nextStep 上
   *   · moveProg 表示「走到 nextStep 的进度」（0~1），每 tick 按速度均匀累加
   *   · 进度满 1 才真正把 u.row/u.col 改成 nextStep，然后归零继续下一格
   *   · 渲染层用 u.row/u.col + u.nextStep + moveProg 做亚格插值
   *     → 视觉上是匀速滑过去的，不再有停顿感
   *
   * 返回：'moving' = 正在途中（本 tick 没跨格）
   *       'moved'  = 本 tick 跨了一格
   *       'blocked'= 目标格走不进去（已清空进度）
   * ========================================================================= */
  function smoothMove(state, u, target) {
    if (!target) { u.moveProg = 0; u.nextStep = null; u.stepDir = null; return 'idle'; }
    if (!u.nextStep || u.nextStep.r !== target.r || u.nextStep.c !== target.c) {
      u.nextStep = { r: target.r, c: target.c };
    }
    u.stepDir = { r: target.r - u.row, c: target.c - u.col };   // 记住方向，跨格后沿用
    u.moveProg = (u.moveProg || 0) + u.def.speed * DT;
    u.moveAcc = u.moveProg;
    if (u.moveProg >= 1) {
      if (!stepTo(state, u, target.r, target.c)) {
        u.moveProg = 0; u.moveAcc = 0; u.nextStep = null; u.stepDir = null;
        return 'blocked';
      }
      u.moveProg -= 1;
      u.moveAcc = u.moveProg;
      /* ★ 跨格后立刻沿用同一方向，把 nextStep 指向「新格的下一格」★
       * 否则跨格那一 tick 渲染位置会吸附回整格（画面上顿一下）。
       * 如果下一格不可走（要转向/停了），就清空，下一 tick 重新算。 */
      if (u.moveProg > 0.0001 && u.stepDir) {
        var nr = u.row + u.stepDir.r, nc = u.col + u.stepDir.c;
        var canGo = true;
        if (!rowInGrid(nr)) { canGo = (nr === CHANNEL_ROW[u.team]); }
        else { canGo = !state.grid[nr][nc]; }
        if (canGo && nc >= 1 && nc <= COLS) {
          u.nextStep = { r: nr, c: nc };
        } else {
          u.nextStep = null; u.stepDir = null;
        }
      } else {
        u.moveProg = 0; u.nextStep = null; u.stepDir = null;
      }
      return 'moved';
    }
    return 'moving';
  }
  /* ------------------------------------------------------------ 单位移动 */
  /* 返回 {type:'move'|'attack'|'enter'|'blocked', ...} —— 便于渲染层做动画/特效 */
  function stepUnit(state, u) {
    // 被冰冻 → 完全不能动（也不能攻击，攻击那边也会再挡一次）
    if (isFrozen(state, u)) return { type: 'frozen', reason: '被冰冻，无法行动' };
    var team = u.team, dirRow = DIR[team];
    var field = fieldFor(state, u);   // 打兵型 / 拆建筑型 各走各的路线图
    var inChannel = !rowInGrid(u.row);

    /* ============================================================================
     * 空中单位的移动（玩家要求：**飞行部队无视建筑**）
     *
     * 三条规则，按优先级：
     *   ① 射程内有目标 → 停下开打
     *   ② 拆建筑型（攻城飞艇）旁边有敌方建筑 → 停下拆
     *   ③ 否则一路飞向敌方大本营
     *
     * 关键设计（这轮返工重写的核心）：
     *   · **飞越** 建筑 = 允许。空中兵经过建筑格不减速、不改道。
     *   · **停留** 在建筑格 = 不允许。落脚点必须是空格，否则继续往前飞。
     *   · **绝不跳格**。每帧最多前进 1 格（横 1 或纵 1），渲染层看到的是连续移动。
     *
     * 怎么同时做到「飞越」和「不跳格」：
     *   每帧算出「理想前进方向」后，只走 **1 格**；
     *   如果那 1 格是建筑，就照走（这就是飞越），但**标记为"未落地"**；
     *   下一帧继续沿同一方向走，直到踩到空格才算真正停下。
     *   "未落地"状态记在 u.airPass 上，保证方向和目标不被中途改掉。
     * ========================================================================== */
    if (u.def.air) {
      u.blockedBy = null;
      var airGoal = BASE_RECT[OPP[team]];
      var myRectA = BASE_RECT[team];

      // ① 射程内有目标就停下开打
      if (hasAnyTarget(state, u)) { u.airPass = null; return { type: 'attack', reason: '有目标，停下开打' }; }
      // ② 拆建筑型的空中兵：旁边有敌方建筑就停下拆
      if (u.def.priority === 'siege') {
        var adjWallA = adjacentWallOf(state, u);
        if (adjWallA) { u.airPass = null; u.blockedBy = adjWallA; return { type: 'attack', reason: '拆建筑' }; }
      }
      // ③ 已经贴到敌方大本营（上下左右 1 格）→ 停下打
      var adjBaseA = rowInGrid(u.row) && (
        (u.row === airGoal.r1 - 1 && u.col >= airGoal.c1 && u.col <= airGoal.c2) ||
        (u.row === airGoal.r2 + 1 && u.col >= airGoal.c1 && u.col <= airGoal.c2) ||
        (u.col === airGoal.c1 - 1 && u.row >= airGoal.r1 && u.row <= airGoal.r2) ||
        (u.col === airGoal.c2 + 1 && u.row >= airGoal.r1 && u.row <= airGoal.r2));
      if (adjBaseA) { u.airPass = null; return { type: 'attack', reason: '抵达大本营，开打' }; }

      var isBuildingCellA = function (r, c) {
        if (!rowInGrid(r) || c < 1 || c > COLS) return true;
        if (state.grid[r][c]) return true;
        return isBaseCell(myRectA, r, c) || isBaseCell(airGoal, r, c);
      };

      /* 计算本帧要走的「1 格方向」。返回 {r,c} 或 null。 */
      var stepDir = function () {
        /* 还在通道（棋盘外）→ 直接向前进场。
         * 关键：空中兵**不做横向找空列**。
         * 以前为了让空中兵避开进场行上的建筑，会先在 B 行左右横移去找空列，
         * 玩家看到的就是"在 B 行左右瞬移/来回跳"。空中兵本来就能飞越建筑，
         * 所以正确做法是：**就在本列正上方进场**，一路飞过去。 */
        if (!rowInGrid(u.row)) {
          return { r: entryRowOf(team), c: u.col };
        }
        /* ★ 空中寻路（本轮返工重写）：**先沿本列纵向前进，进敌方半场后才阶梯式微调** ★
         *
         * 用户报的 bug（老实现）：先把列对齐到 c5/c6，再纵向飞。
         *   后果一：蓝方 c1 出兵的空中兵，会在 **r10（正是自家大本营所在行）**横移 4 格到 c5，
         *           玩家看到的就是「飞到大本营下面、又横着飞回派兵区」。
         *   后果二：它此后的航路永远只有 5/6 两列 —— c1~c4、c7~c10 这 8 列上的
         *           敌方建筑永远不在它的航路上，攻城飞艇（拆建筑型）对那些列的建筑
         *           完全无能为力（实测 dev/_diag_air.js 基线：五列出兵，本列建筑命中 0/5）。
         *
         * 新规则（三步，按优先级）：
         *   ① **还没进敌方半场 → 只纵向前进**，一格横移都不许
         *      （尤其不许沿自家大本营所在行横移）。这一段它正好飞过本列全程，
         *      射程内的敌方建筑 / 敌兵由上面已有的 hasAnyTarget / adjacentWallOf 接管，
         *      就地停下开打 —— 判据一个字没改。
         *   ② **进了敌方半场但还没对齐 → 阶梯式逼近**：连续横移最多 2 格就必须插一步纵向前进。
         *      不允许一口气横移 4~5 格（长距离平移在敌人火力下等于白送）。
         *   ③ 对齐了 → 纵向前进到攻击行。
         * 三条铁律不变：每帧最多 1 格（不跳格）、可以飞越建筑、不会停在建筑/大本营格上。 */
        var wantRow = (airGoal.r1 > u.row) ? airGoal.r1 - 1 : airGoal.r2 + 1;
        var fwd = (u.row === wantRow) ? 0 : (wantRow > u.row ? 1 : -1);
        var wantCol = Math.min(Math.max(u.col, airGoal.c1), airGoal.c2);
        var latDir = (u.col < wantCol) ? 1 : (u.col > wantCol ? -1 : 0);
        var foeHalf = HALF[OPP[team]];          // 敌方半场行区间：蓝→[1,5]，红→[6,10]
        var inFoeHalf = (u.row >= foeHalf[0] && u.row <= foeHalf[1]);
        var latRun = u.airLatRun || 0;          // 已经连续横移了几格（跨帧记在单位上）
        if (!inFoeHalf) {
          /* ① 自家半场：只纵向前进，绝不横移（这就是「别在大本营下面横着飞」） */
          if (fwd !== 0) return { r: u.row + fwd, c: u.col };
          return null;
        }
        /* ②③ 敌方半场：阶梯式逼近 —— 横移最多连 2 格，然后必须走一步纵向 */
        if (latDir !== 0 && (fwd === 0 || latRun < 2)) return { r: u.row, c: u.col + latDir };
        if (fwd !== 0) return { r: u.row + fwd, c: u.col };
        if (latDir !== 0) return { r: u.row, c: u.col + latDir };
        return null;
      };

      var d1 = stepDir();
      if (!d1) { u.airPass = null; return { type: 'wait', reason: '已在攻击位' }; }
      // 越界保护
      if (d1.c < 1 || d1.c > COLS) { u.airPass = null; return { type: 'wait', reason: '飞到边界' }; }
      if (d1.r < 0 || d1.r > ROWS + 1) { u.airPass = null; return { type: 'wait', reason: '飞到边界' }; }
      // 不能飞进敌方大本营那一格（那是要打的，不是要站的）
      if (rowInGrid(d1.r) && isBaseCell(airGoal, d1.r, d1.c)) {
        u.airPass = null;
        return { type: 'wait', reason: '大本营就在眼前' };
      }

      // 空中兵同样走平滑移动（直接改 u.row/u.col，不经过 stepTo —— 它无视建筑）
      if (!u.nextStep || u.nextStep.r !== d1.r || u.nextStep.c !== d1.c) {
        u.nextStep = { r: d1.r, c: d1.c };
      }
      u.moveProg = (u.moveProg || 0) + u.def.speed * DT;
      u.moveAcc = u.moveProg;
      if (u.moveProg >= 1) {
        u.moveProg -= 1;
        u.moveAcc = u.moveProg;
        /* 「连续横移了几格」：横移 +1、纵向前进清零。
         * 这是上面 ② 阶梯式逼近的判据（横移连 2 格就必须插一步纵向）。 */
        if (d1.c !== u.col) u.airLatRun = (u.airLatRun || 0) + 1;
        else u.airLatRun = 0;
        u.row = d1.r; u.col = d1.c;            // ★ 每次只前进 1 格，绝不跳格
        return { type: rowInGrid(u.row) ? 'move' : 'enter', row: u.row, col: u.col };
      }
      return { type: 'move', row: u.row, col: u.col, moving: true };
    }


    // 2) 地面兵统一走这里（棋盘内 / 通道行都用同一套路线图，四向绕行）
    //    规则（按玩家要求）：
    //      · 目标是敌方大本营 → 朝它走，路线由 BFS 实时算，建筑一放就自动改道
    //      · 半路遇到能打的敌兵（在射程内）→ 停下对峙
    //      · 被建筑挡住但还有路能绕到大本营 → 绕过去（左拐右拐、前进后退都允许）
    //      · 真的被彻底堵死（到不了大本营）→ 停下
    //      · 攻城兵例外：它把敌方建筑当目标，会上去拆
    u.blockedBy = null;
    if (hasAnyTarget(state, u)) return { type: 'attack', reason: '有目标，停下开打' };
    var cellDist = (rowInGrid(u.row) && field.dist[u.row]) ? field.dist[u.row][u.col] : 1e9;

    /* 兜底自救（放在「被堵死」判定之前，否则走不到这里）：
     *
     * 这里要处理两种情况：
     *  A. 单位出生在己方建筑格里（兵本来就能和建筑重叠）→ 必须能走出去
     *  B. 单位在通道行（行11/行0）但路线图整片断开 → 必须能横向找到能进场的列
     *     （否则玩家把自己家进场行封死时，兵会永远卡在通道里 —— 实测到的 bug）
     *
     * 注意方向稳定性：一旦选定一个脱困方向，**同一格上连续多次必须选同一方向**，
     * 否则两个方案来回比较会形成「左右反复跳」（实测到的 bug）。
     * 做法：把「候选方向」按固定顺序（先朝敌方，再横移）排好，取第一个可行即可。 */
    var inChannelNow = !rowInGrid(u.row);
    if (cellDist >= 1e9) {
      var esc2 = null;
      /* 在通道里：优先找「本列能不能进」→ 不能就左右找最近的能进场列（只走 1 格）。
       * 用固定的偏向（先左后右、距离近优先），保证每次算出来的方向一样。 */
      if (inChannelNow) {
        // 本列的进场格能不能走？
        var entR = entryRowOf(team);
        var canEnterCol = function (c) {
          if (c < 1 || c > COLS) return false;
          if (state.grid[entR][c]) return false;
          if (isBaseCell(BASE_RECT[team], entR, c)) return false;
          if (isBaseCell(BASE_RECT[OPP[team]], entR, c)) return false;
          return field.dist[entR][c] < 1e9;
        };
        if (canEnterCol(u.col)) {
          // 理论上不会走到这里（能进就有 dist），但保险起见
          esc2 = { r: entR, c: u.col };
        } else {
          var bestC = null, bestD = 999;
          for (var dc = 1; dc <= COLS; dc++) {
            // 先查左边再查右边，同距离取左（保证方向稳定）
            var cl = u.col - dc, cr = u.col + dc;
            if (cl >= 1 && canEnterCol(cl) && dc < bestD) { bestD = dc; bestC = cl; }
            if (bestC === null && cr <= COLS && canEnterCol(cr) && dc < bestD) { bestD = dc; bestC = cr; }
          }
          if (bestC !== null) esc2 = { r: u.row, c: u.col + (bestC > u.col ? 1 : -1) };
        }
      } else {
        // 在棋盘内但这一格不可达 → 找有方向的邻格（固定顺序：朝敌方优先）
        var dirs4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        var toward = DIR[team] > 0 ? -1 : 1;   // 蓝方向上、红方向下
        var ordered = [
          [toward, 0], [0, -1], [0, 1], [-toward, 0]
        ];
        for (var ei = 0; ei < ordered.length; ei++) {
          var er = u.row + ordered[ei][0], ec = u.col + ordered[ei][1];
          if (!rowInGrid(er) || ec < 1 || ec > COLS) continue;
          var eb = state.grid[er][ec];
          if (eb && eb.team !== team && u.def.priority !== 'siege') continue;
          if (!field.dir[er] || !field.dir[er][ec]) continue;
          if (field.dist[er][ec] >= 1e9) continue;
          esc2 = { r: er, c: ec };
          break;
        }
      }
      if (esc2) {
        var rEsc = smoothMove(state, u, esc2);
        if (rEsc === 'blocked') return { type: 'blocked', reason: '脱困失败' };
        return { type: 'move', row: u.row, col: u.col, reason: '脱困' };
      }
    }

    // 彻底被堵死（这一格对大本营来说不可达）
    if (rowInGrid(u.row) && cellDist >= 1e9) {
      var wAhead = wallAheadOf(state, u, u.row, u.col);
      u.blockedBy = wAhead || null;
      if (wAhead && u.def.priority === 'siege') return { type: 'attack', reason: '拆墙' };
      return { type: 'blocked', reason: '被建筑彻底挡住，到不了敌方大本营' };
    }
    /* ★ 通道行（行B / 行A）的横向换列 ★
     * 玩家把自家入口附近整排盖满时，路线图会整片断开。
     * 这时兵不能呆在原地干等（实测：会站一整局），要沿通道左右移动，
     * 找到一个「进场格是空的」的列再进场。
     * 方向规则：**先查左边一格，再查右边一格** —— 顺序固定，
     * 保证同一个兵的决策稳定，不会左右反复跳（实测过这种 bug）。 */
    if (!rowInGrid(u.row)) {
      var entRow2 = entryRowOf(team);
      /* 这一列能不能进场：
       *   · 空的 → 能
       *   · 己方进场行上的建筑 → 也能（地面兵可以穿过去，玩家要在这行自由布局）
       *   · 双方大本营格 / 其它建筑 → 不能 */
      var colOk2 = function (c) {
        if (c < 1 || c > COLS) return false;
        if (!rowInGrid(entRow2)) return false;
        if (isBaseCell(BASE_RECT[team], entRow2, c)) return false;
        if (isBaseCell(BASE_RECT[OPP[team]], entRow2, c)) return false;
        var b = state.grid[entRow2][c];
        if (!b) return true;
        return (b.team === team);   // 己方建筑（进场行）可以穿
      };
      if (!colOk2(u.col)) {
        var nx2 = null;
        if (colOk2(u.col - 1)) nx2 = u.col - 1;
        else if (colOk2(u.col + 1)) nx2 = u.col + 1;
        if (nx2 === null) return { type: 'wait', reason: '整行入口都被建筑堵住' };
        var rLane = smoothMove(state, u, { r: u.row, c: nx2 });
        if (rLane === 'blocked') return { type: 'wait', reason: '通道横移受阻' };
        return { type: 'move', row: u.row, col: u.col, reason: '通道内换列' };
      }
      // 本列可进 → 直接进场
      var rIn = smoothMove(state, u, { r: entRow2, c: u.col });
      if (rIn === 'blocked') return { type: 'wait', reason: '进场受阻' };
      if (rIn === 'moved') return { type: 'enter', row: u.row, col: u.col };
      return { type: 'move', row: u.row, col: u.col };
    }
    var ct = (field.dir[u.row] && field.dir[u.row][u.col]) || null;
    // 路线图指向敌方建筑（只可能是攻城兵：他把建筑当目标）
    if (ct && wallAtTeam(state, team, ct.r, ct.c)) {
      u.blockedBy = wallAtTeam(state, team, ct.r, ct.c);
      if (u.def.priority === 'siege') return { type: 'attack', reason: '拆墙' };
      return { type: 'blocked', building: u.blockedBy };
    }
    if (!ct) {
      // 没有下一步：要么已经贴着大本营（能打就打），要么真的没路
      if (hasNonBaseTarget(state, u)) return { type: 'attack', reason: '原地开打' };
      var wNear = wallAheadOf(state, u, u.row, u.col);
      if (wNear && u.def.priority === 'siege') { u.blockedBy = wNear; return { type: 'attack', reason: '拆墙' }; }
      /* 兜底自救：单位有可能出生在「己方大本营那一格」上（单位本来就能和建筑重叠），
       * 而大本营格在路线图里是没有方向的 —— 这时它会永远站着不动（实测到的 bug）。
       * 自救规则：只要能走到一个「有方向的邻格」就走出去。
       *   · 邻格是敌方建筑 → 只有拆建筑型能站上去（打兵型不行）
       *   · 邻格是己方建筑 → 一律放行（自己的兵本来就该能走自己家）
       *   · 然后检查那一格在路线图里有没有方向，有就说明有出路。 */
      var esc = null;
      var dirs4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (var ei = 0; ei < dirs4.length; ei++) {
        var er = u.row + dirs4[ei][0], ec = u.col + dirs4[ei][1];
        if (!rowInGrid(er) || ec < 1 || ec > COLS) continue;
        var eb = state.grid[er][ec];
        if (eb && eb.team !== team && u.def.priority !== 'siege') continue;   // 打兵型不能站敌建筑
        if (!field.dir[er] || !field.dir[er][ec]) continue;                   // 那一格也没方向 → 死路
        if (field.dist[er][ec] >= 1e9) continue;
        // 优先往敌方方向走
        if (!esc || (DIR[team] > 0 ? (er < esc.r) : (er > esc.r))) esc = { r: er, c: ec };
      }
      if (esc) ct = esc;    // 找到出口，继续往下走「前进」流程
      else return { type: 'wait', reason: '没有去路，原地待命' };
    }
    // 前进（同格多兵时按让位优先度排队）
    var rivalsC = state.units.filter(function (o) {
      return o !== u && o.team === team && !o.def.air && o.row === ct.r && o.col === ct.c;
    });
    var myPc = priorityAt(state, team, u.row, u.col);
    if (!rivalsC.some(function (o) { return priorityAt(state, team, o.row, o.col) < myPc; })) {
      // 连续移动：目标格提前锁定，进度按速度均匀累积（见 smoothMove 的注释）
      var rFwd = smoothMove(state, u, ct);
      if (rFwd === 'blocked') return { type: 'blocked', reason: '那一格是建筑' };
      return { type: 'move', row: u.row, col: u.col, moving: rFwd === 'moving' };
    }
    u.moveProg = 0; u.nextStep = null;
    return { type: 'move', row: u.row, col: u.col };
  }

  /* ------------------------------------------------------------ 主循环 */
  function update(state, dt) {
    if (state.over) return state;
    dt = dt || DT;
    state.time += dt;
    state.tick++;

    // 0) 决胜时刻已移除（v22）。原本 5 分钟后双方大本营对称烧血，用来强行结束僵持；
    //    玩家认为这种「到点就掉血」的结束方式太打断节奏，改为纯靠推掉大本营分胜负。
    //    仍需注意：双方都不进攻时对局不会自己结束，这是有意的（宁可不结束，也不要
    //    凭空扣血把胜负交给运气）。

    // 1) 收入：大本营固定收入 + 金矿等其他资源建筑（等级越高产出越多）
    TEAMS.forEach(function (team) {
      var inc = DATA.baseLevels[state.baseLevel[team] - 1].income;
      state.buildings.forEach(function (b) {
        if (b.team === team && b.def.income) inc += statsForLevel(b.def, b.level || 1, b.branch).income;
      });
      /* 闯关模式的「金币收成 +20%/关」就落在这里 —— 整条收入一起放大，
       * 而不是只加大本营底薪：AI 靠金矿滚雪球的那部分也该跟着涨，否则后期反而变相削弱。 */
      inc *= boostOf(state, team, 'income');
      state.res[team] += inc * dt;
      state.stats[team].income += inc * dt;
      // 派兵冷却
      for (var c = 1; c <= COLS; c++) {
        if (state.deployCd[team][c] > 0) state.deployCd[team][c] = Math.max(0, state.deployCd[team][c] - dt) < 0.001 ? 0 : Math.max(0, state.deployCd[team][c] - dt);
      }
    });

    // 1.5) 建筑自我修复：停火 8 秒后回血
    //   大本营 1%/秒；其他建筑是大本营的一半（0.5%/秒）
    //   注意：不停被攻击的建筑必须先进入 8 秒停火期才会回血 ——
    //   damageBuilding 每次都刷新 justDamaged 时间戳，所以持续挨打的建筑不会回血，
    //   否则「一群攻城兵打不掉一面墙」会变成常态。
    state.buildings.forEach(function (b) {
      var isBase = !!b.def.isBase;
      var cfg = isBase ? DATA.selfHeal : DATA.buildingSelfHeal;
      if (state.time - (b.justDamaged != null ? b.justDamaged : -999) < cfg.delay) return;
      if (b.hp < b.hpMax) {
        b.hp = Math.min(b.hpMax, b.hp + b.hpMax * cfg.perSecond * dt);
      }
    });

    // 1.6) 法术冷却 + 士兵冷却（时间冷却制：冷却好了才能再派这个兵种）
    TEAMS.forEach(function (team) {
      var cd = state.spellCd[team];
      Object.keys(cd).forEach(function (k) { if (cd[k] > 0) cd[k] = Math.max(0, cd[k] - dt) < 0.001 ? 0 : Math.max(0, cd[k] - dt); });
      var uc = state.unitCd[team];
      Object.keys(uc).forEach(function (k) { if (uc[k] > 0) uc[k] = Math.max(0, uc[k] - dt) < 0.001 ? 0 : Math.max(0, uc[k] - dt); });
    });

    // 2) 建筑产兵已改为「士兵时间冷却制」：士兵不再由建筑训练，
    //    而是各自有冷却（步兵 5 秒，越贵越久），冷却好了就能花金币派出去。
    //    所以这里不再有训练逻辑。

    // 3) 单位移动
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.hp <= 0) continue;
      stepUnit(state, u);
    }

    // 4) 单位攻击（移动完再打，避免刚进门就打）
    for (var j = 0; j < state.units.length; j++) {
      var u2 = state.units[j];
      if (u2.hp <= 0) continue;
      if (isFrozen(state, u2)) continue;      // 被冰冻：不能攻击
      u2.atkTimer += dt;
      var t = pickTarget(state, u2);
      if (!t) { u2.targetBuilding = null; continue; }
      u2.targetBuilding = t.kind === 'building' ? t.id : null;
      var interval2 = u2.def.atkInterval;
      if (u2.rageUntil && state.time < u2.rageUntil) interval2 *= 0.5;  // 狂暴：攻速翻倍
      if (u2.atkTimer < interval2) continue;
      u2.atkTimer = 0;
      var atk2 = u2.def.atk * globalBonus(state, u2.team).unitAtk * boostOf(state, u2.team, 'atk');
      if (u2.weakenUntil && state.time < u2.weakenUntil) atk2 *= (u2.weakenMul != null ? u2.weakenMul : 0.2);
      applyHit(state, u2, t, atk2);
    }

    // 5) 建筑攻击（塔）—— 攻击力/攻速/射程随等级与分支变化，并按攻击模式结算
    state.buildings.forEach(function (b) {
      if (!b.def.atk) return;
      if (isFrozen(state, b)) return;          // 被冰冻：建筑不能攻击
      var wst = combatStatsOf(b);   // 大本营在这里会自动取「同级别法师塔」的数值

      /* ★ 每帧更新「瞄准点」★
       * 玩家要求：建筑的炮口要跟着敌人转向。
       * 以前的实现只在**开火那一刻**才找目标，所以渲染层根本不知道炮口该朝哪。
       * 现在每帧都挑一次目标（只为了记录方位，不产生伤害），
       * 渲染层据此计算角度并平滑旋转炮口。 */
      var aimTgt = pickTowerTarget(state, b);
      if (aimTgt) {
        b.aimRow = aimTgt.row;
        b.aimCol = aimTgt.col;
        b.aimAt = state.time;      // 最后有目标的时间（渲染层用来决定是否转动）
      }

      b.atkTimer += dt;
      var interval = wst.atkInterval || b.def.atkInterval;
      var boosted = (b.rageUntil && state.time < b.rageUntil) ? 0.5 : 1;   // 狂暴：攻速翻倍
      if (b.atkTimer < interval * boosted) return;
      var tgt = aimTgt;            // 复用这一帧已经算好的目标
      if (!tgt) return;
      b.atkTimer = 0;
      // 弱化：伤害降低
      var weak = (b.weakenUntil && state.time < b.weakenUntil) ? (b.weakenMul != null ? b.weakenMul : 0.2) : 1;
      var gb = globalBonus(state, b.team);
      var st = { atk: wst.atk * weak * gb.buildingAtk * boostOf(state, b.team, 'atk') };
      var pst = projStyle(b, interval * boosted);
      var originC = centerOf(b);

      /* 脉冲塔：不发射弹道，而是打出一圈向外扩散的电磁波（见 spawnWave / updateWaves）。
       * 伤害不在这里结算 —— 由波前扫到谁谁才掉血。 */
      if (wst.mode === 'wave') {
        spawnWave(state, b, wst, st.atk, pst);
        return;
      }

      var hits = towerHitList(state, b, wst, tgt);
      /* 双管炮塔：左右炮口交替出膛。
       * 以前 twin 只是「攻速翻倍」，每次仍从建筑中心吐一发 —— 画两个炮口也是假的。
       * 现在记一个序号，单数走右口、双数走左口，双管才名副其实。 */
      var muzzleSide = 0;
      if (b.branch === 'twin') {
        b.muzzleSeq = (b.muzzleSeq || 0) + 1;
        muzzleSide = (b.muzzleSeq % 2) ? 1 : -1;
        b.muzzleSide = muzzleSide;
        b.muzzleAt = state.time;
      }
      /* 大电塔是「链式闪电」：第一道从塔顶劈向最近的敌人，之后每一道都从
       * 上一个敌人跳向下一个 —— 这样才看得出是"挨个被电到"，
       * 而不是同时从塔上射出三道平行电光。 */
      var chained = (wst.mode === 'multi3' && hits.length > 1);
      var chainFrom = originC;
      var prevUnitId = null;                 // 上一环命中的是哪个单位（供渲染层追踪起点）
      hits.forEach(function (o, idx) {
        if (o.hp <= 0) return;
        var dest = centerOf(o);
        var src;
        var fromUnitId = null;
        if (chained && idx > 0) { src = chainFrom; fromUnitId = prevUnitId; }  // 从上一个敌人跳过来
        else src = muzzlePoint(originC, dest, MUZZLE_LEN, muzzleSide);
        chainFrom = dest;
        prevUnitId = o.id;
        state.projectiles.push({
          id: state.nextId++, from: src, to: dest, targetId: o.id,
          kind: 'unit', atk: st.atk, ttl: pst.life, team: b.team,
          proj: pst, arc: pst.arc, born: state.time,
          fromKey: b.key, fromId: b.id,        // 供渲染/调试区分来源
          chain: chained ? idx : 0,            // 0 = 塔→敌人1，1 = 敌人1→敌人2 …
          fromUnitId: fromUnitId,              // 链式第 2、3 道的起点单位（追踪用）
          /* 伤害不再在这里直接结算，改为「弹道飞到时」结算（见 resolveProjectile）。 */
          hit: { kind: 'unit', id: o.id, atk: st.atk }
        });
      });
    });

    // 5.5) 电磁波扩散：波前扫到谁，谁掉血（脉冲塔专用）
    updateWaves(state, dt);

    // 6) 弹道飞行 + 命中结算
    for (var k = state.projectiles.length - 1; k >= 0; k--) {
      state.projectiles[k].ttl -= dt;
      var p = state.projectiles[k];
      if (p.targetId) {
        var tt = state.units.filter(function (o) { return o.id === p.targetId; })[0];
        if (tt) { p.to = centerOf(tt); p.ttl = Math.max(p.ttl, 0); }
      }
      if (p.ttl <= 0) {
        resolveProjectile(state, p);      // 飞到了才结算伤害
        state.projectiles.splice(k, 1);
      }
    }

    // 7) 清理死亡单位（damageUnit 已经移除，这里兜底）
    state.units = state.units.filter(function (o) { return o.hp > 0; });

    // 8) 事件日志上限
    if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
    if (state.time > MAX_SIM_SECONDS) { state.over = true; state.winner = 'draw'; emit(state, 'gameover', { winner: 'draw' }); }
    return state;
  }

  /* 命中结算：弹道飞到了才扣血（王国保卫战的做法）。
   * 目标已经死了就算打空 —— 空放一发，比「开火瞬间隔着半个棋盘把人打死」诚实。 */
  function resolveProjectile(state, p) {
    var h = p.hit;
    if (!h) return;
    if (h.kind === 'unit') {
      var u = null;
      for (var i = 0; i < state.units.length; i++) {
        if (state.units[i].id === h.id) { u = state.units[i]; break; }
      }
      if (u && u.hp > 0) damageUnit(state, u, h.atk);
    } else if (h.kind === 'building') {
      var b = null;
      for (var j = 0; j < state.buildings.length; j++) {
        if (state.buildings[j].id === h.id) { b = state.buildings[j]; break; }
      }
      /* 攻城倍率在 damageBuilding 里按 attacker.key 算，
       * 而发起者可能在弹道飞行途中就死了 —— 用轻量替身把 key 保住。 */
      if (b && b.hp > 0) damageBuilding(state, b, h.atk, { kind: 'unit', key: h.srcKey });
    }
  }

  function applyHit(state, attacker, target, atkOverride) {
    var atk = atkOverride != null ? atkOverride : attacker.def.atk;
    var pst2 = projStyle(attacker);
    var srcKey = (attacker.def && attacker.def.key) || attacker.key;
    /* 近战的挥砍 / 撞击是「当下就打到」，不做延迟；
     * 远程（箭 / 炮弹 / 法球 / 闪电）才让弹道先飞、落地再结算。 */
    var instant = (pst2.type === 'slash' || pst2.type === 'crit');
    var dest = centerOf(target);
    var src = muzzlePoint(centerOf(attacker), dest, MUZZLE_LEN_UNIT, 0);
    if (instant) {
      if (target.kind === 'building') damageBuilding(state, target, atk, attacker);
      else damageUnit(state, target, atk);
    }
    state.projectiles.push({
      id: state.nextId++, from: src, to: dest, targetId: target.id,
      kind: target.kind === 'building' ? 'building' : 'unit', atk: atk,
      ttl: pst2.life, team: attacker.team,
      proj: pst2, arc: pst2.arc, born: state.time,
      fromKey: srcKey, fromId: attacker.id,
      hit: instant ? null
           : { kind: target.kind === 'building' ? 'building' : 'unit',
               id: target.id, atk: atk, srcKey: srcKey }
    });
  }

  /* ------------------------------------------------------------------ 弹道外观
   * 按攻击者类型决定「这一发看起来是什么」，供渲染层画飞行中的投射物。
   * 返回 { type, color, size, arc, life }：
   *   type  'ball' 炮弹/炸弹 | 'arrow' 箭矢 | 'bolt' 弩矢 | 'orb' 法术球
   *         'shell' 高抛炮弹 | 'spark' 电花 | 'slash' 近战刀光 | 'crit' 重型
   *   arc   抛物线高度系数（0 = 直线）
   *   life  飞行时长（秒）—— 让玩家能看清「子弹飞过去」的过程
   * ------------------------------------------------------------------ */
  var PROJ_STYLE = {
    // 建筑
    cannon: { type: 'ball', color: '#ffd27a', size: 0.13, arc: 0.10, life: 0.26 },
    arrow: { type: 'arrow', color: '#d8ffb0', size: 0.11, arc: 0.05, life: 0.22 },
    mage: { type: 'orb', color: '#c79bff', size: 0.15, arc: 0.0, life: 0.30 },
    /* 迫击炮：高高抛上天再砸下来。
     * arc 0.85 = 抛物线顶点接近 1 格高，life 0.70s 让"上天→落下"看得清。
     * aoe = 溅射半径（渲染层据此画落点预警圈和爆炸范围）。 */
    mortar: { type: 'shell', color: '#ffb070', size: 0.15, arc: 0.85, life: 0.70, aoe: 1 },
    /* 特斯拉系走「锯齿闪电」而不是圆点火花：渲染层按 type==='volt' 画折线电弧 */
    tesla: { type: 'volt', color: '#8ff0e0', size: 0.13, arc: 0.0, life: 0.24 },
    ward: null,
    base: { type: 'orb', color: '#9fd4ff', size: 0.14, arc: 0.0, life: 0.28 },
    // 兵种
    archer: { type: 'arrow', color: '#d8ffb0', size: 0.10, arc: 0.04, life: 0.20 },
    balloon: { type: 'ball', color: '#ff9ac0', size: 0.12, arc: 0.22, life: 0.32 },
    airship: { type: 'ball', color: '#b0a0e0', size: 0.13, arc: 0.30, life: 0.34 },
    dragon: { type: 'orb', color: '#ff8a4a', size: 0.15, arc: 0.06, life: 0.30 },
    infantry: { type: 'slash', color: '#dff0ff', size: 0.16, arc: 0, life: 0.16 },
    heavy: { type: 'slash', color: '#cfe0f0', size: 0.18, arc: 0, life: 0.18 },
    siege: { type: 'slash', color: '#ffd0a0', size: 0.14, arc: 0, life: 0.16 },
    ram: { type: 'crit', color: '#ffcf8a', size: 0.20, arc: 0, life: 0.22 }
  };

  /* ---------------------------------------------------------------- 炮口
   * 出膛点必须落在炮口，而不是建筑中心 —— 否则炮弹看起来是从建筑正中间凭空
   * 长出来的，底座越大越离谱。方向在**格坐标**里算即可（格子是正方形）。
   * side ≠ 0 时沿垂直方向再偏一点，用来让双管塔的左右炮口分开。 */
  var MUZZLE_LEN = 0.36;        // 建筑炮口相对中心的格距离
  var MUZZLE_LEN_UNIT = 0.26;   // 兵种武器的出手距离
  var MUZZLE_SPREAD = 0.10;     // 双管左右炮口的间距（单侧）

  function muzzlePoint(from, to, len, side) {
    var dr = to.row - from.row, dc = to.col - from.col;
    var d = Math.sqrt(dr * dr + dc * dc);
    if (d < 1e-6) return { row: from.row, col: from.col };
    var ur = dr / d, uc = dc / d;
    // 目标就在隔壁时不要把出膛点顶到它身上
    var off = Math.min(len, d * 0.5);
    var s = side || 0;
    return {
      row: from.row + ur * off - uc * s * MUZZLE_SPREAD,
      col: from.col + uc * off + ur * s * MUZZLE_SPREAD
    };
  }

  /* 弹道飞行时长随攻速缩放：
   *   攻速越快 → 弹道越短（轻快的箭、连发的炮弹）
   *   攻速越慢 → 弹道越长（重炮慢慢飞、慢慢砸下来）
   * 用平方根压缩幅度并夹在 0.75~1.3 倍，避免快塔的箭快到看不见、
   * 慢塔的炮弹飞成幻灯片。 */
  function projLifeMul(interval) {
    var iv = (interval != null && interval > 0) ? interval : 1.0;
    return Math.max(0.75, Math.min(1.3, Math.sqrt(iv)));
  }

  function projStyle(attacker, interval) {
    /* 用 def.key 而不是实例的 key：
     * 分支升级后实例的 key 可能被改成分支名（如 'bigmortar'），
     * 而弹道外观是按**基础类型**决定的（巨炮也是炮弹，只是更大）。
     * 这样分支塔不会退化成默认外观（实测到的 bug）。 */
    var key = (attacker.def && attacker.def.key) || attacker.key;
    var s = PROJ_STYLE[key];
    if (!s) s = { type: 'ball', color: '#dfe8f5', size: 0.11, arc: 0.05, life: 0.22 };
    var iv = (interval != null) ? interval
           : ((attacker.def && attacker.def.atkInterval) || null);
    return { type: s.type, color: s.color, size: s.size, arc: s.arc,
             life: s.life * projLifeMul(iv), baseLife: s.life, aoe: s.aoe || 0 };
  }

  function emit(state, type, payload) {
    state.events.push(Object.assign({ type: type, t: state.time }, payload || {}));
  }

  /* ------------------------------------------------------------ 电脑对手 */
  /* 规则很朴素，但能完整打完一局：先补经济 → 有威胁就派兵 → 造塔防守 → 有钱就升基地。 */
  /* ============================================================================
   * 电脑对手（AI）
   * 三档难度：靠「思考频率 / 是否犯错 / 是否穷尽算力」区分
   *   normal 普通：思考慢、会犯错、留余钱 —— 真人大概 60% 能赢
   *   hard   困难：思考快、几乎不犯错     —— 真人要打得好才能赢
   *   hell   地狱：满算力、针对克制、卡冷却连波，真人几乎赢不了
   * ========================================================================== */
  var AI_PRESETS = {
    normal: {
      key: 'normal', name: '简单', raidW: 0.22,
      thinkEvery: 2.4, mistakeRate: 0.55, reserve: 10,
      upgradeBudget: 0.50, maxMines: 3, maxTowers: 2, aceTarget: 1, wardCap: 0,
      spellEager: 0.30, smartDeploy: false, smartTower: false, allIn: false,
      adaptive: true,                        // 打开：启用「领先→成建制收尾」逻辑，消除 500s 龟缩
      closeBase: 1.0,                        // 普通兵少，不要求对面掉血：成军(>=closeArmy)且自家安全即持续推家（翻盘弱代理）
      closeArmy: 2,                          // 兵少也能发起收尾
      pushIgnoreStance: true,                // 无视「是否领先」直接收尾（普通靠趁早推家翻盘；自家血线安全时才推）
      closeStanceSafe: 0.5,
      /* 普通档的经济/出兵门槛（★ 洞 2 修复 ★）
       * 实测根因（dev/_diag2 + dev/_diag4 抓到的）：
       *   · maxMines=1 → 收入锁死在 5/秒，一整局攒不出兵；
       *   · upgradeBudget=0.20 → baseGoal 的门槛（要求 ≥0.5）永远达不到 →
       *     大本营永远 Lv1 → 只解锁「箭雨」，且收尾条件（≥2 兵留在前场）几乎永不成立；
       *   · armyMinRes 用的是困难档的 110 → 辛苦攒到 110 才出 1 个兵，
       *     那个兵被对面大本营防御打死后又回到 0 → 10 局 0 胜 0 负 10 平。
       * 现在：矿上限 3（收入 9/秒）、升级预算 0.50（能升大本营 → 解锁火球/火箭，才有收尾能力）、
       *      出兵门槛 60、军费比例 0.6、常备 4 个兵（真的往前压，不囤兵）。
       * 它仍然是「教学档」，弱在脑子和配置而不是躺平：
       *   55% 犯错率、不智能选兵（只会步兵+攻城兵）、不智能选塔、
       *   最多 2 座塔、主塔只升 1 级、主塔 1 级就宽化（wideAt 1，塔最少）。 */
      armyFloor: 4, armyMinRes: 60, armyShare: 0.60, wideAt: 1,
      /* 总体升级（全局科技）目标：四项等级之和。普通档是教学档 → 只给很低的额度；
       * 实测（dev/_diag_ai.js）显示它本来也能升到 2/2/2/2，这里给个温和的 4。
       * techCushion：升完科技后手上要留多少金币（不留 → 会和塔/兵抢钱）。 */
      techTarget: 4, techCushion: 120, hoard: false, techFallbackAt: 300,
      /* P-D 对手建模的「用得多准」旋钮（三档都开启，但精度不同 → 保住难度阶梯）：
       *   laneRead   ：进攻时把「敌方每列防御强度」当多大回事（0 = 不会读 → 旧行为）
       *   laneFocus  ：集中兵力的强度（连续几波打同一薄弱列）
       *   focusTime  ：一个主攻列坚持多少秒（玩家补防 / 该列被打穿才换） */
      laneRead: 0.35, laneFocus: 0.35, focusTime: 20,
      spellBuilding: true,                   // 会用技能（见 aiCastSpell：三档通用的基本教养，不是难度特权）
      enemyBaseHeal: 1.0, enemyBaseHealDelay: 12   // 普通：电脑大本营 12 秒后才回血（给玩家留活路）
    },
    hard: {
      key: 'hard', name: '普通', raidW: 0.40,
      thinkEvery: 1.0, mistakeRate: 0.12, reserve: 15,
      upgradeBudget: 0.75, maxMines: 4, maxTowers: 5, aceTarget: 4, wardCap: 1,
      spellEager: 0.55, smartDeploy: true, smartTower: true, allIn: false,
      adaptive: true,                        // 会算实力对比
      closeBase: 1.0,                        // 对面血线条件失效：只在「领先(ahead)」且成军(>=closeArmy)时推——对弱代理碾压、对地狱(落后)永不主动推（保阶梯）
      closeArmy: 4, pushEven: false,
      wideAt: 4, armyFloor: 2, armyShare: 0.45, armyMinRes: 165,
      /* ★ 轮 8：兵种多样性 + 科技独立预算 ★
       * 实测基线（dev/_diag_ai.js，困难 vs 代理 3 局 420s）：
       *   · 出兵 **0 只** —— 主塔升级(119金)/杂项升级都排在派兵之前且更便宜，
       *     钱每到 119 就被吃掉，派兵分支永远走不到（玩家眼里就是"电脑不出兵"）；
       *   · 科技 420 秒只有 2/2/2/2，且 0~240 秒一直是 0 —— 因为 260 金的科技
       *     排在主塔升级之后，永远攒不到。
       * 现在：军力地板（1.7 节）保证「兵少于下限时先出兵」，
       *      科技（2.5 节）排到主塔升级之前、自带资金缓冲 techCushion，
       *      并用 techTarget 给每档一个明确的科技目标（四项等级之和）。 */
      techTarget: 8, techCushion: 40, hoard: true, valueCap: 280, pushTech: true, techFallbackAt: 240,
      laneRead: 0.85, laneFocus: 0.8, focusTime: 30,
      spellBuilding: true,
      enemyBaseHeal: 1.0, enemyBaseHealDelay: 10
    },
    hell: {
      key: 'hell', name: '困难', raidW: 0.55,
      thinkEvery: 0.5, mistakeRate: 0, reserve: 0,
      upgradeBudget: 1.0, maxMines: 8, maxTowers: 10, aceTarget: 10, wardCap: 3,
      spellEager: 0.8, smartDeploy: true, smartTower: true, allIn: true,
      adaptive: true,                        // 算得最细 + 集中兵力打弱点
      closeBase: 0.70,                       // 比困难更早收尾；配合 allIn 主动冲锋，确保地狱 >> 困难
      closeArmy: 4, pushEven: false,
      /* ★ 洞 1 修复：把「经济碾压」真正兑现成胜势 ★
       * 实测根因（dev/_diag3 + dev/_diag4，600 秒上限下跑的）：
       *   ① 地狱收入 24/秒（困难 15），但 wantWide 卡在「主塔 4 级才铺第 3 座塔」→
       *      120~360 秒只有 2 座塔，而困难靠「犯错时顺手铺塔」早就 5~7 座；
       *      钱全囤在手里（实测 t=300 手里 353 金、t=390 手里 474 金，200 秒在做梦）。
       *   ② baseGoal 把所有金币锁进「攒 550 升 Lv3」，出兵被冻结到 420 秒 ——
       *      前 400 秒对困难零压力。而这游戏 300 秒起双方大本营对称烧血，
       *      于是胜负几乎完全由「谁大本营血厚 + 谁多打了对面一点血」决定 → 掷硬币（实测 58%）。
       *   ③ allIn 窗口被 !allIn 守卫做成 100% 冻结发育，一波兵被防线吃掉就白亏 45 秒。
       *   ④ 最致命的一条：伤害法术（火箭 420 / 火球 200）全部憋到过期 ——
       *      旧 aiCastSpell 只在「半径内 ≥2 个敌兵」时才丢，中后期场上根本没这种格子。
       *      而法术对建筑是直接扣血的，等于每 30 秒白送 420 伤害，谁想起来用谁赢。
       * 现在的组合：主塔 2 级就宽化铺塔（wideAt）、大本营攒到 Lv4（baseCap，血更厚）、
       * 常备 4 个兵（armyFloor）、出兵门槛 80、军费 50%、推家期仍可发育（pushDevelop）、
       * 以及跟着目标价值走的新法术逻辑（spellBuilding）。
       * 这是「科技+经济+覆盖面」的雪球，不是偷偷加资源、也不是偷看隐藏信息。 */
      wideAt: 2, armyFloor: 4, armyShare: 0.5, armyMinRes: 80,
      /* 地狱档的科技目标最高（四项之和 14 ≈ 每项 3~4 级）。
       * 为什么不写"每项 8~10 级"：升级费用按 1.45^等级 涨，
       * 单项从 0 升到 8 级要 10680 金、到 10 级要 23085 金，
       * 而地狱整局总收入约 1 万（收入 24/秒 × 420 秒）—— 数学上不可能。
       * 所以改成「可达成且明显高于困难档」的目标，实测见 dev/_diag_ai.after.txt。 */
      techTarget: 14, techCushion: 0, hoard: true, valueCap: 420, techFirst: true, reserveRatio: 0.35, pushTech: true, techFallbackAt: 240,
      laneRead: 1.15, laneFocus: 1.0, focusTime: 40,
      /* 实测记录（N=20 官方种子，地狱 vs 困难）：
       *   baseSave:true  → 75% 胜率 · 兵种 4.0 种 · 科技 7.3 级   ← 保留这一档
       *   baseSave:false → 85% 胜率 · 兵种 3.0 种 · 科技 6.0 级
       * 关掉攒钱确实能多赢 10 个百分点（钱转去买大本营，防线更厚），
       * 但代价是把兵种多样性又压回 3 种 —— 而"只用两三种兵"正是用户的第一诉求，
       * 所以这里选 baseSave:true。 */
      baseCap: 4, baseSave: true, baseFirst: true,
      pushDevelop: true,
      spellBuilding: true,
      enemyBaseHeal: 1.0, enemyBaseHealDelay: 6    // 地狱：回血最快，靠硬实力赢
    }
  };
  function aiPresetOf(state, team) {
    var k = (state.aiPreset && state.aiPreset[team]) || 'hard';
    return AI_PRESETS[k] || AI_PRESETS.hard;
  }

  /* 实时局势分析：敌方兵种构成 / 主攻列 / 我方压力 */
  function analyzeBoard(state, team) {
    var foe = OPP[team];
    var info = {
      ground: 0, air: 0, siegeType: 0, ranged: 0, total: 0,
      inMyHalf: 0, pressure: 0, laneCount: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      myGround: 0, myAir: 0, towers: 0, mines: 0, wards: 0,
      foeBaseHp: 1, myBaseHp: 1, mainLane: 1
    };
    state.units.forEach(function (u) {
      if (u.team === foe) {
        info.total++;
        if (u.def.air) info.air++; else info.ground++;
        if (u.def.priority === 'siege') info.siegeType++;
        if (u.def.range > 1.5) info.ranged++;
        if (inHalf(team, u.row, u.col)) { info.inMyHalf++; info.pressure += u.def.atk; }
        if (u.col >= 1 && u.col <= COLS) info.laneCount[u.col]++;
      } else {
        if (u.def.air) info.myAir++; else info.myGround++;
      }
    });
    state.buildings.forEach(function (b) {
      if (b.team !== team) return;
      if (b.def.atk && !b.def.isBase) info.towers++;   // 大本营不算「塔」
      if (b.key === 'mine') info.mines++;
      if (b.key === 'ward') info.wards++;
    });
    var myB = ownBase(state, team), foeB = enemyBase(state, team);
    if (myB) info.myBaseHp = myB.hp / myB.hpMax;
    if (foeB) info.foeBaseHp = foeB.hp / foeB.hpMax;
    var mx = -1;
    for (var c = 1; c <= COLS; c++) if (info.laneCount[c] > mx) { mx = info.laneCount[c]; info.mainLane = c; }
    /* 主攻列热力图（P-C）：把「最近常被打的列」也放进口袋里。
     * laneCount 是「这一帧」的瞬时值，heat 是「最近一段时间累计」的记忆 ——
     * 铺塔用后者（见 findSpot / scoreCell），前者只用来做瞬时反应。 */
    var hArr = state.aiHeat && state.aiHeat[team];
    if (hArr) {
      var hc = 1, hv = -1;
      for (var hci = 1; hci <= COLS; hci++) if (hArr[hci] > hv) { hv = hArr[hci]; hc = hci; }
      info.heatLane = hc;
      info.heatMax = hv;
    }
    return info;
  }

  /* ============================================================================
   * 主攻列热力图（P-C）—— AI 的「记忆」
   * ----------------------------------------------------------------------------
   * 解决的问题：AI 原来只有 analyzeBoard().laneCount（「这一帧敌人在各列有几个兵」），
   * 这是瞬时值 —— 玩家把兵挪走/换个列打，AI 立刻失忆，看不出「记得我一直打哪」。
   *
   * 做法（全部只用公开状态，不读任何隐藏信息、不加任何资源）：
   *   · 每个 tick 给【敌方单位所在的列】加热：敌人在哪列就热哪列。
   *     敌方在棋盘外的通道行（行A/行B）等进场时列号同样有效 →「从哪列进场」也算。
   *   · 每 tick 按 0.98/秒 温和衰减（20 Hz 下约 ×0.999）：
   *     最近常打的列权重大，很久以前的自然淡出；玩家换路时 AI 半分钟内跟上。
   *   · 归一化后交给 scoreCell 做选点权重（hotLanes）。
   * ========================================================================== */
  var HEAT_DECAY_PER_SEC = 0.98;   // 每秒保留 98%（半衰期约 34 秒）
  var HEAT_CAP = 40000;            // 单列上限，防止超长局数字膨胀

  function updateHeat(state, team, dt) {
    if (!state.aiHeat || !state.aiHeat[team]) return;
    if (state.over) return;
    var h = state.aiHeat[team], foe = OPP[team];
    var k = Math.pow(HEAT_DECAY_PER_SEC, dt || DT);
    for (var c = 1; c <= COLS; c++) if (h[c] !== 0) h[c] *= k;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.team !== foe || u.hp <= 0) continue;
      if (u.col < 1 || u.col > COLS) continue;
      if (h[u.col] < HEAT_CAP) h[u.col] += 1;
    }
  }

  /* 归一化热力：返回长度 COLS+2 的数组，w[col] ∈ [0,1]（相对最热的那一列）。
   *
   * 两个来源（都只用公开状态：敌方单位在棋盘上的格子坐标）：
   *   ① 记忆：state.aiHeat 里那本会衰减的账本（权重上限 1.0）—— 主线，
   *      「最近这半分钟玩家一直在打哪一列」。
   *   ② 直觉：这一帧敌方单位在各列的数量（权重上限 LANE_INSTANT_W）—— 副线，
   *      记忆还没预热（开局）或者玩家突然换路时，靠它立刻反应，不用等 30 秒。
   * 取两者较大值；记忆在同等条件下永远压过直觉，所以「记得主攻方向」仍然是主导。 */
  var LANE_INSTANT_W = 0.6;

  function hotLanes(state, team) {
    var out = new Array(COLS + 2).fill(0);
    var c, mx = 0;
    var h = state.aiHeat && state.aiHeat[team];
    if (h) {
      for (c = 1; c <= COLS; c++) if (h[c] > mx) mx = h[c];
      if (mx > 1e-9) for (c = 1; c <= COLS; c++) out[c] = h[c] / mx;
    }
    // ② 瞬时直觉
    var foe = OPP[team], lane = new Array(COLS + 2).fill(0), lmx = 0;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.team !== foe || u.hp <= 0) continue;
      if (u.col < 1 || u.col > COLS) continue;
      lane[u.col]++;
      if (lane[u.col] > lmx) lmx = lane[u.col];
    }
    if (lmx > 0) {
      for (c = 1; c <= COLS; c++) {
        var v = LANE_INSTANT_W * lane[c] / lmx;
        if (v > out[c]) out[c] = v;
      }
    }
    return out;
  }

  /* ============================================================================
   * 敌方画像（P-D）—— AI 的「对手档案」
   * ----------------------------------------------------------------------------
   * 要解决的问题：在此之前 AI 只会「反应」——
   *   · 选塔只看「这一帧场上有没有空中/地面兵」；
   *   · 派兵只看「这一列有没有被己方建筑挡 + 这一列此刻有几个敌兵」。
   * 于是玩家只要「先藏着空军、等你铺满炮塔再放气球」，或者「左边堆满塔、
   * 右边完全不设防」，AI 就完全读不出来，还在傻乎乎地正面撞塔。
   *
   * 现在给每方各建一份「对手档案」，三条信息全部来自**公开状态**
   * （玩家在棋盘上看得见的东西，渲染层本来就画出来了）：
   *   · towerByKey  —— 敌方已经造了哪些塔、各几座、累计等级
   *   · laneDefense[col] —— 敌方每一列的防御强度：把敌方每座攻击塔的射程能罩到的
   *                        列，按「等级 × 射程内覆盖的行占比 × 每秒火力」累加。
   *                        → aiDeploySmart 拿它挑「最薄弱的列」下手（打弱点）。
   *   · unitMix     —— 敌方各兵种「累计在场秒数」（每秒温和衰减）→ 占比 = 最近倾向。
   *                        → aiPickTower 拿它做**预判克制**（趁玩家还没把空军放出来，
   *                          就先按「他最近一直在出空军」把对空塔补上）。
   * 不读敌方金币、不读敌方待命区、不读任何隐藏意图 —— 作弊面为零，也没加任何资源。
   * ========================================================================== */
  var FOE_DECAY_PER_SEC = 0.97;   // unitMix 每秒保留 97%（半衰期约 23 秒 = 「最近」的倾向）
  var FOE_MIX_CAP = 1e7;          // 单兵种累计上限（超长局数字不膨胀）

  function makeFoeProfile() {
    return {
      towerByKey: {},                                  // {cannon:2, arrow:1, ward:1, ...}
      towerLevels: {},                                 // 各类型累计等级
      towerCount: 0,                                   // 攻击塔总量
      laneDefense: new Array(COLS + 2).fill(0),        // 每列防御强度（原始分，不归一化）
      laneTowers: new Array(COLS + 2).fill(0),         // 每列被几座塔罩着
      laneBlock: new Array(COLS + 2).fill(0),          // 每列有几格被敌方建筑占着（地面兵要拆墙）
      defMax: 0,                                       // 当前最强那一列的强度（归一化分母）
      /* ---- 经济目标（v13 新增）----
       * 病根记录：原实现里循环走到 `if (!b.def.atk) continue` 就把金矿丢掉了 ——
       * 金矿不产生「射程威胁」，于是它只被记进 laneBlock（挡路格），
       * AI 眼里根本没有「对面有一座没设防的矿」这件事，当然只会一味推家。
       * 现在单独记一份清单，guard = 罩着这座矿的敌方塔火力之和（0 = 裸矿）。 */
      mines: [],                                       // [{r, c, lvl, guard}]
      mineBest: null,                                  // 守卫最薄的那座矿（AI 的优先经济目标）
      towers: [],                                      // [{r, c, R, power, air}] 供覆盖/寻路评估复用
      unitMix: {},                                     // 兵种 → 累计在场秒数（会衰减）
      unitTotal: 0,                                    // 上面所有兵种之和
      stamp: -1
    };
  }

  /* 每 tick 更新一次（由 aiUpdate 调用）。
   * 只用公开状态：state.buildings（敌方建筑）/ state.units（敌方场上单位）。 */
  function updateFoeProfile(state, team, dt) {
    var f = state.aiFoe && state.aiFoe[team];
    if (!f || state.over) return f;
    var foe = OPP[team], step = dt || DT, i, ci, key;

    /* ---------- ① 兵种倾向：会衰减的「最近在出什么」 ----------
     * 权重用「在场秒数」而不是「出过几次」：
     *   · 玩家连续出空军 → balloon/dragon 持续上涨；
     *   · 停手之后 20~30 秒自然淡出 → 不会一辈子以为你有空军（这很重要，
     *     否则 AI 会为了一个早就不用的兵种永远堆对空塔，被地面推平）。 */
    var mix = f.unitMix, k = Math.pow(FOE_DECAY_PER_SEC, step);
    for (key in mix) {
      if (mix[key] > 1e-6) mix[key] *= k; else mix[key] = 0;
    }
    for (i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.team !== foe || u.hp <= 0) continue;
      var cur = mix[u.key] || 0;
      if (cur < FOE_MIX_CAP) mix[u.key] = cur + step;
    }

    /* ---------- ② 塔构成 + 每列防御强度（用实时建筑算，不需要衰减） ---------- */
    for (key in f.towerByKey) { f.towerByKey[key] = 0; f.towerLevels[key] = 0; }
    var laneD = f.laneDefense, laneT = f.laneTowers, laneB = f.laneBlock;
    for (ci = 0; ci <= COLS + 1; ci++) { laneD[ci] = 0; laneT[ci] = 0; laneB[ci] = 0; }
    f.towerCount = 0;
    f.mines.length = 0;
    f.towers.length = 0;
    for (var bi = 0; bi < state.buildings.length; bi++) {
      var b = state.buildings[bi];
      if (b.team !== foe || b.hp <= 0) continue;
      /* 大本营的防御**故意不算进 laneDefense**：
       * 它罩着中路 5~6 列，可那几列是推家的必经之路 —— 算进去只会把 AI
       * 从「必须打的中路」赶走，反而放弃拆家。它单独记在 towerByKey.base 里。 */
      if (b.def.isBase) { f.towerByKey.base = (f.towerByKey.base || 0) + 1; continue; }
      var lvl = b.level || 1;
      /* 挡路格（含金矿/防御塔）：地面兵推进到这里必须停下来拆墙。
       * 注意用 for 循环而不是 forEach —— 这是每 tick 都跑的路径，
       * 每座建筑每 tick 新建一个闭包会给 GC 白添负担。 */
      var refs = b.refs || [], ri;
      for (ri = 0; ri < refs.length; ri++) {
        var rp = fromRef(refs[ri]);
        if (rp && rp.c >= 1 && rp.c <= COLS && rp.r >= 1 && rp.r <= ROWS) laneB[rp.c]++;
      }
      if (b.key === 'mine') {
        f.mines.push({ r: Math.round(b.row), c: Math.round(b.col), lvl: lvl, guard: 0 });
      }
      if (!b.def.atk) continue;                  // 光环塔计入塔型，但不产生「射程威胁」
      f.towerByKey[b.key] = (f.towerByKey[b.key] || 0) + 1;
      f.towerLevels[b.key] = (f.towerLevels[b.key] || 0) + lvl;
      f.towerCount++;
      var st = statsForLevel(b.def, lvl, b.branch);
      var R = Math.max(1, Math.round(st.range || 1));
      // 每秒火力：攻速快的箭塔比同等级炮塔更烦人，所以火力要参与权重（做温和压缩）
      var dps = (st.atk || 0) / Math.max(0.2, st.atkInterval || 1);
      var fire = 0.6 + Math.min(3, dps / 40);
      f.towers.push({
        r: Math.round(b.row), c: Math.round(b.col), R: R,
        power: lvl * fire,
        air: st.targets === 'both'
      });
      // 射程内覆盖了几行：塔越靠前线 / 射程越大，对这一列的威胁越实
      var r0 = Math.max(1, Math.round(b.row) - R), r1 = Math.min(ROWS, Math.round(b.row) + R);
      var rows = Math.max(0, r1 - r0 + 1) / (2 * R + 1);
      var cFrom = Math.max(1, Math.round(b.col) - R), cTo = Math.min(COLS, Math.round(b.col) + R);
      for (ci = cFrom; ci <= cTo; ci++) {
        laneD[ci] += lvl * rows * fire;
        laneT[ci] += 1;
      }
    }
    var mx = 0;
    for (ci = 1; ci <= COLS; ci++) if (laneD[ci] > mx) mx = laneD[ci];
    f.defMax = mx;

    /* ---------- ③ 每座矿的守卫强度 + 挑出最划算的一枚 ---------- */
    /* guard = 罩得住这座矿的敌方塔火力之和；0 = 裸矿。
     * 「划算」= 守卫低 + 离我方近（红方向上推进，行号大 = 更靠前线）。 */
    var bestMine = null, bestMineScore = 1e9, naked = 0;
    for (i = 0; i < f.mines.length; i++) {
      var mn = f.mines[i], guard = 0, tj;
      for (tj = 0; tj < f.towers.length; tj++) {
        var tw0 = f.towers[tj];
        if (Math.abs(tw0.r - mn.r) > tw0.R || Math.abs(tw0.c - mn.c) > tw0.R) continue;
        guard += tw0.power;
      }
      mn.guard = guard;
      if (guard <= 0.01) naked++;
      var adv = (team === 'red') ? mn.r : (ROWS + 1 - mn.r);
      var sc = guard * 8 - adv;
      if (sc < bestMineScore) { bestMineScore = sc; bestMine = mn; }
    }
    f.mineBest = bestMine;
    f.mineNaked = naked;
    f.baseGuard = 0;
    var bc1 = BASE_RECT[foe].c1, bc2 = BASE_RECT[foe].c2;
    for (i = 0; i < f.towers.length; i++) {
      if (f.towers[i].c >= bc1 && f.towers[i].c <= bc2) f.baseGuard += f.towers[i].power;
    }
    f.stamp = state.tick;
    return f;
  }

  /* ============================================================================
   * 目标模式：经济打击 vs 直推大本营（v13）
   * ----------------------------------------------------------------------------
   * 用户诉求原文：「像在合适的时机摧毁没有保护或保护较少的金矿，而不是一味地
   * 直接进攻对方大本营（这也不是绝对的，有的时候实力强劲时候直推大本营也可以，
   * 要看情况）」。
   *
   * 所以这里不是把顺序写死成「先矿后家」，而是每次派兵前算一次「现在该打什么」：
   *   push —— 我方在场兵力压得住对面基地防御，且本营血量已经进入可拆区间 → 直推
   *   raid —— 对面有裸矿（守卫 ≈ 0），而我方暂时啃不动基地 → 去拆矿
   *   auto —— 两边都不成立 → 沿用原来的「打最薄弱列」
   *
   * 只用公开信息（敌方建筑位置/等级、自己单位、自己金币），不读任何隐藏状态。
   * ========================================================================== */
  function aiTargetMode(state, team, P) {
    var f = state.aiFoe && state.aiFoe[team];
    var out = { mode: 'auto', raidW: 0, push: 0, army: 0, baseGuard: 0, naked: 0 };
    if (!f) return out;
    var foe = OPP[team], i, st, u;

    /* 我方在场兵力：用「血量 × 每秒输出 / 100」当量，只需相对可比 */
    var army = 0, nUnits = 0;
    for (i = 0; i < state.units.length; i++) {
      u = state.units[i];
      if (u.team !== team || u.hp <= 0) continue;
      st = statsForLevel(u.def, u.level || 1, u.branch);
      army += (st.hp || 1) * ((st.atk || 0) / Math.max(0.2, st.atkInterval || 1)) / 100;
      nUnits++;
    }
    var fb = null;
    for (i = 0; i < state.buildings.length; i++) {
      var b = state.buildings[i];
      if (b.team === foe && b.def.isBase && b.hp > 0) { fb = b; break; }
    }
    out.army = army;
    out.baseGuard = f.baseGuard || 0;
    out.naked = f.mineNaked || 0;
    if (!fb) return out;

    /* 推家门槛：兵力当量要明显压过基地周围塔火力；真实数值靠 ai-ladder 回归标定。
     * baseGuard 是「等级×火力」量级（单塔约 1~12），army 是「血量×dps/100」量级
     * （单兵约 0.3~3），所以系数取 2.6 —— 大致对应「三四个兵对一座塔」。 */
    var pushNeed = out.baseGuard * 2.6 + 2.0;
    out.push = Math.min(1, army / Math.max(0.001, pushNeed));

    if (nUnits >= 3 && army >= pushNeed) {
      out.mode = 'push';
      out.raidW = 0;                       // 实力够就直接推，不去分兵
      return out;
    }
    /* 啃不动基地：这时候拆矿是纯赚 —— 断对面经济，且裸矿不用顶着塔打 */
    if (f.mineBest && out.naked > 0) {
      out.mode = 'raid';
      /* 难度门槛：弱档只「顺手打」，强档才主动绕路去拆 */
      out.raidW = (P.raidW != null) ? P.raidW : 0.5;
      /* 己方越弱、对面矿越裸，越该去拆 */
      var weak = 1 - Math.min(1, army / Math.max(0.001, pushNeed));
      out.raidW *= (0.55 + 0.45 * weak);
      return out;
    }
    return out;
  }

  /* 敌方兵种占比（供 aiPickTower 预判 + 诊断脚本使用）。
   * 返回「累计在场秒数」和归一化占比，两者都保留：占比用于预判，秒数用于诊断。 */
  function foeShares(state, team) {
    var f = state.aiFoe && state.aiFoe[team];
    var out = {
      air: 0, ground: 0, siege: 0, ranged: 0, heavyG: 0, total: 0,
      airShare: 0, groundShare: 0, siegeShare: 0, rangedShare: 0, heavyGShare: 0
    };
    if (!f) return out;
    var total = 0, key;
    for (key in f.unitMix) {
      var v = f.unitMix[key];
      if (!(v > 1e-6)) continue;
      var d = DATA.units[key];
      if (!d) continue;
      total += v;
      if (d.air) out.air += v; else out.ground += v;                 // 地面 / 空中
      if (d.priority === 'siege') out.siege += v;                     // 攻城（专拆建筑）
      if (d.range > 1.5) out.ranged += v;                             // 远程
      if (d.armor >= 5 && !d.air) out.heavyG += v;                    // 地面硬皮（重甲/攻城车）
    }
    if (total > 1e-6) {
      out.total = total;
      out.airShare = out.air / total;
      out.groundShare = out.ground / total;
      out.siegeShare = out.siege / total;
      out.rangedShare = out.ranged / total;
      out.heavyGShare = out.heavyG / total;
    }
    return out;
  }

  /* 把「历史占比」换算成「当量兵力」，并与「这一帧的实况」取较大值。
   * PRED_EQ = 100% 占比对应几个兵的当量（≈ 一支小队）。
   * 意义：哪怕玩家此刻场上一个空军都没有，只要他最近一直在出空军，
   *       airEq 也已经有 3~4 —— AI 就会提前把对空塔补上（这就是「预判克制」）。 */
  var PRED_EQ = 6;
  function foeRead(state, team, A) {
    var sh = foeShares(state, team);
    return {
      airEq: Math.max(A ? A.air : 0, sh.airShare * PRED_EQ),
      groundEq: Math.max(A ? A.ground : 0, sh.groundShare * PRED_EQ),
      siegeEq: Math.max(A ? A.siegeType : 0, sh.siegeShare * PRED_EQ),
      rangedEq: Math.max(A ? A.ranged : 0, sh.rangedShare * PRED_EQ),
      heavyEq: sh.heavyGShare * PRED_EQ,
      airShare: sh.airShare, groundShare: sh.groundShare,
      siegeShare: sh.siegeShare, rangedShare: sh.rangedShare, heavyShare: sh.heavyGShare,
      total: sh.total
    };
  }

  /* ============================================================================
   * 战略层：局势评估 → 阶段划分 → 决定「这一步该把钱花在哪」
   *
   * 对齐过的总体思路：
   *   前期（经济期）    ：优先经济发展，防御只留最低限度，不主动进攻
   *   中期（巩固期）    ：补齐防线、升级主力建筑、继续扩经济
   *   中后期（形势判断期）：不再有固定套路，按「我和对手谁更强」实时决定
   *                        · 对手强   → 不主动出击，缩回来堆防御 + 囤资源 + 升科技
   *                        · 势均力敌 → 经济、升级、找机会进攻三件事按收益分配
   *                        · 对手弱   → 抓时机主动出击，集中兵力打弱点
   *
   * 难度决定「算得多细」：
   *   普通：只看阶段、不算双方实力对比（该退时不退，容易被抓）
   *   困难：会算实力对比，反应稍慢、分配比例较固定
   *   地狱：算得很细（经济/兵力/防御/科技四项），并且会集中兵力打弱点
   * ========================================================================== */

  /* 评估双方实力：经济、收入、兵力、科技、防御，各算一个综合分 */
  function assessPower(state, team) {
    var foe = OPP[team];
    function side(t) {
      var income = 0, towers = 0, mineLv = 0, bLevel = baseLevelOf(state, t);
      state.buildings.forEach(function (b) {
        if (b.team !== t) return;
        var inf = buildingInfo(state, b);
        if (inf.income) income += inf.income;
        if (b.def.atk) towers += (b.level || 1);
        if (b.key === 'mine') mineLv += (b.level || 1);
      });
      var army = 0, armyValue = 0, airUnits = 0;
      state.units.forEach(function (u) {
        if (u.team !== t || u.hp <= 0) return;
        army++;
        armyValue += u.def.cost * (u.hp / u.hpMax);   // 残血单位价值打折
        if (u.def.air) airUnits++;
      });
      var g = globalBonus(state, t);
      var tech = g.buildingAtk * g.buildingHp * g.unitAtk * g.unitHp;
      var base = ownBase(state, t);
      var baseHpPct = base ? (base.hp / base.hpMax) : 0;
      var score = income * 3 + armyValue * 0.02 + towers * 8 + bLevel * 6 +
                  Math.log(tech) * 10 + baseHpPct * 30 + mineLv * 2;
      return { income: income, towers: towers, army: army, armyValue: armyValue,
               airUnits: airUnits, bLevel: bLevel, tech: tech, baseHpPct: baseHpPct,
               mineLv: mineLv, score: score };
    }
    var me = side(team), you = side(foe);
    var ratio = you.score > 0.01 ? me.score / you.score : 2;
    var stance = ratio >= 1.25 ? 'ahead' : (ratio <= 0.8 ? 'behind' : 'even');
    return { me: me, foe: you, ratio: ratio, stance: stance };
  }

  /* 当前阶段 */
  function assessPhase(state, team, P, pw) {
    if (state.time < 55) return 'economy';
    if (state.time < 130 && pw.me.towers < 3) return 'economy';
    if (pw.me.towers < P.maxTowers && (state.time < 220 || pw.me.baseHpPct > 0.75)) return 'consolidate';
    return 'adapt';
  }

  /* 按阶段 + 形势，算出各类支出的意愿权重 */
  function planSpending(state, team, P, pw, phase) {
    var w;
    if (phase === 'economy') {
      w = { economy: 3.0, defense: 1.2, upgrade: 0.8, army: 0.4, tech: 0.5 };
    } else if (phase === 'consolidate') {
      w = { economy: 1.6, defense: 2.0, upgrade: 1.8, army: 0.9, tech: 1.0 };
    } else {
      if (pw.stance === 'behind') {
        w = { economy: 2.0, defense: 2.5, upgrade: 1.8, army: 0.5, tech: 1.6 };
      } else if (pw.stance === 'ahead') {
        w = { economy: 0.6, defense: 0.8, upgrade: 1.0, army: 2.5, tech: 1.0 };
      } else {
        w = { economy: 1.2, defense: 1.4, upgrade: 1.5, army: 1.2, tech: 1.2 };
      }
    }
    // 普通档：即便启用了 adaptive 以拿到收尾逻辑，平时支出仍保持温和（可被真人稳赢）。
    // 真正的「成建制推家」靠下面 allIn 冲锋（不受这里权重限制），这里只管平时发育别太凶。
    if (P.key === 'normal') w = { economy: 1.3, defense: 1.3, upgrade: 1.0, army: 1.1, tech: 0.7 };
    // 求生本能（所有难度都生效）：大本营快没了先自保
    if (pw.me.baseHpPct < 0.4) { w.defense *= 2.5; w.army *= 0.4; w.economy *= 0.6; }
    // 对面大本营快没了 → 全力收尾
    if (pw.foe.baseHpPct < 0.35) { w.army *= 3; w.defense *= 0.5; w.economy *= 0.3; }
    /* 关键：前期（经济期）也要看形势 —— 玩家明确要求
     * 「对手较强，我先发展经济和建设防御，不主动出击」。
     * 否则电脑前期被压着打还闷头发展，直接被推平，看起来就很蠢。 */
    if (P.adaptive && pw.stance === 'behind' && (phase === 'economy' || phase === 'consolidate')) {
      w.defense = Math.max(w.defense * 2.0, 2.2);   // 先立防线
      w.army = 0.3;                                 // 完全不主动出击
      w.tech = Math.max(w.tech, 1.0);
    }
    // 前期被压得很惨（兵都进家门了）→ 连经济都要让位给防御
    if (P.adaptive && pw.me.baseHpPct < 0.75 && (phase === 'economy' || phase === 'consolidate')) {
      w.defense = Math.max(w.defense * 1.6, 2.5);
      w.economy *= 0.5;
      w.army = Math.min(w.army, 0.4);
    }
    return w;
  }

  function aiThink(state, team) {
    if (state.over) return;
    var base = ownBase(state, team);
    if (!base) return;
    var P = aiPresetOf(state, team);
    var lvl = baseLevelOf(state, team);
    var A = analyzeBoard(state, team);
    var pw = assessPower(state, team);                  // 双方实力对比
    var phase = assessPhase(state, team, P, pw);        // 当前阶段
    var W = planSpending(state, team, P, pw, phase);    // 支出意愿权重
    var spendable = Math.max(0, state.res[team] - P.reserve);
    var sloppy = P.mistakeRate > 0 && rand(state) < P.mistakeRate;

    state.aiPlan = state.aiPlan || {};
    state.aiPlan[team] = {
      phase: phase, stance: pw.stance, ratio: Number(pw.ratio.toFixed(2)),
      weights: W, myScore: Number(pw.me.score.toFixed(1)), foeScore: Number(pw.foe.score.toFixed(1))
    };

    /* 决胜阶段（all-in / 收尾）：持续压制，不强行休整。
     *
     * 设计要点（实测教训）：
     *  - 冲锋必须「在主力成型之后」才触发（地狱档要求 ≥4 塔且场上 ≥5 兵且没落后），
     *    否则一开局就永久冲锋、经济永远起不来，反而谁都打不过。
     *  - 一旦触发就「持续压制」而非「冲一下歇一下」：歇的那段时间对面大本营会回血，
     *    等于白打，永远收不掉尾（普通/地狱对弱代理曾因此 100% 平局）。
     *  - 所以这里做成：条件满足就一直压（每轮窗口结束若仍满足条件立刻续上），
     *    条件不满足（被反推成 behind / 兵不够 / 对面血线拉回）自然停，回去补经济。
     *    这样「推家」和「发育」是交替的（赢的时候压、输了就补），而不是二选一。 */
    var PUSH_TIME = 45;
    state.aiPush = state.aiPush || {};
    var pushUntil = state.aiPush[team] || 0;     // 当前压制窗口的结束时刻

    var myUnits = A.myGround + A.myAir;
    var pushReady = false;
    // 「一波推平」的终局条件：对面大本营已经残了，不收就浪费机会
    var finishable = (pw.foe.baseHpPct < 0.5);
    if (P.allIn) {
      if (finishable) pushReady = true;
      // 基地已封顶且过了发育期 → 全力推家
      else if (lvl >= DATA.baseLevels.length && state.time > 120) pushReady = true;
      /* 主力成型 → 成建制持续冲锋（地狱档靠这条碾压困难）。
       * 实测教训：原来只看「≥4 塔 + ≥5 兵 + 没落后」，结果兵一成型就无脑冲，
       * 撞进对面 5~7 座塔里被吃光，白亏 45 秒发育，反而落后。
       * 现在改成「等真优势」：军力/经济综合分明显领先（pushLead），
       * 或者对面大本营已经掉血到 pushBaseHp 以下（这时冲是稳赚的）。 */
      var pushT = (P.pushTowers != null) ? P.pushTowers : 4;
      var pushU = (P.pushUnits != null) ? P.pushUnits : 5;
      var leadOk = (P.pushLead != null)
        ? (pw.ratio >= P.pushLead || pw.foe.baseHpPct < (P.pushBaseHp != null ? P.pushBaseHp : 0.85))
        : (pw.stance !== 'behind');
      if (A.towers >= pushT && myUnits >= pushU && leadOk) pushReady = true;
    } else if (P.adaptive) {
      // 困难/普通：确认（成军 + 自家安全）才持续收尾。
      // closeBase 现已统一设为 1.0 —— 即「对面大本营已掉血」这一前置条件失效，
      // 改为纯粹靠「兵够(closeArmy) + 自家安全」触发，避免对面血线卡高位永远触发不了收尾 → 龟缩平局。
      // 形势/强度仍由 stance 决定：pushIgnoreStance=true（普通）无视是否领先直接推（兵少先趁早翻盘）；
      // 否则 pushEven=true 在「平手」时也收尾，=false（困难）只在「领先(ahead)」时收尾 —— 对地狱(落后)永不主动推，保住阶梯。
      // 但无论如何都要保证自家大本营没快死（>closeStanceSafe，默认 -1 即不限制）才收尾，避免自杀式冲锋。
      var closeBase = (P.closeBase != null) ? P.closeBase : 0.6;
      var closeArmy = (P.closeArmy != null) ? P.closeArmy : 4;
      var myBaseSafe = pw.me.baseHpPct > (P.closeStanceSafe != null ? P.closeStanceSafe : -1);
      var stanceOk = P.pushIgnoreStance ? true
        : (P.pushEven ? (pw.stance !== 'behind') : (pw.stance === 'ahead'));
      if (myBaseSafe && pw.foe.baseHpPct < closeBase && myUnits >= closeArmy && stanceOk) pushReady = true;
    }
    // 开启/延续压制窗口：条件满足就一直压，不满足自然停（不强行休整，避免对面回血收不掉尾）
    if (pushReady && state.time >= pushUntil) {
      state.aiPush[team] = state.time + PUSH_TIME;
      pushUntil = state.aiPush[team];
    }
    // 持续压制中：集中推家（经济照常被动产出，不主动新建矿/塔/基地，避免自废武功）
    var allIn = (state.time < pushUntil);
    if (allIn) spendable = state.res[team];
    /* 压制期是否允许「顺手继续发育」：
     * 原来 allIn 是 100% 冻结（不建矿/不升科技/不升基地），一旦这波兵被对面防线吃掉，
     * 就白亏一整个窗口的发育，越打越落后（实测地狱 vs 困难只有 58%）。
     * 现在给强档一个开关：压制期仍然允许「建矿 / 升金矿 / 升总体科技」，
     * 只是不新建攻击塔和防御塔（那些是守家的，冲锋时不需要）。
     * 经济雪球不断 → 一波没打完，下一波更肥，长期硬实力碾压。 */
    var pushDev = allIn && !!P.pushDevelop;
    var freeze = allIn && !pushDev;    // freeze = 连发育都停（旧行为）

    /* 主力塔（等级最高的攻击塔）—— 科技时机判定（techReady）和后面
     * 「先精修还是先铺开」都要用它，所以必须在这里先算出来。
     * ⚠ 踩过的坑：原来这段放在第 1.5 节之前（techReady 之后），
     * 靠变量提升拿到的是 undefined → aceLvForTech 恒为 0 → techReady 恒 false
     * → 科技分支永远不触发（实测困难/地狱 400 秒科技全空）。 */
    var ace = null;
    state.buildings.forEach(function (b) {
      if (b.team !== team || b.def.isBase || !b.def.atk) return;
      if (!ace || (b.level || 1) > (ace.level || 1)) ace = b;
    });
    /* 科技是否「该硬推了」：主塔达标 + 塔数达标 —— 用户要求的正是这个时机
     * （"当主塔已达标 && 塔数达标时，每局至少把 4 项科技推到 3~5 级"）。
     * 判定只用公开信息（自己的塔等级/塔数/矿数），不偷看对手。 */
    var aceLvForTech = ace ? (ace.level || 1) : 0;
    /* 塔数门槛 3 座：这是"塔数达标"的下限口径。
     * ⚠ 试过放宽到 2，地狱 vs 困难直接从 83% 掉到 58%（开局就把建塔的钱挪去科技，
     *   防线没搭起来就开攒，等于自废武功）。所以保持 3 —— 宁可科技晚一点。 */
    var techReady = (aceLvForTech >= Math.min(2, P.aceTarget)) &&
                    (A.towers >= Math.min(3, P.maxTowers)) &&
                    (A.mines >= Math.min(2, P.maxMines));
    /* ★ v18：科技「时间兜底」★（用户反馈：部分对局面板停在 0/0/0/0）
     * 实测（10 seed × hell vs hard，跑满 800 秒）：地狱档 **4/10 局科技完全是 0**，
     * 平均只有 3.7 级 —— 甚至低于困难档的 4.3。原因就是上面那三条前置条件：
     * 对局在 400 秒内被推完时，「主塔 ≥2 + 塔 ≥3 + 矿 ≥2」经常一条都没凑齐过，
     * 于是科技窗口一次都没开过，钱全部进了军队。
     * 修法：给一条**时间兜底** —— 过了 techFallbackAt（默认 240 秒，也就是决胜时刻附近）
     * 之后，只要塔 ≥2、矿 ≥1 就让窗口打开。
     * 早期行为完全不动：那条"开局就把建塔钱挪去科技"的路实测会把地狱 vs 困难打到 58%，
     * 这里只保证中后期**一定有机会**投科技，而不是提前投。 */
    var techFallbackAt = (P.techFallbackAt != null) ? P.techFallbackAt : 240;
    var techReadyLate = state.time >= techFallbackAt &&
      A.towers >= Math.min(2, P.maxTowers) &&
      A.mines >= Math.min(1, P.maxMines);
    if (techReadyLate) techReady = true;

    /* ---------- 0.02) 军费专项预留：把「下一个兵种名额」的钱留住 ----------
     * 这是「AI 只会出两三种兵」的最后一颗钉子。
     * 实测（dev/_diag_ai.after1~4）：困难档金币长期在 20~170，因为
     *   ① canSpare 要 ≥110 才出兵、② 主塔升级只要 119、③ 杂项升级更便宜 ——
     *   钱每次刚过 100 就被其中一条花掉，昂贵兵种（气球 260 / 飞艇 240 / 重甲 280）
     *   在数学上永远买不起。
     * 做法：名额表里轮到贵兵时，从所有「建塔/升级」分支的预算里**扣掉这笔钱**
     *   （和 savedForBase 同款思路），让它真的攒得起来。等到钱够，名额表自然会买它。
     * 三条保险：① 最多预留 260（一只飞艇的钱，不会无限囤）；
     *          ② 只留 60% 可支配金额（保证还有钱补塔）；
     *          ③ 自家半场有 ≥2 个敌人 / 推家窗口 / 场上没兵 → 不预留。 */
    /* ---------- 0.021) 科技时间片：攒钱窗口 / 放养窗口交替 ----------
     * 为什么不是"一直攒"：实测（dev/_diag_ai.js 420s）纯硬保底会把现金全吸走 ——
     * 地狱档出兵掉到 22 只、只用到 **2 种兵**（步兵+攻城兵），正是用户抱怨的"两三种"；
     * 反过来"从不攒"则科技永远 0 级（420 秒 0/0/0/0）。
     * 收入是稳定的，所以按时间片分账：
     *   · 攒钱窗口（techWindow 秒）：把「够买当前最便宜那一项科技」的钱整笔锁住；
     *   · 买到 / 窗口到点 → 进入 techCool 秒**放养期**，这段时间的钱全归军队与建塔。
     * 判据全部是公开信息（自己的塔等级 / 塔数 / 矿数 / 现金 / 场上兵数）。
     * 配比实测（dev/_probe_sweep.js，6 seed × 2 对局，420 秒；格式=科技四项合计 / 用到的兵种数）：
     *   win/cool   困难            地狱
     *   26/8     4.3 级 · 3.5 种   5.5 级 · 4.2 种
     *   20/12    2.7 级 · 3.8 种   4.3 级 · 4.8 种   ← 取这一档（兵种多样性优先）
     *   14/18    1.3 级 · 4.2 种   3.7 级 · 4.7 种
     *   10/20    0.5 级 · 4.2 种   3.3 级 · 5.5 种
     * 也就是说：科技和兵种多样性在现经济下是**直接互斥**的（都要同一笔钱），
     * 20/12 是科技明显在推进、兵种还没塌的那个拐点。 */
    var twAll = state.aiTechWin || (state.aiTechWin = {});
    var tw = twAll[team] || (twAll[team] = { until: 0, cd: 0 });
    var techWinLen = (P.techWindow != null) ? P.techWindow : 20;
    var techCoolLen = (P.techCool != null) ? P.techCool : 12;
    var techSum0 = 0;
    Object.keys(DATA.globalUpgrades).forEach(function (gk) {
      techSum0 += (state.globalUp[team] && state.globalUp[team][gk]) || 0;
    });
    var techGoal0 = (P.techTarget != null) ? P.techTarget : 6;
    // 窗口到点没买到 → 放养，把钱让给军队（别死磕一个买不起的目标）
    if (tw.until && state.time >= tw.until) { tw.cd = state.time + techCoolLen; tw.until = 0; }
    var techCanGo = techReady && !freeze && A.inMyHalf < 3 && techSum0 < techGoal0;
    if (techCanGo && state.time >= tw.cd && !tw.until) tw.until = state.time + techWinLen;
    var techWinOn = !!(techReady && !freeze && tw.until && state.time < tw.until);

    /* ---------- 0.02) 军费专项预留：把「下一个兵种名额」的钱留住 ----------
     * 这是「AI 只会出两三种兵」的最后一颗钉子。
     * 实测：困难档金币长期在 20~170，因为
     *   ① canSpare 要 ≥110 才出兵、② 主塔升级只要 119、③ 杂项升级更便宜 ——
     *   钱每次刚过 100 就被其中一条花掉，昂贵兵种（气球 260 / 飞艇 240 / 重甲 280）
     *   在数学上永远买不起。
     * 做法：名额表里轮到贵兵时，从所有「建塔/升级」分支的预算里**扣掉这笔钱**
     *   （和 savedForBase 同款思路），让它真的攒得起来。等到钱够，名额表自然会买它。 */
    var savePot = state.aiSave || (state.aiSave = {});
    var pot = savePot[team];
    /* 科技窗口一开，就撤掉兵种攒钱目标 —— 否则它会横跨窗口期一直占着现金
     * （实测：兵种目标 cost 280、软预留 130 直接把窗口期现金压在 240 上下，
     *  科技 320 永远差一点，420 秒只买到 2 级）。 */
    if (techWinOn && pot) { pot = null; delete savePot[team]; }
    if (pot && (state.time > pot.until || state.res[team] >= pot.cost)) pot = null;
    if (!pot && !allIn) {
      var uSlot0 = aiRosterNext(state, team, A, P);
      /* 科技窗口开着的时候不另设兵种目标 —— 否则两个目标抢同一笔钱，谁也攒不够
       * （实测：兵种目标一直占着 pot，科技窗口再也开不出来，科技回到 0 级）。 */
      if (uSlot0 && uSlot0.cost >= 200 && !techWinOn) {
        pot = { kind: 'unit', key: uSlot0.key, cost: uSlot0.cost, until: state.time + 40 };
      }
      if (pot) savePot[team] = pot; else delete savePot[team];
    }
    /* 「正在攒钱买贵兵」的标记（aiDeploySmart 里设的，存活 8 秒）。
     * 它必须能压住「主塔升级 / 杂项升级 / 收尾升级」——
     * 实测教训：只压住第 8 节没用，钱在第 2、5 节就被升级吃掉了，
     * 于是每次都在超时后放弃名额，兵种永远轮不到（困难档只出步兵/攻城兵）。 */
    var hoardGate = !!(state.aiHoard && state.aiHoard[team] && state.aiHoard[team].until > state.time);
    var saveReserve = 0;
    var techHold = 0;
    /* 兵种攒钱目标的软预留（保持改造前的行为） */
    if (pot && A.inMyHalf < 3) {
      var potGap = Math.max(0, pot.cost - state.res[team]);
      if (potGap > 0) {
        var rr = (P.reserveRatio != null) ? P.reserveRatio : 0.5;
        saveReserve = Math.min(potGap, Math.round(spendable * rr));
        spendable = Math.max(0, spendable - saveReserve);
      }
    }
    /* 科技窗口：现金硬保底。可花的钱 = 现金 - 要锁的金额。
     * 和"升大本营"那套 saveForBase 同款 —— 那是本项目里唯一被证实真能攒到 320 金的机制。
     * ⚠ 踩过的坑一：写成 spendable -= gap 是错的（spendable 只是现金的一部分，
     *   减完剩下的仍可能远大于"现金 - 目标价"，这一 tick 又能把攒的钱花光）。
     * ⚠ 踩过的坑二：写成 max(0.4*res, res-cost) 会退化成"永远花 40%"，
     *   现金钉在目标价附近震荡，科技一级都升不上去。
     * 兵荒（场上兵数 < armyFloor）只锁一半：不然攒科技这十几秒里兵死光了也没人补。 */
    if (techWinOn) {
      var costNow = null;
      aiGlobalOrder(state, team, A).forEach(function (gk) {
        var c = globalUpgradeCost(state, team, gk);
        if (c != null && (costNow == null || c < costNow)) costNow = c;
      });
      if (costNow != null) {
        /* 兵荒（场上 0 个兵）：只锁一半 —— 真的空了得先补兵。
         * ⚠ 历史修正：曾经按 armyFloor 判定，等于"几乎永远兵荒" → 永远只锁一半 →
         *   现金被军队吸干，科技 600 秒只有 4 级。
         *
         * ★ v18（第三次修正，这次抓到了真凶）★
         * 把「凑小队」的第二只接上预算后，暴露出一个更严重的问题：
         * 科技窗口开着的时候 `spendable = 现金 - techHold` 会接近 0，
         * 而 armyCap = spendable × 军队桶比例(0.56) —— 于是**连一只步兵都买不起**。
         * 实测 hell vs hard：420 秒只出了 9 只兵，现金却在 79~286 之间干放
         * （兵荒 → 科技锁钱 → 军队 0 预算 → 更兵荒，正反馈）。
         * 现在按「场上兵数」分三档锁：
         *   ≤2 只 → 一分不锁（先补兵，命比科技重要）
         *   3~4 只 → 锁 50%
         *   ≥5 只 → 全额锁（够厚了，专心攒科技）
         * 这样既保住「科技不归零」，也不会把军队饿死。 */
        var myArmyEarly = A.myGround + A.myAir;
        var lockFrac = (myArmyEarly <= 2) ? 0 : (myArmyEarly <= 4 ? 0.5 : 1);
        var wantLock = Math.round(costNow * lockFrac);
        techHold = Math.min(wantLock, state.res[team]);
      }
    }
    var spendCap = Math.max(0, state.res[team] - techHold);
    if (spendable > spendCap) { saveReserve += spendable - spendCap; spendable = spendCap; }

    /* cashUsable：本次思考允许动用的现金上限（= 现金 - 科技保底）。
     * 传给 aiDeploySmart，堵住"名额表用真实现金判断、绕过一切预算"的漏洞。 */
    var cashUsable = Math.max(0, state.res[team] - techHold);
    /* 科技资金链插桩（只在测试脚本里打开 state.aiTechDebug 时记录，正式对局零开销） */
    if (state.aiTechDebug) {
      state.aiTechDebug.push({ t: Math.round(state.time), team: team, res: Math.round(state.res[team]),
        spendable: Math.round(spendable), pot: pot ? pot.kind : null,
        cost: pot ? pot.cost : 0, reserve: Math.round(saveReserve),
        ready: techReady, win: techWinOn, freeze: freeze, allIn: allIn, inMy: A.inMyHalf,
        aceLv: aceLvForTech, towers: A.towers, mines: A.mines });
    }

    /* techHold 在 0.02 节里就算好了（攒科技时锁住的那笔钱）。
     * 为什么必须单独列出来：升大本营（0.5 节）和「塔的地板」（第 6 节）都是用
     * state.res[team] 直接判断的，绕开了 spendable ——
     * 实测（dev/_diag_ai.js 420s）金币每次攒到 320 就被升大本营吃掉，
     * 科技的 320 永远差一点，两个目标互相抢钱、谁也升不上去。
     * 用户的要求也明确写着"不要和升大本营的钱抢"。 */

    /* ---------- 0) 经济：金矿是收入来源，优先级高于一切消费 ----------
     * 教训（实测抓到的死循环）：电脑的金币每次涨到 ~110 就被「补兵/补塔」花掉，
     * 而金矿要 150 —— 于是它一整局都建不出第二座矿，收入永远锁在 5 金/秒。
     * 所以这里定成**硬优先**：矿不够时必须攒钱，攒的过程中不派兵、不补塔。 */
    var mineCost = DATA.buildings.mine.cost;
    var incomeStarved = (A.mines < P.maxMines && W.economy >= 0.8 && !freeze);
    if (incomeStarved) {
      // ① 钱够了 → 立刻建矿（不看任何其它条件）
      if (spendable >= mineCost + 10) {
        var spotM0 = findSpot(state, team, 'mine', 'rear');
        if (spotM0 && placeBuilding(state, team, 'mine', spotM0.row, spotM0.col).ok) return;
      }
      // ② 钱还差点 → 这一步什么都不买，专门攒钱（只有「快被推平」时才破例去补防御）
      var urgent = (pw.me.baseHpPct < 0.7 || A.inMyHalf >= 3);
      if (!urgent && !pushDev) {
        // 连金矿升级也先等着，先把新矿建出来
        return;
      }
    } else if (A.mines < P.maxMines && W.economy >= 0.8 && !freeze && spendable >= mineCost + 10) {
      var spotM1 = findSpot(state, team, 'mine', 'rear');
      if (spotM1 && placeBuilding(state, team, 'mine', spotM1.row, spotM1.col).ok) return;
    }
    var mineB = state.buildings.filter(function (b) { return b.team === team && b.key === 'mine'; })[0];
    if (!freeze && mineB && (mineB.level || 1) < 5 && W.economy >= 0.9
        && (!P.baseFirst || lvl >= 3)) {
      var mc = buildingUpgradeCost(mineB);
      if (mc != null && spendable * P.upgradeBudget >= mc && upgradeBuilding(state, mineB).ok) return;
    }

    /* ---------- 0.5) 大本营升级：一个必须专门攒钱的硬目标 ----------
     * 实测教训（这次抓到的最大问题）：电脑的金币峰值就是开局那 260，
     * 而升大本营要 320 —— 于是它**一整局都升不了大本营**（实测 320 秒内峰值 263）。
     * 后果：收入一直卡在 3/秒、法术一直解锁不了、大本营一直 3200 血。
     *
     * 做法：前两座金矿立起来之后，「升大本营」升格为最高优先级的攒钱目标，
     * 钱没攒够的这段时间**冻结一切其它消费**（铺塔/防御塔/升级/出兵），
     * 只有「家快被推平」才破例。 */
    var baseUpCost = (lvl < DATA.baseLevels.length) ? DATA.baseLevels[lvl - 1].upgradeCost : null;
    // 只攒到 Lv3（前两级便宜、收益高：收入 3→4→5）。再往上 550/850/1250 太贵，
    // 一直攒会把塔和兵全饿死（实测：整局只有 2 座塔）。
    // 要求「金矿已经铺到本档上限」而不是硬写 2 —— 普通档上限只有 1 座，
    // 写死 >= 2 会让 baseGoal 永假，于是它既不升大本营也不建塔（实测死锁）。
    var mineDone = (A.mines >= Math.min(2, P.maxMines));
    // baseCap：愿意为「升大本营」攒钱到几级。默认 3（原行为）。
    // 强档可以调高：大本营血量本身就是决胜期的胜负手（决胜时刻双方对称烧血，
    // 谁血厚谁活到最后），所以地狱档的余钱应该往大本营上叠，而不是囤在手里发呆。
    var baseCap = (P.baseCap != null) ? P.baseCap : 3;
    var baseGoal = (baseUpCost != null && lvl < baseCap && mineDone && !allIn && P.upgradeBudget >= 0.5);
    /* + techHold：正在攒科技时不碰这笔钱（否则科技永远差一口） */
    if (baseGoal && state.res[team] >= baseUpCost + techHold) { if (upgradeBase(state, team).ok) return; }
    /* 攒钱方式：不是「冻结一切消费」（那样会一直囤着不花，实测发现金币涨到 200+ 却
     * 连塔都不补），而是留一笔**专项储备金** —— 手上始终保底攒着够升大本营的钱，
     * 超出的部分照常花。同时要求收入够高（≥12/秒，约 4 座金矿），
     * 否则前期攒 320 会让前线完全停摆。 */
    // 底线：手上至少要有一支能打的部队（3 座攻击塔），否则先补塔再谈攒钱。
    // 实测教训：不留底线的话，电脑会一路把大本营升到 Lv5，
    // 却一座攻击塔都没有（输出为 0，等于不设防）。
    var needTowersFirst = (A.towers < 3);
    /* baseSave（默认 true）：是否为升大本营「冻结式攒钱」。
     * 强档把它关掉 —— 它收入高，靠「钱够了就升」（上面那条 baseGoal && res >= baseUpCost）
     * 就能自然推进，不需要把 spendable 清零。清零的副作用很大：
     * savingForBase 会连带冻结补塔/升主塔/升建筑，实测地狱档因此 400 秒只有 3 座塔、
     * 主塔 2 级、囤着 250 金发呆，而困难档靠「犯错时顺手铺塔」铺到 5~7 座。 */
    /* 实测备注：试过「塔没到 4 座就不许为大本营冻结资金」，地狱 vs 困难 仍是 75%，
     * 兵种反而从 4.0 掉到 3.3 —— 说明塔数不是那 5 局的主因，已回退，不留无用分支。 */
    var wantSaveForBase = (P.baseSave !== false) && (baseGoal && !needTowersFirst && W.economy >= 0.8 &&
                           pw.me.income >= 12 && state.res[team] < baseUpCost);
    if (wantSaveForBase) spendable = Math.max(0, state.res[team] - baseUpCost);
    var savingForBase = (state.res[team] < baseUpCost && spendable <= 0 && baseGoal);
    /* 家里快被推平（很多分支要「破例」，所以提前算）。
     * 注意：原来这个变量是在第 7 段（派兵）才 var 声明的，而第 6 段（塔的地板）
     * 已经用到了它 —— 靠变量提升拿到的是 undefined，于是
     * 「钱不够建塔 → 这一轮什么都不干」这条把救场也一起冻死了，
     * emergency 在那个分支里形同虚设。这里提前到所有使用点之前。 */
    var emergency = (A.inMyHalf >= 3 || pw.me.baseHpPct < 0.5);

    /* ---------- 1) 威胁响应（最高优先级）----------
     * 阵地战逻辑：敌人已经打进我家半场时，先解决眼前的问题，
     * 而不是按部就班发展经济。
     *   ① 眼前有能打到的敌人 → 立刻丢法术（冰冻/火球/弱化都能救场）
     *   ② 塔不够 → 立刻补塔（防线不破才谈得上发展）
     * 这一段是「困难/地狱」才有的反应；普通档反应迟钝（所以好打）。 */
    var threatNow = (A.inMyHalf >= 2);
    if (P.adaptive && threatNow) {
      if (rand(state) < 0.8) { if (aiCastSpell(state, team, P, A, spendable)) return; }
      var towerCapT = Math.round(P.maxTowers * 1.6) + 2;      // 紧急时允许超建
      if (A.towers < towerCapT) {
        var pickT = aiPickTower(state, team, A, false, P);
        var costT = DATA.buildings[pickT].cost;
        if (spendable >= costT) {
          var spotT = findSpot(state, team, pickT, 'front');
          if (spotT && placeBuilding(state, team, pickT, spotT.row, spotT.col).ok) return;
        }
      }
    }

    /* ---------- 1.5) 总体升级（全局科技）：独立预算 + 排在「补塔/升主塔」之前 ----------
     * 实测根因（dev/_diag_ai.js 基线）：
     *   · 困难档：420 秒科技只有 2/2/2/2，且 0~240 秒全程 0 级；
     *   · 地狱档：3 局里 2 局 420 秒全程 0/0/0/0。
     *   · 原因：科技排在「主塔升级」之后，而主塔升级只要 119~344 金、永远更便宜，
     *     每次 aiThink 都是主塔先把钱吃掉 → 260 金的科技永远攒不出来。
     * 修法：科技提到主塔之前；每档给一个 techTarget（四项等级之和）作为目标；
     *      升完留一笔 techCushion（不给 0 的话它会和建塔/出兵抢钱）。
     *      全部判据只用公开信息（自己的金币、自己的等级、塔数、矿数）。
     * 注意：推家窗口（freeze）默认不升科技 —— 推家期纯出兵是设计意图。
     *      但强档（pushTech）允许「科技离目标还差 4 级以上」时在推家期顺手补一级：
     *      实测困难档对着弱代理，一局 237 秒就推完了，全程都在 allIn 推家窗口里，
     *      于是科技永远 0 级 —— 玩家看到的就是"电脑从不总体升级"。 */
    var gOrder = freeze ? [] : aiGlobalOrder(state, team, A);
    var gSum = 0;
    Object.keys(DATA.globalUpgrades).forEach(function (gk) {
      gSum += (state.globalUp[team] && state.globalUp[team][gk]) || 0;
    });
    var techTarget = (P.techTarget != null) ? P.techTarget : 6;
    var techCushion = (P.techCushion != null) ? P.techCushion : 0;
    /* 推家期的科技豁免：只在「该推科技了 + 还差 4 级以上 + 有钱」时生效，
     * 而且不改 allIn 的资金池（money 依旧全是这场会的军费），
     * 所以不会把推家波次拆散 —— 只是把"这一波多一只兵"换成"永久 +15% 攻击"。 */
    var techPushOk = freeze && !!P.pushTech && techReady &&
                     (techTarget - gSum >= 4) && gOrder.length === 0;
    if (techPushOk) gOrder = aiGlobalOrder(state, team, A);
    /* 买哪一项 = 排序表里的**第一项**（aiGlobalOrder 已按"等级最低优先、同级便宜优先"排好）。
     * 原来是"四选一里最便宜的"，实测会偏科：uAtk/uHp 基础价 220、bAtk/bHp 260，
     * 于是 uAtk 一路先到 2 级，面板上看起来"只升了两项"（实测 1/1/2/1）。
     * 现在等级最低的那项永远排第一 → 四项轮着点亮，不会长期留 0 级。 */
    var gPick = null;
    for (var gi = 0; gi < gOrder.length; gi++) {
      var gc = globalUpgradeCost(state, team, gOrder[gi]);
      if (gc != null) { gPick = { key: gOrder[gi], cost: gc }; break; }
    }
    /* 科技窗口开着时，可以用回被锁住的那笔钱（它就是为科技存的）；
     * 窗口没开时只能用正常的 spendable —— 保证窗口外军队和塔有钱。
     * 若还用扣完预留的 spendable 判断，会出现「攒够了却因为 spendable 变小买不起」的死循环。 */
    var techSpend = techWinOn ? Math.max(spendable + saveReserve, state.res[team] - P.reserve)
                              : spendable;
    /* 首次点亮（该项还是 0 级）不等 cushion：cushion 的目的是「升完还留点钱出兵」，
     * 但一个 0 级项长期点不亮的问题更严重 —— 实测困难档有一局 410 秒结束时
     * bAtk/bHp 里只有 bAtk 亮了，bHp 因为差 39 金（261 < 260+40）一直挂 0。
     * 改成 0 级项的判定线 = 恰好够成本，钱到了就立刻点亮，不给「差一点点」留窗口。
     * 这不改任何成本、不改总预算 —— 只是把同一笔钱提前 1 个 tick 花出去。 */
    var gPickLv = (state.globalUp[team] && state.globalUp[team][gPick && gPick.key]) || 0;
    var cushFor = (gPickLv <= 0) ? 0 : techCushion;
    if ((!freeze || techPushOk) && techTarget > gSum && gPick && techReady && techWinOn &&
        techSpend >= gPick.cost + cushFor) {
      if (upgradeGlobal(state, team, gPick.key).ok) {
        /* 买完立刻进入放养期：下一笔钱先给军队/建塔，别连着把现金吸干
         * （时间分片的另一半 —— 没有这句的话，买完马上又开一个攒钱窗口）。 */
        tw.cd = state.time + techCoolLen;
        tw.until = 0;
        delete savePot[team];
        return;
      }
    }

    /* ---------- 1.5) 防线：按敌方构成针对性补塔 ----------
     * 塔数量上限跟着「防御权重」走，否则权重再高、撞到 maxTowers 也建不出来。
     *
     * 关键修正（实测抓到的"铺大饼"问题）：电脑曾经把 8 座金矿赚来的近 2 万金币
     * 全铺成 8 座「一级防御塔」，而它的输出塔只有 Lv3、大本营还是 Lv1 ——
     * 结果谁也打不过（地狱 vs 普通 只有 38%）。
     * 所以：先保证有 3 座能打的塔，**之后必须先把手上的塔升上去，才允许继续铺新的**。
     * 广铺低级塔 < 精修高级塔（等级 5-10 每级 ×1.3，Lv10 的攻击是 Lv1 的 8 倍）。 */
    var towerWant = Math.max(1, Math.round(P.maxTowers * Math.min(1.7, W.defense / 1.5)));
    // 底线：至少要有 min(2, 上限) 座攻击塔。注意不能写死 3 ——
    // 普通档上限只有 2 座，写死 3 会导致它永远达不到底线，结果一座塔都不建（实测 bug）。
    var needBaseLine = (A.towers < Math.min(2, P.maxTowers));
    var aceLvNow = ace ? (ace.level || 1) : 0;
    // 地狱档 aceTarget 很高（10），若卡死在「主塔没满就不铺第 3 座塔」，会全程只建 2 座塔、
    // 覆盖面严重不足而被困难档（铺 5 座）滚雪球（实测地狱 vs 困难仅 25%）。
    // wideAt（默认 min(aceTarget, 4)）：主塔升到 wideAt 级就开始铺第 3+ 座塔，主塔仍继续升到 aceTarget，
    // 两者并行 → 既有满级主塔又有足够覆盖面。困难/普通不受影响（其 aceTarget 本就 ≤4）。
    var wideAt = (P.wideAt != null) ? P.wideAt : Math.min(P.aceTarget, 4);
    var wantWide = (aceLvNow >= wideAt) || sloppy;

    /* ---------- 0.03) 应急防守（v13）----------
     * 用户诉求：「敌人对大本营发起较大层面进攻时，要建造可以攻击到敌人的建筑
     * 防御来保住大本营」。原实现没有这条：敌兵压到脸上时，AI 仍按 maxTowers 上限
     * 与「主塔先升满再铺开」的节奏走，正好在最该补防的时刻选择攒钱。
     * 判据全部是公开信息：己方半场敌兵数 + 最近敌兵距离 + 自家大本营血量比例。
     * 触发后允许**突破 towerWant 上限**（最多 +2 座），并强制走 front 区；
     * 具体落点由 scoreCell 的 ⑧ 威胁覆盖项决定（会优先挑盖得住来袭敌兵的格）。 */
    var emergency = false;
    if (!allIn) {
      var tNear = 0, dNear = 99, ei;
      for (ei = 0; ei < state.units.length; ei++) {
        var eu = state.units[ei];
        if (eu.team === team || eu.hp <= 0) continue;
        var db0 = Math.max(Math.abs(eu.row - BASE_RECT[team].r1),
                           Math.abs(eu.col - (BASE_RECT[team].c1 + BASE_RECT[team].c2) / 2));
        if (db0 <= 4) { tNear++; if (db0 < dNear) dNear = db0; }
      }
      emergency = (tNear >= 3 && dNear <= 2) || (tNear >= 1 && pw.me.baseHpPct < 0.35);
    }
    if (emergency && A.towers < towerWant + 1) {
      var eKey = aiPickTower(state, team, A, sloppy, P);
      if (spendable >= DATA.buildings[eKey].cost + 6) {
        var eSpot = findSpot(state, team, eKey, 'front') || findSpot(state, team, eKey, 'mid');
        if (eSpot && placeBuilding(state, team, eKey, eSpot.row, eSpot.col).ok) return;
      }
    }

    if (!allIn && !savingForBase && A.towers < towerWant && (needBaseLine || wantWide)) {
      var pickKey = aiPickTower(state, team, A, sloppy, P);
      if (spendable >= DATA.buildings[pickKey].cost + 10) {
        var zone = (A.inMyHalf > 0 || pw.stance === 'behind') ? 'front' : 'mid';
        var spot0 = findSpot(state, team, pickKey, zone);
        if (!spot0) spot0 = findSpot(state, team, pickKey, 'mid');
        if (spot0 && placeBuilding(state, team, pickKey, spot0.row, spot0.col).ok) return;
      }
    }
    // 防御塔（减伤光环）：劣势时值得建，但**必须有上限**。
    // 实测教训：曾经把 52% 的钱（2588 金）全铺成防御塔，而升级只花了 6% ——
    // 防御塔一点输出都没有，铺再多也打不赢。所以最多 1~3 座。
    var wardCap = P.wardCap || 0;   // 硬上限，不再按权重浮动（否则弱档反而铺最多）
    var wardNow = state.buildings.filter(function (b) { return b.team === team && b.key === 'ward'; }).length;   // 直接数，别信 A.wards
    // 攒钱升大本营期间也不铺防御塔（否则钱永远攒不到 320）
    var urgentWard = (A.inMyHalf >= 3 || pw.me.baseHpPct < 0.5);
    if (!allIn && (!savingForBase || urgentWard) && A.towers >= 2 && wardNow < wardCap
        && spendable >= DATA.buildings.ward.cost) {
      var spotW0 = findSpot(state, team, 'ward', 'defend');
      if (spotW0 && placeBuilding(state, team, 'ward', spotW0.row, spotW0.col).ok) return;
    }

    /* ---------- 1.7) 军力地板：兵数不足下限时，出兵优先于「主塔/杂项升级」----------
     * 实测根因（dev/_diag_ai.js 基线，困难 vs 代理 3 局 420 秒）：
     *   · 出兵 **0 只 / 420 秒**。
     *   · 不是 aiDeploySmart 坏了（它根本没被调用：dbg 记录 0 条），
     *     而是它排在「主塔升级(119 金)」「杂项升级 aiUpgradeAny」之后，
     *     而那两条都比 260/119 便宜、每次都能花掉钱 → 派兵分支永远走不到。
     *   · 玩家看到的就是"电脑不出兵 / 只出两三种"。
     * 修法：把「补到军力下限」提到升级之前。它只在兵数低于 armyFloor 时触发，
     *      所以不会把资源全变成小兵（兵的 CD 也自然限流）。 */
    var armyFloorNow = (P.armyFloor != null) ? P.armyFloor
      : ((P.key === 'hell') ? 3 : (P.key === 'hard' ? 2 : 1));
    var myArmyNow = A.myGround + A.myAir;
    var armyMinResNow = (P.armyMinRes != null) ? P.armyMinRes : (DATA.buildings.cannon.cost + 40);
    /* 触发门槛用 min(2, armyFloor)：这一节只是「别让升级把钱全吃光、兵一个都没有」的
     * 兜底，不是常规出兵口（常规出兵在第 7 节，那里才有 wantTroops/armyCap 的完整判断）。
     * 实测教训：用 armyFloor（地狱 4）做门槛会让它变成主出兵口 ——
     * 地狱档 420 秒连出 40 个廉价兵，科技与建塔全饿死，对困难 0/3 胜。 */
    if (!allIn && !savingForBase && myArmyNow < Math.min(2, armyFloorNow) &&
        state.res[team] >= armyMinResNow) {
      var floorCap = Math.max(0, Math.min(spendable, state.res[team]));
      if (aiDeploySmart(state, team, A, P, sloppy, floorCap, cashUsable)) return;
    }

    /* ---------- 2) 主塔养成：推到难度允许的等级，分支按局势选 ---------- */
    if (!allIn && !savingForBase && ace && (ace.level || 1) < P.aceTarget && W.upgrade >= 1.0) {
      var aceCost = buildingUpgradeCost(ace);
      if (aceCost != null && spendable * P.upgradeBudget >= aceCost) {
        var opts = branchesFor(ace);
        var br = null;
        if (opts.length) br = sloppy ? opts[Math.floor(rand(state) * opts.length)].key : aiPickBranch(ace, opts, A);
        if (upgradeBuilding(state, ace, br).ok) return;
      }
    }

    /* ---------- 3) 大本营升级：解锁法术 + 提高收入 ---------- */
    if (!allIn && lvl < DATA.baseLevels.length && A.towers >= 2) {
      var upCost0 = DATA.baseLevels[lvl - 1].upgradeCost;
      var wantBase = (P.key === 'hell') ? 1.0 : (P.key === 'hard' ? 1.15 : 1.6);
      if (upCost0 != null && spendable >= upCost0 * wantBase && upgradeBase(state, team).ok) return;   // 兜底
    }

    /* ---------- 4) （已并入 1.8 节）总体升级现在排在主塔升级之前 ----------
     * 老实现在这里、用 upPool = spendable * upgradeBudget(×0.45 when pushDev)，
     * 实测几乎永远达不到 260 金的门槛（主塔升级在前面把钱吃光了）。
     * 现在统一由 1.8 节处理，这里不再重复尝试，避免同一轮里出现两套判据。 */

    /* ---------- 5) 其他建筑升级 ---------- */
    /* 科技还有缺口时，杂项升级只用一半预算 —— 否则它会把「攒给科技的那笔钱」花掉，
     * 科技又会回到"永远差一点"的状态（实测：困难档 0~240 秒科技全 0 级）。 */
    var miscPool = spendable * P.upgradeBudget * ((techTarget > gSum) ? 0.5 : 1);
    if (!allIn && !savingForBase && !hoardGate && W.upgrade >= 1.2 && rand(state) > (P.key === 'normal' ? 0.45 : 0.1)) {
      if (aiUpgradeAny(state, team, miscPool)) return;
    }

    /* ---------- 6) 法术 ---------- */
    if (rand(state) < P.spellEager) {
      if (aiCastSpell(state, team, P, A, spendable)) return;
    }

    // 塔的地板：连 1~2 座攻击塔都没有时，优先攒钱建塔，不许把金币全变成步兵
    // （实测：普通档 100 秒内连出 7 个步兵，一座塔都没建）
    var aaNow = 0, goNow = 0;
    state.buildings.forEach(function (b) {
      if (b.team !== team || !b.def.atk || b.def.isBase) return;
      if (b.def.targets === 'both') aaNow++; else goNow++;
    });
    var towerFloor = Math.min(2, P.maxTowers);
    var needTowerFirst = (A.towers < towerFloor || aaNow === 0 || goNow === 0);
    if (needTowerFirst) {
      var pkT = aiPickTower(state, team, A, sloppy, P);
      var costT = DATA.buildings[pkT].cost;
      /* + techHold：攒科技时不许动那笔钱（原来这里用 state.res 直接判断，
       * 是窗口期最大的一个漏点 —— 实测窗口内建塔照样花掉 1620 金，科技永远差一口）。 */
      if (state.res[team] >= costT + techHold) {   // 用真实金币判断，不用 spendable
        var spT = findSpot(state, team, pkT, 'front');
        if (!spT) spT = findSpot(state, team, pkT, 'mid');
        if (!spT) spT = findSpot(state, team, pkT, 'defend');
        if (spT && placeBuilding(state, team, pkT, spT.row, spT.col).ok) return;
      }
      // 钱不够建塔 → 这一轮不干别的，专门攒钱（家里快被推平时破例）
      if (state.res[team] < costT + techHold && !emergency) return;
    }
    /* ---------- 7) 派兵：按形势决定「派不派」----------
     * 教训：如果判定成「兵不够就一直派」，电脑会把每一分钱变成步兵，
     * 永远攒不到钱补第二座金矿和塔（实测卡死在「1 塔 1 矿 + 无限步兵」）。
     * 所以军费有上限（默认 40%，pushDevelop 档可以更高），且前期经济权重低时几乎不出兵。 */
    /* 军费可以用「预留给名额表」的那笔钱（unitReserve 本来就是给兵留的） */
    var armySpend = spendable + ((!allIn && pot && pot.kind === 'unit') ? saveReserve : 0);
    var armyBase = allIn ? spendable
      : (P.armyWhileSaving ? Math.max(armySpend, state.res[team]) : armySpend);
    /* ★ v18：三桶预算（军队 / 建筑 / 科技）取代原来的单一 armyShare ★
     * armyCap 由 aiBudgetPlan 给出：
     *   稳态 = armyBase × 军队桶比例；名额表轮到贵兵时会被「席位补足」抬到它的价钱。
     * buildCap 是建筑桶额度（补塔/额外防御塔从这里出，不许无限挤占军队）。 */
    var BP = aiBudgetPlan(state, team, A, pw, P, {
      spendable: spendable, armyBase: armyBase, techWinOn: techWinOn, allIn: allIn
    });
    var armyCap = allIn ? spendable : BP.armyCap;
    var buildCap = BP.buildCap;
    var myArmy = A.myGround + A.myAir;
    // armyFloor：平时希望场上有几个兵。兵死了立刻补，才能形成「持续压制」而不是「一波流」。
    // 实测教训：地狱档原来 armyFloor=3，经济 24/秒却只留 3 个兵，钱全囤在手里发呆。
    var armyFloor = (P.armyFloor != null) ? P.armyFloor : ((P.key === 'hell') ? 3 : (P.key === 'hard' ? 2 : 1));
    var hasBasics = A.towers >= 2 && A.mines >= 2;
    var rich = state.res[team] >= 300;
    // canSpare：手上留一点余钱才出兵（避免把金币清零导致永远建不起矿/塔）。
    // 普通档调低（armyMinRes）：它收入极低，用困难档的门槛会导致它一整局出不了几个兵 → 龟缩平局。
    var canSpare = state.res[team] >= (P.armyMinRes != null ? P.armyMinRes : DATA.buildings.cannon.cost + 40);
    var aggression = allIn ? 1 : (W.army / 1.5);
    var wantTroops = (allIn || !hasBasics || rich
      || (myArmy < armyFloor * Math.max(0.5, aggression))
      || (phase === 'adapt' && pw.stance === 'ahead' && myArmy < 8));
    // 正在攒钱升大本营时不出兵（除非家里快被推平）。
    // armyWhileSaving：强档不受这条限制 —— 它收入高，攒大本营的同时完全养得起兵。
    // 实测教训：地狱档经济 24/秒，却因为「攒 550 升 Lv3」把出兵冻结到 420 秒，
    // 全场前 400 秒零压力，决胜期双方对称烧血 → 变成掷硬币（地狱 vs 困难只有 58%）。
    /* ★ 轮 8 修正：这条原来会把「兵已经打光了」的档也一起冻住 ——
     * 实测困难档 420 秒出兵 0 只就是这么来的（baseGoal 一真就一直不出兵）。
     * 现在只在「场上还有兵（≥ 军力下限）」时才为了攒大本营而暂停补兵；
     * 兵没了必须先补，否则家被人推平的时候手里一分钱没花出去。 */
    if (baseGoal && !emergency && state.res[team] < baseUpCost && !P.armyWhileSaving
        && myArmy >= armyFloor) wantTroops = false;

    /* ---------- 7.1) 成建制出兵（反「送死」）----------
     * 用户反馈：「会有一定的"送死"派兵」。实测基线（dev/_diag_ai.js）：
     *   地狱 vs 困难 3 局，40.2% 的兵**从未进入敌方半场**，就是出门被塔一个个吃掉。
     * 根因：每 5 秒出 1 只，单兵走到对面 5~7 座塔的覆盖区 → 必然被各个击破。
     * 修法（两条，只看自己的金币/CD/DATA 表，不偷看敌方）：
     *   ① 空场时先攒够「能连出 2 只」的钱再出门 —— 单兵不出门；
     *   ② 一旦出门就进入 8 秒「集结窗口」：窗口内军费比例放宽（0.85），
     *      把 2~3 只兵压在几秒内一起放出去，形成小队而不是一字长蛇。
     * 推家窗口（allIn）不适用：那时本来就在全力出兵。 */
    var sq = state.aiSquad || (state.aiSquad = {});
    var sqt = sq[team] || (sq[team] = { until: 0 });
    if (!allIn) {
      /* 集结窗口的三个保险（实测教训）：
       *   ① 只在「经济已经立起来」时开（矿/塔达标）——否则前期会为了凑小队把
       *      建矿升本的钱全变成兵（地狱档因此 420 秒出 98 只兵、大本营只有 2 级、
       *      对困难从 2/3 胜掉到 0/3 胜）；
       *   ② 每 20 秒最多开一次（有冷却）；
       *   ③ 军费只放宽到 65%（不是 100%），给经济留活路。 */
      var squadReady = (A.mines >= Math.min(2, P.maxMines) && A.towers >= Math.min(2, P.maxTowers));
      if (myArmy === 0 && squadReady && state.time >= sqt.until + 20) {
        var readyCosts = [];
        Object.keys(DATA.units).forEach(function (uk) {
          if (isUnitReady(state, team, uk)) readyCosts.push(DATA.units[uk].cost);
        });
        readyCosts.sort(function (a, b) { return a - b; });
        var twoCost = (readyCosts[0] || 0) + (readyCosts[1] || readyCosts[0] || 0);
        if (state.res[team] < twoCost && !emergency) wantTroops = false;
        else sqt.until = state.time + 8;                       // 开集结窗口
      }
      if (state.time < sqt.until) {
        armyCap = Math.max(armyCap, Math.floor(spendable * 0.65));
      }
    }

    if (wantTroops && canSpare && aiDeploySmart(state, team, A, P, sloppy, armyCap, cashUsable)) return;

    /* ---------- 8) 钱花不掉：升级建筑，最后才考虑加防御塔 ---------- */
    /* 正在「攒钱出高价值兵」时不乱花（否则 aiDeploySmart 攒下的钱会在这一节被
     * 杂项升级吃掉，高价兵永远买不起 —— 这正是实测里 4 种兵 0 出场的原因）。 */
    if (!hoardGate && spendable >= 120 && aiUpgradeAny(state, team, spendable)) return;
    var wardNow8 = state.buildings.filter(function (b) { return b.team === team && b.key === 'ward'; }).length;
    /* 防御塔是「锦上添花」，只从**建筑桶**出钱 —— 军队桶的钱不许被它抢走。
     * 这是三桶预算里唯一被强制执行的额度（其余两桶靠比例 + 席位补足引导）。 */
    if (buildCap >= DATA.buildings.ward.cost && A.towers >= 2 && wardNow8 < (P.wardCap || 0)) {
      var spotW = findSpot(state, team, 'ward', 'defend');
      if (spotW && placeBuilding(state, team, 'ward', spotW.row, spotW.col).ok) return;
    }
  }


  /* 分支怎么选：看局势 —— 对面兵多选群攻/攻速，单体肉多选爆发 */
  function aiPickBranch(b, opts, A) {
    var byKey = {};
    opts.forEach(function (o) { byKey[o.key] = o; });
    var want = null;
    if (b.def.key === 'cannon') want = (A.ground + A.air >= 4) ? 'twin' : 'bigcannon';
    else if (b.def.key === 'arrow') want = (A.air >= 2) ? 'rapid' : 'crossbow';
    else if (b.def.key === 'mage') want = (A.ground + A.air >= 5) ? 'white' : 'black';
    else if (b.def.key === 'mortar') want = (A.inMyHalf >= 3) ? 'bigmortar' : 'missile';
    else if (b.def.key === 'tesla') want = (A.ground + A.air >= 6) ? 'pulse' : 'bigtesla';
    else if (b.def.key === 'ward') want = (A.inMyHalf >= 2) ? 'bunker' : 'crystal';
    if (want && byKey[want]) return want;
    return opts[0].key;
  }

  /* 总体升级优先级：劣势先补血，快赢就堆攻击 */
  function aiGlobalPriority(A) {
    /* ★ v14：加入第五项「派兵冷却」。它是纯粹的出兵效率项，任何局势都有用，
     * 但劣势时（要顶住推进）价值低于血线，优势时价值低于攻击 —— 所以排中间。 */
    if (A.myBaseHp < 0.6 || A.inMyHalf >= 3) return ['bHp', 'uHp', 'uAtk', 'bAtk', 'cdReduce'];
    if (A.foeBaseHp < 0.5) return ['uAtk', 'bAtk', 'cdReduce', 'uHp', 'bHp'];
    return ['uAtk', 'cdReduce', 'uHp', 'bAtk', 'bHp'];
  }

  /* 科技升级的**均衡排序**：先升「当前等级最低」的那一项，同级时便宜的先升，
   * 再同级同价才看上面的形势权重（劣势偏 bHp/uHp，优势偏 bAtk/uAtk）。
   *
   * 为什么必须按等级排：玩家的怨言是「好像不会总体升级」，看的是面板上四项。
   * 旧逻辑是「四项里挑最便宜的」，而 uAtk/uHp 基础价 220、bAtk/bHp 260 ——
   * 于是 uAtk 会连续吃到 2 级，面板长成 1/1/2/1，看起来像"只升了两项"（实测）。
   * 按等级优先排之后，任何一项只要比别人低一级就永远排第一，
   * 四项会轮着点亮：0→1/1/1/1 → 2/2/2/2 → 3/3/3/3 …（实测 600 秒 2/2/2/2）。
   * 只改"先升哪个"，不改任何费用/数值。 */
  function aiGlobalOrder(state, team, A) {
    var base = aiGlobalPriority(A);
    /* 键列表直接取自数据表 —— 加第 5 项（cdReduce）时不必再回来改这里。
     * 旧实现把四项写死，漏改就会让新项永远排最后、AI 一次都不升。 */
    var keys = Object.keys(DATA.globalUpgrades);
    var lv = {}, cost = {};
    keys.forEach(function (k) {
      lv[k] = (state.globalUp[team] && state.globalUp[team][k]) || 0;
      cost[k] = globalUpgradeCost(state, team, k);
    });
    return keys.slice().sort(function (a, b) {
      if (lv[a] !== lv[b]) return lv[a] - lv[b];                    // ① 等级低者优先
      var ca = (cost[a] == null) ? Infinity : cost[a];
      var cb = (cost[b] == null) ? Infinity : cost[b];
      if (ca !== cb) return ca - cb;                               // ② 同级里便宜的优先
      return base.indexOf(a) - base.indexOf(b);                    // ③ 再按形势权重
    });
  }

  /* 针对性选塔：按敌方构成（困难/地狱档才动脑，普通档随机）
   *
   * ★ 强制保证「对地 + 对空」两种都有 ★
   * 实测问题：只按"当前有没有空中威胁"来选塔，会导致电脑清一色造炮塔（只对地），
   * 玩家一旦出气球兵/飞龙/攻城飞艇就能直接打穿 —— 这不叫防御，叫单边。
   * 所以先做配比检查：只要某一边为 0，就优先补那一边。 */
  /* 选塔的唯一出口 —— 包一层，只为**诊断插桩**（默认关闭，逻辑零改动）。
   *
   * state.aiTowerDebug 是个数组时，每次真被调用都记一条：
   *   当时的「对手空军历史占比 airShare」/「这一帧场上空军数 fieldAir」/
   *   「最终选中的塔」/「它是不是对空塔 antiAirPick」/「命中了哪条规则 rule」。
   * 用途：dev/_diag7.js 在**真实对局**里按 airShare 分桶，统计「选中对空塔的比例」，
   *      证明预判克制不是只在受控考卷里成立（上一轮 diag6 的 C 只有受控实验）。
   * 注意：插桩里不能调 rand()，否则会改变对局本身的随机序列。 */
  function aiPickTower(state, team, A, sloppy, P) {
    var res = aiPickTowerCore(state, team, A, sloppy, P);
    if (state.aiTowerDebug && state.aiTowerDebug.push) {
      var sh = foeShares(state, team);
      var pd = DATA.buildings[res.key];
      var aaOwn = 0, goOwn = 0;
      state.buildings.forEach(function (b) {
        if (b.team !== team || !b.def.atk || b.def.isBase) return;
        if (b.def.targets === 'both') aaOwn++; else goOwn++;
      });
      state.aiTowerDebug.push({
        t: Math.round(state.time * 10) / 10, team: team, pick: res.key, rule: res.rule,
        antiAirPick: !!(pd && pd.targets === 'both'),
        airShare: sh.airShare, groundShare: sh.groundShare,
        airEq: Math.max(A ? A.air : 0, sh.airShare * PRED_EQ),
        fieldAir: A ? A.air : 0, fieldGround: A ? A.ground : 0,
        aaOwn: aaOwn, goOwn: goOwn, diff: P ? P.key : ''
      });
    }
    return res.key;
  }

  /* 真正的选塔决策。返回 { key, rule }：rule 只用于诊断，标明命中哪条分支。 */
  function aiPickTowerCore(state, team, A, sloppy, P) {
    /* 先算现有构成 —— 即使是最笨的档，也要保证「对空 / 对地」两边都不为 0，
     * 否则玩家出空中单位就能单方面打穿（实测：普通档清一色炮塔）。 */
    var aaN = 0, goN = 0;
    state.buildings.forEach(function (b) {
      if (b.team !== team || !b.def.atk || b.def.isBase) return;
      if (b.def.targets === 'both') aaN++; else goN++;
    });
    if (aaN === 0) return { key: 'arrow', rule: 'no-aa' };      // 还没对空 → 必补对空
    if (goN === 0) return { key: 'cannon', rule: 'no-ground' }; // 还没对地 → 必补对地
    if (sloppy || !P.smartTower) {
      var all = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
      return { key: all[Math.floor(rand(state) * all.length)], rule: 'sloppy-random' };
    }
    /* 预判（P-D）：把敌方「历史兵种占比」换算成当量兵力，与这一帧的实况取较大值。
     * 效果：玩家最近一直在出空军（哪怕此刻场上一个都没有）→ rd.airEq 已经是 3~4 ，
     *       于是 AI 会**提前**把对空塔补上，而不是等气球飞到头顶才反应。 */
    var rd = foeRead(state, team, A);
    // 现有塔的「对空 / 只对地」构成（直接数建筑，最可靠）
    var antiAir = 0, groundOnly = 0;
    state.buildings.forEach(function (b) {
      if (b.team !== team || !b.def.atk || b.def.isBase) return;
      if (b.def.targets === 'both') antiAir++; else groundOnly++;
    });
    // 目标配比：每种各 2 座（上限低时就各 1 座）
    var wantEach = Math.max(1, Math.min(2, Math.floor((P.maxTowers || 4) / 2)));
    // ① 完全没对空 → 必须先补对空
    if (antiAir === 0) return { key: rd.airEq >= 2 ? 'tesla' : 'arrow', rule: 'no-aa' };
    // ② 完全没对地 → 补对地
    if (groundOnly === 0) return { key: pickGroundTower(rd, A), rule: 'no-ground' };
    // ③ 某一类明显偏少 → 补那一类（这两条是「对地/对空都不为 0」的硬保证，不参与加权）
    if (antiAir < wantEach && antiAir < groundOnly) return { key: rd.airEq >= 2.5 ? 'tesla' : 'arrow', rule: 'quota-aa' };
    if (groundOnly < wantEach && groundOnly < antiAir) return { key: pickGroundTower(rd, A), rule: 'quota-ground' };
    /* ④ 两边都够 → 按**预判**强化（旧实现在这里是「按当前这一帧的威胁」，
     *    现在换成「按对手最近的打法 + 这一帧的实况」加权，见 aiPickTowerWeighted）。 */
    return { key: aiPickTowerWeighted(state, team, A, rd, P), rule: 'weighted' };
  }

  /* 「补对地」时选哪一种：玩家攻城/重甲多（要拆建筑 / 血厚）→ 迫击炮（高伤溅射）；
   * 否则炮塔（便宜、量大、铺得快）。 */
  function pickGroundTower(rd, A) {
    var pressure = Math.max(rd.siegeEq * 1.2, rd.heavyEq, rd.groundEq * 0.6, (A ? A.ground : 0) * 0.6);
    return pressure >= 3 ? 'mortar' : 'cannon';
  }

  /* 预判加权选塔（P-D 的核心新增）
   * ----------------------------------------------------------------------------
   * 权重来源（全部是公开信息）：
   *   ① 空中倾向 rd.airEq          → 箭塔（便宜、量大、对空）/ 特斯拉（高伤单体对空）
   *   ② 地面硬皮 rd.heavyEq        → 炮塔 / 迫击炮（高伤）
   *   ③ 攻城倾向 rd.siegeEq        → 迫击炮（溅射，成群的攻城兵最怕这个）
   *   ④ 远程倾向 rd.rangedEq       → 迫击炮 / 法师塔（覆盖面积大，打得远）
   *   ⑤ 这一帧的实况（保留旧的「反应」成分，但权重低于预判）
   *   ⑥ 造价阻尼 + 同类降权：便宜的塔铺得快（避免一路 tesla/mortar 拖死经济），
   *      同类已有 3 座以上轻微降权（避免清一色，保持对地/对空均衡）。
   * 注意：调用到这里的**前提**是「对地、对空数量都已达到 wantEach」，
   * 所以加权再怎么偏，也不会把某一边清零 —— 平衡底线守住了。 */
  function aiPickTowerWeighted(state, team, A, rd, P) {
    var w = { cannon: 1.0, arrow: 1.0, mage: 1.0, mortar: 1.0, tesla: 1.0 };
    // ① 空中倾向（预测的权重比实况高一档：就是要「提前」）
    w.arrow += 0.55 * rd.airEq;
    w.tesla += 0.42 * rd.airEq;
    // ②③ 地面硬皮 / 攻城
    w.cannon += 0.40 * Math.max(rd.heavyEq, rd.groundEq * 0.5);
    w.mortar += 0.30 * Math.max(rd.siegeEq * 1.2, rd.heavyEq, rd.groundEq * 0.5);
    // ④ 远程多 → 需要「覆盖面积大」的塔（溅射 / 单体高伤）
    w.mortar += 0.28 * rd.rangedEq;
    w.mage += 0.22 * rd.rangedEq;
    // ⑤ 这一帧的实况（反应成分，权重压低）
    w.arrow += 0.18 * A.air; w.tesla += 0.15 * A.air;
    w.mortar += 0.12 * A.ground; w.mage += 0.10 * A.ground;
    // ⑥ 造价阻尼 / 同类降权
    var mine = {};
    state.buildings.forEach(function (b) {
      if (b.team === team && b.def.atk && !b.def.isBase) mine[b.key] = (mine[b.key] || 0) + 1;
    });
    var keys = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
    var best = null, bestS = -1;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var costW = 1 / (0.6 + 0.4 * DATA.buildings[k].cost / 110);
      var dupW = 1 / (1 + 0.22 * (mine[k] || 0));
      var s = w[k] * costW * dupW + (rand(state) - 0.5) * 0.12;   // 微小随机，避免每局一模一样
      if (s > bestS) { bestS = s; best = k; }
    }
    return best || 'arrow';
  }

  /* 电脑升级建筑：优先升塔、等级高的优先（集中养成而不是摊大饼） */
  function aiUpgradeAny(state, team, budget) {
    var targets = state.buildings.filter(function (b) {
      return b.team === team && !b.def.isBase && (b.level || 1) < DATA.upgrade.maxLevel;
    });
    if (!targets.length) return false;
    targets.sort(function (a, b) {
      var ta = a.def.atk ? 0 : 1, tb = b.def.atk ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return (b.level || 1) - (a.level || 1);
    });
    var b0 = targets[0];
    var cost = buildingUpgradeCost(b0);
    if (cost == null || budget < cost) return false;
    var opts = branchesFor(b0);
    var branch = opts.length ? opts[Math.floor(rand(state) * opts.length)].key : null;
    return upgradeBuilding(state, b0, branch).ok;
  }

  /* 电脑放法术：按「这一发值多少钱」挑目标
   *
   * ★ 修掉的实际浪费（本次实测抓到的最大单项问题）★
   * 原来伤害法术只会丢「敌人最密的格子」，而且硬性要求那一格半径内 ≥2 个敌兵。
   * 中后期双方前场各自只有 1~2 个兵，这个条件几乎永不满足 →
   * 电脑一整局把「火箭 420 伤害 / 火球 200 伤害 / 箭雨 90 伤害」全部憋到过期。
   * 而 castSpell 对建筑是**直接扣血**的（b.hp -= dmg），砸对面大本营等于白送 420 伤害。
   * 结果就是：谁先想起来用法术拆家，谁就赢 —— 这也是「地狱打不过困难」的真正原因。
   *
   * 现在的规则（三档通用，属于「会用技能」的基本教养，不是难度特权）：
   *   候选 A：敌方最密的兵堆 —— 价值 = 那一堆兵的总造价（清场/救家）
   *   候选 B：敌方没设防的金矿 —— 价值 = 这一发打掉的血量占比 × 经济价值 ÷ 守卫
   *   候选 C：敌方大本营 —— 只有「已经残血 <15%」时才算价值（收尾）
   *   ★ v14：法术对建筑伤害减半之后，C 必须让位给 A/B —— 原来「火箭砸家 ×1.2」
   *   的估值在数学上已经不成立（210 伤害 vs 几千血），再按旧权重就会白扔法术。
   *   谁值钱砸谁。自家大本营快没了（<45%）时取消候选 C，先救家。
   * 狂暴（affects:'ally'）仍然只给「己方最密处 ≥3 个兵」。
   * 全部用公开状态判断，没有偷资源、没有偷看隐藏信息。 */
  function aiCastSpell(state, team, P, A, budget) {
    var avail = spellsAvailable(state, team).filter(function (s) {
      return (state.spellCd[team][s.key] || 0) <= 0;
    });
    if (!avail.length) return false;
    var bestFoe = null, bestFoeN = 0, bestFoeCost = 0, bestMine = null, bestMineN = 0;
    for (var r = 1; r <= ROWS; r++) {
      for (var c = 1; c <= COLS; c++) {
        var n = 0, m = 0, cost = 0;
        state.units.forEach(function (u) {
          var d = dist({ row: u.row, col: u.col }, { row: r, col: c });
          if (d > 1.5) return;
          if (u.team === OPP[team]) { n++; cost += (u.def.cost || 0); } else { m++; }
        });
        if (n > bestFoeN) { bestFoeN = n; bestFoeCost = cost; bestFoe = { r: r, c: c }; }
        if (m > bestMineN) { bestMineN = m; bestMine = { r: r, c: c }; }
      }
    }
    var foeB = (P && P.spellBuilding) ? enemyBase(state, team) : null;
    // 自家大本营快没了 → 这一发必须用来救家，不许拿去拆家
    var mustDefend = (A && (A.myBaseHp < 0.45 || A.inMyHalf >= 5));
    /* ★ v14：法术削弱建筑伤害之后，砸家/砸塔在数学上已经不划算了
     *   （火箭对建筑只有 210，大本营几千血）。所以选靶顺序改成：
     *     ① 敌方最密的兵堆（对兵 +50%，清场价值最高）
     *     ② 敌方**没设防的金矿**（断经济，且矿只有 600 血，一发火箭 210 = 三分之一）
     *     ③ 只在大本营已经残血（<15%）时才用火箭收尾，否则一发都不浪费在家上
     *   金矿的守卫值 = 罩得住它的敌方塔火力之和，越大越不划算。 */
    var foeMines = state.buildings.filter(function (b) {
      return b.team === OPP[team] && b.def && b.def.key === 'mine';
    });
    function mineGuard(m) {
      var g = 0;
      var mc = centerOf(m);
      state.buildings.forEach(function (t) {
        if (t.team !== m.team || !t.def.atk || t === m) return;
        var st = statsForLevel(t.def, t.level || 1, t.branch);
        if (dist(centerOf(t), mc) <= (st.range || 1) + 0.85) g++;
      });
      return g;
    }
    var foeBaseHpPct = (A && A.foeBaseHp != null) ? A.foeBaseHp : 1;
    for (var i = 0; i < avail.length; i++) {
      var sp = avail[i];
      /* budget：这一发法术只能花「本次思考允许花的那部分钱」——
       * 不给预算的话，法术会直接刷 state.res 把科技/塔的预算吃光
       * （实测地狱档科技攒到 255 就被一发火球清回 88，永远差 320 的科技钱）。 */
      if (budget != null && (sp.cost || 0) > budget) continue;
      if (sp.affects === 'ally') {
        if (bestMine && bestMineN >= 3 && castSpell(state, team, sp.key, bestMine.r, bestMine.c).ok) return true;
        continue;
      }
      /* 兵堆价值：敌人已经压进自家半场时加权 —— 这时候一发 AOE 清掉三个兵，
       * 救的是大本营，不该还惦记对面那座矿（实测初版 79% 的法术全砸矿，
       * 防线被推的时候一发都不肯用，等于把「技能」当成了「农具」）。 */
      var defendBoost = (A && A.inMyHalf >= 3) ? 2.5 : (A && A.inMyHalf >= 2) ? 1.6 : 1;
      var unitVal = (bestFoe && bestFoeN >= 2) ? bestFoeCost * defendBoost : 0;
      var buildDmg = spellDamageOf(sp, 'building');
      /* 金矿候选：挑「这一发能打掉的血量占比 × 经济价值 ÷ 守卫」最高的那座 */
      var mineBest = null, mineVal = 0;
      if (buildDmg > 0) {
        foeMines.forEach(function (m) {
          var hp = Math.max(1, m.hp);
          var take = Math.min(1, buildDmg / hp);
          var guard = mineGuard(m);
          if (guard >= 3) return;                      // 三层塔罩着，别浪费
          var v = take * 900 * (1 - 0.30 * guard);     // 900 ≈ 一座矿的长期经济价值
          if (v > mineVal) { mineVal = v; mineBest = m; }
        });
      }
      /* 大本营只在「已经残血、这一发能收尾」时才算价值 */
      var baseVal = 0;
      if (buildDmg > 0 && foeB && !mustDefend && foeBaseHpPct < 0.15) {
        baseVal = Math.min(buildDmg, foeB.hp) * 3;
      }
      // 三选一：兵堆 > 裸矿 > 残血大本营
      var pick = null, pickVal = 0;
      if (unitVal > 0 && bestFoe) { pick = bestFoe; pickVal = unitVal; }
      if (mineVal > pickVal && mineBest) { pick = { r: mineBest.row, c: mineBest.col }; pickVal = mineVal; }
      if (baseVal > pickVal && foeB) { pick = { r: foeB.row, c: foeB.col }; pickVal = baseVal; }
      if (pick && castSpell(state, team, sp.key, pick.r, pick.c).ok) return true;
    }
    return false;
  }

  /* 进攻选列的权重表（一次改这里就能调「AI 打弱点的口味」） */
  var LANE_W = {
    front: 1000,   // 己方建筑堵出兵口：硬性避让
    def: 60,       // ★主项：敌方该列防御强度（归一化后）× 60
    block: 12,     // 该列有敌方建筑挡路（要停下来拆墙）
    crowded: 3,    // 该列此刻敌兵多（别正面硬碰）
    focus: 18,     // 集中兵力：延续主攻列
    mates: 14,     // 这一列已经有我的兵（成建制，别孤军送死）
    raid: 46,      // ★v13：这一列有「守卫薄弱的敌方金矿」—— 经济打击（乘 raidW）
    push: 34,      // ★v13：实力压得住时，往大本营两列集中（乘 push 强度）
    jitter: 8      // 确定性随机打散（±4）
  };
  // 主攻列的防御强度允许比「当前最优列」厚多少（归一化 0..1）；超过就换列
  var LANE_FOCUS_TOL = 0.35;

  /* 「下一个名额」—— 名额表的当前指针。
   * aiThink 用它做「军费专项预留」（把钱留住，别被建塔/升级吃掉），
   * aiDeploySmart 用它决定这一轮出谁。两处共用同一张表，保证判据一致。 */
  function aiRosterNext(state, team, A, P) {
    if (!P.smartDeploy) return null;
    var ro = state.aiRoster || (state.aiRoster = {});
    var rp = ro[team] || (ro[team] = { idx: 0, list: [], since: 0, rebuildAt: 0 });
    if (!rp.list.length || state.time >= rp.rebuildAt) {
      rp.list = aiBuildRoster(A, P);
      rp.rebuildAt = state.time + 30;
      if (rp.idx >= rp.list.length) rp.idx = 0;
    }
    for (var k = 0; k < rp.list.length; k++) {
      var idx = (rp.idx + k) % rp.list.length;
      var key = rp.list[idx];
      if (!DATA.units[key] || !isUnitReady(state, team, key)) continue;
      return { key: key, cost: DATA.units[key].cost, idx: idx, list: rp.list };
    }
    return null;
  }

  /* 兵种名额表（build order）—— aiDeploySmart 用它决定「下一个该出谁」。
   * 目的：在「预算永远只够最便宜两种」的现实下，仍然**保证 5 种以上兵真的上场**。
   * 排法（全部基于公开信息：敌方兵种构成 A.*、敌方建筑数 A.towers、本档经济上限）：
   *   ① 克制位：对面有空军 → 弓箭手(对空射程3) / 气球兵(可对空)；对面塔多 → 攻城兵/攻城飞艇
   *   ② 垫底：两个步兵（最便宜，保证任何时刻都有兵，不会为了攒钱断兵）
   *   ③ 主战：重甲（对面肉多时）/ 攻城兵
   *   ④ 高价值：地狱排飞龙，困难排攻城车（valueCap 控制，普通档不排）
   *   ⑤ 收尾再来一轮：步兵 / 气球兵 / 重型
   * 普通档仍然只排两种（它是教学档，单调是设计意图，和难度阶梯一致）。 */
  function aiBuildRoster(A, P) {
    var q = [];
    var add = function (k, n) {
      for (var i = 0; i < (n || 1); i++) q.push(k);
    };
    if (!P.smartDeploy) { add('infantry'); add('siege'); return q; }   // 普通档：只排两种
    var vcap = (P.valueCap != null) ? P.valueCap : 280;
    var rich = vcap >= 420;                    // 只有地狱档养得起飞龙/飞艇的高价节奏
    // ① 克制位（对面有空军 / 对面塔多）
    if (A.air >= 1) { add('archer'); add('balloon'); }
    if (A.towers >= 3) { add('siege'); add('airship'); }
    // ② 垫底：便宜、保证任何时刻都有兵（不会因为攒钱断兵）
    add('infantry');
    add('archer');                             // 弓箭手 180：通用远程，射程 3 格
    // ③ 主战
    add('siege');
    if (A.ground >= 3 || A.ranged >= 2) add('heavy');
    add('infantry');
    // ④ 高价值：地狱排飞龙（420），困难排攻城车（270）/重甲（280）——
    //    实测困难档收入只有 11~15 金/秒，420 秒总收入约 5~6 千，
    //    整局攒不出几只飞龙；硬塞进去只会让它 420 秒一只都出不来。
    if (rich) add('dragon'); else add('ram');
    add('balloon');
    add('heavy');
    add('siege');
    return q;
  }

  /* ============================================================================
   * 预算分配策略（v18）—— 军队 / 建筑 / 科技 三桶分账
   * ----------------------------------------------------------------------------
   * 用户要求：给 AI 建立一套「预算分配策略」。
   * 问题（实测基线 dev/_diag_ai.js，420s × 3 局）：
   *   want 平均 7.7 种兵 → 其中**买得起**只有 1.3 种；一局只用 3~4 种兵，
   *   重甲/攻城车/攻城飞艇/飞龙 长期 0 出场。
   * 根因不是候选表不够（那是 7.7 种），而是**钱没有按角色分账**：
   *   · armyCap = spendable × armyShare（一个固定百分比）→ 本轮只允许花 100 出头，
   *     于是永远只买得起步兵(75)/攻城兵(120)，贵的连"这一轮能不能买"都过不了；
   *   · 建塔 / 升级 / 科技各自写死门槛，谁先跑到线谁吃钱，
   *     等名额表轮到 280 的重甲，现金早被塔和杂项升级吃干了。
   *
   * 策略（三点，全部可读可调）：
   *   ① 三桶比例 BUDGET_RATIO：按难度档给基准配比，再按「开局 / 落后 / 领先 / 被压」
   *     四个信号微调后归一化。以后要调 AI 的"性格"，改这张表就够了。
   *   ② 军队桶是「整笔支出」，不是平滑百分比 —— 这是本策略的核心：
   *     和平滑切分不同，名额表轮到贵兵时把本轮上限**临时抬到那只兵的价钱**
   *     （上限 = spendable × armyLift），前提是场上兵数还没到 armyTarget。
   *     贵兵于是真的买得起，而不是永远差一口钱。
   *   ③ 建筑桶给出 buildCap，让「补塔/升级」有自己的额度；
   *     防御塔这类"锦上添花"的支出被限制在建筑桶内，不再无限挤占军队。
   *
   * 判据只用公开信息：自己的金币 / 塔 / 矿 / 场上兵数 + 双方大本营血量。
   * ========================================================================== */
  var BUDGET_RATIO = {
    /* normal 的军队桶给到 0.62（原来是 armyShare 0.60 的固定比例）：
     * 实测把它调到 0.55 时「困难 vs 普通」从 83% 涨到 100% —— 教学档被压得太死，
     * 阶梯还在但中间档没内容了。0.62 让它在开局 -8% 之后仍接近原来的 0.60。 */
    normal: { army: 0.62, build: 0.29, tech: 0.09 },   // 教学档：几乎不投科技，钱都去兵和塔
    hard:   { army: 0.48, build: 0.31, tech: 0.21 },   // 普通：三桶比较均衡
    hell:   { army: 0.56, build: 0.16, tech: 0.28 }    // 困难：科技占比最高，塔够用就行
  };
  function aiBudgetPlan(state, team, A, pw, P, o) {
    o = o || {};
    var key = (P && P.key) || 'hard';
    var base = BUDGET_RATIO[key] || BUDGET_RATIO.hard;
    var r = { army: base.army, build: base.build, tech: base.tech };
    var why = [];
    /* ① 开局 90 秒先立业：从军队挪 8% 给建筑。
     * 「先有一座矿和两座塔」比「第三个步兵」重要得多 —— 这条原来散落在
     * 各处 if 里，现在集中成一个可读的信号。 */
    if (state.time < 90) { r.army -= 0.08; r.build += 0.08; why.push('开局'); }
    /* ② 形势：落后先顶住（军队 +6%），领先去滚科技（科技 +5%）。 */
    if (pw && pw.stance === 'behind') { r.army += 0.06; r.tech -= 0.06; why.push('落后'); }
    else if (pw && pw.stance === 'ahead') { r.tech += 0.05; r.army -= 0.05; why.push('领先'); }
    /* ③ 自家半场被压：再从科技挪 6% 给军队 —— 命都快没了就别攒科技。 */
    if (A.inMyHalf >= 3) { r.army += 0.06; r.tech -= 0.06; why.push('被压'); }

    // 夹到安全区间，剩下归建筑（三桶相加恒为 1）
    r.army = clamp(r.army, 0.30, 0.80);
    r.tech = clamp(r.tech, 0.03, 0.40);
    r.build = Math.max(0.08, 1 - r.army - r.tech);
    var sum = r.army + r.build + r.tech;
    r.army /= sum; r.build /= sum; r.tech /= sum;

    var spendable = Math.max(0, o.spendable || 0);
    var armyBase = Math.max(0, o.armyBase != null ? o.armyBase : spendable);
    var armyCap = Math.floor(armyBase * r.army);
    var buildCap = Math.floor(spendable * r.build);
    var techCap = Math.floor(spendable * r.tech);

    /* ② 席位补足（军队桶是整笔支出）：轮到贵兵就把上限抬到它的价钱。
     * 三个闸门防止它把经济吃干：
     *   · 科技窗口开着时不抬（那段时间现金要留给科技）
     *   · 场上兵数已经到了 armyTarget 时不抬（兵够多了，没必要掏空家底）
     *   · 抬升后的总额不超过 spendable × armyLift（默认 0.78，永远留 22% 给别的桶） */
    var slot = aiRosterNext(state, team, A, P);
    var myCount = A.myGround + A.myAir;
    var armyTarget = (P.armyTarget != null) ? P.armyTarget
      : (key === 'hell' ? 5 : (key === 'hard' ? 4 : 3));
    var liftMax = Math.floor(spendable * (P.armyLift != null ? P.armyLift : 0.78));
    var lifted = false;
    if (slot && !o.techWinOn && !o.allIn && myCount < armyTarget && slot.cost > armyCap) {
      var liftedCap = Math.min(liftMax, slot.cost);
      if (liftedCap > armyCap) { armyCap = liftedCap; lifted = true; }
    }
    var plan = {
      ratio: { army: +r.army.toFixed(3), build: +r.build.toFixed(3), tech: +r.tech.toFixed(3) },
      armyCap: armyCap, buildCap: buildCap, techCap: techCap,
      slot: slot ? slot.key : null, slotCost: slot ? slot.cost : 0,
      target: armyTarget, onField: myCount, lifted: lifted, why: why.join('+') || '基准'
    };
    var bag = state.aiBudget || (state.aiBudget = {});
    bag[team] = plan;
    return plan;
  }

  /* 派兵：按敌方构成做克制选择，并且**保持兵种搭配**
   *   · 普通档：只会出步兵 + 攻城兵（玩家容易对付）
   *   · 困难/地狱档：先看敌人构成决定"该补什么"，再挑「场上数量最少的那种」
   *   · budget = 这次最多愿意花多少钱（由 aiThink 按经济状况决定） */
  function aiDeploySmart(state, team, A, P, sloppy, budget, cashCapArg) {
    var gold = state.res[team];
    /* cashCap：本次派兵**最多能动用多少现金**。
     * 为什么不直接用 budget：名额表判断"买不买得起"必须看真实现金
     * （armyCap 只是单次派兵的软预算，用它判断会让「步兵 75 > armyCap 40」永远买不起，
     * 名额表直接卡死），但**真实现金里有一部分是别的目标锁着的**（科技保底 techHold）。
     * 不把这个上限传进来的后果（实测）：地狱档 300 秒里 74% 的钱（6710 金）被出兵吃掉，
     * 科技永远攒不到 320 —— 锁了跟没锁一样。
     * 调用方不传（或传 null）时等价于「不设上限」，行为和以前完全一致。 */
    var cashCap = (cashCapArg == null) ? gold : Math.min(gold, Math.max(0, cashCapArg));
    var canUse = (budget == null) ? gold : Math.min(gold, budget);
    // 「CD 好了」与「买得起」分开判断：CD 好的兵种才算候选，钱不够时只影响能不能真出兵
    var offCd = function (k) {
      return DATA.units[k] && isUnitReady(state, team, k);
    };
    var afford = function (k) {
      return DATA.units[k] && DATA.units[k].cost <= canUse;
    };
    // 场上各兵种数量（用来判断"该补哪一种了"）
    var onField = {};
    unitsOf(state, team).forEach(function (u) {
      onField[u.key] = (onField[u.key] || 0) + 1;
    });
    var want = [];
    if (sloppy || !P.smartDeploy) {
      want = ['infantry', 'siege'].filter(offCd);
    } else {
      /* ★ 轮 8：按「局势 + 经济规模」组兵，而不是固定那 2~3 种 ★
       * 实测基线（dev/_diag_ai.js，地狱 vs 困难 3 局共 92 只兵）：
       *   infantry 50% / siege 44.6% / archer 4.3% / airship 1.1%，
       *   重甲兵、攻城车、气球兵、飞龙 **0 只**。
       *   插桩显示 want 平均有 7.0 种、但「买得起（picks）」平均只有 2.0 种
       *   → 根因是**钱**（armyCap 太小 → 只够最便宜的两种），不是候选表不全。
       * 所以：① 兵种按经济规模分档（穷→撑线、中→补克制、富→敢出高价值兵）；
       *      ② 后面第 ③ 步做「同兵种连续出 2 次就轮换」，保证真上场 5 种以上。 */
      var richCash = gold >= 420;          // 富：敢出飞龙/攻城车
      var midCash = gold >= 240;           // 中：敢出重甲/气球/飞艇
      var wantAntiAir = A.air >= 1;
      var wantTank = A.ground >= 4 || A.ranged >= 2;
      var wantBuilding = A.siegeType >= 2 || A.towers >= 3 || A.foeBaseHp < 0.85;
      if (richCash && offCd('dragon')) want.push('dragon');
      if (richCash && wantBuilding && offCd('ram')) want.push('ram');
      if (wantAntiAir && offCd('archer')) want.push('archer');
      if (wantAntiAir && offCd('balloon')) want.push('balloon');
      if (wantTank && midCash && offCd('heavy')) want.push('heavy');
      if (wantBuilding && offCd('siege')) want.push('siege');
      if (wantBuilding && midCash && offCd('airship')) want.push('airship');
      ['infantry', 'ram', 'archer', 'balloon', 'siege', 'heavy', 'airship', 'dragon'].forEach(function (k) {
        if (offCd(k) && want.indexOf(k) < 0) want.push(k);
      });
    }
    if (!want.length) return false;

    // ① 保持兵种搭配：场上一个都没有的兵种排最前；都出现过时，数量少的优先
    want.sort(function (a, b) { return (onField[a] || 0) - (onField[b] || 0); });
    // ② 场上只有一种兵（比如清一色步兵）→ 强制先出别的兵种
    var distinct = Object.keys(onField).length;
    if (distinct <= 1 && want.length > 1) {
      var only = Object.keys(onField)[0];
      var others = want.filter(function (k) { return k !== only; });
      var same = want.filter(function (k) { return k === only; });
      if (others.length) want = others.concat(same);
    }
    /* ③ 反单调：同一个兵种已经连续出了 2 次 → 压到队尾（有别的可出时）。
     * 这是用户「兵种局限于两三种」的第二道保险：即使钱只够便宜的，
     * 也不会出现「连出 6 个步兵」这种一眼看穿的单调。 */
    var lastPick = state.aiLastPick && state.aiLastPick[team];
    if (lastPick && lastPick.n >= 2 && want.length > 1) {
      var others2 = want.filter(function (k) { return k !== lastPick.key; });
      var same2 = want.filter(function (k) { return k === lastPick.key; });
      if (others2.length) want = others2.concat(same2);
    }
    // ③ 钱不够就先出买得起的（但保持上面的搭配顺序）
    // armyKeep：兵费不能把金币清零 —— 手上永远给「建矿/补塔/升主塔/升大本营」留一笔底钱。
    // 实测教训：没有这条兜底时，强档收入 20+/秒却全部变成小兵，
    // 结果 400 秒只有 2 座塔、主塔 1 级、大本营 1 级，被对面 7 座塔的防线一个个吃光。
    var keep = P.armyKeep || 0;
    canUse = Math.min(canUse, Math.max(0, cashCap - keep));
    /* 钱多的时候敢出高价值兵：
     *   armyCap（spendable × armyShare）是「稳态军费」，不该把 dragon/ram/heavy
     *   这类高价兵永久排除掉 —— 实测就是它们 0 出场。规则：金币绝对量 ≥ 420
     *   （正好是飞龙的价钱）时把本轮预算放宽到「买得起这只兵」。
     *   只用「自己的金币」，不偷看任何隐藏信息。 */
    if (cashCap >= 420) canUse = Math.max(canUse, Math.min(Math.max(0, cashCap - keep), 420));

    /* ★★★ 兵种名额表（build order）—— 「只出两三种」的正解 ★★★
     * 二次/三次实测（dev/_diag_ai.after1.txt / after3）：
     *   · 困难 vs 代理：钱永远在 20~170，`canSpare`（要 ≥110 才出兵）经常为假 →
     *     420 秒只调用 20 次出兵、全是步兵；
     *   · 地狱 vs 困难：want 平均 7.7 种，但「买得起」平均 1.6 种。
     *   → 钱永远刚好只够最便宜的两种（步兵 75 / 攻城兵 120），
     *     所以「按场上数量最少来挑」这种平均主义在预算受限时毫无意义。
     * 解法：给 AI 一张**名额表**，按角色排队，轮到贵的就攒钱、轮到便宜的就买。
     *   · 表里的顺序保证：先补克制位（对空/拆建筑），再垫两个廉价兵，
     *     然后才是高价值兵（重甲/攻城车/飞龙），最后回到廉价兵 —— 不会长时间断兵。
     *   · 买不起当前名额时，只要场上兵数够（≥ armyFloor）且自家没被压，就**攒钱**；
     *     攒太久（>18 秒）说明对面在压 → 放弃贵名额，先买便宜的顶住。
     *   · 名额表内容只看「敌方兵种构成 / 敌方建筑数量」这类公开信息。 */
    var ro = state.aiRoster || (state.aiRoster = {});
    var rp = ro[team] || (ro[team] = { idx: 0, list: [], since: 0, rebuildAt: 0 });
    var nextSlot = aiRosterNext(state, team, A, P);       // 名额表指针（与 aiThink 共用）
    var slotKey = nextSlot ? nextSlot.key : null;
    var slotIdx = nextSlot ? nextSlot.idx : -1;
    var myCount = 0;
    Object.keys(onField).forEach(function (k) { myCount += onField[k]; });
    var armyFloorD = (P.armyFloor != null) ? P.armyFloor : 2;
    var allInD = !!(state.aiPush && state.aiPush[team] > state.time);
    /* 集结窗口内不攒钱：窗口的意义就是「连出 2~3 只成小队」，
     * 这时候攒钱会把小队拆回单兵（实测 孤军出门 从 38% 涨上去）。 */
    /* 名额表判断「买不买得起」用的是**真实现金**（gold - armyKeep），
     * 不是 armyCap —— armyCap 只是单次派兵的软预算，用它判断会让
     * 「步兵 75 > armyCap 40」永远买不起，名额表直接卡死（实测到过）。 */
    var slotCash = Math.max(0, cashCap - keep);
    if (slotKey && !allInD && P.hoard !== false) {
      var slotCost = DATA.units[slotKey].cost;
      /* 攒钱条件：买不起 + 场上至少有 1 只兵（不会为了攒钱断兵）+ 自家没被压。
       * 注意用「≥1 只」而不是「≥军力下限」—— 实测单位存活中位数只有 14~19 秒，
       * 用下限做条件会导致几乎永远不攒钱（兵数总在 1 附近徘徊）。 */
      if (slotCost > slotCash && myCount >= 1 && A.inMyHalf < 2) {
        if (!rp.since) rp.since = state.time;
        if (state.time - rp.since < 14) {                // 攒钱，不拿廉价兵凑数
          var hd = state.aiHoard || (state.aiHoard = {});
          hd[team] = { key: slotKey, cost: slotCost, until: state.time + 8 };
          if (state.aiDeployDebug && state.aiDeployDebug.push) {
            state.aiDeployDebug.push({
              t: Math.round(state.time * 10) / 10, team: team, gold: Math.round(gold),
              canUse: Math.round(canUse), armyBudget: (budget == null ? null : Math.round(budget)),
              want: want.slice(), picks: [], affordable: {}, sloppy: !!sloppy,
              onField: onField, chosen: null, col: null, hoard: slotKey
            });
          }
          return false;
        }
        // 攒太久（收入太低 / 对面在压）→ 放弃这个贵名额，往后挪一格，先出便宜的顶住
        rp.idx = (slotIdx + 1) % rp.list.length;
        rp.since = 0;
        slotKey = null; slotIdx = -1;
      }
    }

    var picks = [];
    if (slotKey && DATA.units[slotKey].cost <= slotCash) picks.push(slotKey);
    if (!picks.length) picks = want.filter(afford);
    if (!picks.length) picks = want.filter(function (k) { return DATA.units[k].cost <= cashCap - keep; });
    if (!picks.length) return false;

    /* 诊断插桩（默认关闭，逻辑零改动）：state.aiDeployDebug 是数组时记一条
     * 「这一次派兵决策看到了什么」—— want（CD 好了的候选）/ picks（其中买得起的）/
     * gold / armyCap / 场上各兵种数量 / 最终派了谁去哪一列。
     * 用途：dev/_diag_ai.js 用它定位「为什么只用 2-3 种兵」：
     *   · want 里只有 2 种        → 候选取舍（sloppy / smartDeploy）的问题
     *   · want 有 8 种但 picks 只有 2 种 → 钱的问题（贵兵买不起）
     *   · picks 有 8 种但选中的永远是 infantry → 排序/优先级的问题
     * 插桩里不调 rand()，不改变对局随机序列。 */
    var dbg = null;
    if (state.aiDeployDebug && state.aiDeployDebug.push) {
      var affAll = {};
      Object.keys(DATA.units).forEach(function (k) {
        affAll[k] = DATA.units[k].cost <= Math.max(0, gold - keep);
      });
      var ofc = {};
      Object.keys(onField).forEach(function (k) { ofc[k] = onField[k]; });
      dbg = {
        t: Math.round(state.time * 10) / 10, team: team, gold: Math.round(gold),
        canUse: Math.round(canUse), armyBudget: (budget == null ? null : Math.round(budget)),
        want: want.slice(), picks: picks.slice(), affordable: affAll,
        sloppy: !!sloppy, onField: ofc, chosen: null, col: null
      };
    }

    var cols = [];

    /* ★ v18 反「孤军出门」闸门（用户要求：降低散兵比例，别送死）★
     *
     * 实测基线（dev/_diag_ai.js，420s × 3 局，地狱 vs 困难）：
     *   孤军出门 = 场上一个己方兵都没有时派出去的兵，占 **54.1%** ——
     *   这些兵几乎必然被对面 5~7 座塔轮流集火，一出门就没了。
     * 老实现只在「自家出兵口堵住」和第 7.1 节（myArmy === 0 且经济已立起来）
     * 两道很窄的条件下做过拦截，`armyFloor` 驱动的那条路完全绕得过去。
     *
     * 现在的规则（只看自己的信息）：
     *   场上 0 只己方兵 + 不是推家窗口 + 对面还没进我半场（inMyHalf < 2）
     *   → 先攒到「这只 + 最便宜的下一只」的钱再出门，最多等 12 秒。
     * 这样出门的最小单位是**两只**，而不是一只；等待超过 12 秒就必须出兵，
     * 否则刚被清场时会眼睁睁看着家被推。
     */
    var topCost0 = DATA.units[picks[0]].cost;
    var myOnBoard = 0;
    Object.keys(onField).forEach(function (k) { myOnBoard += onField[k]; });
    /* 注意这里**没有**「推家窗口不拦」的例外（v18 实测后去掉的）：
     * 原来 allIn 期间整段跳过这道闸，而地狱档几乎整局都在推家窗口里 ——
     * 于是 6 局实测孤军仍有 38.8%（只比 54.1% 好一点），闸等于没装。
     * 去掉例外后，推家期同样是「钱不够两只就等」，因为推家期 armyCap = 全部现金、
     * 只要有钱就不会被拦，所以这个改动只影响「真的没钱」的情况 —— 那正是要拦的。 */
    if (myOnBoard === 0 && A.inMyHalf < 2) {
      var minReady = Infinity;
      Object.keys(DATA.units).forEach(function (uk) {
        if (!isUnitReady(state, team, uk)) return;
        if (DATA.units[uk].cost < minReady) minReady = DATA.units[uk].cost;
      });
      if (!isFinite(minReady)) minReady = topCost0;
      var pairCost = topCost0 + minReady;
      /* 「攒得起才攒」：只有缺口在 ~8 秒收入之内时才值得等。
       * 否则（收入太低 / 缺口太大）等下去等于把整局耗在攒钱上 ——
       * 教学档（普通）收入只有 5~9 金/秒，硬等两只的钱会让它几乎不出兵，
       * 实测 困难 vs 普通 从 83% 涨到 92%（普通被压死），所以这里加收入判据。 */
      var incRate = DATA.baseLevels[baseLevelOf(state, team) - 1].income;
      state.buildings.forEach(function (b) {
        if (b.team === team && b.def.income) incRate += statsForLevel(b.def, b.level || 1, b.branch).income;
      });
      var gap = pairCost - (cashCap - keep);
      var holdBag = state.aiSoloHold || (state.aiSoloHold = {});
      var hold = holdBag[team] || (holdBag[team] = { since: 0 });
      if (gap > 0 && gap <= incRate * 8) {
        if (!hold.since) hold.since = state.time;
        if (state.time - hold.since < 12) {
          if (dbg) { dbg.blocked = 'solo-hold'; dbg.pairCost = pairCost; state.aiDeployDebug.push(dbg); }
          return false;
        }
      }
      hold.since = 0;
    } else {
      if (state.aiSoloHold && state.aiSoloHold[team]) state.aiSoloHold[team].since = 0;
    }

    /* ---------------- 进攻选列：读对手 → 打最薄弱的那一列（P-D）----------------
     * 老实现（已废弃）：frontBlocked 优先 → 再按「这一列此刻有几个敌兵」升序。
     *   病根：它只关心「哪列没人」，完全不看**玩家那边哪一列防守薄弱**；
     *   玩家把左边 5 列堆成铁桶、右边 5 列一座塔都不造，AI 照样随机撞塔。
     * 新实现：先用 state.aiFoe[team].laneDefense（敌方每列塔覆盖强度）当主项打分，
     *   越薄弱的列分越高；同时保留「避免自家出兵口被建筑挡」、「别正面硬碰敌军主力」、
     *   「成建制集中打同一列」三条既有要求，最后用确定性随机打散同分。
     *
     * 列分项（LANE_W）：
     *   front   -1000  己方建筑堵在出兵口（能不选就不选）
     *   def      -60×  ★主项：敌方这一列防御强度（按最强列归一化到 0..1）
     *                   × P.laneRead（弱档读得粗，强档读得准 → 保住难度阶梯）
     *   block    -12×  这一列有敌方建筑挡路（地面兵要停下来拆墙，等于免费挨塔打）
     *   crowded   -3×  这一列此刻敌兵多（别正面硬碰，绕到他没兵的地方去）
     *   mates    +14×  ★轮 8 新增★ 这一列已经有我的兵 → 成建制，别孤军送死
     *   focus    +18×  延续上一波的主攻列（成建制，不是每波换一条路）
     *   jitter   ±4    确定性随机打散（同分不同列，每局不重样） */
    var foeP = state.aiFoe && state.aiFoe[team];
    var laneD = foeP ? foeP.laneDefense : null;
    var laneB = foeP ? foeP.laneBlock : null;
    var defMax = foeP ? foeP.defMax : 0;
    var defW = LANE_W.def * ((P.laneRead != null) ? P.laneRead : 0.8);

    /* ---- v13：目标模式（打经济 / 直推 / 随机应变）----
     * 这里只影响「选哪一列」，不改派兵数量与预算。 */
    var tmode = aiTargetMode(state, team, P);
    var raidCols = null;
    var foeT = OPP[team];
    if (tmode.mode === 'raid' && foeP && foeP.mines) {
      raidCols = new Array(COLS + 2).fill(0);
      for (var mi = 0; mi < foeP.mines.length; mi++) {
        var mnn = foeP.mines[mi];
        if (mnn.guard > 0.01) continue;                       // 有塔罩着就不算裸矿
        if (mnn.c >= 1 && mnn.c <= COLS) raidCols[mnn.c] = 1;
      }
    }
    var pushc1 = BASE_RECT[foeT].c1, pushc2 = BASE_RECT[foeT].c2;
    var normDef = function (cc) {
      if (!laneD || defMax <= 1e-9) return 0;
      return laneD[cc] / defMax;                       // 0 = 这列完全没人防 · 1 = 最厚的那一列
    };
    /* 我方在各列已有的兵数（成建制判据：把新兵放到「已经有兄弟」的列上）。
     * 只用自己单位的位置 —— 公开信息，不涉及敌方任何隐藏状态。 */
    var ownLane = new Array(COLS + 2).fill(0);
    state.units.forEach(function (o) {
      if (o.team !== team) return;
      if (o.col >= 1 && o.col <= COLS) ownLane[o.col]++;
    });
    var rawScore = function (cc) {
      var s = 0;
      if (frontBlocked(state, team, cc)) s -= LANE_W.front;
      s -= defW * normDef(cc);
      if (laneB) s -= LANE_W.block * Math.min(3, laneB[cc]);
      s -= LANE_W.crowded * (A.laneCount[cc] || 0);
      if (ownLane[cc] > 0) s += LANE_W.mates * Math.min(2, ownLane[cc]);   // 有兄弟在这一列
      if (raidCols && raidCols[cc]) s += LANE_W.raid * tmode.raidW;        // 这列有裸矿 → 去拆
      if (tmode.mode === 'push' && cc >= pushc1 && cc <= pushc2) {
        s += LANE_W.push * tmode.push;                                     // 压得住 → 集中推家
      }
      return s;
    };
    var raw = new Array(COLS + 2).fill(0), cc0;
    /* 打分 = 确定性部分（raw）+ 随机打散（jitter）。
     * ★ jitter 必须计入「谁是最优列」这一步 ★
     *   否则当好几列的防御强度并列（比如玩家左边整片都没设防，几列都是 0）时，
     *   argmax 永远落在列号最小的那一列，AI 一辈子只打同一条路 —— 一局下来像机器人。
     *   先随机打散再选最优，并列的这些列就会在「薄弱区」内自然轮转。 */
    var scored = new Array(COLS + 2).fill(0);
    var bestCol = 1;
    for (cc0 = 1; cc0 <= COLS; cc0++) {
      raw[cc0] = rawScore(cc0);
      scored[cc0] = raw[cc0] + (rand(state) - 0.5) * LANE_W.jitter;
      if (scored[cc0] > scored[bestCol]) bestCol = cc0;
    }
    /* 主攻列记忆（成建制）：连续几波打同一列，直到
     *   ① 时间窗到期，或 ② 玩家把那一列补厚了（防御强度比最优列高出 LANE_FOCUS_TOL），
     *   或 ③ 那一列被自家建筑堵死。这不是「死板」—— 玩家一补防 AI 就换条路，
     *   正是「读对手 → 打弱点」该有的反应。 */
    var focus = state.aiFocus && state.aiFocus[team];
    var focusSec = (P.focusTime != null) ? P.focusTime : 30;
    var focusW = (P.laneFocus != null) ? P.laneFocus : 0.8;
    if (focus) {
      /* 注意：这里原来也写成 `var keep`，会被变量提升**覆盖掉上面 armyKeep 的 keep**
       *（function 作用域），虽然之后没再用到 armyKeep，但属于易踩的坑，改名隔离。 */
      var keepFocus = (focus.col >= 1 && focus.col <= COLS && state.time < focus.until &&
                  !frontBlocked(state, team, focus.col) &&
                  (normDef(focus.col) - normDef(bestCol)) <= LANE_FOCUS_TOL);
      if (!keepFocus) { focus.col = bestCol; focus.until = state.time + focusSec; }
    }
    var focusCol = (focus && focus.col >= 1) ? focus.col : bestCol;

    var colOrder = [];
    for (cc0 = 1; cc0 <= COLS; cc0++) {
      var sc = scored[cc0] + ((cc0 === focusCol) ? LANE_W.focus * focusW : 0);
      colOrder.push({ c: cc0, s: sc });
    }
    colOrder.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      return a.c - b.c;                                 // 彻底同分时按列号定序，保持确定性
    });
    cols = colOrder.map(function (x) { return x.c; });

    /* 诊断（默认关闭）：记录每一次派兵的「选列决策」——
     * 当时敌方每列防御强度、主攻列、最终选的列。dev/_diag6.js 用它算
     * 「AI 派的列 vs 该列防御强度」的相关性，证明它真的在打弱点。 */
    if (state.aiLaneDebug && state.aiLaneDebug.push) {
      var blockedArr = [];
      for (cc0 = 1; cc0 <= COLS; cc0++) blockedArr.push(frontBlocked(state, team, cc0) ? 1 : 0);
      state.aiLaneDebug.push({
        t: Math.round(state.time), team: team, pick: picks[0],
        col: cols[0], focus: focusCol,
        def: laneD ? laneD.slice(1, COLS + 1) : null,
        defMax: defMax, raw: raw.slice(1, COLS + 1),
        laneCount: A.laneCount.slice(1, COLS + 1), blocked: blockedArr
      });
    }

    /* ★ 反「送死」：这一次出门值不值？★
     * 用户反馈：「会有一定的"送死"派兵」。实测基线（dev/_diag_ai.js）：
     *   地狱 vs 困难 3 局，40.2% 的兵从未进入敌方半场（出门就被塔各个击破）。
     * 这里加最后一道闸（只用自己的信息 + 敌方建筑位置/等级，均为公开信息）：
     *   目标列是「最厚的那一列」（normDef ≥ 0.9） + 这一列我一个兵都没有（孤军）
     *   + 这只是廉价炮灰（单价 ≤150，即步兵/攻城兵）
     *   → 这一轮先不出，钱留着跟下一只一起走（aiThink 的集结窗口会凑成小队）。
     * 推家窗口（aiPush 未过期）不拦：那时换血是设计意图。 */
    var allInNow = !!(state.aiPush && state.aiPush[team] > state.time);
    var topCost = DATA.units[picks[0]].cost;
    if (!allInNow && topCost <= 150 && ownLane[cols[0]] === 0 && normDef(cols[0]) >= 0.9) {
      if (dbg) { dbg.blocked = 'thick-lane-solo'; state.aiDeployDebug.push(dbg); }
      return false;
    }

    /* ★ 成建制出门：空场首发要一次放出两只（v18）★
     * 上面那道「攒钱」闸只能拦「钱不够」的情况；实测发现地狱档更多时候是
     * **钱够、但一次 aiThink 只出一只**，而前一只在两秒内就被吃掉了 →
     * 下一次派兵场上又是空的（`peersAtSpawn === 0` 占 38.8%）。
     * 所以这里补最后一块：场上 0 只己方兵时，同一次决策里连出两只
     * （不同兵种 + 不同列 —— 同兵种有冷却、同列有 0.4 秒短冷却，这是游戏规则）。
     * 于是"出门的最小单位"真的变成两只，而不是一字长蛇。 */
    var squadGoal = (myOnBoard === 0 && A.inMyHalf < 2) ? 2 : 1;
    /* 第二只从哪来：picks 通常只有**一个**元素（就是名额表当前那一格），
     * 所以凑小队时要把 want 里其它「也买得起」的兵种接在后面，
     * 否则 pool 只有一个元素、循环第一圈就结束了（实测踩过：只出 1 只）。 */
    var deployPool = picks.slice();
    if (squadGoal > 1) {
      want.forEach(function (k) { if (deployPool.indexOf(k) < 0) deployPool.push(k); });
    }
    var made = 0, lastCol = 0, lastKey = null;
    /* budgetLeft：小队里的第二只也必须落在**本次军费预算**内（canUse 已经扣过 armyKeep），
     * 否则「凑小队」会变成绕过预算的后门。 */
    var budgetLeft = canUse;
    for (var oi = 0; oi < deployPool.length && made < squadGoal; oi++) {
      /* 第二只要付得起（并给 armyKeep 留底），否则跳过它看下一个更便宜的
       * ——不能 break：want 里贵的排前面，break 会把便宜的也一起挡掉。 */
      if (made > 0 && state.res[team] - DATA.units[deployPool[oi]].cost < keep) continue;
      if (DATA.units[deployPool[oi]].cost > budgetLeft) continue;
      for (var ci = 0; ci < cols.length; ci++) {
        if (made > 0 && cols[ci] === lastCol) continue;      // 同列 0.4 秒短冷却
        if (made > 0 && deployPool[oi] === lastKey) continue; // 同兵种有独立冷却
        if (!deployUnit(state, team, deployPool[oi], cols[ci]).ok) continue;
        made++;
        budgetLeft -= DATA.units[deployPool[oi]].cost;
        lastCol = cols[ci]; lastKey = deployPool[oi];
        /* 记「连续出了几只同兵种」，给 ③ 的反单调轮换用 */
        var lp = state.aiLastPick || (state.aiLastPick = {});
        if (lp[team] && lp[team].key === deployPool[oi]) lp[team].n = (lp[team].n || 1) + 1;
        else lp[team] = { key: deployPool[oi], n: 1 };
        if (state.aiHoard) delete state.aiHoard[team];    // 攒到了，清掉「攒钱」标记
        /* 名额表前移：下一次轮到表里的下一格（买不起时在下一轮重新判断） */
        if (rp && rp.list && rp.list.length && deployPool[oi] === slotKey && slotIdx >= 0) {
          rp.idx = (slotIdx + 1) % rp.list.length;
          rp.since = 0;
        }
        if (dbg) { dbg.chosen = deployPool[oi]; dbg.col = cols[ci]; dbg.squad = made; state.aiDeployDebug.push(dbg); }
        break;                                   // 这一只出完了 → 回到外循环看要不要再来一只
      }
    }
    if (made) return true;
    if (dbg) state.aiDeployDebug.push(dbg);
    return false;
  }

  /* 该列在我方半场靠前的位置是否已经被己方建筑挡住（派兵前参考一下）
   *
   * ★ 修掉的 bug（P-E）：大本营被当成「挡路」，两方 AI 从此永不走中路 ★
   * 大本营物理上确实占着 5~6 列的底行（蓝 9-10 行 / 红 1-2 行），老实现按
   * 「这一列有己方建筑 → 堵死了」一刀切，于是 5、6 两列永远吃到 -1000 的
   * front 惩罚，被排除在候选之外 —— 结果 AI 一局下来从不往中路派兵。
   *
   * 但中路其实**能用**，只是地面兵要多走一格（实测轨迹见 dev/_probe_center.js）：
   *   · 空中兵：完全无视建筑，从 5/6 列直接飞过去，一路推进到敌方大本营门口
   *     （蓝方气球兵 r11c5 → r10c5 → … → r3c5，每帧 1 格，无停顿）；
   *   · 地面兵：在通道行（行A/行B）横向挪一格，从 4/7 列进场，之后照常推进
   *     （蓝方步兵 r11c5 → r11c4 → r10c4 → … → r2c4，贴着红方大本营开打）。
   * 也就是说这两列只是「地面兵绕一格」，绝不是死路；把它判成硬堵死，等于让 AI
   * 永久放弃唯一能直接推家的那两列。
   *
   * 所以这里**跳过 b.def.isBase**：大本营不算挡路，其它己方建筑（塔/金矿）照旧算。
   * 安全性由 dev/no-stuck-test.js（单位不卡死）与 dev/_diag7.js（中列推进证据）双保险。 */
  function frontBlocked(state, team, col) {
    var rows = DIR[team] > 0 ? [6, 7, 8, 9, 10] : [5, 4, 3, 2, 1];
    for (var i = 0; i < rows.length; i++) {
      var b = state.grid[rows[i]][col];
      if (b && b.team === team && !(b.def && b.def.isBase)) return true;
    }
    return false;
  }

  /* ============================================================================
   * 选址评分（P-B）—— 把「随机挑列」升级成「打分选点」
   * ----------------------------------------------------------------------------
   * 老实现：在 zone 的行表里随机打乱列 → 返回第一个合法格。
   *   后果：塔经常摆在不覆盖敌方进攻通道的地方、或者压在自家出兵列上白挡路。
   * 新实现：枚举 zone 内全部合法格 → scoreCell 打分 → 取最高分（同分随机打散）。
   *
   * 先确认过本作的移动规则（这决定了「挡出兵列」该怎么处理）：
   *   stepTo / computeField.canStand：地面兵**不能站进任何建筑格**，
   *   唯一例外是「己方进场行」（蓝行10 / 红行1，玩家要在那行自由布局）。
   *   → 己方建筑确实会挡自己的地面兵，但兵能沿四向绕开（不是永久堵死）；
   *     真正的死局是「把己方半场某一整行填满」。
   *   所以处理方式分两层：
   *     · 硬排除：会填满一整行 → 直接不算候选（wouldSealRow）。
   *     · 软扣分：压在「还没建筑」的干净列上 → 扣分（那条列还在用来出兵）。
   * ========================================================================== */

  /* 己方地面兵能不能站在 (r,c) —— 与 stepTo 完全一致 */
  function ownGroundPassable(state, team, r, c) {
    var h = HALF[team];
    if (r < h[0] || r > h[1] || c < 1 || c > COLS) return false;
    var b = state.grid[r][c];
    if (!b) return true;
    if (b.team === team && !b.def.isBase && r === entryRowOf(team)) return true;   // 进场行可穿过
    return false;
  }

  /* 在这一格放下建筑，会不会把己方半场的某一整行填满（→ 自家地面兵永久过不去）。
   * 只需检查候选格自己那一行：其它行不受这次放置影响。 */
  function wouldSealRow(state, team, key, r, c) {
    var def = DATA.buildings[key];
    if (!def) return true;
    var entR = entryRowOf(team);
    if (r <= entR && r + def.size[0] - 1 >= entR) return false;   // 盖上进场行：地面兵可以穿过，不会封死
    var passable = 0;
    for (var cc = 1; cc <= COLS; cc++) if (ownGroundPassable(state, team, r, cc)) passable++;
    return passable <= 1;      // 只剩这一格 → 放下去这一行就整行封死
  }

  /* 这一行「往敌方方向推了几行」（相对自家大本营靠前线的那一条边）：
   *   蓝方大本营在行 9-10 → 前线边 = 9；行 6 是 +3、行 8 是 +1、行 10 是 -1。
   *   红方大本营在行 1-2 → 前线边 = 2；行 5 是 +3、行 3 是 +1。
   * 正数 = 在大本营前方的野战区，负数 = 躲在大本营后面。 */
  function forwardRows(team, r) {
    var edge = DIR[team] > 0 ? BASE_RECT[team].r1 : BASE_RECT[team].r2;
    return DIR[team] > 0 ? (edge - r) : (r - edge);
  }

  /* 评分权重（一次改这里就能调「AI 的选址口味」） */
  var SCORE_W = {
    cover: 100,    // ① 覆盖热度（最大权重）
    front: 40,     // ② 覆盖前线（尽早拦截）
    overlap: 55,   // ③ 与已有塔覆盖重叠（边际价值递减，避免 5 座塔挤在同 3 列）
    lane: 34,      // ④ 占用还干净的出兵列
    aura: 30,      // ⑤ 光环协同（ward 罩塔 / 塔靠 ward）
    depth: 12,     // ⑥ 纵深（别贴脸大本营）
    center: 8,     // ⑦ 中枢偏置（开局还没热度时略偏中间列）
    threat: 52,    // ★v13⑧ 真正的威胁覆盖：射程内此刻有敌方单位，且越靠近自家大本营越值钱
    wall: 13,      // ★v13⑨ 与已有建筑相邻成墙（逼敌方地面兵绕行、走进塔的射程）
    econ: 10       // 金矿：优先塞进已经有建筑的列，把干净列留给地面兵
  };

  /* 选点评分上下文（一次 findSpot 内所有候选共用，避免重复扫建筑）
   * 用 tick + 建筑数 + 单位数 做失效标记：同一 tick 内复用，跨 tick 自动重算。 */
  function spotCtx(state, team) {
    var tok = state.tick + '/' + state.buildings.length + '/' + state.units.length;
    var old = state._aiSpotCtx;
    if (old && old.team === team && old.tok === tok) return old;
    var ctx = {
      tok: tok, team: team,
      colChoked: new Array(COLS + 2).fill(false),   // 该列是否已被己方建筑占着（= 已不是干净出兵列）
      cleanLanes: 0,
      towers: [],                                    // 己方攻击塔 {row,col,R}
      wards: [],                                     // 己方光环塔 {row,col,ar}
      baseC: rectCenter(BASE_RECT[team]),
      entR: entryRowOf(team)
    };
    state.buildings.forEach(function (b) {
      if (b.team !== team) return;
      if (b.def.isBase) return;
      var st = statsForLevel(b.def, b.level || 1, b.branch);
      if (b.def.atk) {
        ctx.towers.push({ row: b.row, col: b.col, R: Math.max(1, Math.round(st.range || 1)) });
      }
      if (b.def.aura) {
        ctx.wards.push({ row: b.row, col: b.col, ar: st.auraRadius || 1 });
      }
      (b.refs || []).forEach(function (ref) {
        var p = fromRef(ref);
        if (!p) return;
        if (p.r === ctx.entR) return;      // 进场行上的建筑兵可以穿过 → 不算「占住这一列」
        ctx.colChoked[p.c] = true;
      });
    });
    for (var c = 1; c <= COLS; c++) if (!ctx.colChoked[c]) ctx.cleanLanes++;
    state._aiSpotCtx = ctx;
    return ctx;
  }

  /* 单格评分。heat = hotLanes(state, team)（0..1 归一化）；scoreCell 也可被诊断脚本单独调用。
   * 返回 -1e9 表示「这一格不能放」（非法/半场外/会封死自家兵路/已被占用）。 */
  function scoreCell(state, team, key, r, c, heat) {
    var def = DATA.buildings[key];
    if (!def) return -1e9;
    if (!inGrid(r, c) || !inHalf(team, r, c)) return -1e9;
    if (!inHalf(team, r + def.size[0] - 1, c + def.size[1] - 1)) return -1e9;
    if (wouldSealRow(state, team, key, r, c)) return -1e9;        // 硬排除：不能把自家兵锁死
    if (!canPlace(state, team, key, r, c).ok) return -1e9;

    var ctx = spotCtx(state, team);
    var hw = heat || [];
    var st = statsForLevel(def, 1, null);
    var R = (st.range != null) ? Math.max(1, Math.round(st.range)) : 1;
    var frontR = (DIR[team] > 0) ? HALF[team][0] : HALF[team][1];   // 己方半场最靠前那一行
    var pos = { row: r, col: c };
    var c0 = Math.max(1, c - R), c1 = Math.min(COLS, c + R);
    var score = 0;

    if (def.atk) {
      /* ① 覆盖热度：射程（切比雪夫）内的列热度求和 ×「能覆盖到的行占比」。
       *    贴上下边界时能覆盖的行更少 → 自动扣分（不浪费射程）。
       * ② 覆盖前线：能打到「我方前线那行 ∩ 热列」再加一笔 —— 越早拦截越值钱。 */
      var rowSpan = Math.min(ROWS, r + R) - Math.max(1, r - R) + 1;
      var heatSum = 0, frontSum = 0, centerSum = 0, cc;
      for (cc = c0; cc <= c1; cc++) {
        var w = hw[cc] || 0;
        heatSum += w;
        if (Math.max(Math.abs(r - frontR), Math.abs(cc - c)) <= R) frontSum += w;
        centerSum += 1 - Math.abs(cc - (COLS + 1) / 2) / (COLS / 2);
      }
      score += SCORE_W.cover * heatSum * (rowSpan / (2 * R + 1));
      score += SCORE_W.front * frontSum;
      score += SCORE_W.center * (centerSum / (c1 - c0 + 1)) * 0.5;

      /* ③ 覆盖重叠：已经有塔罩住的列，再放一座的边际价值打折。
       *    第 1、2 座重叠不罚（集中火力本身是好事），越堆越贵。 */
      var overlap = 0;
      for (var ti = 0; ti < ctx.towers.length; ti++) {
        var tb = ctx.towers[ti];
        var lo = Math.max(c0, tb.col - tb.R), hi = Math.min(c1, tb.col + tb.R);
        if (hi >= lo) overlap += (hi - lo + 1);
      }
      var coverN = c1 - c0 + 1;
      score -= SCORE_W.overlap * clamp((overlap / coverN - 0.5) / 1.5, 0, 1);

      /* ④ 出兵列：压在还干净的列上 = 砍掉一条自家地面兵的通道（兵要绕行）。
       *    干净列越少，每占一条越贵 —— 保证手上永远留着几条能出兵的路。
       *    已经有建筑的列再放塔不额外收费（那条列本来就要绕）。 */
      if (!ctx.colChoked[c]) score -= SCORE_W.lane * (0.5 + (1 - ctx.cleanLanes / COLS));

      /* ⑤ 光环协同：攻击塔贴着已有 ward → 吃减伤 buff */
      var wardN = 0;
      for (var wi = 0; wi < ctx.wards.length; wi++) {
        var wb = ctx.wards[wi];
        if (gridDist(pos, { row: wb.row, col: wb.col }) <= wb.ar) wardN++;
      }
      score += SCORE_W.aura * Math.min(2, wardN) / 2;

      /* ⑥ 纵深：看「在自己半场里往前推了几行」（只看纵向，不看横向 ——
       *    横向距离用 max() 算会把塔赶到棋盘角落，那是反效果）。
       *    偏好离自家大本营前线 1~2 行的位置：够靠前能拦、又不至于贴脸送死。 */
      var dRow = forwardRows(team, r);
      score += SCORE_W.depth * clamp(1 - Math.abs(dRow - 1.5) / 2.5, 0, 1);

      /* ⑧ 真实威胁覆盖（v13）：这一格盖不盖得住「此刻正在推过来的敌兵」？
       *    原实现只看「列热度」（历史统计），所以敌人真的压到脸上时，AI 还是
       *    按历史热度在别处建塔 —— 用户抱怨的「敌人打大本营时不补防御」就是这个。
       *    越靠近自家大本营的敌人越危险，权重越高（打到本营就输了）。 */
      var myBaseR = BASE_RECT[team].r1, myBaseC = (BASE_RECT[team].c1 + BASE_RECT[team].c2) / 2;
      var threatW = 0;
      for (var ui = 0; ui < state.units.length; ui++) {
        var eu = state.units[ui];
        if (eu.team === team || eu.hp <= 0) continue;
        if (Math.max(Math.abs(Math.round(eu.row) - r), Math.abs(Math.round(eu.col) - c)) > R) continue;
        /* 危险度：离我大本营越近越高（1 → 贴脸，0 → 刚进己方半场） */
        var db = Math.max(Math.abs(eu.row - myBaseR), Math.abs(eu.col - myBaseC));
        var danger = clamp(1 - db / (ROWS * 0.9), 0.15, 1);
        threatW += danger * (eu.def && eu.def.air ? 1.25 : 1);   // 空军更该优先拦
      }
      score += SCORE_W.threat * Math.min(3, threatW) / 3;

      /* ⑨ 寻路干扰（v13）：贴着已有建筑放 → 更容易连成墙/口袋，逼敌方地面兵绕路。
       *    只在「会挡地面兵」的建筑上计分（金矿/防御塔都算，攻击塔也算）。
       *    注意不能鼓励把整行封死 —— wouldSealRow 已经在最上面硬排除了那种格。 */
      var adj = 0;
      var nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (var ni = 0; ni < nb.length; ni++) {
        if (!inGrid(nb[ni][0], nb[ni][1])) continue;
        if (state.grid[nb[ni][0]] && state.grid[nb[ni][0]][nb[ni][1]]) adj++;
      }
      score += SCORE_W.wall * (adj / 4);
    } else if (def.aura) {
      /* 光环塔（ward）：自己不能打，唯一价值就是罩住更多攻击塔 */
      var near = 0;
      for (var ti2 = 0; ti2 < ctx.towers.length; ti2++) {
        if (gridDist(pos, { row: ctx.towers[ti2].row, col: ctx.towers[ti2].col }) <= 1) near++;
      }
      score += SCORE_W.aura * 2 * Math.min(3, near) / 3;
      if (!ctx.colChoked[c]) score -= SCORE_W.lane * 0.5;
      // 还没塔可罩时也别乱跑：同样偏一点中间列（大本营在 5~6 列，塔大多在附近）
      var cSumW = 0;
      for (var cw = c0; cw <= c1; cw++) cSumW += 1 - Math.abs(cw - (COLS + 1) / 2) / (COLS / 2);
      score += SCORE_W.center * (cSumW / (c1 - c0 + 1)) * 0.5;
      // 光环塔不送前线：同样用「往前推了几行」，越靠后越好
      score += SCORE_W.depth * (1 - clamp(forwardRows(team, r) / 3, 0, 1));
    } else {
      /* 经济建筑（金矿）：不参与防御评分，只做两件事 ——
       *   ① 优先塞进「已经有建筑」的列（把干净列留给地面兵）
       *   ② 越靠后越安全（zone 已经限制在 rear，这里再加一点纵深） */
      score += ctx.colChoked[c] ? SCORE_W.econ * 1.5 : -SCORE_W.econ * 0.5;
      score += SCORE_W.depth * (1 - clamp(forwardRows(team, r) / 3, 0, 1));
    }
    return score;
  }

  /* 找空位：'front' = 靠近前线，'defend' = 靠大本营（最后方），'rear' = 后方（金矿专用），'mid' = 中间
   * 坐标约定：蓝方 行6(前线) → 行10(后方)；红方 行5(前线) → 行1(后方)。
   * 注意：红方的「后方」是行号**小**，蓝方的「后方」是行号**大**。
   *
   * 函数签名与返回契约保持不变（返回 {row,col} 或 null），内部改用 scoreCell 评分选点，
   * 所以 aiThink 里所有调用点都不用改。 */
  function findSpot(state, team, key, zone) {
    var def = DATA.buildings[key];
    if (!def) return null;
    var isBlue = DIR[team] > 0;          // 蓝方朝行号增大方向进攻，所以大本营在行9-10
    var rows;
    if (zone === 'front') rows = isBlue ? [6, 7, 8] : [5, 4, 3];
    else if (zone === 'defend') rows = isBlue ? [9, 10, 8, 7] : [2, 1, 3, 4];   // 紧贴大本营
    else if (zone === 'rear') rows = isBlue ? [10, 9, 8] : [1, 2, 3];           // 最后方（金矿）
    else rows = isBlue ? [6, 7, 8, 9, 10] : [5, 4, 3, 2, 1];

    var heat = hotLanes(state, team);

    var attempt = function (rowList) {
      var best = -1e9, pool = [], all = [];
      for (var ri = 0; ri < rowList.length; ri++) {
        var r = rowList[ri];
        for (var c = 1; c <= COLS; c++) {
          if (!inHalf(team, r, c)) continue;
          var s = scoreCell(state, team, key, r, c, heat);
          if (s <= -1e8) continue;                       // 非法 / 会封死自家兵路
          all.push({ row: r, col: c, s: s });
          if (s > best + 1e-9) { best = s; pool = [{ row: r, col: c }]; }
          else if (s >= best - 1e-9) pool.push({ row: r, col: c });   // 同分 → 随机打散，避免每局一模一样
        }
      }
      if (!pool.length) return null;
      /* 诊断用（默认关闭）：state.aiSpotDebug 是个数组时，把这次选点的
       * 热度向量 / 全部候选分数 / 最终选择都记下来，方便 /dev/_diag* 观察 AI 的「选址思路」。 */
      if (state.aiSpotDebug && state.aiSpotDebug.push) {
        state.aiSpotDebug.push({
          t: Math.round(state.time), team: team, key: key, zone: zone,
          heat: heat.slice(), best: best, picked: pool[0],
          cands: all.sort(function (x, y) { return y.s - x.s; }).slice(0, 6)
        });
      }
      return pool[Math.floor(rand(state) * pool.length) % pool.length];
    };

    var got = attempt(rows);
    if (got) return got;
    /* 兜底：这个 zone 里一个合法格都没有（半场被塞满 / 都被判会封死）→
     * 放宽到整个己方半场再评一次，避免「因为 zone 写窄而彻底找不到位置」。 */
    var whole = isBlue ? [6, 7, 8, 9, 10] : [5, 4, 3, 2, 1];
    return attempt(whole);
  }


  function aiUpdate(state, team, dt) {
    /* 热力图必须「每 tick」更新（而不是只在思考点更新）：
     * 它是随时间累积/衰减的记忆，按 tick 采样才不会漏掉敌兵的短停留。 */
    updateHeat(state, team, dt);
    /* 敌方画像同理：兵种倾向是「累计 - 衰减」的账本，必须每 tick 把
     * 「这一帧敌方场上有什么」记进账，否则会漏掉短命的单位（比如刚落地就被打死的弓箭手）。 */
    updateFoeProfile(state, team, dt);
    state.ai.timer[team] += dt;
    if (state.ai.timer[team] < DATA.ai.thinkEvery) return;
    state.ai.timer[team] = 0;
    aiThink(state, team);
  }

  /* ------------------------------------------------------------ 导出 */
  return {
    ROWS: ROWS, COLS: COLS, RED: RED, BLUE: BLUE, TEAMS: TEAMS, OPP: OPP, DIR: DIR,
    CHANNEL_ROW: CHANNEL_ROW, BASE_RECT: BASE_RECT, HALF: HALF, TILE: TILE,
    DATA: DATA, DT: DT, TICK_HZ: TICK_HZ, UNIT_CAP: UNIT_CAP,
    RESERVE_CAP: RESERVE_CAP, CHANNEL_CAP: CHANNEL_CAP,
    createState: createState, update: update, aiUpdate: aiUpdate, aiThink: aiThink,
    canPlace: canPlace, placeBuilding: placeBuilding, upgradeBase: upgradeBase,
    upgradeCost: upgradeCost, spawnUnit: spawnUnit, rebuildFields: rebuildFields,
    statsForLevel: statsForLevel, buildingUpgradeCost: buildingUpgradeCost,
    boostOf: boostOf,
    upgradeBuilding: upgradeBuilding, buildingInfo: buildingInfo,
    branchesFor: branchesFor, branches: DATA.branches, incomeMultiplier: incomeMultiplier,
    reloadNeighbors: reloadNeighbors,
    spellsAvailable: spellsAvailable, canCastSpell: canCastSpell, castSpell: castSpell,
    spellStatus: spellStatus, spellTargets: spellTargets, unitCells: unitCells,
    spellDamageOf: spellDamageOf,
    SPELL_UNIT_MUL: SPELL_UNIT_MUL, SPELL_BUILD_MUL: SPELL_BUILD_MUL, isUnitReady: isUnitReady,
    towerHitList: towerHitList, towerCandidates: towerCandidates, combatStatsOf: combatStatsOf,
    stepUnit: stepUnit, hasNonBaseTarget: hasNonBaseTarget,
    candidateSets: candidateSets, pickTarget: pickTarget, hasAnyTarget: hasAnyTarget,
    canDeploy: canDeploy, deployUnit: deployUnit, reserveCount: reserveCount,
    addReserve: addReserve, channelRow: channelRow, mitigate: mitigate,
    enemyBase: enemyBase, ownBase: ownBase, unitsOf: unitsOf, baseLevelOf: baseLevelOf,
    inGrid: inGrid, inHalf: inHalf, toRef: toRef, fromRef: fromRef, rectCells: rectCells,
    rectCenter: rectCenter, centerOf: centerOf, nearestCellOf: nearestCellOf, dist: dist,
    clamp: clamp, gridDist: gridDist, cardinalDist: cardinalDist, unitReach: unitReach,
    isPassable: isPassable, airPassable: airPassable,
    blockingBuildingAt: blockingBuildingAt, wallAtTeam: wallAtTeam,
    removeBuilding: removeBuilding, computeField: computeField, findSpot: findSpot,
    scoreCell: scoreCell, updateHeat: updateHeat, hotLanes: hotLanes, SCORE_W: SCORE_W,
    makeFoeProfile: makeFoeProfile, updateFoeProfile: updateFoeProfile,
    foeShares: foeShares, foeRead: foeRead, LANE_W: LANE_W, PRED_EQ: PRED_EQ,
    AI_PRESETS: AI_PRESETS, analyzeBoard: analyzeBoard, aiDeploySmart: aiDeploySmart,
    aiBudgetPlan: aiBudgetPlan, BUDGET_RATIO: BUDGET_RATIO, aiBuildRoster: aiBuildRoster,
    aiPickTower: aiPickTower, aiPickTowerWeighted: aiPickTowerWeighted,
    assessPower: assessPower, assessPhase: assessPhase, planSpending: planSpending,
    levelMultipliers: levelMultipliers, damageBuilding: damageBuilding,
    demolishBuilding: demolishBuilding, demolishRefund: demolishRefund, canDemolish: canDemolish,
    globalBonus: globalBonus, globalUpgradeCost: globalUpgradeCost, upgradeGlobal: upgradeGlobal,
    globalUpgradeStatus: globalUpgradeStatus, globalUpgrades: DATA.globalUpgrades,
    fieldFor: fieldFor,
    forEachCell: forEachCell, rand: rand,
    globalMulOf: globalMulOf
  };
});
