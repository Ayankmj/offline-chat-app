import {chatSessionStore} from '../store/ChatSessionStore';
import {draftStore} from '../store/DraftStore';
import * as RNFS from '@dr.pogodin/react-native-fs';

export interface BulkOperationResult {
  success: boolean;
  count: number;
  errors: string[];
}

export async function bulkDeleteSessions(
  sessionIds: string[],
): Promise<BulkOperationResult> {
  const errors: string[] = [];
  let successCount = 0;

  for (const sessionId of sessionIds) {
    try {
      await chatSessionStore.deleteSession(sessionId);
      draftStore.clearDraft(sessionId);
      successCount++;
    } catch (error) {
      errors.push(`Failed to delete session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    success: errors.length === 0,
    count: successCount,
    errors,
  };
}

export async function bulkExportSessions(
  sessionIds: string[],
  format: 'json' | 'txt' = 'json',
): Promise<BulkOperationResult> {
  const errors: string[] = [];
  let successCount = 0;

  const exportDir = `${RNFS.DocumentDirectoryPath}/exports`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportPath = `${exportDir}/chat-export-${timestamp}.${format}`;

  try {
    const exists = await RNFS.exists(exportDir);
    if (!exists) {
      await RNFS.mkdir(exportDir);
    }

    const sessions = sessionIds
      .map(id => chatSessionStore.sessions.find(s => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    if (sessions.length === 0) {
      return {
        success: false,
        count: 0,
        errors: ['No valid sessions found'],
      };
    }

    let content: string;
    if (format === 'json') {
      content = JSON.stringify(sessions, null, 2);
    } else {
      content = sessions
        .map(session => {
          const messages = session.messages
            .slice()
            .reverse()
            .map(msg => {
              const author = msg.author?.name || 'Unknown';
              const text = msg.type === 'text' ? msg.text : '[System message]';
              return `[${author}] ${text}`;
            })
            .join('\n\n');

          return `# ${session.title}\nDate: ${session.date}\n\n${messages}`;
        })
        .join('\n\n---\n\n');
    }

    await RNFS.writeFile(exportPath, content, 'utf8');
    successCount = sessions.length;
  } catch (error) {
    errors.push(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    success: errors.length === 0,
    count: successCount,
    errors,
  };
}

export async function bulkExportAllSessions(
  format: 'json' | 'txt' = 'json',
): Promise<BulkOperationResult> {
  const allSessionIds = chatSessionStore.sessions.map(s => s.id);
  return bulkExportSessions(allSessionIds, format);
}

export function selectAllSessions(): string[] {
  return chatSessionStore.sessions.map(s => s.id);
}

export function selectSessionsByDateRange(
  startDate: Date,
  endDate: Date,
): string[] {
  return chatSessionStore.sessions
    .filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startDate && sessionDate <= endDate;
    })
    .map(s => s.id);
}

export function selectSessionsByKeyword(keyword: string): string[] {
  const lowerKeyword = keyword.toLowerCase();
  return chatSessionStore.sessions
    .filter(session =>
      session.title.toLowerCase().includes(lowerKeyword) ||
      session.messages.some(msg =>
        msg.type === 'text' && msg.text.toLowerCase().includes(lowerKeyword),
      ),
    )
    .map(s => s.id);
}
