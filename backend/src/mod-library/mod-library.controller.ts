import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PayloadToken } from 'src/auth/models/token.model';
import { AccessControlService } from 'src/users/services/access-control.service';
import { UsersService } from 'src/users/services/users.service';
import { ModLibraryService } from './mod-library.service';
import { AddTrackedModDto } from './dto/add-tracked-mod.dto';
import { UpdateTrackedModNotesDto } from './dto/update-tracked-mod-notes.dto';
import { SetDesiredVersionDto } from './dto/set-desired-version.dto';
import { StageModDownloadDto } from './dto/stage-mod-download.dto';
import { SearchModLibraryQueryDto } from './dto/search-mod-library.query.dto';

@Controller('mod-library')
@UseGuards(JwtAuthGuard)
export class ModLibraryController {
  constructor(
    private readonly modLibraryService: ModLibraryService,
    private readonly usersService: UsersService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get(':serverId')
  async listTracked(@Request() req, @Param('serverId') serverId: string) {
    await this.assertAccess(req, serverId, false);
    return this.modLibraryService.listTracked(serverId);
  }

  @Get(':serverId/search')
  async search(
    @Request() req,
    @Param('serverId') serverId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: SearchModLibraryQueryDto,
  ) {
    await this.assertAccess(req, serverId, false);
    const user = req.user as PayloadToken;
    return this.modLibraryService.searchProviderMods(user.userId, serverId, query.provider, {
      q: query.q,
      pageSize: query.pageSize,
      index: query.index,
    });
  }

  @Get(':serverId/resolve-url')
  async resolveUrl(@Request() req, @Param('serverId') serverId: string, @Query('url') url: string) {
    await this.assertAccess(req, serverId, false);
    const user = req.user as PayloadToken;
    return this.modLibraryService.resolveModByUrl(user.userId, serverId, url);
  }

  @Post(':serverId/mods')
  async addTrackedMod(
    @Request() req,
    @Param('serverId') serverId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) body: AddTrackedModDto,
  ) {
    await this.assertAccess(req, serverId, true);
    return this.modLibraryService.addTrackedMod(serverId, body);
  }

  @Post(':serverId/mods/:modId/check')
  async checkOneForUpdates(@Request() req, @Param('serverId') serverId: string, @Param('modId') modId: string) {
    await this.assertAccess(req, serverId, false);
    const user = req.user as PayloadToken;
    return this.modLibraryService.checkForUpdates(user.userId, serverId, modId);
  }

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @UseGuards(ThrottlerGuard)
  @Post(':serverId/check-all')
  async checkAllForUpdates(@Request() req, @Param('serverId') serverId: string) {
    await this.assertAccess(req, serverId, false);
    const user = req.user as PayloadToken;
    return this.modLibraryService.checkForUpdates(user.userId, serverId);
  }

  @Post(':serverId/mods/:modId/stage')
  async stageDownload(
    @Request() req,
    @Param('serverId') serverId: string,
    @Param('modId') modId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) body: StageModDownloadDto,
  ) {
    await this.assertAccess(req, serverId, true);
    const user = req.user as PayloadToken;
    return this.modLibraryService.stageDownload(user.userId, serverId, modId, body.versionId);
  }

  @Post(':serverId/mods/:modId/apply')
  async applyStagedMod(@Request() req, @Param('serverId') serverId: string, @Param('modId') modId: string) {
    await this.assertAccess(req, serverId, true);
    return this.modLibraryService.applyStagedMod(serverId, modId);
  }

  @Post(':serverId/apply-all')
  async applyAllStaged(@Request() req, @Param('serverId') serverId: string) {
    await this.assertAccess(req, serverId, true);
    return this.modLibraryService.applyAllStaged(serverId);
  }

  @Patch(':serverId/mods/:modId/notes')
  async updateNotes(
    @Request() req,
    @Param('serverId') serverId: string,
    @Param('modId') modId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) body: UpdateTrackedModNotesDto,
  ) {
    await this.assertAccess(req, serverId, true);
    return this.modLibraryService.updateNotes(serverId, modId, body);
  }

  @Put(':serverId/desired-version')
  async setDesiredMcVersion(
    @Request() req,
    @Param('serverId') serverId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) body: SetDesiredVersionDto,
  ) {
    await this.assertAccess(req, serverId, true);
    return this.modLibraryService.setDesiredMcVersion(serverId, body.desiredMcVersion);
  }

  @Delete(':serverId/mods/:modId')
  async deleteTrackedMod(
    @Request() req,
    @Param('serverId') serverId: string,
    @Param('modId') modId: string,
    @Query('removeFromDisk') removeFromDisk?: string,
  ) {
    await this.assertAccess(req, serverId, true);
    return this.modLibraryService.deleteTrackedMod(serverId, modId, removeFromDisk === 'true');
  }

  private async assertAccess(req, serverId: string, write: boolean) {
    const user = await this.usersService.getRequiredUserById(req.user.userId);
    this.accessControlService.assertServerFiles(user, serverId, write);
  }
}
