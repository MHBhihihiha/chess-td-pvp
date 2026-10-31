# 双人对战（PvP）联机设计 —— 确定性锁步 + WebSocket 中继

> 状态：**已完成并接入 UI**（`src/net.js` / `server/relay.js` / `dev/net-test.js` / `index.html`）。
> 开始界面新增「单机挑战 / 双人对战」模式切换；PvP 用动作函数拦截层走命令队列，
> AI 模式完整保留。本文同时是接入说明书与操作说明。
>
> 本地对打：`node server/relay.js` → 浏览器开两个标签页访问 `http://localhost:8787` →
> 都点「双人对战」，一个「创建房间」、另一个输入同一房间号「加入房间」。
> 异地：把 relay 部署到公网（或临时隧道），双方打开同一地址、用同一房间号即可。

## 1. 为什么选「确定性锁步」

本项目天生适合（已核实）：

| 条件 | 现状 |
|---|---|
| 仿真确定性 | `rand(state)` 是带种子的 xorshift32（`logic.js:617`），全程不用 `Math.random` |
| 固定步长 | `update(state, DT)`，`DT = 1/20`（20Hz） |
| 不读墙上时钟 | `logic.js` 内无 `Date.now/performance.now/setTimeout`，只吃传入 `dt` |
| 动作是离散命令 | `deployUnit / placeBuilding / castSpell / upgradeBase / upgradeBuilding / upgradeGlobal / demolishBuilding` |
| 逻辑与渲染分离 | `src/logic.js`（UMD 纯逻辑） + `index.html`（渲染），两端跑同一份逻辑 |

⇒ 两端各自本地跑完整仿真，只交换「命令 + 目标 tick」。带宽极小，服务器只转发，不做判定。

## 2. 架构

```
  玩家A(host)                             玩家B(guest)
 ┌──────────────┐    join(room)          ┌──────────────┐
 │ index.html   │ ─────────────────────► │ index.html   │
 │  + net.js    │  ◄── paired(host) ───  │  + net.js    │
 │              │      start(seed) ────► │              │
 │  本地仿真 ────┼── cmd/chk (WebSocket) ─┼── 本地仿真   │
 └──────────────┘        ↓ 转发 ↑         └──────────────┘
                  ┌───────────────────┐
                  │ server/relay.js   │  只做：房间配对 + 原样转发
                  │ (Node, 零依赖)    │  不跑逻辑、不做权威判定
                  └───────────────────┘
```

- **P2P 直连（WebRTC）** 是后续可选升级（延迟更低），但需要信令 + STUN/TURN。
- 本方案用**中继**，天然免 NAT 穿透，最快能玩上。

## 3. 协议（全部 JSON 文本帧）

| 消息 | 方向 | 说明 |
|---|---|---|
| `{type:'join', room}` | 客户端→服务器 | 加入房间（房间名自动大写、去非字母数字、截 8 位） |
| `{type:'waiting', room}` | 服务器→客户端 | 已入房，等待对手 |
| `{type:'paired', role:'host'\|'guest', peerId}` | 服务器→双方 | 凑满两人，分配角色（先到=host） |
| `{type:'start', seed, cfg}` | host→guest（经转发） | 开局：下发种子与配置。**种子必须一致** |
| `{type:'cmd', c:{...}}` | 客户端↔客户端 | 一条玩家命令（见 §4） |
| `{type:'chk', tick, h}` | 客户端↔客户端 | 每 N tick 的状态哈希，用于 desync 检测 |
| `{type:'peer-left'}` | 服务器→客户端 | 对手掉线 |
| `{type:'rematch'}` | 客户端↔客户端 | 再来一局（重新 `start` 新种子） |

> 除 `join` 外，服务器**原样转发**给同房间对手。命令/校验的作用域与顺序由两端锁步引擎保证。

## 4. 命令表（`cmd.c`）

