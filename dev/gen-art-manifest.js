/* =============================================================================
 * 美术 v9 批量清单生成器
 * 用法: node dev/gen-art-manifest.js
 *
 * 从 src/logic.js 的 DATA 里读**权威数据**（建筑、分支、兵种、法术、等级数），
 * 生成 art/v9/manifest.json + manifest.csv，供批量生产逐条执行。
 * 数据一变，重跑一次清单就同步了，不会出现"清单和代码对不上"。
 * ========================================================================== */
'use strict';
var fs = require('fs');
var path = require('path');
var C = require('../src/logic.js');
var D = C.DATA;
var ROOT = path.join(__dirname, '..');
var OUTDIR = path.join(ROOT, 'art', 'v9');

/* ---------------------------------------------------------------- 材质纪元
 * 十级切成五个材质纪元，每纪元一张母版；纪元内部的两级差异由「装饰件库」程序叠加。 */
var ERAS = [
  { id: 'e1', name: '木', levels: [1, 2], hint: 'weathered timber construction, hand-hewn beams, hemp rope lashings, crude and small' },
  { id: 'e2', name: '石', levels: [3, 4], hint: 'carved stone masonry, chipped weathered edges, faint moss, solid and grounded' },
  { id: 'e3', name: '铁', levels: [5, 6], hint: 'cast iron plates, riveted seams, dark steel, industrial' },
  { id: 'e4', name: '装甲', levels: [7, 8], hint: 'hexagonal armor plating, angled steel skirts, reinforced joints' },
  { id: 'e5', name: '金', levels: [9, 10], hint: 'ornate golden plates, engraved trim, blue gem inlays, royal and legendary' }
];
function eraOf(level) {
  for (var i = 0; i < ERAS.length; i++) if (ERAS[i].levels.indexOf(level) >= 0) return ERAS[i];
  return ERAS[ERAS.length - 1];
}

/* ---------------------------------------------------------------- 家族与武器
 * base 层 = 底座 / 墙体，所有分支共用（这正是「分层省一半」的来源）
 * top  层 = 塔顶与武器，决定分支身份，基准朝向 0°（正右），渲染时整层旋转 */
var FAMILY = {
  cannon: { name: '炮塔', en: 'cannon tower', base: 'a cannon-tower pedestal', top: 'a cannon barrel' },
  arrow: { name: '箭塔', en: 'archer tower', base: 'an archer-tower pedestal', top: 'a bow' },
  mage: { name: '法师塔', en: 'mage tower', base: 'a mage-tower pedestal', top: 'a floating magic orb' },
  mortar: { name: '迫击炮塔', en: 'mortar tower', base: 'a mortar-tower pedestal', top: 'a wide mortar tube' },
  tesla: { name: '特斯拉电塔', en: 'tesla coil tower', base: 'a tesla-coil pedestal', top: 'a tesla coil' },
  ward: { name: '防御塔', en: 'defensive ward tower', base: 'a defensive ward pedestal', top: 'a ward finial' }
};

/* 分支英文名：进提示词用英文，中文留在清单里给人看 */
var BR_EN = {
  twin: 'twin-barrel', bigcannon: 'heavy cannon',
  rapid: 'rapid-fire', crossbow: 'crossbow',
  white: 'radiant', black: 'void',
  bigmortar: 'heavy mortar', missile: 'missile',
  pulse: 'pulse emitter', bigtesla: 'heavy tesla',
  crystal: 'crystal ward', bunker: 'bunker ward'
};

