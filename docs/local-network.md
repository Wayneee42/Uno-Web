# Local Network Play

## Goal
Play from multiple devices on the same LAN (Windows/macOS).

## Steps
1. Find the host machine LAN IP:
   - Windows: `ipconfig` -> IPv4 Address
   - macOS: `ifconfig` -> inet (non-127.0.0.1)

2. Set env vars (create `.env` at repo root):
```
VITE_SERVER_URL=http://<HOST_IP>:3001
CLIENT_ORIGIN=http://<HOST_IP>:3000
```

3. Start dev servers:
```
npm run dev
```

4. Open in other devices:
```
http://<HOST_IP>:3000
```

## Troubleshooting
- Ensure ports `3000` and `3001` are allowed through firewall.
- If CORS errors occur, verify `CLIENT_ORIGIN` matches the browser origin.
- If Vite is unreachable, ensure it listens on LAN (`vite.config.ts` sets `server.host: true`).
