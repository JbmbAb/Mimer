/**
 * vertexAiService.ts — generativ AI via Gemini API‑nyckel (dev) eller Vertex AI SDK (prod).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { VertexAI } from '@google-cloud/vertexai';

export type VertexProfile = 'text' | 'fast' | 'json';

function resolveModelName(profile: VertexProfile): string {
  switch (profile) {
    case 'fast':
      return process.env.VERTEX_FAST_MODEL?.trim() || 'gemini-2.5-flash';
    case 'json':
      return (
        process.env.VERTEX_JSON_MODEL?.trim() ||
        process.env.VERTEX_TEXT_MODEL?.trim() ||
        'gemini-2.5-flash'
      );
    case 'text':
    default:
      return process.env.VERTEX_TEXT_MODEL?.trim() || 'gemini-2.5-flash';
  }
}

export interface VertexGenerateOptions {
  profile?: VertexProfile;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

export interface VertexJsonOptions<T> extends VertexGenerateOptions {
  /** Valfritt JSON-schema eller ledtråd som bifogas i prompten */

  schemaHint?: Record<string, unknown>;
  /** Tolka parsad JSON till domän-T */
  parse?: (payload: unknown) => T | null;
}

export type InlineDataPart = {
  mimeType: string;
  dataBase64: string;
};

/**
 * Vid `GOOGLE_APPLICATION_CREDENTIALS_JSON`: skriver JSON till temporär fil och sätter
 * `GOOGLE_APPLICATION_CREDENTIALS` så `google-auth-library` och Vertex‑SDK kan ladda nyckeln.
 */
export function ensureVertexCredentialsFromJsonEnv(): void {
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!json) return;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return;
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gac-vertex-'));
    const filePath = path.join(dir, 'sa.json');
    fs.writeFileSync(filePath, json, 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = filePath;
  } catch {
    /* låt anropande kod falla tillbaka till ADC-fel om något går snett */
  }
}

export function vertexConfigStatus(): {
  configured: boolean;
  missing: string[];
  projectId: string | null;
  location: string;
  hasExplicitServiceAccountFile: boolean;
} {
  const projectId = process.env.VERTEX_PROJECT_ID?.trim() || null;
  const location = process.env.VERTEX_LOCATION?.trim() || 'europe-west1';
  const explicitPath = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
  const jsonBlob = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim());
  const geminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const onGoogleManagedRuntime = Boolean(process.env.K_SERVICE || process.env.GAE_SERVICE);

  const missing: string[] = [];
  if (!projectId) {
    missing.push('VERTEX_PROJECT_ID');
  }
  if (
    projectId &&
    !explicitPath &&
    !jsonBlob &&
    !geminiKey &&
    !onGoogleManagedRuntime
  ) {
    missing.push(
      'GOOGLE_APPLICATION_CREDENTIALS eller GOOGLE_APPLICATION_CREDENTIALS_JSON (lokala nycklar) / GEMINI_API_KEY (dev)',
    );
  }

  const hasExplicitServiceAccountFile = explicitPath || jsonBlob;

  return {
    configured: missing.length === 0,
    missing,
    projectId,
    location,
    hasExplicitServiceAccountFile,
  };
}

/** Vitest/mock: nollställ ev. caches (no-op för fetch-baserade vägar). */
export function __resetVertexClientForTest(): void {
  /* mocks */
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  const start = t.indexOf('{');
  const startArr = t.indexOf('[');
  const cut =
    start === -1
      ? startArr
      : startArr === -1
        ? start
        : Math.min(start, startArr);
  if (cut > 0) {
    t = t.slice(cut);
  }
  return t.trim();
}

function parseJsonPayload(text: string): unknown {
  const raw = stripCodeFences(text);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Vertex returnerade text som inte gick att tolka som JSON');
  }
}

export async function generateJsonWithVertex<T = unknown>(
  prompt: string,
  options: VertexJsonOptions<T> = {},
): Promise<T | null> {
  let full = prompt.trim();
  if (options.schemaHint && Object.keys(options.schemaHint).length > 0) {
    full += `\n\nSvara med strikt giltig JSON (inga fenced blocks, ingen förklaring) som följer:\n${JSON.stringify(
      options.schemaHint,
    )}`;
  } else {
    full += `\n\nSvara enbart med strikt giltig JSON, utan kodblock eller annan text runtom.`;
  }

  const text = await generateTextWithVertex(full, {
    profile: options.profile ?? 'json',
    model: options.model,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens ?? 8192,
    systemInstruction: options.systemInstruction,
  });

  let payload: unknown;
  try {
    payload = parseJsonPayload(text);
  } catch {
    return null;
  }

  if (options.parse) {
    return options.parse(payload);
  }
  return payload as T | null;
}