/* 英文开场：去掉重复冠词（"A a cannon..." → "A cannon..."） */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* 分支的造型必须体现它的数值身份 —— 这是玩家明确提的要求 */
var TOP_HINT = {
  twin: 'TWO parallel cannon barrels mounted side by side (left and right muzzles)',
  bigcannon: 'ONE very thick, long cannon barrel with a heavy muzzle brake',
  rapid: 'a bundle of arrows in a quick-load magazine, light and bristling',
  crossbow: 'a large heavy crossbow with wide steel limbs, drawn string',
  white: 'a bright white radiant energy orb with a halo ring',
  black: 'a large dark violet void orb, heavy and ominous',
  bigmortar: 'a short fat mortar bowl, wide bore aimed high',
  missile: 'a long slim missile launch tube on a rail',
  pulse: 'a ring of electrode fins around a central emitter',
  bigtesla: 'a three-pronged heavy electrode with arcing tips',
  crystal: 'a large floating blue crystal held in a stone claw',
  bunker: 'thick stone bunker walls with narrow firing slits'
};

var items = [];
var seq = 0;
function add(o) {
  seq++;
  items.push(Object.assign({ no: seq }, o));
}

/* 通用提示词骨架：所有资产共用同一段风格约束，保证风格不漂 */
function styleTail(extra) {
  return 'Clash Royale / Supercell hand-painted mobile game asset. ' +
    (extra ? extra + ' ' : '') +
    '2.5D isometric three-quarter top-down view, camera tilted 30 degrees, single isolated object centered with generous margins. ' +
    'Chunky exaggerated cartoon proportions, thick solid forms, hand-painted soft shading, one warm key light from upper-left, ' +
    'cool ambient shadow, soft ambient occlusion wherever parts touch. Outlines are colored only (dark version of each material color), ' +
    'thin and soft, never black, absent on top lit surfaces. No ground, no floor, no cast shadow, no text, no watermark, ' +
    'clean cut-out silhouette on a flat solid white background.';
}

/* ---------------------------------------------------------------- 1. 攻击塔：底座 + 武器 */
var ATTACK = ['cannon', 'arrow', 'mage', 'mortar', 'tesla'];
var byParent = {};
Object.keys(D.branches).forEach(function (k) {
  var b = D.branches[k];
  (byParent[b.parent] = byParent[b.parent] || []).push(k);
});

ATTACK.forEach(function (fam) {
  var F = FAMILY[fam];
  /* 底座：5 张母版，覆盖 L1-10，分支共用 */
  ERAS.forEach(function (era) {
    add({
      batch: fam === 'cannon' ? 1 : 2,
      group: 'building/' + fam,
      layer: 'base',
      family: fam,
      familyName: F.name,
      branch: null,
      era: era.id, eraName: era.name,
      levels: era.levels,
      file: fam + '_base_' + era.id + '.png',
      prompt: cap(F.base) + ' for a tower defense game, ' + era.hint + '. ' +
              'This is the BASE layer only — ' + (fam === 'ward' ? 'a warded platform' : 'a platform/pedestal with a socket on top, no weapon mounted') + '. ' +
              styleTail()
    });
  });
  /* 武器：L1-4 用基础武器（2 张），L5 起分叉，每个分支各 3 张（铁/装甲/金） */
  [ERAS[0], ERAS[1]].forEach(function (era) {
    add({
      batch: fam === 'cannon' ? 1 : 2,
      group: 'building/' + fam,
      layer: 'top',
      family: fam, familyName: F.name,
      branch: null,
      era: era.id, eraName: era.name,
      levels: era.levels,
      file: fam + '_top_' + era.id + '.png',
      prompt: cap(F.top) + ' for a ' + F.en + ', ' + era.hint + ', in its standard form. ' +
              'WEAPON LAYER ONLY, the barrel/aiming part must point EXACTLY to the right (3 o\'clock, 0 degrees), ' +
              'no base under it, nothing below the pivot line. ' + styleTail()
    });
  });
  (byParent[fam] || []).forEach(function (br) {
    [ERAS[2], ERAS[3], ERAS[4]].forEach(function (era) {
      add({
        batch: fam === 'cannon' ? 1 : 2,
        group: 'building/' + fam,
        layer: 'top',
        family: fam, familyName: F.name,
        branch: br, branchName: D.branches[br].name,
        branchEffect: D.branches[br].desc,
        era: era.id, eraName: era.name,
        levels: era.levels,
        file: fam + '_' + br + '_top_' + era.id + '.png',
        prompt: cap(F.top) + ' for the ' + BR_EN[br] + ' upgrade of a ' + F.en + ', and it must read as ' + TOP_HINT[br] + '. Material: ' + era.hint + '. ' +
                'WEAPON LAYER ONLY, pointing EXACTLY to the right (3 o\'clock, 0 degrees), no base, nothing below the pivot line. ' +
                styleTail()
      });
    });
  });
});

