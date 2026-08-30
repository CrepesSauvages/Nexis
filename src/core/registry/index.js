import { createCommandRegistry } from './commands.js';
import { createEventRegistry } from './events.js';
import { createJobRegistry } from './jobs.js';
import { createServiceRegistry } from './services.js';
import { createRouteRegistry } from './routes.js';
import { createComponentRegistry } from './components.js';

/**
 * @typedef {object} Registries
 * @property {ReturnType<typeof createCommandRegistry>} commands
 * @property {ReturnType<typeof createEventRegistry>} events
 * @property {ReturnType<typeof createJobRegistry>} jobs
 * @property {ReturnType<typeof createServiceRegistry>} services
 * @property {ReturnType<typeof createRouteRegistry>} routes
 * @property {ReturnType<typeof createComponentRegistry>} components
 */

/** @returns {Registries} */
export const createRegistries = () => ({
  commands: createCommandRegistry(),
  events: createEventRegistry(),
  jobs: createJobRegistry(),
  services: createServiceRegistry(),
  routes: createRouteRegistry(),
  components: createComponentRegistry(),
});
