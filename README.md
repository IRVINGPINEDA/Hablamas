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

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores reales.

```bash
cp .env.example .env
```

Claves principales:

- `APP_BASE_URL`
- `JWT__Issuer`, `JWT__Audience`, `JWT__Key`
- `ConnectionStrings__Default`
- `Redis__ConnectionString`
- `SMTP__Host`, `SMTP__Port`, `SMTP__User`, `SMTP__Pass`, `SMTP__From`, `SMTP__FromName`
- `UPLOADS__Path`, `UPLOADS__MaxMb`, `UPLOADS__MaxAttachmentMb`
- `AI__Provider`
- `GROQ__ApiKey`, `GROQ__Model`, `GROQ__BaseUrl`, `GROQ__MaxImageMb`
- `OPENAI__ApiKey`, `OPENAI__Model`, `OPENAI__BaseUrl`
- `ANTHROPIC__ApiKey`, `ANTHROPIC__Model`, `ANTHROPIC__BaseUrl`, `ANTHROPIC__Version`, `ANTHROPIC__MaxTokens`
- `ADMIN__SeedEmail`, `ADMIN__SeedPassword`

### Ejemplos de chatbot

Groq:

```env
AI__Provider=groq
GROQ__ApiKey=tu_api_key
GROQ__Model=meta-llama/llama-4-scout-17b-16e-instruct
GROQ__BaseUrl=https://api.groq.com/openai/v1
GROQ__MaxImageMb=4
```

OpenRouter:

```env
AI__Provider=openrouter
OPENAI__ApiKey=sk-or-v1-...
OPENAI__BaseUrl=https://openrouter.ai/api/v1
OPENAI__Model=openrouter/free
```

OpenAI:

```env
AI__Provider=openai
OPENAI__ApiKey=sk-...
OPENAI__Model=gpt-4o-mini
OPENAI__BaseUrl=https://api.openai.com/v1
```

Anthropic:

```env
AI__Provider=anthropic
ANTHROPIC__ApiKey=sk-ant-...
ANTHROPIC__Model=claude-3-5-sonnet-latest
ANTHROPIC__BaseUrl=https://api.anthropic.com/v1
ANTHROPIC__Version=2023-06-01
ANTHROPIC__MaxTokens=1024
```

## Desarrollo local

```bash
docker compose up -d --build
```

URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8080`
- Swagger: `http://localhost:8080/swagger`

## Produccion

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Servicios:

- `caddy` expone `80/443`
- `api`, `web`, `db` y `redis` quedan en red interna

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

## Seed admin

Si `ADMIN__SeedEmail` y `ADMIN__SeedPassword` existen al iniciar la API, se crea el usuario administrador.
