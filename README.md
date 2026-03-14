# Habla Mas

Habla Mas es una aplicacion de chat web (tipo WhatsApp) con:
- ASP.NET Core 8 + SignalR (WebSockets)
- Redis backplane para escalado horizontal
- PostgreSQL + EF Core + Identity + Roles
- React + Vite + TypeScript + Tailwind
- Docker Compose (dev/prod)
- Caddy con HTTPS automatico para `caleiro.online`

## Caracteristicas implementadas

- Registro con email real y verificacion de correo
- Contrasena temporal inicial generada y enviada por email
- Cambio obligatorio de contrasena al primer login (`MustChangePassword`)
- Recuperacion de contrasena (`forgot-password` / `reset-password`)
- Admin puede forzar reset de contrasena temporal
- Contactos por `PublicCode` + alias local por contacto
- Chat 1 a 1 con SignalR:
  - texto
  - imagen
  - typing
  - presencia online/offline
  - estados de mensaje `Sent` / `Delivered` / `Seen`
- Chatbot IA dedicado:
  - preguntas y respuestas
  - soporte para codigo
  - soporte para analisis de imagenes
- Grupos:
  - crear grupos
  - agregar miembros
  - chat grupal (texto e imagen)
- Perfil:
  - foto
  - bio
  - apodo publico
  - tema/acento
- Panel Admin:
  - listado con busqueda/paginacion
  - detalle
  - bloquear/desbloquear
  - forzar reset
  - reenviar verificacion
  - cambiar rol
  - auditoria basica (`AdminAuditLog`)

## Estructura

```text
/
  backend/
    src/
      HablaMas.Api/
      HablaMas.Application/
      HablaMas.Domain/
      HablaMas.Infrastructure/
    HablaMas.sln
    Dockerfile
  frontend/
    Dockerfile
  reverse-proxy/
    Caddyfile
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  README.md
```

## Variables de entorno

Copia `.env.example` a `.env` y completa valores reales:

```bash
cp .env.example .env
```

Variables clave:
- `APP_BASE_URL`
- `JWT__Issuer`, `JWT__Audience`, `JWT__Key`
- `ConnectionStrings__Default`
- `Redis__ConnectionString`
- `SMTP__Host`, `SMTP__Port`, `SMTP__User`, `SMTP__Pass`, `SMTP__From`, `SMTP__FromName`
- `UPLOADS__Path`, `UPLOADS__MaxMb`
- `AI__Provider` (`groq`, `openai` o `anthropic`)
- `GROQ__ApiKey`, `GROQ__Model`, `GROQ__BaseUrl`, `GROQ__MaxImageMb`
- `OPENAI__ApiKey`, `OPENAI__Model`
- `ANTHROPIC__ApiKey`, `ANTHROPIC__Model`, `ANTHROPIC__BaseUrl`, `ANTHROPIC__Version`, `ANTHROPIC__MaxTokens`
- `ADMIN__SeedEmail`, `ADMIN__SeedPassword`

Configuracion recomendada para el chatbot con Groq:

```bash
AI__Provider=groq
GROQ__ApiKey=tu_api_key
GROQ__Model=meta-llama/llama-4-scout-17b-16e-instruct
GROQ__BaseUrl=https://api.groq.com/openai/v1
GROQ__MaxImageMb=4
```

`meta-llama/llama-4-scout-17b-16e-instruct` es una buena opcion inicial porque soporta texto e imagenes, que coincide con el flujo multimodal ya implementado en la app. El limite de imagen para Groq se dejo en 4 MB porque este proyecto envia imagenes en base64 al endpoint compatible con OpenAI.

## Levantar en desarrollo (local)

1. Configura `.env`.
2. Ejecuta:

```bash
docker compose up -d --build
```

3. URLs:
- Frontend: `http://localhost:5173`
- API: `http://localhost:8080`
- Swagger (dev): `http://localhost:8080/swagger`

Notas:
- Migraciones EF se aplican automaticamente al iniciar la API.
- Uploads se guardan en volumen Docker.

## Levantar en produccion (local/prod)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Servicios en prod:
- `caddy` expone `80/443`
- `api`, `web`, `db`, `redis` en red interna
- `db` y `redis` no se exponen externamente

## Despliegue en AWS EC2 (Ubuntu)

1. Crear instancia EC2.
2. Security Group:
- abrir `22` (SSH)
- abrir `80` (HTTP)
- abrir `443` (HTTPS)

3. Apuntar DNS:
- Registro `A` de `caleiro.online` -> IP publica EC2

4. Instalar Docker y Compose plugin:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

5. Subir codigo al servidor y crear `.env` con SMTP/JWT reales.

6. Ejecutar:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

7. Verificar:
- `https://caleiro.online`
- `docker compose -f docker-compose.prod.yml ps`
- `docker compose -f docker-compose.prod.yml logs -f caddy api`

Caddy emite certificados Let's Encrypt automaticamente cuando el DNS ya apunta a EC2.

## Endpoints principales

Auth:
- `POST /api/auth/register`
- `GET /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/change-temporary-password`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

Contactos:
- `GET /api/contacts`
- `POST /api/contacts/add-by-code`
- `PATCH /api/contacts/{contactId}/alias`

Chat:
- `GET /api/chats`
- `GET /api/chats/{conversationId}/messages?page=1&pageSize=30`
- `POST /api/chats/{conversationId}/mark-seen`
- Hub: `/hubs/chat`

Chatbot:
- `POST /api/chatbot/message`

Grupos:
- `GET /api/group-chats`
- `POST /api/group-chats`
- `GET /api/group-chats/{groupId}/members`
- `POST /api/group-chats/{groupId}/members`
- `GET /api/group-chats/{groupId}/messages?page=1&pageSize=50`
- `POST /api/group-chats/{groupId}/messages`

Uploads:
- `POST /api/uploads/message-image`
- `POST /api/profile/image`

Admin:
- `GET /api/admin/users?page=1&pageSize=20&search=`
- `GET /api/admin/users/{id}`
- `POST /api/admin/users/{id}/block`
- `POST /api/admin/users/{id}/unblock`
- `POST /api/admin/users/{id}/force-reset-password`
- `POST /api/admin/users/{id}/resend-verification`
- `POST /api/admin/users/{id}/set-role`

## Rutas frontend

- `/register`
- `/verify-email`
- `/login`
- `/change-password`
- `/forgot-password`
- `/reset-password`
- `/app`
- `/chatbot`
- `/admin`
- `/admin/users`
- `/admin/users/:id`

## Seguridad y validaciones

- Passwords nunca se muestran ni se almacenan en texto plano.
- Flujos de "recuperar"/"forzar" usan reset token o nueva temporal.
- JWT + refresh tokens persistidos.
- Rol Admin protegido por `[Authorize(Roles = "Admin")]`.
- Uploads restringidos a jpg/png/webp y max 5MB.
- Usuarios bloqueados no pueden autenticarse para operar.
- Usuarios sin email confirmado o con password temporal pendiente no pueden usar chat (hub/app).

## Desarrollo fuera de Docker

Backend:
```bash
dotnet build backend/HablaMas.sln
```

Frontend:
```bash
cd frontend
npm install
npm run build
```

## Seed de admin

En inicio, si `ADMIN__SeedEmail` y `ADMIN__SeedPassword` existen, se crea usuario Admin en entorno de arranque.

Recomendacion prod:
- usar password temporal fuerte y rotarla inmediatamente via panel admin o reset.
