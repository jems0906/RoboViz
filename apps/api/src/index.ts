import { initDb } from './db.js';
import { createServer } from './server.js';
import { config } from './config.js';

async function main() {
  await initDb();
  const { server } = createServer();
  server.listen(config.port, () => {
    console.log(`RoboViz API listening on http://localhost:${config.port}`);
  });
}

main().catch((error) => {
  console.error('Failed to start RoboViz API', error);
  process.exitCode = 1;
});
