import { Module } from '@nestjs/common';
import { DockerComposeService } from 'src/docker-compose/docker-compose.service';
import { UsersModule } from 'src/users/users.module';
import { ModrinthModule } from 'src/modrinth/modrinth.module';
import { CurseforgeModule } from 'src/curseforge/curseforge.module';
import { ModLibraryController } from './mod-library.controller';
import { ModLibraryService } from './mod-library.service';

@Module({
  imports: [UsersModule, ModrinthModule, CurseforgeModule],
  controllers: [ModLibraryController],
  providers: [ModLibraryService, DockerComposeService],
  exports: [ModLibraryService],
})
export class ModLibraryModule {}
