import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { demoCatalogSchema, seedDemoCatalog } from '../dist/catalog-demo/demoCatalog.js';
import { readConfig } from '../dist/config.js';
import { createPool } from '../dist/database/pool.js';

let pool;
try {
  const { values } = parseArgs({ options: {
    apply: { type: 'boolean', default: false }, environment: { type: 'string' },
    'expect-host': { type: 'string' }, 'expect-database': { type: 'string' },
    'expect-user': { type: 'string' }, 'expect-sha256': { type: 'string' },
  }});
  const content = await readFile(new URL('../data/catalog/boticaya-demo-v1.json', import.meta.url));
  const dataset = demoCatalogSchema.parse(JSON.parse(content.toString('utf8')));
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (!values.apply) {
    process.stdout.write(JSON.stringify({ mode: 'validation-only', dataset: dataset.datasetId, products: dataset.products.length, sha256 }) + '\n');
  } else {
    const config = readConfig(process.env);
    if (values.environment !== 'development' || process.env.NODE_ENV === 'production' || config.BOTICAYA_ORDERS_ENABLED ||
        config.BOTICAYA_DB_HOST !== values['expect-host'] || config.BOTICAYA_DB_NAME !== values['expect-database'] ||
        config.BOTICAYA_DB_USER !== values['expect-user'] || sha256 !== values['expect-sha256'])
      throw new Error('Demo target mismatch');
    pool = createPool(config);
    const result = await seedDemoCatalog(pool, dataset);
    process.stdout.write(JSON.stringify({ mode: 'applied', dataset: dataset.datasetId, sha256, ...result }) + '\n');
  }
} catch {
  process.stderr.write('Carga demo cancelada. Revisa el destino de desarrollo, checksum, permisos y datos. No se muestran credenciales ni errores internos.\n');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
