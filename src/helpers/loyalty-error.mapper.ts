import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Cashier-friendly messages for known STC Qitaf error codes.
 * Source: stc Loyalty REST API Specifications v1.0.1
 */
const STC_CODE_MESSAGES: Record<string, string> = {
  '1': 'The redemption failed and was automatically reversed by STC. Please ask the customer to try again.',
  '9': 'The mobile number entered is not a valid Saudi STC number. Please verify it starts with 05 and is 9 digits (e.g. 512345678).',
  '1040':
    'This redemption has already been reversed. No further action is needed.',
  '2310':
    'Redemption point verification failed. The transaction was automatically reversed — please ask the customer to retry.',
  '2311':
    'A technical issue occurred with STC. The transaction was automatically reversed — please ask the customer to retry.',
};

export interface LoyaltyErrorBody {
  success: false;
  message: string;
  result: null;
  errors: string[];
}

export interface LoyaltySuccessBody<T = any> {
  success: true;
  message: string;
  result: T;
  errors: never[];
}

/** Wraps a successful service result in the standard response envelope. */
export function loyaltyOk<T>(
  result: T,
  message = 'Success',
): LoyaltySuccessBody<T> {
  return { success: true, message, result, errors: [] };
}

/**
 * Converts any caught exception into an HttpException whose body matches the
 * standard error envelope:
 *   { success: false, message: "<human-readable>", result: null, errors: [...] }
 *
 * STC error codes are translated to cashier-friendly language.
 * All original HTTP status codes are preserved so the client can still branch on them.
 */
export function mapToLoyaltyHttpException(err: any): HttpException {
  const status: number =
    err instanceof HttpException
      ? err.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

  const raw = err instanceof HttpException ? err.getResponse() : null;
  const body: Record<string, any> =
    raw && typeof raw === 'object'
      ? (raw as Record<string, any>)
      : { message: raw ?? err?.message };

  // ── STC API error (has stcError.errors array) ────────────────────────────
  if (
    Array.isArray(body?.stcError?.errors) &&
    body.stcError.errors.length > 0
  ) {
    const stcErr = body.stcError.errors[0];
    const code = String(stcErr.code ?? '');
    const rawDesc: string = stcErr.description ?? 'Unknown STC error';

    const friendlyMessage =
      STC_CODE_MESSAGES[code] ??
      `STC returned an unexpected error (code ${code}). Please contact support if this keeps happening.`;

    return new HttpException(
      <LoyaltyErrorBody>{
        success: false,
        message: friendlyMessage,
        result: null,
        errors: [`STC error ${code}: ${rawDesc}`],
      },
      status,
    );
  }

  // ── STC timeout ───────────────────────────────────────────────────────────
  if (typeof body?.message === 'string' && body.message.includes('timed out')) {
    return new HttpException(
      <LoyaltyErrorBody>{
        success: false,
        message:
          'STC did not respond in time. Please wait a moment and try again.',
        result: null,
        errors: [body.message],
      },
      status,
    );
  }

  // ── Auto-reversed redemption ──────────────────────────────────────────────
  if (
    typeof body?.message === 'string' &&
    body.message.includes('automatically reversed')
  ) {
    return new HttpException(
      <LoyaltyErrorBody>{
        success: false,
        message:
          'The redemption could not be completed and was automatically cancelled by STC. Please ask the customer to try again.',
        result: null,
        errors: [body.message],
      },
      status,
    );
  }

  // ── Our own validation / business errors (BadRequestException etc.) ───────
  const rawMessage =
    body?.message ??
    err?.message ??
    'An unexpected error occurred. Please try again.';
  // ValidationPipe can return an array of field error strings
  const errors: string[] = Array.isArray(rawMessage)
    ? rawMessage
    : [String(rawMessage)];
  const displayMessage = Array.isArray(rawMessage)
    ? rawMessage.join('; ')
    : String(rawMessage);

  return new HttpException(
    <LoyaltyErrorBody>{
      success: false,
      message: displayMessage,
      result: null,
      errors,
    },
    status,
  );
}
