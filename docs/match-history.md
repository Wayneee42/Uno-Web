# 对局历史与匿名档案设计

## 1. 目标

对局实时状态继续保存在单个 Render Web Service 的内存中，PostgreSQL 只负责长期保存匿名玩家档案和对局历史。数据库故障不能阻止创建房间、加入房间或继续出牌。

这个版本记录结算和公开事件，不支持按每一步恢复完整牌局，也不保存其他玩家当时的隐藏手牌。

## 2. 对局状态

- `active`：内部状态，表示对局已经开始但尚未结束，不显示在历史列表。
- `completed`：产生唯一胜者。胜者计一场胜利，其余玩家各计一场失败。
- `draw`：单独统计平局，不计入胜利或失败。
- `interrupted`：展示在逐局历史中，但不统计中断次数，也不进入胜率分母。

中断原因包括：

- `player_exit`：玩家主动离开。
- `host_abort`：房主主动结束未完成的牌局。
- `disconnect_timeout`：断线玩家超过重连等待时间。
- `server_shutdown`：Render 正常重启或部署。
- `server_crash`：服务实例停止心跳后由新实例补记。
- `server_error`：服务端内部错误导致牌局无法安全继续。

只有 `player_exit` 和 `host_abort` 会计入主动退出。主动退出率的分母是已经结束的所有已开始牌局，包含完成、平局和中断。

## 3. 结算顺序

`completed` 对局中，胜者固定排第一。其他玩家按最终手牌分数从低到高排列：

- 数字牌按牌面数字计分。
- `Skip`、`Reverse`、`Draw2` 每张 20 分。
- `Wild`、`WildDraw4` 每张 50 分。

`draw` 和 `interrupted` 不生成胜负顺序，只按原座位展示玩家及最终快照。

## 4. 匿名玩家档案

首次访问时，后端创建随机 UUID 档案和一个高熵 `uno_` 恢复码。浏览器只在 `localStorage` 中保存恢复码，PostgreSQL 只保存恢复码的 SHA-256 哈希。

- 同一浏览器会自动恢复档案。
- 新浏览器或新设备通过恢复码导入同一档案。
- 昵称只是最近使用值；每局仍可修改，对局记录保存开局时的玩家名称快照。
- 恢复码轮换后，旧码立即失效，其他在线浏览器也立即失去档案查询权限。
- 当前牌局 session 与档案凭据分离。凭据被撤销不会强制中断正在进行的牌局。
- 同一档案可在多个设备查看历史，但同一时间只能占用一个房间座位。
- 同一牌局 session 在新 socket 恢复时会接管旧 socket。

恢复码等同于匿名档案密码，不应截图公开或写入日志。

## 5. 可见性与隐私

历史列表和详情只允许该局参与者查看。前端没有全局公开战绩列表，数据库连接信息也不会发送到浏览器。

每局保存：

- 房间号、开始和结束时间、状态、结束原因。
- 玩家档案 ID、局内玩家 ID、昵称快照、座位。
- 胜负结果、最终手牌张数、最终手牌分数、是否主动退出。
- 已公开的事件时间线，例如开始、出牌、摸牌、UNO、挑战和中断。

不会保存：

- 完整牌堆顺序。
- 每个时刻的隐藏手牌。
- 可执行完整回放所需的私密状态。

## 6. 持久化与降级

后端使用 `DATABASE_URL` 连接 PostgreSQL，数据库表由 `server/migrations` 管理。服务启动时会自动执行未应用迁移，并使用 PostgreSQL advisory lock 避免 Render 重叠部署时重复迁移。

归档写入采用内存快照加后台重试：

1. 每次公开状态变化先更新内存归档。
2. PostgreSQL 可用时异步写入。
3. 历史读取会等待当前写队列，避免刚结束的对局暂时不可见。
4. PostgreSQL 不可用时，牌局继续运行，历史页面显示降级提示并读取本实例内存中的近期记录。
5. 进程和数据库同时丢失时，尚未落库的记录可能无法恢复，这是当前单实例、玩法优先方案的明确边界。

服务收到 `SIGTERM` 或 `SIGINT` 后，会把仍在进行的牌局记为 `server_shutdown`，最多等待 5 秒刷新归档，再关闭数据库连接。实例异常消失时，新实例通过心跳把遗留的 `active` 记录改为 `server_crash`。

## 7. 运维命令

生产构建后手动迁移：

```bash
npm run build
npm run db:migrate
```

本地开发迁移：

```bash
npm run db:migrate:dev --workspace=server
```

必要环境变量：

```text
DATABASE_URL=postgresql://...
DB_POOL_MAX=5
```

未配置 `DATABASE_URL` 时，后端会以纯内存历史模式启动，适合本地玩法测试，不适合保存长期战绩。

## 8. Render 免费数据库边界

Render Free PostgreSQL 自创建起 30 天到期，没有备份。到期后只有 14 天升级宽限期，不能把免费库当作长期生产存储。创建数据库当天应记录创建日期和到期日期，并在第 20 天前决定升级或导出。

Web Service 与 PostgreSQL 应选择同一区域，并使用 Render 提供的 Internal Database URL。官方说明：

- [Free 实例限制](https://render.com/docs/free)
- [创建和连接 PostgreSQL](https://render.com/docs/postgresql-creating-connecting)
- [部署生命周期](https://render.com/docs/deploys)
- [WebSocket 服务](https://render.com/docs/websocket)
