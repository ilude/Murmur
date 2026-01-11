/**
 * Type-safe event emitter implementation
 */

export type EventHandler<T = unknown> = (data: T) => void;

export interface EventEmitter<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void;
  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void;
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void;
  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void;
  removeAllListeners(event?: keyof TEvents): void;
  listenerCount(event: keyof TEvents): number;
}

export class TypedEventEmitter<TEvents extends Record<string, unknown>>
  implements EventEmitter<TEvents>
{
  private listeners = new Map<
    keyof TEvents,
    Set<EventHandler<TEvents[keyof TEvents]>>
  >();

  /**
   * Register an event handler
   */
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<TEvents[keyof TEvents]>);
  }

  /**
   * Unregister an event handler
   */
  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<TEvents[keyof TEvents]>);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event to all registered handlers
   */
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      // Create a copy to avoid issues if handlers modify the set during iteration
      const handlersCopy = Array.from(handlers);
      for (const handler of handlersCopy) {
        handler(data);
      }
    }
  }

  /**
   * Register a one-time event handler
   */
  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const onceHandler: EventHandler<TEvents[K]> = (data) => {
      this.off(event, onceHandler);
      handler(data);
    };
    this.on(event, onceHandler);
  }

  /**
   * Remove all listeners for an event, or all events if none specified
   */
  removeAllListeners(event?: keyof TEvents): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: keyof TEvents): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
