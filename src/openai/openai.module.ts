import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenAiController } from './openai/openai.controller';
import { OpenAIService } from './openai/openai.service';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [OpenAiController],
  providers: [OpenAIService],
})
export class OpenaiModule {}
