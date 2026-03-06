# Local Network Task

## 需求澄清
- 当前状态：
  - 前端 Vite 本地开发地址（当前为 `http://localhost:3000`）
  - 后端 Socket.IO 服务端口 `3001`
  - 默认 CORS 允许 `http://localhost:3000`
  - 仅本机多窗口可玩
- 目标：
  - 同一局域网内，多台电脑（Windows / macOS）通过局域网 IP 访问并联机
  - 且允许手机或平板访问（基于同一局域网）

## 关键约束
- Vite 开发服务器默认仅监听 `localhost`，需暴露到局域网
- Socket.IO 服务器需监听 `0.0.0.0`
- CORS 需允许局域网 IP 访问
- 客户端 `VITE_SERVER_URL` 需使用局域网 IP
- Windows/macOS 需允许防火墙放行端口（3000/3001）

## 任务拆解

### 1. 服务器监听与暴露
1.1 修改服务端监听地址：
- `server/src/index.ts` 中 `httpServer.listen(PORT)` -> `httpServer.listen(PORT, '0.0.0.0')`
- 确保服务端对局域网开放

1.2 修改 Vite 监听地址：
- `client/vite.config.ts` 增加 `server: { host: true, port: 3000 }`

### 2. 环境变量与连接配置
2.1 客户端连接地址
- 在根目录或 `client/.env` 中新增：
  `VITE_SERVER_URL=http://<局域网IP>:3001`
- 局域网 IP 由主机获取（Windows: `ipconfig`, macOS: `ifconfig`) 

2.2 服务端 CORS
- `server/src/server.ts` 中 `clientOrigin` 默认值改为局域网 IP（或通配 `*`）
- 推荐：允许多个来源，例如 `CLIENT_ORIGIN=http://<IP>:3000`

### 3. 防火墙与网络配置
3.1 Windows 防火墙：
- 放行 `3000` 和 `3001` 端口 TCP/UDP

3.2 macOS 防火墙：
- 允许 `node` 进程接入

### 4. 多机联机验证
4.1 启动服务
- 主机执行 `npm run dev`

4.2 客户端访问
- 局域网内其它设备浏览器访问 `http://<主机IP>:3000`

4.3 验证功能
- 创建房间 -> 加入房间 -> 准备 -> 开始游戏 -> 正常同步

### 5. 可选优化
- 支持自动发现主机 IP（启动时打印局域网地址）
- 增加运行提示文档

## 交付物
- `vite.config.ts` / `server` 监听方式调整
- `.env` 模板说明
- `docs/local-network.md` 使用说明
