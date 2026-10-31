/* ============================================================================
 * view.js —— 视角镜像的纯数学（无 DOM、无状态）
 * ----------------------------------------------------------------------------
 * 背景：双人对战里蓝方大本营恒在行 9–10、红方恒在行 1–2（见 logic.js BASE_RECT）。
 * 直接照这个画，红方玩家会「自己在上方、往上打」，和蓝方玩家的手感完全相反。
 *
 * 要做的事只有一件：红方视角把整盘**旋转 180°**。
 *     viewRow = ROWS + 1 - row
 *     viewCol = COLS + 1 - col
 * 为什么是 180° 而不是「只上下翻」：
 *   · 只翻行的话，左右也是反的（列 1 还在左边）—— 玩家摆建筑会镜像错位；
 *   · 180° 同时翻行和列，等于「站在棋盘对面看」，整个平面的相对关系（左上/右下）
 *     全部一致地转过去，点击、拖拽、范围圈都不用特判。
 *   · 180° 是自逆变换：同一个函数既能做「逻辑→屏幕」，也能做「屏幕→逻辑」。
 *
 * 另外两个配套映射：
 *   · facing：朝向要跟着转（逻辑朝上 = 屏幕朝下），否则红方玩家会看到
 *     "我的兵背对着我往前冲"。
 *   · vTeam：视觉阵营。规则是「我是蓝、对面是红」，即只看 team === me，
 *     跟逻辑阵营名无关。这样两端看到的是同一套颜色语言。
 *
 * 尺寸可注入（setSize），单测里能换成小棋盘而不用复制常量。
 * ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameView = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 默认与 logic.js 一致：10×10，外加首尾两条通道行（共 12 行） */
  var ROWS = 10, COLS = 10;

  function setSize(rows, cols) {
    if (rows > 0) ROWS = rows | 0;
    if (cols > 0) COLS = cols | 0;
    return { rows: ROWS, cols: COLS };
  }
  function size() { return { rows: ROWS, cols: COLS }; }

  /* 逻辑行 → 屏幕行。行号域是 0..ROWS+1（含两条通道行），
   * 所以对称轴是 (ROWS+1)/2：0↔ROWS+1，1↔ROWS。 */
  function flipRow(r, flip) { return flip ? (ROWS + 1 - r) : r; }
  /* 逻辑列 → 屏幕列。列号域是 1..COLS，对称轴 (COLS+1)/2：1↔COLS。 */
  function flipCol(c, flip) { return flip ? (COLS + 1 - c) : c; }

  function cellToView(row, col, flip) {
    return { row: flipRow(row, flip), col: flipCol(col, flip) };
  }

  /* 180° 旋转下朝向的映射：上下互换、左右互换。
   * 四向全映射 → 变换两次回到原值（对合），单测会断言这一点。 */
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  function facing(f, flip) {
    if (!flip) return f;
    return OPPOSITE[f] || f;
  }

  /* 视觉阵营：「我」恒为蓝，「对面」恒为红。me 传当前玩家逻辑阵营。 */
  function vTeam(team, me) { return (team === me) ? 'blue' : 'red'; }

  return {
    setSize: setSize, size: size,
    flipRow: flipRow, flipCol: flipCol, cellToView: cellToView,
    facing: facing, vTeam: vTeam
  };
});
