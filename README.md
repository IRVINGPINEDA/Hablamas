# Habla Mas

Habla Mas es una aplicacion de chat web tipo WhatsApp construida con ASP.NET Core 8, SignalR, PostgreSQL, Redis, React, Vite y Tailwind.

## Caracteristicas

- Registro, verificacion de correo y cambio obligatorio de contrasena temporal.
- Chat privado con SignalR, presencia, typing y estados `Sent` / `Delivered` / `Seen`.
- Envio de texto, imagenes, video, archivos y notas de voz.
- Grupos con miembros multiples y soporte para adjuntos.
- Perfil con foto, bio, alias publico y tema/acento.
- Panel admin para gestion de usuarios.
- Chatbot IA configurable por proveedor: `groq`, `openai`, `openrouter` o `anthropic`.

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
- `POST /api/uploads/message-attachment`
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
