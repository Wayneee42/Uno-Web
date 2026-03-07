# Vercel + Render 部署步骤

## 1. 目标

这份文档面向当前仓库，目标是把：

- 前端部署到 Vercel
- 后端部署到 Render Web Service

并且尽量写清楚每一步在面板里怎么填。

当前项目是 npm workspace monorepo，所以部署时不能只盯着 `client` 或 `server` 单目录，还要考虑 `shared` 的构建顺序。

## 2. 当前仓库对应的部署思路

当前仓库结构：

- `client`：前端 Vite 应用
- `server`：Node + Express + Socket.IO
- `shared`：前后端共享类型

因此部署思路应该是：

- Vercel 从仓库根目录构建
- 构建时先 build `shared`
- 再 build `client`
- Render 也从仓库根目录构建
- 构建时先 build `shared`
- 再 build `server`

不要把 Vercel 或 Render 直接只指向 `client` 或 `server` 目录，否则 workspace 依赖更容易出问题。

## 3. 部署前先准备好的信息

开始前，建议先准备：

- Git 仓库已推送到 GitHub
- 一个 Render 账号
- 一个 Vercel 账号
- 你想使用的项目名
- 是否要用自定义域名

建议先决定两个名字：

- Vercel 项目名，例如 `uno-web-client`
- Render 服务名，例如 `uno-web-server`

这样后面 URL 比较容易提前预估。

## 4. 先部署后端到 Render

建议先部署 Render，因为前端最终要填 `VITE_SERVER_URL`。

### 4.1 在 Render 创建服务

进入 Render 后：

1. 点击 `New +`
2. 选择 `Web Service`
3. 连接 GitHub 仓库
4. 选择当前仓库

### 4.2 Render 面板字段怎么填

下面是建议值。

`Name`
```text
uno-web-server
```

`Region`
```text
选离你和朋友较近的区域
```

`Branch`
```text
main
```

`Root Directory`
```text
留空
```
说明：当前仓库是 monorepo，Render 直接从仓库根目录构建更稳。

`Runtime`
```text
Node
```

`Build Command`
```bash
npm install && npm run build --workspace=shared && npm run build --workspace=server
```

`Start Command`
```bash
npm run start --workspace=server
```

`Instance Type`
```text
先用 Free 或最便宜的可用套餐
```
如果后面发现冷启动影响体验，再升一级。

`Auto-Deploy`
```text
Yes
```

### 4.3 Render 环境变量怎么填

在 `Environment Variables` 里至少加这些：

`CLIENT_ORIGIN`
```text
https://your-vercel-project.vercel.app
```

说明：
第一次创建 Render 服务时，如果你还没有最终的 Vercel 地址，可以先填一个你预期的 Vercel 生产域名，后面再回来改。

`LOG_LEVEL`
```text
info
```

`PORT`
```text
不用手动填
```
说明：Render 会自动注入 `PORT`，当前后端代码已经会读取它。

### 4.4 Render 首次部署后要确认什么

部署完成后，Render 会给你一个服务地址，例如：

```text
https://uno-web-server.onrender.com
```

你至少要确认：

1. 页面打开不会报 404 平台错误
2. 访问健康检查地址：
```text
https://uno-web-server.onrender.com/health
```
3. 能返回类似：
```json
{"status":"ok"}
```

如果 `/health` 不通，不要继续配 Vercel，先把 Render 跑通。

## 5. 再部署前端到 Vercel

Render 地址拿到以后，再配 Vercel。

### 5.1 在 Vercel 创建项目

进入 Vercel 后：

1. 点击 `Add New...`
2. 选择 `Project`
3. 导入当前 GitHub 仓库

### 5.2 Vercel 面板字段怎么填

下面是针对当前仓库的建议值。

`Framework Preset`
```text
Vite
```

`Root Directory`
```text
留空
```
说明：不要只选 `client` 目录，因为构建时还要先 build `shared`。

`Build Command`
```bash
npm run build --workspace=shared && npm run build --workspace=client
```

`Output Directory`
```text
client/dist
```

`Install Command`
```bash
npm install
```

`Development Command`
```text
可留空
```

### 5.3 Vercel 环境变量怎么填

至少加这个：

`VITE_SERVER_URL`
```text
https://your-render-service.onrender.com
```

注意：

- 不要带最后的 `/`
- 要填 Render 分配给你的真实公网地址
- 如果以后 Render 域名变了，要同步更新这里

### 5.4 Vercel 首次部署后要确认什么

部署成功后，Vercel 会给你一个地址，例如：

```text
https://uno-web-client.vercel.app
```

这时先做两件事：

