/* Zynora · configuración pública de Supabase.
   La anon key es PÚBLICA por diseño: la seguridad real la dan las políticas RLS de schema.sql.
   NUNCA pongas aquí la service_role key. El workflow de GitHub Actions sobrescribe este archivo
   con las variables SUPABASE_URL y SUPABASE_ANON_KEY del repositorio. */
window.ZYNORA_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};
