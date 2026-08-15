import { IsIn, IsOptional, IsString } from 'class-validator';

export class AddTrackedModDto {
  @IsIn(['modrinth', 'curseforge'])
  provider: 'modrinth' | 'curseforge';

  @IsString()
  projectId: string;

  @IsString()
  slug: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  loader?: string;
}
