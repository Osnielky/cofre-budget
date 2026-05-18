import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { ProjectCategory } from './project-category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectCategory, Transaction])],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
