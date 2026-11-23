import type { Request } from 'express';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  photoUrl: string | null;
};

export type AuthRequest = Request & { user: AuthUser; sessionToken: string };