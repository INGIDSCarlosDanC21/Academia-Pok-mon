# Copa 151 UABCS

Plataforma web estática para organizar torneos Pokémon universitarios.
Hecha con HTML + CSS + JavaScript vanilla y Supabase (Auth + Base de datos).
Se aloja directamente en GitHub Pages, sin build, sin Node, sin npm.

"151 Pokémon. 4 en combate. 1 campeón."

## Estructura del proyecto

```
/
├── index.html
├── style.css
├── app.js
├── parser.js
├── config.js
├── schema.sql
└── README.md
```

## 1. Crear el proyecto en Supabase

1. Ve a https://supabase.com y crea una cuenta (o inicia sesión).
2. Crea un **New Project**. Elige nombre, contraseña de base de datos y región.
3. Espera a que el proyecto termine de inicializarse (1-2 minutos).

## 2. Ejecutar el SQL

1. En el panel de Supabase, ve a **SQL Editor > New query**.
2. Copia todo el contenido del archivo `schema.sql` de este repositorio y pégalo ahí.
3. Ejecuta (Run). Esto crea las tablas, las relaciones, los índices, las funciones,
   los triggers, las políticas de Row Level Security y el primer torneo
   ("Copa 151 UABCS").

## 3. Configurar la Supabase URL y la anon key

1. En Supabase, ve a **Project Settings > API**.
2. Copia el valor de **Project URL** y el de **anon public key**.
3. Abre el archivo `config.js` y reemplaza:

```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY-AQUI";
```

con tus valores reales.

**Importante:** solo se usa la `anon key` pública en el frontend. Esa clave es
segura de exponer siempre que las políticas de Row Level Security (ya
incluidas en `schema.sql`) estén activas, porque son ellas las que realmente
impiden operaciones no autorizadas — nunca coloques la `service_role key` en
el JavaScript del sitio.

## 4. (Repetido, por claridad) Configurar la anon key

Ya lo hiciste en el paso 3. Este paso queda documentado porque Supabase a
veces regenera claves: si algún día rotas la anon key, solo tienes que
actualizar `config.js` y volver a subir el archivo.

## 5. Crear la primera cuenta admin

1. Abre tu sitio (localmente o ya publicado) y usa **Crear cuenta** para
   registrarte con tu correo.
2. Por defecto, toda cuenta nueva se crea con el rol `player`.
3. En Supabase, ve a **SQL Editor** y ejecuta (reemplazando el correo):

```sql
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
```

4. Cierra sesión y vuelve a iniciar sesión en el sitio para ver el
   **Panel de Administrador**.

## 6. Subir los archivos a GitHub

1. Crea un repositorio nuevo en GitHub (público o privado, según prefieras
   para GitHub Pages en tu plan).
2. Sube todos los archivos de este proyecto (`index.html`, `style.css`,
   `app.js`, `parser.js`, `config.js` ya con tus claves, `README.md`) a la
   raíz del repositorio (o a la carpeta `/docs`, según cómo configures
   Pages).

## 7. Activar GitHub Pages

1. En el repositorio, ve a **Settings > Pages**.
2. En **Source**, elige la rama (por ejemplo `main`) y la carpeta (`/root`
   o `/docs`, según donde hayas subido los archivos).
3. Guarda. GitHub te dará una URL del tipo:
   `https://tu-usuario.github.io/tu-repositorio/`

## 8. Abrir la URL

Espera uno o dos minutos y abre la URL que te dio GitHub Pages. Ya deberías
ver la pantalla de inicio de **Copa 151**.

## 9. Cómo crear un torneo

1. Inicia sesión con tu cuenta admin.
2. Entra al **Panel de Administrador**.
3. En la sección **Torneos**, llena el formulario (nombre, fecha, hora,
   lugar, formato) y pulsa **Crear torneo**.
4. El torneo se crea inactivo. Pulsa **Activar** en la lista de torneos
   para convertirlo en el torneo activo (solo puede haber uno activo a la
   vez; al activar uno, los demás se desactivan automáticamente).

## 10. Cómo asignar un usuario como Host

1. Con tu cuenta admin, entra al **Panel de Administrador**.
2. En la sección **Usuarios y roles**, busca al usuario por su nombre.
3. Pulsa **Editar**, cambia el rol a `host` y guarda.
4. Esa persona ahora verá el botón **Panel de Host** en su propio panel de
   jugador, y podrá revisar y aprobar/invalidar equipos.

## Notas técnicas

- El parser de equipos (`parser.js`) interpreta el texto exportado desde
  Pokémon Showdown y hace una validación práctica de las reglas del torneo
  (4 Pokémon, especies #001-#151, máximo 1 legendario, Mew prohibido, sin
  repetidos, sin Megaevolución/Movimientos Z/Dynamax/Teracristalización). No
  intenta validar toda la legalidad competitiva de Showdown — para eso está
  la revisión manual del Host.
- La seguridad real de quién puede aprobar equipos, cambiar roles, modificar
  puntos o crear combates **no depende del frontend**: está garantizada por
  las políticas de Row Level Security definidas en `schema.sql`. Aunque
  alguien manipule el JavaScript del navegador, Supabase rechazará cualquier
  operación no permitida para su rol.
- Limitación conocida de GitHub Pages + Supabase: al ser un sitio 100%
  estático, no existe backend propio que oculte lógica sensible; por eso
  toda la seguridad se resuelve con RLS en la base de datos en vez de con
  código de servidor. Es la forma más simple de resolverlo sin agregar un
  backend adicional.
- Si activas la confirmación de correo en Supabase Auth (Authentication >
  Providers > Email), los nuevos usuarios deberán confirmar su correo antes
  de poder iniciar sesión; el sitio ya muestra ese mensaje cuando aplica.
