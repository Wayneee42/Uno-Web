# Uno 项目任务完成度审计

基于当前仓库代码现状，对以下三个任务进行判断：

1. 断线重连、状态恢复
2. 出牌、抽牌均有服务器校验
3. 日志和异常处理是否完全

审计时间：2026-03-06

## 结论总览

| 任务 | 结论 | 判断 |
| --- | --- | --- |
| 1. 断线重连、状态恢复 | 未完成 | 当前实现与 `socket.id` 强绑定，断线即离房，游戏内还会直接终止对局，不具备恢复基础 |
| 2. 出牌、抽牌均有服务器校验 | 已完成 | 服务端 `socket handler -> GameManager` 双层校验已存在，客户端不能决定规则结果 |
| 3. 日志和异常处理是否完全 | 未完成 | 目前只有零散 `console.log` / `console.error` 和业务错误回包，没有完整异常边界、统一日志体系、兜底恢复策略 |

## 任务 1：断线重连、状态恢复

### 判断

未完成。

### 证据

- 服务端玩家身份直接等于当前连接的 `socket.id`，没有独立的稳定玩家标识或会话标识。
  - `server/src/game/RoomManager.ts:29-55`
  - `server/src/game/RoomManager.ts:58-85`
- 房间索引也直接按 `playerId -> roomId` 存储，而这个 `playerId` 实际上就是 `socket.id`。
  - `server/src/game/RoomManager.ts:17-18`
  - `server/src/game/RoomManager.ts:88-111`
  - `server/src/game/RoomManager.ts:160-161`
- 服务端在 `disconnect` 时会立即执行 `leaveRoom`。如果游戏正在进行，会直接 `endGameAndReturnToLobby(roomId, 'player_left')`。
  - `server/src/socket/handlers.ts:282-299`
- 客户端连接成功后直接把 `newSocket.id` 写入本地状态，说明身份随重连变化。
  - `client/src/contexts/GameContext.tsx:58-65`
- 客户端断线后只把 `isConnected` 设为 `false`，没有本地持久化、自动恢复、补拉房间状态、补拉游戏状态的逻辑。
  - `client/src/contexts/GameContext.tsx:63-65`
  - `client/src/contexts/GameContext.tsx:67-93`
- 共享事件协议里没有 `resumeSession`、`rejoinRoom`、`restoreState` 一类事件。
  - `shared/src/types/events.ts:78-113`
- 游戏状态广播依赖 `player.socketId`。即使未来保留玩家记录，只要不更新 `socketId`，广播也无法投递到新连接。
  - `server/src/socket/handlers.ts:303-311`

### 现状影响

- 玩家网络抖动后不会恢复到原身份。
- 对局内掉线会直接结束游戏，而不是进入离线等待或重连窗口。
- 即使客户端页面还保留旧 UI，也没有合法协议把状态重新同步回来。

### 可执行开发流程

1. 重构玩家身份模型。
   - 将 `playerId` 从 `socket.id` 解耦，改为服务端生成的稳定 ID。
   - 引入 `sessionId` 或 `reconnectToken`，用于同一玩家在不同 socket 间续连。
   - `Player` 内保留 `socketId` 作为“当前连接”，不是“身份本身”。

2. 扩展共享协议。
   - 在 `shared/src/types/events.ts` 增加 `resumeSession` / `rejoinRoom` / `restoreGameState` 等事件定义。
   - 定义服务端返回值：恢复成功、房间不存在、重连超时、已被替换登录等。

3. 改造房间与游戏状态管理。
   - `RoomManager` 需要维护 `playerId -> roomId`、`sessionId -> playerId`、`playerId -> currentSocketId`。
   - `disconnect` 时先标记离线，不立即删玩家。
   - 为房间内玩家增加 `connected` / `lastSeenAt` / `reconnectDeadline` 状态。
   - 游戏内若有人掉线，先进入“等待重连”窗口，而不是立即 `gameEnd`。

