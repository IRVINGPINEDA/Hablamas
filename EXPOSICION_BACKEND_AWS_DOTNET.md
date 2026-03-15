# Exposicion Tecnica del Backend de Habla Mas

## 1. Introduccion

El backend de `Habla Mas` fue construido con `.NET 8`, `ASP.NET Core`, `SignalR`, `Redis`, `PostgreSQL` y despliegue en `AWS EC2` mediante `Docker`.

La idea principal de esta arquitectura es resolver tres necesidades del proyecto:

- mensajeria en tiempo real con baja latencia
- seguridad en autenticacion y gestion de usuarios
- capacidad de crecer sin rehacer la aplicacion

Aunque muchas personas siguen diciendo ".NET Core", actualmente la plataforma moderna se llama simplemente `.NET`. En este proyecto usamos `.NET 8`, que es la evolucion directa de `.NET Core`.

## 2. Que resuelve el backend

El backend de `Habla Mas` no solo guarda datos. Tambien coordina procesos criticos de la aplicacion:

- registro de usuarios con verificacion de correo real
- generacion de contrasena temporal y obligacion de cambio en primer acceso
- autenticacion con JWT para proteger la SPA
- gestion de contactos por codigo publico
- conversaciones privadas uno a uno
- envio de mensajes de texto e imagen
- estados de mensaje: enviado, entregado y visto
- presencia en linea y typing en tiempo real
- panel de administrador para seguridad y control operativo

Por lo tanto, el backend es el componente que garantiza reglas de negocio, seguridad, persistencia y tiempo real.

## 3. Por que se utiliza .NET para el backend

`.NET 8` es una muy buena eleccion para este proyecto por razones tecnicas y operativas.

### Alto rendimiento

`ASP.NET Core` es uno de los frameworks web con mejor rendimiento para APIs y conexiones concurrentes. Esto es importante en un chat, porque cada segundo se procesan mensajes, estados, eventos de presencia y conexiones WebSocket.

### Excelente soporte para tiempo real

`SignalR` forma parte natural del ecosistema .NET y simplifica mucho la implementacion de chat en tiempo real. Permite:

- enviar mensajes al instante
- notificar cuando un usuario esta escribiendo
- actualizar estados de entrega y visto
- manejar presencia online/offline

En vez de construir manualmente una infraestructura WebSocket compleja, `SignalR` ofrece una capa robusta, mantenible y lista para produccion.

### Seguridad integrada

`.NET` incluye herramientas maduras para autenticacion y autorizacion:

- `ASP.NET Core Identity`
- roles (`User`, `Admin`)
- hash seguro de contrasenas
- tokens de verificacion
- reseteo de contrasena
- JWT para frontend SPA

Esto reduce errores de seguridad y acelera el desarrollo sin sacrificar calidad.

### Mantenibilidad y arquitectura limpia

El proyecto se separa en capas:

- `HablaMas.Api`
- `HablaMas.Application`
- `HablaMas.Domain`
- `HablaMas.Infrastructure`

Esta organizacion facilita:

- escalar el codigo
- probar componentes
- cambiar implementaciones sin romper todo
- mantener reglas de negocio claras

### Integracion con base de datos

Con `EF Core` y `PostgreSQL` se obtiene:

- migraciones controladas
- modelado tipado
- consultas mantenibles
- integracion fuerte con C#

Eso ayuda a evolucionar la aplicacion sin depender de SQL manual para cada cambio.

### Ecosistema enterprise

`.NET` es una tecnologia madura, estable y ampliamente utilizada en entornos empresariales. Eso aporta:

- soporte a largo plazo
- buen tooling
- monitoreo y logging solidos
- facilidad para incorporar nuevas funciones en el futuro

## 4. Por que se utiliza Redis junto con SignalR

En un chat moderno no basta con que funcione en una sola instancia. Si el sistema crece, se necesita escalar horizontalmente.

Por eso se utiliza `Redis` como backplane de `SignalR`.

