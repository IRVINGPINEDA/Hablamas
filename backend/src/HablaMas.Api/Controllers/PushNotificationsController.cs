using HablaMas.Api.Contracts.Notifications;
using HablaMas.Api.Extensions;
using HablaMas.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/notifications/push")]
[Authorize]
public sealed class PushNotificationsController : ControllerBase
{
    private readonly IWebPushService _webPushService;

    public PushNotificationsController(IWebPushService webPushService)
    {
        _webPushService = webPushService;
    }

    [HttpGet("config")]
    public IActionResult GetConfig()
    {
        return Ok(new
        {
            configured = _webPushService.IsConfigured,
            vapidPublicKey = _webPushService.PublicKey
        });
    }

    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe([FromBody] PushSubscriptionRequest request, CancellationToken cancellationToken)
    {
        if (!_webPushService.IsConfigured)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Title = "Push notifications unavailable",
                Detail = "Las notificaciones push no estan configuradas en el servidor."
            });
        }

        if (string.IsNullOrWhiteSpace(request.Endpoint) ||
            string.IsNullOrWhiteSpace(request.Keys.P256Dh) ||
            string.IsNullOrWhiteSpace(request.Keys.Auth))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid subscription",
                Detail = "La suscripcion push recibida no es valida."
            });
        }

        var userId = User.GetRequiredUserId();
        await _webPushService.SaveSubscriptionAsync(
            userId,
            request.Endpoint,
            request.Keys.P256Dh,
            request.Keys.Auth,
            Request.Headers.UserAgent.ToString(),
            cancellationToken);

        return Ok(new
        {
            message = "Notificaciones push activadas correctamente."
        });
    }

    [HttpPost("unsubscribe")]
    public async Task<IActionResult> Unsubscribe([FromBody] PushUnsubscribeRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Endpoint))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid subscription",
                Detail = "Debes indicar el endpoint de la suscripcion a eliminar."
            });
        }

        var userId = User.GetRequiredUserId();
        await _webPushService.RemoveSubscriptionAsync(userId, request.Endpoint, cancellationToken);

        return Ok(new
        {
            message = "Notificaciones push desactivadas correctamente."
        });
    }
}
