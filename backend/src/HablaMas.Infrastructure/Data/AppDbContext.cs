using HablaMas.Domain.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace HablaMas.Infrastructure.Data;

public class AppDbContext : IdentityDbContext<AppUser, AppRole, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageStatus> MessageStatuses => Set<MessageStatus>();
    public DbSet<GroupChat> GroupChats => Set<GroupChat>();
    public DbSet<GroupChatMember> GroupChatMembers => Set<GroupChatMember>();
    public DbSet<GroupChatMessage> GroupChatMessages => Set<GroupChatMessage>();
    public DbSet<PasskeyCredential> PasskeyCredentials => Set<PasskeyCredential>();
    public DbSet<WebPushSubscription> WebPushSubscriptions => Set<WebPushSubscription>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<AppUser>(entity =>
        {
            entity.HasIndex(x => x.PublicCode).IsUnique();
            entity.Property(x => x.PublicCode).HasMaxLength(24);
            entity.Property(x => x.FirstName).HasMaxLength(80);
            entity.Property(x => x.LastName).HasMaxLength(80);
            entity.Property(x => x.Address).HasMaxLength(200);
            entity.Property(x => x.PhoneNumber).HasMaxLength(40);
            entity.Property(x => x.PublicAlias).HasMaxLength(80);
            entity.Property(x => x.AccentColor).HasMaxLength(20);
            entity.Property(x => x.Bio).HasMaxLength(280);
        });

        builder.Entity<PasskeyCredential>(entity =>
        {
            entity.HasIndex(x => x.CredentialId).IsUnique();
            entity.Property(x => x.FriendlyName).HasMaxLength(120);
            entity.Property(x => x.AaGuid).HasMaxLength(64);
            entity.Property(x => x.AuthenticatorAttachment).HasMaxLength(40);
            entity.HasOne(x => x.User)
                .WithMany(x => x.PasskeyCredentials)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<WebPushSubscription>(entity =>
        {
            entity.HasIndex(x => x.Endpoint).IsUnique();
            entity.Property(x => x.Endpoint).HasMaxLength(1000);
            entity.Property(x => x.P256Dh).HasMaxLength(255);
            entity.Property(x => x.Auth).HasMaxLength(255);
            entity.Property(x => x.UserAgent).HasMaxLength(300);
            entity.HasOne(x => x.User)
                .WithMany(x => x.WebPushSubscriptions)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Contact>(entity =>
        {
            entity.HasIndex(x => new { x.OwnerUserId, x.ContactUserId }).IsUnique();
            entity.Property(x => x.Alias).HasMaxLength(80);
            entity.HasOne(x => x.OwnerUser)
                .WithMany(x => x.Contacts)
                .HasForeignKey(x => x.OwnerUserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.ContactUser)
                .WithMany()
                .HasForeignKey(x => x.ContactUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Conversation>(entity =>
        {
            entity.HasIndex(x => new { x.UserAId, x.UserBId }).IsUnique();
            entity.HasOne(x => x.UserA)
                .WithMany(x => x.ConversationsA)
                .HasForeignKey(x => x.UserAId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.UserB)
                .WithMany(x => x.ConversationsB)
                .HasForeignKey(x => x.UserBId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Message>(entity =>
        {
            entity.HasIndex(x => new { x.ConversationId, x.CreatedAt });
            entity.Property(x => x.Text).HasMaxLength(4000);
            entity.Property(x => x.ImageUrl).HasMaxLength(500);
            entity.Property(x => x.AttachmentUrl).HasMaxLength(500);
            entity.Property(x => x.AttachmentName).HasMaxLength(255);
            entity.Property(x => x.AttachmentContentType).HasMaxLength(120);
            entity.Property(x => x.ClientMessageId).HasMaxLength(120);
            entity.HasOne(x => x.Conversation)
                .WithMany(x => x.Messages)
                .HasForeignKey(x => x.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Sender)
                .WithMany()
                .HasForeignKey(x => x.SenderId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<MessageStatus>(entity =>
        {
            entity.HasIndex(x => new { x.MessageId, x.RecipientId }).IsUnique();
            entity.HasOne(x => x.Message)
                .WithMany(x => x.Statuses)
                .HasForeignKey(x => x.MessageId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Recipient)
                .WithMany()
                .HasForeignKey(x => x.RecipientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<GroupChat>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.HasIndex(x => x.CreatedAt);
            entity.HasOne(x => x.OwnerUser)
                .WithMany(x => x.OwnedGroupChats)
                .HasForeignKey(x => x.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<GroupChatMember>(entity =>
        {
            entity.HasKey(x => new { x.GroupChatId, x.UserId });
            entity.HasIndex(x => x.UserId);
            entity.HasOne(x => x.GroupChat)
                .WithMany(x => x.Members)
                .HasForeignKey(x => x.GroupChatId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User)
                .WithMany(x => x.GroupChatMemberships)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<GroupChatMessage>(entity =>
        {
            entity.HasIndex(x => new { x.GroupChatId, x.CreatedAt });
            entity.Property(x => x.Text).HasMaxLength(4000);
            entity.Property(x => x.ImageUrl).HasMaxLength(500);
            entity.Property(x => x.AttachmentUrl).HasMaxLength(500);
            entity.Property(x => x.AttachmentName).HasMaxLength(255);
            entity.Property(x => x.AttachmentContentType).HasMaxLength(120);
            entity.Property(x => x.ClientMessageId).HasMaxLength(120);
            entity.HasOne(x => x.GroupChat)
                .WithMany(x => x.Messages)
                .HasForeignKey(x => x.GroupChatId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Sender)
                .WithMany()
                .HasForeignKey(x => x.SenderId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<RefreshToken>(entity =>
        {
            entity.HasIndex(x => x.Token).IsUnique();
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AdminAuditLog>(entity =>
        {
            entity.Property(x => x.Action).HasMaxLength(120);
            entity.HasOne(x => x.AdminUser)
                .WithMany()
                .HasForeignKey(x => x.AdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.TargetUser)
                .WithMany()
                .HasForeignKey(x => x.TargetUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
