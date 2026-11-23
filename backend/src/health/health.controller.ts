import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get() health() { return { status: 'ok', service: 'MalaikaPlay API', timestamp: new Date().toISOString() }; }
}
