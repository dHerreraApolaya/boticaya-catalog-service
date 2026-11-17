import { readConfig } from '../dist/config.js';
import { createPool } from '../dist/database/pool.js';
import { verifyCatalogReader } from '../dist/database/readerCheck.js';

let pool;
try {
  const config = readConfig(process.env);
  pool = createPool(config);
  await verifyCatalogReader(pool, { requireTls: config.BOTICAYA_DB_SSL });
  process.stdout.write('Identidad de lectura del catálogo verificada sin consultar productos ni datos personales.\n');
} catch {
  process.stderr.write('No se pudo verificar la cuenta de lectura. Revisa permisos, configuración y TLS; no se muestran credenciales ni errores internos.\n');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
