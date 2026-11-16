import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Body of `POST /agents`.
 *
 * `workspaceId` is deliberately absent: it comes from the auth context, and the
 * global validation pipe rejects any field not declared here with 400. These
 * checks catch missing or wrongly typed input; the domain applies the finer
 * rules (blank names, email normalisation).
 */
export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;
}
