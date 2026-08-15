import { IsOptional, IsString } from 'class-validator';

export class SetDesiredVersionDto {
  @IsOptional()
  @IsString()
  desiredMcVersion?: string | null;
}
