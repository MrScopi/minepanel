import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTrackedModNotesDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  blockUpdate?: boolean;
}
