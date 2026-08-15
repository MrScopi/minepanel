import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchModLibraryQueryDto {
  @IsIn(['modrinth', 'curseforge'])
  provider: 'modrinth' | 'curseforge';

  @IsOptional()
  @IsString()
  q?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  index?: number;
}
