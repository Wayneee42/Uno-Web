# Testing

## Commands
- Root: `npm run test`
- Client: `npm run test --workspace=client`
- Server: `npm run test --workspace=server`
- Shared: `npm run test --workspace=shared`

## Conventions
- Test files: `*.test.ts` / `*.test.tsx`
- Client tests run in `jsdom`
- Server/shared tests run in `node`

## Notes
- 测试文件已从 `tsc` 构建中排除
- Socket 集成测试会启动临时 HTTP 服务器
