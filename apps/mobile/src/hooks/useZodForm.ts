import { useCallback, useState } from 'react';
import type { z } from 'zod';

type Errors<TValues> = Partial<Record<keyof TValues & string, string>>;

/**
 * A minimal controlled-form helper over a shared Zod schema.
 *
 * Client validation here is a UX affordance only — the same schema runs again
 * on the server, which is where it counts. Error messages are i18n keys, so
 * screens pass them through `useFieldError` before rendering.
 */
export function useZodForm<TValues extends Record<string, unknown>, TOutput>(
  schema: z.ZodType<TOutput, z.ZodTypeDef, unknown>,
  initialValues: TValues,
) {
  const [values, setValues] = useState<TValues>(initialValues);
  const [errors, setErrors] = useState<Errors<TValues>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof TValues & string, boolean>>>({});

  const setField = useCallback(
    <K extends keyof TValues & string>(key: K, value: TValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      // Clear the error as soon as the user starts fixing the field.
      setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    },
    [],
  );

  const markTouched = useCallback(<K extends keyof TValues & string>(key: K) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }, []);

  const validate = useCallback((): TOutput | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    const next: Errors<TValues> = {};
    result.error.issues.forEach((issue) => {
      const key = issue.path[0];
      if (typeof key === 'string' && !next[key as keyof TValues & string]) {
        next[key as keyof TValues & string] = issue.message;
      }
    });
    setErrors(next);
    return null;
  }, [schema, values]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return { values, errors, touched, setField, markTouched, validate, reset, setErrors };
}
