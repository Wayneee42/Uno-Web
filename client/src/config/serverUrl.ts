const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function isPrivateIpv4Hostname(hostname: string): boolean {
  if (hostname.startsWith('10.')) {
    return true;
  }

  if (hostname.startsWith('192.168.')) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isAutoResolvableHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname) || isPrivateIpv4Hostname(hostname);
}

function normalizeConfiguredServerUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}

export function resolveServerUrl(
  configuredServerUrl?: string,
  currentLocation?: Pick<Location, 'protocol' | 'hostname'>
): string {
  const trimmedServerUrl = configuredServerUrl?.trim();

  if (trimmedServerUrl && trimmedServerUrl.toLowerCase() !== 'auto') {
    return normalizeConfiguredServerUrl(trimmedServerUrl);
  }

  if (currentLocation && isAutoResolvableHostname(currentLocation.hostname)) {
    return `${currentLocation.protocol}//${currentLocation.hostname}:3001`;
  }

  if (!currentLocation) {
    return 'http://localhost:3001';
  }

  throw new Error(
    'VITE_SERVER_URL must be set for public deployments. Use your Render service URL in Vercel.'
  );
}
