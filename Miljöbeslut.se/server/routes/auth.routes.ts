import express from 'express';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import {
  completeMockBankIdOrder,
  failMockBankIdOrder,
  getBankIdMode,
  getMockBankIdOrder,
  normalizeBankIdPersonalNumber,
  refreshSession,
  ensureAdminConsoleUser,
} from '../modules/auth/public';
import { createTokenPair, requireAuth, revokeSession } from '../security/auth';
import { platform } from '../../src/platform/master';

const router = express.Router();

function renderMockBankIdLaunchHtml(orderRef: string, csrfToken: string): string {
  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mock BankID</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
      .card { max-width: 560px; margin: 40px auto; background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
      .buttons { display: flex; gap: 12px; margin-top: 20px; }
      button { border: 0; border-radius: 10px; padding: 12px 16px; font-weight: 700; cursor: pointer; }
      .approve { background: #16a34a; color: white; }
      .fail { background: #dc2626; color: white; }
      .meta { color: #94a3b8; font-size: 14px; margin-top: 16px; }
      code { background: #0b1220; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Mock BankID</h1>
      <p>Detta är den lokala mock-klienten för BankID i utvecklingsläge.</p>
      <p class="meta">orderRef: <code>${orderRef}</code></p>
      <div class="buttons">
        <button class="approve" id="approve">Godkänn</button>
        <button class="fail" id="fail">Avbryt</button>
      </div>
      <p class="meta" id="status">Väntar på val…</p>
    </div>
    <script>
      const csrfToken = ${JSON.stringify(csrfToken)};

      async function post(path, body) {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken
          },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Request failed");
        return data;
      }

      const status = document.getElementById("status");
      document.getElementById("approve").addEventListener("click", async () => {
        status.textContent = "Godkänner mock-inloggning…";
        try {
          await post("/api/auth/bankid/mock/complete", { orderRef: "${orderRef}" });
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: "mock-bankid-complete", orderRef: "${orderRef}" }, window.location.origin);
          }
          window.setTimeout(() => window.close(), 700);
          status.textContent = "Godkänd. Du kan gå tillbaka till appen.";
        } catch (error) {
          status.textContent = String(error);
        }
      });
      document.getElementById("fail").addEventListener("click", async () => {
        status.textContent = "Avbryter…";
        try {
          await post("/api/auth/bankid/mock/fail", { orderRef: "${orderRef}", hintCode: "userCancel" });
          status.textContent = "Avbruten. Du kan stänga fönstret.";
        } catch (error) {
          status.textContent = String(error);
        }
      });
    </script>
  </body>
</html>`;
}

router.post('/api/auth/bankid/init', rateLimitByUser(10, 60_000), async (req, res) => {
  try {
    const endUserIp = String(req.body?.endUserIp ?? req.ip);
    const personalNumber = normalizeBankIdPersonalNumber(req.body?.personalNumber);
    const order = await platform.auth.initiateBankId(endUserIp, { personalNumber });
    res.json({ ok: true, ...order });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.post('/api/auth/bankid/collect', rateLimitByUser(60, 60_000), async (req, res) => {
  try {
    const orderRef = String(req.body?.orderRef ?? '');
    const result = await platform.auth.collectBankId(orderRef);
    res.json({ ok: true, ...result });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.post('/api/auth/bankid/cancel', rateLimitByUser(20, 60_000), async (req, res) => {
  try {
    const orderRef = String(req.body?.orderRef ?? '');
    const cancelled = await platform.auth.cancelBankId(orderRef);
    res.json({ ok: true, cancelled });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.get('/api/auth/bankid/mock/orders/:orderRef', rateLimitByUser(120, 60_000), (req, res) => {
  try {
    if (getBankIdMode() !== 'mock') {
      res.status(404).json({ ok: false, error: 'Mock BankID mode is disabled' });
      return;
    }

    const order = getMockBankIdOrder(String(req.params.orderRef || ''));
    res.json({ ok: true, mode: 'mock', order });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.get('/api/auth/bankid/mock/launch/:orderRef', rateLimitByUser(120, 60_000), (req, res) => {
  if (getBankIdMode() !== 'mock') {
    res.status(404).send('Mock BankID mode is disabled');
    return;
  }

  res
    .type('html')
    .send(renderMockBankIdLaunchHtml(String(req.params.orderRef || ''), String(res.locals.csrfToken || '')));
});

router.post('/api/auth/bankid/mock/complete', rateLimitByUser(120, 60_000), (req, res) => {
  try {
    if (getBankIdMode() !== 'mock') {
      res.status(404).json({ ok: false, error: 'Mock BankID mode is disabled' });
      return;
    }

    const orderRef = String(req.body?.orderRef ?? '');
    const bankidId = typeof req.body?.bankidId === 'string' ? req.body.bankidId : undefined;
    const order = completeMockBankIdOrder({ orderRef, bankidId });
    res.json({ ok: true, mode: 'mock', order });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.post('/api/auth/bankid/mock/fail', rateLimitByUser(120, 60_000), (req, res) => {
  try {
    if (getBankIdMode() !== 'mock') {
      res.status(404).json({ ok: false, error: 'Mock BankID mode is disabled' });
      return;
    }

    const orderRef = String(req.body?.orderRef ?? '');
    const hintCode = typeof req.body?.hintCode === 'string' ? req.body.hintCode : undefined;
    const order = failMockBankIdOrder({ orderRef, hintCode });
    res.json({ ok: true, mode: 'mock', order });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.post('/api/auth/refresh', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const token = String(req.body?.refreshToken ?? '');
    const rotated = await refreshSession(token);
    res.json({ ok: true, ...rotated });
  } catch (error: unknown) {
    res.status(401).json(toSafeErrorResponse(error));
  }
});

router.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const refreshToken = req.body?.refreshToken;

    await revokeSession(accessToken, refreshToken);
    res.json({ ok: true, message: 'Logged out successfully' });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

router.post('/api/admin/auth/login', rateLimitByUser(20, 60_000), async (req, res) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');

    const expectedUsername = String(process.env.ADMIN_CONSOLE_USERNAME || 'admin').trim();
    const expectedPassword = String(process.env.ADMIN_CONSOLE_PASSWORD || '');
    if (!expectedPassword) {
      res
        .status(503)
        .json({ ok: false, error: 'Admin login is not configured (ADMIN_CONSOLE_PASSWORD missing).' });
      return;
    }

    if (!username || username !== expectedUsername || password !== expectedPassword) {
      res.status(401).json({ ok: false, error: 'Invalid admin credentials' });
      return;
    }

    const user = await ensureAdminConsoleUser(username);
    const tokens = createTokenPair(user);
    res.json({
      ok: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        role: user.role,
        organisationId: user.organisationId,
      },
    });
  } catch (error: unknown) {
    res.status(400).json(toSafeErrorResponse(error));
  }
});

export default router;