4. 改造 socket 生命周期。
   - `connection` 后允许客户端带着本地 `sessionId` 发起恢复。
   - 恢复成功后更新 `player.socketId`，重新 `socket.join(roomId)`。
   - 恢复后立即补发 `roomUpdate` 或 `gameStateUpdate`。
   - 超过重连窗口才真正执行 `leaveRoom` / 结束对局。

5. 补客户端恢复链路。
   - 在本地存储 `sessionId`、`roomId`、`playerId`。
   - `connect` 后优先尝试恢复，而不是当成全新玩家。
   - 增加“重连中 / 已恢复 / 恢复失败”状态提示。
   - 恢复失败时清理本地残留状态，回到大厅初始页。

6. 补自动化测试。
   - `server/src/socket/handlers.test.ts` 新增“断线后在宽限期内重连恢复”的集成测试。
   - 新增“超时未重连则判定离场”的集成测试。
   - 新增“游戏进行中重连后只收到自己视角手牌”的状态恢复测试。
   - 客户端增加 `GameContext` 断线恢复测试。

## 任务 2：出牌、抽牌均有服务器校验

### 判断

已完成。

### 证据

- 客户端只发动作请求，最终是否成功完全由服务端回调决定。
  - 出牌：`client/src/contexts/GameContext.tsx:154-159`
  - 抽牌：`client/src/contexts/GameContext.tsx:161-166`
- 服务端 `socket handler` 在进入规则层前先校验玩家是否在房间、游戏是否存在。
  - 出牌：`server/src/socket/handlers.ts:162-187`
  - 抽牌：`server/src/socket/handlers.ts:189-214`
- 服务端 `GameManager.drawCard` 对以下条件做了规则校验：
  - 游戏是否已结束
  - 是否已选方向
  - 是否有待处理挑战
  - 是否轮到当前玩家
  - 本回合是否已经抽过牌
  - 是否存在待罚抽逻辑
  - 抽到不可打牌时是否自动过回合
  - 位置：`server/src/game/GameManager.ts:95-149`
- 服务端 `GameManager.playCard` 对以下条件做了规则校验：
  - 游戏是否已结束
  - 是否已选方向
  - 是否有待处理挑战
  - 玩家是否存在、是否轮到该玩家
  - 牌是否在手中
  - Wild 是否选择颜色
  - 抽牌后是否只允许打刚抽到的那张
  - 罚抽堆叠时是否只能出 `+2` / `+4`
  - 非罚抽场景下该牌是否可出
  - 位置：`server/src/game/GameManager.ts:151-259`

### 审计说明

这个任务从“规则校验在服务端”这个标准看，当前已经落地，不依赖客户端做最终裁决。

### 仍建议补强的地方

- 现有测试对“负向校验”覆盖不够完整，更多是规则函数和通路存在性验证，不是完整的拒绝矩阵。
  - `server/src/game/GameManager.test.ts:6-25`
  - `server/src/socket/handlers.test.ts:37-107`
- 建议补以下测试，但这不影响“任务 2 已完成”的结论：
  - 非当前玩家出牌/抽牌应失败
  - 试图打不在手中的牌应失败
  - Wild 不选色应失败
  - 已抽牌后试图打另一张旧牌应失败
  - 有 `pendingPenalty` 时试图出普通牌应失败

## 任务 3：日志和异常处理是否完全

### 判断

未完成。

### 证据

- 服务端日志目前是散落的 `console.log`，没有日志级别、结构化字段、统一入口、落盘或外部采集能力。
  - `server/src/socket/handlers.ts:10`
  - `server/src/socket/handlers.ts:28`
  - `server/src/socket/handlers.ts:35`
  - `server/src/socket/handlers.ts:48`
  - `server/src/socket/handlers.ts:71`
  - `server/src/socket/handlers.ts:82`
  - `server/src/socket/handlers.ts:110`
  - `server/src/socket/handlers.ts:136`
  - `server/src/socket/handlers.ts:163`
  - `server/src/socket/handlers.ts:190`
  - `server/src/socket/handlers.ts:217`
  - `server/src/socket/handlers.ts:244`
  - `server/src/socket/handlers.ts:256`
  - `server/src/socket/handlers.ts:283`
  - `server/src/index.ts:8`