| op | 字段 | 映射到 logic |
|---|---|---|
| `deploy` | `team,k,col` | `deployUnit(state,team,k,col)` |
| `place` | `team,k,row,col` | `placeBuilding(state,team,k,row,col)` |
| `cast` | `team,k,row,col` | `castSpell(state,team,k,row,col)` |
| `upBase` | `team` | `upgradeBase(state,team)` |
| `upBld` | `team,ref,branch?` | `upgradeBuilding(state, state.byRef[team][ref], branch)` |
| `dem` | `team,ref` | `demolishBuilding(state, state.byRef[team][ref])` |
| `upGlobal` | `team,k` | `upgradeGlobal(state,team,k)` |

- **建筑用 `ref`**（`'r{row}c{col}'`，建筑左上角）定位：两端建筑布局一致，可互相还原。
- 引擎会给命令补 `_t`(执行tick)、`_s`(发送方)、`_q`(发送方序号)；执行前按 `(_t, _s 固定序, _q)` 排序。
  固定序：`blue` 先于 `red`。⇒ 同 tick 多命令在两端执行顺序必然一致。

## 5. 时序与同步

- **输入延迟**：本地操作不立即执行，排到 `tick + delayTicks`（默认 6 tick = 300ms）。
  派兵/放塔/法术都是低频操作，这个延迟手感无感。
- **desync 检测**：每 `checkEvery`(默认 20) tick 交换 `checksum(state)`
  （rngState + 单位/建筑数 + 血量总和 + 金币 + 单位坐标）。不一致即 `onDesync`。
- **迟到命令**（v1 限制）：WebSocket 可靠有序，正常不会迟到；若迟到，v1 仍照常入队执行，
  可能触发 desync 告警。后续可加「等待缓冲 / 回滚重放」。
- **暂停/追帧**：后台标签页会暂停 rAF；接入时若发现 `document.hidden`，应暂停并等待对手，
  避免一端跑得比另一端快（锁步必须同 tick）。

## 6. index.html 接入清单（v20b 已落地）

1. **引入脚本**：在 `<script src="src/logic.js">` 之后加 `<script src="src/net.js">`。
2. **主循环**（`index.html:3474` 那圈）：
   ```js
   // 单机（现状）
   C.update(state, C.DT); C.aiUpdate(state, FOE, C.DT);
   // 双人（改造）
   if (PVP.active) { PVP.net.step(); }        // 内部已含 update；且不跑 AI
   else { C.update(state, C.DT); C.aiUpdate(state, FOE, C.DT); }
   ```
3. **8 个动作入口**（`index.html` 3060/3186/3195/3206/3308/3351/3354/3487）：
   双人模式下**先本地纯校验**（`C.canPlace/canDeploy/canCastSpell` 等，保证 UI 提示即时），
   校验通过则 `PVP.submit({op,...})` 而不是直接调 `C.xxx`；单机模式保持原样。
   > 校验通过 → 命令排到 `tick+delay` 执行；执行时两端各自复核，失败也两端一致，不会分叉。
4. **ME / FOE**：host=`blue`，guest=`red`；`ME` 取自身份，`FOE` 取对手身份；**不再调用 `aiUpdate`**。
5. **状态创建**：收到 `start(seed)` 后 `state = C.createState({seed, difficulty:'hard'})`；
   关闭自动派兵、关闭 AI 相关 UI（难度选择）。
6. **大厅 UI**：开始界面加「双人对战」→ 输入/生成房间码 → 连 `ws://host:port` → `join` →
   收到 `paired` 后由 host 发 `start(seed)` → 两端进入对局。
7. **收尾**：对局结束显示胜负；「再来一局」双方 `rematch` + 新种子重新 `createState`。

## 7. 服务器

```bash
node server/relay.js                # 默认 :8787，并静态托管游戏目录
PORT=9000 node server/relay.js
# 浏览器开 http://localhost:8787 ，两个标签页分别 创建/加入 同一房间即可本地对打
```

