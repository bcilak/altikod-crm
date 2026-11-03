import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiTags, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { email, inviteSchema, loginSchema, tokenPasswordSchema, userPatchSchema, createUserSchema, adminPasswordSchema, changePasswordSchema } from '@saleshub/shared';
import { AuthService } from './auth.service';
import { SESSION_IDLE_MS, sessionCookie } from './session-policy';
import { Access, Public, PasswordChangeAllowed, type AuthRequest } from '../security/access';
import { ZodValidationPipe, ValidatedBody as Input } from '../validation.pipe';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login')
  async login(@Input(loginSchema) input: z.infer<typeof loginSchema>, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(input.email, input.password);
    res.cookie('saleshub_session', result.token, sessionCookie(SESSION_IDLE_MS));
    return { user: result.user, csrfToken: result.csrfToken };
  }
  @PasswordChangeAllowed()
  @Access('session', 'read') @Get('me')
  me(@Req() req: AuthRequest) { const { id, role, name, email, csrfToken, mustChangePassword } = req.actor; return { id, role, name, email, csrfToken, mustChangePassword }; }
  @PasswordChangeAllowed()
  @Access('session', 'write') @Post('logout')
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logout(req.actor);
    res.clearCookie('saleshub_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    return result;
  }
  @PasswordChangeAllowed() @Access('session', 'write') @Post('password/change')
  changePassword(@Req() req: AuthRequest, @Input(changePasswordSchema) input: z.infer<typeof changePasswordSchema>) { return this.auth.changePassword(req.actor, input); }
  @Public() @Post('password-reset/request')
  @ApiServiceUnavailableResponse({ description: 'E-posta kapalıysa tüm hesaplar için 503; token oluşturulmaz.' })
  reset(@Body(new ZodValidationPipe(z.object({ email }).strict())) input: { email: string }) { return this.auth.requestReset(input.email); }
  @Public() @Post('password-reset/confirm')
  confirm(@Input(tokenPasswordSchema) input: z.infer<typeof tokenPasswordSchema>) { return this.auth.consume(input.token, input.password, 'RESET'); }
  @Public() @Post('invitation/accept')
  accept(@Input(tokenPasswordSchema) input: z.infer<typeof tokenPasswordSchema>) { return this.auth.consume(input.token, input.password, 'INVITE'); }
}
@ApiTags('users')
@Access('users', 'manage')
@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService) {}
  @Post() create(@Req() req: AuthRequest, @Input(createUserSchema) input: z.infer<typeof createUserSchema>) { return this.auth.createUser(req.actor, input); }
  @Post(':id/password') resetPassword(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(adminPasswordSchema) input: z.infer<typeof adminPasswordSchema>) { return this.auth.resetPassword(req.actor, id, input.temporaryPassword); }
  @Get() list() { return this.auth.users(); }
  @ApiServiceUnavailableResponse({ description: 'E-posta kapalı veya gönderilemedi. Kapalı modda kullanıcı/token oluşturulmaz.' })
  @Post('invitations') invite(@Req() req: AuthRequest, @Input(inviteSchema) input: z.infer<typeof inviteSchema>) { return this.auth.invite(req.actor, input); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(userPatchSchema) input: z.infer<typeof userPatchSchema>) { return this.auth.updateUser(req.actor, id, input); }
}