- 服务端没有发现统一 `try/catch` 包装器，也没有 `process.on('uncaughtException')` / `process.on('unhandledRejection')`。
- Express 侧只有 `/health`，没有错误处理中间件。
  - `server/src/server.ts:5-28`
- `broadcastGameState` 内部如果 `toClientGameState` 抛错，当前没有兜底。
  - `server/src/socket/handlers.ts:303-311`
  - `shared/src/types/game.ts:96-99`
- 客户端 socket 错误只打印到控制台，没有统一错误态、恢复动作或埋点上报。
  - `client/src/contexts/GameContext.tsx:91-93`
- 页面层虽然会展示部分回调失败信息，但这只是局部提示，不是统一异常体系。
  - `client/src/pages/Game.tsx` 中多处 `setError(...)`
  - `client/src/pages/Lobby.tsx` 中多处 `setError(...)`
- 现有测试没有覆盖异常注入、日志断言、未知错误恢复。
  - `server/src/socket/handlers.test.ts:37-107`
  - `client/src/contexts/GameContext.test.tsx`

### 现状判断

当前代码具备“基础业务错误回传”，但远远谈不上“日志和异常处理完全”。

换句话说：

- 业务规则失败能回调给前端，这一层是有的。
- 运行时异常、未知异常、监控可观测性、统一恢复策略，这几层还没有建立。

### 可执行开发流程

1. 建立统一日志模块。
   - 新增 `server/src/utils/logger.ts`，封装 `info` / `warn` / `error` / `debug`。
   - 统一输出字段：时间、事件名、roomId、playerId、socketId、errorCode。
   - 后续可平滑切到 `pino` 或其他结构化日志库。

2. 给 socket handler 增加安全包装。
   - 把每个事件处理器放进统一 `safeHandler(name, socket, callback)`。
   - 区分业务错误和系统错误：
     - 业务错误：回调 `{ success: false, error }`
     - 系统错误：记录日志，向客户端返回统一文案，避免直接炸掉连接流程

3. 给 Express 增加错误处理中间件和进程级兜底。
   - `app.use((err, req, res, next) => ...)`
   - `process.on('unhandledRejection', ...)`
   - `process.on('uncaughtException', ...)`
   - 明确哪些错误只记录，哪些错误触发优雅退出。

4. 统一错误码和错误映射。
   - 复用或扩展当前 `emitError(code, message)` 模型。
   - 约定服务端错误码枚举，例如 `ROOM_NOT_FOUND`、`INVALID_MOVE`、`STATE_DESYNC`、`INTERNAL_ERROR`。
   - 前端按错误码决定展示文案和恢复动作。

5. 补客户端异常处理。
   - `GameContext` 收到 `error` 事件后，不只 `console.error`，还要更新全局错误状态。
   - 为断连、恢复失败、服务端内部错误提供统一 toast / banner。
   - 关键页面增加异常边界，避免 React 渲染异常直接白屏。

6. 补测试与演练。
   - 为 `socket handler` 增加异常注入测试，例如 mock `gameManager.toClientGameState` 抛错。
   - 为客户端增加“收到服务端 error 事件时 UI 呈现”的测试。
   - 若后续接入日志库，再补日志字段断言。

## 测试核验

本次审计额外执行了现有测试：

- `npm.cmd test --workspace=shared -- --run`：通过
- `npm.cmd test --workspace=server -- --run`：通过
- `npm.cmd test --workspace=client -- --run`：通过

补充说明：

- 直接执行根命令 `npm.cmd test` 时，沙箱里会遇到 `spawn EPERM`，拆分到各 workspace 后可正常运行。
- 客户端测试有 React `act(...)` warning，但不影响本次三项任务完成度判断。

## 最终结论

- 任务 1 未完成，而且不是小修小补，必须先把“玩家身份”和“连接身份”解耦，才有资格做真正的断线重连。
- 任务 2 已完成，当前出牌和抽牌的最终校验都在服务端。
- 任务 3 未完成，目前只有基础业务错误回传，没有完整的日志、异常边界和恢复体系。
