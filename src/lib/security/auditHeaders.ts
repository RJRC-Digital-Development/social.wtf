export const AUDIT_IP_HEADER = 'x-client-ip-for-audit';
export const AUDIT_UA_HEADER = 'x-client-ua-for-audit';

export function createAuditRequestHeaders(incomingHeaders: Headers): Headers {
  const requestHeaders = new Headers(incomingHeaders);

  requestHeaders.delete(AUDIT_IP_HEADER);
  requestHeaders.delete(AUDIT_UA_HEADER);

  const clientIp = incomingHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || incomingHeaders.get('x-real-ip')
    || 'unknown';
  const userAgent = incomingHeaders.get('user-agent') || 'unknown';

  requestHeaders.set(AUDIT_IP_HEADER, clientIp);
  requestHeaders.set(AUDIT_UA_HEADER, userAgent);

  return requestHeaders;
}