/* ---------------------------------------------------------------- 2. 防御塔（有分支、无武器） */
(function () {
  ERAS.forEach(function (era) {
    add({
      batch: 3, group: 'building/ward', layer: 'base',
      family: 'ward', familyName: '防御塔', branch: null,
      era: era.id, eraName: era.name, levels: era.levels,
      file: 'ward_body_' + era.id + '.png',
      prompt: 'A defensive ward tower (aura support building, no gun) for a tower defense game, ' + era.hint + ', ' +
              'with a socket on top for an ornament. ' + styleTail()
    });
  });
  (byParent.ward || []).forEach(function (br) {
    [ERAS[2], ERAS[3], ERAS[4]].forEach(function (era) {
      add({
        batch: 3, group: 'building/ward', layer: 'top',
        family: 'ward', familyName: '防御塔',
        branch: br, branchName: D.branches[br].name,
        branchEffect: D.branches[br].desc,
        era: era.id, eraName: era.name, levels: era.levels,
        file: 'ward_' + br + '_top_' + era.id + '.png',
        prompt: 'The top ornament for a ' + BR_EN[br] + ' upgrade (' + 'aura support tower' + '), must read as ' + TOP_HINT[br] + '. Material: ' + era.hint + '. TOP ORNAMENT ONLY, no base. ' + styleTail()
      });
    });
  });
})();

/* ---------------------------------------------------------------- 3. 金矿（5 级，无分支） */
[1, 2, 3, 4, 5].forEach(function (lv) {
  var era = eraOf(lv);
  add({
    batch: 3, group: 'building/mine', layer: 'body',
    family: 'mine', familyName: '金矿', branch: null,
    era: era.id, eraName: era.name, levels: [lv],
    file: 'mine_L' + lv + '.png',
    prompt: 'A gold mine building (resource generator) for a tower defense game at upgrade level ' + lv + ' of 5, ' +
            era.hint + ', with a visible mine shaft entrance and gold ore piles, getting richer and grander as level rises. ' +
            styleTail()
  });
});

/* ---------------------------------------------------------------- 4. 大本营（6 级整图） */
D.baseLevels.forEach(function (bl) {
  add({
    batch: 1, group: 'base', layer: 'body',
    family: 'base', familyName: '大本营', branch: null,
    era: eraOf(Math.min(bl.level * 2, 10)).id,
    eraName: eraOf(Math.min(bl.level * 2, 10)).name,
    levels: [bl.level],
    file: 'base_L' + bl.level + '.png',
    prompt: 'The main keep / royal base building of a tower defense game, upgrade level ' + bl.level + ' of 6, ' +
            'a grand fortified castle keep with a banner pole, growing more magnificent with level (stone keep → castle → fortress → golden palace). ' +
            styleTail('This is the centerpiece of the board, so it must look iconic and readable from above.')
  });
});

