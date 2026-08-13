import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SESSION_COOKIE_NAME } from './constants/session-cookie.constants';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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
