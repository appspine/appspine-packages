import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().min(18),
  });
  const pipe = new ZodValidationPipe(schema);

  it('should successfully validate and return parsed data', () => {
    const value = { name: 'Alice', age: 25 };
    const result = pipe.transform(value);
    expect(result).toEqual(value);
  });

  it('should throw BadRequestException with Zod issues array when validation fails', () => {
    const invalidValue = { name: 123, age: 15 };
    expect(() => pipe.transform(invalidValue)).toThrow(BadRequestException);

    try {
      pipe.transform(invalidValue);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: unknown;
      };
      expect(Array.isArray(response.message)).toBe(true);
      expect(response.message).toHaveLength(2); // name is not string, age < 18
      expect(response.message).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['name'], code: 'invalid_type' }),
          expect.objectContaining({ path: ['age'], code: 'too_small' }),
        ]),
      );
    }
  });
});
