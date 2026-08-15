import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { EnvironmentVariables } from '../../common/config/environment.variables';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  AuthUserResponseDto,
  toAuthUserResponseDto,
} from './dto/auth-user-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SESSION_COOKIE_NAME } from './constants/session-cookie.constants';
import { AuthService } from './auth.service';
import { getCookieValue } from './utils/cookie.util';
import type { AuthenticatedRequest } from './types/authenticated-request.interface';
import { PasswordResetService } from './services/password-reset.service';

@ApiTags('Auth')
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @ApiOperation({ summary: 'Register a new account' })
  @ApiCreatedResponse({
    description: 'Registered user',
    type: AuthUserResponseDto,
  })
  @Post('register')
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponseDto> {
    const { user, session, token } = await this.authService.register(input);
    this.setSessionCookie(response, token, session.expiresAt);
    return toAuthUserResponseDto(user);
  }

  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({
    description: 'Authenticated user',
    type: AuthUserResponseDto,
  })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponseDto> {
    const { user, session, token } = await this.authService.login(input);
    this.setSessionCookie(response, token, session.expiresAt);
    return toAuthUserResponseDto(user);
  }

  @ApiOperation({ summary: 'Log out and revoke the active session' })
  @ApiCookieAuth('session')
  @ApiNoContentResponse({ description: 'Session revoked' })
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = getCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (token !== undefined) {
      await this.authService.logout(token);
    }
    this.clearSessionCookie(response);
  }

  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiCookieAuth('session')
  @ApiOkResponse({
    description: 'Current authenticated user',
    type: AuthUserResponseDto,
  })
  @UseGuards(SessionAuthGuard)
  @Get('me')
  getCurrentUser(
    @CurrentUser() user: Parameters<typeof toAuthUserResponseDto>[0],
  ): AuthUserResponseDto {
    return toAuthUserResponseDto(user);
  }

  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiNoContentResponse({ description: 'Reset email sent if account exists' })
  @HttpCode(204)
  @Post('forgot-password')
  async forgotPassword(@Body() input: ForgotPasswordDto): Promise<void> {
    await this.passwordResetService.requestPasswordReset(input.email);
  }

  @ApiOperation({ summary: 'Reset password using a valid reset token' })
  @ApiNoContentResponse({ description: 'Password reset successfully' })
  @HttpCode(204)
  @Post('reset-password')
  async resetPassword(@Body() input: ResetPasswordDto): Promise<void> {
    await this.passwordResetService.resetPassword(
      input.token,
      input.newPassword,
    );
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.configService.getOrThrow('NODE_ENV') === 'production',
    });
  }

  private setSessionCookie(
    response: Response,
    token: string,
    expiresAt: Date,
  ): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      expires: expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.configService.getOrThrow('NODE_ENV') === 'production',
    });
  }
}
