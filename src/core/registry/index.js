import { createCommandRegistry } from './commands.js';
import { createEventRegistry } from './events.js';
import { createJobRegistry } from './jobs.js';
import { createServiceRegistry } from './services.js';
import { createRouteRegistry } from './routes.js';

/**
 * @typedef {object} Registries
 * @property {ReturnType<typeof createCommandRegistry>} commands
 * @property {ReturnType<typeof createEventRegistry>} events
 * @property {ReturnType<typeof createJobRegistry>} jobs
 * @property {ReturnType<typeof createServiceRegistry>} services
 * @property {ReturnType<typeof createRouteRegistry>} routes
 */

/** @returns {Registries} */
export const createRegistries = () => ({
  commands: createCommandRegistry(),
  events: createEventRegistry(),
  jobs: createJobRegistry(),
  services: createServiceRegistry(),
  routes: createRouteRegistry(),
});
