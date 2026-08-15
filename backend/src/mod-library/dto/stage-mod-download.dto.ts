import { IsString } from 'class-validator';

export class StageModDownloadDto {
  @IsString()
  versionId: string;
}
