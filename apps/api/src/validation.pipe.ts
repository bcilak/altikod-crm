import { BadRequestException, Body, PipeTransform } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';

/** Attach explicitly to each command/query DTO when business routes are added. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}
  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Invalid request fields');
    return parsed.data;
  }
}

/** One schema supplies runtime validation and the OpenAPI request contract. */
export function ValidatedBody<T>(schema: z.ZodType<T>): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodValidationPipe(schema))(target, key, index);
    if (key) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor) ApiBody({ schema: z.toJSONSchema(schema, { unrepresentable: 'any' }) as SchemaObject })(target, key, descriptor);
    }
  };
}