export async function generateTextWithVertexAndInlineData(
  prompt: string,
  inline: InlineDataPart,
  options: VertexGenerateOptions = {},
): Promise<string> {
  const modelName = options.model ?? resolveModelName(options.profile ?? 'fast');
  const base64Data = inline.dataBase64.trim();
  const mimeType = inline.mimeType.trim();

  if (process.env.GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens ?? 8192,
      },
    };

    if (options.systemInstruction) {
      body.systemInstruction = {
        role: 'system',
        parts: [{ text: options.systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;

    const cand = Array.isArray(data.candidates)
      ? (data.candidates[0] as Record<string, unknown> | undefined)
      : undefined;
    const content = cand?.content as Record<string, unknown> | undefined;
    const parts = Array.isArray(content?.parts)
      ? (content?.parts as Array<{ text?: string }>)
      : [];

    const out = parts.map((p) => p?.text ?? '').join('');
    if (out.trim()) return out.trim();

    throw new Error(`Gemini multimodal failed: ${JSON.stringify(data)}`);
  }

  console.log(`[VertexAiService] multimodal Via Vertex SDK (model: ${modelName})`);
  const project = process.env.VERTEX_PROJECT_ID || 'miljobeslut-v2';
  const location = process.env.VERTEX_LOCATION || 'europe-west1';
  const vertex = new VertexAI({ project, location });

  const model = vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens ?? 8192,
    },
    ...(options.systemInstruction
      ? {
          systemInstruction: {
            role: 'system',
            parts: [{ text: options.systemInstruction }],
          },
        }
      : {}),
  });

  const resp = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  const parts =
    resp.response?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
  const joined = parts.find((p) => typeof p.text === 'string')?.text;
  if (!(joined ?? text)?.trim()) {
    throw new Error('Vertex multimodal returnerade tom text');
  }
  return (joined ?? text).trim();
}

export async function generateTextWithVertex(
  prompt: string,
  options: VertexGenerateOptions = {},
): Promise<string> {
  const modelName = options.model ?? resolveModelName(options.profile ?? 'text');

  if (process.env.GEMINI_API_KEY) {
    console.log(`[VertexAiService] Using Pure Fetch with API Key (model: ${modelName})`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens ?? 8192,
      },
    };

    if (options.systemInstruction) {
      body.systemInstruction = {
        role: 'system',
        parts: [{ text: options.systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;

    const cand = Array.isArray(data.candidates)
      ? (data.candidates[0] as Record<string, unknown> | undefined)
      : undefined;
    const parts = (cand?.content as Record<string, unknown> | undefined)?.parts as
      | Array<{ text?: string }>
      | undefined;
    const firstText =
      Array.isArray(parts) && typeof parts[0]?.text === 'string' ? parts[0]?.text : undefined;

    if (typeof firstText === 'string') {
      const finishReason = (cand as { finishReason?: string })?.finishReason;
      console.log(`[VertexAiService] Finish Reason: ${finishReason}`);

      try {
        const debugPath = path.join(process.cwd(), 'scratch', 'last_ai_response.json');
        fs.mkdirSync(path.dirname(debugPath), { recursive: true });
        fs.writeFileSync(
          debugPath,
          JSON.stringify({ model: modelName, finishReason, textLength: firstText.length, text: firstText }, null, 2),
        );
      } catch {
        /* valfritt dev-debug */
      }

      return firstText;
    }

    throw new Error(`Pure Fetch failed: ${JSON.stringify(data)}`);
  }

  console.log(`[VertexAiService] Using Vertex AI SDK (model: ${modelName})`);
  const project = process.env.VERTEX_PROJECT_ID || 'miljobeslut-v2';
  const location = process.env.VERTEX_LOCATION || 'europe-west1';
  const vertex = new VertexAI({ project, location });

  const model = vertex.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    },
    ...(options.systemInstruction
      ? {
          systemInstruction: {
            role: 'system',
            parts: [{ text: options.systemInstruction }],
          },
        }
      : {}),
  });

  const resp = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const partsResp = resp.response?.candidates?.[0]?.content?.parts ?? [];
  const text = partsResp.find((p) => typeof p.text === 'string')?.text;
  if (!text) throw new Error('Vertex returnerade tom text');
  return text;
}
