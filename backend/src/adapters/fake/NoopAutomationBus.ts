import type { AutomationBus } from '../../ports/AutomationBus.ts';
export class NoopAutomationBus implements AutomationBus { async publish() { return { delivered: false }; } }
