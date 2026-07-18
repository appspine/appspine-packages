import { paginationQuerySchema } from '@appspine/common';
import { z } from 'zod';

export const domainEventAdminListQuerySchema = paginationQuerySchema.extend({
  eventType: z.string().min(1).optional(),
  aggregateId: z.string().min(1).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});

export type DomainEventAdminListQuery = z.infer<typeof domainEventAdminListQuerySchema>;
