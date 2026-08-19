import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerManagementController } from './server-management.controller';
import { AutoScaleController } from './auto-scale.controller';
import { ServerManagementService } from './server-management.service';
import { DockerComposeService } from 'src/docker-compose/docker-compose.service';
import { DiscordModule } from 'src/discord/discord.module';
import { UsersModule } from 'src/users/users.module';
import { ProxyModule } from 'src/proxy/proxy.module';
import { BedrockAddonsModule } from 'src/bedrock-addons/bedrock-addons.module';
import { Settings } from 'src/users/entities/settings.entity';
import { AlertsModule } from 'src/alerts/alerts.module';
import { ModMetadataModule } from 'src/mod-metadata/mod-metadata.module';

@Module({
  // ModMetadataModule (not just ModMetadataService) so ServerManagementService shares the same
  // ModMetadataService instance as ModMetadataController — the queue's per-server lock only holds
  // within a single instance.
  imports: [TypeOrmModule.forFeature([Settings]), DiscordModule, UsersModule, ProxyModule, BedrockAddonsModule, AlertsModule, ModMetadataModule],
  controllers: [ServerManagementController, AutoScaleController],
  providers: [ServerManagementService, DockerComposeService],
  exports: [ServerManagementService, DockerComposeService],
})
export class ServerManagementModule {}
