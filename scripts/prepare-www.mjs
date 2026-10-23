// Prepara www/ antes de compilar: trae supabase-js desde node_modules (así funciona sin conexión)
// y genera www/config.js con las variables de GitHub si existen.
import { cpSync, mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";

for (const f of ["www/index.html", "www/css/styles.css", "www/sync.js"]) {
  if (!existsSync(f)) { console.error(`Falta ${f}. Revisa que subiste los archivos a www/.`); process.exit(1); }
}
mkdirSync("www", { recursive: true });
cpSync("node_modules/@supabase/supabase-js/dist/umd/supabase.js", "www/supabase.js");

let url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_ANON_KEY || "").trim();
if (url) {
  try { url = new URL(url).origin; }   // deja solo https://xxxx.supabase.co (quita /rest/v1, barras, etc.)
  catch { console.error("SUPABASE_URL no es una URL válida:", url); process.exit(1); }
}
if (url && key) {
  writeFileSync("www/config.js",
    `window.ZYNORA_CONFIG=${JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key })};\n`);
  console.log("www/config.js generado desde las variables de GitHub");
} else {
  if (!existsSync("www/config.js")) writeFileSync("www/config.js", 'window.ZYNORA_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:""};\n');
  const c = readFileSync("www/config.js", "utf8");
  if (/SUPABASE_URL:\s*""/.test(c)) console.warn("AVISO: Supabase no está configurado; la app funcionará sin cuentas.");
}
