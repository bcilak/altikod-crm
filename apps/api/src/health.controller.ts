import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { healthSchema, HealthResponse } from '@saleshub/shared';
import { PrismaService } from './prisma.service';
import { Public } from './security/access';

@ApiTags('system')
@Public()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Process liveness; does not imply database availability' })
  @ApiOkResponse({ schema: { type: 'object', required: ['status', 'service'], properties: { status: { type: 'string', enum: ['ok'] }, service: { type: 'string', enum: ['saleshub-api'] } } } })
  health(): HealthResponse { return healthSchema.parse({ status: 'ok', service: 'saleshub-api' }); }

  @Get('ready')
  @ApiOperation({ summary: 'Database connection and baseline migration readiness' })
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string', enum: ['ready'] } } } })
  @ApiServiceUnavailableResponse({ description: 'Database or baseline migration unavailable' })
  async ready() {
    try {
      const baseline = await this.prisma.systemMetadata.findUnique({ where: { key: 'schema_baseline' } });
      if (baseline?.value !== 'phase-0') throw new Error('Baseline missing');
      if (!await this.prisma.rolePermission.findUnique({ where: { role_resource_action: { role: 'ADMIN', resource: 'users', action: 'manage' } } })) throw new Error('CRM migrations missing');
      return { status: 'ready' };
    } catch { throw new ServiceUnavailableException('Service is not ready'); }
  }
}
