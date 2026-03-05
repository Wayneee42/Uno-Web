• 已开始并完成 task.md 中的各阶段执行（含测试体系、缺失功能补齐、冗余清理与架构优化）。以下是变更概览与下一步建议。



&nbsp; 完成内容



&nbsp; 1. 冗余清理与架构优化



&nbsp; - 删除空目录：client/src/components/、client/src/hooks/、server/src/utils/

&nbsp; - 消除重复逻辑：GameManager.toClientGameState 改为调用 shared 的实现

&nbsp; - 增加 server/src/server.ts，统一服务创建入口，便于测试与复用



&nbsp; 2. 测试体系（Vitest）与规范化



&nbsp; - 全仓统一 Vitest，补充 workspace 测试脚本与配置

&nbsp; - 测试文件从 tsc 构建中排除

&nbsp; - 新增 docs/testing.md 说明测试规范与命令



&nbsp; 3. 缺失功能补齐



&nbsp; - 新增 returnToLobby / gameEnd 事件，支持对局结束回大厅

&nbsp; - 增加 UNO 呼叫入口与未呼叫惩罚逻辑

&nbsp; - 玩家加入/离开提示、断线重连提示

&nbsp; - 前后端联调端口/环境配置：VITE\_SERVER\_URL 与 CLIENT\_ORIGIN

&nbsp; - 玩家中途离开将结束对局并回大厅



&nbsp; 关键文件与变更



&nbsp; - 任务与审计文档

&nbsp;     - task.md

&nbsp;     - docs/audit.md

&nbsp;     - docs/testing.md

&nbsp; - 依赖与脚本

&nbsp;     - package.json

&nbsp;     - client/package.json

&nbsp;     - server/package.json

&nbsp;     - shared/package.json

&nbsp; - 测试与配置

&nbsp;     - client/vitest.config.ts

&nbsp;     - server/vitest.config.ts

&nbsp;     - shared/vitest.config.ts

&nbsp;     - client/src/setupTests.ts

&nbsp;     - client/tsconfig.json

&nbsp;     - server/tsconfig.json

&nbsp;     - shared/tsconfig.json

&nbsp; - 共享类型与事件

&nbsp;     - shared/src/types/events.ts

&nbsp;     - shared/src/types/card.test.ts

&nbsp;     - shared/src/types/game.test.ts

&nbsp;     - shared/src/types/player.test.ts

&nbsp; - 服务端核心

&nbsp;     - server/src/server.ts

&nbsp;     - server/src/index.ts

&nbsp;     - server/src/socket/handlers.ts

&nbsp;     - server/src/socket/handlers.test.ts

&nbsp;     - server/src/game/GameManager.ts

&nbsp;     - server/src/game/RoomManager.ts

&nbsp;     - server/src/game/DeckManager.test.ts

&nbsp;     - server/src/game/GameManager.test.ts

&nbsp;     - server/src/game/RoomManager.test.ts

&nbsp; - 客户端核心

&nbsp;     - client/src/contexts/GameContext.tsx

&nbsp;     - client/src/contexts/GameContext.test.tsx

&nbsp;     - client/src/pages/Game.tsx

&nbsp;     - client/src/pages/Game.test.tsx

&nbsp;     - client/src/pages/Lobby.tsx

&nbsp;     - client/src/pages/Lobby.test.tsx

&nbsp;     - client/src/vite-env.d.ts



&nbsp; 新增环境变量



&nbsp; - VITE\_SERVER\_URL（前端连接后端地址，默认 http://localhost:3001）

&nbsp; - CLIENT\_ORIGIN（后端 CORS 允许来源，默认 http://localhost:5173）



&nbsp; 测试命令



&nbsp; - npm run test

&nbsp; - npm run test --workspace=client

&nbsp; - npm run test --workspace=server

&nbsp; - npm run test --workspace=shared