/* ---------------------------------------------------------------- 5. 兵种（8 × 2 阵营 × 2 帧） */
var UNIT_HINT = {
  infantry: 'a light infantry soldier with a short sword and a round wooden shield',
  heavy: 'a heavy armored soldier with a big tower shield and a war hammer',
  siege: 'a siege engineer carrying a battering ram charge and a torch',
  ram: 'a wheeled battering ram cart with an iron ram head',
  archer: 'an archer with a longbow and a quiver of arrows',
  balloon: 'a balloon trooper in a wicker basket holding a bomb, floating',
  airship: 'a small siege airship with a bomb bay',
  dragon: 'a young dragon with folded wings and an open flaming mouth'
};
var TEAM_LOOK = {
  blue: 'blue team colors — cobalt blue banner, blue-tinted armor trim',
  red: 'red team colors — crimson banner, red-tinted armor trim'
};
Object.keys(D.units).forEach(function (uk) {
  ['blue', 'red'].forEach(function (team) {
    ['idle', 'attack'].forEach(function (frame) {
      add({
        batch: 4, group: 'unit/' + uk, layer: 'sprite',
        family: uk, familyName: D.units[uk].name, branch: null,
        team: team,
        era: 'e3', eraName: '铁',
        levels: [1],
        file: 'unit_' + uk + '_' + team + '_' + frame + '.png',
        prompt: UNIT_HINT[uk] + ', ' + TEAM_LOOK[team] + ', ' +
                (D.units[uk].air ? 'floating above the ground with a soft shadow beneath ' : 'standing on the ground ') +
                (frame === 'attack' ? 'in an ATTACK pose (weapon swung / projectile released)' : 'in a neutral IDLE pose') +
                '. Small game unit sprite, must stay readable at 64 pixels. ' +
                styleTail('Top-down three-quarter view suited to a chessboard grid; feet/pivot near the bottom center.')
      });
    });
  });
});

/* ---------------------------------------------------------------- 6. 法术图标 */
var SPELL_HINT = {
  arrowRain: 'a sky full of falling arrows', fireball: 'a blazing orange fireball',
  rocket: 'a single heavy rocket', rage: 'a red berserk aura with an up arrow',
  freeze: 'an ice crystal burst', weaken: 'a cracked purple curse sigil'
};
var SPELL_EN = { arrowRain: 'Arrow Rain', fireball: 'Fireball', rocket: 'Rocket', rage: 'Rage', freeze: 'Freeze', weaken: 'Weaken' };
D.spells.forEach(function (sp) {
  add({
    batch: 5, group: 'spell', layer: 'icon',
    family: sp.key, familyName: sp.name, branch: null,
    era: 'ui', eraName: 'UI', levels: [1],
    file: 'spell_' + sp.key + '.png',
    prompt: 'A game spell icon for "' + (SPELL_EN[sp.key] || sp.key) + '": ' + (SPELL_HINT[sp.key] || sp.key) + '. ' +
            'Square icon composition, bold readable silhouette, painted in the same style as the buildings. ' + styleTail()
  });
});

/* ---------------------------------------------------------------- 7. 特效帧 */
var FX = [
  ['fx_muzzle_1', 'a small bright muzzle flash burst, 4-point star', 5],
  ['fx_muzzle_2', 'a wide short muzzle flash with smoke puff', 5],
  ['fx_impact_1', 'a small hit spark, 3 short shards', 5],
  ['fx_impact_2', 'a medium hit burst with dust', 5],
  ['fx_impact_3', 'a heavy impact crack with debris', 5],
  ['fx_boom_1', 'an explosion fireball, early stage, bright core', 5],
  ['fx_boom_2', 'an explosion fireball, mid stage, expanding', 5],
  ['fx_boom_3', 'an explosion, late stage, smoke and embers', 5],
  ['fx_boom_4', 'an explosion residue, dark smoke ring fading', 5],
  ['fx_heal_1', 'a soft green healing sparkle burst', 5],
  ['fx_spawn_1', 'a small dust puff where something appears', 5],
  ['fx_death_1', 'a small puff of smoke and debris where a unit dies', 5]
];
FX.forEach(function (f) {
  add({
    batch: 5, group: 'fx', layer: 'fx',
    family: f[0], familyName: f[0], branch: null,
    era: 'fx', eraName: 'FX', levels: [1],
    file: f[0] + '.png',
    prompt: 'A game particle effect frame: ' + f[1] + '. Centered, no background, no ground, painted with soft edges. ' + styleTail()
  });
});

