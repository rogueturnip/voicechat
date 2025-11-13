import * as SQLite from 'expo-sqlite';

export interface ConversationMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

class ConversationDatabase {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized: boolean = false;

  /**
   * Initialize the database and create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    try {
      this.db = await SQLite.openDatabaseAsync('conversations.db');
      
      // Create conversations table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          createdAt INTEGER NOT NULL
        );
      `);

      // Create index on createdAt for faster queries
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_conversations_created_at 
        ON conversations(createdAt);
      `);

      this.isInitialized = true;
      console.log('[DB] ✓ Database initialized');
    } catch (error) {
      console.error('[DB] ✗ Error initializing database:', error);
      throw error;
    }
  }

  /**
   * Get all conversation messages, ordered by creation time
   */
  async getAllMessages(): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    if (!this.db || !this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await this.db!.getAllAsync<ConversationMessage>(
        'SELECT role, content FROM conversations ORDER BY createdAt ASC'
      );

      return result.map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
      }));
    } catch (error) {
      console.error('[DB] ✗ Error getting messages:', error);
      return [];
    }
  }

  /**
   * Add a message to the conversation
   */
  async addMessage(role: 'user' | 'assistant', content: string): Promise<void> {
    if (!this.db || !this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.db!.runAsync(
        'INSERT INTO conversations (role, content, createdAt) VALUES (?, ?, ?)',
        [role, content, Date.now()]
      );
      console.log('[DB] ✓ Message added:', role);
    } catch (error) {
      console.error('[DB] ✗ Error adding message:', error);
      throw error;
    }
  }

  /**
   * Clear all conversation messages
   */
  async clearAllMessages(): Promise<void> {
    if (!this.db || !this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.db!.runAsync('DELETE FROM conversations');
      console.log('[DB] ✓ All messages cleared');
    } catch (error) {
      console.error('[DB] ✗ Error clearing messages:', error);
      throw error;
    }
  }

  /**
   * Get the count of messages
   */
  async getMessageCount(): Promise<number> {
    if (!this.db || !this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await this.db!.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM conversations'
      );
      return result?.count || 0;
    } catch (error) {
      console.error('[DB] ✗ Error getting message count:', error);
      return 0;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.isInitialized = false;
      console.log('[DB] ✓ Database closed');
    }
  }
}

// Create singleton instance
const conversationDb = new ConversationDatabase();

export default conversationDb;

