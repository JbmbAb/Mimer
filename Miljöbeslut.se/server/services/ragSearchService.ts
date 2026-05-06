/**
 * ragSearchService.ts
 *
 * Generell RAG-sökning (Retrieval-Augmented Generation) för slutanvändare.
 *
 * Flöde:
 *   1. Konvertera fråga till inbäddning
 *   2. Hämta topp-semantiska dokumentfragment
 *   3. Sök parallellt i kunskapsgrafen
 *   4. Kombinera kontext och generera svar via Gemini
 *   5. Returnera svar + källhänvisningar
 *
 * Endpoint: POST /api/search/rag
 */

import { embedText } from './searchService';
import { queryTopSemanticChunks } from '../repositories/searchRepository';
import { searchGraph } from './knowledgeGraphService';
import { logger } from '../logger';
import { DEFAULT_AI_POLICY, ragSystemInstruction } from '../modules/ai/policy';
import { generateTextWithVertex } from './vertexAiService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RagSource {
  documentId: string;
  chunkId: string;
  snippet: string;
  score: number;
  documentName?: string;
}

export interface RagGraphNode {
  id: string;
  nodeType: string;
  name: string;
}

export interface RagSearchResult {
  answer: string;
  sources: RagSource[];
  graphNodes: RagGraphNode[];
  queryEmbeddingModel: string;
  generatedAt: string;
  fallback: boolean;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Kör RAG-sökning mot kunskapsbasen och generera ett svar.
 */
export async function runRagSearch(params: {
  query: string;
  organisationId: string;
  projectId?: string;
  limit?: number;
  language?: 'sv' | 'en';
}): Promise<RagSearchResult> {
  const limit = Math.min(params.limit ?? 10, 20);
  const generatedAt = new Date().toISOString();
  const lang = params.language ?? 'sv';

  // Step 1: Embed query
  let embedding: any = null;
  try {
    embedding = await embedText(params.query);
  } catch (err) {
    logger.warn('rag-search: embedding failed', { err: String(err) });
  }
  const embeddingModel = embedding?.model ?? 'none';

  // Step 2: Semantic document search
  let sources: RagSource[] = [];
  if (embedding && embedding.values.length > 0) {
    try {
      const chunks = await queryTopSemanticChunks({
        queryEmbedding: embedding.values,
        organisationId: params.organisationId,
        projectId: params.projectId,
        limit,
      });
      sources = chunks.map((c) => ({
        documentId: c.documentId,
        chunkId: `${c.documentId}:${c.chunkIndex}`,
        snippet: c.chunkText?.slice(0, 400) ?? '',
        score: c.similarity ?? 0,
      }));
    } catch (err) {
      logger.warn('rag-search: semantic chunk query failed', { err: String(err) });
    }
  }

  // Step 3: Knowledge graph search
  let graphNodes: RagGraphNode[] = [];
  try {
    const graphResult = await searchGraph({ query: params.query, limit: 15 });
    graphNodes = (graphResult.nodes || []).map((n: any) => ({
      id: n.id,
      nodeType: n.nodeType,
      name: n.name,
    }));
  } catch (err) {
    logger.warn('rag-search: graph search failed', { err: String(err) });
  }

  // Step 4: Generate answer
  const context = sources
    .map((s, i) => `[Källa ${i + 1}, dok:${s.documentId}]\n${s.snippet}`)
    .join('\n\n---\n\n');

  const graphContext = graphNodes
    .slice(0, 5)
    .map((n) => `${n.nodeType}: ${n.name}`)
    .join(', ');

  let answer = '';
  let fallback = false;

  if (process.env.VERTEX_PROJECT_ID?.trim() && (context || graphContext)) {
    try {
      const systemLang = lang === 'sv' ? 'svenska' : 'English';
      const systemInstruction = ragSystemInstruction(DEFAULT_AI_POLICY);
      const prompt = `Svara på ${systemLang}.

Fråga: ${params.query}

Kontext från dokument:
${context || '(inga dokumentfragment funna)'}

Relevanta noder i kunskapsgrafen: ${graphContext || '(inga)'}

Returnera ett svar med korta punkter och inkludera källhänvisningar (Källa 1, Källa 2...) när du använder dem.`;

      answer = (
        await generateTextWithVertex(prompt, {
          profile: 'fast',
          systemInstruction,
        })
      ).trim();
    } catch (err) {
      logger.warn('rag-search: Vertex generation failed', { err: String(err) });
    }
  }

  if (!answer) {
    fallback = true;
    answer =
      sources.length > 0
        ? `Baserat på tillgängliga dokument: ${sources[0].snippet.slice(0, 300)}…`
        : `Inga relevanta dokument hittades för frågan "${params.query}". Kontrollera att dokument är indexerade.`;
  }

  return {
    answer,
    sources,
    graphNodes,
    queryEmbeddingModel: embeddingModel,
    generatedAt,
    fallback,
  };
}
