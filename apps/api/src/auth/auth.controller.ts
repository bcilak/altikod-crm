import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { email, inviteSchema, loginSchema, tokenPasswordSchema, userPatchSchema } from '@saleshub/shared';
import { AuthService } from './auth.service';
import { Access, Public, type AuthRequest } from '../security/access';
import { ZodValidationPipe, ValidatedBody as Input } from '../validation.pipe';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login')
  async login(@Input(loginSchema) input: z.infer<typeof loginSchema>, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(input.email, input.password);
    res.cookie('saleshub_session', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 3600_000 });
    return { user: result.user, csrfToken: result.csrfToken };
  }
  @Access('session', 'read') @Get('me')
  me(@Req() req: AuthRequest) { const { id, role, name, email, csrfToken } = req.actor; return { id, role, name, email, csrfToken }; }
  @Access('session', 'write') @Post('logout')
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logout(req.actor);
    res.clearCookie('saleshub_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    return result;
  }
  @Public() @Post('password-reset/request')
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
  @Get() list() { return this.auth.users(); }
  @Post('invitations') invite(@Req() req: AuthRequest, @Input(inviteSchema) input: z.infer<typeof inviteSchema>) { return this.auth.invite(req.actor, input); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Input(userPatchSchema) input: z.infer<typeof userPatchSchema>) { return this.auth.updateUser(req.actor, id, input); }
}