1. 打开页面，确认前端能正常加载
2. 把这个 Vercel 生产地址复制出来，回到 Render 更新 `CLIENT_ORIGIN`

## 6. 回到 Render 修正 CLIENT_ORIGIN

这是实际部署里最容易漏掉的一步。

如果你在 Render 里一开始填的是预测值，或者后来换了域名，现在要把它改成真实前端地址。

Render 里最终建议填写：

`CLIENT_ORIGIN`
```text
https://your-vercel-project.vercel.app
```

如果你后面还绑定了自定义域名，可以填多个：

```text
https://your-vercel-project.vercel.app,https://uno.example.com
```

改完后重新部署 Render。

## 7. 推荐的实际部署顺序

为了少踩坑，推荐顺序是：

1. 先在 Render 创建后端服务
2. 确认 `/health` 可访问
3. 拿到 Render 服务 URL
4. 在 Vercel 创建前端项目
5. 在 Vercel 填 `VITE_SERVER_URL`
6. 拿到 Vercel 生产 URL
7. 回 Render 更新 `CLIENT_ORIGIN`
8. 重新部署 Render
9. 做真实联机测试

这个顺序比“先把两边一次性全配好”更稳，因为前后端地址本身就是相互依赖的。

## 8. 建议直接填写的配置汇总

### 8.1 Render 汇总

`Root Directory`
```text
留空
```

`Build Command`
```bash
npm install && npm run build --workspace=shared && npm run build --workspace=server
```

`Start Command`
```bash
npm run start --workspace=server
```

`Environment Variables`
```text
CLIENT_ORIGIN=https://your-vercel-project.vercel.app
LOG_LEVEL=info
```

### 8.2 Vercel 汇总

`Framework Preset`
```text
Vite
```

`Root Directory`
```text
留空
```

`Build Command`
```bash
npm run build --workspace=shared && npm run build --workspace=client
```

`Output Directory`
```text
client/dist
```

`Install Command`
```bash
npm install
```

`Environment Variables`
```text
VITE_SERVER_URL=https://your-render-service.onrender.com
```

## 9. 部署后怎么验证

至少按这个顺序验证：

### 9.1 后端健康检查

访问：

```text
https://your-render-service.onrender.com/health
```

应该返回：

```json
{"status":"ok"}
```

### 9.2 前端基础加载

打开：

```text
https://your-vercel-project.vercel.app
```

应该能看到大厅页面，不应该是白屏或构建失败页。

### 9.3 联机流程验证

建议至少找两台设备，或者两个人在不同网络环境下验证：

1. A 创建房间
2. A 复制邀请链接发给 B
3. B 打开链接进入房间
4. 双方准备并开始游戏
5. 进行几次出牌和摸牌
6. 其中一方刷新页面，验证 session 恢复
7. 其中一方断网再恢复，验证重连提示

如果这些都能通过，这套 `Vercel + Render` 的朋友联机方案就基本成立了。

## 10. 常见问题

### 10.1 页面能打开，但连不上后端

优先检查：

- Vercel 的 `VITE_SERVER_URL` 是否填对
- Render 服务是否真的在运行
- Render 的 `/health` 是否正常
- 前端填的地址是否少了协议头，例如必须是 `https://...`

### 10.2 浏览器报 CORS 错误

优先检查：

- Render 的 `CLIENT_ORIGIN` 是否和 Vercel 实际生产域名一致
- 是否少填了自定义域名
- `CLIENT_ORIGIN` 是否错误带了路径

正确示例：

```text
https://uno-web-client.vercel.app
```

错误示例：

```text
https://uno-web-client.vercel.app/
https://uno-web-client.vercel.app/lobby
```

### 10.3 Vercel Preview 能打开，但联机失败

这是正常高频问题。

原因是：

- Vercel Preview URL 每次可能不同
- 当前后端 CORS 只会允许你配置进去的 origin

如果只是和朋友联机，建议：

- 先只使用 Vercel 的 Production 域名
- 不要把 Preview 域名当成正式联机入口

### 10.4 Render 免费服务第一次连接慢

这通常是平台休眠或冷启动导致的。

如果你发现：

- 第一次进房间明显慢
- 朋友第一次打开页面时连接要等一会儿

这不一定是代码问题，可能只是套餐限制。

## 11. 最后建议

对于你这个项目，`Vercel + Render` 是目前最合理的第一步方案。

原因很直接：

- 成本低
- 配置比自建服务器简单
- 足够支撑朋友联机
- 当前代码已经做了这套方案需要的连接配置准备

如果后面你发现免费平台限制开始影响体验，再考虑迁移到自购云服务器就行，不需要一开始就把运维复杂度拉高。
