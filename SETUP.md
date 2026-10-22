# Zynora con cuentas y sincronización: puesta en marcha

## 1. Supabase
1. Crea un proyecto en supabase.com.
2. **SQL Editor** → pega y ejecuta `supabase/schema.sql` (crea tablas, RLS y borrado de cuenta).
3. **Project Settings → API**: copia *Project URL* y la clave *anon / publishable* (NO la service_role).
4. **Authentication → Providers → Email**: déjalo activo (recomendado: "Confirm email" activado).
5. **Authentication → URL Configuration → Redirect URLs**: añade `com.zineclick.app://auth-callback`.

## 2. Google
1. Google Cloud Console → APIs y servicios → Credenciales → **ID de cliente OAuth** tipo **Aplicación web**.
2. En "URI de redirección autorizados" pega la URL que Supabase muestra en
   Authentication → Providers → Google (`https://<tu-proyecto>.supabase.co/auth/v1/callback`).
3. Copia el Client ID y el Client Secret en Supabase (Providers → Google) y activa el proveedor.
   (La app abre el navegador y vuelve por el enlace `com.zineclick.app://auth-callback`; no necesita SHA-1.)

## 3. GitHub
1. Settings → Secrets and variables → Actions → pestaña **Variables** → crea:
   `SUPABASE_URL` y `SUPABASE_ANON_KEY` (son públicas por diseño; la seguridad la da RLS).
2. Mantén el secreto `ZINE_KEYSTORE_B64` que ya usas.
3. Estructura del repo: ver el mapa de carpetas (index.html, styles.css, sync.js y config.js van dentro de `www/`).
4. Sube los cambios a `main`: se genera el APK en Actions → Zynora-APK.

## 4. Pruebas
Registro y login con correo · Google · crear cuenta nueva en un dispositivo con datos viejos (debe ofrecer importar) ·
segundo dispositivo (ver listas) · modo avión: marca favoritos, reconecta y comprueba que suben ·
cerrar sesión e iniciar otra cuenta (no debe ver datos de la primera) · eliminar cuenta.
