using System.Net;
using HablaMas.Application.Interfaces;

namespace HablaMas.Infrastructure.Services;

public sealed class EmailTemplateService : IEmailTemplateService
{
    public string BuildVerificationEmail(string recipientName, string verifyUrl, string? temporaryPassword = null, bool pendingVerification = false)
    {
        var safeName = Encode(recipientName);
        var safeUrl = Encode(verifyUrl);
        var passwordSection = string.IsNullOrWhiteSpace(temporaryPassword)
            ? string.Empty
            : $"""
              <div style="margin:24px 0;padding:18px 20px;border-radius:18px;background:#f7efe1;border:1px solid #ead8b4;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7c5d18;font-weight:700;">Contrasena temporal</p>
                <p style="margin:0;font-size:24px;font-weight:800;color:#1f2937;">{Encode(temporaryPassword)}</p>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">Usala solo para tu primer acceso. Despues deberas cambiarla dentro de la plataforma.</p>
              </div>
              """;

        var intro = pendingVerification
            ? "Tu cuenta ya existe, pero todavia esta pendiente de verificacion."
            : "Tu cuenta ya fue creada y solo falta confirmar tu correo para empezar.";

        return BuildLayout(
            preheader: "Verifica tu correo y termina la activacion de tu cuenta.",
            eyebrow: "Verificacion de cuenta",
            title: "Activa tu acceso a Habla Mas",
            introHtml: $"""
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Hola {safeName},</p>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">{intro}</p>
                {passwordSection}
                <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">Cuando verifiques tu correo ya podras iniciar sesion con normalidad.</p>
                """,
            actionLabel: "Verificar correo",
            actionUrl: verifyUrl,
            footerNote: $"Si el boton no abre, copia y pega esta direccion en tu navegador:<br /><span style=\"word-break:break-all;color:#1d4ed8;\">{safeUrl}</span>");
    }

    public string BuildPasswordResetEmail(string recipientName, string resetUrl)
    {
        var safeName = Encode(recipientName);
        var safeUrl = Encode(resetUrl);

        return BuildLayout(
            preheader: "Restablece tu contrasena desde un enlace seguro.",
            eyebrow: "Recuperacion de acceso",
            title: "Restablece tu contrasena",
            introHtml: $"""
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Hola {safeName},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Recibimos una solicitud para restablecer tu contrasena en Habla Mas.</p>
                <div style="margin:24px 0;padding:18px 20px;border-radius:18px;background:#eff6ff;border:1px solid #bfdbfe;">
                  <p style="margin:0;font-size:14px;line-height:1.7;color:#1e3a8a;">Usa el boton de abajo para crear una contrasena nueva. Si no fuiste tu, puedes ignorar este correo.</p>
                </div>
                """,
            actionLabel: "Crear nueva contrasena",
            actionUrl: resetUrl,
            footerNote: $"Si el boton no abre, copia y pega esta direccion en tu navegador:<br /><span style=\"word-break:break-all;color:#1d4ed8;\">{safeUrl}</span>");
    }

    public string BuildForcedTemporaryPasswordEmail(string recipientName, string temporaryPassword)
    {
        var safeName = Encode(recipientName);

        return BuildLayout(
            preheader: "Se genero una contrasena temporal nueva para tu cuenta.",
            eyebrow: "Accion administrativa",
            title: "Tu acceso fue renovado",
            introHtml: $"""
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Hola {safeName},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Se genero una contrasena temporal nueva para que puedas volver a entrar a tu cuenta.</p>
                <div style="margin:24px 0;padding:18px 20px;border-radius:18px;background:#f7efe1;border:1px solid #ead8b4;">
                  <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7c5d18;font-weight:700;">Contrasena temporal</p>
                  <p style="margin:0;font-size:24px;font-weight:800;color:#1f2937;">{Encode(temporaryPassword)}</p>
                </div>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">Al iniciar sesion se te pedira cambiarla inmediatamente por seguridad.</p>
                """,
            actionLabel: "Ir a Habla Mas",
            actionUrl: null,
            footerNote: "Si no esperabas este cambio, ponte en contacto con el equipo administrador.");
    }

    private static string BuildLayout(
        string preheader,
        string eyebrow,
        string title,
        string introHtml,
        string actionLabel,
        string? actionUrl,
        string footerNote)
    {
        var actionBlock = string.IsNullOrWhiteSpace(actionUrl)
            ? string.Empty
            : $"""
              <div style="margin:28px 0 24px;">
                <a href="{Encode(actionUrl)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#4f6573;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;">
                  {Encode(actionLabel)}
                </a>
              </div>
              """;

        return $"""
            <!DOCTYPE html>
            <html lang="es">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Habla Mas</title>
            </head>
            <body style="margin:0;background:#edf4f8;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
              <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{Encode(preheader)}</div>
              <div style="padding:32px 16px;">
                <div style="max-width:640px;margin:0 auto;">
                  <div style="margin-bottom:18px;text-align:center;">
                    <div style="display:inline-block;padding:10px 16px;border-radius:999px;background:#ffffff;border:1px solid #dbe5ec;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:#405260;">
                      Habla Mas
                    </div>
                  </div>
                  <div style="border-radius:28px;overflow:hidden;background:#ffffff;border:1px solid #d9e4eb;box-shadow:0 20px 55px -28px rgba(15,23,42,.35);">
                    <div style="padding:36px 32px;background:linear-gradient(135deg,#27343d,#4f6573);color:#ffffff;">
                      <p style="margin:0 0 12px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.75);font-weight:800;">{Encode(eyebrow)}</p>
                      <h1 style="margin:0;font-size:34px;line-height:1.1;">{Encode(title)}</h1>
                    </div>
                    <div style="padding:30px 32px;">
                      {introHtml}
                      {actionBlock}
                      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5edf3;font-size:13px;line-height:1.7;color:#64748b;">
                        {footerNote}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </body>
            </html>
            """;
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
