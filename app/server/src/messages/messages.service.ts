import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { placementThreadName } from './placement-thread.service';

export const DEFAULT_MESSAGE_PAGE_SIZE = 50;

export interface Contact {
  id: string;
  name: string;
  role: 'STUDENT' | 'SUPERVISOR' | 'COORDINATOR';
  establishmentName: string | null;
}

/**
 * What a conversation needs from its placement to be shown as a group thread:
 * the two names its title is built from, and the status that decides whether
 * it still accepts messages. NULL on a 1:1 conversation.
 */
const THREAD_ASSIGNMENT_SELECT = {
  select: {
    id: true,
    status: true,
    student: { select: { user: { select: { name: true } } } },
    establishment: { select: { name: true } },
  },
} as const;

type ThreadConversation = {
  isGroup: boolean;
  trainingAssignment: {
    id: string;
    status: string;
    student: { user: { name: string } };
    establishment: { name: string };
  } | null;
};

/**
 * The group-thread half of a conversation summary. A 1:1 conversation reads
 * `isGroup: false` with the rest empty, so every summary has one shape.
 *
 * `readOnly` is true once the placement is no longer ACTIVE: the thread stays
 * readable, but `sendMessage` refuses to add to it.
 */
function threadFields(conversation: ThreadConversation) {
  const assignment = conversation.trainingAssignment;
  return {
    isGroup: conversation.isGroup,
    name: assignment
      ? placementThreadName(
          assignment.student.user.name,
          assignment.establishment.name,
        )
      : null,
    trainingAssignmentId: assignment?.id ?? null,
    readOnly: assignment !== null && assignment.status !== 'ACTIVE',
  };
}

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Who the caller may message, derived from their role. Explicit `select`
   * only — never `include: { user: true }` (§8 item 16: that leaked
   * `User.password` once already).
   */
  async getContacts(userId: string, role: string): Promise<Contact[]> {
    if (role === 'STUDENT') {
      const student = await this.prisma.client.student.findUnique({
        where: { userId },
        select: { establishmentId: true },
      });
      if (!student) {
        throw new NotFoundException('Student profile not found');
      }

      // establishmentId can be null — a student not yet assigned to an
      // establishment has no supervisors to contact, only coordinators.
      const [supervisors, coordinators] = await Promise.all([
        student.establishmentId
          ? this.prisma.client.supervisor.findMany({
              where: { establishmentId: student.establishmentId },
              select: {
                user: { select: { id: true, name: true } },
                establishment: { select: { name: true } },
              },
            })
          : Promise.resolve([]),
        this.getAllCoordinators(),
      ]);

      return [
        ...supervisors.map(toSupervisorContact),
        ...coordinators.map(toCoordinatorContact),
      ];
    }

    if (role === 'SUPERVISOR') {
      const supervisor = await this.prisma.client.supervisor.findUnique({
        where: { userId },
        select: { establishmentId: true },
      });
      if (!supervisor) {
        throw new NotFoundException('Supervisor profile not found');
      }

      const [students, coordinators] = await Promise.all([
        this.prisma.client.student.findMany({
          where: { establishmentId: supervisor.establishmentId },
          select: {
            user: { select: { id: true, name: true } },
            establishment: { select: { name: true } },
          },
        }),
        this.getAllCoordinators(),
      ]);

      return [
        ...students.map(toStudentContact),
        ...coordinators.map(toCoordinatorContact),
      ];
    }

    // COORDINATOR: every student and every supervisor, across all
    // establishments — the coordinator's remit is the whole programme, same
    // as their dashboard/attendance-oversight/evaluations reads.
    const [students, supervisors] = await Promise.all([
      this.prisma.client.student.findMany({
        select: {
          user: { select: { id: true, name: true } },
          establishment: { select: { name: true } },
        },
      }),
      this.prisma.client.supervisor.findMany({
        select: {
          user: { select: { id: true, name: true } },
          establishment: { select: { name: true } },
        },
      }),
    ]);

    return [
      ...students.map(toStudentContact),
      ...supervisors.map(toSupervisorContact),
    ];
  }

  private getAllCoordinators() {
    return this.prisma.client.coordinator.findMany({
      select: { user: { select: { id: true, name: true } } },
    });
  }

  /**
   * The caller's conversations, most recent activity first.
   *
   * A per-conversation fan-out here (N conversations = 3N concurrent
   * queries) is what exhausted the connection pool under polling — this
   * collapses it to a fixed number of bulk queries for the whole list,
   * regardless of how many conversations the caller has.
   */
  async getConversations(userId: string) {
    return this.buildConversationSummaries(userId);
  }

  /**
   * The single definition of "unread": every conversation whose summary
   * (built the same way `getConversations` builds its list — same fixed
   * three bulk queries, no per-conversation fan-out) carries `unreadCount >
   * 0`. Backs the sidebar bell — total for the badge, the conversations
   * themselves for its dropdown.
   */
  async getUnreadSummary(userId: string) {
    const summaries = await this.buildConversationSummaries(userId);
    const conversations = summaries.filter((s) => s.unreadCount > 0);
    return {
      totalUnread: conversations.reduce((sum, s) => sum + s.unreadCount, 0),
      conversations,
    };
  }

  private async buildConversationSummaries(userId: string) {
    const participants =
      await this.prisma.client.conversationParticipant.findMany({
        where: { userId },
        select: {
          conversationId: true,
          lastReadAt: true,
          conversation: {
            select: {
              createdAt: true,
              isGroup: true,
              trainingAssignment: THREAD_ASSIGNMENT_SELECT,
            },
          },
        },
      });
    if (participants.length === 0) {
      return [];
    }

    const ids = participants.map((p) => p.conversationId);
    const EPOCH = new Date(0);
    const conversationById = new Map(
      participants.map((p) => [p.conversationId, p.conversation]),
    );

    const [others, lastMessages, unreadCounts] = await Promise.all([
      // Everyone else in each conversation: exactly one row for a 1:1, and
      // every other member for a placement's group thread. Still one query
      // for the whole list — grouped in memory below.
      this.prisma.client.conversationParticipant.findMany({
        where: { conversationId: { in: ids }, userId: { not: userId } },
        select: {
          conversationId: true,
          user: { select: { id: true, name: true, role: true } },
        },
      }),
      // distinct + orderBy picks the first row per conversationId under that
      // order, i.e. the newest message — one round trip for every
      // conversation's last message.
      this.prisma.client.message.findMany({
        where: { conversationId: { in: ids } },
        distinct: ['conversationId'],
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          content: true,
          createdAt: true,
          sender: { select: { name: true } },
        },
      }),
      // Each conversation keeps its own lastReadAt cutoff via an OR of
      // (conversationId, createdAt gt) pairs — the database counts, so this
      // returns one row per conversation rather than one per unread message
      // (a never-read conversation's lastReadAt is null and reads as the
      // epoch, same as before, but without fetching that conversation's
      // full history to filter in JS).
      this.prisma.client.message.groupBy({
        by: ['conversationId'],
        where: {
          senderId: { not: userId },
          OR: participants.map((p) => ({
            conversationId: p.conversationId,
            createdAt: { gt: p.lastReadAt ?? EPOCH },
          })),
        },
        _count: { _all: true },
      }),
    ]);

    const othersById = new Map<string, (typeof others)[number]['user'][]>();
    for (const other of others) {
      const list = othersById.get(other.conversationId) ?? [];
      list.push(other.user);
      othersById.set(other.conversationId, list);
    }
    const lastMessageById = new Map(
      lastMessages.map((m) => [
        m.conversationId,
        {
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.name,
          content: m.content,
          createdAt: m.createdAt,
        },
      ]),
    );

    // Preserves the exact original semantics: unread = not sent by me AND
    // created after MY lastReadAt for THAT conversation (null = epoch).
    const unreadCountById = new Map(
      unreadCounts.map((c) => [c.conversationId, c._count._all]),
    );

    const summaries = ids.map((id) => {
      const lastMessage = lastMessageById.get(id) ?? null;
      const conversation = conversationById.get(id)!;
      const members = othersById.get(id) ?? [];
      return {
        id,
        ...threadFields(conversation),
        // The one other person in a 1:1; a group thread has `members` instead.
        otherParticipant: conversation.isGroup ? null : (members[0] ?? null),
        members: conversation.isGroup ? members : [],
        lastMessage,
        unreadCount: unreadCountById.get(id) ?? 0,
        updatedAt: lastMessage?.createdAt ?? conversation.createdAt,
      };
    });

    return summaries.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  /**
   * Find-or-create a 1:1 conversation with `targetUserId`.
   *
   * Idempotent: a 1:1 conversation always has exactly two participants, so
   * "some A AND some B" among `isGroup: false` conversations uniquely
   * identifies any existing conversation between this pair — a second call
   * with the same pair returns it rather than creating a duplicate.
   */
  async findOrCreateConversation(
    userId: string,
    role: string,
    targetUserId: string,
  ) {
    const contacts = await this.getContacts(userId, role);
    const target = contacts.find((c) => c.id === targetUserId);
    if (!target) {
      throw new ForbiddenException('This user is not in your allowed contacts');
    }

    const existing = await this.prisma.client.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
    });

    const conversation =
      existing ??
      (await this.prisma.client.conversation.create({
        data: {
          isGroup: false,
          createdBy: userId,
          participants: { create: [{ userId }, { userId: targetUserId }] },
        },
      }));

    return this.summarizeConversation(conversation.id, userId);
  }

  /**
   * Messages for one conversation (a 1:1 or a placement's group thread —
   * participation is checked the same way for both), cursor-paginated newest-page-first — the
   * one table that grows without limit (§8 item 4 already flags unbounded
   * `findMany` as debt elsewhere), so this never fetches the whole thread.
   * Marks the caller's `lastReadAt` as now.
   */
  async getMessages(
    userId: string,
    conversationId: string,
    before: string | undefined,
    limit: number | undefined,
  ) {
    await this.requireParticipant(conversationId, userId);

    let cursorDate: Date | undefined;
    if (before) {
      const cursor = await this.prisma.client.message.findUnique({
        where: { id: before },
        select: { conversationId: true, createdAt: true },
      });
      if (!cursor || cursor.conversationId !== conversationId) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      cursorDate = cursor.createdAt;
    }

    const messages = await this.prisma.client.message.findMany({
      where: {
        conversationId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit ?? DEFAULT_MESSAGE_PAGE_SIZE,
      select: MESSAGE_SELECT,
    });

    await this.prisma.client.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    return messages;
  }

  /**
   * Sends a message to a conversation the caller takes part in.
   *
   * A placement's group thread stops accepting messages the moment its
   * placement is no longer ACTIVE (transferred, completed or cancelled). It
   * stays readable until retention clears it; only this write is refused, and
   * refused here rather than by hiding the composer.
   */
  async sendMessage(userId: string, conversationId: string, content: string) {
    const conversation = await this.requireParticipant(conversationId, userId);
    if (threadFields(conversation).readOnly) {
      throw new ConflictException(
        'This placement has ended, so its thread is read-only. No new messages can be sent.',
      );
    }

    return this.prisma.client.message.create({
      data: { conversationId, senderId: userId, content },
      select: { ...MESSAGE_SELECT, conversationId: true },
    });
  }

  /**
   * The one participation check, used by every read and every send — 1:1 and
   * group thread alike. Being a student, or a supervisor at the right
   * establishment, proves nothing by itself: only a participant row does.
   * Returns the conversation's thread fields for the caller that needs them.
   */
  private async requireParticipant(conversationId: string, userId: string) {
    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        isGroup: true,
        trainingAssignment: THREAD_ASSIGNMENT_SELECT,
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const participant =
      await this.prisma.client.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }
    return conversation;
  }

  /**
   * The other participant, last message, and unread count for one
   * conversation — each a bounded `findFirst`/`count`, never the whole
   * thread. Shared by `getConversations` (one per conversation) and
   * `findOrCreateConversation` (a single call).
   */
  private async summarizeConversation(conversationId: string, userId: string) {
    const participant =
      await this.prisma.client.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
        select: {
          lastReadAt: true,
          conversation: {
            select: {
              createdAt: true,
              isGroup: true,
              trainingAssignment: THREAD_ASSIGNMENT_SELECT,
            },
          },
        },
      });
    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    const [other, lastMessage, unreadCount] = await Promise.all([
      this.prisma.client.conversationParticipant.findFirst({
        where: { conversationId, userId: { not: userId } },
        select: { user: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.client.message.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          senderId: true,
          content: true,
          createdAt: true,
          sender: { select: { name: true } },
        },
      }),
      this.prisma.client.message.count({
        where: {
          conversationId,
          senderId: { not: userId },
          createdAt: { gt: participant.lastReadAt ?? new Date(0) },
        },
      }),
    ]);

    return {
      id: conversationId,
      ...threadFields(participant.conversation),
      otherParticipant: other?.user ?? null,
      // Only ever called for a 1:1 (`findOrCreateConversation`), which has no
      // member list; kept so every summary has the same shape.
      members: [],
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            senderId: lastMessage.senderId,
            senderName: lastMessage.sender.name,
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
          }
        : null,
      unreadCount,
      updatedAt: lastMessage?.createdAt ?? participant.conversation.createdAt,
    };
  }
}

/**
 * A message as the thread renders it. The sender's name and role travel with
 * each one because a group thread has several senders — the client cannot
 * infer who wrote a bubble from "the other participant" there.
 */
const MESSAGE_SELECT = {
  id: true,
  senderId: true,
  content: true,
  createdAt: true,
  sender: { select: { id: true, name: true, role: true } },
} as const;

function toStudentContact(s: {
  user: { id: string; name: string };
  establishment: { name: string } | null;
}): Contact {
  return {
    id: s.user.id,
    name: s.user.name,
    role: 'STUDENT',
    establishmentName: s.establishment?.name ?? null,
  };
}

function toSupervisorContact(s: {
  user: { id: string; name: string };
  establishment: { name: string };
}): Contact {
  return {
    id: s.user.id,
    name: s.user.name,
    role: 'SUPERVISOR',
    establishmentName: s.establishment.name,
  };
}

function toCoordinatorContact(c: {
  user: { id: string; name: string };
}): Contact {
  return {
    id: c.user.id,
    name: c.user.name,
    role: 'COORDINATOR',
    establishmentName: null,
  };
}
