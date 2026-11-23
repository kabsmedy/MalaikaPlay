import { ConflictException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { AuthUser } from './auth.types';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 30;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly uploadsDir = join(process.cwd(), process.env.USER_UPLOADS_DIR || 'uploads');

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;
    const rows = await this.dataSource.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length) {
      await this.dataSource.query(
        "UPDATE users SET role = 'admin', password_hash = ? WHERE email = ?",
        [await this.hashPassword(password), email],
      );
      return;
    }
    await this.dataSource.query(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), email, await this.hashPassword(password), 'Admin', 'admin'],
    );
  }

  async signup(name: string, email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const id = randomUUID();
    try {
      await this.dataSource.query(
        'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
        [id, normalizedEmail, await this.hashPassword(password), name.trim()],
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictException('An account with this email already exists');
      throw error;
    }
    return { user: { id, email: normalizedEmail, name: name.trim(), role: 'user', photoUrl: null }, token: await this.createSession(id) };
  }

  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const rows = await this.dataSource.query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    const row = rows[0];
    if (!row || !(await this.passwordMatches(password, row.password_hash))) throw new UnauthorizedException('Email or password is incorrect');
    return { user: this.toUser(row), token: await this.createSession(row.id) };
  }

  async findSession(token: string): Promise<AuthUser | null> {
    const rows = await this.dataSource.query(
      `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`,
      [this.hashToken(token)],
    );
    return rows[0] ? this.toUser(rows[0]) : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.dataSource.query('DELETE FROM auth_sessions WHERE token_hash = ?', [this.hashToken(token)]);
  }

  async setProfilePhoto(userId: string, filename: string): Promise<string> {
    await mkdir(this.uploadsDir, { recursive: true });
    const photoUrl = `/api/uploads/${filename}`;
    const rows = await this.dataSource.query('SELECT photo_url FROM users WHERE id = ?', [userId]);
    await this.dataSource.query('UPDATE users SET photo_url = ? WHERE id = ?', [photoUrl, userId]);
    const oldPhoto = rows[0]?.photo_url;
    if (oldPhoto?.startsWith('/api/uploads/')) {
      await unlink(join(this.uploadsDir, basename(oldPhoto))).catch(() => undefined);
    }
    return photoUrl;
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.dataSource.query(
      'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))',
      [this.hashToken(token), userId, SESSION_DAYS],
    );
    return token;
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt, 64) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  private async passwordMatches(password: string, stored: string): Promise<boolean> {
    const [salt, expectedHex] = String(stored).split(':');
    if (!salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = await scryptAsync(password, salt, expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toUser(row: Record<string, any>): AuthUser {
    return { id: row.id, email: row.email, name: row.name, role: row.role, photoUrl: row.photo_url || null };
  }
}