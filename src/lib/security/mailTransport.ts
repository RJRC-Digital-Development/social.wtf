/**
 * Transactional Mail Transport Abstraction (Cookie Chain SVM)
 *
 * Provides a clean interface for dispatching recovery verification and password reset emails.
 * Fails closed in production if no transactional email provider is configured.
 * Test/development transport securely captures outgoing messages in memory for test verification
 * without logging or leaking raw tokens.
 */

export interface CapturedMail {
  to: string;
  username: string;
  type: 'VERIFICATION' | 'PASSWORD_RESET';
  tokenOrLink: string;
  timestamp: number;
}

export interface MailDeliveryResult {
  success: boolean;
  error?: string;
}

export interface MailTransport {
  sendRecoveryVerification(to: string, username: string, tokenOrLink: string): Promise<MailDeliveryResult>;
  sendPasswordReset(to: string, username: string, tokenOrLink: string): Promise<MailDeliveryResult>;
}

class TestMailTransport implements MailTransport {
  private readonly captured: CapturedMail[] = [];
  private failDelivery = false;

  public setFailDelivery(fail: boolean): void {
    this.failDelivery = fail;
  }

  public async sendRecoveryVerification(to: string, username: string, tokenOrLink: string): Promise<MailDeliveryResult> {
    if (this.failDelivery) {
      return { success: false, error: 'MAIL_DELIVERY_FAILED' };
    }
    this.captured.push({
      to,
      username,
      type: 'VERIFICATION',
      tokenOrLink,
      timestamp: Date.now(),
    });
    return { success: true };
  }

  public async sendPasswordReset(to: string, username: string, tokenOrLink: string): Promise<MailDeliveryResult> {
    if (this.failDelivery) {
      return { success: false, error: 'MAIL_DELIVERY_FAILED' };
    }
    this.captured.push({
      to,
      username,
      type: 'PASSWORD_RESET',
      tokenOrLink,
      timestamp: Date.now(),
    });
    return { success: true };
  }

  public getCapturedMails(): readonly CapturedMail[] {
    return this.captured;
  }

  public clearCapturedMails(): void {
    this.captured.length = 0;
    this.failDelivery = false;
  }
}

class ProductionMailTransport implements MailTransport {
  public async sendRecoveryVerification(to: string, username: string, tokenOrLink: string): Promise<MailDeliveryResult> {
    const apiKey = process.env.EMAIL_SERVER_API_KEY?.trim();
    if (!apiKey) {
      return { success: false, error: 'MAIL_DELIVERY_UNAVAILABLE' };
    }
    return { success: false, error: 'MAIL_PROVIDER_NOT_CONFIGURED' };
  }

  public async sendPasswordReset(to: string, username: string, tokenOrLink: string): Promise<MailDeliveryResult> {
    const apiKey = process.env.EMAIL_SERVER_API_KEY?.trim();
    if (!apiKey) {
      return { success: false, error: 'MAIL_DELIVERY_UNAVAILABLE' };
    }
    return { success: false, error: 'MAIL_PROVIDER_NOT_CONFIGURED' };
  }
}

const testTransport = new TestMailTransport();
const prodTransport = new ProductionMailTransport();

export function getMailTransport(): MailTransport {
  // Invariant: Production MUST always use ProductionMailTransport regardless of any test flags
  if (process.env.NODE_ENV === 'production') {
    return prodTransport;
  }
  if (process.env.NODE_ENV === 'test' || process.env.ENABLE_TEST_MAIL_TRANSPORT === 'true') {
    return testTransport;
  }
  return prodTransport;
}

export function getTestMailTransport(): TestMailTransport {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL_SECURITY_ERROR: TestMailTransport is strictly forbidden in production environment.');
  }
  return testTransport;
}
