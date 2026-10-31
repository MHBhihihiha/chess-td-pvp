var C = require('../src/logic.js');

function scenario(label, diff, setup) {
  var s = C.createState({ seed: 5, difficulty: diff });
  s.aiTeam = 'red';
  s.res.red = 1e6;
  setup(s);
  var P = C.AI_PRESETS[diff];
  var pw = C.assessPower(s, 'red');
  var ph = C.assessPhase(s, 'red', P, pw);
  var w = C.planSpending(s, 'red', P, pw, ph);
  console.log('  ' + label.padEnd(22) + ' 形势=' + pw.stance.padEnd(6) + ' 阶段=' + ph.padEnd(11) +
    ' 经济' + w.economy.toFixed(1) + ' 防御' + w.defense.toFixed(1) +
    ' 升级' + w.upgrade.toFixed(1) + ' 兵力' + w.army.toFixed(1) + ' 科技' + w.tech.toFixed(1));
}

function massRush(s) {
  for (var i = 0; i < 8; i++) C.spawnUnit(s, 'blue', 'heavy', 4, (i % 10) + 1);
}
function richMines(s) {
  var placed = 0;
  for (var r = 4; r >= 1 && placed < 5; r--) {
    for (var c = 1; c <= 10 && placed < 5; c++) {
      var res = C.placeBuilding(s, 'red', 'mine', r, c);
      if (res.ok) { res.building.level = 4; placed++; }
    }
  }
}
function baseHurt(s) { var b = C.ownBase(s, 'red'); b.hp = b.hpMax * 0.3; s.time = 200; }
function foeHurt(s) { var b = C.ownBase(s, 'blue'); b.hp = b.hpMax * 0.2; s.time = 200; C.spawnUnit(s, 'red', 'heavy', 5, 5); }

console.log('=== 地狱档（会看形势）===');
scenario('开局白板', 'hell', function () {});
scenario('敌方大军压境', 'hell', massRush);
scenario('我方经济领先', 'hell', richMines);
scenario('大本营被打残', 'hell', baseHurt);
scenario('敌方本营快没了', 'hell', foeHurt);

console.log('\n=== 困难档（会看形势）===');
scenario('敌方大军压境', 'hard', massRush);
scenario('大本营被打残', 'hard', baseHurt);

console.log('\n=== 普通档（不看形势，永远中庸）===');
scenario('开局白板', 'normal', function () {});
scenario('敌方大军压境', 'normal', massRush);
scenario('大本营被打残', 'normal', baseHurt);
