import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { datasetSchema } from '../dist/catalog-import/dataset.js';
import { importCatalog } from '../dist/catalog-import/importCatalog.js';
import { readConfig } from '../dist/config.js';
import { createPool } from '../dist/database/pool.js';

let pool;
try {
  const { values } = parseArgs({ options: {
    file: { type: 'string' }, apply: { type: 'boolean', default: false },
    'expect-host': { type: 'string' }, 'expect-database': { type: 'string' },
    'expect-sha256': { type: 'string' },
  }});
  if (!values.file) throw new Error('Missing dataset');
  if ((await stat(values.file)).size > 10 * 1024 * 1024) throw new Error('Dataset too large');
  const content = await readFile(values.file);
  if (content.length > 10 * 1024 * 1024) throw new Error('Dataset too large');
  const dataset = datasetSchema.parse(JSON.parse(content.toString('utf8')));
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (!values.apply) {
    process.stdout.write(JSON.stringify({ mode: 'validation-only', products: dataset.products.length, sha256 }) + '\n');
  } else {
    const config = readConfig(process.env);
    if (process.env.NODE_ENV === 'production' || config.BOTICAYA_DB_HOST !== values['expect-host'] ||
        config.BOTICAYA_DB_NAME !== values['expect-database'] || sha256 !== values['expect-sha256'])
      throw new Error('Target or checksum mismatch');
    pool = createPool(config);
    const result = await importCatalog(pool, dataset);
    process.stdout.write(JSON.stringify({ mode: 'applied', sha256, ...result }) + '\n');
  }
} catch {
  process.stderr.write('Importación cancelada. Revisa el formato, permiso de reutilización, destino y checksum; no se muestran datos sensibles.\n');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
