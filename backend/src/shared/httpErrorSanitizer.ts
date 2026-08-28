export function sanitizeHttpErrorMessage(value:string):string{
  return value
    .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
    .replace(/(?:token|api[_-]?key|password|secret)\s*[:=]\s*\S+/gi,'$1=[REDACTED]')
    .replace(/\b\d{8,15}\b/g,'[REDACTED_ID]')
    .slice(0,180);
}
