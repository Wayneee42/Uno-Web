# 现状盘点与清单

## 当前功能覆盖矩阵（初步）
- 创建房间：已实现（server `RoomManager.createRoom` + client `Lobby`）
- 加入房间：已实现（server `RoomManager.joinRoom` + client `Lobby`）
- 房间内准备：已实现（server `RoomManager.setReady` + client `Lobby`）
- 开始游戏：已实现（server `GameManager.createGame` + client `Lobby`）
- 出牌：已实现（server `GameManager.playCard` + client `Game`）
- 抽牌：已实现（server `GameManager.drawCard` + client `Game`）
- 结束回合：已实现（server `GameManager.endTurn` + client `Game`）
- Wild 选色：已实现（client `Game` + server `playCard` chosenColor）
- +4 挑战：已实现（server `handleChallenge` + client `Game`）
- 断线处理：部分实现（server `disconnect` 更新房间；client 仅显示“连接中”）
- 重新开局/回大厅：缺失
- UNO 呼叫/惩罚：部分实现（server `callUno`，client 无入口，且 UNO 逻辑存在自动化冲突）

## 缺失项清单（优先级未排序）
- 断线重连后的房间/对局恢复策略（目前仅提示“重连中”）
- 事件/错误处理规范化（统一错误上屏与可恢复流程）

## 冗余/重复项清单（初步）
- `ServerToClientEvents` 中 `playerJoined`/`playerLeft` 事件客户端未使用

## 已处理项
- 已移除 `client/src/components/`、`client/src/hooks/`、`server/src/utils/` 空目录
- `GameManager.toClientGameState` 已改为调用 `shared` 中的实现，消除重复逻辑
- 增加 `VITE_SERVER_URL`/`CLIENT_ORIGIN` 环境配置以统一前后端联调端口
- 增加 `playerJoined`/`playerLeft` 提示与断线重连提示
- 增加 UNO 呼叫入口与未呼叫惩罚逻辑
- 增加 `returnToLobby`/`gameEnd` 事件与游戏结束后的回大厅路径
- 玩家中途离开会结束对局并回到大厅

## 风险与潜在问题
- UNO 规则实现与 UI 不一致（当前自动设置 `hasCalledUno`，但仍暴露 `callUno` 事件）
- 房间与游戏生命周期未完全闭环（游戏结束后 `GameManager` 状态未清理）
- CORS 与前端端口不一致，可能导致本地连接失败
- 房间最小人数为 3（`RoomManager`），但 UI 文案与引导未提示