Su funcion es sincronizar eventos entre multiples instancias del backend. Esto significa que:

- si hay varias instancias de la API corriendo
- y un usuario esta conectado en una instancia distinta
- los mensajes y eventos siguen llegando en tiempo real

Ventajas concretas:

- permite escalar sin romper el chat
- mantiene consistencia de eventos en tiempo real
- mejora disponibilidad
- prepara la app para crecimiento real

## 5. Por que se utiliza AWS

`AWS` se utiliza porque ofrece infraestructura flexible, confiable y preparada para produccion.

Para `Habla Mas`, AWS aporta varias ventajas importantes.

### Despliegue en EC2

`EC2` permite ejecutar la aplicacion en un servidor virtual controlado por nosotros, ideal para una primera version productiva con Docker.

Ventajas:

- control total del entorno
- despliegue simple con `docker compose`
- costo razonable para una primera etapa
- facilidad para conectar dominio, puertos, proxy y certificados

### Escalabilidad

Aunque inicialmente se despliegue en una sola instancia EC2, AWS permite evolucionar despues a:

- multiples instancias
- balanceadores
- bases de datos administradas
- almacenamiento de objetos
- monitoreo avanzado

Eso hace que la arquitectura no quede limitada desde el principio.

### Alta disponibilidad y confiabilidad

AWS es una plataforma global con infraestructura estable y probada. Esto es importante para una aplicacion de chat donde la disponibilidad afecta directamente la experiencia del usuario.

### Seguridad y buenas practicas

AWS facilita aplicar controles como:

- grupos de seguridad
- reglas de red
- certificados HTTPS
- separacion entre servicios expuestos y servicios internos

En este proyecto, `Caddy` se usa para exponer `80/443` y gestionar HTTPS para `caleiro.online`, mientras la API y los servicios internos quedan detras del proxy.

## 6. Por que combinar .NET + Docker + AWS

La combinacion elegida tiene ventajas claras:

- `.NET` aporta rendimiento, seguridad y una base robusta para negocio y tiempo real
- `Docker` garantiza entornos consistentes entre desarrollo y produccion
- `AWS EC2` permite publicar rapido y crecer despues sin rehacer la arquitectura

En conjunto, esta stack permite que `Habla Mas` sea:

- rapido
- mantenible
- desplegable
- escalable
- seguro

## 7. Ventajas concretas para Habla Mas

En el contexto exacto del proyecto, esta arquitectura ofrece:

- chat en tiempo real con baja latencia gracias a `SignalR`
- escalado horizontal gracias a `Redis`
- persistencia confiable en `PostgreSQL`
- gestion segura de usuarios con `Identity` y `JWT`
- despliegue portable con `Docker`
- publicacion productiva en `AWS EC2`
- acceso seguro por dominio con `HTTPS` en `caleiro.online`
- capacidad de incorporar nuevas funciones sin rehacer el sistema

## 8. Conclusion

Se eligio `.NET 8` porque ofrece alto rendimiento, seguridad integrada, excelente soporte para tiempo real y una arquitectura limpia para mantener el proyecto a largo plazo.

Se eligio `AWS` porque permite desplegar la solucion de forma profesional, segura y escalable, empezando con `EC2` y dejando abierta la posibilidad de crecer a una infraestructura mas avanzada.

En resumen, la arquitectura del backend de `Habla Mas` no solo fue pensada para que funcione hoy, sino para que pueda crecer manana con una base tecnica solida.

## 9. Cierre breve para exposicion oral

Si necesitas una version corta para presentar, puedes decir:

> El backend de Habla Mas se desarrollo con .NET 8 porque nos ofrece alto rendimiento, seguridad integrada y soporte nativo para tiempo real con SignalR. Redis nos ayuda a escalar el chat entre varias instancias, PostgreSQL garantiza la persistencia de los datos y AWS EC2 nos permite desplegar la aplicacion de forma profesional con Docker y HTTPS en el dominio caleiro.online. Esta combinacion nos da una solucion rapida, segura, mantenible y preparada para crecer.
