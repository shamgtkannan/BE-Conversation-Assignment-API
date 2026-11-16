import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AuthContext } from './auth-context';
import { AuthGuard } from './auth.guard';
import { CurrentAuth } from './current-auth.decorator';

@Controller('whoami')
class WhoAmIController {
  @Get()
  whoAmI(@CurrentAuth() auth: AuthContext): AuthContext {
    return auth;
  }
}

describe('authentication over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WhoAmIController],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('hands the caller identity to the controller through @CurrentAuth()', async () => {
    const response = await fetch(`${baseUrl}/whoami`, {
      headers: {
        'x-user-id': 'user_123',
        'x-workspace-id': 'workspace_1',
        'x-role': 'admin',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: 'user_123',
      workspaceId: 'workspace_1',
      role: 'admin',
    });
  });

  it('answers 401 when the headers are missing', async () => {
    const response = await fetch(`${baseUrl}/whoami`);

    expect(response.status).toBe(401);
  });

  it('answers 401 for an unknown role', async () => {
    const response = await fetch(`${baseUrl}/whoami`, {
      headers: {
        'x-user-id': 'user_123',
        'x-workspace-id': 'workspace_1',
        'x-role': 'owner',
      },
    });

    expect(response.status).toBe(401);
  });
});
