export type ChatMessageType = "text" | "image" | "video" | "file" | "audio";

export interface ChatAttachmentDto {
  imageUrl?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentContentType?: string;
  attachmentSizeBytes?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  publicAlias: string;
  publicCode: string;
  emailConfirmed: boolean;
  mustChangePassword: boolean;
  profileImageUrl?: string;
  roles: string[];
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  emailConfirmed: boolean;
  userId: string;
  email: string;
  publicAlias: string;
  roles: string[];
}

export interface ConversationSummary {
  id: string;
  createdAt: string;
  lastMessageAt?: string;
  contact: {
    id: string;
    publicAlias: string;
    alias?: string;
    publicCode: string;
    profileImageUrl?: string;
  };
  lastMessage?: {
    id: string;
    text?: string;
    type: ChatMessageType;
    senderId: string;
    createdAt: string;
  } & ChatAttachmentDto;
}

export interface MessageDto extends ChatAttachmentDto {
  id: string;
  conversationId: string;
  senderId: string;
  senderAlias?: string;
  text?: string;
  type: ChatMessageType;
  createdAt: string;
  status: "Sent" | "Delivered" | "Seen";
}

export interface ContactDto {
  id: string;
  alias?: string;
  contactUser: {
    id: string;
    publicAlias: string;
    publicCode: string;
    profileImageUrl?: string;
    bio?: string;
    emailConfirmed: boolean;
  };
}

export interface GroupChatSummary {
  id: string;
  name: string;
  createdAt: string;
  lastMessageAt?: string;
  memberCount: number;
  lastMessage?: {
    id: string;
    text?: string;
    type: ChatMessageType;
    senderId: string;
    createdAt: string;
  } & ChatAttachmentDto;
}

export interface GroupMemberDto {
  id: string;
  publicAlias: string;
  publicCode: string;
  profileImageUrl?: string;
  joinedAt: string;
}

export interface GroupMessageDto extends ChatAttachmentDto {
  id: string;
  groupChatId: string;
  senderId: string;
  senderAlias: string;
  text?: string;
  type: ChatMessageType;
  createdAt: string;
}
