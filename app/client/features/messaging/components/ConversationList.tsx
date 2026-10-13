import { MessageSquarePlus, Users } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { ConversationSummary } from "@/lib/api/messagesApi";
import { formatRelativeTime } from "../format";

interface ConversationListProps {
  conversations: ConversationSummary[];
  isLoading: boolean;
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onOpenPicker: () => void;
  /** Hidden on mobile once a thread is open — see MessagingView. */
  className?: string;
}

export default function ConversationList({
  conversations,
  isLoading,
  activeConversationId,
  onSelect,
  onOpenPicker,
  className = "",
}: ConversationListProps) {
  // Placement threads first, then 1:1s; each keeps the server's own order
  // (most recent activity first).
  const threads = conversations.filter((c) => c.isGroup);
  const direct = conversations.filter((c) => !c.isGroup);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <h2 className="font-semibold text-gray-900">Messages</h2>
        <button
          onClick={onOpenPicker}
          aria-label="New message"
          title="New message"
          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
        >
          <MessageSquarePlus size={20} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <p className="text-gray-400 text-sm p-4">Loading...</p>
        ) : conversations.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center px-4">
            No conversations yet. Start one with the button above.
          </p>
        ) : (
          <>
            {threads.length > 0 && (
              <>
                <SectionHeading>Placement threads</SectionHeading>
                {threads.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onSelect={onSelect}
                  />
                ))}
              </>
            )}
            {threads.length > 0 && <SectionHeading>Direct messages</SectionHeading>}
            {direct.length === 0 ? (
              <p className="text-gray-500 text-sm py-6 text-center px-4">
                No direct messages yet. Start one with the button above.
              </p>
            ) : (
              direct.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeConversationId}
                  onSelect={onSelect}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
      {children}
    </h3>
  );
}

/**
 * One row of the list. A placement thread shows its "<Student> —
 * <Establishment>" name and who wrote the last message; a 1:1 shows the other
 * person and their role.
 */
function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const other = conversation.otherParticipant;
  const unread = conversation.unreadCount > 0;
  const title = conversation.isGroup
    ? (conversation.name ?? "Placement thread")
    : (other?.name ?? "Unknown user");
  const preview = conversation.lastMessage
    ? conversation.isGroup
      ? `${conversation.lastMessage.senderName}: ${conversation.lastMessage.content}`
      : conversation.lastMessage.content
    : "No messages yet";

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-50 transition-colors ${
        active ? "bg-blue-50" : "hover:bg-gray-50"
      }`}
    >
      {conversation.isGroup ? (
        <span className="w-10 h-10 shrink-0 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <Users size={18} />
        </span>
      ) : (
        <Avatar name={other?.name ?? "?"} size={40} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-gray-900 truncate">{title}</span>
          <span className="text-xs text-gray-400 shrink-0">
            {formatRelativeTime(conversation.updatedAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={`text-sm truncate ${unread ? "text-gray-900 font-medium" : "text-gray-500"}`}
          >
            {preview}
          </p>
          {unread && (
            <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
              {conversation.unreadCount}
            </span>
          )}
        </div>
        {conversation.isGroup ? (
          <span className="text-xs text-gray-400">
            {conversation.readOnly ? "Placement ended · read-only" : "Group"}
          </span>
        ) : (
          other?.role && (
            <span className="text-xs text-gray-400 capitalize">
              {other.role.toLowerCase()}
            </span>
          )
        )}
      </div>
    </button>
  );
}
