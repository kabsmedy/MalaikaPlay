import {
  BadRequestException, Body, Controller, Get, Post, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, clearSessionCookie, getSessionToken, setSessionCookie } from './auth.guard';
import { AuthRequest } from './auth.types';
import { LoginDto, SignupDto } from './auth.dto';

const uploadsDir = join(process.cwd(), process.env.USER_UPLOADS_DIR || 'uploads');
const imageExtensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  async signup(@Body() body: SignupDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.signup(body.name, body.email, body.password);
    setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body.email, body.password);
    setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(getSessionToken(request));
    clearSessionCookie(response);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  currentUser(@Req() request: AuthRequest) {
    return { user: request.user };
  }

  @Post('profile-photo')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('photo', {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        try { mkdirSync(uploadsDir, { recursive: true }); callback(null, uploadsDir); }
        catch (error) { callback(error as Error, uploadsDir); }
      },
      filename: (_request, file, callback) => callback(null, `${randomUUID()}${imageExtensions[file.mimetype] || '.img'}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => callback(null, Boolean(imageExtensions[file.mimetype])),
  }))
  async profilePhoto(@Req() request: AuthRequest, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose a JPG, PNG, WebP, or GIF image under 5 MB');
    return { photoUrl: await this.auth.setProfilePhoto(request.user.id, file.filename) };
  }
}