/* ---------------------------------------------------------------- 8. 装饰件库（程序叠加，用于同纪元内做 Lv+ 差异） */
var DECOR = [
  ['dc_rivets', 'a horizontal strip of iron rivets, top-down', '木/石纪元升级时加铁件'],
  ['dc_gold_band', 'a thin ornate gold trim band, horizontal', '里程碑等级加金饰带'],
  ['dc_banner_blue', 'a small blue heraldic banner on a short pole', '阵营旗（蓝方）'],
  ['dc_banner_red', 'a small crimson heraldic banner on a short pole', '阵营旗（红方）'],
  ['dc_emblem_star', 'a carved stone star emblem plate', '等级徽记'],
  ['dc_cracks', 'a set of fine stone cracks, transparent', '石纪元做旧'],
  ['dc_moss', 'small patches of green moss, transparent', '石纪元做旧'],
  ['dc_rust', 'rust streaks and stains, transparent', '铁纪元做旧'],
  ['dc_skull', 'a small carved skull ornament', '高阶装饰'],
  ['dc_chain', 'a short hanging chain with a hook', '铁纪元装饰'],
  ['dc_gem_blue', 'a small faceted blue gem, glowing faintly', '金纪元镶宝石'],
  ['dc_crown_tiny', 'a tiny golden crown ornament', 'Lv10 专属']
];
DECOR.forEach(function (d) {
  add({
    batch: 6, group: 'decor', layer: 'overlay',
    family: d[0], familyName: d[0], branch: null,
    era: 'fx', eraName: '装饰', levels: [1],
    file: d[0] + '.png',
    prompt: 'A reusable decoration overlay: ' + d[1] + '. Isolated, transparent/white background, painted to match the building art. ' +
            styleTail('It will be composited on top of other art, so it must have clean edges and no drop shadow of its own.')
  });
});

/* ---------------------------------------------------------------- 输出 */
fs.mkdirSync(OUTDIR, { recursive: true });

var manifest = {
  version: 'v9',
  generatedFor: '棋盘塔防 · 蓝方 vs 红方',
  canvas: 512,
  anchor: 'bottom-center is the footprint center; barK pivot at canvas center for top layers',
  layerRules: 'base = shared pedestal (no weapon). top = weapon/ornament, pivot at canvas center, pointing 0deg (right). body = single whole image.',
  total: items.length,
  batches: {},
  items: items
};
items.forEach(function (it) { manifest.batches[it.batch] = (manifest.batches[it.batch] || 0) + 1; });

fs.writeFileSync(path.join(OUTDIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

var cols = ['no', 'batch', 'group', 'layer', 'family', 'familyName', 'branch', 'branchName', 'era', 'eraName', 'levels', 'team', 'file'];
var csv = [cols.join(',')].concat(items.map(function (it) {
  return cols.map(function (c) {
    var v = it[c];
    if (v == null) v = '';
    if (Array.isArray(v)) v = v.join('-');
    v = String(v);
    return /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',');
})).join('\n');
fs.writeFileSync(path.join(OUTDIR, 'manifest.csv'), '\ufeff' + csv, 'utf8');

/* 控制台汇总 */
var byGroup = {};
items.forEach(function (it) { byGroup[it.group] = (byGroup[it.group] || 0) + 1; });
console.log('总数: ' + items.length + ' 张');
console.log('批次: ' + JSON.stringify(manifest.batches));
console.log('--- 分组 ---');
Object.keys(byGroup).sort().forEach(function (g) {
  console.log('  ' + g.padEnd(22) + byGroup[g]);
});
console.log('已写入 art/v9/manifest.json 与 manifest.csv');