- 零依赖（`http` + `crypto` 手写 WebSocket），Node 18+ 直接跑。
- 公网部署：任意能跑 Node 的主机；建议前置反向代理 + `wss://`（TLS）。
- 带宽：只在有操作时发几条命令 + 每 20 tick 一个校验，几乎为 0。

## 8. 视角镜像（v21，已落地）

**需求**：双方都看到「自己是蓝方、在下方，对手是红方、在上方」。

**为什么需要**：逻辑层是固定的——蓝方大本营恒在行 9–10、出兵通道在行 11；红方恒在行 1–2、通道在行 0。
照这个画，guest（红方）会「自己在上方、往上打」，和 host 的手感完全相反，
直播/录屏时两个人说的"左边"也不是同一侧。

**做法**：逻辑层零改动，只在渲染/交互层做 **180° 旋转 + 阵营重映射**。
纯数学抽在 `src/view.js`（无 DOM、可单测）：

| 函数 | 语义 |
|---|---|
| `flipRow(r, flip)` | `ROWS+1-r`（行域 0..11，对称轴 5.5） |
| `flipCol(c, flip)` | `COLS+1-c`（列域 1..10，对称轴 5.5） |
| `facing(f, flip)` | up↔down、left↔right（朝向跟着转，否则兵会"背对镜头往前冲"） |
| `vTeam(team, me)` | 我方恒 `blue`、对手恒 `red`（与逻辑阵营名无关） |

`index.html` 里的三个薄封装 `vRow/vCol/vFacing/vTeam` 读 `FLIP` 与 `ME`，
`setFlip(ME==='red')` 在 `pvpBegin` 里置位、`pvpLeave`/`newGame` 里复位。

**为什么是 180° 而不是只翻行**：只翻行会让列也镜像错位（玩家摆建筑会点错格）；
180° 等于「站到棋盘对面看」，平面的相对关系整体转过去，点击/drag/范围圈都不用特判，
而且它是**自逆变换**——同一个函数既做「逻辑→屏幕」也做「屏幕→逻辑」。

**必须一起翻的地方（漏一个就露馅）**：

| 位置 | 漏了会怎样 |
|---|---|
| `cellRect` / `cellRectF` / `pointToCell` | 点第 3 列兵从第 8 列出来 |
| `unit_<key>_<team>` 贴图名 | 自己的兵是红皮 |
| `decoFiles` / `teamDeco`（星徽 vs 兽骨） | 自己大本营挂敌方兽骨 |
| `POSE[facing]` | 兵背对镜头推进 |
| 背景板 L7 阵营色调 | 自己脚下这片草是红的 |
| 通道标签（行 A/行 B） | 写着"点这里派兵"的却是对手那条 |
| `bgKey` 缓存 | 切视角后背景板不重画 |
| 文案（"最下面那条通道"、结算"你在蓝方"） | 说反 |

**验收**：`dev/mirror-test.js`（47 项，映射的双射/对合/两端对等 + 接线静态检查）
+ `dev/mirror-render-test.js`（19 项，真实启动渲染层后「点屏幕 (1,10) → 落到逻辑 (10,1)」）。

## 9. 风险与后续

| 风险 | 应对 |
|---|---|
| 跨浏览器浮点差异（`Math.pow/log`） | 双方用同一浏览器（Chrome/Edge/V8）；必要时把 `pow` 换查表 |
| 后台暂停导致不同步 | 检测 `document.hidden` 暂停并等待对手 |
| 迟到命令 | 提高 `delayTicks`（如 8）或后续加回滚重放 |
| 客户端作弊 | 朋友间可接受；公开对战需「服务器权威」模式（后续） |
| NAT（若升级 WebRTC） | STUN 免费；对称 NAT 需 TURN/coturn |

**建议路线**：先中继锁步（本方案）→ 跑通真实对局 → 再评估 WebRTC 降延迟 / 权威服务器。
