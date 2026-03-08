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
